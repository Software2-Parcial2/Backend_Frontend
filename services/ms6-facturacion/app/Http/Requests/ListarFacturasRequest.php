<?php

namespace App\Http\Requests;

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
        ];
    }
}
