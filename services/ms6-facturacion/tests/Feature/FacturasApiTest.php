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
    ])->assertOk()->assertExactJson(['items' => [], 'siguiente' => null]);
});

describe('autorizacion por paciente', function () {
    $PACIENTE = 'a0000000-0000-4000-8000-000000000001';

    beforeEach(function () {
        $this->propia = DB::table('facturas')->insertGetId(['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => 'a0000000-0000-4000-8000-000000000001', 'monto' => 10, 'estado' => 'PENDIENTE', 'created_at' => now(), 'updated_at' => now()], 'id');
        DB::table('facturas')->insert(['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => (string) Str::uuid(), 'monto' => 20, 'estado' => 'PENDIENTE', 'created_at' => now(), 'updated_at' => now()]);
    });

    it('un paciente solo ve sus facturas', function () use ($PACIENTE) {
        $res = $this->getJson('/api/facturacion/facturas', authHeaders(['realm_access' => ['roles' => ['paciente']], 'paciente_id' => $PACIENTE]))->assertOk();
        expect($res->json('items'))->toHaveCount(1)->and($res->json('items.0.pacienteId'))->toBe($PACIENTE);
    });

    it('un paciente sin vinculo recibe 403', function () {
        $this->getJson('/api/facturacion/facturas', authHeaders(['realm_access' => ['roles' => ['paciente']]]))->assertForbidden();
    });

    it('caja ve todas las facturas', function () {
        expect($this->getJson('/api/facturacion/facturas', authHeaders())->assertOk()->json('items'))->toHaveCount(2);
    });
});

describe('ingresos agregados', function () {
    function insertarFactura(string $estado, float $monto, string $fecha): void
    {
        DB::table('facturas')->insert(['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => (string) Str::uuid(),
            'monto' => $monto, 'estado' => $estado, 'created_at' => $fecha, 'updated_at' => $fecha]);
    }

    it('suma por mes solo confirmadas y provisionales dentro del rango', function () {
        insertarFactura('CONFIRMADA', 100, '2026-01-10 10:00:00');
        insertarFactura('CONFIRMADA', 50.5, '2026-01-20 10:00:00');
        insertarFactura('PROVISIONAL', 30, '2026-01-25 10:00:00');
        insertarFactura('ANULADA', 999, '2026-01-26 10:00:00');
        insertarFactura('CONFIRMADA', 70, '2026-02-02 10:00:00');
        insertarFactura('CONFIRMADA', 5, '2025-12-31 23:00:00'); // fuera del rango

        $res = $this->getJson('/api/facturacion/facturas/ingresos?desde=2026-01-01&hasta=2026-02-28', authHeaders())->assertOk()->json();
        expect($res)->toEqual([
            ['periodo' => '2026-01', 'confirmado' => '150.50', 'provisional' => '30.00', 'moneda' => 'BOB', 'facturas' => 3],
            ['periodo' => '2026-02', 'confirmado' => '70.00', 'provisional' => '0.00', 'moneda' => 'BOB', 'facturas' => 1],
        ]);
    });

    it('agrupa por dia', function () {
        insertarFactura('CONFIRMADA', 10, '2026-03-01 08:00:00');
        insertarFactura('CONFIRMADA', 15, '2026-03-01 18:00:00');
        $res = $this->getJson('/api/facturacion/facturas/ingresos?desde=2026-03-01&hasta=2026-03-02&agrupar=dia', authHeaders())->assertOk()->json();
        expect($res)->toHaveCount(1)->and($res[0]['periodo'])->toBe('2026-03-01')->and($res[0]['confirmado'])->toBe('25.00');
    });

    it('agrupa por especialidad (las facturas sin ella van a SIN_ESPECIALIDAD)', function () {
        DB::table('facturas')->insert([
            ['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => (string) Str::uuid(), 'monto' => 80, 'estado' => 'CONFIRMADA', 'especialidad' => 'pediatria', 'created_at' => '2026-04-01 10:00:00', 'updated_at' => '2026-04-01 10:00:00'],
            ['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => (string) Str::uuid(), 'monto' => 20, 'estado' => 'PROVISIONAL', 'especialidad' => 'pediatria', 'created_at' => '2026-04-02 10:00:00', 'updated_at' => '2026-04-02 10:00:00'],
            ['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => (string) Str::uuid(), 'monto' => 50, 'estado' => 'CONFIRMADA', 'especialidad' => null, 'created_at' => '2026-04-03 10:00:00', 'updated_at' => '2026-04-03 10:00:00'],
        ]);
        $res = $this->getJson('/api/facturacion/facturas/ingresos?desde=2026-04-01&hasta=2026-04-30&agrupar=especialidad', authHeaders())->assertOk()->json();
        usort($res, fn ($a, $b) => strcmp($a['periodo'], $b['periodo'])); // el orden depende de la colacion de la base
        expect($res)->toEqual([
            ['periodo' => 'SIN_ESPECIALIDAD', 'confirmado' => '50.00', 'provisional' => '0.00', 'moneda' => 'BOB', 'facturas' => 1],
            ['periodo' => 'pediatria', 'confirmado' => '80.00', 'provisional' => '20.00', 'moneda' => 'BOB', 'facturas' => 2],
        ]);
    });

    it('valida parametros y rango maximo', function () {
        $this->getJson('/api/facturacion/facturas/ingresos', authHeaders())->assertStatus(400)->assertJsonPath('code', 'VALIDACION');
        $this->getJson('/api/facturacion/facturas/ingresos?desde=2026-02-01&hasta=2026-01-01', authHeaders())->assertStatus(400);
        $this->getJson('/api/facturacion/facturas/ingresos?desde=2020-01-01&hasta=2026-01-01', authHeaders())->assertUnprocessable()->assertJsonPath('code', 'RANGO_EXCEDIDO');
    });

    it('solo caja y administrador', function () {
        $url = '/api/facturacion/facturas/ingresos?desde=2026-01-01&hasta=2026-01-31';
        $this->getJson($url, authHeaders(['realm_access' => ['roles' => ['recepcion']]]))->assertForbidden();
        $this->getJson($url, authHeaders(['realm_access' => ['roles' => ['paciente']], 'paciente_id' => (string) Str::uuid()]))->assertForbidden();
        $this->getJson($url, authHeaders(['realm_access' => ['roles' => ['administrador']]]))->assertOk();
    });
});
