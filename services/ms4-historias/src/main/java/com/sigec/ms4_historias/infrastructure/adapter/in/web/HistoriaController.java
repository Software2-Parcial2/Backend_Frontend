package com.sigec.ms4_historias.infrastructure.adapter.in.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.sigec.ms4_historias.application.port.in.AntecedentesUseCase;
import com.sigec.ms4_historias.application.port.in.AuditoriaUseCase;
import com.sigec.ms4_historias.application.port.in.ConsentimientosUseCase;
import com.sigec.ms4_historias.application.port.in.ConsultasUseCase;
import com.sigec.ms4_historias.application.port.in.EstudiosUseCase;
import com.sigec.ms4_historias.application.port.in.HistoriasUseCase;
import com.sigec.ms4_historias.domain.model.Accion;
import com.sigec.ms4_historias.domain.model.Consulta;
import com.sigec.ms4_historias.domain.model.EstadoConsulta;
import com.sigec.ms4_historias.domain.model.TipoAntecedente;
import com.sigec.ms4_historias.domain.model.TipoConsentimiento;
import com.sigec.ms4_historias.infrastructure.adapter.in.web.Dtos.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * Historias clinicas. Roles: {@code medico} lee y escribe; {@code paciente} solo lo suyo (consultas firmadas, recetas,
 * consentimientos); {@code administrador} solo la auditoria; {@code recepcion} y {@code caja} no entran. Cada acceso se audita
 * dentro del caso de uso.
 */
@RestController
@RequestMapping("/api/historias")
@Validated
public class HistoriaController {

	private final HistoriasUseCase historias;
	private final ConsultasUseCase consultas;
	private final AntecedentesUseCase antecedentes;
	private final ConsentimientosUseCase consentimientos;
	private final AuditoriaUseCase auditoria;
	private final EstudiosUseCase estudios;

	public HistoriaController(HistoriasUseCase historias, ConsultasUseCase consultas, AntecedentesUseCase antecedentes,
			ConsentimientosUseCase consentimientos, AuditoriaUseCase auditoria, EstudiosUseCase estudios) {
		this.estudios = estudios;
		this.historias = historias;
		this.consultas = consultas;
		this.antecedentes = antecedentes;
		this.consentimientos = consentimientos;
		this.auditoria = auditoria;
	}

	// --- Historia -----------------------------------------------------------------------------------------------

	@GetMapping("/paciente/{pacienteId}")
	@PreAuthorize("hasAnyRole('medico','paciente')")
	public HistoriaResponse porPaciente(Authentication auth, @PathVariable UUID pacienteId) {
		return HistoriaResponse.de(historias.porPaciente(ActorJwt.de(auth), pacienteId));
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAnyRole('medico','paciente')")
	public HistoriaResponse porId(Authentication auth, @PathVariable UUID id) {
		return HistoriaResponse.de(historias.porId(ActorJwt.de(auth), id));
	}

	// --- Consultas ----------------------------------------------------------------------------------------------

	@GetMapping("/{id}/consultas")
	@PreAuthorize("hasAnyRole('medico','paciente')")
	public PaginaResponse<ConsultaResponse> listarConsultas(Authentication auth, @PathVariable UUID id,
			@RequestParam(required = false) String estado, @RequestParam(defaultValue = "25") @Min(1) @Max(100) int limite,
			@RequestParam(required = false) String cursor) {
		EstadoConsulta e = enumero(EstadoConsulta.class, estado, "ESTADO_INVALIDO");
		return PaginaResponse.de(consultas.listar(ActorJwt.de(auth), id, e, limite, cursor), ConsultaResponse::de);
	}

	@PostMapping("/{id}/consultas")
	@PreAuthorize("hasRole('medico')")
	public ResponseEntity<ConsultaResponse> iniciarConsulta(Authentication auth, @PathVariable UUID id,
			@Valid @RequestBody IniciarConsultaRequest req) {
		Consulta c = consultas.iniciar(ActorJwt.de(auth), id, new ConsultasUseCase.Iniciar(req.citaId(), req.motivo(), req.signosVitales()));
		return conEtag(ResponseEntity.created(URI.create("/api/historias/consultas/" + c.id())), c);
	}

	@GetMapping("/consultas/{id}")
	@PreAuthorize("hasAnyRole('medico','paciente')")
	public ResponseEntity<ConsultaResponse> consulta(Authentication auth, @PathVariable UUID id) {
		return conEtag(ResponseEntity.ok(), consultas.porId(ActorJwt.de(auth), id));
	}

	/** Edita un borrador con {@code If-Match: <version>}; si otro profesional lo cambio, 409 VERSION_CONFLICTO con la version vigente. */
	@PutMapping("/consultas/{id}")
	@PreAuthorize("hasRole('medico')")
	public ResponseEntity<ConsultaResponse> editar(Authentication auth, @PathVariable UUID id,
			@RequestHeader(value = "If-Match", required = false) String ifMatch, @Valid @RequestBody EditarConsultaRequest req) {
		return conEtag(ResponseEntity.ok(), consultas.editar(ActorJwt.de(auth), id, version(ifMatch), req.aDominio()));
	}

	@PostMapping("/consultas/{id}/firmar")
	@PreAuthorize("hasRole('medico')")
	public ResponseEntity<ConsultaResponse> firmar(Authentication auth, @PathVariable UUID id,
			@RequestHeader(value = "If-Match", required = false) String ifMatch) {
		return conEtag(ResponseEntity.ok(), consultas.firmar(ActorJwt.de(auth), id, ifMatch == null ? null : version(ifMatch)));
	}

	@GetMapping("/consultas/{id}/evoluciones")
	@PreAuthorize("hasRole('medico')")
	public List<EvolucionResponse> evoluciones(Authentication auth, @PathVariable UUID id) {
		return consultas.evoluciones(ActorJwt.de(auth), id).stream().map(EvolucionResponse::de).toList();
	}

	@PostMapping("/consultas/{id}/evoluciones")
	@PreAuthorize("hasRole('medico')")
	public ResponseEntity<EvolucionResponse> agregarEvolucion(Authentication auth, @PathVariable UUID id, @Valid @RequestBody EvolucionRequest req) {
		return ResponseEntity.status(HttpStatus.CREATED).body(EvolucionResponse.de(consultas.agregarEvolucion(ActorJwt.de(auth), id, req.nota())));
	}

	@GetMapping("/consultas/{id}/receta")
	@PreAuthorize("hasAnyRole('medico','paciente')")
	public RecetaResponse receta(Authentication auth, @PathVariable UUID id) {
		return RecetaResponse.de(consultas.receta(ActorJwt.de(auth), id));
	}

	// --- Antecedentes -------------------------------------------------------------------------------------------

	@GetMapping("/{id}/antecedentes")
	@PreAuthorize("hasRole('medico')")
	public List<AntecedenteResponse> antecedentes(Authentication auth, @PathVariable UUID id, @RequestParam(defaultValue = "true") boolean soloActivos) {
		return antecedentes.listar(ActorJwt.de(auth), id, soloActivos).stream().map(AntecedenteResponse::de).toList();
	}

	@PostMapping("/{id}/antecedentes")
	@PreAuthorize("hasRole('medico')")
	public ResponseEntity<AntecedenteResponse> crearAntecedente(Authentication auth, @PathVariable UUID id, @Valid @RequestBody AntecedenteRequest req) {
		TipoAntecedente tipo = enumero(TipoAntecedente.class, req.tipo(), "TIPO_INVALIDO");
		var a = antecedentes.crear(ActorJwt.de(auth), id, tipo, req.descripcion());
		return ResponseEntity.created(URI.create("/api/historias/antecedentes/" + a.id())).eTag("\"" + a.version() + "\"")
				.body(AntecedenteResponse.de(a));
	}

	@PutMapping("/antecedentes/{id}")
	@PreAuthorize("hasRole('medico')")
	public ResponseEntity<AntecedenteResponse> editarAntecedente(Authentication auth, @PathVariable UUID id,
			@RequestHeader(value = "If-Match", required = false) String ifMatch, @Valid @RequestBody AntecedenteEdicionRequest req) {
		var a = antecedentes.editar(ActorJwt.de(auth), id, version(ifMatch), req.descripcion(), req.activo() == null || req.activo());
		return ResponseEntity.ok().eTag("\"" + a.version() + "\"").body(AntecedenteResponse.de(a));
	}

	/** Baja logica: el antecedente queda inactivo, no se borra. */
	@DeleteMapping("/antecedentes/{id}")
	@PreAuthorize("hasRole('medico')")
	public ResponseEntity<AntecedenteResponse> desactivarAntecedente(Authentication auth, @PathVariable UUID id,
			@RequestHeader(value = "If-Match", required = false) String ifMatch) {
		return ResponseEntity.ok(AntecedenteResponse.de(antecedentes.desactivar(ActorJwt.de(auth), id, version(ifMatch))));
	}

	// --- Estudios de imagen -------------------------------------------------------------------------------------

	/** Estudios con informe validado en MS5 (la imagen y el informe se piden alli por `imagenId`). El paciente no ve los descartados. */
	@GetMapping("/{id}/estudios")
	@PreAuthorize("hasAnyRole('medico','paciente')")
	public List<EstudioResponse> estudios(Authentication auth, @PathVariable UUID id) {
		return estudios.listar(ActorJwt.de(auth), id).stream().map(EstudioResponse::de).toList();
	}

	// --- Consentimientos ----------------------------------------------------------------------------------------

	@GetMapping("/paciente/{pacienteId}/consentimientos")
	@PreAuthorize("hasAnyRole('medico','paciente')")
	public List<ConsentimientoResponse> consentimientos(Authentication auth, @PathVariable UUID pacienteId) {
		return consentimientos.listar(ActorJwt.de(auth), pacienteId).stream().map(ConsentimientoResponse::de).toList();
	}

	@PostMapping("/paciente/{pacienteId}/consentimientos")
	@PreAuthorize("hasRole('paciente')")
	public ResponseEntity<ConsentimientoResponse> otorgar(Authentication auth, @PathVariable UUID pacienteId, @Valid @RequestBody ConsentimientoRequest req) {
		TipoConsentimiento tipo = enumero(TipoConsentimiento.class, req.tipo(), "TIPO_INVALIDO");
		var c = consentimientos.otorgar(ActorJwt.de(auth), pacienteId, tipo, req.versionTexto());
		return ResponseEntity.status(HttpStatus.CREATED).body(ConsentimientoResponse.de(c));
	}

	@PostMapping("/consentimientos/{id}/revocar")
	@PreAuthorize("hasRole('paciente')")
	public ConsentimientoResponse revocar(Authentication auth, @PathVariable UUID id) {
		return ConsentimientoResponse.de(consentimientos.revocar(ActorJwt.de(auth), id));
	}

	// --- Auditoria ----------------------------------------------------------------------------------------------

	@GetMapping("/{id}/auditoria")
	@PreAuthorize("hasRole('administrador')")
	public PaginaResponse<AccesoResponse> auditoria(Authentication auth, @PathVariable UUID id, @RequestParam(required = false) String tipo,
			@RequestParam(defaultValue = "25") @Min(1) @Max(100) int limite, @RequestParam(required = false) String cursor) {
		Accion accion = enumero(Accion.class, tipo, "TIPO_INVALIDO");
		return PaginaResponse.de(auditoria.consultar(ActorJwt.de(auth), id, accion, limite, cursor), AccesoResponse::de);
	}

	// --- utilidades ---------------------------------------------------------------------------------------------

	private ResponseEntity<ConsultaResponse> conEtag(ResponseEntity.BodyBuilder b, Consulta c) {
		return b.eTag("\"" + c.version() + "\"").body(ConsultaResponse.de(c));
	}

	private static <E extends Enum<E>> E enumero(Class<E> tipo, String valor, String code) {
		if (valor == null || valor.isBlank()) {
			return null;
		}
		try {
			return Enum.valueOf(tipo, valor.toUpperCase());
		}
		catch (IllegalArgumentException e) {
			throw new ApiException(HttpStatus.BAD_REQUEST, code, "Valor no admitido: " + valor);
		}
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
