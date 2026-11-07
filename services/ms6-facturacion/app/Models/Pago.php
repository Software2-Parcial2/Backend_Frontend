<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Pago extends Model
{
    use HasUuids;

    public const METODOS = ['EFECTIVO', 'TRANSFERENCIA', 'POS'];

    protected $table = 'pagos';

    public $timestamps = false;

    protected $fillable = ['factura_id', 'metodo', 'monto', 'recibido', 'cambio', 'referencia', 'cajero'];

    protected $casts = ['monto' => 'decimal:2', 'recibido' => 'decimal:2', 'cambio' => 'decimal:2', 'pagado_en' => 'datetime'];
}
