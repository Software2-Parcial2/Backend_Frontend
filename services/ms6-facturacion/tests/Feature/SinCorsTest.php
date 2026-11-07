<?php

// CORS vive solo en el gateway (AGENTS.md). Si MS6 tambien responde con Access-Control-Allow-Origin, el navegador ve DOS valores
// (el suyo y el del gateway) y descarta la respuesta (net::ERR_FAILED).
it('no anade cabeceras CORS propias a sus respuestas', function () {
    $res = $this->getJson('/api/facturacion/facturas', authHeaders() + ['Origin' => 'http://localhost:5173'])->assertOk();
    expect($res->headers->has('Access-Control-Allow-Origin'))->toBeFalse()
        ->and($res->headers->has('Access-Control-Allow-Credentials'))->toBeFalse();
});

it('tampoco en los errores', function () {
    $res = $this->getJson('/api/facturacion/facturas/00000000-0000-4000-8000-000000000000', authHeaders() + ['Origin' => 'http://localhost:5173'])->assertNotFound();
    expect($res->headers->has('Access-Control-Allow-Origin'))->toBeFalse();
});
