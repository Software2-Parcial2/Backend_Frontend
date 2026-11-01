<?php

use App\Messaging\Envelope;
use App\Messaging\RabbitConnection;
use App\Messaging\RabbitConsumer;
use App\Messaging\RabbitPublisher;
use App\Messaging\Topology;
use Illuminate\Support\Str;

function rabbitDisponible(): bool
{
    try {
        RabbitConnection::open()->close();

        return true;
    } catch (Throwable) {
        return false;
    }
}

function nuevoSobre(string $type = 'facturacion.cobro.anular'): array
{
    return Envelope::create($type, (string) Str::uuid(), ['citaId' => (string) Str::uuid(), 'motivo' => 'x']);
}

describe('Envelope', function () {
    it('crea y valida un sobre', function () {
        $e = nuevoSobre();
        expect(Envelope::validate(json_decode(json_encode($e), true)))->toBeArray()
            ->and($e['causationId'])->toBeNull()
            ->and($e['version'])->toBe(1)
            ->and($e['occurredAt'])->toEndWith('Z');
    });

    it('acepta un payload vacio como objeto', function () {
        $e = Envelope::create('paciente.creado', (string) Str::uuid(), []);
        expect(json_encode($e))->toContain('"payload":{}');
    });

    it('rechaza sobres invalidos', function (array $patch) {
        Envelope::validate(array_merge(nuevoSobre(), $patch));
    })->with([
        'id no UUID' => [['id' => 'abc']],
        'type invalido' => [['type' => 'Mal Tipo']],
        'fecha no UTC' => [['occurredAt' => '2026-11-01T10:00:00+02:00']],
        'version 0' => [['version' => 0]],
        'correlationId malo' => [['correlationId' => 'x']],
        'propiedad extra' => [['extra' => 1]],
    ])->throws(InvalidArgumentException::class);
});

describe('RabbitMQ (integracion)', function () {
    beforeEach(function () {
        if (! rabbitDisponible()) {
            $this->markTestSkipped('RabbitMQ no disponible');
        }
        $this->queue = 'test.'.substr(md5(uniqid('', true)), 0, 8);
        $this->tiers = [['suffix' => 'retry.t', 'ttlMs' => 150]];
        $this->topology = new Topology;
        $this->publisher = new RabbitPublisher($this->topology);
        $this->bindings = [['exchange' => 'sigec.saga', 'routingKeys' => ["test.{$this->queue}"]]];
        $conn = RabbitConnection::open();
        $ch = $conn->channel();
        $this->topology->declareQueue($ch, $this->queue, $this->bindings, $this->tiers);
        $ch->close();
        $conn->close();
    });

    afterEach(function () {
        $conn = RabbitConnection::open();
        $ch = $conn->channel();
        foreach ([$this->queue, "{$this->queue}.dlq", "{$this->queue}.retry.t"] as $q) {
            $ch->queue_delete($q);
        }
        $ch->close();
        $conn->close();
        $this->publisher->close();
    });

    $depth = function (string $queue): int {
        $conn = RabbitConnection::open();
        $ch = $conn->channel();
        [, $n] = $ch->queue_declare($queue, true);
        $conn->close();

        return $n;
    };

    it('publica con confirms y el consumidor procesa y hace ack', function () use ($depth) {
        $env = nuevoSobre("test.{$this->queue}");
        $this->publisher->publish('sigec.saga', $env);
        $vistos = [];
        (new RabbitConsumer($this->queue, function ($e) use (&$vistos) {
            $vistos[] = $e['id'];
        }, $this->topology, $this->publisher, tiers: $this->tiers, log: fn () => null, bindings: $this->bindings))->run(idleTimeout: 2);
        expect($vistos)->toBe([$env['id']])->and($depth($this->queue))->toBe(0);
    });

    it('reintenta con la cola de espera y luego procesa', function () {
        $this->publisher->publish('sigec.saga', nuevoSobre("test.{$this->queue}"));
        $retries = [];
        (new RabbitConsumer($this->queue, function ($e, $r) use (&$retries) {
            $retries[] = $r;
            if ($r < 2) {
                throw new RuntimeException('fallo transitorio');
            }
        }, $this->topology, $this->publisher, tiers: $this->tiers, log: fn () => null, bindings: $this->bindings))->run(idleTimeout: 3);
        expect($retries)->toBe([0, 1, 2]);
    });

    it('envia a la DLQ tras agotar los reintentos', function () use ($depth) {
        $this->publisher->publish('sigec.saga', nuevoSobre("test.{$this->queue}"));
        $llamadas = 0;
        (new RabbitConsumer($this->queue, function () use (&$llamadas) {
            $llamadas++;
            throw new RuntimeException('siempre falla');
        }, $this->topology, $this->publisher, tiers: $this->tiers, maxRetries: 2, log: fn () => null, bindings: $this->bindings))->run(idleTimeout: 3);
        expect($llamadas)->toBe(3)->and($depth("{$this->queue}.dlq"))->toBe(1);
    });

    it('manda a la DLQ un mensaje que no cumple el sobre', function () use ($depth) {
        $this->publisher->publishRaw('sigec.saga', "test.{$this->queue}", '{"no":"es un sobre"}');
        $llamadas = 0;
        (new RabbitConsumer($this->queue, function () use (&$llamadas) {
            $llamadas++;
        }, $this->topology, $this->publisher, tiers: $this->tiers, log: fn () => null, bindings: $this->bindings))->run(idleTimeout: 2);
        expect($llamadas)->toBe(0)->and($depth("{$this->queue}.dlq"))->toBe(1);
    });

    it('el dedupe evita ejecutar dos veces el mismo id', function () {
        $env = nuevoSobre("test.{$this->queue}");
        $this->publisher->publish('sigec.saga', $env);
        $this->publisher->publish('sigec.saga', $env);
        $vistos = [];
        $ejecuciones = 0;
        (new RabbitConsumer(
            $this->queue,
            function () use (&$ejecuciones) {
                $ejecuciones++;
            },
            $this->topology,
            $this->publisher,
            tryBegin: function ($id) use (&$vistos) {
                if (in_array($id, $vistos, true)) {
                    return false;
                }
                $vistos[] = $id;

                return true;
            },
            tiers: $this->tiers,
            log: fn () => null,
            bindings: $this->bindings,
        ))->run(idleTimeout: 2);
        expect($ejecuciones)->toBe(1);
    });
});
