package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.util.UUID;

public record ContactoResponse(UUID id, UUID pacienteId, String nombre, String parentesco, String telefono) {
}
