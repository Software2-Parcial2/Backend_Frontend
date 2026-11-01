<?php

use Illuminate\Support\Facades\Route;

// MS6 es solo API: la raiz devuelve una ficha minima del servicio.
Route::get('/', fn () => response()->json(['service' => 'ms6-facturacion']));
