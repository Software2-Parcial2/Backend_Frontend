<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Tarifa extends Model
{
    use HasUuids;

    protected $table = 'tarifas';

    public $timestamps = false;

    protected $fillable = ['especialidad', 'monto', 'moneda', 'vigente_desde', 'vigente_hasta', 'tipo', 'nombre'];

    protected $casts = ['monto' => 'decimal:2', 'vigente_desde' => 'date:Y-m-d', 'vigente_hasta' => 'date:Y-m-d'];
}
