<?php

namespace App\Console\Commands;

use App\Messaging\RabbitConnection;
use App\Messaging\Topology;
use Illuminate\Console\Command;

class RabbitmqDeclare extends Command
{
    protected $signature = 'rabbitmq:declare {--all : Declara toda la topologia, no solo las colas de MS6}';

    protected $description = 'Declara exchanges, colas, DLQ y colas de espera de RabbitMQ (idempotente)';

    public function handle(): int
    {
        $conn = RabbitConnection::open();
        $ch = $conn->channel();
        $topology = new Topology;
        if ($this->option('all')) {
            $topology->declareAll($ch);
            $this->info('Topologia completa declarada.');
        } else {
            $topology->declareQueue($ch, config('messaging.queue'));
            $this->info('Cola '.config('messaging.queue').' (+ dlq y colas de espera) declarada.');
        }
        $ch->close();
        $conn->close();

        return self::SUCCESS;
    }
}
