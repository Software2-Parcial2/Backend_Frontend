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
    public function index(): JsonResponse
    {
        return response()->json(Factura::query()->orderByDesc('created_at')->limit(100)->get());
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
