<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;


it('la reserva SQL es atomica: de 6 PROCESOS simultaneos solo uno gana', function () {
    $key = 'race:'.Str::uuid();
    $barrier = sys_get_temp_dir().'/idem-barrier-'.Str::uuid();
    $script = <<<'PHP'
        $pdo = new PDO(getenv('DSN'), getenv('DB_USER'), getenv('DB_PASS'));
        $t0 = microtime(true);
        while (! file_exists(getenv('BARRIER')) && microtime(true) - $t0 < 10) { usleep(500); }
        $st = $pdo->prepare("INSERT INTO idempotency_keys (key, request_hash, status, expires_at, created_at, updated_at)
            VALUES (?, 'h', 'PROCESANDO', now() + interval '1 hour', now(), now())
            ON CONFLICT (key) DO UPDATE SET request_hash = EXCLUDED.request_hash, status = 'PROCESANDO'
            WHERE idempotency_keys.expires_at < now()");
        $st->execute([getenv('KEY')]);
        echo $st->rowCount();
        PHP;
    $cfg = config('database.connections.pgsql');
    $env = [
        'DSN' => "pgsql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['database']}",
        'DB_USER' => $cfg['username'], 'DB_PASS' => $cfg['password'], 'KEY' => $key, 'BARRIER' => $barrier,
        'PATH' => getenv('PATH'),
    ];
    $procs = [];
    for ($i = 0; $i < 6; $i++) {
        $p = proc_open([PHP_BINARY, '-r', $script], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env);
        $procs[] = [$p, $pipes];
    }
    usleep(800_000); // todos conectados y esperando la barrera
    touch($barrier);
    $wins = 0;
    foreach ($procs as [$p, $pipes]) {
        $wins += (int) stream_get_contents($pipes[1]);
        proc_close($p);
    }
    @unlink($barrier);
    DB::table('idempotency_keys')->where('key', $key)->delete();
    expect($wins)->toBe(1);
});
