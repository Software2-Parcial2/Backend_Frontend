package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.CrearPacienteUseCase;
import com.sigec.ms2_pacientes.domain.model.Paciente;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/pacientes")
public class PacienteController {

	private final CrearPacienteUseCase crearPaciente;
	private final ConsultarPacienteUseCase consultarPaciente;
	private final PacienteWebMapper mapper;

	public PacienteController(CrearPacienteUseCase crearPaciente, ConsultarPacienteUseCase consultarPaciente,
			PacienteWebMapper mapper) {
		this.crearPaciente = crearPaciente;
		this.consultarPaciente = consultarPaciente;
		this.mapper = mapper;
	}

	@PostMapping
	@PreAuthorize("hasAnyRole('administrador','recepcion','medico')")
	public ResponseEntity<PacienteResponse> crear(@Valid @RequestBody CrearPacienteRequest request) {
		Paciente paciente = crearPaciente.crear(mapper.toCommand(request));
		return ResponseEntity.created(URI.create("/api/pacientes/" + paciente.id()))
				.body(mapper.toResponse(paciente));
	}

	// TODO: el rol paciente solo podra leer su propio registro (comparar claim sub con el paciente).
	@GetMapping
	@PreAuthorize("hasAnyRole('administrador','recepcion','medico')")
	public List<PacienteResponse> listar() {
		return consultarPaciente.listar().stream().map(mapper::toResponse).toList();
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAnyRole('administrador','recepcion','medico')")
	public PacienteResponse porId(@PathVariable UUID id) {
		return mapper.toResponse(consultarPaciente.porId(id));
	}
}
