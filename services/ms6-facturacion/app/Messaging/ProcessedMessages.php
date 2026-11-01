<?php

namespace App\Messaging;

use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Deduplicacion de consumidores por id del mensaje (tabla processed_messages; contracts/idempotency.md).
 * Mismo protocolo que DynamoMessageDeduplicator: PROCESANDO con arrendamiento, COMPLETADO conservado 7 dias.
 */
final class ProcessedMessages
{
    public const LEASE_SECONDS = 60;

    public const RETENTION_DAYS = 7;

    /** true = ejecutar; false = ya COMPLETADO (descartar). Lanza si otro consumidor lo tiene en curso. */
    public static function tryBegin(string $id): bool
    {
        $rows = DB::affectingStatement(
            "INSERT INTO processed_messages (id, status, locked_until, expires_at)
             VALUES (?, 'PROCESANDO', now() + (? * interval '1 second'), now() + (? * interval '1 day'))
             ON CONFLICT (id) DO UPDATE
                SET status = 'PROCESANDO', locked_until = EXCLUDED.locked_until, expires_at = EXCLUDED.expires_at
              WHERE (processed_messages.status = 'PROCESANDO' AND processed_messages.locked_until < now())
                 OR processed_messages.expires_at < now()",
            [$id, self::LEASE_SECONDS, self::RETENTION_DAYS],
        );
        if ($rows === 1) {
            return true;
        }
        $status = DB::table('processed_messages')->where('id', $id)->value('status');
        if ($status === 'COMPLETADO') {
            return false;
        }
        throw new RuntimeException("El mensaje $id esta siendo procesado por otro consumidor");
    }

    public static function complete(string $id): void
    {
        DB::table('processed_messages')->where('id', $id)->update([
            'status' => 'COMPLETADO',
            'locked_until' => null,
            'expires_at' => now()->addDays(self::RETENTION_DAYS),
        ]);
    }

    public static function release(string $id): void
    {
        DB::table('processed_messages')->where('id', $id)->delete();
    }

    /** Closures listos para pasar a RabbitConsumer. */
    public static function hooks(): array
    {
        return [
            'tryBegin' => fn (string $id) => self::tryBegin($id),
            'complete' => fn (string $id) => self::complete($id),
            'release' => fn (string $id) => self::release($id),
        ];
    }
}
