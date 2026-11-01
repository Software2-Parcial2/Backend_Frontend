<?php

use App\Http\Controllers\FacturaController;
use Illuminate\Support\Facades\Route;

// Las rutas de este archivo llevan automaticamente el prefijo /api.
Route::prefix('facturacion')->group(function () {
    Route::get('/health', fn () => response()->json(['status' => 'UP', 'service' => 'ms6-facturacion']));

    Route::middleware('keycloak.jwt')->group(function () {
        Route::get('/facturas', [FacturaController::class, 'index'])->middleware('role:caja,administrador,recepcion');
        // El orden importa: autenticacion -> rol -> idempotencia.
        Route::post('/facturas', [FacturaController::class, 'store'])->middleware(['role:caja,administrador,recepcion', 'idempotent']);
    });
});
