<?php

return [
    // Tarifa del cobro provisional por especialidad (monto). Una especialidad sin tarifa (o con 0) rechaza el cobro.
    'tarifas' => [
        'general' => 100.00,
        'pediatria' => 150.00,
        'odontologia' => 120.00,
        'cardiologia' => 250.00,
    ],

    // Pacientes bloqueados (UUID separados por coma): su cobro siempre se rechaza. El primero permite probar el rechazo.
    'pacientes_bloqueados' => array_values(array_filter(array_map('trim', explode(',', env(
        'FACTURACION_PACIENTES_BLOQUEADOS',
        '00000000-0000-4000-8000-00000000dead',
    ))))),

    // Zona horaria de la clinica: define el dia (y el turno) de los movimientos y el balance de caja.
    'zona_horaria' => env('FACTURACION_ZONA_HORARIA', 'America/La_Paz'),

    // Hora local (HH:MM) en que termina el turno de la manana; desde ahi es turno de la tarde.
    'fin_turno_manana' => env('FACTURACION_FIN_TURNO_MANANA', '13:00'),
];
