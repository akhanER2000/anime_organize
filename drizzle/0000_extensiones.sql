-- ANIME VAULT · migracion 0000 · extensiones de Postgres
--
-- ESCRITA A MANO. drizzle-kit no modela extensiones: la migracion 0001 usa
-- `citext`, `gin_trgm_ops` y `gen_random_uuid()` sin crearlos, y contra una
-- base limpia falla en la primera columna citext de la tabla users.
--
-- Las tres estan disponibles en Neon con el rol neondb_owner.
--
-- REVERSION (destructiva: DROP EXTENSION tumba las columnas que dependen de
-- ella, asi que solo tiene sentido sobre una base vacia):
--   DROP EXTENSION IF EXISTS citext;
--   DROP EXTENSION IF EXISTS pg_trgm;
--   DROP EXTENSION IF EXISTS unaccent;

-- Email insensible a mayusculas en users.email
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
-- Similitud difusa de titulos (umbral 0.55) e indice GIN trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Busqueda sin acentos en el buscador global
CREATE EXTENSION IF NOT EXISTS unaccent;

-- NOTA: pgcrypto NO se instala. Su unico uso habria sido gen_random_uuid(), que
-- es nativo en Postgres desde la version 13 (Neon corre muy por encima). No se
-- usa crypt(), digest(), hmac() ni pgp_*: las contrasenas se hashean con
-- Argon2id en Node y los tokens con sha256 en Node. Una extension menos que
-- mantener y una superficie menos que auditar.
