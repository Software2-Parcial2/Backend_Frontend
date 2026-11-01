<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

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

describe('autorizacion por paciente', function () {
    $PACIENTE = 'a0000000-0000-4000-8000-000000000001';

    beforeEach(function () {
        $this->propia = DB::table('facturas')->insertGetId(['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => 'a0000000-0000-4000-8000-000000000001', 'monto' => 10, 'estado' => 'PENDIENTE', 'created_at' => now(), 'updated_at' => now()], 'id');
        DB::table('facturas')->insert(['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => (string) Str::uuid(), 'monto' => 20, 'estado' => 'PENDIENTE', 'created_at' => now(), 'updated_at' => now()]);
    });

    it('un paciente solo ve sus facturas', function () use ($PACIENTE) {
        $res = $this->getJson('/api/facturacion/facturas', authHeaders(['realm_access' => ['roles' => ['paciente']], 'paciente_id' => $PACIENTE]))->assertOk();
        expect($res->json())->toHaveCount(1)->and($res->json('0.paciente_id'))->toBe($PACIENTE);
    });

    it('un paciente sin vinculo recibe 403', function () {
        $this->getJson('/api/facturacion/facturas', authHeaders(['realm_access' => ['roles' => ['paciente']]]))->assertForbidden();
    });

    it('caja ve todas las facturas', function () {
        expect($this->getJson('/api/facturacion/facturas', authHeaders())->assertOk()->json())->toHaveCount(2);
    });
});
