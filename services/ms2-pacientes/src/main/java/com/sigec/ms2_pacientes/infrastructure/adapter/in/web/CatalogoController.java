package com.sigec.ms2_pacientes.infrastructure.adapter.in.web;

import java.net.URI;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.application.port.in.CatalogoUseCase;
import com.sigec.ms2_pacientes.application.port.in.CatalogoUseCase.MedicoConEspecialidad;
import com.sigec.ms2_pacientes.domain.model.Especialidad;
import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.CatalogoDtos.ActualizarEspecialidadRequest;
import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.CatalogoDtos.CrearEspecialidadRequest;
import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.CatalogoDtos.EspecialidadResponse;
import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.CatalogoDtos.EspecialidadResumen;
import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.CatalogoDtos.MedicoRequest;
import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.CatalogoDtos.MedicoResponse;
import com.sigec.ms2_pacientes.infrastructure.adapter.in.web.CatalogoDtos.MedicoResumen;

import jakarta.validation.Valid;

/**
 * Catalogo maestro. Cualquier usuario autenticado lee especialidades y medicos (resumen); solo el administrador los modifica.
 * Cada alta o cambio de medico publica medico.creado / medico.actualizado (MS3 proyecta la agenda con ellos).
 */
@RestController
@RequestMapping("/api")
public class CatalogoController {

	private final CatalogoUseCase catalogo;

	public CatalogoController(CatalogoUseCase catalogo) {
		this.catalogo = catalogo;
	}

	@GetMapping("/especialidades")
	public PaginaResponse<EspecialidadResponse> especialidades(@RequestParam(defaultValue = "true") boolean soloActivas) {
		return PaginaResponse.de(Pagina.unica(catalogo.especialidades(soloActivas)), CatalogoController::aResponse);
	}

	@PostMapping("/especialidades")
	@PreAuthorize("hasRole('administrador')")
	public ResponseEntity<EspecialidadResponse> crearEspecialidad(@Valid @RequestBody CrearEspecialidadRequest r) {
		Especialidad e = catalogo.crearEspecialidad(r.codigo(), r.nombre());
		return ResponseEntity.created(URI.create("/api/especialidades/" + e.id())).body(aResponse(e));
	}

	@PutMapping("/especialidades/{id}")
	@PreAuthorize("hasRole('administrador')")
	public EspecialidadResponse actualizarEspecialidad(@PathVariable UUID id, @Valid @RequestBody ActualizarEspecialidadRequest r) {
		return aResponse(catalogo.actualizarEspecialidad(id, r.nombre(), r.activa() == null || r.activa()));
	}

	@GetMapping("/medicos")
	public PaginaResponse<MedicoResumen> medicos(@RequestParam(required = false) String especialidad,
			@RequestParam(defaultValue = "true") boolean soloActivos) {
		return PaginaResponse.de(Pagina.unica(catalogo.medicos(especialidad, soloActivos)), CatalogoController::aResumen);
	}

	/** El medico autenticado (por el vinculo usuarioKeycloak = preferred_username). */
	@GetMapping("/medicos/me")
	@PreAuthorize("hasRole('medico')")
	public MedicoResumen yo(Authentication auth) {
		Jwt jwt = (Jwt) auth.getPrincipal();
		String u = jwt.getClaimAsString("preferred_username");
		return aResumen(catalogo.medicoPorUsuario(u != null ? u : jwt.getSubject()));
	}

	@GetMapping("/medicos/{id}")
	public MedicoResumen medico(@PathVariable UUID id) {
		return aResumen(catalogo.medico(id));
	}

	@PostMapping("/medicos")
	@PreAuthorize("hasRole('administrador')")
	public ResponseEntity<MedicoResponse> crearMedico(@Valid @RequestBody MedicoRequest r) {
		MedicoConEspecialidad m = catalogo.crearMedico(comando(r));
		return ResponseEntity.created(URI.create("/api/medicos/" + m.medico().id())).body(aCompleto(m));
	}

	@PutMapping("/medicos/{id}")
	@PreAuthorize("hasRole('administrador')")
	public MedicoResponse actualizarMedico(@PathVariable UUID id, @Valid @RequestBody MedicoRequest r) {
		return aCompleto(catalogo.actualizarMedico(id, comando(r), r.activo() == null || r.activo()));
	}

	private static CatalogoUseCase.MedicoCommand comando(MedicoRequest r) {
		return new CatalogoUseCase.MedicoCommand(r.nombre(), r.documento(), r.matricula(), r.especialidad(), r.email(), r.telefono(),
				r.usuarioKeycloak(), r.consultorio());
	}

	private static EspecialidadResponse aResponse(Especialidad e) {
		return new EspecialidadResponse(e.id(), e.codigo(), e.nombre(), e.activa());
	}

	private static MedicoResumen aResumen(MedicoConEspecialidad m) {
		return new MedicoResumen(m.medico().id(), m.medico().nombre(), m.medico().matricula(),
				new EspecialidadResumen(m.especialidad().codigo(), m.especialidad().nombre()), m.medico().consultorio(), m.medico().activo());
	}

	private static MedicoResponse aCompleto(MedicoConEspecialidad m) {
		var d = m.medico();
		return new MedicoResponse(d.id(), d.nombre(), d.documento(), d.matricula(),
				new EspecialidadResumen(m.especialidad().codigo(), m.especialidad().nombre()), d.email(), d.telefono(), d.usuarioKeycloak(),
				d.consultorio(), d.activo());
	}
}
