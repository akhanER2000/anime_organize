---
name: anime-vault-domain
description: Reglas de dominio de Anime Vault — normalización de títulos, deduplicación, mapeo de estados y progreso, contrato del pipeline de portadas y vocabulario controlado de etiquetas IA. Úsala SIEMPRE que toques títulos, duplicados, progreso, portadas o enriquecimiento con IA, y antes de reimplementar cualquiera de esas reglas.
---

# Dominio de Anime Vault

Este documento existe para que **estas reglas no se reinventen**. Están validadas contra
los 83 animes reales de `animes-seed.json`. Si vas a tocar normalización, deduplicación,
progreso, portadas o etiquetas de IA, la respuesta está aquí.

Código de referencia: `src/lib/domain/` — lógica **pura**, sin BD, sin React, sin `fetch`.

---

## 1. Normalización de títulos

Un solo sitio: `src/lib/domain/normalizar.ts` → `normalizarTitulo(titulo: string): string`.
El resultado se guarda en `anime.title_normalized` y es la clave de deduplicación.

### Los pasos, en este orden exacto

1. **`NFKC`** — colapsa ancho completo japonés a ASCII (`ＫＩＭＩ` → `KIMI`).
2. **Minúsculas** y `trim`.
3. **Quitar acentos** — `NFD` y descartar los diacríticos (`Mn`).
   `Kimi nó Ná wa` → `kimi no na wa`.
4. **Quitar sufijos de temporada** — solo los **explícitos**, con palabra clave, y solo
   al **final** de la cadena. Se aplica en bucle (hasta 3 pasadas) porque se acumulan.
5. **Puntuación → espacio** — todo lo que no sea `[0-9a-z]` pasa a espacio.
6. **Colapsar espacios** y `trim`.

### Qué SÍ se quita (paso 4)

| Patrón | Ejemplo |
|---|---|
| `(temporada\|temp\|season\|saison\|stagione\|staffel\|cour\|parte\|part)\s+(\d{1,2}\|[ivx]{1,4})$` | `Attack on Titan Season 2`, `… temporada 2`, `… Part 2`, `… Season II` |
| `\d{1,2}(st\|nd\|rd\|th)\s+season$` | `Attack on Titan 2nd Season` |
| `s\d{1,2}$` | `Attack on Titan S2` |
| `(the\s+)?final\s+season$` | `Attack on Titan: The Final Season` |

Los cinco ejemplos colapsan a `attack on titan`. Eso es lo que se quiere.

### Qué NO se quita — y por qué (aprendido de los datos reales)

Estas tres reglas parecen detalles y **son las que impiden perder animes del usuario**:

1. **Un número final suelto NO es una temporada.** Sin palabra clave, no se toca.
   - `White Album 2` → `white album 2` ≠ `White Album` → `white album`.
     Son dos series distintas y **ambas están en el vault**.
   - `Uchuu Senkan Yamato 2199` → `uchuu senkan yamato 2199`. El número es el título.
   - `Byousoku 5 Centimeter`, `Itsudatte Bokura no Koi wa 10 cm Datta.` — igual.

2. **El contenido de los paréntesis se conserva** (se quita el paréntesis, no lo de dentro).
   - `Higurashi no Naku Koro ni (2020)` → `higurashi no naku koro ni 2020`
     ≠ `Higurashi no Naku Koro Ni` → `higurashi no naku koro ni`.
     **El usuario tiene las dos.** Si se descarta el año, el seed pierde una.
   - `Versailles no Bara (Movie)` → `versailles no bara movie`.
   - `Kokurikozaka kara (La Colina de las Amapolas)` conserva el título en español.

3. **Los subtítulos no se recortan.** `Higurashi no Naku Koro ni Sotsu`,
   `Zutto Mae kara Suki deshita.: Kokuhaku Jikkou Iinkai`,
   `Chi.: Chikyuu no Undou ni Tsuite` mantienen todo tras la limpieza de puntuación.

### Verificación permanente

**Los 83 títulos reales producen 83 normalizados únicos: 0 colisiones.**
Ese es un test de regresión obligatorio (`normalizar.test.ts`): si un cambio en la
normalización introduce una colisión en el dataset real, el cambio está mal.

Casos que el test debe cubrir siempre:

```
'Higurashi no Naku Koro Ni'            -> 'higurashi no naku koro ni'
'Higurashi no Naku Koro ni (2020)'     -> 'higurashi no naku koro ni 2020'
'Higurashi no Naku Koro ni Sotsu'      -> 'higurashi no naku koro ni sotsu'
'White Album'                          -> 'white album'
'White Album 2'                        -> 'white album 2'
'Uchuu Senkan Yamato 2199'             -> 'uchuu senkan yamato 2199'
'Death Note (Temporada 1 & 2 )'        -> 'death note temporada 1 2'
"Dante's Inferno"                      -> 'dante s inferno'
'Chi.: Chikyuu no Undou ni Tsuite'     -> 'chi chikyuu no undou ni tsuite'
'Attack on Titan Season 2'             -> 'attack on titan'
'Attack on Titan 2nd Season'           -> 'attack on titan'
'Attack on Titan temporada 2'          -> 'attack on titan'
'Attack on Titan S2'                   -> 'attack on titan'
'Attack on Titan: The Final Season'    -> 'attack on titan'
'Fate/Zero'                            -> 'fate zero'
'Fate/stay night'                      -> 'fate stay night'
'Kimi nó Ná wa'                        -> 'kimi no na wa'
'ＫＩＭＩ　ＮＯ　ＮＡ　ＷＡ'                      -> 'kimi no na wa'
```

### Cambiar la normalización es una migración de datos

`title_normalized` está materializado en la BD y tiene un `UNIQUE`. Si cambias la función,
**hay que recalcular todas las filas en la misma migración**. Si no, quedan duplicados
invisibles y colisiones al insertar. Ver `.claude/agents/db-migrator.md`.

---

## 2. Deduplicación

Tres comprobaciones, en este orden. La primera que dispara, manda.

### (a) Coincidencia exacta → **bloquea**

`SELECT ... WHERE user_id = ? AND title_normalized = ?`

Si existe: se responde `ANIME_DUPLICADO` (409) con el mensaje **«Ya tienes este anime»** y
un enlace a la ficha existente. No se inserta. El `UNIQUE (user_id, title_normalized)` es la
red de seguridad si dos peticiones llegan a la vez: la violación se traduce a este mismo
código, **nunca a un 500**.

### (b) Mismo `anilist_id` → **es el mismo anime**

Dos títulos distintos con el mismo `anilist_id` son la misma obra (romaji vs english vs
sinónimo). Si el usuario ya tiene ese `anilist_id`, se trata como duplicado exacto aunque el
título normalizado difiera.

### (c) Similitud trigram > **0.55** → **pregunta, no bloquea**

```sql
SELECT id, title, similarity(title_normalized, $1) AS sim
FROM anime
WHERE user_id = $2 AND title_normalized % $1     -- usa el índice GIN
ORDER BY sim DESC
LIMIT 3;
```

Con `pg_trgm` y `set_limit(0.55)` / `similarity() > 0.55`.

Respuesta: **200 con `ok: true`** y `data.similares` (hasta **3** candidatos, cada uno con
`id`, `title` y su portada). No es un error: es una pregunta.
La UI muestra el aviso de duplicado del artboard 06 con dos botones:
**«Ver el que tengo»** y **«Añadir igualmente»**.

**El umbral es 0.55 y no se toca sin actualizar los tests.** Nota real: con este dataset,
`higurashi no naku koro ni` y `higurashi no naku koro ni 2020` superan 0.55, así que la
sugerencia salta — y está bien: el usuario decide y elige «Añadir igualmente».

### Regla crítica del seed y de la importación

**Los procesos por lotes (seed, importación de Excel) bloquean SOLO por (a) y (b).**
Nunca por similitud: si el seed descartara por trigram, tiraría los tres *Higurashi*
legítimos. La similitud es para el flujo interactivo, donde hay un humano decidiendo.

---

## 3. Mapeo de estados

`anime.status` es `text` + `CHECK`. Cinco valores, y solo cinco:

| Valor | Etiqueta UI | Color de punto | Color de texto |
|---|---|---|---|
| `VISTO` | Visto | `--estado-visto` | `--gold-200` |
| `VIENDO` | Viendo | `--estado-viendo` | `--estado-viendo-texto` |
| `EN_ESPERA` | En espera | `--estado-espera` | `--ash-400` |
| `ABANDONADO` | Abandonado | `--estado-abandonado` | `--estado-abandonado-texto` |
| `PENDIENTE` | Pendiente | `--ash-500` | `--ash-400` |

Desde el seed y desde importaciones, el texto libre se mapea así (sin acentos, minúsculas):

| Entrada | Destino |
|---|---|
| `visto`, `completado`, `terminado`, `completed`, `watched` | `VISTO` |
| `viendo`, `en curso`, `watching`, `en emision` | `VIENDO` |
| `en espera`, `pausado`, `on hold`, `paused` | `EN_ESPERA` |
| `abandonado`, `dropped`, `droppeado` | `ABANDONADO` |
| `pendiente`, `por ver`, `plan to watch`, `ptw` | `PENDIENTE` |
| cualquier otra cosa | `PENDIENTE` + fila en el reporte de importación |

En `animes-seed.json` los 83 vienen como `VISTO` (`estadoOriginal: "Visto"`).
**El estado nunca se comunica solo por color:** cada badge lleva su etiqueta de texto.

---

## 4. Mapeo de progreso

Tabla `progress`, PK = FK = `anime_id`: **como mucho una fila de progreso por anime**.

| `kind` | Campos que usa | Significado | Etiqueta por defecto |
|---|---|---|---|
| `COMPLETO` | — | todo visto | «Completo» |
| `TEMPORADA` | `season` | hasta el final de la temporada N | «Solo 1ra temporada» |
| `EPISODIO` | `season`, `episode` | punto exacto | «Temporada 2 · episodio 7» |
| `PORCENTAJE` | `percent` (0–100) | avance aproximado | «45 %» |
| `CUSTOM` | `label` | texto libre del usuario | lo que escriba |

`label` **siempre** se rellena: es lo que pinta la UI. Los demás campos son los que permiten
calcular la barra y los botones rápidos.

### Desde `animes-seed.json` (mapeo fijo, no se improvisa)

| `progresoTipo` | `progresoEtiqueta` | → `kind` | → campos |
|---|---|---|---|
| `COMPLETO` (69 filas) | `Completo (Todo Visto)` | `COMPLETO` | `label` = la etiqueta original |
| `T1` (4 filas) | `Solo 1ra Temporada` | `TEMPORADA` | `season = 1`, `label` = la original |
| `EN_PROCESO` (10 filas) | `En Proceso` | `CUSTOM` | `label` = la original |

Se conserva **la etiqueta original del usuario**, no una reescrita por nosotros.

### Barra de progreso (hairline dorada, siempre visible)

| `kind` | Relleno |
|---|---|
| `COMPLETO` | 100 % |
| `PORCENTAJE` | `percent` |
| `EPISODIO` | `episode / total_episodes` si se conoce `total_episodes`; si no, indeterminada |
| `TEMPORADA` | `season / total_seasons` si se conoce; si no, indeterminada |
| `CUSTOM` | indeterminada: pista sola, sin relleno |

Pista `--slate-700`, relleno `--gold-400` con `--halo-punto`.
En estado `ABANDONADO` el relleno es `--estado-abandonado` **sin halo**.

### Botones rápidos

- **+1 episodio** — `kind` pasa a `EPISODIO`, `episode += 1`. Si no había temporada, `season = 1`.
- **Marcar temporada completa** — `kind = TEMPORADA`, `season` actual.
- **Marcar todo visto** — `kind = COMPLETO` y `status = VISTO`.

Todos con **UI optimista**: se pinta el cambio y se revierte si el servidor falla.

---

## 5. Contrato del pipeline de portadas

> **La URL es solo el origen, nunca el almacenamiento.**
> La fuente de verdad son los bytes en Postgres. Drive es un espejo opcional.

### Entrada — `POST /api/covers`

Dos modos: `{ url }` o `multipart/form-data` con el fichero.

Pasos, en orden y sin saltarse ninguno:

1. **Descarga segura** — timeout 10 s, máximo 8 MB, solo `image/jpeg|png|webp|avif`.
   **Bloqueo de IPs privadas validando el host resuelto.** El detalle completo de SSRF está
   en `.claude/rules/security.md` §4 y es de obligada lectura antes de tocar
   `src/lib/covers/fetch-remote.ts`.
2. **sha256** del binario original. Si ese `checksum` ya existe **para ese usuario**, se
   reutilizan los bytes: no se vuelve a descargar ni a reprocesar.
3. **sharp → WebP calidad 82**, dos salidas:
   - portada **480 × 720** (`fit: cover`) → `anime_cover.bytes`
   - miniatura **100 × 150** → `anime_cover.thumb_bytes`
   Con `.rotate()` (respeta EXIF) y sin propagar metadatos.
4. **Guardar** ambos búferes, más `mime`, `width`, `height`, `size_bytes`, `checksum`.
   `source_url` se guarda **solo como referencia histórica**. Nada de la app lee de ahí.
5. **Espejo opcional a Drive** — si `GOOGLE_DRIVE_*` está configurado, se sube el WebP y se
   guarda `drive_file_id`. **Si Drive falla, la app sigue funcionando**: se registra el aviso
   y se continúa. La BD es la fuente de verdad.

### Salida — `GET /api/covers/[animeId]?size=full|thumb&v=<checksum>`

- Comprueba la propiedad **antes** de servir. Anime ajeno → **404**.
- Devuelve el binario con `Content-Type: image/webp`.
- `Cache-Control: public, max-age=31536000, immutable`.
- `ETag` = `checksum`. Con `If-None-Match` coincidente → **304** con cuerpo vacío.
- Sin portada → **404** con un **placeholder SVG de laja negra** generado al vuelo
  (fondo `--slate-850`, polígonos de fractura, inicial del título en Cormorant `--ash-500`).

### Trampas de sharp verificadas (no las redescubras)

Comprobadas con sharp `0.35.3` / libvips `8.18.3` en `src/lib/covers/sharp-pipeline.test.ts`:

| Trampa | Realidad |
|---|---|
| **AVIF no es un formato propio de sharp** | `sharp.format.avif` es `undefined`. AVIF es un contenedor de la familia HEIF: la capacidad se consulta en `sharp.format.heif`. |
| **Un AVIF reporta `metadata().format === "heif"`** | Un validador que compruebe `=== "avif"` **rechaza todas las portadas AVIF** que el contrato dice aceptar. |
| Magic bytes de AVIF | caja `ftyp` en el offset 4 y marca `avif` en el 8. Eso es lo que hay que comprobar: el `Content-Type` lo controla quien sube el fichero. |
| Magic bytes de WebP | `RIFF` en el offset 0 y `WEBP` en el 8. |
| `withMetadata` por defecto | Re-encodear **no** propaga el EXIF del original (`meta.exif` queda `undefined`). Eso destruye el GPS incrustado, y es una medida de seguridad además de de formato. |
| Entrada que no es imagen | `sharp(buf).metadata()` **rechaza la promesa**. Hay que capturarlo y traducirlo a `TIPO_NO_SOPORTADO`, no dejar que suba como 500. |

Nota de dependencias: `package.json` fuerza `sharp@^0.35.3` con `overrides`, por encima
del `^0.34.3` que Next 15 declara como `optionalDependency`, para eliminar las CVEs de
libvips. Está verificado de extremo a extremo: `npm run build` compila y el optimizador de
imágenes de Next devuelve `image/webp` correcto en runtime.

### Invariantes que se testean

- El `<img>` de la app apunta **siempre** a `/api/covers/...`, nunca al dominio original.
  Ese es el punto del e2e crítico.
- Dos animes con la misma imagen no duplican bytes: mismo `checksum`, se reutiliza.
- La proporción es **2:3 sin excepción** (`aspect-ratio: 2/3`, `object-fit: cover`).

---

## 6. Vocabulario controlado de etiquetas IA

`genre.kind = 'IA'`. El modelo **elige de esta lista de 26** y puede proponer
**máximo 2 nuevas** por anime. Cualquier otra cosa se descarta en la validación Zod.

```
romance                      romance-tragico              yandere
tsundere                     psicologico                  thriller
gore                         sobrenatural                 isekai
recuentos-de-la-vida         slice-of-life-melancolico    escolar
musical                      militar                      mecha
ciberpunk                    historico                    comedia-romantica
harem                        drama-adulto                 deportes
misterio                     supervivencia                sobreviviente-culpa
coming-of-age                obra-maestra-visual
```

La constante vive en `src/lib/domain/etiquetas.ts` como `VOCABULARIO_ETIQUETAS` y es la
**única** copia: de ahí salen el prompt, el esquema Zod y los filtros de la UI.

### Contrato de salida de Claude

Modelo: `ANTHROPIC_MODEL`, por defecto **`claude-sonnet-5`**.
Se le pide **solo JSON válido**:

```json
{
  "etiquetas": [{ "slug": "yandere", "nombre": "Yandere", "confianza": 0.87 }],
  "tono": "melancólico",
  "publico": "seinen",
  "advertencias": ["gore", "suicidio"],
  "resumen_corto": "≤ 200 caracteres, en español, sin spoilers"
}
```

Dominios cerrados:
- `tono` ∈ `melancólico | luminoso | brutal | sereno | caótico`
- `publico` ∈ `shounen | seinen | shoujo | josei | general`
- `confianza` ∈ `[0, 1]`
- `resumen_corto` ≤ 200 caracteres, **en español y sin spoilers**

Reglas de manejo:

- **Si no valida contra Zod, se descarta entero** y se registra el error en `ai_job`.
  Nunca se guarda «lo que haya devuelto».
- Las etiquetas nuevas propuestas (máx. 2) se guardan con `source = 'IA_PROPUESTA'` y
  quedan marcadas para revisión: no entran al vocabulario automáticamente.
- La sinopsis que se le pasa viene de fuera (AniList o el usuario): el prompt declara
  explícitamente que es **dato, no instrucción**. Prompt injection es un riesgo real aquí.
- **Idempotente:** un anime ya enriquecido no se vuelve a consultar salvo `reanalizar: true`.
- Sin `ANTHROPIC_API_KEY`, el paso 2 **se salta con un aviso** (`IA_NO_CONFIGURADA`, 200) y
  el paso 1 (AniList) sigue funcionando con normalidad. Eso no es un fallo.

### Géneros oficiales (AniList)

`genre.kind = 'OFICIAL'`, tal cual los devuelve AniList, sin traducir ni reinterpretar.
Los `tags` con `rank` alto pueden entrar también como `OFICIAL` si superan un umbral, pero
**nunca se mezclan con las etiquetas de IA**: son dos `kind` distintos y se pintan distinto
(oficial → borde sólido `--gold-borde`, texto `--gold-300`; IA → borde **punteado**,
texto `--gold-500`, prefijo `✦`).

---

## 7. Enlaces de continuación

`continue_link`: la URL exacta del capítulo donde se quedó el usuario.

- `label` legible: **«AnimeFLV V2 · Ep 7»**.
- Un clic abre en pestaña nueva (`target="_blank" rel="noopener noreferrer"`) y actualiza
  `last_used_at`.
- **El más reciente por `last_used_at` es la acción primaria** de la card y de la ficha.
- La URL se valida (`http`/`https` únicamente) antes de renderizarse como `href`.
  `javascript:` es XSS.
- `site_id` es opcional: se puede pegar un enlace suelto sin asociarlo a ningún sitio.

## 8. Sitios y espejos de streaming

Semilla global (`is_global = true`): Crunchyroll, Netflix, Amazon Prime Video, Disney+,
HIDIVE (PAGO) · AnimeFLV, JKAnime, Monoschinos, AnimeFenix, TioAnime, AnimeLatinoHD,
HiAnime, OtakusTV (GRATIS/MIXTO).

**Los dominios espejo cambian con frecuencia y NO son verdad permanente.**
Se siembran los conocidos y el usuario añade, edita, reordena y desactiva desde
Ajustes → Sitios. `streaming_mirror` con etiqueta `V1`, `V2`, `V3`… y `sort`.
El botón «Comprobar espejos» hace `HEAD` a cada URL y marca `is_active = false` los caídos,
guardando `last_checked_at`. Nunca se borra un espejo automáticamente: se desactiva.
