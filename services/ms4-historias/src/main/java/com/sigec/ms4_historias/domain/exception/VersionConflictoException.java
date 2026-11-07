package com.sigec.ms4_historias.domain.exception;

/** 409 VERSION_CONFLICTO: otro profesional modifico el registro; se informa la version vigente. */
public class VersionConflictoException extends DominioException {

	private final long versionVigente;

	public VersionConflictoException(long versionVigente) {
		super("VERSION_CONFLICTO", "Otro profesional modifico este registro; recargue y vuelva a aplicar sus cambios");
		this.versionVigente = versionVigente;
	}

	public long versionVigente() {
		return versionVigente;
	}
}
