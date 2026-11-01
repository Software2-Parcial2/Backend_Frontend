<?php

namespace App\Messaging;

use Closure;
use PhpAmqpLib\Message\AMQPMessage;
use PhpAmqpLib\Wire\AMQPTable;
use Throwable;

/**
 * Consumidor con ack manual, reintentos limitados por colas de espera y paso a DLQ
 * (misma semantica que packages/messaging-nest; ver contracts/events/README.md).
 */
final class RabbitConsumer
{
    private bool $stop = false;

    /**
     * @param  Closure(array $envelope, int $retries): void  $handler
     * @param  Closure(string $id): bool|null  $tryBegin  devuelve false si el mensaje ya se proceso (dedupe)
     * @param  Closure(string $id): void|null  $release  libera el id tras un fallo para permitir el reintento
     * @param  array|null  $bindings  enlaces de la cola; null = los de topology.json
     */
    public function __construct(
        private readonly string $queue,
        private readonly Closure $handler,
        private readonly Topology $topology,
        private readonly RabbitPublisher $publisher,
        private readonly ?Closure $tryBegin = null,
        private readonly ?Closure $release = null,
        private readonly ?array $tiers = null,
        private readonly ?int $maxRetries = null,
        private readonly ?Closure $log = null,
        private readonly ?array $bindings = null,
    ) {}

    public function stop(): void
    {
        $this->stop = true;
    }

    /** Bucle de consumo. $idleTimeout (s) lo termina si no llegan mensajes (0 = indefinido). */
    public function run(int $idleTimeout = 0, int $prefetch = 10): void
    {
        while (! $this->stop) {
            try {
                $conn = RabbitConnection::open();
                $ch = $conn->channel();
                $this->topology->declareQueue($ch, $this->queue, $this->bindings, $this->tiers);
                $ch->basic_qos(0, $prefetch, false);
                $ch->basic_consume($this->queue, '', false, false, false, false, fn (AMQPMessage $m) => $this->onMessage($m));
                while ($ch->is_consuming() && ! $this->stop) {
                    $ch->wait(null, false, $idleTimeout ?: 5);
                }
            } catch (UnknownQueueException $e) {
                throw $e; // error de configuracion: no tiene sentido reintentar
            } catch (\PhpAmqpLib\Exception\AMQPTimeoutException) {
                if ($idleTimeout > 0) {
                    return;
                }
            } catch (Throwable $e) {
                $this->say('conexion perdida: '.$e->getMessage().'; reintentando en 2 s');
                sleep(2);
            }
        }
    }

    public function onMessage(AMQPMessage $msg): void
    {
        $retries = $this->retriesOf($msg);
        try {
            $envelope = Envelope::validate(json_decode($msg->getBody(), true, flags: JSON_THROW_ON_ERROR));
        } catch (Throwable $e) {
            $this->say('mensaje invalido -> DLQ ('.$e->getMessage().')');
            $this->toDlq($msg, $e->getMessage());

            return;
        }

        $began = false;
        try {
            if ($this->tryBegin && ! ($this->tryBegin)($envelope['id'])) {
                $this->say("mensaje {$envelope['id']} duplicado, se ignora");
                $msg->ack();

                return;
            }
            $began = $this->tryBegin !== null;
            ($this->handler)($envelope, $retries);
            $msg->ack();
        } catch (Throwable $e) {
            if ($began && $this->release) {
                ($this->release)($envelope['id']);
            }
            $this->retryOrDlq($msg, $envelope, $retries, $e->getMessage());
        }
    }

    private function retryOrDlq(AMQPMessage $msg, array $envelope, int $retries, string $reason): void
    {
        $retry = $this->topology->retry();
        $max = $this->maxRetries ?? $retry['maxRetries'];
        try {
            if ($retries >= $max) {
                $this->say("{$envelope['id']} agoto $max reintentos -> DLQ ($reason)");
                $this->toDlq($msg, $reason);

                return;
            }
            $tiers = $this->tiers ?? $retry['tiers'];
            $tier = $tiers[min($retries, count($tiers) - 1)];
            $this->say("{$envelope['id']} fallo ($reason); reintento ".($retries + 1)."/$max en {$tier['ttlMs']} ms");
            $this->publisher->publishRaw($retry['exchange'], "{$this->queue}.{$tier['suffix']}", $msg->getBody(), [
                'message_id' => $envelope['id'],
                'type' => $envelope['type'],
                'correlation_id' => $envelope['correlationId'],
                'application_headers' => new AMQPTable(['x-retries' => $retries + 1, 'x-last-error' => substr($reason, 0, 500)]),
            ]);
            $msg->ack();
        } catch (Throwable $e) {
            $this->say('no se pudo reencolar ('.$e->getMessage().'); nack con requeue');
            $msg->nack(true);
        }
    }

    private function toDlq(AMQPMessage $msg, string $reason): void
    {
        try {
            $this->publisher->publishRaw($this->topology->retry()['deadLetterExchange'], "{$this->queue}.dlq", $msg->getBody(), [
                'application_headers' => new AMQPTable(['x-last-error' => substr($reason, 0, 500)]),
            ]);
            $msg->ack();
        } catch (Throwable) {
            $msg->nack(true);
        }
    }

    private function retriesOf(AMQPMessage $msg): int
    {
        if (! $msg->has('application_headers')) {
            return 0;
        }

        return (int) ($msg->get('application_headers')->getNativeData()['x-retries'] ?? 0);
    }

    private function say(string $text): void
    {
        $line = "[{$this->queue}] $text";
        $this->log ? ($this->log)($line) : logger()->info($line);
    }
}
