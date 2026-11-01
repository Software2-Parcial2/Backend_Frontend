<?php

use App\Messaging\ProcessedMessages;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

function facturaBody(array $over = []): array
{
    return array_merge([
        'cita_id' => (string) Str::uuid(),
        'paciente_id' => (string) Str::uuid(),
        'monto' => 150.5,
    ], $over);
}

function postFactura(array $body, ?string $key, array $claims = []): Illuminate\Testing\TestResponse
{
    $headers = authHeaders($claims, $key ? ['Idempotency-Key' => $key] : []);

    return test()->postJson('/api/facturacion/facturas', $body, $headers);
}

describe('POST /api/facturacion/facturas con Idempotency-Key', function () {
    it('sin cabecera responde 400 problem+json', function () {
        postFactura(facturaBody(), null)->assertStatus(400)
            ->assertHeader('Content-Type', 'application/problem+json');
        expect(DB::table('facturas')->count())->toBe(0);
    });

    it('con una clave que no es UUID responde 400', function () {
        postFactura(facturaBody(), 'no-es-uuid')->assertStatus(400);
    });

    it('sin token responde 401 y no reserva la clave', function () {
        $this->postJson('/api/facturacion/facturas', facturaBody(), ['Idempotency-Key' => (string) Str::uuid()])->assertUnauthorized();
        expect(DB::table('idempotency_keys')->count())->toBe(0);
    });

    it('un rol sin permiso recibe 403 antes de reservar la clave', function () {
        postFactura(facturaBody(), (string) Str::uuid(), ['realm_access' => ['roles' => ['paciente']]])->assertForbidden();
        expect(DB::table('idempotency_keys')->count())->toBe(0);
    });

    it('crea la factura y escribe el outbox en la misma transaccion', function () {
        $body = facturaBody();
        $res = postFactura($body, (string) Str::uuid())->assertCreated();
        expect($res->json('estado'))->toBe('PENDIENTE');
        $outbox = DB::table('outbox')->where('aggregate_id', $res->json('id'))->first();
        expect($outbox->event_type)->toBe('factura.creada')->and($outbox->published_at)->toBeNull();
    });

    it('repetir la misma peticion devuelve la misma respuesta sin duplicar', function () {
        $key = (string) Str::uuid();
        $body = facturaBody();
        $first = postFactura($body, $key)->assertCreated();
        $again = postFactura($body, $key)->assertCreated()->assertHeader('Idempotent-Replay', 'true');
        expect($again->getContent())->toBe($first->getContent())
            ->and(DB::table('facturas')->count())->toBe(1)
            ->and(DB::table('outbox')->count())->toBe(1);
    });

    it('el orden de las claves del JSON no cambia la huella', function () {
        $key = (string) Str::uuid();
        $body = facturaBody();
        postFactura($body, $key)->assertCreated();
        postFactura(array_reverse($body, true), $key)->assertCreated()->assertHeader('Idempotent-Replay', 'true');
    });

    it('la misma clave con otro cuerpo responde 422', function () {
        $key = (string) Str::uuid();
        postFactura(facturaBody(), $key)->assertCreated();
        postFactura(facturaBody(), $key)->assertStatus(422)->assertHeader('Content-Type', 'application/problem+json');
        expect(DB::table('facturas')->count())->toBe(1);
    });

    it('la misma clave en PROCESANDO responde 409 con Retry-After', function () {
        $key = (string) Str::uuid();
        $body = facturaBody();
        // Simula una peticion en curso: la reserva existe y todavia no hay respuesta.
        $headers = authHeaders();
        $reserved = false;
        // Primera peticion normal para conocer el hash real, despues se devuelve la fila a PROCESANDO.
        $this->postJson('/api/facturacion/facturas', $body, $headers + ['Idempotency-Key' => $key])->assertCreated();
        DB::table('idempotency_keys')->update(['status' => 'PROCESANDO', 'response' => null]);
        postFactura($body, $key)->assertStatus(409)->assertHeader('Retry-After', '1');
    });

    it('una respuesta 4xx de validacion se guarda y se reproduce', function () {
        $key = (string) Str::uuid();
        $mala = facturaBody(['monto' => -5]);
        postFactura($mala, $key)->assertStatus(422);
        postFactura($mala, $key)->assertStatus(422)->assertHeader('Idempotent-Replay', 'true');
    });

    it('una clave vencida se puede reutilizar', function () {
        $key = (string) Str::uuid();
        $body = facturaBody();
        postFactura($body, $key)->assertCreated();
        DB::table('idempotency_keys')->update(['expires_at' => now()->subMinute()]);
        $again = postFactura($body, $key)->assertCreated();
        expect($again->headers->get('Idempotent-Replay'))->toBeNull()
            ->and(DB::table('facturas')->count())->toBe(2);
    });

    it('la clave esta acotada por usuario', function () {
        $key = (string) Str::uuid();
        $body = facturaBody();
        postFactura($body, $key, ['sub' => 'ana'])->assertCreated();
        $otro = postFactura($body, $key, ['sub' => 'luis'])->assertCreated();
        expect($otro->headers->get('Idempotent-Replay'))->toBeNull();
    });
});

describe('ProcessedMessages (deduplicacion de consumidores)', function () {
    it('descarta COMPLETADO, bloquea PROCESANDO y libera tras un fallo', function () {
        $id = (string) Str::uuid();
        expect(ProcessedMessages::tryBegin($id))->toBeTrue();
        expect(fn () => ProcessedMessages::tryBegin($id))->toThrow(RuntimeException::class); // en curso
        ProcessedMessages::complete($id);
        expect(ProcessedMessages::tryBegin($id))->toBeFalse(); // duplicado

        $otro = (string) Str::uuid();
        ProcessedMessages::tryBegin($otro);
        ProcessedMessages::release($otro);
        expect(ProcessedMessages::tryBegin($otro))->toBeTrue();
    });

    it('recupera el mensaje cuando vence el arrendamiento (consumidor muerto)', function () {
        $id = (string) Str::uuid();
        ProcessedMessages::tryBegin($id);
        DB::table('processed_messages')->where('id', $id)->update(['locked_until' => now()->subSeconds(5)]);
        expect(ProcessedMessages::tryBegin($id))->toBeTrue();
    });
});
