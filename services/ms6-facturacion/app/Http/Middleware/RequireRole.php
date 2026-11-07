<?php

namespace App\Http\Middleware;

use App\Support\Problem;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Exige alguno de los roles de realm indicados (role:caja,administrador). Va despues de keycloak.jwt. */
class RequireRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $userRoles = (array) $request->attributes->get('roles', []);
        if (array_intersect($roles, $userRoles) === []) {
            return Problem::response(403, 'PROHIBIDO', 'Acceso denegado', 'Su rol no permite esta operacion');
        }

        return $next($request);
    }
}
