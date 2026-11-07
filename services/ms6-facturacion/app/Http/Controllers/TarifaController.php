<?php

namespace App\Http\Controllers;

use App\Http\Requests\TarifaRequest;
use App\Http\Resources\TarifaResource;
use App\Models\Tarifa;
use App\Support\Problem;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Tarifario por especialidad o servicio. Cambiar una tarifa NO modifica los cargos ya emitidos: una tarifa nueva cierra la anterior
 * en su fecha de vigencia y solo afecta a los cargos que se generen desde esa fecha.
 */
class TarifaController extends Controller
{
    /** Todas las tarifas (vigentes, programadas e historicas). `?soloVigentes=true` deja la que rige hoy por especialidad. */
    public function index(Request $request): JsonResponse
    {
        $items = Tarifa::query()->orderBy('especialidad')->orderByDesc('vigente_desde')->get()->map(fn ($t) => (new TarifaResource($t))->resolve());
        if ($request->boolean('soloVigentes')) {
            $items = $items->where('estado', 'VIGENTE')->values();
        }
        if ($request->filled('especialidad')) {
            $items = $items->where('especialidad', $request->query('especialidad'))->values();
        }

        return response()->json(['items' => $items, 'siguiente' => null]);
    }

    /** Crea una tarifa con vigencia desde hoy o futura; cierra la anterior abierta y respeta la siguiente programada. */
    public function store(TarifaRequest $request): JsonResponse
    {
        $d = $request->validated();
        $hoy = now(config('facturacion.zona_horaria'))->toDateString();
        if ($d['vigenteDesde'] < $hoy) {
            return Problem::response(422, 'VIGENCIA_PASADA', 'Regla de negocio incumplida', 'La tarifa no puede empezar a regir en una fecha pasada');
        }

        try {
            $tarifa = DB::transaction(function () use ($d) {
                $siguiente = Tarifa::where('especialidad', $d['especialidad'])->where('vigente_desde', '>', $d['vigenteDesde'])->min('vigente_desde');
                // La que estaba abierta hasta ahora deja de regir cuando empieza la nueva.
                Tarifa::where('especialidad', $d['especialidad'])->where('vigente_desde', '<', $d['vigenteDesde'])
                    ->where(fn ($q) => $q->whereNull('vigente_hasta')->orWhere('vigente_hasta', '>', $d['vigenteDesde']))
                    ->update(['vigente_hasta' => $d['vigenteDesde']]);

                return Tarifa::create([
                    'especialidad' => $d['especialidad'],
                    'monto' => $d['monto'],
                    'vigente_desde' => $d['vigenteDesde'],
                    'vigente_hasta' => $siguiente,
                    'tipo' => $d['tipo'] ?? 'CONSULTA',
                    'nombre' => $d['nombre'] ?? null,
                ])->refresh();
            });
        } catch (UniqueConstraintViolationException) {
            return Problem::response(409, 'TARIFA_DUPLICADA', 'Conflicto', 'Ya existe una tarifa de esa especialidad con la misma fecha de vigencia');
        }

        return (new TarifaResource($tarifa))->response()->setStatusCode(201)->header('Location', '/api/facturacion/tarifas/'.$tarifa->id);
    }

    /** Corrige una tarifa PROGRAMADA (que aun no rige). Una vigente o historica no se edita: se crea una nueva. */
    public function update(TarifaRequest $request, string $tarifa): JsonResponse
    {
        $t = Tarifa::find($tarifa);
        if ($t === null) {
            return Problem::response(404, 'TARIFA_NO_ENCONTRADA', 'No encontrado', "No existe la tarifa $tarifa");
        }
        $hoy = now(config('facturacion.zona_horaria'))->toDateString();
        if ($t->vigente_desde->toDateString() <= $hoy) {
            return Problem::response(422, 'TARIFA_NO_EDITABLE', 'Regla de negocio incumplida', 'Una tarifa que ya rige no se edita: cree una nueva con otra fecha de vigencia');
        }
        $d = $request->validated();
        $t->update(array_filter([
            'monto' => $d['monto'],
            'tipo' => $d['tipo'] ?? null,
            'nombre' => array_key_exists('nombre', $d) ? $d['nombre'] : null,
        ], fn ($v) => $v !== null));

        return (new TarifaResource($t->refresh()))->response();
    }
}
