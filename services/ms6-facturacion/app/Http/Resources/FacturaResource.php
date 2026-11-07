<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Factura en camelCase (convencion de SIGEC). El dinero viaja como string decimal con su moneda. */
class FacturaResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'citaId' => $this->cita_id,
            'pacienteId' => $this->paciente_id,
            'monto' => number_format((float) $this->monto, 2, '.', ''),
            'moneda' => $this->moneda ?? 'BOB',
            'estado' => $this->estado,
            'creadaEn' => $this->created_at?->utc()->toIso8601String(),
            'actualizadaEn' => $this->updated_at?->utc()->toIso8601String(),
        ];
    }
}
