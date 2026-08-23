---
description: Generar y aplicar una migración de Drizzle de forma segura y reversible
argument-hint: "<nombre-de-la-migración> (ej: anadir-columna-mal-id)"
allowed-tools: Bash(npm *), Bash(npx *), Bash(git *), Read, Edit, Grep, Task
---

# /project:db-migrate — generar y aplicar migración Drizzle

Migración: **$ARGUMENTS**

Lee `@.claude/rules/db-conventions.md` antes de tocar el esquema.
**El esquema TypeScript es la fuente de verdad**, no el SQL.

## 1. Cambiar el esquema TS

Edita `src/lib/db/schema/*.ts`. Convenciones no negociables: tabla `snake_case` singular,
`uuid` para identificadores de usuario, `timestamptz` para fechas, «enums» como
`text` + `CHECK`, `ON DELETE CASCADE` hacia abajo.

## 2. Generar

```
!npm run db:generate
```

## 3. REVISAR EL SQL A MANO — el paso que salva los datos

```
!git status --short drizzle/
!cat drizzle/<la-migración-nueva>.sql
```

drizzle-kit no adivina intenciones. Busca específicamente:

- **`DROP TABLE` / `DROP COLUMN`** → ¿hay datos ahí? Si los hay, **para**.
- **Un rename interpretado como drop + create** → es el fallo clásico y **pierde datos**.
  Se reescribe a mano como `ALTER TABLE ... RENAME COLUMN`.
- **`NOT NULL` sobre una columna con filas existentes** → falla en producción.
  Se parte en tres pasos: añadir nullable → backfill → `SET NOT NULL`.
- **`UNIQUE` nuevo** → ¿hay duplicados ya en la tabla? Compruébalo antes con un `SELECT`.
- Extensiones (`citext`, `pg_trgm`, `unaccent`) creadas antes de usarse, en
  `drizzle/0000_extensiones.sql`. **Son por rama de Neon**: una rama nueva nace sin ellas.
  drizzle-kit no las modela, así que si regeneras desde cero esa migración se conserva a mano.
- Índices creados con `CONCURRENTLY` si la tabla ya tiene volumen.

Añade en la cabecera del `.sql` el **SQL de reversión**:

```sql
-- REVERSIÓN:
--   ALTER TABLE anime DROP COLUMN mal_id;
```

Si no es reversible, escríbelo explícitamente y explica el plan en dos pasos.

Si la migración es destructiva o toca `anime`, `users` o `anime_cover`,
**lanza el subagente `db-migrator`** para una segunda opinión antes de aplicar.

## 4. Aplicar en local

```
!npm run db:migrate
```

`db:push` es **solo** para iterar en local sobre una base desechable.
**Jamás contra producción**, y jamás como sustituto de una migración commiteada.

## 5. Verificar

```
!npm run typecheck
!npm run test
```

Comprueba también contra la base: que la tabla/columna existe, que el índice existe y
—si has tocado búsqueda o deduplicación— que un `EXPLAIN` usa el índice trigram en vez de
un *seq scan*.

## 6. Commitear junto

La migración y el cambio de esquema van en **el mismo commit**. Nunca una migración suelta,
nunca un esquema sin su migración.

```
!git add src/lib/db/schema drizzle/
!git status --short
```
