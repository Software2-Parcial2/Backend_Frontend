<?php

namespace App\Messaging;

use App\Models\Factura;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Comandos de la SAGA de citas que atiende MS6 (contracts/events). Cada comando se procesa en una transaccion junto con
 * la respuesta, que se escribe en el outbox (exchange sigec.saga) y la publica outbox:relay.
 *
 * Es idempotente POR CITA ademas de por id de mensaje: MS3 reintenta con mensajes nuevos si no recibe respuesta,
 * asi que repetir una solicitud devuelve la misma factura en vez de cobrar dos veces.
 */
final class SagaCommandHandler
{
    private const SIN_PACIENTE = '00000000-0000-0000-0000-000000000000';

    public const COMANDOS = [
        'facturacion.cobro-provisional.solicitar',
        'facturacion.cobro.anular',
        'facturacion.cobro.confirmar',
    ];

    /** @param array<string, mixed> $envelope */
    public function handle(array $envelope): void
    {
        DB::transaction(function () use ($envelope) {
            match ($envelope['type']) {
                'facturacion.cobro-provisional.solicitar' => $this->solicitar($envelope),
                'facturacion.cobro.anular' => $this->anular($envelope),
                'facturacion.cobro.confirmar' => $this->confirmar($envelope),
                default => throw new InvalidArgumentException("Comando desconocido: {$envelope['type']}"),
            };
        });
    }

    private function solicitar(array $env): void
    {
        $p = $env['payload'];
        $citaId = $p['citaId'];

        $vigente = Factura::where('cita_id', $citaId)->where('estado', '<>', 'ANULADA')->first();
        if ($vigente) { // reintento de MS3: misma respuesta
            $this->responder($env, 'facturacion.cobro-provisional.registrado', $vigente->id, ['citaId' => $citaId, 'facturaId' => $vigente->id, 'monto' => (float) $vigente->monto]);

            return;
        }
        if (Factura::where('cita_id', $citaId)->where('estado', 'ANULADA')->exists()) {
            $this->rechazar($env, $citaId, 'el cobro de esta cita ya fue anulado');

            return;
        }
        if (in_array($p['pacienteId'], config('facturacion.pacientes_bloqueados'), true)) {
            $this->rechazar($env, $citaId, 'paciente bloqueado para facturacion');

            return;
        }
        $monto = $this->tarifa($p['especialidad']);
        if ($monto <= 0) {
            $this->rechazar($env, $citaId, "sin tarifa para la especialidad {$p['especialidad']}");

            return;
        }

        $factura = Factura::create(['cita_id' => $citaId, 'paciente_id' => $p['pacienteId'], 'monto' => $monto, 'estado' => 'PROVISIONAL']);
        $this->responder($env, 'facturacion.cobro-provisional.registrado', $factura->id, ['citaId' => $citaId, 'facturaId' => $factura->id, 'monto' => $monto]);
    }

    /** Tarifa vigente de la tabla `tarifas`; si no hay fila vigente, la de config/facturacion.php (0 = sin tarifa). */
    private function tarifa(string $especialidad): float
    {
        $esp = strtolower($especialidad);
        $hoy = now()->toDateString();
        $monto = DB::table('tarifas')
            ->where('especialidad', $esp)
            ->where('vigente_desde', '<=', $hoy)
            ->where(fn ($q) => $q->whereNull('vigente_hasta')->orWhere('vigente_hasta', '>', $hoy))
            ->orderByDesc('vigente_desde')
            ->value('monto');

        return round((float) ($monto ?? (config('facturacion.tarifas')[$esp] ?? 0)), 2);
    }

    private function anular(array $env): void
    {
        $p = $env['payload'];
        $citaId = $p['citaId'];
        $query = Factura::where('cita_id', $citaId);
        if (! empty($p['facturaId'])) {
            $query = Factura::where('id', $p['facturaId']);
        }
        $factura = $query->where('estado', '<>', 'ANULADA')->first();
        if ($factura) {
            $factura->update(['estado' => 'ANULADA']);
            $facturaId = $factura->id;
        } else {
            $facturaId = Factura::where('cita_id', $citaId)->value('id');
            if ($facturaId === null) {
                // Lapida: si la solicitud llega DESPUES de la anulacion (reordenada por los reintentos) no se cobra.
                $facturaId = Factura::create(['cita_id' => $citaId, 'paciente_id' => self::SIN_PACIENTE, 'monto' => 0, 'estado' => 'ANULADA'])->id;
            }
        }
        $this->responder($env, 'facturacion.cobro.anulado', $facturaId, ['citaId' => $citaId, 'facturaId' => $facturaId]);
    }

    private function confirmar(array $env): void
    {
        $p = $env['payload'];
        Factura::where('id', $p['facturaId'])->where('estado', 'PROVISIONAL')->update(['estado' => 'CONFIRMADA']);
        // El contrato no define respuesta para la confirmacion.
    }

    private function rechazar(array $env, string $citaId, string $motivo): void
    {
        $this->responder($env, 'facturacion.cobro-provisional.rechazado', $citaId, ['citaId' => $citaId, 'motivo' => $motivo]);
    }

    /** Escribe la respuesta en el outbox con el correlationId de la SAGA y causationId = id del comando. */
    private function responder(array $env, string $tipo, string $aggregateId, array $payload): void
    {
        DB::table('outbox')->insert([
            'id' => (string) Str::uuid(),
            'aggregate_type' => 'Factura',
            'aggregate_id' => $aggregateId,
            'event_type' => $tipo,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'exchange' => 'sigec.saga',
            'correlation_id' => $env['correlationId'],
            'causation_id' => $env['id'],
            'created_at' => now(),
        ]);
    }
}
