<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Las rutas de este archivo llevan automaticamente el prefijo /api.
Route::prefix('facturacion')->group(function () {
    Route::get('/health', fn () => response()->json(['status' => 'UP', 'service' => 'ms6-facturacion']));

    Route::middleware('keycloak.jwt')->group(function () {
        // TODO: listar facturas reales (con autorizacion por rol) cuando exista el dominio.
        Route::get('/facturas', fn (Request $request) => response()->json([]));
    });
});
