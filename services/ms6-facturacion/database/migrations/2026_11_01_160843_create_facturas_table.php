<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('facturas', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('cita_id')->index();
            $table->uuid('paciente_id')->index();
            $table->decimal('monto', 12, 2);
            $table->string('estado', 20)->default('PENDIENTE');
            $table->timestamps();
        });

        DB::statement("ALTER TABLE facturas ADD CONSTRAINT facturas_estado_check CHECK (estado IN ('PENDIENTE','PROVISIONAL','CONFIRMADA','ANULADA'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('facturas');
    }
};
