<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;

/**
 * Errores de SIGEC como RFC 7807 (application/problem+json): type, title, status, detail, code, errors?, instance, correlationId.
 * Mismo formato que MS2/MS3/MS4/MS5/MS7/MS8 y el gateway (docs/api.md).
 */
final class Problem
{
    /** @param list<array{campo: string, mensaje: string}>|null $errors */
    public static function response(int $status, string $code, string $title, string $detail, ?array $errors = null): JsonResponse
    {
        $request = request();
        $body = [
            'type' => 'about:blank',
            'title' => $title,
            'status' => $status,
            'detail' => $detail,
            'code' => $code,
        ];
        if ($errors !== null) {
            $body['errors'] = $errors;
        }
        $body['instance'] = '/'.ltrim($request->path(), '/');
        if ($correlation = $request->header('X-Correlation-Id')) {
            $body['correlationId'] = $correlation;
        }

        return response()->json($body, $status)->header('Content-Type', 'application/problem+json');
    }

    /** Codigo estable por defecto segun el estado HTTP. */
    public static function codeFor(int $status): string
    {
        return match ($status) {
            400 => 'SOLICITUD_INVALIDA',
            401 => 'NO_AUTENTICADO',
            403 => 'PROHIBIDO',
            404 => 'NO_ENCONTRADO',
            405 => 'METODO_NO_PERMITIDO',
            409 => 'CONFLICTO',
            415 => 'TIPO_NO_SOPORTADO',
            422 => 'REGLA_DE_NEGOCIO',
            429 => 'DEMASIADAS_PETICIONES',
            default => $status >= 500 ? 'ERROR_INTERNO' : 'ERROR',
        };
    }
}
