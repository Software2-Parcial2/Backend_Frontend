<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Tarifas por especialidad (antes solo en config/facturacion.php), ledger de movimientos de facturas (por trigger,
 * sin tocar el codigo de MS6), restricciones, indices de consulta y purga de tablas tecnicas. Cambios ADITIVOS.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE tarifas (
    id            UUID PRIMARY KEY,
    especialidad  VARCHAR(40)   NOT NULL CHECK (especialidad ~ '^[a-z0-9_]+$'),
    monto         NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
    moneda        CHAR(3)       NOT NULL DEFAULT 'BOB',
    vigente_desde DATE          NOT NULL DEFAULT CURRENT_DATE,
    vigente_hasta DATE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (especialidad, vigente_desde),
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);
COMMENT ON TABLE tarifas IS 'Tarifa del cobro provisional por especialidad (codigo de MS2 especialidades.codigo). Monto 0 = sin tarifa: se rechaza el cobro.';

ALTER TABLE facturas ADD COLUMN moneda CHAR(3) NOT NULL DEFAULT 'BOB';
ALTER TABLE facturas ADD CONSTRAINT facturas_monto_check CHECK (monto >= 0);
COMMENT ON COLUMN facturas.paciente_id IS 'SENSIBLE: personal. Referencia a MS2 pacientes.id (sin FK entre bases)';
COMMENT ON COLUMN facturas.monto IS 'SENSIBLE: financiero';
COMMENT ON COLUMN facturas.cita_id IS 'Referencia a MS3 CITA#<id>';
-- Listado "mis facturas" ordenado (sustituye al indice simple por paciente) e informe de ingresos por estado y fecha.
DROP INDEX IF EXISTS facturas_paciente_id_index;
CREATE INDEX facturas_paciente_fecha_idx ON facturas (paciente_id, created_at DESC);
CREATE INDEX facturas_estado_fecha_idx ON facturas (estado, created_at);

-- Ledger: traza de cada cambio de estado o monto, incluidas anulaciones y lapidas. Solo se anade.
CREATE TABLE factura_movimientos (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    factura_id      UUID          NOT NULL REFERENCES facturas (id),
    estado_anterior VARCHAR(20),
    estado_nuevo    VARCHAR(20)   NOT NULL,
    monto           NUMERIC(12,2) NOT NULL,
    ocurrido_en     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX factura_movimientos_factura_idx ON factura_movimientos (factura_id, ocurrido_en);

CREATE OR REPLACE FUNCTION registrar_movimiento_factura() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO factura_movimientos (factura_id, estado_anterior, estado_nuevo, monto) VALUES (NEW.id, NULL, NEW.estado, NEW.monto);
    ELSIF NEW.estado IS DISTINCT FROM OLD.estado OR NEW.monto IS DISTINCT FROM OLD.monto THEN
        INSERT INTO factura_movimientos (factura_id, estado_anterior, estado_nuevo, monto) VALUES (NEW.id, OLD.estado, NEW.estado, NEW.monto);
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER facturas_ledger AFTER INSERT OR UPDATE ON facturas FOR EACH ROW EXECUTE FUNCTION registrar_movimiento_factura();

CREATE OR REPLACE FUNCTION rechazar_modificacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% es de solo anadir: no se permite %', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER factura_movimientos_inmutable BEFORE UPDATE OR DELETE ON factura_movimientos FOR EACH ROW EXECUTE FUNCTION rechazar_modificacion();

-- Facturas anteriores a esta migracion: un movimiento inicial con su estado actual (sin perdida de informacion).
INSERT INTO factura_movimientos (factura_id, estado_anterior, estado_nuevo, monto, ocurrido_en)
SELECT id, NULL, estado, monto, created_at FROM facturas;

-- Retencion de tablas tecnicas (docs/datos/operacion.md). Se ejecuta con `make db-purge`.
CREATE INDEX idx_outbox_publicados ON outbox (published_at) WHERE published_at IS NOT NULL;
CREATE OR REPLACE FUNCTION purgar_tecnico(retencion_outbox INTERVAL DEFAULT INTERVAL '7 days')
RETURNS TABLE (outbox_borrados BIGINT, idempotencia_borrados BIGINT, procesados_borrados BIGINT) LANGUAGE plpgsql AS $$
DECLARE o BIGINT; i BIGINT; p BIGINT;
BEGIN
    DELETE FROM outbox WHERE published_at IS NOT NULL AND published_at < now() - retencion_outbox;
    GET DIAGNOSTICS o = ROW_COUNT;
    DELETE FROM idempotency_keys WHERE expires_at < now();
    GET DIAGNOSTICS i = ROW_COUNT;
    DELETE FROM processed_messages WHERE expires_at < now();
    GET DIAGNOSTICS p = ROW_COUNT;
    RETURN QUERY SELECT o, i, p;
END $$;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP FUNCTION IF EXISTS purgar_tecnico(INTERVAL);
DROP INDEX IF EXISTS idx_outbox_publicados;
DROP TRIGGER IF EXISTS facturas_ledger ON facturas;
DROP TABLE IF EXISTS factura_movimientos;
DROP FUNCTION IF EXISTS registrar_movimiento_factura();
DROP FUNCTION IF EXISTS rechazar_modificacion();
DROP INDEX IF EXISTS facturas_estado_fecha_idx;
DROP INDEX IF EXISTS facturas_paciente_fecha_idx;
CREATE INDEX facturas_paciente_id_index ON facturas (paciente_id);
ALTER TABLE facturas DROP CONSTRAINT IF EXISTS facturas_monto_check;
ALTER TABLE facturas DROP COLUMN IF EXISTS moneda;
DROP TABLE IF EXISTS tarifas;
SQL);
    }
};
