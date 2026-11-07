<?php

use App\Support\Pagina;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Convencion HTTP de SIGEC (docs/api.md): problem+json, camelCase, dinero como string, paginacion por cursor, X-Correlation-Id. */
beforeEach(function () {
    \Illuminate\Support\Facades\Cache::store('file')->forget('keycloak.jwks');
});

function sembrar(int $n): void
{
    for ($i = 0; $i < $n; $i++) {
        $t = now()->subMinutes($n - $i);
        DB::table('facturas')->insert(['id' => (string) Str::uuid(), 'cita_id' => (string) Str::uuid(), 'paciente_id' => (string) Str::uuid(),
            'monto' => 100 + $i, 'estado' => 'PENDIENTE', 'created_at' => $t, 'updated_at' => $t]);
    }
}

it('los errores salen como problem+json con code, instance y correlationId', function () {
    $r = $this->getJson('/api/facturacion/facturas', ['X-Correlation-Id' => 'corr-7'])->assertUnauthorized();
    expect($r->headers->get('Content-Type'))->toContain('application/problem+json');
    $r->assertJson(['status' => 401, 'code' => 'NO_AUTENTICADO', 'correlationId' => 'corr-7', 'instance' => '/api/facturacion/facturas']);
});

it('rol insuficiente es 403 problem+json', function () {
    $this->getJson('/api/facturacion/facturas/ingresos?desde=2026-01-01&hasta=2026-01-31', authHeaders(['realm_access' => ['roles' => ['recepcion']]]))
        ->assertForbidden()->assertJson(['code' => 'PROHIBIDO']);
});

it('ruta inexistente es 404 problem+json', function () {
    $this->getJson('/api/facturacion/no-existe', authHeaders())->assertNotFound()->assertJson(['code' => 'NO_ENCONTRADO']);
});

it('la validacion devuelve errors por campo en camelCase', function () {
    $r = $this->postJson('/api/facturacion/facturas', ['monto' => -1], authHeaders([], ['Idempotency-Key' => (string) Str::uuid()]))->assertStatus(400);
    $campos = collect($r->json('errors'))->pluck('campo')->all();
    expect($campos)->toContain('citaId')->toContain('pacienteId')->toContain('monto');
});

it('crear devuelve 201 con Location y la factura en camelCase con dinero como string', function () {
    $body = ['citaId' => (string) Str::uuid(), 'pacienteId' => (string) Str::uuid(), 'monto' => 180];
    $r = $this->postJson('/api/facturacion/facturas', $body, authHeaders([], ['Idempotency-Key' => (string) Str::uuid()]))->assertCreated();
    expect($r->headers->get('Location'))->toStartWith('/api/facturacion/facturas/');
    $r->assertJson(['citaId' => $body['citaId'], 'pacienteId' => $body['pacienteId'], 'monto' => '180.00', 'moneda' => 'BOB', 'estado' => 'PENDIENTE']);
    expect(array_keys($r->json()))->not->toContain('cita_id');
});

it('un segundo cobro vigente para la misma cita es 409 COBRO_VIGENTE_EXISTENTE', function () {
    $body = ['citaId' => (string) Str::uuid(), 'pacienteId' => (string) Str::uuid(), 'monto' => 10];
    $this->postJson('/api/facturacion/facturas', $body, authHeaders([], ['Idempotency-Key' => (string) Str::uuid()]))->assertCreated();
    $this->postJson('/api/facturacion/facturas', $body, authHeaders([], ['Idempotency-Key' => (string) Str::uuid()]))
        ->assertStatus(409)->assertJson(['code' => 'COBRO_VIGENTE_EXISTENTE']);
});

it('pagina por cursor sin repetir ni saltar filas', function () {
    sembrar(7);
    $vistos = [];
    $cursor = null;
    $paginas = 0;
    do {
        $url = '/api/facturacion/facturas?limite=3'.($cursor ? '&cursor='.$cursor : '');
        $r = $this->getJson($url, authHeaders())->assertOk();
        foreach ($r->json('items') as $f) {
            $vistos[] = $f['id'];
        }
        $cursor = $r->json('siguiente');
        $paginas++;
    } while ($cursor && $paginas < 5);
    expect($paginas)->toBe(3)->and($vistos)->toHaveCount(7)->and(array_unique($vistos))->toHaveCount(7);
});

it('limite fuera de rango y cursor invalido son 400', function () {
    $this->getJson('/api/facturacion/facturas?limite=500', authHeaders())->assertStatus(400)->assertJson(['code' => 'VALIDACION']);
    $this->getJson('/api/facturacion/facturas?cursor=basura', authHeaders())->assertStatus(400)->assertJson(['code' => 'CURSOR_INVALIDO']);
});

it('el cursor es opaco y reversible', function () {
    expect(Pagina::decode(Pagina::encode(['c' => 'x', 'i' => 'y'])))->toBe(['c' => 'x', 'i' => 'y']);
    expect(Pagina::decode('%%%'))->toBeNull();
});

it('toda respuesta lleva X-Correlation-Id', function () {
    expect($this->getJson('/api/facturacion/facturas', authHeaders())->headers->get('X-Correlation-Id'))->toMatch('/^[0-9a-f-]{36}$/');
});
