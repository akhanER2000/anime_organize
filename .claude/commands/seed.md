---
description: Recargar animes-seed.json y sus portadas desde Google Drive
argument-hint: "[--dry-run] [--solo-portadas] [--email <usuario propietario>]"
allowed-tools: Bash(npm *), Bash(npx *), Read, Grep
---

# /project:seed — cargar el vault inicial

Argumentos: `$ARGUMENTS`

Carga los **83 animes reales** de `animes-seed.json` en el vault del usuario propietario,
descargando cada portada desde Drive y pasándola por el pipeline de portadas.

## Antes de ejecutar

1. Comprueba que hay `DATABASE_URL_UNPOOLED` y que las migraciones están aplicadas:
   ```
   !npm run db:migrate
   ```
2. Comprueba que existe el usuario propietario (`SEED_OWNER_EMAIL` en `.env`).
   Si no existe, el script lo crea pidiendo `SEED_OWNER_PASSWORD`. No inventes credenciales.
3. Ensayo en seco primero, siempre que no lo hayas corrido antes:
   ```
   !npm run seed -- --dry-run
   ```
   Debe reportar 83 filas leídas, 0 escrituras.

## Ejecutar

```
!npm run seed
```

## Qué hace, y qué NO hace

- **Idempotente.** Se puede correr N veces: los que ya están se cuentan como duplicados y
  no se tocan. No borra nada.
- **No inventa datos.** Todo sale de `animes-seed.json`. Título, estado y progreso son
  literales del fichero. Año, sinopsis, géneros y formato **no** se rellenan aquí:
  eso es trabajo de `/project:enrich`.
- Mapeo fijo:
  | Campo del JSON | Destino |
  |---|---|
  | `titulo` | `anime.title` (+ `title_normalized` calculado) |
  | `estado` (`VISTO`) | `anime.status` |
  | `progresoEtiqueta` | `progress.label` |
  | `progresoTipo: COMPLETO` | `progress.kind = COMPLETO` |
  | `progresoTipo: T1` | `progress.kind = TEMPORADA`, `season = 1` |
  | `progresoTipo: EN_PROCESO` | `progress.kind = CUSTOM` |
  | `portada.driveFileId` | descarga desde `https://drive.google.com/uc?export=download&id=<ID>` |
- Cada portada pasa por el **mismo pipeline** que `/api/covers`: sha256 → sharp → WebP 82 →
  480×720 + 100×150 → `anime_cover.bytes` / `thumb_bytes`. `source_url` queda solo como
  referencia histórica; **la BD es la fuente de verdad**, no Drive.
- Concurrencia limitada y reintentos con backoff: Drive corta si se le piden 83 ficheros a la vez.

## Al terminar

El script imprime el informe. Reprodúcelo tal cual:

```
creados: N · duplicados omitidos: N · fallidos: N
portadas: descargadas N · reutilizadas por checksum N · fallidas N
```

Si hay fallidos, lista **título y motivo** de cada uno. Los motivos típicos:
Drive devuelve un interstitial HTML en vez del binario, el fichero ya no es público,
o el mime no es una imagen soportada. No los ocultes en un resumen optimista.

## Verificar

```
!npx tsx scripts/verify-seed.ts
```

Comprueba: 83 animes para el propietario, cada uno con progreso, y cuántos tienen portada
con bytes reales en la BD (no solo `source_url`).
