<?php

use App\Messaging\Envelope;
use App\Messaging\OutboxRelayService;
use App\Messaging\RabbitConnection;
use App\Messaging\RabbitPublisher;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

function outboxRow(string $type = 'factura.creada', int $offsetSeconds = 0): string
{
    $id = (string) Str::uuid();
    DB::table('outbox')->insert([
        'id' => $id, 'aggregate_type' => 'Factura', 'aggregate_id' => (string) Str::uuid(), 'event_type' => $type,
        'payload' => json_encode(['facturaId' => (string) Str::uuid(), 'n' => $offsetSeconds]),
        'created_at' => now()->addSeconds($offsetSeconds),
    ]);

    return $id;
}

describe('OutboxRelayService', function () {
    it('publica en orden, marca published_at y no repite', function () {
        $a = outboxRow(offsetSeconds: 0);
        $b = outboxRow(offsetSeconds: 1);
        $publicados = [];
        $relay = new OutboxRelayService(function (string $exchange, array $env) use (&$publicados) {
            Envelope::validate($env); // cumple el sobre
            $publicados[] = [$exchange, $env['id'], $env['type']];
        });

        expect($relay->relayBatch())->toBe(2)
            ->and($publicados)->toBe([['sigec.eventos', $a, 'factura.creada'], ['sigec.eventos', $b, 'factura.creada']])
            ->and($relay->pending())->toBe(0)
            ->and($relay->relayBatch())->toBe(0);
    });

    it('respeta el tamano del lote', function () {
        foreach (range(0, 4) as $i) {
            outboxRow(offsetSeconds: $i);
        }
        $relay = new OutboxRelayService(fn () => null);
        expect($relay->relayBatch(2))->toBe(2)->and($relay->pending())->toBe(3);
    });

    it('si falla una publicacion confirma lo previo, detiene el lote y reintenta desde la fila que fallo', function () {
        $a = outboxRow(offsetSeconds: 0);
        $b = outboxRow(offsetSeconds: 1);
        $c = outboxRow(offsetSeconds: 2);
        $falla = true;
        $relay = new OutboxRelayService(function (string $exchange, array $env) use ($b, &$falla) {
            if ($falla && $env['id'] === $b) {
                throw new RuntimeException('RabbitMQ caido');
            }
        });

        expect(fn () => $relay->relayBatch())->toThrow(RuntimeException::class, 'RabbitMQ caido');
        // A quedo publicada; B y C siguen pendientes (el orden se conserva).
        expect(DB::table('outbox')->whereNotNull('published_at')->pluck('id')->all())->toBe([$a])
            ->and($relay->pending())->toBe(2);

        $falla = false; // RabbitMQ vuelve
        expect($relay->relayBatch())->toBe(2)->and($relay->pending())->toBe(0);
        expect(DB::table('outbox')->whereNull('published_at')->count())->toBe(0);
    });

    it('el id del sobre es el de la fila y el payload vacio se serializa como objeto', function () {
        $id = (string) Str::uuid();
        DB::table('outbox')->insert(['id' => $id, 'aggregate_type' => 'X', 'aggregate_id' => (string) Str::uuid(), 'event_type' => 'factura.creada', 'payload' => '{}', 'created_at' => now()]);
        $env = OutboxRelayService::envelope(DB::table('outbox')->where('id', $id)->first());
        expect($env['id'])->toBe($id)->and(json_encode($env))->toContain('"payload":{}');
    });

    it('publica por RabbitMQ real y el mensaje llega a una cola enlazada', function () {
        try {
            RabbitConnection::open()->close();
        } catch (Throwable) {
            $this->markTestSkipped('RabbitMQ no disponible');
        }
        $queue = 'test.outbox.'.substr(md5(uniqid('', true)), 0, 8);
        $conn = RabbitConnection::open();
        $ch = $conn->channel();
        $ch->exchange_declare('sigec.eventos', 'topic', false, true, false);
        $ch->queue_declare($queue, false, true, false, false);
        $ch->queue_bind($queue, 'sigec.eventos', 'factura.#');

        $id = outboxRow();
        $publisher = new RabbitPublisher;
        $relay = new OutboxRelayService(fn ($ex, $env) => $publisher->publish($ex, $env));
        expect($relay->relayBatch())->toBe(1);

        $msg = $ch->basic_get($queue, true);
        $publisher->close();
        $ch->queue_delete($queue);
        $conn->close();

        expect($msg)->not->toBeNull();
        $env = json_decode($msg->getBody(), true);
        expect($env['id'])->toBe($id)->and($env['type'])->toBe('factura.creada')
            ->and($msg->get('delivery_mode'))->toBe(2); // persistente
    });
});
