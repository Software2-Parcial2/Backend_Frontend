<?php

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Utilidades de caja: dia y turno locales de la clinica, dinero y eventos de dominio. */
final class Caja
{
    public static function zona(): string
    {
        return config('facturacion.zona_horaria', 'America/La_Paz');
    }

    /**
     * Inicio y fin (UTC) de un dia local, opcionalmente acotado a un turno (manana | tarde).
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function rangoDelDia(string $fecha, ?string $turno = null): array
    {
        $dia = CarbonImmutable::createFromFormat('Y-m-d', $fecha, self::zona())->startOfDay();
        [$h, $m] = array_map('intval', explode(':', config('facturacion.fin_turno_manana', '13:00')));
        $corte = $dia->setTime($h, $m);
        $desde = $dia;
        $hasta = $dia->addDay();
        if ($turno === 'manana') {
            $hasta = $corte;
        } elseif ($turno === 'tarde') {
            $desde = $corte;
        }

        return [$desde->utc(), $hasta->utc()];
    }

    /** Hora local HH:MM de un instante. */
    public static function hora(Carbon|\DateTimeInterface|string $t): string
    {
        return Carbon::parse($t)->setTimezone(self::zona())->format('H:i');
    }

    public static function dinero(float|string|int|null $v): string
    {
        return number_format((float) $v, 2, '.', '');
    }

    public static function iso(Carbon|\DateTimeInterface|string|null $t): ?string
    {
        return $t === null ? null : Carbon::parse($t)->utc()->format('Y-m-d\TH:i:s.v\Z');
    }

    /** Escribe un evento de dominio en el outbox (misma transaccion que el cambio de negocio). */
    public static function evento(string $tipo, string $agregadoId, array $payload): void
    {
        DB::table('outbox')->insert([
            'id' => (string) Str::uuid(),
            'aggregate_type' => 'Factura',
            'aggregate_id' => $agregadoId,
            'event_type' => $tipo,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'created_at' => now(),
        ]);
    }
}
