<?php

namespace App\Messaging;

use Illuminate\Support\Str;
use InvalidArgumentException;

/** Sobre comun de los mensajes (contracts/events/envelope.schema.json). */
final class Envelope
{
    private const KEYS = ['id', 'type', 'occurredAt', 'correlationId', 'causationId', 'version', 'payload'];

    /** @param array<string, mixed> $payload */
    public static function create(string $type, string $correlationId, array $payload, ?string $causationId = null, int $version = 1): array
    {
        return [
            'id' => (string) Str::uuid(),
            'type' => $type,
            'occurredAt' => gmdate('Y-m-d\TH:i:s.v\Z'),
            'correlationId' => $correlationId,
            'causationId' => $causationId,
            'version' => $version,
            'payload' => $payload === [] ? new \stdClass : $payload,
        ];
    }

    /**
     * Valida el sobre; lanza InvalidArgumentException con todos los problemas.
     *
     * @param  mixed  $value
     * @return array<string, mixed>
     */
    public static function validate(mixed $value): array
    {
        $errors = [];
        if (! is_array($value) || array_is_list($value) && $value !== []) {
            throw new InvalidArgumentException('Sobre invalido: el mensaje no es un objeto');
        }
        foreach (self::KEYS as $k) {
            if (! array_key_exists($k, $value)) {
                $errors[] = "falta $k";
            }
        }
        foreach (array_keys($value) as $k) {
            if (! in_array($k, self::KEYS, true)) {
                $errors[] = "propiedad no permitida: $k";
            }
        }
        $uuid = fn ($v) => is_string($v) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $v) === 1;
        if (array_key_exists('id', $value) && ! $uuid($value['id'])) {
            $errors[] = 'id debe ser UUID';
        }
        if (array_key_exists('type', $value) && ! (is_string($value['type']) && preg_match('/^[a-z0-9]+(\.[a-z0-9-]+)+$/', $value['type']))) {
            $errors[] = 'type invalido';
        }
        if (array_key_exists('occurredAt', $value) && ! (is_string($value['occurredAt']) && preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/', $value['occurredAt']) && strtotime($value['occurredAt']) !== false)) {
            $errors[] = 'occurredAt debe ser ISO 8601 UTC';
        }
        if (array_key_exists('correlationId', $value) && ! $uuid($value['correlationId'])) {
            $errors[] = 'correlationId debe ser UUID';
        }
        if (array_key_exists('causationId', $value) && $value['causationId'] !== null && ! $uuid($value['causationId'])) {
            $errors[] = 'causationId debe ser UUID o null';
        }
        if (array_key_exists('version', $value) && ! (is_int($value['version']) && $value['version'] >= 1)) {
            $errors[] = 'version debe ser entero >= 1';
        }
        if (array_key_exists('payload', $value) && ! is_array($value['payload']) && ! $value['payload'] instanceof \stdClass) {
            $errors[] = 'payload debe ser un objeto';
        }
        if ($errors !== []) {
            throw new InvalidArgumentException('Sobre invalido: '.implode('; ', $errors));
        }

        return $value;
    }
}
