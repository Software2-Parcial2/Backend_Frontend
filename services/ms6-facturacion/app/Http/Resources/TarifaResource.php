<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TarifaResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        $hoy = now(config('facturacion.zona_horaria'))->toDateString();
        $desde = $this->vigente_desde->toDateString();
        $hasta = $this->vigente_hasta?->toDateString();
        // VIGENTE: ya rige y no vencio; PROGRAMADA: rige desde una fecha futura; HISTORICA: ya no rige.
        $estado = $desde > $hoy ? 'PROGRAMADA' : ($hasta !== null && $hasta <= $hoy ? 'HISTORICA' : 'VIGENTE');

        return [
            'id' => $this->id,
            'especialidad' => $this->especialidad,
            'nombre' => $this->nombre,
            'tipo' => $this->tipo,
            'monto' => number_format((float) $this->monto, 2, '.', ''),
            'moneda' => trim($this->moneda),
            'vigenteDesde' => $desde,
            'vigenteHasta' => $hasta,
            'estado' => $estado,
        ];
    }
}
