<?php

namespace App\Http\Controllers;

use App\Models\Factura;
use Illuminate\Http\JsonResponse;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FacturaController extends Controller
{
    /** El personal (caja, administrador, recepcion) ve todas; un paciente solo las suyas (claim paciente_id). */
    public function index(Request $request): JsonResponse
    {
        $query = Factura::query()->orderByDesc('created_at')->limit(100);
        $esPersonal = array_intersect(['caja', 'administrador', 'recepcion'], (array) $request->attributes->get('roles', [])) !== [];
        if (! $esPersonal) {
            $pacienteId = $request->attributes->get('paciente_id');
            if (! $pacienteId) {
                return response()->json(['message' => 'El usuario no esta vinculado a un paciente'], 403);
            }
            $query->where('paciente_id', $pacienteId);
        }

        return response()->json($query->get());
    }

    /**
     * Ingresos agregados por periodo (dia|mes) entre `desde` y `hasta` (fechas AAAA-MM-DD, maximo 366 dias). Solo personal de gestion.
     * `confirmado` suma las facturas CONFIRMADA; `provisional` las PROVISIONAL (aun sin confirmar); las ANULADA y PENDIENTE no cuentan.
     */
    public function ingresos(Request $request): JsonResponse
    {
        $data = $request->validate([
            'desde' => ['required', 'date_format:Y-m-d'],
            'hasta' => ['required', 'date_format:Y-m-d', 'after_or_equal:desde'],
            'agrupar' => ['sometimes', 'in:dia,mes'],
        ]);
        $desde = \Carbon\Carbon::parse($data['desde'])->startOfDay();
        $hasta = \Carbon\Carbon::parse($data['hasta'])->endOfDay();
        if ($desde->diffInDays($hasta) > 366) {
            return response()->json(['message' => 'El rango maximo es de 366 dias'], 422);
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
            'confirmado' => (float) $f->confirmado,
            'provisional' => (float) $f->provisional,
            'facturas' => (int) $f->facturas,
        ])->values());
    }

    /** Crea una factura PENDIENTE y escribe el evento en el outbox en la misma transaccion. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cita_id' => ['required', 'uuid'],
            'paciente_id' => ['required', 'uuid'],
            'monto' => ['required', 'numeric', 'gt:0', 'max:99999999.99'],
        ]);

        try {
            $factura = $this->crear($data);
        } catch (UniqueConstraintViolationException) {
            // Un solo cobro vigente por cita (indice unico parcial).
            return response()->json(['message' => 'Ya existe un cobro vigente para esta cita'], 409);
        }

        return response()->json($factura->refresh(), 201);
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
