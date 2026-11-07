<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/** Garantiza X-Correlation-Id: usa el de la peticion (lo genera el gateway) o crea uno, y lo devuelve en la respuesta. */
class Correlation
{
    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->header('X-Correlation-Id') ?: (string) Str::uuid();
        $request->headers->set('X-Correlation-Id', $id);

        return $next($request)->header('X-Correlation-Id', $id);
    }
}
