package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.application.port.in.ContactosUseCase;
import com.sigec.ms2_pacientes.domain.model.ContactoEmergencia;

import jakarta.validation.Valid;

/** Contactos de emergencia de un paciente. Los edita el personal de recepcion; el paciente los ve (los cambios los pide por solicitud). */
@RestController
@RequestMapping("/api/pacientes/{pacienteId}/contactos")
public class ContactoController {

	private static final String LEE = "hasAnyRole('administrador','recepcion','medico') or (hasRole('paciente') and #pacienteId.toString() == authentication.token.claims['paciente_id'])";

	private final ContactosUseCase contactos;
	private final PacienteWebMapper mapper;

	public ContactoController(ContactosUseCase contactos, PacienteWebMapper mapper) {
		this.contactos = contactos;
		this.mapper = mapper;
	}

	@GetMapping
	@PreAuthorize(LEE)
	public PaginaResponse<ContactoResponse> listar(@PathVariable UUID pacienteId) {
		return PaginaResponse.de(Pagina.unica(contactos.listar(pacienteId)), mapper::toResponse);
	}

	@PostMapping
	@PreAuthorize("hasAnyRole('administrador','recepcion')")
	public ResponseEntity<ContactoResponse> agregar(@PathVariable UUID pacienteId, @Valid @RequestBody ContactoRequest r) {
		ContactoEmergencia c = contactos.agregar(pacienteId, r.nombre(), r.parentesco(), r.telefono());
		return ResponseEntity.created(URI.create("/api/pacientes/" + pacienteId + "/contactos/" + c.id())).body(mapper.toResponse(c));
	}

	@DeleteMapping("/{contactoId}")
	@PreAuthorize("hasAnyRole('administrador','recepcion')")
	public ResponseEntity<Void> eliminar(@PathVariable UUID pacienteId, @PathVariable UUID contactoId) {
		contactos.eliminar(pacienteId, contactoId);
		return ResponseEntity.noContent().build();
	}
}
