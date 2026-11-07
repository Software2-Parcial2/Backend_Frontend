<?php

return [
    'host' => env('RABBITMQ_HOST', '127.0.0.1'),
    'port' => (int) env('RABBITMQ_PORT', 5672),
    'user' => env('RABBITMQ_USER', 'guest'),
    'password' => env('RABBITMQ_PASSWORD', 'guest'),
    'vhost' => env('RABBITMQ_VHOST', '/'),

    // Fuente unica de la topologia (contracts/events/topology.json en el monorepo).
    'topology_file' => env('SIGEC_TOPOLOGY_FILE', base_path('../../contracts/events/topology.json')),

    // Cola de consumo propia de MS6.
    'queue' => env('MS6_SAGA_QUEUE', 'ms6.saga.comandos'),

    // Eventos de dominio de MS2 (proyeccion de nombres de paciente para caja).
    'eventos_queue' => env('MS6_EVENTOS_QUEUE', 'ms6.eventos'),
];
