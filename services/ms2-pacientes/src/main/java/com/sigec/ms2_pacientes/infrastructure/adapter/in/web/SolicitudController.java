package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.SolicitudesUseCase;
import com.sigec.ms2_pacientes.domain.model.SolicitudActualizacion;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/** Solicitudes de actualizacion de datos de contacto: el paciente pide, recepcion aprueba o rechaza. */
@RestController
@RequestMapping("/api/pacientes")
@Validated
public class SolicitudController {

	private static final String PROPIO = "hasRole('paciente') and #pacienteId.toString() == authentication.token.claims['paciente_id']";

	private final SolicitudesUseCase solicitudes;
	private final ConsultarPacienteUseCase pacientes;

	public SolicitudController(SolicitudesUseCase solicitudes, ConsultarPacienteUseCase pacientes) {
		this.solicitudes = solicitudes;
		this.pacientes = pacientes;
	}

	@PostMapping("/{pacienteId}/solicitudes")
	@PreAuthorize(PROPIO)
	public ResponseEntity<SolicitudResponse> solicitar(@PathVariable UUID pacienteId, @Valid @RequestBody SolicitudRequest r) {
		SolicitudActualizacion s = solicitudes.solicitar(pacienteId, r.campo(), r.valorPropuesto());
		return ResponseEntity.created(URI.create("/api/pacientes/" + pacienteId + "/solicitudes/" + s.id())).body(respuesta(s));
	}

	@GetMapping("/{pacienteId}/solicitudes")
	@PreAuthorize("hasAnyRole('administrador','recepcion') or (" + PROPIO + ")")
	public PaginaResponse<SolicitudResponse> deUnPaciente(@PathVariable UUID pacienteId) {
		return PaginaResponse.de(solicitudes.deUnPaciente(pacienteId), this::respuesta);
	}

	@GetMapping("/solicitudes")
	@PreAuthorize("hasAnyRole('administrador','recepcion')")
	public PaginaResponse<SolicitudResponse> listar(@RequestParam(required = false) SolicitudActualizacion.Estado estado,
			@RequestParam(defaultValue = "25") @Min(1) @Max(100) int limite, @RequestParam(required = false) String cursor) {
		return PaginaResponse.de(solicitudes.listar(estado, limite, cursor), this::respuesta);
	}

	@PostMapping("/solicitudes/{id}/aprobar")
	@PreAuthorize("hasAnyRole('administrador','recepcion')")
	public SolicitudResponse aprobar(@PathVariable UUID id, Authentication auth) {
		return respuesta(solicitudes.aprobar(id, usuario(auth)));
	}

	@PostMapping("/solicitudes/{id}/rechazar")
	@PreAuthorize("hasAnyRole('administrador','recepcion')")
	public SolicitudResponse rechazar(@PathVariable UUID id, @Valid @RequestBody(required = false) RechazoRequest r, Authentication auth) {
		return respuesta(solicitudes.rechazar(id, usuario(auth), r == null ? null : r.motivo()));
	}

	private SolicitudResponse respuesta(SolicitudActualizacion s) {
		String nombre = pacientes.porId(s.pacienteId()).nombre();
		return new SolicitudResponse(s.id(), s.pacienteId(), nombre, s.campo(), s.valorActual(), s.valorPropuesto(), s.estado(),
				s.motivoRechazo(), s.solicitadaEn(), s.resueltaEn(), s.resueltaPor());
	}

	private static String usuario(Authentication auth) {
		Jwt jwt = (Jwt) auth.getPrincipal();
		String u = jwt.getClaimAsString("preferred_username");
		return u != null ? u : jwt.getSubject();
	}
}
