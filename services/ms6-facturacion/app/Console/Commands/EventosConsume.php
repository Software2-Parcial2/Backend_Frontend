<?php

namespace App\Console\Commands;

use App\Messaging\PacienteEventsHandler;
use App\Messaging\ProcessedMessages;
use App\Messaging\RabbitConsumer;
use App\Messaging\RabbitPublisher;
use App\Messaging\Topology;
use Illuminate\Console\Command;

class EventosConsume extends Command
{
    protected $signature = 'eventos:consume {--idle-timeout=0 : Termina si no llegan mensajes en N segundos (0 = indefinido; para pruebas)}';

    protected $description = 'Consume los eventos de dominio de MS2 (cola ms6.eventos) para la proyeccion de nombres de paciente';

    public function handle(): int
    {
        $handler = new PacienteEventsHandler;
        $hooks = ProcessedMessages::hooks();
        $consumer = new RabbitConsumer(
            config('messaging.eventos_queue'),
            fn (array $envelope) => $handler->handle($envelope),
            new Topology,
            new RabbitPublisher,
            tryBegin: $hooks['tryBegin'],
            release: $hooks['release'],
            log: fn (string $line) => $this->line($line),
            complete: $hooks['complete'],
        );
        $this->info('Consumiendo '.config('messaging.eventos_queue'));
        $consumer->run((int) $this->option('idle-timeout'));

        return self::SUCCESS;
    }
}
