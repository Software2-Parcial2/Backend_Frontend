<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class IngresosRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'desde' => ['required', 'date_format:Y-m-d'],
            'hasta' => ['required', 'date_format:Y-m-d', 'after_or_equal:desde'],
            'agrupar' => ['sometimes', 'in:dia,mes,especialidad'],
        ];
    }
}
