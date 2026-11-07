<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // CORS solo en el gateway: si MS6 tambien lo anade, el navegador recibe dos Access-Control-Allow-Origin y rechaza la respuesta.
        $middleware->remove(\Illuminate\Http\Middleware\HandleCors::class);
        $middleware->api(prepend: [\App\Http\Middleware\Correlation::class]);
        $middleware->alias([
            'keycloak.jwt' => \App\Http\Middleware\VerifyKeycloakJwt::class,
            'role' => \App\Http\Middleware\RequireRole::class,
            'idempotent' => \App\Http\Middleware\Idempotency::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        // Todos los errores de la API salen como problem+json (docs/api.md).
        $exceptions->render(function (\Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }
            if ($e instanceof \Illuminate\Validation\ValidationException) {
                $errores = [];
                foreach ($e->errors() as $campo => $mensajes) {
                    foreach ($mensajes as $m) {
                        $errores[] = ['campo' => $campo, 'mensaje' => $m];
                    }
                }

                return \App\Support\Problem::response(400, 'VALIDACION', 'Solicitud invalida', 'Hay campos que no cumplen las reglas', $errores);
            }
            if ($e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException || $e instanceof \Symfony\Component\HttpKernel\Exception\NotFoundHttpException) {
                return \App\Support\Problem::response(404, 'NO_ENCONTRADO', 'No encontrado', 'El recurso no existe');
            }
            if ($e instanceof \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface) {
                $status = $e->getStatusCode();

                return \App\Support\Problem::response($status, \App\Support\Problem::codeFor($status), $e->getMessage() ?: 'Error', $e->getMessage() ?: 'Error');
            }
            if ($e instanceof \Illuminate\Auth\AuthenticationException) {
                return \App\Support\Problem::response(401, 'NO_AUTENTICADO', 'No autenticado', 'Falta un token valido');
            }
            if (config('app.debug')) {
                return null; // en desarrollo se conserva la traza de Laravel
            }
            report($e);

            return \App\Support\Problem::response(500, 'ERROR_INTERNO', 'Error interno', 'Ocurrio un error inesperado');
        });
    })->create();
