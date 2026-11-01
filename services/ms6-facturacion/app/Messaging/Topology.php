<?php

namespace App\Messaging;

use PhpAmqpLib\Channel\AMQPChannel;
use PhpAmqpLib\Wire\AMQPTable;
use RuntimeException;

/** Declara la topologia de contracts/events/topology.json (idempotente). */
final class Topology
{
    /** @var array<string, mixed> */
    private array $spec;

    public function __construct(?string $file = null)
    {
        $file ??= config('messaging.topology_file');
        if (! is_file($file)) {
            throw new RuntimeException("No existe topology.json en $file (variable SIGEC_TOPOLOGY_FILE)");
        }
        $this->spec = json_decode(file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
    }

    public function retry(): array
    {
        return $this->spec['retry'];
    }

    public function declareExchanges(AMQPChannel $ch): void
    {
        foreach ($this->spec['exchanges'] as $ex) {
            $ch->exchange_declare($ex['name'], $ex['type'], false, (bool) $ex['durable'], false);
        }
    }

    /** Declara una cola de consumo con su DLQ y sus colas de espera. $tiers sirve para pruebas. */
    public function declareQueue(AMQPChannel $ch, string $name, ?array $bindings = null, ?array $tiers = null): void
    {
        $this->declareExchanges($ch);
        $retry = $this->spec['retry'];
        $bindings ??= $this->bindingsOf($name);

        $ch->queue_declare($name, false, true, false, false, false, new AMQPTable([
            'x-dead-letter-exchange' => $retry['deadLetterExchange'],
            'x-dead-letter-routing-key' => "$name.dlq",
        ]));
        foreach ($bindings as $b) {
            foreach ($b['routingKeys'] as $rk) {
                $ch->queue_bind($name, $b['exchange'], $rk);
            }
        }
        $ch->queue_declare("$name.dlq", false, true, false, false);
        $ch->queue_bind("$name.dlq", $retry['deadLetterExchange'], "$name.dlq");

        foreach ($tiers ?? $retry['tiers'] as $tier) {
            $waitName = "$name.{$tier['suffix']}";
            $ch->queue_declare($waitName, false, true, false, false, false, new AMQPTable([
                'x-message-ttl' => $tier['ttlMs'],
                'x-dead-letter-exchange' => '',
                'x-dead-letter-routing-key' => $name,
            ]));
            $ch->queue_bind($waitName, $retry['exchange'], $waitName);
        }
    }

    public function declareAll(AMQPChannel $ch): void
    {
        foreach ($this->spec['queues'] as $q) {
            $this->declareQueue($ch, $q['name'], $q['bindings']);
        }
    }

    /** @return list<array{exchange: string, routingKeys: list<string>}> */
    private function bindingsOf(string $queue): array
    {
        foreach ($this->spec['queues'] as $q) {
            if ($q['name'] === $queue) {
                return $q['bindings'];
            }
        }
        throw new UnknownQueueException("Cola desconocida en topology.json: $queue");
    }
}

/** La cola pedida no esta en topology.json (error de configuracion, no de red). */
class UnknownQueueException extends RuntimeException {}
