<?php

namespace App\Console\Commands;

use App\Messaging\ProcessedMessages;
use App\Messaging\RabbitConsumer;
use App\Messaging\RabbitPublisher;
use App\Messaging\SagaCommandHandler;
use App\Messaging\Topology;
use Illuminate\Console\Command;

class SagaConsume extends Command
{
    protected $signature = 'saga:consume {--idle-timeout=0 : Termina si no llegan mensajes en N segundos (0 = indefinido; para pruebas)}';

    protected $description = 'Consume los comandos de la SAGA de citas (cola ms6.saga.comandos) con reintentos, DLQ y deduplicacion por id';

    public function handle(): int
    {
        $handler = new SagaCommandHandler;
        $hooks = ProcessedMessages::hooks();
        $consumer = new RabbitConsumer(
            config('messaging.queue'),
            fn (array $envelope) => $handler->handle($envelope),
            new Topology,
            new RabbitPublisher,
            tryBegin: $hooks['tryBegin'],
            release: $hooks['release'],
            log: fn (string $line) => $this->line($line),
            complete: $hooks['complete'],
        );
        $this->info('Consumiendo '.config('messaging.queue'));
        $consumer->run((int) $this->option('idle-timeout'));

        return self::SUCCESS;
    }
}
