<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Valida el JWT de Keycloak: firma (JWKS con cache), issuer y expiracion.
 * Deja el usuario y sus roles (realm_access.roles) en los atributos de la peticion.
 */
class VerifyKeycloakJwt
{
    private const JWKS_CACHE_KEY = 'keycloak.jwks';

    private const JWKS_TTL_SECONDS = 600;

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        if (! $token) {
            return $this->unauthorized('Falta el token Bearer');
        }

        try {
            $claims = $this->decode($token);
        } catch (Throwable $e) {
            return $this->unauthorized('Token invalido');
        }

        if (($claims->iss ?? null) !== $this->issuer()) {
            return $this->unauthorized('Issuer no permitido');
        }

        $request->attributes->set('jwt', $claims);
        $request->attributes->set('user_id', $claims->sub ?? null);
        $request->attributes->set('username', $claims->preferred_username ?? null);
        $request->attributes->set('roles', $claims->realm_access->roles ?? []);
        $request->attributes->set('paciente_id', $claims->paciente_id ?? null);

        return $next($request);
    }

    private function decode(string $token): object
    {
        try {
            return JWT::decode($token, JWK::parseKeySet($this->jwks(), 'RS256'));
        } catch (\UnexpectedValueException $e) {
            // Posible rotacion de claves: se refresca el JWKS una vez y se reintenta.
            return JWT::decode($token, JWK::parseKeySet($this->jwks(refresh: true), 'RS256'));
        }
    }

    /** @return array<string, mixed> */
    private function jwks(bool $refresh = false): array
    {
        // Cache propia en archivo: el store por defecto (array) no sobrevive entre peticiones.
        $cache = Cache::store('file');
        if ($refresh) {
            $cache->forget(self::JWKS_CACHE_KEY);
        }

        return $cache->remember(self::JWKS_CACHE_KEY, self::JWKS_TTL_SECONDS, function () {
            return Http::timeout(5)->get($this->jwksUrl())->throw()->json();
        });
    }

    private function issuer(): string
    {
        return config('services.keycloak.issuer');
    }

    private function jwksUrl(): string
    {
        return config('services.keycloak.jwks_url') ?: $this->issuer().'/protocol/openid-connect/certs';
    }

    private function unauthorized(string $message): Response
    {
        return \App\Support\Problem::response(401, 'NO_AUTENTICADO', 'No autenticado', $message)->header('WWW-Authenticate', 'Bearer');
    }
}
