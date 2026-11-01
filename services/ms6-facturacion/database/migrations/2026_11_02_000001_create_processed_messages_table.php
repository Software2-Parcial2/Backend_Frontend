<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Deduplicacion de consumidores por id de mensaje (contracts/idempotency.md). */
    public function up(): void
    {
        Schema::create('processed_messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('status', 20);
            $table->timestampTz('locked_until')->nullable();
            $table->timestampTz('expires_at')->index();
        });

        DB::statement("ALTER TABLE processed_messages ADD CONSTRAINT processed_messages_status_check CHECK (status IN ('PROCESANDO','COMPLETADO'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('processed_messages');
    }
};
