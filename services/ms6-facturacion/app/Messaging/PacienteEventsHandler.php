<?php

namespace App\Messaging;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Proyeccion local de pacientes (nombre y n.° de historia) a partir de paciente.creado / paciente.actualizado de MS2, para
 * mostrar nombres en los listados de caja sin llamar a MS2. Un evento viejo que llega tarde no pisa a uno nuevo (ocurrido_en).
 */
final class PacienteEventsHandler
{
    public const EVENTOS = ['paciente.creado', 'paciente.actualizado'];

    /** @param array<string, mixed> $envelope */
    public function handle(array $envelope): void
    {
        if (! in_array($envelope['type'], self::EVENTOS, true)) {
            return;
        }
        $p = $envelope['payload'];
        DB::statement(
            'INSERT INTO pacientes_proyeccion (paciente_id, nombre, numero_historia, ocurrido_en) VALUES (?, ?, ?, ?)
             ON CONFLICT (paciente_id) DO UPDATE
                SET nombre = EXCLUDED.nombre,
                    numero_historia = COALESCE(EXCLUDED.numero_historia, pacientes_proyeccion.numero_historia),
                    ocurrido_en = EXCLUDED.ocurrido_en,
                    updated_at = now()
              WHERE pacientes_proyeccion.ocurrido_en <= EXCLUDED.ocurrido_en',
            [$p['pacienteId'], $p['nombre'], $p['numeroHistoria'] ?? null, Carbon::parse($envelope['occurredAt'])->valueOf()],
        );
    }
}
