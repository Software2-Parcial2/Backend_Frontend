<?php

namespace App\Http\Requests;

use App\Models\Pago;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Dia (y turno) de caja: `fecha` AAAA-MM-DD en hora local de la clinica; sin `fecha` se usa hoy. */
class CajaDiaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'fecha' => ['sometimes', 'date_format:Y-m-d'],
            'turno' => ['sometimes', Rule::in(['manana', 'tarde'])],
            'metodo' => ['sometimes', Rule::in(Pago::METODOS)],
            'tipo' => ['sometimes', Rule::in(['cobros', 'anulaciones', 'todos'])],
        ];
    }
}
