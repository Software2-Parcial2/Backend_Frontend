<?php

namespace App\Support;

/** Paginacion por cursor de SIGEC: {items, siguiente}. El cursor es JSON en base64url (opaco para el cliente). */
final class Pagina
{
    public static function encode(array $clave): string
    {
        return rtrim(strtr(base64_encode(json_encode($clave, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
    }

    /** @return array<string, mixed>|null null si el cursor esta mal formado (el llamador responde 400 CURSOR_INVALIDO) */
    public static function decode(?string $cursor): ?array
    {
        if ($cursor === null || $cursor === '') {
            return null;
        }
        $json = base64_decode(strtr($cursor, '-_', '+/'), true);
        $clave = $json === false ? null : json_decode($json, true);

        return is_array($clave) ? $clave : null;
    }
}
