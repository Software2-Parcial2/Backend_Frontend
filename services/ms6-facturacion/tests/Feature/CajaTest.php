<?php

use App\Messaging\PacienteEventsHandler;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Fase 3: pagos con comprobante, anulacion, movimientos y balance de caja, tarifario y nombres de paciente. */
function cargo(array $over = []): string
{
    $id = (string) Str::uuid();
    DB::table('facturas')->insert(array_merge([
        'id' => $id, 'cita_id' => (string) Str::uuid(), 'paciente_id' => (string) Str::uuid(), 'monto' => 180, 'estado' => 'PROVISIONAL',
        'especialidad' => 'cardiologia', 'fecha_cita' => now()->addDay(), 'created_at' => now(), 'updated_at' => now(),
    ], $over));

    return $id;
}

function pagar(string $id, array $body, array $claims = ['preferred_username' => 'jorge'], ?string $key = null)
{
    return test()->postJson("/api/facturacion/facturas/$id/pagos", $body, authHeaders($claims, ['Idempotency-Key' => $key ?? (string) Str::uuid()]));
}

function anularCargo(string $id, array $body, array $claims = [])
{
    return test()->postJson("/api/facturacion/facturas/$id/anular", $body, authHeaders($claims, ['Idempotency-Key' => (string) Str::uuid()]));
}

function eventosDe(string $facturaId): array
{
    return DB::table('outbox')->where('aggregate_id', $facturaId)->pluck('event_type')->all();
}

beforeEach(function () {
    \Illuminate\Support\Facades\Cache::store('file')->forget('keycloak.jwks');
});

describe('numero de cargo y datos de la cita', function () {
    it('la base asigna un n.° de cargo legible y unico', function () {
        $a = cargo();
        $b = cargo();
        $n = DB::table('facturas')->whereIn('id', [$a, $b])->pluck('numero_cargo')->all();
        expect($n[0])->toMatch('/^CG-\d{8}-\d{4}$/')->and($n[0])->not->toBe($n[1]);
    });

    it('la SAGA guarda la especialidad y la fecha de la cita en la factura', function () {
        $citaId = (string) Str::uuid();
        (new \App\Messaging\SagaCommandHandler)->handle([
            'id' => (string) Str::uuid(), 'type' => 'facturacion.cobro-provisional.solicitar', 'correlationId' => (string) Str::uuid(),
            'payload' => ['citaId' => $citaId, 'pacienteId' => (string) Str::uuid(), 'medicoId' => (string) Str::uuid(), 'especialidad' => 'General', 'fechaHora' => '2026-12-01T14:00:00.000Z'],
        ]);
        $f = DB::table('facturas')->where('cita_id', $citaId)->first();
        expect($f->especialidad)->toBe('general')->and(Carbon::parse($f->fecha_cita)->utc()->toIso8601String())->toBe('2026-12-01T14:00:00+00:00');
    });
});

describe('cobrar', function () {
    it('efectivo: calcula el cambio, emite comprobante, pasa a PAGADA y publica pago.registrado', function () {
        $id = cargo();
        $r = pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 200])->assertCreated();
        $r->assertJson(['pago' => ['metodo' => 'EFECTIVO', 'monto' => '180.00', 'recibido' => '200.00', 'cambio' => '20.00', 'cajero' => 'jorge'], 'factura' => ['estado' => 'PAGADA']]);
        expect($r->json('pago.comprobante'))->toMatch('/^CI-\d{6}$/')
            ->and($r->json('comprobante.aviso'))->toContain('No es una factura fiscal')
            ->and($r->headers->get('Location'))->toBe("/api/facturacion/facturas/$id/comprobante")
            ->and(eventosDe($id))->toContain('pago.registrado');
        $evento = json_decode(DB::table('outbox')->where('aggregate_id', $id)->where('event_type', 'pago.registrado')->value('payload'), true);
        expect($evento)->toMatchArray(['facturaId' => $id, 'monto' => '180.00', 'metodo' => 'EFECTIVO', 'comprobante' => $r->json('pago.comprobante')]);
    });

    it('transferencia y POS exigen la referencia; el efectivo exige lo recibido', function () {
        $id = cargo();
        pagar($id, ['metodo' => 'POS'])->assertStatus(400)->assertJsonPath('code', 'VALIDACION');
        pagar($id, ['metodo' => 'EFECTIVO'])->assertStatus(400);
        pagar($id, ['metodo' => 'CHEQUE'])->assertStatus(400);
        pagar($id, ['metodo' => 'TRANSFERENCIA', 'referencia' => 'OP-998877'])->assertCreated()->assertJsonPath('pago.recibido', null)->assertJsonPath('pago.referencia', 'OP-998877');
    });

    it('recibido menor al monto es 422 MONTO_INSUFICIENTE y no cobra nada', function () {
        $id = cargo();
        pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 100])->assertStatus(422)->assertJsonPath('code', 'MONTO_INSUFICIENTE');
        expect(DB::table('facturas')->where('id', $id)->value('estado'))->toBe('PROVISIONAL')->and(DB::table('pagos')->count())->toBe(0);
    });

    it('un cargo se cobra una sola vez y uno anulado no se cobra', function () {
        $id = cargo();
        pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 180])->assertCreated();
        pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 180])->assertStatus(409)->assertJsonPath('code', 'FACTURA_YA_PAGADA');
        $anulada = cargo(['estado' => 'ANULADA']);
        pagar($anulada, ['metodo' => 'EFECTIVO', 'recibido' => 180])->assertStatus(409)->assertJsonPath('code', 'FACTURA_ANULADA');
        pagar((string) Str::uuid(), ['metodo' => 'EFECTIVO', 'recibido' => 1])->assertNotFound()->assertJsonPath('code', 'FACTURA_NO_ENCONTRADA');
    });

    it('con la misma Idempotency-Key el cobro no se duplica (replay)', function () {
        $id = cargo();
        $key = (string) Str::uuid();
        $primero = pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 200], ['preferred_username' => 'jorge'], $key)->assertCreated();
        $replay = pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 200], ['preferred_username' => 'jorge'], $key)->assertCreated()->assertHeader('Idempotent-Replay', 'true');
        expect($replay->json('pago.id'))->toBe($primero->json('pago.id'))->and(DB::table('pagos')->count())->toBe(1);
    });

    it('solo caja y administrador cobran', function () {
        $id = cargo();
        foreach (['recepcion', 'paciente'] as $rol) {
            pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 180], ['realm_access' => ['roles' => [$rol]], 'paciente_id' => (string) Str::uuid()])->assertForbidden();
        }
        pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 180], ['realm_access' => ['roles' => ['administrador']]])->assertCreated();
    });

    it('el ledger registra la historia del cargo hasta PAGADA', function () {
        $id = cargo();
        pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 180])->assertCreated();
        $r = test()->getJson("/api/facturacion/facturas/$id", authHeaders())->assertOk();
        expect(array_column($r->json('movimientos'), 'estadoNuevo'))->toBe(['PROVISIONAL', 'PAGADA'])
            ->and($r->json('pago.comprobante'))->toMatch('/^CI-/');
    });
});

describe('anular', function () {
    it('anula con motivo sin borrar: conserva el registro, el ledger y publica factura.anulada', function () {
        $id = cargo();
        $r = anularCargo($id, ['motivo' => 'Cita cancelada por el paciente'], ['preferred_username' => 'jorge'])->assertOk();
        $r->assertJson(['estado' => 'ANULADA', 'motivoAnulacion' => 'Cita cancelada por el paciente']);
        expect(DB::table('facturas')->where('id', $id)->value('anulada_por'))->toBe('jorge');
        $evento = json_decode(DB::table('outbox')->where('event_type', 'factura.anulada')->where('aggregate_id', $id)->value('payload'), true);
        expect($evento)->toMatchArray(['motivo' => 'Cita cancelada por el paciente', 'estabaPagada' => false, 'monto' => '180.00']);
        expect(DB::table('factura_movimientos')->where('factura_id', $id)->pluck('estado_nuevo')->all())->toBe(['PROVISIONAL', 'ANULADA']);
    });

    it('anular un cargo ya cobrado lo marca y avisa que estaba pagado', function () {
        $id = cargo();
        pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 180])->assertCreated();
        anularCargo($id, ['motivo' => 'Error de caja'])->assertOk();
        $evento = json_decode(DB::table('outbox')->where('event_type', 'factura.anulada')->value('payload'), true);
        expect($evento['estabaPagada'])->toBeTrue();
        // el cobro sigue en pagos (trazabilidad) pero ya no cuenta en el balance
        expect(DB::table('pagos')->count())->toBe(1);
    });

    it('motivo obligatorio, no se anula dos veces y solo caja/administrador', function () {
        $id = cargo();
        anularCargo($id, ['motivo' => ''])->assertStatus(400)->assertJsonPath('code', 'VALIDACION');
        anularCargo($id, ['motivo' => 'x1'])->assertStatus(400);
        anularCargo($id, ['motivo' => 'Duplicado'], ['realm_access' => ['roles' => ['recepcion']]])->assertForbidden();
        anularCargo($id, ['motivo' => 'Duplicado'])->assertOk();
        anularCargo($id, ['motivo' => 'Otra vez'])->assertStatus(409)->assertJsonPath('code', 'FACTURA_YA_ANULADA');
    });

    it('la anulacion de la SAGA (cobro.anular) sobre un cargo ya anulado en caja responde bien', function () {
        $id = cargo();
        $cita = DB::table('facturas')->where('id', $id)->value('cita_id');
        anularCargo($id, ['motivo' => 'Manual'])->assertOk();
        (new \App\Messaging\SagaCommandHandler)->handle(['id' => (string) Str::uuid(), 'type' => 'facturacion.cobro.anular', 'correlationId' => (string) Str::uuid(), 'payload' => ['citaId' => $cita, 'facturaId' => $id, 'motivo' => 'cita cancelada']]);
        $respuesta = DB::table('outbox')->where('event_type', 'facturacion.cobro.anulado')->first();
        expect($respuesta)->not->toBeNull();
    });
});

describe('comprobante', function () {
    it('JSON con el paciente de la proyeccion; HTML imprimible y escapado; 404 si no hay cobro', function () {
        $pac = (string) Str::uuid();
        DB::table('pacientes_proyeccion')->insert(['paciente_id' => $pac, 'nombre' => 'Carla <b>Rojas</b>', 'numero_historia' => 'HC-004218']);
        $id = cargo(['paciente_id' => $pac]);
        test()->getJson("/api/facturacion/facturas/$id/comprobante", authHeaders())->assertNotFound()->assertJsonPath('code', 'COMPROBANTE_NO_ENCONTRADO');
        pagar($id, ['metodo' => 'POS', 'referencia' => 'POS-77'])->assertCreated();
        $json = test()->getJson("/api/facturacion/facturas/$id/comprobante", authHeaders())->assertOk();
        $json->assertJson(['paciente' => ['nombre' => 'Carla <b>Rojas</b>', 'numeroHistoria' => 'HC-004218'], 'total' => '180.00', 'metodo' => 'POS', 'referencia' => 'POS-77', 'concepto' => 'Consulta de cardiologia']);
        $html = test()->get("/api/facturacion/facturas/$id/comprobante?formato=html", authHeaders())->assertOk();
        expect($html->headers->get('Content-Type'))->toContain('text/html')
            ->and($html->getContent())->toContain('Carla &lt;b&gt;Rojas&lt;/b&gt;')->not->toContain('<b>Rojas</b>')->toContain('No es una factura fiscal');
    });

    it('un paciente ve solo el comprobante de su cargo (404 el ajeno)', function () {
        $yo = (string) Str::uuid();
        $propio = cargo(['paciente_id' => $yo]);
        $ajeno = cargo();
        pagar($propio, ['metodo' => 'EFECTIVO', 'recibido' => 180])->assertCreated();
        pagar($ajeno, ['metodo' => 'EFECTIVO', 'recibido' => 180])->assertCreated();
        $pac = ['realm_access' => ['roles' => ['paciente']], 'paciente_id' => $yo];
        test()->getJson("/api/facturacion/facturas/$propio/comprobante", authHeaders($pac))->assertOk();
        test()->getJson("/api/facturacion/facturas/$ajeno/comprobante", authHeaders($pac))->assertNotFound();
        test()->getJson("/api/facturacion/facturas/$ajeno", authHeaders($pac))->assertNotFound();
    });
});

describe('listado con filtros', function () {
    it('filtra por estado, porCobrar, texto (n.° de cargo y nombre) y cita', function () {
        $pac = (string) Str::uuid();
        DB::table('pacientes_proyeccion')->insert(['paciente_id' => $pac, 'nombre' => 'Wilma Justiniano']);
        $a = cargo(['paciente_id' => $pac]);
        $b = cargo(['estado' => 'CONFIRMADA']);
        $c = cargo();
        pagar($c, ['metodo' => 'EFECTIVO', 'recibido' => 180]);
        $ids = fn ($qs) => collect(test()->getJson("/api/facturacion/facturas?$qs", authHeaders())->assertOk()->json('items'))->pluck('id')->all();
        expect($ids('porCobrar=1'))->toEqualCanonicalizing([$a, $b])
            ->and($ids('porCobrar=true'))->toEqualCanonicalizing([$a, $b])
            ->and($ids('porCobrar=false'))->toEqualCanonicalizing([$a, $b, $c])
            ->and($ids('estado=PAGADA'))->toBe([$c])
            ->and($ids('estado=PROVISIONAL,CONFIRMADA'))->toEqualCanonicalizing([$a, $b])
            ->and($ids('q=wilma'))->toBe([$a])
            ->and($ids('q='.strtolower(DB::table('facturas')->where('id', $b)->value('numero_cargo'))))->toBe([$b]);
        $item = collect(test()->getJson('/api/facturacion/facturas?q=wilma', authHeaders())->json('items'))->first();
        expect($item)->toMatchArray(['pacienteNombre' => 'Wilma Justiniano', 'especialidad' => 'cardiologia']);
        test()->getJson('/api/facturacion/facturas?estado=XX', authHeaders())->assertStatus(400)->assertJsonPath('code', 'VALIDACION');
    });
});

describe('movimientos y balance del dia', function () {
    $hoy = fn () => now(config('facturacion.zona_horaria'))->toDateString();

    it('suma lo cobrado por metodo, cuenta anulaciones y lista pendientes; las anulaciones restan del cobrado', function () use ($hoy) {
        $pac = (string) Str::uuid();
        DB::table('pacientes_proyeccion')->insert(['paciente_id' => $pac, 'nombre' => 'Carla Rojas']);
        $efectivo = cargo(['paciente_id' => $pac, 'monto' => 180]);
        $pos = cargo(['monto' => 120]);
        $transf = cargo(['monto' => 140]);
        $mal = cargo(['monto' => 99]);
        $sinCobrar = cargo(['monto' => 60]);
        $nuncaCobrada = cargo(['monto' => 50]);
        pagar($efectivo, ['metodo' => 'EFECTIVO', 'recibido' => 200])->assertCreated();
        pagar($pos, ['metodo' => 'POS', 'referencia' => 'P1'])->assertCreated();
        pagar($transf, ['metodo' => 'TRANSFERENCIA', 'referencia' => 'T1'])->assertCreated();
        pagar($mal, ['metodo' => 'EFECTIVO', 'recibido' => 99])->assertCreated();
        anularCargo($mal, ['motivo' => 'Cita cancelada'])->assertOk();
        anularCargo($nuncaCobrada, ['motivo' => 'Duplicado'])->assertOk();

        $b = test()->getJson('/api/facturacion/balance?fecha='.$hoy(), authHeaders())->assertOk();
        $b->assertJson(['totalCobrado' => '440.00', 'porMetodo' => ['EFECTIVO' => '180.00', 'POS' => '120.00', 'TRANSFERENCIA' => '140.00'], 'cobros' => 3, 'anulaciones' => 2, 'pendiente' => ['monto' => '60.00', 'cargos' => 1]]);

        $m = test()->getJson('/api/facturacion/movimientos?fecha='.$hoy(), authHeaders())->assertOk();
        expect($m->json('items'))->toHaveCount(5);
        $porEstado = collect($m->json('items'))->groupBy('estado')->map->count()->all();
        expect($porEstado)->toBe(['PAGADO' => 3, 'ANULADO' => 2]);
        $carla = collect($m->json('items'))->firstWhere('facturaId', $efectivo);
        expect($carla)->toMatchArray(['paciente' => ['id' => $pac, 'nombre' => 'Carla Rojas'], 'metodo' => 'EFECTIVO', 'monto' => '180.00', 'estado' => 'PAGADO']);
        expect($carla['comprobante'])->toMatch('/^CI-/')->and($carla['hora'])->toMatch('/^\d{2}:\d{2}$/');
        $anulado = collect($m->json('items'))->firstWhere('facturaId', $mal);
        expect($anulado)->toMatchArray(['estado' => 'ANULADO', 'motivo' => 'Cita cancelada'])->and($anulado['comprobante'])->not->toBeNull();
        expect(collect($m->json('items'))->firstWhere('facturaId', $nuncaCobrada))->toMatchArray(['comprobante' => null, 'metodo' => null, 'estado' => 'ANULADO']);
        expect(test()->getJson('/api/facturacion/movimientos?tipo=cobros&fecha='.$hoy(), authHeaders())->json('items'))->toHaveCount(3)
            ->and(test()->getJson('/api/facturacion/movimientos?tipo=anulaciones&fecha='.$hoy(), authHeaders())->json('items'))->toHaveCount(2)
            ->and(test()->getJson('/api/facturacion/movimientos?metodo=POS&fecha='.$hoy(), authHeaders())->json('items'))->toHaveCount(1);
        unset($sinCobrar);
    });

    it('otro dia no ve estos movimientos; el turno separa manana y tarde segun la hora local', function () use ($hoy) {
        $id = cargo(['monto' => 10]);
        pagar($id, ['metodo' => 'EFECTIVO', 'recibido' => 10])->assertCreated();
        DB::table('pagos')->where('factura_id', $id)->update(['pagado_en' => Carbon::parse($hoy().' 09:30:00', config('facturacion.zona_horaria'))->utc()]);
        $items = fn ($qs) => test()->getJson("/api/facturacion/movimientos?fecha={$hoy()}&$qs", authHeaders())->assertOk()->json('items');
        expect($items('turno=manana'))->toHaveCount(1)->and($items('turno=tarde'))->toHaveCount(0)->and($items('turno=manana')[0]['hora'])->toBe('09:30');
        expect(test()->getJson('/api/facturacion/balance?turno=tarde&fecha='.$hoy(), authHeaders())->json('totalCobrado'))->toBe('0.00');
        expect(test()->getJson('/api/facturacion/movimientos?fecha=2020-01-01', authHeaders())->json('items'))->toBeEmpty();
        test()->getJson('/api/facturacion/movimientos?fecha=01-01-2020', authHeaders())->assertStatus(400);
        test()->getJson('/api/facturacion/balance?turno=noche', authHeaders())->assertStatus(400);
    });

    it('solo caja y administrador ven la caja', function () use ($hoy) {
        foreach (['/api/facturacion/movimientos', '/api/facturacion/balance'] as $url) {
            test()->getJson($url, authHeaders(['realm_access' => ['roles' => ['recepcion']]]))->assertForbidden();
            test()->getJson($url, authHeaders(['realm_access' => ['roles' => ['administrador']]]))->assertOk();
        }
    });
});

describe('tarifario', function () {
    $nueva = fn (array $b, array $claims = ['realm_access' => ['roles' => ['administrador']]]) => test()->postJson('/api/facturacion/tarifas', $b, authHeaders($claims, ['Idempotency-Key' => (string) Str::uuid()]));

    it('crear una tarifa futura cierra la vigente y respeta los cargos ya emitidos', function () use ($nueva) {
        $hoy = now(config('facturacion.zona_horaria'))->toDateString();
        DB::table('tarifas')->insert(['id' => (string) Str::uuid(), 'especialidad' => 'cardiologia', 'monto' => 180, 'vigente_desde' => '2026-01-01']);
        $emitido = cargo(['monto' => 180]);
        $futuro = now(config('facturacion.zona_horaria'))->addDays(30)->toDateString();
        $r = $nueva(['especialidad' => 'cardiologia', 'monto' => 190, 'vigenteDesde' => $futuro, 'nombre' => 'Cardiologia'])->assertCreated();
        $r->assertJson(['monto' => '190.00', 'estado' => 'PROGRAMADA', 'vigenteHasta' => null, 'nombre' => 'Cardiologia']);
        $lista = collect(test()->getJson('/api/facturacion/tarifas?especialidad=cardiologia', authHeaders())->json('items'));
        expect($lista->pluck('estado')->all())->toBe(['PROGRAMADA', 'VIGENTE'])
            ->and($lista->firstWhere('estado', 'VIGENTE')['vigenteHasta'])->toBe($futuro);
        // hoy rige la vieja y el cargo emitido no cambia
        expect(DB::table('facturas')->where('id', $emitido)->value('monto'))->toEqual(180);
        expect(test()->getJson('/api/facturacion/tarifas?soloVigentes=1', authHeaders())->json('items.0.monto'))->toBe('180.00');
        unset($hoy);
    });

    it('no admite vigencia pasada, repetida, ni roles sin permiso; valida el codigo y el monto', function () use ($nueva) {
        $nueva(['especialidad' => 'neumologia', 'monto' => 160, 'vigenteDesde' => '2020-01-01'])->assertStatus(422)->assertJsonPath('code', 'VIGENCIA_PASADA');
        $fecha = now(config('facturacion.zona_horaria'))->addDays(5)->toDateString();
        $nueva(['especialidad' => 'neumologia', 'monto' => 160, 'vigenteDesde' => $fecha])->assertCreated();
        $nueva(['especialidad' => 'neumologia', 'monto' => 170, 'vigenteDesde' => $fecha])->assertStatus(409)->assertJsonPath('code', 'TARIFA_DUPLICADA');
        $nueva(['especialidad' => 'Mal Codigo', 'monto' => 0, 'vigenteDesde' => $fecha])->assertStatus(400)->assertJsonPath('code', 'VALIDACION');
        $nueva(['especialidad' => 'x', 'monto' => 10, 'vigenteDesde' => $fecha], ['realm_access' => ['roles' => ['caja']]])->assertForbidden();
        test()->getJson('/api/facturacion/tarifas', authHeaders(['realm_access' => ['roles' => ['paciente']], 'paciente_id' => (string) Str::uuid()]))->assertForbidden();
        test()->getJson('/api/facturacion/tarifas', authHeaders(['realm_access' => ['roles' => ['recepcion']]]))->assertOk();
    });

    it('solo se corrige una tarifa programada; la que ya rige no se edita', function () use ($nueva) {
        $rige = (string) Str::uuid();
        DB::table('tarifas')->insert(['id' => $rige, 'especialidad' => 'pediatria', 'monto' => 140, 'vigente_desde' => '2026-01-01']);
        $adm = ['realm_access' => ['roles' => ['administrador']]];
        $h = fn () => authHeaders($adm, ['Idempotency-Key' => (string) Str::uuid()]);
        test()->putJson("/api/facturacion/tarifas/$rige", ['monto' => 150], $h())->assertStatus(422)->assertJsonPath('code', 'TARIFA_NO_EDITABLE');
        $prog = $nueva(['especialidad' => 'pediatria', 'monto' => 150, 'vigenteDesde' => now(config('facturacion.zona_horaria'))->addDays(10)->toDateString()])->json('id');
        test()->putJson("/api/facturacion/tarifas/$prog", ['monto' => 155], $h())->assertOk()->assertJsonPath('monto', '155.00');
        test()->putJson('/api/facturacion/tarifas/'.Str::uuid(), ['monto' => 1], $h())->assertNotFound();
    });

    it('la SAGA usa la tarifa vigente de la tabla', function () {
        DB::table('tarifas')->insert(['id' => (string) Str::uuid(), 'especialidad' => 'traumatologia', 'monto' => 170, 'vigente_desde' => '2026-01-01']);
        $citaId = (string) Str::uuid();
        (new \App\Messaging\SagaCommandHandler)->handle(['id' => (string) Str::uuid(), 'type' => 'facturacion.cobro-provisional.solicitar', 'correlationId' => (string) Str::uuid(),
            'payload' => ['citaId' => $citaId, 'pacienteId' => (string) Str::uuid(), 'medicoId' => (string) Str::uuid(), 'especialidad' => 'traumatologia', 'fechaHora' => '2026-12-01T14:00:00Z']]);
        expect((float) DB::table('facturas')->where('cita_id', $citaId)->value('monto'))->toBe(170.0);
    });
});

describe('proyeccion de pacientes (eventos de MS2)', function () {
    function evento(string $tipo, string $id, string $nombre, string $ocurrido, ?string $hc = 'HC-000001'): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $tipo, 'occurredAt' => $ocurrido, 'correlationId' => $id, 'causationId' => null, 'version' => 1,
            'payload' => ['pacienteId' => $id, 'nombre' => $nombre, 'documento' => 'X'] + ($hc ? ['numeroHistoria' => $hc] : [])];
    }

    it('guarda el nombre y no deja que un evento viejo pise a uno nuevo', function () {
        $id = (string) Str::uuid();
        $h = new PacienteEventsHandler;
        $h->handle(evento('paciente.creado', $id, 'Carla Rojas', '2026-11-01T10:00:00.000Z'));
        $h->handle(evento('paciente.actualizado', $id, 'Carla Rojas Vaca', '2026-11-02T10:00:00.000Z'));
        $h->handle(evento('paciente.creado', $id, 'Nombre viejo', '2026-11-01T10:00:00.000Z', null)); // llega tarde
        $f = DB::table('pacientes_proyeccion')->where('paciente_id', $id)->first();
        expect($f->nombre)->toBe('Carla Rojas Vaca')->and($f->numero_historia)->toBe('HC-000001');
    });

    it('ignora los eventos que no son de paciente', function () {
        (new PacienteEventsHandler)->handle(['type' => 'cita.confirmada', 'payload' => []]);
        expect(DB::table('pacientes_proyeccion')->count())->toBe(0);
    });
});
