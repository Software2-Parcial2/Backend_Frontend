package com.sigec.ms4_historias.application.port.out;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.sigec.ms4_historias.application.Pagina;
import com.sigec.ms4_historias.domain.model.Consulta;
import com.sigec.ms4_historias.domain.model.EstadoConsulta;
import com.sigec.ms4_historias.domain.model.Evolucion;

public interface ConsultaRepositoryPort {

	Optional<Consulta> porId(UUID id);

	/** @throws com.sigec.ms4_historias.domain.exception.ConflictoException CONSULTA_YA_EXISTE si la cita ya tiene consulta */
	Consulta insertar(Consulta consulta);

	/** Guarda con control de concurrencia; @throws com.sigec.ms4_historias.domain.exception.VersionConflictoException si cambio */
	Consulta actualizar(Consulta consulta, long versionEsperada);

	Pagina<Consulta> pagina(UUID historiaId, EstadoConsulta estado, int limite, String cursor);

	Evolucion agregarEvolucion(Evolucion evolucion);

	List<Evolucion> evoluciones(UUID consultaId);
}
