<?php

namespace App\Http\Resources;

use App\Support\Caja;
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
            'numeroCargo' => $this->numero_cargo,
            'citaId' => $this->cita_id,
            'pacienteId' => $this->paciente_id,
            'pacienteNombre' => $this->paciente_nombre ?? null,
            'especialidad' => $this->especialidad,
            'fechaCita' => Caja::iso($this->fecha_cita),
            'monto' => number_format((float) $this->monto, 2, '.', ''),
            'moneda' => $this->moneda ?? 'BOB',
            'estado' => $this->estado,
            'motivoAnulacion' => $this->motivo_anulacion,
            'anuladaEn' => Caja::iso($this->anulada_en),
            'creadaEn' => $this->created_at?->utc()->toIso8601String(),
            'actualizadaEn' => $this->updated_at?->utc()->toIso8601String(),
        ];
    }
}
