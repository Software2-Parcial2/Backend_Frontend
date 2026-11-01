<?php

use App\Messaging\Envelope;
use App\Messaging\OutboxRelayService;
use App\Messaging\SagaCommandHandler;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

const BLOQUEADO = '00000000-0000-4000-8000-00000000dead';

function comando(string $type, array $payload, ?string $correlationId = null): array
{
    return Envelope::create($type, $correlationId ?? (string) Str::uuid(), $payload);
}

function solicitar(array $over = [], ?string $correlationId = null): array
{
    return comando('facturacion.cobro-provisional.solicitar', array_merge([
        'citaId' => (string) Str::uuid(),
        'pacienteId' => (string) Str::uuid(),
        'medicoId' => (string) Str::uuid(),
        'especialidad' => 'general',
        'fechaHora' => '2026-12-01T10:00:00.000Z',
    ], $over), $correlationId);
}

function respuestas(): array
{
    return DB::table('outbox')->where('exchange', 'sigec.saga')->orderBy('created_at')->get()->all();
}

describe('SagaCommandHandler', function () {
    beforeEach(fn () => $this->handler = new SagaCommandHandler);

    it('cobro provisional: crea la factura PROVISIONAL con la tarifa de la especialidad y responde registrado', function () {
        $env = solicitar(['especialidad' => 'Cardiologia']);
        $this->handler->handle($env);

        $f = DB::table('facturas')->where('cita_id', $env['payload']['citaId'])->first();
        expect($f->estado)->toBe('PROVISIONAL')->and((float) $f->monto)->toBe(250.0);

        [$r] = respuestas();
        expect($r->event_type)->toBe('facturacion.cobro-provisional.registrado')
            ->and($r->exchange)->toBe('sigec.saga')
            ->and($r->correlation_id)->toBe($env['correlationId'])   // mismo id de SAGA
            ->and($r->causation_id)->toBe($env['id']);               // causado por el comando
        expect(json_decode($r->payload, true))->toMatchArray(['citaId' => $env['payload']['citaId'], 'facturaId' => $f->id, 'monto' => 250]);
    });

    it('es idempotente por cita: un reintento con otro id de mensaje devuelve la misma factura', function () {
        $first = solicitar();
        $this->handler->handle($first);
        $retry = comando($first['type'], $first['payload'], $first['correlationId']); // id nuevo, misma cita
        $this->handler->handle($retry);

        expect(DB::table('facturas')->where('cita_id', $first['payload']['citaId'])->count())->toBe(1);
        $rs = respuestas();
        expect($rs)->toHaveCount(2)->and(json_decode($rs[0]->payload)->facturaId)->toBe(json_decode($rs[1]->payload)->facturaId)
            ->and($rs[1]->causation_id)->toBe($retry['id']);
    });

    it('rechaza el cobro de un paciente bloqueado y no crea factura', function () {
        $env = solicitar(['pacienteId' => BLOQUEADO]);
        $this->handler->handle($env);
        expect(DB::table('facturas')->where('cita_id', $env['payload']['citaId'])->exists())->toBeFalse();
        [$r] = respuestas();
        expect($r->event_type)->toBe('facturacion.cobro-provisional.rechazado')
            ->and(json_decode($r->payload)->motivo)->toContain('bloqueado');
    });

    it('rechaza una especialidad sin tarifa (monto 0)', function () {
        $env = solicitar(['especialidad' => 'astrologia']);
        $this->handler->handle($env);
        [$r] = respuestas();
        expect($r->event_type)->toBe('facturacion.cobro-provisional.rechazado')->and(json_decode($r->payload)->motivo)->toContain('sin tarifa');
    });

    it('anular: pasa la factura a ANULADA y responde anulado con su id', function () {
        $s = solicitar();
        $this->handler->handle($s);
        $facturaId = DB::table('facturas')->where('cita_id', $s['payload']['citaId'])->value('id');
        $this->handler->handle(comando('facturacion.cobro.anular', ['citaId' => $s['payload']['citaId'], 'facturaId' => $facturaId, 'motivo' => 'x'], $s['correlationId']));

        expect(DB::table('facturas')->where('id', $facturaId)->value('estado'))->toBe('ANULADA');
        $r = collect(respuestas())->last();
        expect($r->event_type)->toBe('facturacion.cobro.anulado')->and(json_decode($r->payload)->facturaId)->toBe($facturaId);
    });

    it('anular antes de que llegue la solicitud deja una lapida: la solicitud tardia se rechaza (no se cobra)', function () {
        $citaId = (string) Str::uuid();
        $this->handler->handle(comando('facturacion.cobro.anular', ['citaId' => $citaId, 'motivo' => 'timeout']));
        expect(DB::table('facturas')->where('cita_id', $citaId)->value('estado'))->toBe('ANULADA');

        $this->handler->handle(solicitar(['citaId' => $citaId]));
        $r = collect(respuestas())->last();
        expect($r->event_type)->toBe('facturacion.cobro-provisional.rechazado')->and(json_decode($r->payload)->motivo)->toContain('anulado');
        expect(DB::table('facturas')->where('cita_id', $citaId)->where('estado', '<>', 'ANULADA')->exists())->toBeFalse();
    });

    it('confirmar: PROVISIONAL pasa a CONFIRMADA (sin respuesta)', function () {
        $s = solicitar();
        $this->handler->handle($s);
        $id = DB::table('facturas')->where('cita_id', $s['payload']['citaId'])->value('id');
        $antes = count(respuestas());
        $this->handler->handle(comando('facturacion.cobro.confirmar', ['citaId' => $s['payload']['citaId'], 'facturaId' => $id]));
        expect(DB::table('facturas')->where('id', $id)->value('estado'))->toBe('CONFIRMADA')->and(count(respuestas()))->toBe($antes);
    });

    it('un comando desconocido falla (el consumidor lo reintenta y luego lo manda a la DLQ)', function () {
        expect(fn () => $this->handler->handle(comando('facturacion.otra.cosa', [])))->toThrow(InvalidArgumentException::class);
    });

    it('si falla algo, no queda factura ni respuesta a medias (transaccion)', function () {
        $env = solicitar();
        $env['payload']['pacienteId'] = 'no-es-uuid'; // revienta al insertar (columna uuid)
        expect(fn () => $this->handler->handle($env))->toThrow(\Illuminate\Database\QueryException::class);
        expect(DB::table('facturas')->count())->toBe(0)->and(count(respuestas()))->toBe(0);
    });
});

describe('relay de respuestas de la SAGA', function () {
    it('publica en sigec.saga con el correlationId/causationId del comando', function () {
        $env = solicitar();
        (new SagaCommandHandler)->handle($env);
        $publicado = [];
        (new OutboxRelayService(function (string $exchange, array $e) use (&$publicado) {
            Envelope::validate($e);
            $publicado[] = [$exchange, $e];
        }))->relayBatch();

        [$exchange, $e] = $publicado[0];
        expect($exchange)->toBe('sigec.saga')
            ->and($e['type'])->toBe('facturacion.cobro-provisional.registrado')
            ->and($e['correlationId'])->toBe($env['correlationId'])
            ->and($e['causationId'])->toBe($env['id']);
    });
});
