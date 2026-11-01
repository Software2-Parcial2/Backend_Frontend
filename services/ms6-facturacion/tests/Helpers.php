<?php

use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

const ISSUER = 'http://localhost:8080/realms/sigec';

function base64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/** Genera un par RSA, simula el JWKS de Keycloak y devuelve la clave privada. */
function fakeKeycloak(): string
{
    $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    openssl_pkey_export($key, $privatePem);
    $details = openssl_pkey_get_details($key);

    Http::fake([
        '*/protocol/openid-connect/certs' => Http::response(['keys' => [[
            'kty' => 'RSA', 'kid' => 'test-key', 'alg' => 'RS256', 'use' => 'sig',
            'n' => base64url($details['rsa']['n']),
            'e' => base64url($details['rsa']['e']),
        ]]]),
    ]);

    return $privatePem;
}

function token(string $privatePem, array $override = []): string
{
    $payload = array_merge([
        'iss' => ISSUER,
        'sub' => 'user-1',
        'iat' => time() - 10,
        'exp' => time() + 600,
        'realm_access' => ['roles' => ['caja']],
    ], $override);

    return JWT::encode($payload, $privatePem, 'RS256', 'test-key');
}

/** Cabeceras con un JWT valido (rol caja por defecto). Usa un unico par RSA por proceso de pruebas. */
function authHeaders(array $claims = [], array $extra = []): array
{
    static $pem = null;
    static $jwk = null;
    if ($pem === null) {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, $pem);
        $d = openssl_pkey_get_details($key);
        $jwk = ['kty' => 'RSA', 'kid' => 'test-key', 'alg' => 'RS256', 'use' => 'sig',
            'n' => base64url($d['rsa']['n']), 'e' => base64url($d['rsa']['e'])];
    }
    Cache::store('file')->forget('keycloak.jwks');
    Http::fake(['*/protocol/openid-connect/certs' => Http::response(['keys' => [$jwk]])]);

    return array_merge(['Authorization' => 'Bearer '.token($pem, $claims)], $extra);
}
