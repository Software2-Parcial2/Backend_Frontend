<?php

use App\Messaging\Envelope;
use App\Messaging\SagaCommandHandler;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

function pedir(string $esp): array
{
    return Envelope::create('facturacion.cobro-provisional.solicitar', (string) Str::uuid(), [
        'citaId' => (string) Str::uuid(), 'pacienteId' => (string) Str::uuid(), 'medicoId' => (string) Str::uuid(),
        'especialidad' => $esp, 'fechaHora' => '2026-12-01T10:00:00.000Z',
    ]);
}

function tarifa(string $esp, float $monto, string $desde, ?string $hasta = null): void
{
    DB::table('tarifas')->insert(['id' => (string) Str::uuid(), 'especialidad' => $esp, 'monto' => $monto, 'vigente_desde' => $desde, 'vigente_hasta' => $hasta]);
}

describe('tarifas en base de datos', function () {
    beforeEach(fn () => $this->handler = new SagaCommandHandler);

    it('usa la tarifa vigente de la tabla en vez de la configuracion', function () {
        tarifa('general', 333.50, '2020-01-01');
        $env = pedir('General');
        $this->handler->handle($env);
        expect((float) DB::table('facturas')->where('cita_id', $env['payload']['citaId'])->value('monto'))->toBe(333.5);
    });

    it('ignora tarifas vencidas o futuras y cae a la configuracion', function () {
        tarifa('pediatria', 999, '2020-01-01', '2020-12-31');
        tarifa('pediatria', 888, '2999-01-01');
        $env = pedir('pediatria');
        $this->handler->handle($env);
        expect((float) DB::table('facturas')->where('cita_id', $env['payload']['citaId'])->value('monto'))->toBe(150.0);
    });

    it('una tarifa 0 en la tabla rechaza el cobro', function () {
        tarifa('cardiologia', 0, '2020-01-01');
        $env = pedir('cardiologia');
        $this->handler->handle($env);
        expect(DB::table('facturas')->where('cita_id', $env['payload']['citaId'])->exists())->toBeFalse();
    });

    it('la base rechaza tarifas negativas y rangos incoherentes', function () {
        expect(fn () => tarifa('general', -1, '2020-01-01'))->toThrow(Illuminate\Database\QueryException::class);
        expect(fn () => tarifa('general', 10, '2020-02-01', '2020-01-01'))->toThrow(Illuminate\Database\QueryException::class);
    });
});

describe('ledger de facturas', function () {
    it('registra la creacion y cada cambio de estado, y es de solo anadir', function () {
        $env = pedir('general');
        (new SagaCommandHandler)->handle($env);
        $id = DB::table('facturas')->where('cita_id', $env['payload']['citaId'])->value('id');
        DB::table('facturas')->where('id', $id)->update(['estado' => 'CONFIRMADA']);
        DB::table('facturas')->where('id', $id)->update(['updated_at' => now()]); // sin cambio de estado: no hay movimiento

        $mov = DB::table('factura_movimientos')->where('factura_id', $id)->orderBy('id')->get();
        expect($mov->pluck('estado_nuevo')->all())->toBe(['PROVISIONAL', 'CONFIRMADA'])
            ->and($mov->pluck('estado_anterior')->all())->toBe([null, 'PROVISIONAL']);
        expect(fn () => DB::table('factura_movimientos')->where('factura_id', $id)->update(['monto' => 1]))->toThrow(Illuminate\Database\QueryException::class);
    });

    it('purgar_tecnico borra solo lo publicado antiguo y lo vencido', function () {
        $viejo = (string) Str::uuid();
        $reciente = (string) Str::uuid();
        $pendiente = (string) Str::uuid();
        foreach ([[$viejo, now()->subDays(10)], [$reciente, now()->subDay()], [$pendiente, null]] as [$id, $pub]) {
            DB::table('outbox')->insert(['id' => $id, 'aggregate_type' => 'x', 'aggregate_id' => (string) Str::uuid(), 'event_type' => 't', 'payload' => '{}', 'published_at' => $pub]);
        }
        $r = DB::selectOne('SELECT * FROM purgar_tecnico()');
        expect((int) $r->outbox_borrados)->toBe(1)
            ->and(DB::table('outbox')->whereIn('id', [$reciente, $pendiente])->count())->toBe(2);
    });
});
