<?php

namespace App\Messaging;

use Carbon\Carbon;
use Closure;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Relay del patron Outbox para MS6 (misma semantica que el de MS2/MS4):
 *  - lote con FOR UPDATE SKIP LOCKED (varias instancias sin pisarse);
 *  - publica con confirms y solo entonces marca published_at;
 *  - si falla una publicacion, se confirma lo ya publicado, se detiene el lote (orden) y se propaga el error;
 *  - el id del sobre es el id de la fila: una reentrega es deduplicable por el consumidor.
 */
final class OutboxRelayService
{
    public const EXCHANGE = 'sigec.eventos';

    /** @param Closure(string $exchange, array $envelope): void $publish */
    public function __construct(private readonly Closure $publish) {}

    /** Publica un lote; devuelve cuantos eventos publico. Lanza la excepcion del primer fallo (tras confirmar los previos). */
    public function relayBatch(int $batchSize = 50): int
    {
        $failure = null;
        $published = DB::transaction(function () use ($batchSize, &$failure) {
            $rows = DB::table('outbox')
                ->whereNull('published_at')
                ->orderBy('created_at')->orderBy('id')
                ->limit($batchSize)
                ->lock('FOR UPDATE SKIP LOCKED')
                ->get();
            $count = 0;
            foreach ($rows as $row) {
                try {
                    ($this->publish)($row->exchange ?? self::EXCHANGE, self::envelope($row));
                } catch (Throwable $e) {
                    $failure = $e;
                    break; // se confirma (commit) lo publicado antes y se reintenta desde esta fila
                }
                DB::table('outbox')->where('id', $row->id)->update(['published_at' => now()]);
                $count++;
            }

            return $count;
        });

        if ($failure !== null) {
            throw $failure;
        }

        return $published;
    }

    public function pending(): int
    {
        return DB::table('outbox')->whereNull('published_at')->count();
    }

    /** Sobre comun (contracts/events/envelope.schema.json). */
    public static function envelope(object $row): array
    {
        $payload = json_decode($row->payload, true, flags: JSON_THROW_ON_ERROR);

        return [
            'id' => $row->id,
            'type' => $row->event_type,
            'occurredAt' => Carbon::parse($row->created_at)->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'correlationId' => $row->correlation_id ?? $row->aggregate_id,
            'causationId' => $row->causation_id ?? null,
            'version' => 1,
            'payload' => $payload === [] ? new \stdClass : $payload,
        ];
    }
}
