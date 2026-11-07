<?php

namespace App\Http\Requests;

use App\Models\Factura;
use Illuminate\Foundation\Http\FormRequest;

class ListarFacturasRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'limite' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'cursor' => ['sometimes', 'string', 'max:2048'],
            // Lista separada por comas: estado=PROVISIONAL,CONFIRMADA
            'estado' => ['sometimes', 'string', 'regex:/^('.implode('|', Factura::ESTADOS).')(,('.implode('|', Factura::ESTADOS).'))*$/'],
            'porCobrar' => ['sometimes', 'boolean'],
            'desde' => ['sometimes', 'date_format:Y-m-d'],
            'hasta' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:desde'],
            'q' => ['sometimes', 'string', 'max:100'],
            'citaId' => ['sometimes', 'uuid'],
            'pacienteId' => ['sometimes', 'uuid'],
        ];
    }
}
