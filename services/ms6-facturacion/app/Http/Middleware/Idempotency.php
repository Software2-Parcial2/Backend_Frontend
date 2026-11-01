<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Idempotency-Key segun contracts/idempotency.md, sobre la tabla idempotency_keys.
 * Debe ir DESPUES de keycloak.jwt (usa el usuario para acotar la clave).
 */
class Idempotency
{
    private const METHODS = ['POST', 'PUT', 'PATCH'];

    private const TTL_HOURS = 24;

    public function handle(Request $request, Closure $next): Response
    {
        if (! in_array($request->method(), self::METHODS, true)) {
            return $next($request);
        }

        $header = $request->header('Idempotency-Key');
        if (! is_string($header) || $header === '') {
            return $this->problem(400, 'Idempotency-Key requerida', 'Falta la cabecera Idempotency-Key');
        }
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $header) !== 1) {
            return $this->problem(400, 'Idempotency-Key requerida', 'Idempotency-Key debe ser un UUID');
        }

        $key = ($request->attributes->get('user_id') ?? 'anon').':'.strtolower($header);
        $hash = $this->requestHash($request);

        if (! $this->reserve($key, $hash)) {
            $row = DB::table('idempotency_keys')->where('key', $key)->first();
            if ($row === null && ! $this->reserve($key, $hash)) { // se libero entre medias
                return $this->inProgress();
            }
            if ($row !== null) {
                if (trim($row->request_hash) !== $hash) {
                    return $this->problem(422, 'Idempotency-Key reutilizada', 'La misma clave se uso con una peticion distinta');
                }
                if ($row->status === 'COMPLETADO' && $row->response !== null) {
                    return $this->replay(json_decode($row->response, true));
                }

                return $this->inProgress();
            }
        }

        try {
            $response = $next($request);
        } catch (\Throwable $e) {
            $this->release($key);
            throw $e;
        }

        $status = $response->getStatusCode();
        if ($status >= 500) {
            $this->release($key); // transitorio: la clave se puede reintentar
        } else {
            DB::table('idempotency_keys')->where('key', $key)->update([
                'status' => 'COMPLETADO',
                'response' => json_encode([
                    'status' => $status,
                    'body' => $response->getContent(),
                    'contentType' => $response->headers->get('Content-Type'),
                ], JSON_THROW_ON_ERROR),
                'updated_at' => now(),
            ]);
        }

        return $response;
    }

    /** Reserva atomica: inserta, o toma una fila VENCIDA. false si existe una vigente. */
    private function reserve(string $key, string $hash): bool
    {
        return DB::affectingStatement(
            "INSERT INTO idempotency_keys (key, request_hash, status, expires_at, created_at, updated_at)
             VALUES (?, ?, 'PROCESANDO', now() + (? * interval '1 hour'), now(), now())
             ON CONFLICT (key) DO UPDATE
                SET request_hash = EXCLUDED.request_hash, status = 'PROCESANDO', response = NULL,
                    expires_at = EXCLUDED.expires_at, updated_at = now()
              WHERE idempotency_keys.expires_at < now()",
            [$key, $hash, self::TTL_HOURS],
        ) === 1;
    }

    private function release(string $key): void
    {
        DB::table('idempotency_keys')->where('key', $key)->delete();
    }

    /** SHA-256(METHOD + " " + rutaConQuery + "\n" + SHA-256(cuerpo canonico)). */
    private function requestHash(Request $request): string
    {
        $raw = $request->getContent();
        $decoded = $raw === '' ? [] : json_decode($raw, true);
        $canonical = is_array($decoded) ? json_encode($this->sortKeys($decoded)) : $raw;
        if ($canonical === '[]') {
            $canonical = '{}';
        }

        return hash('sha256', $request->method().' '.$request->getRequestUri()."\n".hash('sha256', $canonical));
    }

    private function sortKeys(array $value): array
    {
        foreach ($value as $k => $v) {
            if (is_array($v)) {
                $value[$k] = $this->sortKeys($v);
            }
        }
        if (! array_is_list($value)) {
            ksort($value);
        }

        return $value;
    }

    private function replay(array $stored): Response
    {
        return response($stored['body'], $stored['status'])
            ->header('Content-Type', $stored['contentType'] ?? 'application/json')
            ->header('Idempotent-Replay', 'true');
    }

    private function inProgress(): Response
    {
        return $this->problem(409, 'Peticion en proceso', 'La peticion original sigue procesandose')->header('Retry-After', '1');
    }

    private function problem(int $status, string $title, string $detail): Response
    {
        return response()->json(['type' => 'about:blank', 'title' => $title, 'status' => $status, 'detail' => $detail], $status)
            ->header('Content-Type', 'application/problem+json');
    }
}
