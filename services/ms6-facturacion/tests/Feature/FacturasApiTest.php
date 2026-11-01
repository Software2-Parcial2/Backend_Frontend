<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

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
