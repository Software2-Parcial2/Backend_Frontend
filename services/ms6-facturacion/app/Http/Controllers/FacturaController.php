<?php

namespace App\Http\Controllers;

use App\Http\Requests\CrearFacturaRequest;
use App\Http\Requests\IngresosRequest;
use App\Http\Requests\ListarFacturasRequest;
use App\Http\Resources\FacturaResource;
use App\Models\Factura;
use App\Support\Pagina;
use App\Support\Problem;
use Illuminate\Http\JsonResponse;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FacturaController extends Controller
{
    /**
     * El personal (caja, administrador, recepcion) ve todas; un paciente solo las suyas (claim paciente_id).
     * Paginacion por cursor (created_at desc, id desc): `?limite&cursor` -> `{items, siguiente}`.
     */
    public function index(ListarFacturasRequest $request): JsonResponse
    {
        $limite = (int) ($request->validated('limite') ?? 25);
        $query = Factura::query();
        $esPersonal = array_intersect(['caja', 'administrador', 'recepcion'], (array) $request->attributes->get('roles', [])) !== [];
        if (! $esPersonal) {
            $pacienteId = $request->attributes->get('paciente_id');
            if (! $pacienteId) {
                return Problem::response(403, 'PACIENTE_NO_VINCULADO', 'Acceso denegado', 'El usuario no esta vinculado a un paciente');
            }
            $query->where('paciente_id', $pacienteId);
        }

        if ($request->filled('cursor')) {
            $clave = Pagina::decode($request->validated('cursor'));
            if ($clave === null || ! isset($clave['c'], $clave['i'])) {
                return Problem::response(400, 'CURSOR_INVALIDO', 'Cursor invalido', 'El cursor no es valido');
            }
            $query->where(fn ($q) => $q->where('created_at', '<', $clave['c'])
                ->orWhere(fn ($q2) => $q2->where('created_at', '=', $clave['c'])->where('id', '<', $clave['i'])));
        }

        $filas = $query->orderByDesc('created_at')->orderByDesc('id')->limit($limite + 1)->get();
        $hayMas = $filas->count() > $limite;
        $items = $filas->take($limite);
        $ultima = $items->last();

        return response()->json([
            'items' => FacturaResource::collection($items)->resolve(),
            'siguiente' => $hayMas && $ultima ? Pagina::encode(['c' => $ultima->created_at->format('Y-m-d H:i:s.u'), 'i' => $ultima->id]) : null,
        ]);
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
            ->whereIn('estado', ['CONFIRMADA', 'PROVISIONAL'])
            ->selectRaw("to_char(date_trunc('{$unidad}', created_at), '{$formato}') as periodo")
            ->selectRaw("COALESCE(SUM(monto) FILTER (WHERE estado = 'CONFIRMADA'), 0) as confirmado")
            ->selectRaw("COALESCE(SUM(monto) FILTER (WHERE estado = 'PROVISIONAL'), 0) as provisional")
            ->selectRaw('COUNT(*) as facturas')
            ->groupBy('periodo')->orderBy('periodo')->get();

        return response()->json($filas->map(fn ($f) => [
            'periodo' => $f->periodo,
            'confirmado' => number_format((float) $f->confirmado, 2, '.', ''),
            'provisional' => number_format((float) $f->provisional, 2, '.', ''),
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
