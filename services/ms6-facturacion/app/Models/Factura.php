<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Factura extends Model
{
    use HasUuids;

    protected $table = 'facturas';

    protected $fillable = ['cita_id', 'paciente_id', 'monto', 'estado'];

    protected $casts = ['monto' => 'decimal:2'];

    public const ESTADOS = ['PENDIENTE', 'PROVISIONAL', 'CONFIRMADA', 'ANULADA'];
}
