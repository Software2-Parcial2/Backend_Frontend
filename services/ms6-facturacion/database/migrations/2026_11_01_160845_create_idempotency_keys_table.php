<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->string('key', 200)->primary();
            $table->string('request_hash', 64);
            $table->string('status', 20)->default('PROCESANDO');
            $table->json('response')->nullable();
            $table->timestampTz('expires_at')->index();
            $table->timestamps();
        });

        DB::statement("ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_status_check CHECK (status IN ('PROCESANDO','COMPLETADO'))");
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};
