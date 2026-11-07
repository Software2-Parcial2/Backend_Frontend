<?php

use App\Http\Controllers\CajaController;
use App\Http\Controllers\FacturaController;
use App\Http\Controllers\TarifaController;
use Illuminate\Support\Facades\Route;

// Las rutas de este archivo llevan automaticamente el prefijo /api.
Route::prefix('facturacion')->group(function () {
    Route::get('/health', fn () => response()->json(['status' => 'UP', 'service' => 'ms6-facturacion']));

    Route::middleware('keycloak.jwt')->group(function () {
        Route::get('/facturas', [FacturaController::class, 'index'])->middleware('role:caja,administrador,recepcion,paciente');
        // El orden importa: autenticacion -> rol -> idempotencia.
        Route::get('/facturas/ingresos', [FacturaController::class, 'ingresos'])->middleware('role:caja,administrador');
        Route::post('/facturas', [FacturaController::class, 'store'])->middleware(['role:caja,administrador,recepcion', 'idempotent']);
        Route::get('/facturas/{factura}', [FacturaController::class, 'show'])->whereUuid('factura')->middleware('role:caja,administrador,recepcion,paciente');
        Route::get('/facturas/{factura}/comprobante', [FacturaController::class, 'comprobante'])->whereUuid('factura')->middleware('role:caja,administrador,recepcion,paciente');
        Route::post('/facturas/{factura}/pagos', [FacturaController::class, 'pagar'])->whereUuid('factura')->middleware(['role:caja,administrador', 'idempotent']);
        Route::post('/facturas/{factura}/anular', [FacturaController::class, 'anular'])->whereUuid('factura')->middleware(['role:caja,administrador', 'idempotent']);

        // Caja del dia (hora local de la clinica).
        Route::get('/movimientos', [CajaController::class, 'movimientos'])->middleware('role:caja,administrador');
        Route::get('/balance', [CajaController::class, 'balance'])->middleware('role:caja,administrador');

        // Tarifario: lo leen caja, recepcion (muestra el cargo provisional al reservar) y administracion; lo modifica el administrador.
        Route::get('/tarifas', [TarifaController::class, 'index'])->middleware('role:administrador,caja,recepcion');
        Route::post('/tarifas', [TarifaController::class, 'store'])->middleware(['role:administrador', 'idempotent']);
        Route::put('/tarifas/{tarifa}', [TarifaController::class, 'update'])->whereUuid('tarifa')->middleware(['role:administrador', 'idempotent']);
    });
});
