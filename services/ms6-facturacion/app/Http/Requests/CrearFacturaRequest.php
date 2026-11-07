<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CrearFacturaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // el acceso por rol lo resuelve el middleware role:
    }

    public function rules(): array
    {
        return [
            'citaId' => ['required', 'uuid'],
            'pacienteId' => ['required', 'uuid'],
            'monto' => ['required', 'numeric', 'gt:0', 'max:99999999.99'],
        ];
    }
}
