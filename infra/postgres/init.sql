CREATE DATABASE ms2_pacientes;
CREATE DATABASE ms4_historias;
CREATE DATABASE ms6_facturacion;
CREATE DATABASE ms7_inteligencia;
CREATE DATABASE keycloak;
CREATE DATABASE n8n;

\connect ms7_inteligencia
CREATE EXTENSION IF NOT EXISTS vector;
