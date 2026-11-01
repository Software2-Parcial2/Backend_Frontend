<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // El outbox tambien lleva las RESPUESTAS de la SAGA (exchange sigec.saga) con el correlationId/causationId del comando.
        DB::statement("ALTER TABLE outbox ADD COLUMN exchange VARCHAR(100) NOT NULL DEFAULT 'sigec.eventos'");
        DB::statement('ALTER TABLE outbox ADD COLUMN correlation_id UUID NULL');
        DB::statement('ALTER TABLE outbox ADD COLUMN causation_id UUID NULL');
        // Un solo cobro vigente por cita: hace idempotente (por cita) la solicitud de cobro provisional.
        DB::statement("CREATE UNIQUE INDEX facturas_cita_vigente_unique ON facturas (cita_id) WHERE estado <> 'ANULADA'");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS facturas_cita_vigente_unique');
        DB::statement('ALTER TABLE outbox DROP COLUMN causation_id');
        DB::statement('ALTER TABLE outbox DROP COLUMN correlation_id');
        DB::statement('ALTER TABLE outbox DROP COLUMN exchange');
    }
};
