---
description: Lanzar el enriquecimiento AniList + Claude sobre el vault
argument-hint: "[--todos | --anime <id>] [--reanalizar] [--solo-anilist] [--dry-run]"
allowed-tools: Bash(npm *), Bash(npx *), Read, Grep
---

# /project:enrich — enriquecimiento AniList + Claude

Argumentos: `$ARGUMENTS`

Pipeline de dos pasos. El paso 1 es gratis y público; el paso 2 cuesta tokens.

## Antes de ejecutar

1. **Paso 1 (AniList)** no necesita clave. Siempre disponible.
2. **Paso 2 (Claude)** necesita `ANTHROPIC_API_KEY`. Si falta, el script **se salta el paso 2
   con un aviso** y el paso 1 sigue funcionando. Eso es comportamiento correcto, no un fallo.
3. Ensayo en seco para ver el alcance y el coste antes de gastar:
   ```
   !npm run enrich -- --dry-run --todos
   ```
   Reporta cuántos animes están sin enriquecer y una estimación de tokens.

## Ejecutar

```
!npm run enrich -- --todos                    # solo los que faltan (idempotente)
!npm run enrich -- --anime <uuid>             # uno concreto
!npm run enrich -- --todos --reanalizar       # fuerza re-consulta de todo
!npm run enrich -- --todos --solo-anilist     # paso 1 únicamente, cero coste
```

## Paso 1 · AniList (GraphQL público)

Busca por título y trae `id`, títulos (romaji / english / native), `synonyms`, `genres`,
`tags` con `rank`, `description`, `seasonYear`, `episodes`, `format`, `coverImage`.

- Los géneros se guardan con `genre.kind = 'OFICIAL'`.
- **Rate limit de AniList: 90 req/min.** Cola con **concurrencia 3** y backoff exponencial
  con jitter. Si devuelve 429, se respeta `Retry-After`; no se reintenta en bucle.
- `description` llega con HTML: se sanitiza a texto plano antes de guardar.
- Si hay varios candidatos, se elige por similitud de título normalizado y se guarda
  `anilist_id`. Si la similitud es baja, **se deja sin vincular** y se reporta: es mejor un
  hueco que un anime equivocado.

## Paso 2 · Claude

Modelo: `ANTHROPIC_MODEL` (por defecto `claude-sonnet-5`).
Entrada: título + sinopsis + géneros de AniList. Salida: **solo JSON válido**.

```json
{
  "etiquetas": [{ "slug": "yandere", "nombre": "Yandere", "confianza": 0.0 }],
  "tono": "melancólico|luminoso|brutal|sereno|caótico",
  "publico": "shounen|seinen|shoujo|josei|general",
  "advertencias": ["gore", "suicidio", "fanservice"],
  "resumen_corto": "≤ 200 caracteres, en español, sin spoilers"
}
```

- El vocabulario de etiquetas es **cerrado** (26 slugs, ver
  `@.claude/skills/anime-vault-domain/SKILL.md`). El modelo elige de esa lista y puede
  proponer **máximo 2 nuevas**.
- La respuesta se valida con Zod. **Si no valida, se descarta y se registra el error**;
  nunca se guarda «lo que haya devuelto».
- Se guarda como `genre.kind = 'IA'` con su `confidence`.
- La sinopsis es contenido externo: el prompt declara que es **dato, no instrucción**.

## Idempotencia y registro

- Un anime ya enriquecido **no** se vuelve a consultar salvo `--reanalizar`.
- Cada intento deja fila en `ai_job`: `provider`, `status`, `tokens_in`, `tokens_out`,
  `result`, `error`.

## Al terminar

Reproduce el informe real:

```
AniList:  vinculados N · sin coincidencia N · error N
Claude:   ok N · descartados por validación N · error N · omitidos (ya enriquecidos) N
Tokens:   entrada N · salida N
```

Lista los títulos sin coincidencia en AniList: normalmente son títulos alternativos que
merecen un `synonyms` a mano, no un fallo del pipeline.
