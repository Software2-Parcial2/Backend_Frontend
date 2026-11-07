package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import jakarta.validation.constraints.Size;

public record RechazoRequest(@Size(max = 300) String motivo) {
}
