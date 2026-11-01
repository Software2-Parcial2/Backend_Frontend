<?php

namespace App\Http\Middleware;

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
            return response()->json(['message' => 'Rol insuficiente'], 403);
        }

        return $next($request);
    }
}
