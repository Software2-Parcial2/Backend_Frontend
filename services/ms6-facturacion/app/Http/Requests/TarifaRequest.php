<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TarifaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $crear = $this->isMethod('POST');

        return [
            // Codigo de la especialidad (MS2) o del servicio; en minusculas, numeros y guion bajo.
            'especialidad' => [$crear ? 'required' : 'prohibited', 'string', 'max:40', 'regex:/^[a-z0-9_]+$/'],
            'monto' => ['required', 'numeric', 'min:0.01', 'max:99999999.99'],
            'vigenteDesde' => [$crear ? 'required' : 'sometimes', 'date_format:Y-m-d'],
            'tipo' => ['sometimes', Rule::in(['CONSULTA', 'ESTUDIO'])],
            'nombre' => ['sometimes', 'nullable', 'string', 'max:100'],
        ];
    }
}
