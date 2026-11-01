<?php

namespace App\Console\Commands;

use App\Messaging\OutboxRelayService;
use App\Messaging\RabbitPublisher;
use Illuminate\Console\Command;
use Throwable;

class OutboxRelay extends Command
{
    protected $signature = 'outbox:relay
        {--once : Procesa un lote y termina}
        {--interval=1 : Segundos entre lotes cuando no hay pendientes}
        {--batch=50 : Maximo de eventos por lote}
        {--max-iterations=0 : Termina tras N iteraciones (0 = indefinido; para pruebas)}';

    protected $description = 'Publica en RabbitMQ los eventos pendientes de la tabla outbox (al menos una vez)';

    public function handle(): int
    {
        $publisher = new RabbitPublisher;
        $relay = new OutboxRelayService(fn (string $exchange, array $envelope) => $publisher->publish($exchange, $envelope));
        $interval = max(0.1, (float) $this->option('interval'));
        $batch = (int) $this->option('batch');
        $max = (int) $this->option('max-iterations');
        $failures = 0;

        for ($i = 1; ; $i++) {
            try {
                $n = $relay->relayBatch($batch);
                if ($n > 0) {
                    $this->info(sprintf('outbox: publicados=%d pendientes=%d', $n, $relay->pending()));
                }
                $failures = 0;
            } catch (Throwable $e) {
                $failures++;
                $publisher->close();
                $backoff = min(30, 2 ** min($failures - 1, 5));
                $this->warn(sprintf('outbox: fallo al publicar (%s); reintento en %d s [fallos seguidos=%d]', $e->getMessage(), $backoff, $failures));
                if ($this->option('once')) {
                    return self::FAILURE;
                }
                sleep($backoff);

                continue;
            }
            if ($this->option('once') || ($max > 0 && $i >= $max)) {
                break;
            }
            usleep((int) ($interval * 1_000_000));
        }

        return self::SUCCESS;
    }
}
