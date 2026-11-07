<?php

use Illuminate\Support\Facades\Route;

/** contracts/openapi/ms6-facturacion.json (escrito a mano) debe listar exactamente las rutas /api/facturacion/* del codigo. */
it('las rutas del codigo coinciden con el contrato OpenAPI', function () {
    $spec = json_decode(file_get_contents(base_path('../../contracts/openapi/ms6-facturacion.json')), true, 512, JSON_THROW_ON_ERROR);
    $enSpec = [];
    foreach ($spec['paths'] as $ruta => $metodos) {
        foreach (array_keys($metodos) as $metodo) {
            $enSpec[] = strtoupper($metodo).' '.preg_replace('/\{[^}]+\}/', '{}', $ruta);
        }
    }
    $enCodigo = [];
    foreach (Route::getRoutes() as $r) {
        if (! str_starts_with($r->uri(), 'api/facturacion')) {
            continue;
        }
        foreach ($r->methods() as $m) {
            if ($m !== 'HEAD') {
                $enCodigo[] = $m.' /'.preg_replace('/\{[^}]+\}/', '{}', $r->uri());
            }
        }
    }
    sort($enSpec);
    sort($enCodigo);
    expect($enCodigo)->toBe($enSpec);
});

it('el contrato declara el formato de error problem+json y la paginacion de SIGEC', function () {
    $spec = json_decode(file_get_contents(base_path('../../contracts/openapi/ms6-facturacion.json')), true);
    expect($spec['components']['schemas'])->toHaveKeys(['Problem', 'PaginaFacturas', 'Factura']);
    expect($spec['components']['schemas']['PaginaFacturas']['required'])->toBe(['items', 'siguiente']);
});
