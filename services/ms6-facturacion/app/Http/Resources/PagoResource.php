<?php

namespace App\Http\Resources;

use App\Support\Caja;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PagoResource extends JsonResource
{
    public static $wrap = null;

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'facturaId' => $this->factura_id,
            'metodo' => $this->metodo,
            'monto' => Caja::dinero($this->monto),
            'recibido' => $this->recibido === null ? null : Caja::dinero($this->recibido),
            'cambio' => Caja::dinero($this->cambio),
            'referencia' => $this->referencia,
            'cajero' => $this->cajero,
            'comprobante' => $this->comprobante_numero,
            'pagadoEn' => Caja::iso($this->pagado_en),
        ];
    }
}
