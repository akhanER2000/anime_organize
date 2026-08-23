-- ANIME VAULT · migracion 0002 · corte de sesiones y rate limiting
--
-- Generada por drizzle-kit y REVISADA A MANO.
--
-- 1. users.sessions_valid_from
--    Un JWT es valido hasta que expira, exista o no la cuenta. Sin esta columna,
--    borrar la cuenta o cambiar la contrasena tras un robo de sesion NO echa a
--    nadie: el token sigue autenticando durante dias. Un token emitido antes de
--    esta marca se rechaza.
--    ADD COLUMN con DEFAULT now(): now() es STABLE (no volatil), asi que
--    Postgres 11+ usa el camino rapido y NO reescribe la tabla.
--
-- 2. rate_limit_bucket
--    Contadores de rate limiting en Postgres. En Vercel serverless un contador
--    en memoria se pierde entre invocaciones y no se comparte entre regiones:
--    "5 intentos" se convierte en "5 intentos por instancia".
--    Una fila por (clave, ventana), no una por intento: la tabla no crece con el
--    trafico, que es justo lo que un atacante quiere provocar.
--
-- REVERSION:
--   DROP TABLE IF EXISTS rate_limit_bucket;
--   ALTER TABLE users DROP COLUMN sessions_valid_from;
--
--   OJO: revertir la columna reabre el agujero de sesion. Si ya hay usuarios,
--   revierte tambien el codigo que la comprueba o quedaran sesiones sin validar.

CREATE TABLE "rate_limit_bucket" (
	"clave" text NOT NULL,
	"ventana_inicio" timestamp with time zone NOT NULL,
	"contador" integer DEFAULT 0 NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	CONSTRAINT "pk_rate_limit_bucket" PRIMARY KEY("clave","ventana_inicio")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sessions_valid_from" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_rate_limit_expira" ON "rate_limit_bucket" USING btree ("expira_en");