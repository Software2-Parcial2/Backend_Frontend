<?php

namespace App\Http\Controllers;

use App\Http\Requests\AnularFacturaRequest;
use App\Http\Requests\CrearFacturaRequest;
use App\Http\Requests\IngresosRequest;
use App\Http\Requests\ListarFacturasRequest;
use App\Http\Requests\PagarFacturaRequest;
use App\Http\Resources\FacturaResource;
use App\Http\Resources\PagoResource;
use App\Models\Factura;
use App\Models\Pago;
use App\Support\Caja;
use App\Support\Pagina;
use App\Support\Problem;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FacturaController extends Controller
{
    private const PERSONAL = ['caja', 'administrador', 'recepcion'];

    private static function esPersonal(Request $request): bool
    {
        return array_intersect(self::PERSONAL, (array) $request->attributes->get('roles', [])) !== [];
    }

    /** Facturas con el nombre del paciente (proyeccion de MS2), listas para serializar. */
    private function consulta()
    {
        return Factura::query()
            ->leftJoin('pacientes_proyeccion as pp', 'pp.paciente_id', '=', 'facturas.paciente_id')
            ->select('facturas.*', 'pp.nombre as paciente_nombre');
    }

    /**
     * El personal (caja, administrador, recepcion) ve todas; un paciente solo las suyas (claim paciente_id).
     * Paginacion por cursor (created_at desc, id desc): `?limite&cursor` -> `{items, siguiente}`.
     * Filtros: `estado` (lista), `porCobrar`, `desde`/`hasta` (dia local), `q` (n.° de cargo o nombre del paciente), `citaId`, `pacienteId`.
     */
    public function index(ListarFacturasRequest $request): JsonResponse
    {
        $limite = (int) ($request->validated('limite') ?? 25);
        $query = $this->consulta();
        if (! self::esPersonal($request)) {
            $pacienteId = $request->attributes->get('paciente_id');
            if (! $pacienteId) {
                return Problem::response(403, 'PACIENTE_NO_VINCULADO', 'Acceso denegado', 'El usuario no esta vinculado a un paciente');
            }
            $query->where('facturas.paciente_id', $pacienteId);
        } elseif ($request->filled('pacienteId')) {
            $query->where('facturas.paciente_id', $request->validated('pacienteId'));
        }
        if ($request->filled('citaId')) {
            $query->where('facturas.cita_id', $request->validated('citaId'));
        }
        if ($request->boolean('porCobrar')) {
            $query->whereIn('facturas.estado', Factura::COBRABLES);
        } elseif ($request->filled('estado')) {
            $query->whereIn('facturas.estado', explode(',', $request->validated('estado')));
        }
        if ($request->filled('desde')) {
            $query->where('facturas.created_at', '>=', Caja::rangoDelDia($request->validated('desde'))[0]);
        }
        if ($request->filled('hasta')) {
            $query->where('facturas.created_at', '<', Caja::rangoDelDia($request->validated('hasta'))[1]);
        }
        if ($request->filled('q')) {
            $q = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], mb_strtolower($request->validated('q'))).'%';
            $query->where(fn ($w) => $w->whereRaw('lower(facturas.numero_cargo) like ?', [$q])->orWhereRaw('lower(pp.nombre) like ?', [$q]));
        }

        if ($request->filled('cursor')) {
            $clave = Pagina::decode($request->validated('cursor'));
            if ($clave === null || ! isset($clave['c'], $clave['i'])) {
                return Problem::response(400, 'CURSOR_INVALIDO', 'Cursor invalido', 'El cursor no es valido');
            }
            $query->where(fn ($q) => $q->where('facturas.created_at', '<', $clave['c'])
                ->orWhere(fn ($q2) => $q2->where('facturas.created_at', '=', $clave['c'])->where('facturas.id', '<', $clave['i'])));
        }

        $filas = $query->orderByDesc('facturas.created_at')->orderByDesc('facturas.id')->limit($limite + 1)->get();
        $hayMas = $filas->count() > $limite;
        $items = $filas->take($limite);
        $ultima = $items->last();

        return response()->json([
            'items' => FacturaResource::collection($items)->resolve(),
            'siguiente' => $hayMas && $ultima ? Pagina::encode(['c' => $ultima->created_at->format('Y-m-d H:i:s.u'), 'i' => $ultima->id]) : null,
        ]);
    }

    /** Detalle de una factura con su pago (si lo hay) y su ledger de movimientos. Un paciente solo ve las suyas (404 si es ajena). */
    public function show(Request $request, string $factura): JsonResponse
    {
        $f = $this->visible($request, $factura);
        if ($f instanceof JsonResponse) {
            return $f;
        }
        $f->load('pago');
        $movimientos = DB::table('factura_movimientos')->where('factura_id', $f->id)->orderBy('ocurrido_en')->orderBy('id')->get()
            ->map(fn ($m) => [
                'estadoAnterior' => $m->estado_anterior,
                'estadoNuevo' => $m->estado_nuevo,
                'monto' => Caja::dinero($m->monto),
                'ocurridoEn' => Caja::iso($m->ocurrido_en),
            ])->values();

        return response()->json(array_merge(
            (new FacturaResource($f))->resolve(),
            ['pago' => $f->pago ? (new PagoResource($f->pago))->resolve() : null, 'movimientos' => $movimientos],
        ));
    }

    /**
     * Cobra un cargo en caja (caja y administrador). Efectivo: `recibido` >= monto (el cambio se calcula); transferencia y POS:
     * `referencia`. Un cargo se cobra una sola vez. Escribe `pago.registrado` en el outbox en la misma transaccion.
     */
    public function pagar(PagarFacturaRequest $request, string $factura): JsonResponse
    {
        $d = $request->validated();
        $cajero = $request->attributes->get('username') ?? $request->attributes->get('user_id') ?? 'desconocido';

        $resultado = DB::transaction(function () use ($factura, $d, $cajero) {
            $f = Factura::query()->whereKey($factura)->lockForUpdate()->first();
            if ($f === null) {
                return Problem::response(404, 'FACTURA_NO_ENCONTRADA', 'No encontrado', "No existe la factura $factura");
            }
            if ($f->estado === 'ANULADA') {
                return Problem::response(409, 'FACTURA_ANULADA', 'Conflicto', 'El cargo esta anulado y no se puede cobrar');
            }
            if ($f->estado === 'PAGADA') {
                return Problem::response(409, 'FACTURA_YA_PAGADA', 'Conflicto', 'El cargo ya fue cobrado');
            }
            if (! in_array($f->estado, Factura::COBRABLES, true)) {
                return Problem::response(409, 'FACTURA_NO_COBRABLE', 'Conflicto', "El cargo esta {$f->estado} y no se puede cobrar");
            }
            $monto = (float) $f->monto;
            $recibido = $d['metodo'] === 'EFECTIVO' ? (float) $d['recibido'] : null;
            if ($recibido !== null && round($recibido, 2) < round($monto, 2)) {
                return Problem::response(422, 'MONTO_INSUFICIENTE', 'Regla de negocio incumplida', 'El monto recibido no alcanza para cubrir el cargo');
            }
            $pago = Pago::create([
                'factura_id' => $f->id,
                'metodo' => $d['metodo'],
                'monto' => $monto,
                'recibido' => $recibido,
                'cambio' => $recibido === null ? 0 : round($recibido - $monto, 2),
                'referencia' => $d['referencia'] ?? null,
                'cajero' => $cajero,
            ])->refresh();
            $f->update(['estado' => 'PAGADA']);
            Caja::evento('pago.registrado', $f->id, [
                'pagoId' => $pago->id,
                'facturaId' => $f->id,
                'citaId' => $f->cita_id,
                'pacienteId' => $f->paciente_id,
                'monto' => Caja::dinero($monto),
                'metodo' => $pago->metodo,
                'comprobante' => $pago->comprobante_numero,
            ]);

            return [$f->refresh(), $pago];
        });

        if ($resultado instanceof JsonResponse) {
            return $resultado;
        }
        [$f, $pago] = $resultado;

        return response()->json([
            'pago' => (new PagoResource($pago))->resolve(),
            'factura' => (new FacturaResource($f))->resolve(),
            'comprobante' => $this->datosComprobante($f, $pago),
        ], 201)->header('Location', '/api/facturacion/facturas/'.$f->id.'/comprobante');
    }

    /**
     * Anula un cargo con su motivo (caja y administrador). El registro NO se borra: queda ANULADA, con motivo, usuario y hora, y el
     * ledger conserva su historia. Publica `factura.anulada`.
     */
    public function anular(AnularFacturaRequest $request, string $factura): JsonResponse
    {
        $motivo = trim($request->validated('motivo'));
        $usuario = $request->attributes->get('username') ?? $request->attributes->get('user_id') ?? 'desconocido';

        $resultado = DB::transaction(function () use ($factura, $motivo, $usuario) {
            $f = Factura::query()->whereKey($factura)->lockForUpdate()->first();
            if ($f === null) {
                return Problem::response(404, 'FACTURA_NO_ENCONTRADA', 'No encontrado', "No existe la factura $factura");
            }
            if ($f->estado === 'ANULADA') {
                return Problem::response(409, 'FACTURA_YA_ANULADA', 'Conflicto', 'El cargo ya esta anulado');
            }
            $estabaPagada = $f->estado === 'PAGADA';
            $f->update(['estado' => 'ANULADA', 'motivo_anulacion' => $motivo, 'anulada_por' => $usuario, 'anulada_en' => now()]);
            Caja::evento('factura.anulada', $f->id, [
                'facturaId' => $f->id,
                'citaId' => $f->cita_id,
                'pacienteId' => $f->paciente_id,
                'monto' => Caja::dinero($f->monto),
                'motivo' => $motivo,
                'estabaPagada' => $estabaPagada,
            ]);

            return $f->refresh();
        });

        return $resultado instanceof JsonResponse ? $resultado : (new FacturaResource($resultado))->response();
    }

    /**
     * Comprobante interno de un cobro (administrativo: NO es una factura fiscal). JSON por defecto; con `?formato=html` (o
     * `Accept: text/html`) devuelve una pagina lista para imprimir.
     */
    public function comprobante(Request $request, string $factura)
    {
        $f = $this->visible($request, $factura);
        if ($f instanceof JsonResponse) {
            return $f;
        }
        $pago = $f->pago;
        if ($pago === null) {
            return Problem::response(404, 'COMPROBANTE_NO_ENCONTRADO', 'No encontrado', 'El cargo todavia no tiene un cobro registrado');
        }
        $datos = $this->datosComprobante($f, $pago);
        if ($request->query('formato') === 'html' || str_contains((string) $request->header('Accept'), 'text/html')) {
            return (new Response($this->html($datos), 200))->header('Content-Type', 'text/html; charset=UTF-8');
        }

        return response()->json($datos);
    }

    /** @return array<string, mixed> */
    private function datosComprobante(Factura $f, Pago $pago): array
    {
        $paciente = DB::table('pacientes_proyeccion')->where('paciente_id', $f->paciente_id)->first();
        $nombreTarifa = $f->especialidad ? DB::table('tarifas')->where('especialidad', $f->especialidad)->orderByDesc('vigente_desde')->value('nombre') : null;
        $concepto = $nombreTarifa ?? ($f->especialidad ? 'Consulta de '.str_replace('_', ' ', $f->especialidad) : 'Atencion en clinica');

        return [
            'numero' => $pago->comprobante_numero,
            'emitidoEn' => Caja::iso($pago->pagado_en),
            'cargo' => $f->numero_cargo,
            'facturaId' => $f->id,
            'paciente' => ['id' => $f->paciente_id, 'nombre' => $paciente->nombre ?? null, 'numeroHistoria' => $paciente->numero_historia ?? null],
            'concepto' => $concepto,
            'fechaCita' => Caja::iso($f->fecha_cita),
            'metodo' => $pago->metodo,
            'referencia' => $pago->referencia,
            'total' => Caja::dinero($pago->monto),
            'recibido' => $pago->recibido === null ? null : Caja::dinero($pago->recibido),
            'cambio' => Caja::dinero($pago->cambio),
            'moneda' => trim($f->moneda),
            'cajero' => $pago->cajero,
            'anulado' => $f->estado === 'ANULADA',
            'aviso' => 'Comprobante administrativo de caja. No es una factura fiscal.',
        ];
    }

    /** @param array<string, mixed> $d */
    private function html(array $d): string
    {
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
        $fila = fn ($k, $v) => '<tr><th>'.$e($k).'</th><td>'.$e($v).'</td></tr>';
        $fecha = Caja::hora($d['emitidoEn']);
        $cuerpo = $fila('Paciente', $d['paciente']['nombre'] ?? '—')
            .$fila('Concepto', $d['concepto'])
            .$fila('Cargo', $d['cargo'])
            .$fila('Metodo', $d['metodo'].($d['referencia'] ? ' · '.$d['referencia'] : ''))
            .$fila('Total cobrado', $d['moneda'].' '.$d['total'])
            .($d['recibido'] !== null ? $fila('Recibido', $d['moneda'].' '.$d['recibido']).$fila('Cambio', $d['moneda'].' '.$d['cambio']) : '')
            .$fila('Cajero', $d['cajero']);
        $anulado = $d['anulado'] ? '<p class="anulado">CARGO ANULADO</p>' : '';

        return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comprobante '.$e($d['numero']).'</title>'
            .'<style>body{font:14px system-ui,sans-serif;max-width:420px;margin:24px auto;color:#12212B}h1{font-size:18px;margin:0}'
            .'table{width:100%;border-collapse:collapse;margin:16px 0}th{text-align:left;color:#5A6B75;font-weight:500;padding:6px 0}td{text-align:right;font-weight:600}'
            .'.anulado{color:#A5251C;font-weight:700}.aviso{color:#5A6B75;font-size:12px}</style></head><body>'
            .'<h1>Clinica Medica Santa Cruz</h1><p>Comprobante interno N.° '.$e($d['numero']).' · '.$e($d['emitidoEn']).' ('.$e($fecha).' hora local)</p>'
            .$anulado.'<table>'.$cuerpo.'</table><p class="aviso">'.$e($d['aviso']).'</p></body></html>';
    }

    /** La factura si el usuario puede verla; si no, la respuesta de error (404 para un paciente ajeno: no revela que existe). */
    private function visible(Request $request, string $id): Factura|JsonResponse
    {
        $f = $this->consulta()->where('facturas.id', $id)->first();
        $propia = ! self::esPersonal($request) && $f !== null && $f->paciente_id === $request->attributes->get('paciente_id');
        if ($f === null || (! self::esPersonal($request) && ! $propia)) {
            return Problem::response(404, 'FACTURA_NO_ENCONTRADA', 'No encontrado', "No existe la factura $id");
        }

        return $f;
    }

    /**
     * Ingresos agregados por periodo (dia|mes) entre `desde` y `hasta` (fechas AAAA-MM-DD, maximo 366 dias). Solo personal de gestion.
     * `confirmado` suma las facturas CONFIRMADA; `provisional` las PROVISIONAL (aun sin confirmar); las ANULADA y PENDIENTE no cuentan.
     */
    public function ingresos(IngresosRequest $request): JsonResponse
    {
        $data = $request->validated();
        $desde = \Carbon\Carbon::parse($data['desde'])->startOfDay();
        $hasta = \Carbon\Carbon::parse($data['hasta'])->endOfDay();
        if ($desde->diffInDays($hasta) > 366) {
            return Problem::response(422, 'RANGO_EXCEDIDO', 'Rango demasiado grande', 'El rango maximo es de 366 dias');
        }
        $unidad = ($data['agrupar'] ?? 'mes') === 'dia' ? 'day' : 'month';
        $formato = $unidad === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';

        $filas = Factura::query()
            ->whereBetween('created_at', [$desde, $hasta])
            ->whereIn('estado', ['CONFIRMADA', 'PROVISIONAL', 'PAGADA'])
            ->selectRaw("to_char(date_trunc('{$unidad}', created_at), '{$formato}') as periodo")
            ->selectRaw("COALESCE(SUM(monto) FILTER (WHERE estado IN ('CONFIRMADA', 'PAGADA')), 0) as confirmado")
            ->selectRaw("COALESCE(SUM(monto) FILTER (WHERE estado = 'PROVISIONAL'), 0) as provisional")
            ->selectRaw('COUNT(*) as facturas')
            ->groupBy('periodo')->orderBy('periodo')->get();

        return response()->json($filas->map(fn ($f) => [
            'periodo' => $f->periodo,
            'confirmado' => Caja::dinero($f->confirmado),
            'provisional' => Caja::dinero($f->provisional),
            'moneda' => 'BOB',
            'facturas' => (int) $f->facturas,
        ])->values());
    }

    /** Crea una factura PENDIENTE y escribe el evento en el outbox en la misma transaccion. */
    public function store(CrearFacturaRequest $request): JsonResponse
    {
        $d = $request->validated();
        try {
            $factura = $this->crear(['cita_id' => $d['citaId'], 'paciente_id' => $d['pacienteId'], 'monto' => $d['monto']]);
        } catch (UniqueConstraintViolationException) {
            // Un solo cobro vigente por cita (indice unico parcial).
            return Problem::response(409, 'COBRO_VIGENTE_EXISTENTE', 'Cobro duplicado', 'Ya existe un cobro vigente para esta cita');
        }

        return (new FacturaResource($factura->refresh()))->response()->setStatusCode(201)
            ->header('Location', '/api/facturacion/facturas/'.$factura->id);
    }

    private function crear(array $data): Factura
    {
        return DB::transaction(function () use ($data) {
            $factura = Factura::create($data + ['estado' => 'PENDIENTE']);
            DB::table('outbox')->insert([
                'id' => (string) Str::uuid(),
                'aggregate_type' => 'Factura',
                'aggregate_id' => $factura->id,
                'event_type' => 'factura.creada',
                'payload' => json_encode([
                    'facturaId' => $factura->id,
                    'citaId' => $factura->cita_id,
                    'pacienteId' => $factura->paciente_id,
                    'monto' => (float) $factura->monto,
                    'estado' => $factura->estado,
                ], JSON_THROW_ON_ERROR),
                'created_at' => now(),
            ]);

            return $factura;
        });
    }
}
