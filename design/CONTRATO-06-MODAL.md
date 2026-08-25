# CONTRATO 06 · Modal «Añadir al vault»

> Documento para quien construye el modal. **Todo valor lleva su token.** Donde el
> artboard y una norma del proyecto no coinciden, se dice explícitamente y se aplica el
> orden de autoridad. Lo que no está en ninguna fuente está al final, en
> **§13 HUECOS**, y no se ha inventado en el cuerpo del contrato.

## 0. De dónde sale cada número

Orden de autoridad, sin apelación:

| # | Fuente | Qué manda |
|---|---|---|
| 1 | `design/tokens.css` · `design/tokens.json` | color, tipografía, espaciado, radio, sombra, duración |
| 2 | `design/DESIGN-SPEC.md` §3 (breakpoints) · §4/06 (artboard) · §4/12 (móvil) · §5 · §6 (tabla de componentes) · §7 (accesibilidad) | medidas, estados, comportamiento |
| 3 | `design/screens/06-modal-anadir.png` · `design/screens/12-movil.png` | lo que se ve |
| 4 | `design/ANIME-VAULT.dc.html` líneas 879–1000 (escritorio) y 1600–1640 (hoja móvil) | literales en línea. **Si contradice a `tokens.css`, gana `tokens.css`** |

Y, fuera de la cadena visual pero igual de normativas para el comportamiento:
`.claude/skills/anime-vault-domain/SKILL.md` §2 (duplicados) y §5 (portadas),
`.claude/rules/design-tokens.md` (reglas del oro y contraste),
`.claude/rules/api-conventions.md` (códigos de error).

### Convenio de lectura de las tablas

- **Artboard** = el literal medido en `ANIME-VAULT.dc.html`.
- **Contrato** = lo que se escribe en el código. Cuando el literal **no tiene token**, el
  contrato lo redondea al token existente más cercano y la fila queda marcada `▲`.
  Motivo: `design-tokens.md` — «si un valor no está ahí, no se escribe en el código».
  Los redondeos son de ±2 px y ninguno cambia la lectura del artboard.
- `▲` = decisión mía. `⚠` = contradicción entre fuentes, resuelta y explicada.

### Lo que NO es parte del producto

El botón `⟳ alternar estado duplicado` de la esquina superior derecha del artboard
(línea 896 del `.dc.html`) es **andamiaje del prototipo**. `design/scripts/` es desechable
y no va a producción. No se construye.

Las cinco portadas del fondo y la imagen de la vista previa
(`assets/web/kintsugi-icono.jpg`) son **relleno de artboard**. DESIGN-SPEC §5:
«los huecos de portada van vacíos a propósito: las imágenes de prueba no forman parte del
sistema».

---

## 1. El velo de fondo

**No hay desenfoque. En ninguna parte.** `backdrop-filter` y `blur()` aparecen **cero
veces** en `ANIME-VAULT.dc.html` (verificado con `grep -c`), y `DESIGN-SPEC.md` §8 lo
prohíbe de frente: «la elevación se comunica con el hairline dorado y con `--sombra-losa`,
**nunca con blur teñido**».

| Capa | Escritorio | Móvil | Token |
|---|---|---|---|
| Contenido de detrás | la biblioteca, `opacity: .4` | la biblioteca, `opacity: .35` | — |
| Velo | `rgba(7,8,10,.86)` | `rgba(7,8,10,.88)` | `--void` al 86 % / 88 % |
| Desenfoque | **ninguno** | **ninguno** | — |

Se escribe como token + modificador de opacidad, nunca como `rgba()` suelto:

```
backdrop:bg-[var(--void)]/86        /* escritorio */
backdrop:bg-[var(--void)]/88        /* móvil */
```

Los dos valores caen dentro de la banda que fija `design-tokens.md` («siempre bajo un velo
de `--void` al 86–97 %»), así que la diferencia 86 / 88 es intencionada, no un descuido.

`src/components/ui/modal.tsx` ya escribe `backdrop:bg-[var(--void)]/86`. En móvil hay que
subirlo a `/88`.

**El velo NO oscurece la biblioteca por sí solo**: la biblioteca de detrás va además al
40 % (35 % en móvil). Si el modal se monta sobre la página real y no sobre una maqueta, ese
40 % **no se aplica a la página** — es una licencia del artboard para que la maqueta
enseñe algo detrás. Ver §13.6.

### Cierre por clic en el velo

`::backdrop` no emite eventos propios. Se detecta comparando el objetivo del clic con el
propio `<dialog>` (ya implementado en `modal.tsx`). Comportamiento: **cierra sin guardar**,
idéntico a `Cancelar` y a `Esc`.

---

## 2. Medidas del modal en los cuatro breakpoints

DESIGN-SPEC §3, fila **Modal**: `760 px centrado` · `680 px` · `90 vw` · `hoja inferior a
sangre`. Los rangos salen de la tabla de breakpoints de §3.

| Breakpoint | Rango | Forma | Ancho | Alto | Radio | Sombra | Aire vertical |
|---|---|---|---|---|---|---|---|
| `desktop` | ≥ 1440 | modal centrado | **760 px** | contenido, tope `calc(100dvh - 2 × var(--e-12))` | `--radio-card` (6) en las 4 esquinas | `--sombra-losa` | **96 px** = `--e-12` arriba y abajo |
| `laptop` | 1024–1439 | modal centrado | **680 px** | ídem | `--radio-card` (6) | `--sombra-losa` | `--e-12` (96) ▲ *la spec solo fija 96 para desktop; se extiende por coherencia* |
| `tablet` | 768–1023 | modal centrado | **`min(90vw, 680px)`** ⚠ ver §12.1 | contenido, tope `calc(100dvh - 2 × var(--e-6))` | `--radio-card` (6) | `--sombra-losa` | `--e-6` (48) ▲ ver §13.1 |
| `movil` | 390–767 | **hoja inferior a sangre** | **100 %** del viewport (`left:0; right:0; bottom:0`) | contenido, tope `90dvh` ▲ ver §13.2 | **10 px arriba, 0 abajo** ⚠ sin token, ver §12.2 | `--sombra-hoja` | ninguno arriba: se pega al borde inferior |

Traducido a los breakpoints de `globals.css` (que **borran** los de Tailwind: no existe
`md:`, solo `movil:` `tablet:` `laptop:` `desktop:`), el modal se escribe móvil primero:

```
/* base = móvil: hoja inferior a sangre */
tablet:  ancho min(90vw, 680px) · centrado · radio card · sombra losa
laptop:  ancho 680px
desktop: ancho 760px
```

### Desbordamiento vertical · lo que la spec no dice y hace falta

El lienzo del artboard es `1440 × min 1080` (**1303 con el aviso de duplicado**). Con
96 px de aire arriba y abajo, el modal completo pide **~1111 px de alto en el estado con
aviso**. En un portátil de 1024×768 **no cabe**. La spec no fija regla de desbordamiento.

Contrato: **la cabecera y el pie se quedan fijos; el cuerpo hace scroll.**

| Zona | Comportamiento |
|---|---|
| Cabecera (§5) | fija · `position: sticky; top: 0` · fondo `--slate-900` |
| Cuerpo (§6) | `overflow-y: auto` · `overscroll-behavior: contain` |
| Pie (§7) | fijo · `position: sticky; bottom: 0` · fondo `--slate-950` |

Es una **decisión mía**, la más conservadora que respeta lo que sí está fijado: la regla
del oro exige que `Añadir al vault` sea visible sin depender de dónde esté el scroll, y §7
exige que el foco sea siempre visible. Ver §13.1.

### `overflow: hidden` está PROHIBIDO en el contenedor del modal

El pie del artboard lleva su **propio** radio inferior (`border-radius: 0 0 6px 6px`,
línea 991) en vez de recortarse contra el radio del modal. Eso no es casualidad y hay que
conservarlo: un `overflow: hidden` en el modal **recortaría el anillo de foco** de 2 px con
2 px de offset de los controles pegados al borde, y §7 dice «foco siempre visible, nunca
`outline:none` sin sustituto». La lista de autocompletado sí lleva su `overflow: hidden`
(§6.2), porque ahí no hay controles tabulables al borde.

---

## 3. La caja: borde superior dorado, radio y sombra

DESIGN-SPEC §6, fila **Modal / hoja**, columna `default`:
«`--slate-900` + borde superior `--gold-400`».

| Propiedad | Escritorio | Móvil | Token |
|---|---|---|---|
| Fondo | `#121417` | `#121417` | `--slate-900` |
| **Borde superior** | **1 px sólido `#C9A227`** | **1 px sólido `#C9A227`** | `--borde-fino` + `--gold-400` |
| Bordes lateral e inferior | 1 px sólido `#282D33` | ninguno (va a sangre) | `--slate-700` |
| Radio | 6 px, las 4 esquinas | 10 px arriba, 0 abajo ⚠ §12.2 | `--radio-card` |
| Sombra | `0 8px 24px rgba(0,0,0,.6)` | `0 -8px 24px rgba(0,0,0,.6)` | `--sombra-losa` / `--sombra-hoja` |
| Fondo del pie | `#0C0E10` | igual que el cuerpo | `--slate-950` |
| Separador cabecera / pie | 1 px `#1E2226` | ninguno | `--slate-800` |

El borde dorado es **solo el superior**. Es la veta kintsugi en su forma de «lo destacado
lleva un hairline dorado», no un marco. Un borde dorado completo incumpliría la regla del
oro nº 2 («nunca oro sobre oro»: dentro del modal ya hay etiquetas `--gold-300`, la vista
previa con marco `--gold-700` y el botón sólido).

> **Falta en la primitiva.** `src/components/ui/modal.tsx` escribe
> `border-t border-t-[var(--gold-400)]`, que deja los otros tres lados a **0**. Falta
> `border border-[var(--slate-700)]` antes del `border-t`. Sin eso el modal se funde con
> el velo por los laterales.

### Tirador de la hoja móvil

DESIGN-SPEC §12: «tirador de 44 × 3 px».

| Propiedad | Artboard | Contrato |
|---|---|---|
| Tamaño | 44 × 3 px | `--tactil-min` × 3 px |
| Color | `#363C44` | `--slate-600` |
| Radio | 2 px | `--radio-barra` (1) ▲ |
| Posición | `margin: 0 auto 22px` | centrado, `margin-bottom: var(--e-3)` ▲ (22→24) |

El tirador es **decorativo**: `aria-hidden="true"`. No sustituye a un control de cierre
accesible — ver §13.3.

---

## 4. Anatomía vertical (escritorio)

Los paddings verticales del artboard (26 / 22 / 28) están **fuera de la rejilla de 8**.
`globals.css` declara `--e-3-5: 28px` pero deja escrito que **«NO se usa como espaciado
general»**. Por eso el contrato normaliza:

> **Todo padding vertical de bloque del modal = `--e-3` (24 px).
> Todo padding horizontal = `--e-4` (32 px).**
> Única excepción: el bloque **Título** cierra con `--e-1` (8 px), porque la lista de
> autocompletado ya aporta su propio aire por debajo.

| # | Bloque | Artboard | Contrato | Borde |
|---|---|---|---|---|
| 1 | Cabecera | `26 32 22` | `--e-3` / `--e-4` / `--e-3` ▲ | `border-bottom: 1px var(--slate-800)` |
| 2 | Título + autocompletado | `28 32 8` | `--e-3` / `--e-4` / `--e-1` ▲ | — |
| 3 | Aviso (duplicado o error) | `margin: 22 32 0` · `padding: 20 22` | `margin: var(--e-3) var(--e-4) 0` · `padding: var(--e-2-5)` ▲ | ver §8 |
| 4 | Imagen (2 columnas) | `26 32 0` | `--e-3` / `--e-4` / `0` ▲ | — |
| 5 | Estado | `26 32 0` | `--e-3` / `--e-4` / `0` ▲ | — |
| 6 | Progreso | `26 32 28` | `--e-3` / `--e-4` / `--e-3` ▲ | — |
| 7 | Pie | `22 32` | `--e-3` / `--e-4` ▲ | `border-top: 1px var(--slate-800)` |

El bloque 3 **solo existe cuando hay aviso**, y va **entre el bloque 2 y el bloque 4**.
Eso fija su posición en el orden de tabulación (§10.3).

---

## 5. Cabecera

| Elemento | Artboard | Contrato (token) |
|---|---|---|
| Disposición | `flex`, `align-items:center`, `justify-content:space-between` | ídem |
| Título | `300 32px/1` Cormorant, `+.02em`, `#F4F1EA` | `font-display` · `--fs-titulo-m` · `--fw-display-light` · `--tracking-display` · `--porcelain-050` |
| Separación título/subtítulo | `margin-bottom: 8px` | `--e-1` |
| Subtítulo | `400 12px/1` IBM Plex Mono, `#565E68` | `font-mono` · `--fs-mono` · **`--ash-400`** ⚠ §11 |
| Texto del título | «Añadir al vault» | igual |
| Texto del subtítulo | «busca en AniList o rellena la ficha a mano» | igual |
| Botón cerrar | 32 × 32, borde 1 px `#282D33`, radio 4, `#7A838E`, glifo `×` a 15 px | `--e-4` · `--slate-700` · `--radio-input` · `--ash-400` · `--fs-cuerpo-s` |

`--fs-titulo-m` (32 px) es exactamente lo que DESIGN-SPEC §2 llama **«H3 modal»**.

El botón de cerrar mide 32 px: cumple §7 en escritorio («≥ 32 px con separación de 8 px»)
y **no aparece en móvil** (lo sustituye el tirador + `Esc` + clic en el velo).
En móvil tampoco hay subtítulo, y el título baja a `--fs-titulo-s` (28 px), que es lo que
§2 llama «H3 de hoja inferior móvil».

Semántica: el `<h3>` del artboard se monta como el elemento al que apunta
`aria-labelledby` del `<dialog>`. El nivel real de encabezado (`<h2>` en `modal.tsx`) es
independiente del tamaño tipográfico y no cambia nada visual.

---

## 6. Los campos, uno a uno

### Tabla resumen

| # | Etiqueta visible | Tipo de control | Placeholder / contenido | ¿Obligatorio? | Base |
|---|---|---|---|---|---|
| 1 | **TÍTULO** | `combobox` de texto con autocompletado remoto (AniList) | sin placeholder en el artboard ⚠ §13.4 · pista fija `AniList` a la derecha | **Sí** | `anime.title` es `NOT NULL` |
| 2 | **URL DE IMAGEN** | `input type="url"` | `https://s4.anilist.co/file/anilistcdn/media/anime/cover/…` (truncado con elipsis) | No | `anime_cover` es tabla hija opcional |
| 3 | *(sin etiqueta)* zona de arrastre | `input type="file"` + zona soltable | «Arrastra una imagen aquí» / «JPG o PNG · máx 4 MB · 2:3 recomendado» ⚠ §12.3 | No | alternativa a #2 |
| 4 | **VISTA PREVIA** | **no es un campo**: salida de #2 o #3 | — | — | — |
| 5 | **ESTADO** | `radiogroup` de chips | 4 chips en el artboard ⚠ §12.4 | **Sí** (con valor por defecto) | `anime.status` `NOT NULL` + `CHECK` |
| 6 | **PROGRESO** | `select` Temporada + `select` Episodio + botón «Personalizado…» | valores `1` y `26` en el artboard | No | `progress` es tabla hija opcional |

**El artboard no marca ningún campo como obligatorio** — ni asterisco, ni `(obligatorio)`,
ni nada. Ver §13.4.

**No hay campo para**: año, formato, episodios totales, títulos alternativos, sinopsis,
géneros, favorito, ni enlace de continuación. El subtítulo promete «rellena la ficha a
mano» y a mano solo se puede rellenar el título. Ver §13.5.

### Etiqueta de sección (TÍTULO · URL DE IMAGEN · VISTA PREVIA · ESTADO · PROGRESO)

| Propiedad | Artboard | Contrato |
|---|---|---|
| Tipografía | `600 11px/1` Inter | `font-ui` · `--fs-etiqueta` · `--fw-ui-bold` |
| Transformación | `UPPERCASE` | `uppercase` |
| Tracking | `.18em` | `--tracking-etiqueta` |
| Color | `#DDBB5C` | `--gold-300` |
| Separación con el control | `margin-bottom: 12px` | `--e-1-5` |

`--gold-300` y **nunca `--gold-400`**: `design-tokens.md` lo dice explícito («satura»).
Son `<label>` reales, conectadas con su control por `htmlFor`/`id`.

---

### 6.1 · TÍTULO

| Propiedad | Artboard | Contrato |
|---|---|---|
| Fondo | `#1E2226` | `--slate-800` |
| Borde (en foco) | 1 px `#C9A227` | `--borde-fino` + `--gold-400` |
| Anillo (en foco) | `outline: 2px solid rgba(201,162,39,.3)` · `offset: 2px` | `--gold-foco` · `--anillo-foco-offset` |
| Borde (en reposo) | *no lo muestra el artboard* | `--slate-600` (§6, fila Input, `default`) |
| Radio | 4 px | `--radio-input` |
| Padding | `14px 16px` | `px-[var(--e-2)]` ▲ |
| Alto efectivo | ≈ 45 px | **`--tactil-min` (44)** ▲ — es lo que ya usa `Campo` |
| Separación icono/texto | `gap: 10px` | `--e-1-5` ▲ |
| Icono de lupa | SVG 15 × 15, `stroke:#C9A227`, `stroke-width:1` | `--gold-400` |
| Texto escrito | `400 15px/1` Inter, `#E6E2DA` | `font-ui` · `--fs-cuerpo-s` · `--porcelain-100` |
| Cursor | `#C9A227` | `caret-[var(--gold-400)]` |
| Pista «AniList» | `400 11px/1` mono, `#565E68` | `font-mono` · `--fs-mono-s` · **`--porcelain-200`** ⚠ §11 |

**El PNG muestra este campo EN FOCO** (borde dorado + anillo `--gold-foco` + cursor
visible). Eso no es decoración del artboard: es la evidencia de dónde entra el foco al
abrir el modal. Ver §10.1.

El estado `active` del input que fija §6 —«cursor visible en `--gold-400`»— es el
`caret-color`, y ya está en la primitiva `Campo`.

Estados del campo (DESIGN-SPEC §6, fila **Input / textarea**):

| Estado | Contrato |
|---|---|
| `default` | fondo `--slate-800`, borde `--slate-600` |
| `hover` | fondo `--slate-700` (la spec pide «borde aclarado» y `--slate-500` no existe; es la solución que ya tomó `Campo`) |
| `focus` | borde `--gold-400` + anillo `--gold-foco` de 2 px con `--anillo-foco-offset` |
| `active` | `caret-color: var(--gold-400)` |
| `disabled` | fondo `--slate-900`, texto `--ash-inactivo`, `cursor:not-allowed` |
| `loading` | esqueleto de 44 px — aquí se pinta **dentro de la lista**, ver §13.7 |
| `error` | borde `--estado-abandonado` + mensaje mono `--estado-abandonado-texto` con `⚠` |

---

### 6.2 · Lista de autocompletado

DESIGN-SPEC §4/06: «máximo **3** visibles, ítem activo con `--gold-wash` y veta izquierda;
miniatura 30 × 44».

| Propiedad | Artboard | Contrato |
|---|---|---|
| Separación con el campo | `margin-top: 6px` | `--e-1` (8) ▲ |
| Fondo | `#1E2226` | `--slate-800` |
| Borde | 1 px `#363C44` | `--slate-600` |
| Radio | 4 px | `--radio-input` |
| Sombra | `0 8px 24px rgba(0,0,0,.6)` | `--sombra-losa` |
| Recorte | `overflow: hidden` | ídem (no hay controles tabulables al borde) |
| Ítems visibles | 3 (2 en móvil) | ídem |

Cada ítem:

| Propiedad | Artboard | Contrato |
|---|---|---|
| Padding | `11px 16px` | `py-[var(--e-1-5)] px-[var(--e-2)]` ▲ |
| Separación | `gap: 14px` | `--e-2` ▲ |
| Miniatura | 30 × 44, radio 3, fondo `#282D33`, borde 1 px `#363C44` | 30 × 44 (literal de la spec) · `--radio-chip` · `--slate-700` · `--slate-600` |
| Borde izquierdo | 1 px `transparent` | `--borde-fino` transparente — reserva el hueco de la veta |

| Estado del ítem | Fondo | Borde izquierdo | Título | Meta |
|---|---|---|---|---|
| **activo / seleccionado** | `--gold-wash` | 1 px `--gold-400` | `500 14/1.3` Inter · `--porcelain-050` | mono 11 · `--porcelain-200` ⚠ §11 · más la pista `↵` en `--gold-300` |
| reposo | ninguno | transparente | `500 14/1.3` Inter · `--porcelain-200` | mono 11 · `--porcelain-200` ⚠ §11 |
| `hover` | `--slate-700` | transparente | `--porcelain-100` | ídem |

Meta del artboard: `TV · 2005 · 26 ep · 蟲師` — formato, año, episodios y título nativo,
separados por `·`. Es `--fs-mono-s` (11 px).

La veta izquierda del ítem activo es la **forma nº 2** de la veta kintsugi que fija
DESIGN-SPEC §1 («borde izquierdo en hover sobre la card o fila»).

**Patrón ARIA:** combobox con `aria-expanded`, `aria-controls`, `aria-activedescendant`.
La lista **no es tabulable**: se recorre con `↑`/`↓` y se elige con `↵` (que es
exactamente lo que anuncia la pista `↵` del ítem activo). Ver §10.3.

**Estado de carga de la búsqueda** — no está en ningún artboard. Ver §13.7.

---

### 6.3 · URL DE IMAGEN

| Propiedad | Artboard | Contrato |
|---|---|---|
| Fondo | `#1E2226` | `--slate-800` |
| Borde | 1 px `#363C44` | `--slate-600` |
| Radio | 4 px | `--radio-input` |
| Padding | `13px 16px` | `px-[var(--e-2)]` ▲ |
| Alto efectivo | ≈ 41 px | **`--tactil-min` (44)** ▲ — coherente con TÍTULO |
| Tipografía | `400 13px/1` IBM Plex Mono | `font-mono` · `--fs-ui-s` |
| Color del texto | `#7A838E` | `--porcelain-200` ⚠ §11 (fondo `--slate-800`) |
| Desbordamiento | `text-overflow: ellipsis; white-space: nowrap` | ídem |

Es **mono** y no Inter porque es un dato, no prosa: DESIGN-SPEC §2, fila «Datos y meta».
El truncado con elipsis es parte del diseño: una URL de portada de AniList no cabe.

El **placeholder** —cuando el campo está vacío— sí usa `--ash-inactivo`: es uno de los dos
usos legítimos que autoriza `design-tokens.md`.

Validación: `security.md` §8 exige que la URL se valide (`http`/`https` únicamente) antes
de renderizarse como `href`; `javascript:` es XSS. El campo **no** dispara la descarga: eso
lo hace el servidor en `POST /api/covers`, con toda la lista de SSRF de `security.md` §4.

---

### 6.4 · Zona de arrastre de la portada

DESIGN-SPEC §6, fila **Zona de arrastre**, es la fuente de los estados.

| Propiedad | Artboard | Contrato |
|---|---|---|
| Separación con el campo URL | `margin-top: 12px` | `--e-1-5` |
| Borde | **1 px `dashed` `#363C44`** | `--borde-fino` `dashed` `--slate-600` |
| Radio | 4 px | `--radio-input` |
| Padding | `18px` | `--e-2` (16) ▲ |
| Disposición | `flex`, `align-items:center`, `gap:12px` | `--e-1-5` |
| Icono | SVG 20 × 20 (flecha de subida), `stroke:#7A838E`, `stroke-width:1` | `--ash-400` · trazo de 1 px, como toda la iconografía hairline del sistema |
| Texto principal | `400 13px/1.3` Inter, `#C9C6BF` | `font-ui` · `--fs-ui-s` · `--porcelain-200` |
| Texto de ayuda | `400 11px/1` mono, `#565E68` | `font-mono` · `--fs-mono-s` · **`--ash-400`** ⚠ §11 |

Copia: **«Arrastra una imagen aquí»** / **«JPG o PNG · máx 4 MB · 2:3 recomendado»**.
⚠ Esa segunda línea contradice el contrato real del servidor — ver **§12.3**.

#### Los seis estados

| Estado | Borde | Fondo | Resto | Fuente |
|---|---|---|---|---|
| `default` / `vacío` | 1 px `dashed` `--slate-600` | ninguno | icono + los dos textos de ayuda | §6 + artboard |
| `hover` | 1 px `dashed` **`--gold-400`** | ninguno | — | §6 + artboard (`style-hover`) |
| `focus` | 1 px `dashed` `--slate-600` | ninguno | **anillo 2 px `--gold-400`, offset 2 px** | §6 + §7 |
| `active` (soltando encima) | 1 px `dashed` `--gold-400` | **`--gold-wash`** | — | §6 |
| `loading` (subiendo) | 1 px `dashed` `--slate-600` | ninguno | **barra de progreso dorada**: pista `--slate-700`, relleno `--gold-400` + `--halo-punto`, alto `--borde-acento` (2 px) ▲ ver §13.8 | §6 |
| `error` | 1 px `dashed` **`--estado-abandonado`** | ninguno | **el motivo** debajo: mono `--fs-mono` en `--estado-abandonado-texto` con `⚠` | §6 + §4/07 |

`focus` y `hover` son estados **distintos** y se ven distintos: el `hover` cambia el borde,
el `focus` añade el anillo. Un puntero encima no es un foco de teclado.

La zona es **tabulable** (es un control de archivo) y se activa con `Enter` y `Espacio`.
El `dragover`/`drop` se maneja además con `preventDefault()` en `dragover`, o el navegador
abre la imagen en la pestaña.

Motivos de error que puede pintar (de `api-conventions.md`): `IMAGEN_DEMASIADO_GRANDE`,
`TIPO_NO_SOPORTADO`, `IMAGEN_NO_DESCARGABLE`. El `mensaje` del sobre viene **ya en
español y apto para enseñarlo tal cual**, así que se pinta literalmente.

---

### 6.5 · Vista previa

| Propiedad | Artboard | Contrato |
|---|---|---|
| Columna | `grid-template-columns: 1fr 232px`, `gap: 24px` | `--e-3` de gap · 232 px de columna fija |
| Proporción | `aspect-ratio: 2/3` | **2:3 sin excepción** (skill de dominio §5) |
| Marco | **1 px sólido `#6E5417`** | `--borde-fino` + `--gold-700` |
| **Radio** | **ninguno** | **`--radio-marco` (0)** |
| Aire interior | `padding: 6px` | `--e-1` (8) ▲ |
| Fondo del marco | `#07080A` | `--void` |
| Imagen | `100% × 100%`, `object-fit: cover` | ídem |

**El marco dorado nunca lleva radio** — `--radio-marco: 0` está declarado en `tokens.css`
justo para esto. Es el mismo tratamiento que la portada de la ficha (§4/05) y que la
captura enmarcada de la landing (§4/02): marco `--gold-700` de 1 px con aire y esquinas
vivas.

`--gold-700` y no `--gold-400`: un marco `--gold-400` alrededor de la portada, dentro de un
modal que ya tiene borde superior `--gold-400`, sería **oro sobre oro** (regla nº 2).

Sin imagen: DESIGN-SPEC §5 fija fondo `--slate-850` + inicial del título en Cormorant.
Ver §12.5 sobre el tamaño de esa inicial.

---

### 6.6 · ESTADO

Grupo de chips. Es un **`radiogroup`**, no un grupo de casillas: el estado es uno solo.

| Propiedad | Artboard | Contrato |
|---|---|---|
| Separación entre chips | `gap: 8px` | `--e-1` |
| Padding del chip | `9px 14px` | `px-[var(--e-1-5)]` ▲ |
| Alto | 32 px | **`--e-4` (32)** — coincide con §6 («alto 32 px, radio 3») y con la primitiva `Chip` |
| Radio | 3 px | `--radio-chip` |
| Tipografía | `500 12px/1` Inter | `font-ui` · `--fs-ui-xs` · `--fw-ui-medium` |
| Punto de color | 6 × 6 px, cuadrado | `size-[6px]` · `--radio-barra` |
| Separación punto/texto | `gap: 8px` | `--e-1` |

| Chip | Punto | Borde | Fondo | Texto |
|---|---|---|---|---|
| **activo** | el de su estado | `--gold-borde` ⚠ *el artboard escribe `rgba(201,162,39,.5)`; `tokens.css` solo tiene `.45` → gana `tokens.css`* | `--gold-wash` | `--gold-200` |
| reposo | el de su estado | `--slate-700` | **`--slate-950`** ⚠ ver nota | `--porcelain-200` |
| `hover` | ídem | `--slate-600` | `--slate-950` | `--porcelain-100` |
| `focus` | ídem | ídem | ídem | + anillo 2 px `--gold-400` offset 2 px |
| `disabled` | ídem | ídem | ídem | `opacity: .5` (§6, fila Chip de filtro) |

Puntos por estado (`design-tokens.md` y skill de dominio §3):

| Estado | Etiqueta | Punto |
|---|---|---|
| `VISTO` | Visto | `--estado-visto` |
| `VIENDO` | Viendo | `--estado-viendo` |
| `EN_ESPERA` | En espera | `--estado-espera` |
| `ABANDONADO` | Abandonado | `--estado-abandonado` |
| `PENDIENTE` | Pendiente | `--estado-pendiente` ⚠ **no está en el artboard** — ver §12.4 |

> **El fondo del chip en reposo es `--slate-950`, no `--slate-900`.** El artboard usa
> `#0C0E10` porque el modal es `--slate-900` y el chip se hunde un paso. La primitiva
> `Chip` tiene `bg-[var(--slate-900)]` fijo, que en la barra de filtros (sobre
> `--slate-950`) es correcto y **aquí se funde con el fondo**. Hay que pasarle la
> superficie o sobrescribirla con `className`.

El estado **nunca se comunica solo por color**: cada chip lleva su etiqueta escrita
(§7 y skill de dominio §3). El artboard cumple.

En móvil los chips llevan además el extensor de área táctil a 44 px que ya implementa
`Chip` (`before:h-[var(--tactil-min)]`), y la fila hace **scroll horizontal** — es lo que
fija §3 para los chips en móvil y lo que exige que quepan cinco en 390 px.

---

### 6.7 · PROGRESO

| Propiedad | Artboard | Contrato |
|---|---|---|
| Separación entre controles | `gap: 12px` | `--e-1-5` |

**Selects «Temporada» y «Episodio»**

| Propiedad | Artboard | Contrato |
|---|---|---|
| Fondo | `#1E2226` | `--slate-800` |
| Borde | 1 px `#363C44` | `--slate-600` |
| Radio | 4 px | `--radio-input` |
| Padding | `11px 14px` | `px-[var(--e-1-5)]` ▲ |
| Alto efectivo | 38 px | `--e-5` (40) en ≥`tablet`, `--tactil-min` (44) en móvil ▲ — mismo patrón que `Boton` |
| Separación etiqueta/valor | `gap: 10px` | `--e-1-5` ▲ |
| Etiqueta interior | `400 12px/1` mono, `#565E68` | `font-mono` · `--fs-mono` · **`--porcelain-200`** ⚠ §11 |
| Valor | `400 14px/1` mono, `#E6E2DA` | `font-mono` · `--fs-mono-l` · `--porcelain-100` |
| Indicador | glifo `▾` | ídem, `aria-hidden` |

**Botón «Personalizado…»**

| Propiedad | Artboard | Contrato |
|---|---|---|
| Borde | 1 px **`dashed`** `#363C44` | `--borde-fino` `dashed` `--slate-600` |
| Radio · padding · alto | `4` · `11px 14px` · 38 px | `--radio-input` · `px-[var(--e-1-5)]` · igual que los selects ▲ |
| Texto | `400 13px/1` Inter, `#7A838E` | `font-ui` · `--fs-ui-s` · `--ash-400` (4.80:1 sobre `--slate-900` ✓) |
| `hover` | borde `#C9A227`, texto `#EBD59A` | `--gold-400` · `--gold-200` |

El borde **punteado** es el mismo vocabulario que «✦ Completar con IA» y que las etiquetas
de IA de la ficha: *punteado = algo que aún no es un valor fijo*.

**Texto calculado**

| Propiedad | Artboard | Contrato |
|---|---|---|
| Contenido | `= 100 % de 26 episodios` | ídem, derivado de los dos selects |
| Tipografía | `400 12px/1` mono, `#565E68` | `font-mono` · `--fs-mono` · **`--ash-400`** ⚠ §11 |
| Separación | `margin-left: 4px` | `--e-05` |

Se recalcula al vuelo, es de **solo lectura**, y se anuncia con `aria-live="polite"` para
que quien usa lector de pantalla se entere al cambiar el episodio.

Correspondencia con el dominio (skill §4): los dos selects producen `kind: "EPISODIO"` con
`season` y `episode`; «Personalizado…» produce `kind: "CUSTOM"` con `label`. `label`
**siempre** se rellena: es lo que pinta la interfaz.

---

## 7. El pie

DESIGN-SPEC §4/06: «`✦ Completar con IA` (borde punteado dorado) a la izquierda; a la
derecha Cancelar + el único botón de relleno dorado de la pantalla».

| Propiedad | Artboard | Contrato |
|---|---|---|
| Disposición | `flex`, `justify-content: space-between` | ídem |
| Fondo | `#0C0E10` | `--slate-950` |
| Borde superior | 1 px `#1E2226` | `--slate-800` |
| Radio inferior | `0 0 6px 6px` | `0 0 var(--radio-card) var(--radio-card)` — ver §2 |
| Separación Cancelar/Añadir | `gap: 12px` | `--e-1-5` |

### Tres botones. Uno solo de relleno dorado.

| Orden | Texto | Variante de `Boton` | Artboard | Papel |
|---|---|---|---|---|
| izquierda | **`✦ Completar con IA`** | *no hay variante; ver §13.9* | borde `1px dashed rgba(201,162,39,.5)`, fondo transparente, texto `#A8842A`, `500 13/1`, radio 4 | terciaria, opcional |
| derecha 1 | **`Cancelar`** | `secundario` | borde 1 px `#363C44`, fondo transparente, texto `#C9C6BF`, `500 14/1` | secundaria |
| derecha 2 | **`Añadir al vault`** | **`solido`** | fondo y borde `#C9A227`, texto `#07080A`, `600 14/1`, `+.04em` | **primaria** |

> **REGLA DEL ORO Nº 3.** `design-tokens.md`: «Un solo botón de relleno dorado sólido por
> pantalla, como máximo. […] **Modal → `Añadir al vault`**». Ese es el único
> `variante="solido"` de esta pantalla. Los botones del aviso de duplicado (§8) y el de IA
> **no** pueden ser sólidos. Si alguna vez hacen falta dos sólidos, uno deja de serlo.

Detalle de cada uno:

| | `✦ Completar con IA` | `Cancelar` | `Añadir al vault` |
|---|---|---|---|
| Alto artboard | 39 px | 42 px | 42 px |
| Alto contrato | **`--tactil-min` (44)** ▲ `tamano="m"`, los tres alineados | ídem | ídem |
| Padding H artboard | 20 px | 24 px | 28 px |
| Padding H contrato | `--e-3` (24) ▲ | `--e-3` (24) | `--e-4` (32) ▲ |
| Radio | `--radio-boton` (4) | `--radio-boton` | `--radio-boton` |
| Borde | 1 px `dashed` `--gold-borde` ⚠ *el artboard escribe `.5`; `tokens.css` solo tiene `.45`* | 1 px `--slate-600` | 1 px `--gold-400` |
| Fondo | transparente | `--slate-900` *(la primitiva; el artboard pone transparente sobre `--slate-950`)* | `--gold-400` |
| Texto | `--gold-500` · `--fs-ui-s` · `--fw-ui-medium` | `--porcelain-100` · `--fs-ui` | `--void` · `--fs-ui` · `--fw-ui-bold` · `--tracking-boton` |
| `hover` | borde pasa a **sólido** `--gold-400`, texto `--gold-200` | borde `--slate-600`, fondo `--slate-800` | fondo `--gold-300` |
| `active` | — | fondo `--slate-700` | fondo `--gold-500` |
| `disabled` | borde `--slate-600`, texto `--ash-inactivo` | borde `--slate-700`, texto `--ash-inactivo` | fondo `--slate-700`, texto `--ash-inactivo` |
| `focus` | anillo 2 px `--gold-400` offset 2 px | ídem | ídem |

`--gold-500` (#A8842A) sobre `--slate-950` da **5.53:1** ✓, y a 13 px está por encima del
suelo de 12 px que fija la regla del oro nº 4. Es además el color que `design-tokens.md`
asigna a «etiquetas IA, iconografía tenue», que es exactamente lo que este botón es.

`✦` va como decoración: `aria-hidden="true"` en el glifo, y el nombre accesible del botón
es «Completar con IA» a secas.

Si falta `ANTHROPIC_API_KEY`, `api-conventions.md` dice que la respuesta es
`IA_NO_CONFIGURADA` con **200 y `ok: true`** — «se avisa, no se rompe». El botón se
deshabilita y el motivo se pinta como aviso brasa (§9.2), no como error rojo.

### El pie en móvil

DESIGN-SPEC §12 y el artboard 12 muestran **dos botones al 50 %**, sin `Cancelar` y sin
`Completar con IA`:

| Propiedad | Artboard | Contrato |
|---|---|---|
| Disposición | `flex`, `gap: 10px`, cada botón `flex: 1` | `--e-1-5` ▲ |
| Padding | `15px` | `tamano="m"` → `--tactil-min` (44) ▲ |

Y **en el estado con duplicado** los dos botones son los del aviso, no los del pie:
`Ver el que tengo` (secundario) + **`Añadir igual`** (sólido dorado). El único sólido de la
pantalla sigue siendo uno: la regla del oro se cumple porque en ese estado **no hay
`Añadir al vault`**.

Fíjate en la copia: en móvil es **`Añadir igual`**, en escritorio **`Añadir igualmente`**.
Es deliberado (cabe en 390 px) y se conserva.

El estado **sin** duplicado de la hoja móvil no está en ningún artboard. Ver §13.10.

---

## 8. El aviso de DUPLICADO

DESIGN-SPEC §4/06 lo fija entero: «card `--slate-850`, borde `--estado-viendo-borde`,
borde izquierdo de 2 px `--estado-viendo`, icono `⚠`, dos botones (`Ver el que tengo` con
borde dorado · `Añadir igualmente` neutro)».
DESIGN-SPEC §6, fila **Modal / hoja**, columna `error`: «aviso brasa con borde izquierdo
de 2 px». Es el **mismo componente** para el duplicado y para cualquier error de nivel de
modal (§9.2).

### El contenedor

| Propiedad | Artboard | Contrato |
|---|---|---|
| Posición | tras el bloque Título, antes del bloque Imagen | ídem — fija el orden de tabulación (§10.3) |
| Márgenes | `22px 32px 0` | `mt-[var(--e-3)] mx-[var(--e-4)]` ▲ |
| Padding | `20px 22px` | `--e-2-5` (20) ▲ |
| Fondo | `#171A1E` | `--slate-850` |
| Borde | 1 px `rgba(201,127,42,.45)` | `--estado-viendo-borde` |
| **Borde izquierdo** | **2 px `#C97F2A`** | **`--borde-acento`** + `--estado-viendo` |
| Radio | 4 px | `--radio-input` |

### La línea de cabecera

| Propiedad | Artboard | Contrato |
|---|---|---|
| Separación | `gap: 10px`, `margin-bottom: 16px` | `--e-1-5` ▲ · `--e-2` |
| Icono `⚠` | `#C97F2A`, 14 px | `--estado-viendo` · `--fs-ui` · `aria-hidden="true"` |
| Texto | `500 14px/1` Inter, `#E2A468` | `font-ui` · `--fs-ui` · `--fw-ui-medium` · **`--estado-viendo-texto`** |
| Copia (escritorio) | «Ya tienes este anime en tu Vault» | ⚠ ver §12.6 |
| Copia (móvil) | «Ya lo tienes en el vault» | ídem |

**El brasa `--estado-viendo` (#C97F2A) es SOLO para el icono y los bordes.** Como texto va
`--estado-viendo-texto` (#E2A468), siempre. `tokens.css` lo dice en un comentario y
`design-tokens.md` lo repite: es el error de contraste más fácil de cometer en este aviso.

### La card del anime que ya existe

| Propiedad | Artboard | Contrato |
|---|---|---|
| Disposición | `flex`, `align-items:center`, `gap:18px` | `--e-2` ▲ |
| Padding | `14px` | `--e-2` (16) ▲ |
| Fondo | `#1E2226` | `--slate-800` |
| Borde | 1 px `#282D33` | `--slate-700` |
| Radio | 4 px | `--radio-input` |
| Miniatura | 44 × 66 (2:3), radio 3, fondo `#282D33`, borde 1 px `#363C44` | `--radio-chip` · `--slate-700` · `--slate-600` |
| Inicial (sin portada) | Cormorant `400 18px/1`, `#7A838E` | `font-display` · **18 px sin token** ⚠ §12.5 · `--ash-400` |
| Título | `500 15px/1.3` Inter, `#E6E2DA` | `font-ui` · `--fs-cuerpo-s` · `--fw-ui-medium` · `--porcelain-100` |
| Meta | `400 12px/1` mono, `#7A838E` | `font-mono` · `--fs-mono` · `--porcelain-200` ⚠ §11 (fondo `--slate-800`) |
| Contenido de la meta | `Visto · EP 26/26 · añadido el 14 nov 2025` | estado · progreso · fecha de alta |
| Separación botones | `gap: 10px` | `--e-1-5` ▲ |

Si el anime existente **sí** tiene portada, la miniatura viene de
`/api/covers/<animeId>?size=thumb&v=<checksum>` — **nunca** del dominio de origen
(invariante del e2e crítico, skill de dominio §5).

### Los dos botones

| | `Ver el que tengo` | `Añadir igualmente` |
|---|---|---|
| Variante | **`primario`** (obsidiana + borde dorado) | **`secundario`** (borde neutro) |
| Tamaño | `s` → alto `--e-4` (32) ▲ *(el artboard mide 38)* | ídem |
| Borde | 1 px `--gold-400` | 1 px `--slate-600` |
| Fondo | `--slate-950` | transparente sobre `--slate-800` ⚠ *la primitiva pone `--slate-900`* |
| Texto | `--gold-200` · `--fs-ui-s` · `--fw-ui-medium` | `--porcelain-200` · `--fs-ui-s` |
| Padding H | 18 px → `--e-2` (16) ▲ | ídem |
| `hover` | `--glow-oro` (inset) + borde pan de oro + texto `--gold-100` | borde `--ash-400`, texto `--porcelain-100` |
| Radio | `--radio-boton` (4) | `--radio-boton` |

**Ninguno de los dos es sólido dorado.** El sólido de esta pantalla ya está gastado en
`Añadir al vault` (§7).

`Ver el que tengo` **navega** a la ficha del anime existente (`/app/anime/<id>`): es un
enlace con aspecto de botón, `Boton` con `href`. `Añadir igualmente` es un `<button>`.

### ⚠ Duplicado EXACTO vs SIMILAR — el artboard solo cubre uno de los dos

La skill de dominio §2 define **tres** comprobaciones con **dos** desenlaces distintos, y
el artboard pinta un solo aviso:

| Caso | Qué es | Respuesta | Qué puede hacer el usuario |
|---|---|---|---|
| **(a)** exacto por `title_normalized` | `ANIME_DUPLICADO`, **409** | «Ya tienes este anime» | **No se inserta.** El `UNIQUE (user_id, title_normalized)` lo impediría igualmente |
| **(b)** mismo `anilist_id` | igual que (a) | ídem | ídem |
| **(c)** similitud trigram > **0.55** | `ANIME_SIMILAR`, **200 con `ok: true`** | hasta **3** candidatos en `data.similares` | **Sí puede añadirlo**: «es una pregunta, no un error» |

**El aviso de dos botones del artboard es el caso (c)**, no el (a): en el (a),
`Añadir igualmente` es literalmente imposible —la base lo rechaza—. La copia del artboard
(«Ya tienes este anime en tu Vault») es la del caso (a) y los botones son los del (c).
Es una contradicción real y hay que resolverla. Ver **§13.11**, con recomendación.

---

## 9. Los estados del modal

### 9.1 · Cargando

DESIGN-SPEC §6, fila **Modal / hoja**, columna `loading`: «pie con spinner y botones
bloqueados».

| Elemento | Comportamiento |
|---|---|
| `Añadir al vault` | `Boton cargando` → spinner a la izquierda del label, **ancho fijo**, implica `disabled` y `aria-busy="true"` |
| `Cancelar` | `disabled` |
| `✦ Completar con IA` | `disabled` |
| Campos del formulario | `disabled` ▲ ver §13.12 |
| El modal | **no se cierra** con `Esc` ni con clic en el velo mientras `cargando` ▲ ver §13.12 |

El spinner (artboard 11, línea 1470):

| Propiedad | Artboard | Contrato |
|---|---|---|
| Tamaño | 14 × 14 | 14 px (literal de §4/11) |
| Aro | 1 px `#363C44` | `--borde-fino` + `--slate-600` |
| Arco activo | `border-top-color: #C9A227` | `--gold-400` |
| Radio | 50 % | `--radio-avatar` |
| Animación | `vetaGiro 1.1s linear infinite` | `--dur-giro` · `--ease-lineal` · keyframe `vetaGiro`, ya en `tokens.css` |

`prefers-reduced-motion` ya lo neutraliza desde `tokens.css` (`animation-duration: .01ms`).
No hace falta código extra, pero el `aria-busy` sigue siendo lo que informa al lector de
pantalla — el spinner no se anuncia solo.

### 9.2 · Error

Hay **dos niveles**, y se pintan distinto.

**(a) Error de validación de un campo** — DESIGN-SPEC §6 fila Input + §4/07:

| Propiedad | Contrato |
|---|---|
| Borde del campo | 1 px `--estado-abandonado` (#8A3B3B) |
| Mensaje | `font-mono` · `--fs-mono` (12) · **`--estado-abandonado-texto`** (#C08A8A) |
| Icono | `⚠`, `aria-hidden="true"` |
| Separación | `margin-top: var(--e-1)` |
| ARIA | `aria-invalid="true"` + `aria-describedby` al id del mensaje |

El granate `#8A3B3B` es **borde**, nunca texto: `design-tokens.md` y §7 lo repiten. Y el
granate «aparece **solo** en la pestaña Peligro y en errores de validación» — este es uno
de los dos sitios donde es legítimo.

La primitiva `Campo` ya hace las cuatro cosas (borde, mensaje, `aria-invalid`,
`aria-describedby`) y además **conserva el texto de ayuda junto al error**, que es lo
correcto: «el error dice QUÉ pasa; la ayuda dice qué HACER».

Origen de los mensajes: `VALIDACION` (422) trae `detalles: [{ campo, motivo }]`
(`api-conventions.md`). Cada `campo` se mapea a su control y se pinta su `motivo`.
**El cliente valida por UX; el servidor valida por seguridad** y nunca se confía en el
cliente (`security.md` §8).

**(b) Error de nivel de modal** — DESIGN-SPEC §6, fila **Modal / hoja**, columna `error`:
«aviso brasa con borde izquierdo de 2 px».

Es **exactamente la misma card del §8**: `--slate-850`, borde `--estado-viendo-borde`,
borde izquierdo `--borde-acento` de `--estado-viendo`, icono `⚠`, texto
`--estado-viendo-texto`. Misma posición (bloque 3 de §4), sin la card interior y sin los
dos botones.

Códigos que aterrizan aquí (no son de campo): `LIMITE_EXCEDIDO` (429),
`PROVEEDOR_NO_DISPONIBLE` (502), `IA_NO_CONFIGURADA` (200), `ERROR_INTERNO` (500).
El `mensaje` del sobre **ya viene en español y apto para el usuario**: se pinta tal cual.
En `ERROR_INTERNO` se añade el `requestId` de `error.detalles` en mono `--fs-mono-s`, que
es para lo que existe.

El aviso se anuncia: `role="alert"` ▲ ver §13.13.

### 9.3 · Éxito

**No hay estado de éxito dentro del modal en ningún artboard.** El canal de éxito del
sistema es el **toast** del artboard 11. Contrato:

1. El modal **se cierra** (mismo camino que `alCerrar`).
2. El foco vuelve al disparador (§10.2).
3. Aparece un toast de éxito.

| Propiedad | Artboard 11 | Contrato |
|---|---|---|
| Ancho máximo | 460 px | 460 px (literal de §4/11) |
| Fondo | `#171A1E` | `--slate-850` |
| Borde | 1 px `#282D33` | `--slate-700` |
| **Borde izquierdo** | **2 px `#C9A227`** | **`--borde-acento`** + `--gold-400` |
| Radio | 4 px | `--radio-input` |
| Sombra | `0 8px 24px rgba(0,0,0,.6)` | `--sombra-losa` |
| Padding | `16px 18px` | `--e-2` ▲ |
| Separación | `gap: 14px` | `--e-2` ▲ |
| Icono | `✓` `#C9A227`, 13 px | `--gold-400` · `--fs-ui-s` · `aria-hidden` |
| Título | `500 14px/1.4` Inter, `#E6E2DA` | `font-ui` · `--fs-ui` · `--porcelain-100` |
| Meta | `400 12px/1` mono, `#7A838E` | `font-mono` · `--fs-mono` · `--ash-400` |
| Acción | `400 12px/1` mono, `#565E68` | `font-mono` · `--fs-mono` · **`--ash-400`** ⚠ §11 · subrayada en `hover`, anillo dorado en `focus` (§6, fila Toast) |

La copia del toast de éxito de este flujo **no está en ningún artboard**. Ver §13.14.

---

## 10. Accesibilidad

DESIGN-SPEC §6, fila **Modal / hoja**, columna `focus`: **«foco atrapado dentro»**.
DESIGN-SPEC §7: anillo de 2 px `--gold-400` con 2 px de offset, siempre visible.

La base es **`<dialog>` nativo abierto con `showModal()`**, que ya da gratis y bien hecho:
trampa de foco, cierre con `Esc`, resto de la página inerte para lectores de pantalla, y
capa superior sin peleas de `z-index`. `src/components/ui/modal.tsx` ya está construido
así. Lo único que hay que añadir a mano es el clic en el velo (§1).

### 10.1 · Dónde entra el foco al abrir

**En el campo TÍTULO.**

No es una invención: el PNG del artboard renderiza ese campo **en estado de foco** —borde
`--gold-400`, anillo `--gold-foco` a 2 px de offset y cursor visible— mientras el resto de
controles está en reposo. Es la única lectura coherente de la imagen.

Implementación: el input lleva `autofocus`. Sin él, `<dialog>` enfoca el **primer
descendiente enfocable**, que es el botón `×` de cerrar — abrir un modal con el foco en
«cerrar» es hostil y no es lo que muestra el artboard.

En móvil no hay `×`, así que el primer enfocable ya es el campo; el `autofocus` se pone
igualmente para que el comportamiento sea el mismo en los cuatro breakpoints.

### 10.2 · A dónde vuelve el foco al cerrar

**Al elemento que abrió el modal**, en los cuatro caminos de cierre (`Esc`, `×`,
`Cancelar`, clic en el velo) y también tras el éxito (§9.3).

`<dialog>` devuelve el foco al elemento previamente enfocado por sí solo. Los disparadores
conocidos:

| Breakpoint | Disparador |
|---|---|
| ≥ `tablet` | el CTA `Añadir` de la barra superior |
| `movil` | el ítem `Añadir` de la navegación inferior de 4 ítems (§12 de la spec) |

Si el disparador ya no existe al cerrar —porque el éxito navegó a la ficha del anime
recién creado— el foco cae en el `<h1>` de la página destino ▲ ver §13.15.

### 10.3 · `Tab` · orden de tabulación

Trampa nativa: `Tab` desde el último control vuelve al primero, y `Shift+Tab` desde el
primero va al último. **Nunca sale del modal.**

Orden, que es el orden del DOM:

| # | Control | Nota |
|---|---|---|
| 1 | `×` Cerrar | no existe en móvil |
| 2 | Campo **TÍTULO** | recibe el foco al abrir |
| — | *lista de autocompletado* | **NO es una parada de tabulación.** Combobox: `↑`/`↓` recorren, `↵` elige, `Esc` la cierra. `aria-activedescendant` |
| 3 | `Ver el que tengo` | **solo si hay aviso** — el aviso va entre el bloque Título y el bloque Imagen (§4) |
| 4 | `Añadir igualmente` | ídem |
| 5 | Campo **URL DE IMAGEN** | |
| 6 | **Zona de arrastre** | una parada; se activa con `Enter` y `Espacio` |
| 7 | **ESTADO** | **una sola parada** para todo el grupo (`radiogroup`): `←`/`→` recorren los chips |
| 8 | `select` Temporada | |
| 9 | `select` Episodio | |
| 10 | `Personalizado…` | |
| 11 | `✦ Completar con IA` | |
| 12 | `Cancelar` | |
| 13 | `Añadir al vault` | |

Los chips de estado son **un solo tab-stop**, no cinco: es el patrón `radiogroup` de
WAI-ARIA. Cinco paradas para elegir un valor entre cinco es exactamente lo que ese patrón
existe para evitar.

### 10.4 · `Esc`

| Situación | Qué hace `Esc` |
|---|---|
| Lista de autocompletado **abierta** | cierra **la lista**, el modal se queda. El foco no se mueve del campo ▲ ver §13.16 |
| Lista cerrada | **cierra el modal sin guardar** — mismo camino que `Cancelar` y que el clic en el velo |
| `cargando` (§9.1) | **no hace nada** ▲ ver §13.12 |

Detalle de implementación que ya está resuelto en `modal.tsx` y **no hay que deshacer**:
se escucha **solo `onClose`, nunca `onCancel`**. `Esc` dispara los dos eventos, y con los
dos conectados `alCerrar()` se ejecuta **dos veces** por cierre. Inofensivo con un
`setState`; no lo es con un `router.back()` ni con un «deshacer».

**No hay confirmación al descartar** cambios sin guardar ▲ ver §13.17.

### 10.5 · El resto

| Requisito | Cómo se cumple |
|---|---|
| Nombre accesible del diálogo | `aria-labelledby` → el `<h3>` «Añadir al vault» |
| Descripción | `aria-describedby` → el subtítulo «busca en AniList…» |
| Resto de la página inerte | lo hace `showModal()` |
| Anillo de foco | `:focus-visible { outline: var(--anillo-foco); outline-offset: var(--anillo-foco-offset) }`, ya en `globals.css` |
| Área táctil ≥ 44 × 44 en móvil | `Boton` con `min-h-[var(--tactil-min)] tablet:min-h-0`; `Chip` con el extensor `before:h-[var(--tactil-min)]` |
| Área ≥ 32 px con 8 px de separación en escritorio | `×` de 32 px, chips de 32 px con `gap` `--e-1` |
| El estado nunca solo por color | cada chip lleva su etiqueta escrita; cada punto de color va con el nombre del estado |
| `prefers-reduced-motion` | ya en `tokens.css`: mata spinner, shimmer y transiciones |
| El resultado calculado del progreso | `aria-live="polite"` |
| El aviso brasa | `role="alert"` ▲ §13.13 |
| Contraste ≥ 4.5:1 | ver §11 — el artboard **no** lo cumple en 7 sitios |

---

## 11. Los grises: dónde el artboard incumple el contraste, y qué se escribe en su lugar

`design-tokens.md` renombró `--ash-500` a **`--ash-inactivo`** con contrastes **medidos**,
no estimados, y con tres consecuencias normativas. La primera:

> **`--ash-inactivo` no llega a 4.5:1 sobre ninguna superficie del sistema.** Es legítimo
> únicamente en controles **deshabilitados** y en el **placeholder**.

Y `npm run lint:tokens` **falla** si `--ash-inactivo` o `*-ash-500` aparecen en una línea
que no declare `disabled` o `placeholder`. Es decir: **el artboard, copiado literalmente,
no pasa la verificación del proyecto.**

El artboard usa `#565E68` en **siete** sitios del modal. Ninguno es un control
deshabilitado ni un placeholder:

| # | Elemento | Fondo | Artboard | Contraste real | **Contrato** | Contraste |
|---|---|---|---|---|---|---|
| 1 | Subtítulo de la cabecera | `--slate-900` | `#565E68` | **2.81:1** ✕ | **`--ash-400`** | 4.80:1 ✓ |
| 2 | Pista «AniList» del campo | `--slate-800` | `#565E68` | **2.44:1** ✕ | **`--porcelain-200`** | 9.39:1 ✓ |
| 3 | Meta de los ítems 2 y 3 del autocompletado | `--slate-800` | `#565E68` | **2.44:1** ✕ | **`--porcelain-200`** | 9.39:1 ✓ |
| 4 | «JPG o PNG · máx 4 MB · 2:3 recomendado» | `--slate-900` | `#565E68` | **2.81:1** ✕ | **`--ash-400`** | 4.80:1 ✓ |
| 5 | Etiquetas «Temporada» / «Episodio» | `--slate-800` | `#565E68` | **2.44:1** ✕ | **`--porcelain-200`** | 9.39:1 ✓ |
| 6 | «= 100 % de 26 episodios» | `--slate-900` | `#565E68` | **2.81:1** ✕ | **`--ash-400`** | 4.80:1 ✓ |
| 7 | Acción «deshacer» del toast de éxito | `--slate-850` | `#565E68` | **2.66:1** ✕ | **`--ash-400`** | 4.54:1 ✓ |

Y la segunda consecuencia, que también toca al modal:

> **`--ash-400` sobre `--slate-800` se queda en 4.17:1.** En el input y en el menú de
> acciones el mínimo real es **`--porcelain-200`**.

De ahí que las filas 2, 3 y 5 —todas sobre `--slate-800`— suban a `--porcelain-200` y no a
`--ash-400`. Lo mismo aplica a la meta de la card del anime existente (§8) y al texto del
campo URL (§6.3).

**Regla del modal, en una línea:**

> Sobre `--slate-900` el gris de texto es **`--ash-400`**.
> Sobre `--slate-800` el gris de texto es **`--porcelain-200`**.
> `--ash-inactivo` **solo** en el placeholder del campo URL y en controles `disabled`.

**Precedente en el propio repo:** `modal.tsx` ya pinta la `descripcion` con
`text-[var(--ash-400)]` donde el artboard tiene `#565E68`. La decisión ya se tomó una vez
en este mismo componente; aquí solo se extiende al resto.

**Efecto visual, dicho sin adornos:** las metas del autocompletado y las etiquetas de los
selects suben de tono respecto al PNG, y la jerarquía entre el ítem activo y los inactivos
se aplana un poco. Es el precio de 1.4.3. Ver §13.18 si el propietario prefiere el tono
del artboard.

---

## 12. Contradicciones detectadas, y cómo se resuelven

### 12.1 · ⚠ `90 vw` en tablet produce un modal MÁS ANCHO que en escritorio

DESIGN-SPEC §3 fija: desktop 760 px · laptop 680 px · **tablet `90 vw`**. A 1023 px de
viewport, `90vw` = **921 px** — más ancho que el modal de escritorio (760) y mucho más que
el de laptop (680). Un modal que crece al estrechar la pantalla no puede ser lo pretendido.

**Resolución:** `width: min(90vw, 680px)`. Conserva el `90vw` de la spec como límite
inferior (a 768 px da 691 px, prácticamente el 680 de laptop) y le pone el techo del
breakpoint inmediatamente superior. Es una **decisión mía**; ver §13.19.

### 12.2 · ⚠ El radio de 10 px de la hoja móvil no tiene token

DESIGN-SPEC §12 dice «radio 10 solo arriba» y el `.dc.html` escribe
`border-radius: 10px 10px 0 0`. `tokens.css` no tiene ningún radio de 10: la escala es
card 6 · input 4 · botón 4 · chip 3 · barra 1 · avatar 50 % · marco 0.

`design-tokens.md`: «Si un valor no está ahí, no se escribe en el código: primero se añade
al token y se justifica».

**Resolución:** el valor es correcto (lo fija la spec, autoridad 2) y **falta el token**.
Hay que añadirlo a `tokens.json` / `tokens.css` con nombre propio, igual que `globals.css`
ya hizo con `--text-marca` (19 px) y con `--e-3-5` (28 px). Ver §13.20.

### 12.3 · ⚠ «máx 4 MB · JPG o PNG» contradice el contrato del servidor

| Fuente | Tamaño máximo | Tipos aceptados |
|---|---|---|
| **Artboard 06** (copia de la zona de arrastre) | **4 MB** | **JPG o PNG** |
| `security.md` §4 · skill de dominio §5 · `api-conventions.md` | **8 MB** (`IMAGEN_DEMASIADO_GRANDE` → 413) | **jpeg · png · webp · avif** (`TIPO_NO_SOPORTADO` → 415) |

Es una contradicción **de comportamiento**, no de estética, así que el orden de autoridad
visual no la resuelve: el artboard manda sobre cómo se ve un texto, no sobre lo que el
servidor acepta. Y una copia que promete menos de lo que el sistema hace es una copia que
**miente al usuario**: quien arrastre un `.webp` de 6 MB —y el propietario tiene 15 `.webp`
en su seed— verá que funciona pese a que el modal decía que no.

**Resolución:** la copia dice lo que el servidor hace de verdad:
**«JPG, PNG, WebP o AVIF · máx 8 MB · 2:3 recomendado»**.
La tipografía, el color y la posición **no cambian**. Ver §13.21.

### 12.4 · ⚠ Faltan chips de estado: 4 en el artboard, 5 en el dominio

| Fuente | Chips |
|---|---|
| Artboard 06 (escritorio) | Visto · Viendo · En espera · Abandonado → **4** |
| Artboard 12 (móvil) | Visto · Viendo · En espera → **3** |
| `enums.ts` · skill de dominio §3 · `CHECK` de la base | VISTO · VIENDO · EN_ESPERA · ABANDONADO · **PENDIENTE** → **5** |

`PENDIENTE` no es opcional: es el valor al que cae `mapearEstado` ante cualquier texto que
no reconoce, y `design-tokens.md` le dedica un token propio (`--estado-pendiente`) con un
comentario explicando por qué el mínimo de contraste de texto no le aplica. Existe en el
sistema; falta en el modal.

DESIGN-SPEC no enumera los chips de este grupo en ninguna parte, así que aquí no hay
conflicto entre autoridades: hay un **hueco del artboard**. Ver §13.22.

En móvil el artboard muestra 3 porque no caben 5 en 390 px — pero §3 ya resuelve eso para
los chips: **scroll horizontal**. No es un recorte del dominio, es un recorte del dibujo.

### 12.5 · ⚠ Cormorant a 18 px incumple «nunca por debajo de 26 px»

La inicial de la miniatura sin portada del aviso de duplicado va en Cormorant **18 px**.
`design-tokens.md` y DESIGN-SPEC §2: «**Cormorant nunca por debajo de 26 px**».

No es un desliz aislado: el mismo patrón está en el artboard 04 («inicial en Cormorant
16 px») y lo pide DESIGN-SPEC §5 para toda portada sin imagen. Es una excepción
**sistemática** del sistema que la regla no recoge.

**Resolución:** el valor se conserva (lo fija la spec en tres sitios) y la excepción hay
que **declararla**, no incumplirla en silencio. Es el mismo caso que `--text-marca`, que
`globals.css` ya resolvió así para el logotipo. Ver §13.23.

### 12.6 · ⚠ Dos copias distintas para el mismo aviso

| Fuente | Texto |
|---|---|
| Skill de dominio §2(a) | «Ya tienes este anime» |
| Artboard 06 | «Ya tienes este anime en tu Vault» |
| Artboard 12 (móvil) | «Ya lo tienes en el vault» |

El primero es el `mensaje` del sobre `ANIME_DUPLICADO` (`api-conventions.md`: «está en
español y es apto para enseñárselo al usuario tal cual»). Los otros dos son la copia de la
interfaz. Que un aviso tenga una versión larga y otra corta según el ancho es correcto;
que además exista una tercera en el servidor y la interfaz pinte una cuarta, no.
Ver §13.24.

### 12.7 · Diferencias menores resueltas por orden de autoridad

| Elemento | Artboard | `tokens.css` / spec | Gana |
|---|---|---|---|
| Borde del chip de estado activo | `rgba(201,162,39,.5)` | `--gold-borde` = `.45` | **`--gold-borde`** |
| Borde de `✦ Completar con IA` | `rgba(201,162,39,.5)` | `--gold-borde` = `.45` | **`--gold-borde`** |
| `hover` del botón primario | solo `--glow-oro` | §6 pide `--gold-leaf` **y** `--glow-oro` | **los dos** (§6 es autoridad 2) |
| Fondo de `Cancelar` | transparente | `Boton secundario` usa `--slate-900` | `--slate-900`: sobre el pie `--slate-950` da el mismo escalón que el artboard busca |

---

## 13. HUECOS — hay que decidir esto

Nada de lo de abajo está en `tokens.css`, ni en `DESIGN-SPEC.md`, ni en los PNG. **No se ha
inventado en el cuerpo del contrato.** Cada uno lleva mi recomendación y el motivo.

**13.1 · Aire vertical en `tablet` y regla de desbordamiento.**
La spec fija 96 px de aire **solo** para desktop, y no dice nada de qué pasa cuando el
modal no cabe.
*Recomendación:* aire `--e-12` (96) en desktop y laptop, `--e-6` (48) en tablet;
`max-block-size: calc(100dvh - 2 × aire)`; cabecera y pie fijos, cuerpo con scroll.
*Motivo:* con el aviso de duplicado el modal pide ~1111 px y no entra en 768. La regla del
oro exige que `Añadir al vault` esté siempre visible, y §7 que el foco lo esté también:
las dos cosas se rompen si el pie se va con el scroll.

**13.2 · Alto máximo de la hoja móvil.**
El artboard la dibuja a ~491 px de 844 (58 %), pero es una hoja de contenido variable.
*Recomendación:* `max-block-size: 90dvh` con scroll interno, y
`padding-bottom: max(var(--e-4), env(safe-area-inset-bottom))`.
*Motivo:* dejar siempre visible una franja de velo es lo que le dice al usuario que hay
algo detrás y que se puede cerrar tocando fuera. El `env()` no está en la spec y en iOS es
obligatorio: sin él, el botón primario queda bajo la barra de gestos.

**13.3 · Cierre accesible de la hoja móvil.**
En móvil no hay `×`. El tirador es decorativo y el gesto de arrastre no es accesible por
teclado ni por lector de pantalla.
*Recomendación:* `Esc` + toque en el velo + un `<button>` de cerrar **visualmente oculto**
como primer elemento de la hoja.
*Motivo:* «arrastrar hacia abajo» no es una operación que exista para un teclado.

**13.4 · Marcado de campo obligatorio, y placeholders.**
El artboard no marca ningún campo como obligatorio ni muestra el placeholder de TÍTULO.
*Recomendación:* `required` + `aria-required="true"` en TÍTULO, y la palabra
`(obligatorio)` en la etiqueta —no un asterisco, que un lector de pantalla lee como
«asterisco»—. Placeholder de TÍTULO: `Busca o escribe el título`.
*Motivo:* con un solo campo obligatorio, marcar ese es más barato que marcar los cinco
opcionales.

**13.5 · Faltan campos para «rellenar la ficha a mano».**
El subtítulo promete rellenarla a mano y a mano solo se puede escribir el título. No hay
formato, año, episodios totales, títulos alternativos ni sinopsis.
*Recomendación:* preguntar al propietario. Si se quieren, van en un `<details>`
«Más datos» tras el bloque PROGRESO, para no engordar el camino feliz.
*Motivo:* es una decisión de alcance, no de diseño. Inventar cinco campos que el artboard
no dibuja es exactamente lo que el encargo prohíbe.

**13.6 · El 40 % de opacidad del fondo.**
El artboard atenúa la biblioteca al 40 % **además** del velo. Sobre la página real eso
significaría atenuar toda la aplicación.
*Recomendación:* **no aplicarlo**. Solo el velo `--void`/86.
*Motivo:* es una licencia de maqueta para que se vea algo detrás en una imagen estática.
Atenuar la página real con `opacity` crea un contexto de apilamiento que se pelea con la
capa superior de `<dialog>`, y el velo al 86 % ya la esconde.

**13.7 · Estado de carga de la búsqueda de AniList.**
No está en ningún artboard.
*Recomendación:* una fila de esqueleto de **44 px** dentro de la lista, con el shimmer
dorado del artboard 11 (`linear-gradient(100deg, --slate-850 30%, --gold-shimmer 50%,
--slate-850 70%)`, `background-size: 300% 100%`, `vetaBrillo --dur-shimmer linear
infinite`).
*Motivo:* §6, fila Input, columna `loading` dice literalmente «esqueleto de 44 px», y el
artboard 11 fija el shimmer. Las dos piezas existen; solo falta juntarlas aquí.

**13.8 · Grosor y posición de la barra de progreso de subida.**
§6 pide «barra de progreso dorada» y no da grosor ni sitio.
*Recomendación:* 2 px (`--borde-acento`), pegada al borde inferior interno de la zona de
arrastre, pista `--slate-700`, relleno `--gold-400` + `--halo-punto`.
*Motivo:* §4/05 usa 2 px para la barra de la ficha y §4/03 el hairline de 1 px para la
card; una zona de arrastre está más cerca de lo primero.

**13.9 · `✦ Completar con IA` no tiene variante en `Boton`.**
El borde punteado dorado no existe en `VarianteBoton` (`primario` `solido` `secundario`
`destructivo` `fantasma`).
*Recomendación:* añadir `variante="ia"` a la primitiva.
*Motivo:* el punteado dorado con `--gold-500` y prefijo `✦` es **vocabulario del sistema**,
no de esta pantalla: la skill de dominio §6 lo fija igual para las etiquetas de IA de la
ficha. Resolverlo con `className` aquí garantiza que la ficha lo reconstruya distinto.
Requiere tocar `src/components/ui/boton.tsx`, **que no es mío**.

**13.10 · El pie de la hoja móvil SIN duplicado.**
El artboard 12 solo dibuja el estado con aviso.
*Recomendación:* un único botón `Añadir al vault`, `variante="solido"`, `ancho` completo.
*Motivo:* es el único sólido dorado de la pantalla (regla nº 3) y en móvil no hay sitio
para tres botones. `Cancelar` sobra: ya están `Esc`, el velo y el tirador.

**13.11 · Duplicado EXACTO vs SIMILAR (§8).** El más importante de esta lista.
*Recomendación:*

| Caso | Aviso | Botones | `Añadir al vault` |
|---|---|---|---|
| **exacto** (a)/(b) → 409 | «Ya tienes este anime» | **solo `Ver el que tengo`** | **`disabled`** |
| **similar** (c) → 200 | «¿Es alguno de estos?» | `Ver el que tengo` + `Añadir igualmente`, **por cada candidato** (hasta 3) | activo |

*Motivo:* en el caso exacto `Añadir igualmente` es imposible —el
`UNIQUE (user_id, title_normalized)` lo rechaza— y ofrecer un botón que siempre falla es
peor que no ofrecerlo. En el caso similar la skill dice explícitamente «no es un error: es
una pregunta», y devuelve **hasta 3** candidatos, no uno. La card del artboard se repite
tres veces con `gap: var(--e-1-5)`.

**13.12 · Alcance del bloqueo mientras `cargando`.**
§6 dice «botones bloqueados» y nada de los campos ni del cierre.
*Recomendación:* deshabilitar también los campos, e ignorar `Esc` y el clic en el velo.
*Motivo:* si se cierra el modal con el `POST` en vuelo, el anime se crea y el usuario no
lo ve. El envío es corto; no vale la pena permitir cancelarlo a medias.

**13.13 · Anuncio del aviso brasa.**
*Recomendación:* `role="alert"` en el contenedor del §8/§9.2.
*Motivo:* aparece **después** de que el usuario haya escrito, sin que él lo pida. §7 exige
que el estado no se comunique solo por color; para quien no ve el color, el único canal es
la región viva. `assertive` y no `polite` porque bloquea el envío.

**13.14 · Copia del toast de éxito.**
*Recomendación:* título «`<Título>` añadido al vault», meta «`<Estado>` · `<etiqueta de
progreso>`», acción «ver ficha».
*Motivo:* calca la estructura del toast del artboard 11 («Vinland Saga · episodio 19
guardado» / «79 % · sincronizado» / «deshacer»): título con el nombre de la serie, meta en
mono con el dato, acción en una o dos palabras en minúscula.

**13.15 · Retorno del foco si el disparador ya no existe.**
*Recomendación:* al `<h1>` de la página destino, con `tabIndex={-1}`.
*Motivo:* dejar el foco en `<body>` manda al lector de pantalla al principio del documento
y pierde el sitio.

**13.16 · `Esc` en dos pasos con la lista abierta.**
*Recomendación:* sí, dos pasos — primer `Esc` cierra la lista, segundo cierra el modal.
*Motivo:* es el patrón combobox de WAI-ARIA. Cerrar el modal entero por descartar una
sugerencia tira todo lo escrito. Ojo con la implementación: `<dialog>` cierra con `Esc`
de forma **nativa**, así que hay que llamar a `preventDefault()` en el `keydown` cuando la
lista está abierta, o el modal se cerrará igualmente.

**13.17 · Confirmar antes de descartar cambios.**
§6 lista una variante `confirmar` del modal, pero no dice si este flujo la usa.
*Recomendación:* **no confirmar**.
*Motivo:* el formulario tiene un campo obligatorio y cinco opcionales; el coste de
rehacerlo es bajo y una confirmación en cada `Esc` es hostil. Además `testing.md` exige que
el recorrido en navegador incluya «volver atrás» y «recargar a mitad» sin que se rompa: un
diálogo de confirmación encima de otro diálogo complica precisamente ese camino.

**13.18 · ¿Se acepta el cambio de tono de los grises? (§11).**
*Recomendación:* aplicar la sustitución.
*Motivo:* es lo que exige `design-tokens.md`, es lo que verifica `npm run lint:tokens`, y
es la decisión que **este mismo repositorio ya tomó** al renombrar `--ash-500` a
`--ash-inactivo`. La alternativa —conservar el tono del artboard con `--ash-400` sobre
`--slate-800`— pasa el lint pero se queda en **4.17:1** e incumple 1.4.3. Decisión del
propietario, no mía.

**13.19 · El techo de `min(90vw, 680px)` en tablet (§12.1).**
*Recomendación:* aplicarlo.
*Motivo:* la alternativa literal (`90vw` puro) da 921 px a 1023 de viewport, más ancho que
el modal de escritorio. Casi con seguridad la spec quería decir «que no se pegue a los
bordes», no «que crezca».

**13.20 · Token para el radio de 10 px de la hoja (§12.2).**
*Recomendación:* añadir `--radius-hoja: 10px` a `tokens.json` y `--radio-hoja` al bloque de
alias de `globals.css`.
*Motivo:* el mismo 10 px lo usa el marco de dispositivo del artboard 12, así que son dos
consumidores. Requiere tocar `design/tokens.*` y `src/app/globals.css`, **que no son míos**.

**13.21 · Copia real de la zona de arrastre (§12.3).**
*Recomendación:* «JPG, PNG, WebP o AVIF · máx 8 MB · 2:3 recomendado».
*Motivo:* es lo que el servidor acepta de verdad. El propietario tiene 15 portadas `.webp`
en su propio seed; una copia que dice «JPG o PNG» le está mintiendo sobre sus propios
datos.

**13.22 · El quinto chip, `PENDIENTE`, y el estado por defecto (§12.4).**
*Recomendación:* añadir el chip `Pendiente` con punto `--estado-pendiente`, misma
geometría; en móvil, scroll horizontal para los cinco. Estado por defecto al abrir el
modal: **`PENDIENTE`**.
*Motivo:* el chip, porque el dominio tiene cinco estados y el `CHECK` los acepta todos;
sin él, un anime que se quiere apuntar «para verlo» no se puede dar de alta. El defecto,
porque es el fallback del dominio y porque «no se inventan datos»: preseleccionar `Visto`
—como se ve en el PNG— **afirma que el usuario lo ha visto** sin que él lo haya dicho.
Contra esto juega que los 83 del seed son `VISTO`, así que puede que el propietario
prefiera `VISTO` por comodidad. **Es su decisión**, y por eso está aquí y no en el cuerpo
del contrato.

**13.23 · Excepción declarada para la inicial en Cormorant (§12.5).**
*Recomendación:* añadir `--text-inicial-portada: 18px` con un comentario que explique la
excepción, exactamente como `globals.css` hizo con `--text-marca: 19px`.
*Motivo:* la regla «Cormorant nunca por debajo de 26» existe por legibilidad de texto; una
inicial suelta como marcador de portada no es texto corrido. La excepción es real y
sistemática (artboards 04, 05 y 06): declararla es mejor que incumplirla en silencio en
tres pantallas. Requiere tocar `tokens.*` y `globals.css`, **que no son míos**.

**13.24 · Unificar la copia del aviso de duplicado (§12.6).**
*Recomendación:* la interfaz pinta su propia copia —«Ya tienes este anime en tu Vault» en
≥`tablet`, «Ya lo tienes en el vault» en móvil— y **no** el `mensaje` del sobre. El
`mensaje` del servidor se conserva para clientes que no sean esta interfaz.
*Motivo:* `api-conventions.md` dice que el cliente **ramifica por `codigo`, nunca por
`mensaje`**. Pintar el `mensaje` en un sitio donde el artboard fija una copia distinta
acopla la interfaz a un texto del servidor que puede cambiar.

---

## 14. Checklist de fidelidad antes de cerrar la pantalla

| # | Comprobación | Fuente |
|---|---|---|
| 1 | **Un solo** `variante="solido"` en toda la pantalla, y es `Añadir al vault` | regla del oro nº 3 |
| 2 | Cero `#` en el componente: `npm run lint:tokens` en verde | `design-tokens.md` regla 0 |
| 3 | Cero `--ash-inactivo` fuera de `placeholder` y `disabled` | §11 |
| 4 | Ningún `--estado-viendo` ni `--estado-abandonado` **como color de texto** | `tokens.css` + §7 |
| 5 | `Esc`, `Tab` atrapado, foco entra en TÍTULO y vuelve al disparador | §10 |
| 6 | Anillo de foco visible en los 13 tab-stops, sin recortar por `overflow` | §2 + §7 |
| 7 | Los cinco chips de estado llevan **etiqueta escrita**, no solo punto | §7 |
| 8 | La vista previa es 2:3 y su marco **no tiene radio** | §6.5 + `--radio-marco` |
| 9 | La miniatura del duplicado sale de `/api/covers/…`, nunca del dominio de origen | skill de dominio §5 |
| 10 | Los cuatro breakpoints comprobados, y **móvil es hoja inferior**, no modal centrado | §2 |
| 11 | Recorrido `e2e/modal-anadir.spec.ts` en Chromium **sin `bypassCSP`**, contra `build`+`start`: camino feliz, todo lo opcional en blanco, formulario vacío, volver atrás y recargar a mitad | `testing.md` |
