<?php

namespace App\Messaging;

use PhpAmqpLib\Connection\AMQPStreamConnection;

final class RabbitConnection
{
    public static function open(): AMQPStreamConnection
    {
        return new AMQPStreamConnection(
            config('messaging.host'),
            config('messaging.port'),
            config('messaging.user'),
            config('messaging.password'),
            config('messaging.vhost'),
        );
    }
}
