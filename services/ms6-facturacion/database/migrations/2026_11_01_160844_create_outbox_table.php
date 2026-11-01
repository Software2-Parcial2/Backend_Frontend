<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('outbox', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('aggregate_type', 100);
            $table->uuid('aggregate_id');
            $table->string('event_type', 100);
            $table->jsonb('payload');
            $table->timestampTz('created_at')->useCurrent();
            $table->timestampTz('published_at')->nullable();
        });

        DB::statement('CREATE INDEX idx_outbox_pendientes ON outbox (created_at) WHERE published_at IS NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('outbox');
    }
};
