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

beforeEach(function () {
    Cache::store('file')->forget('keycloak.jwks');
});

it('expone el health publico', function () {
    $this->getJson('/api/facturacion/health')
        ->assertOk()
        ->assertJson(['status' => 'UP']);
});

it('rechaza facturas sin token', function () {
    $this->getJson('/api/facturacion/facturas')->assertUnauthorized();
});

it('rechaza un token que no es un JWT', function () {
    fakeKeycloak();

    $this->getJson('/api/facturacion/facturas', ['Authorization' => 'Bearer abc'])->assertUnauthorized();
});

it('rechaza un token expirado', function () {
    $pem = fakeKeycloak();

    $this->getJson('/api/facturacion/facturas', [
        'Authorization' => 'Bearer '.token($pem, ['exp' => time() - 60]),
    ])->assertUnauthorized();
});

it('rechaza un token con issuer distinto', function () {
    $pem = fakeKeycloak();

    $this->getJson('/api/facturacion/facturas', [
        'Authorization' => 'Bearer '.token($pem, ['iss' => 'http://otro/realms/x']),
    ])->assertUnauthorized();
});

it('rechaza un token firmado con otra clave', function () {
    fakeKeycloak(); // el JWKS publica una clave...
    $k = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    openssl_pkey_export($k, $pemAjena); // ...pero el token se firma con otra

    $this->getJson('/api/facturacion/facturas', [
        'Authorization' => 'Bearer '.token($pemAjena),
    ])->assertUnauthorized();
});

it('devuelve la lista vacia con un token valido', function () {
    $pem = fakeKeycloak();

    $this->getJson('/api/facturacion/facturas', [
        'Authorization' => 'Bearer '.token($pem),
    ])->assertOk()->assertExactJson([]);
});
