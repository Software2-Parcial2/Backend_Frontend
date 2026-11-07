package com.sigec.ms2_pacientes.application.port.out;

import java.util.Optional;
import java.util.UUID;

import com.sigec.ms2_pacientes.application.Pagina;
import com.sigec.ms2_pacientes.application.port.in.ConsultarPacienteUseCase.Busqueda;
import com.sigec.ms2_pacientes.domain.model.Paciente;

public interface PacienteRepositoryPort {

	Paciente guardar(Paciente paciente);

	Optional<Paciente> buscarPorId(UUID id);

	Optional<Paciente> buscarPorUsuarioSub(String sub);

	/** Busqueda paginada por cursor (keyset); lanza CursorInvalidoException si el cursor esta mal formado. */
	Pagina<Paciente> buscar(Busqueda busqueda);

	boolean existePorDocumento(String documento);

	boolean existePorUsuarioSub(String sub);

	/** Siguiente numero de historia (HC-000123), de una secuencia de la base. */
	String siguienteNumeroHistoria();
}
