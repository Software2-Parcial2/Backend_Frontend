package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.sigec.ms2_pacientes.application.port.in.ActualizarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase;
import com.sigec.ms2_pacientes.application.port.in.CrearPacienteUseCase;
import com.sigec.ms2_pacientes.domain.model.Paciente;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

@RestController
@RequestMapping("/api/pacientes")
@Validated
public class PacienteController {

	private final CrearPacienteUseCase crearPaciente;
	private final ConsultarPacienteUseCase consultarPaciente;
	private final ActualizarPacienteUseCase actualizarPaciente;
	private final PacienteWebMapper mapper;

	public PacienteController(CrearPacienteUseCase crearPaciente, ConsultarPacienteUseCase consultarPaciente,
			ActualizarPacienteUseCase actualizarPaciente, PacienteWebMapper mapper) {
		this.crearPaciente = crearPaciente;
		this.consultarPaciente = consultarPaciente;
		this.actualizarPaciente = actualizarPaciente;
		this.mapper = mapper;
	}

	@PostMapping
	@PreAuthorize("hasAnyRole('administrador','recepcion','medico')")
	public ResponseEntity<PacienteResponse> crear(@Valid @RequestBody CrearPacienteRequest request) {
		Paciente paciente = crearPaciente.crear(mapper.toCommand(request));
		return conEtag(ResponseEntity.created(URI.create("/api/pacientes/" + paciente.id())), paciente);
	}

	/**
	 * Busqueda paginada: {@code ?q&tipo=nombre|documento|historia&limite&cursor}. «Rohas Carla» encuentra a «Carla Rojas».
	 * Sin {@code q} lista todos ordenados por nombre.
	 */
	@GetMapping
	@PreAuthorize("hasAnyRole('administrador','recepcion','medico')")
	public PaginaResponse<PacienteResponse> buscar(@RequestParam(required = false) String q,
			@RequestParam(defaultValue = "nombre") String tipo, @RequestParam(defaultValue = "25") @Min(1) @Max(100) int limite,
			@RequestParam(required = false) String cursor) {
		ConsultarPacienteUseCase.Tipo t;
		try {
			t = ConsultarPacienteUseCase.Tipo.valueOf(tipo.toUpperCase());
		}
		catch (IllegalArgumentException e) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TIPO_BUSQUEDA_INVALIDO", "tipo debe ser nombre, documento o historia");
		}
		return PaginaResponse.de(consultarPaciente.buscar(new ConsultarPacienteUseCase.Busqueda(q, t, limite, cursor)), mapper::toResponse);
	}

	/** El paciente autenticado: por el claim paciente_id o, si no lo trae, por el vinculo con su usuario (sub). */
	@GetMapping("/me")
	@PreAuthorize("hasRole('paciente')")
	public ResponseEntity<PacienteResponse> yo(Authentication auth) {
		Jwt jwt = (Jwt) auth.getPrincipal();
		String claim = jwt.getClaimAsString("paciente_id");
		Paciente p = claim != null ? consultarPaciente.porId(UUID.fromString(claim)) : consultarPaciente.porUsuarioSub(jwt.getSubject());
		return conEtag(ResponseEntity.ok(), p);
	}

	/**
	 * El personal (administrador, recepcion, medico) ve cualquier paciente. El rol paciente solo el suyo: el id de la ruta
	 * debe coincidir con el claim `paciente_id` del token (vinculacion de Keycloak). Si no, 403.
	 */
	@GetMapping("/{id}")
	@PreAuthorize("hasAnyRole('administrador','recepcion','medico') or (hasRole('paciente') and #id.toString() == authentication.token.claims['paciente_id'])")
	public ResponseEntity<PacienteResponse> porId(@PathVariable UUID id) {
		return conEtag(ResponseEntity.ok(), consultarPaciente.porId(id));
	}

	/** Edicion con control de concurrencia: {@code If-Match: <version>} (la que devolvio el ETag). Otra version -> 409 VERSION_CONFLICTO. */
	@PutMapping("/{id}")
	@PreAuthorize("hasAnyRole('administrador','recepcion')")
	public ResponseEntity<PacienteResponse> actualizar(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
			@Valid @RequestBody ActualizarPacienteRequest request) {
		Paciente p = actualizarPaciente.actualizar(id, version(ifMatch), mapper.toCommand(request));
		return conEtag(ResponseEntity.ok(), p);
	}

	private ResponseEntity<PacienteResponse> conEtag(ResponseEntity.BodyBuilder b, Paciente p) {
		return b.eTag("\"" + (p.version() == null ? 0 : p.version()) + "\"").body(mapper.toResponse(p));
	}

	static long version(String ifMatch) {
		if (ifMatch == null || ifMatch.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "IF_MATCH_REQUERIDO", "Falta la cabecera If-Match con la version del registro");
		}
		try {
			return Long.parseLong(ifMatch.strip().replace("\"", "").replace("W/", ""));
		}
		catch (NumberFormatException e) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "IF_MATCH_INVALIDO", "If-Match debe ser la version numerica del registro");
		}
	}
}
