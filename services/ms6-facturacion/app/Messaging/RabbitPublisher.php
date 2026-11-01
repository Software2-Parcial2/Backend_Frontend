<?php

namespace App\Messaging;

use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;
use PhpAmqpLib\Wire\AMQPTable;
use RuntimeException;

/** Publica sobres persistentes con publisher confirms: lanza si el broker no confirma. */
final class RabbitPublisher
{
    private ?AMQPStreamConnection $connection = null;

    private ?AMQPChannel $channel = null;

    private bool $nacked = false;

    public function __construct(private readonly ?Topology $topology = null) {}

    /** @param array<string, mixed> $envelope */
    public function publish(string $exchange, array $envelope, array $headers = []): void
    {
        Envelope::validate($envelope);
        $this->publishRaw($exchange, $envelope['type'], json_encode($envelope, JSON_THROW_ON_ERROR), [
            'message_id' => $envelope['id'],
            'type' => $envelope['type'],
            'correlation_id' => $envelope['correlationId'],
            'application_headers' => new AMQPTable($headers),
        ]);
    }

    public function publishRaw(string $exchange, string $routingKey, string $body, array $properties = []): void
    {
        $ch = $this->channel();
        $this->nacked = false;
        $msg = new AMQPMessage($body, array_merge([
            'content_type' => 'application/json',
            'delivery_mode' => AMQPMessage::DELIVERY_MODE_PERSISTENT,
        ], $properties));
        $ch->basic_publish($msg, $exchange, $routingKey);
        $ch->wait_for_pending_acks(10);
        if ($this->nacked) {
            throw new RuntimeException("RabbitMQ rechazo (nack) el mensaje hacia $exchange/$routingKey");
        }
    }

    public function close(): void
    {
        try {
            $this->channel?->close();
            $this->connection?->close();
        } finally {
            $this->channel = null;
            $this->connection = null;
        }
    }

    private function channel(): AMQPChannel
    {
        if ($this->channel !== null && $this->connection?->isConnected()) {
            return $this->channel;
        }
        $this->connection = RabbitConnection::open();
        $ch = $this->connection->channel();
        ($this->topology ?? new Topology)->declareExchanges($ch);
        $ch->confirm_select();
        $ch->set_nack_handler(function () {
            $this->nacked = true;
        });

        return $this->channel = $ch;
    }
}
