<?php

namespace App\Http\Requests;

use App\Models\Pago;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PagarFacturaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'metodo' => ['required', Rule::in(Pago::METODOS)],
            // Efectivo: monto recibido (el cambio se calcula). Transferencia y POS: n.° de operacion.
            'recibido' => ['required_if:metodo,EFECTIVO', 'nullable', 'numeric', 'gt:0', 'max:99999999.99'],
            'referencia' => ['required_unless:metodo,EFECTIVO', 'nullable', 'string', 'max:100'],
        ];
    }
}
