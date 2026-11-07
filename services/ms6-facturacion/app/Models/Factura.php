<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Factura extends Model
{
    use HasUuids;

    protected $table = 'facturas';

    protected $fillable = ['cita_id', 'paciente_id', 'monto', 'estado', 'especialidad', 'fecha_cita', 'motivo_anulacion', 'anulada_por', 'anulada_en'];

    protected $casts = ['monto' => 'decimal:2', 'fecha_cita' => 'datetime', 'anulada_en' => 'datetime'];

    public const ESTADOS = ['PENDIENTE', 'PROVISIONAL', 'CONFIRMADA', 'PAGADA', 'ANULADA'];

    /** Estados en los que el cargo se puede cobrar en caja. */
    public const COBRABLES = ['PENDIENTE', 'PROVISIONAL', 'CONFIRMADA'];

    public function pago(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(Pago::class);
    }
}
