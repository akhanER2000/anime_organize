# Regla · Tokens de diseño

> **Fuente de verdad:** `design/tokens.css` y `design/tokens.json`.
> Si un valor no está ahí, no se escribe en el código: primero se añade al token y se justifica.
> Si `ANIME-VAULT.dc.html` y `tokens.css` se contradicen, **manda `tokens.css`**.

## Regla 0 — prohibido el hex suelto

Está **prohibido** escribir un color literal (`#C9A227`, `rgb(...)`, `rgba(...)`) dentro de un
componente, de una clase arbitraria de Tailwind o de cualquier CSS que no sea
`src/app/globals.css`. Único lugar donde puede aparecer un hex: el bloque `@theme` de
`src/app/globals.css`. **Todos sus colores salen de `design/tokens.json`** —ni uno solo se
inventa—, pero el bloque **no es una copia clave a clave del JSON**, y las dos diferencias son
deliberadas y están explicadas en el propio CSS:

- **Los 15 `--spacing-05`…`--spacing-13` del JSON NO se declaran en `@theme`**
  (`globals.css:146-169`). Declararlos **secuestra las utilidades numéricas de Tailwind v4**:
  `h-8` deja de ser 32 px y pasa a ser 64. Sus valores viven en `:root` como `--e-*` y se
  escriben siempre explícitos: `h-[var(--e-4)]`, `px-[var(--e-2)]`, `gap-[var(--e-3)]`. Los
  NOMBRADOS (`--spacing-gutter-l`, `--spacing-tactil`…) sí se declaran: ésos no chocan con
  ninguna utilidad numérica.
- **`@theme` añade `--text-marca: 19px`** (`globals.css:111`), que no está en el JSON. Es el
  tamaño del logotipo y solo del logotipo: la excepción declarada a «Cormorant nunca por
  debajo de 26 px» (ver «Reglas duras»).

Si cambia el diseño, este bloque se regenera desde el JSON **respetando esas dos excepciones**.
Pegar el JSON entero reintroduce el fallo de las utilidades numéricas, que ya pasó una vez: el
chip salía a 64 px donde la spec dice 32.

Se verifica en CI con `npm run lint:tokens` (busca hex fuera de `globals.css`).

```
MAL   <div className="bg-[#171A1E]">
MAL   style={{ color: "#C9A227" }}
MAL   .card { border: 1px solid #282D33 }

BIEN  <div className="bg-slate-850">
BIEN  <div style={{ color: "var(--gold-400)" }}>
BIEN  <div className="border-[var(--slate-700)]">
```

## Cómo están cableados los tokens

`src/app/globals.css` hace dos cosas:

1. **`@theme`** — declara los tokens con la convención de Tailwind v4 (`--color-*`, `--font-*`,
   `--text-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--duration-*`, `--breakpoint-*`).
   De ahí salen las utilidades: `bg-slate-850`, `text-gold-300`, `font-display`,
   `rounded-card`, `shadow-losa`, `duration-base`.
2. **`:root`** — reexpone los **mismos** valores con los nombres en español que usa
   `DESIGN-SPEC.md` (`--gold-400`, `--e-3`, `--radio-card`, `--sombra-losa`,
   `--veta-horizontal`, `--tactil-min`…). Sirve para lo que Tailwind no modela bien
   (gradientes, halos, anillos) y para poder leer la spec y escribir el token tal cual.

Las dos listas salen de `design/tokens.json` y de `design/tokens.css`, **y ninguna es copia
exacta**: `@theme` deja fuera los 15 `--spacing-*` numéricos y añade `--text-marca`; `:root`
renombra `--ash-500` en `--ash-inactivo` y `--estado-pendiente`, y añade cinco tokens que no
están en ninguno de los dos ficheros de `design/` —`--e-3-5` (28 px),
`--borde-marco-dispositivo`, `--ancho-card-auth`, `--velo-auth` y `--opacidad-laja-auth`—, cada
uno con su justificación escrita al lado en `globals.css`. Si tocas una lista, tocas la otra; si
añades otra excepción, la justificas donde la declares y la anotas aquí. Se documenta porque el
que lea «traducción literal» y encuentre otra cosa dejará de fiarse del resto del documento.

## Paleta completa

### Superficies · obsidiana / laja

| Token español | Utilidad Tailwind | Valor | Uso |
|---|---|---|---|
| `--void` | `void` | `#07080A` | fondo del viewport, velos |
| `--slate-950` | `slate-950` | `#0C0E10` | fondo de página, cebra impar |
| `--slate-900` | `slate-900` | `#121417` | sección, barra superior, cebra par, modal |
| `--slate-850` | `slate-850` | `#171A1E` | card base, hueco de portada, toast |
| `--slate-800` | `slate-800` | `#1E2226` | card elevada, input, menú de acciones |
| `--slate-700` | `slate-700` | `#282D33` | hover, superficie activa, borde sutil, pista de barra |
| `--slate-600` | `slate-600` | `#363C44` | borde neutro, marco de dispositivo, casilla |

### Texto · porcelana / ceniza

| Token | Utilidad | Valor | Uso |
|---|---|---|---|
| `--ash-inactivo` | — | `#565E68` | **solo deshabilitado y placeholder** (ver abajo) |
| `--ash-400` | `ash-400` | `#7A838E` | secundario, datos mono, nav inactiva |
| `--porcelain-200` | `porcelain-200` | `#C9C6BF` | terciario claro, cuerpo largo, UI secundaria |
| `--porcelain-100` | `porcelain-100` | `#E6E2DA` | principal, logotipo, label de botón |
| `--porcelain-050` | `porcelain-050` | `#F4F1EA` | titulares Cormorant |

### Contraste del texto gris · medido, no estimado

`--ash-500` se renombró a **`--ash-inactivo`**. El valor **no cambió** —el diseño está
aprobado y para su uso real es correcto—; lo que cambió es el nombre, porque `ash-500`
no decía nada y se estaba usando como «gris de texto secundario», que es justo lo que no
es.

Contrastes WCAG 2.1 reales sobre las superficies del sistema:

| Fondo | `--ash-inactivo` | `--ash-400` | `--porcelain-200` |
|---|---|---|---|
| `--slate-950` | 2.94:1 | 5.03:1 | 11.34:1 |
| `--slate-900` | 2.81:1 | 4.80:1 | 10.82:1 |
| `--slate-850` | 2.66:1 | 4.54:1 | 10.24:1 |
| `--slate-800` (input, menú) | **2.44:1** | **4.17:1** | 9.39:1 |

Tres consecuencias, y las tres son normativas:

1. **`--ash-inactivo` no llega a 4.5:1 sobre ninguna superficie.** Es legítimo únicamente
   donde WCAG exime al texto: controles **deshabilitados** (1.4.3 exceptúa los componentes
   inactivos) y el **placeholder**, que nunca lleva información que no esté en la etiqueta.
2. **`--ash-400` es el mínimo para texto ACTIVO**, con una salvedad que hay que respetar:
   sobre **`--slate-800`** se queda en 4.17:1. En el input y en el menú de acciones el
   mínimo real es **`--porcelain-200`**.
3. El punto del estado `PENDIENTE` usa **`--estado-pendiente`** (mismo valor, nombre
   propio): es un punto de 6 px acompañado SIEMPRE de su etiqueta escrita, así que el
   mínimo de texto no le aplica.

`npm run lint:tokens` falla si `--ash-inactivo` o una utilidad `*-ash-500` aparecen en una
línea que no declare `disabled` o `placeholder`. Para el caso raro y justificado, el escape
de siempre: `// lint-tokens-ok: <motivo>`.

### Oro · kintsugi

| Token | Utilidad | Valor | Uso |
|---|---|---|---|
| `--gold-700` | `gold-700` | `#6E5417` | marco de sección, hairline apagado. **Nunca como texto.** |
| `--gold-600` | `gold-600` | `#8C6B1F` | solo relleno. **Nunca como texto.** |
| `--gold-500` | `gold-500` | `#A8842A` | etiquetas IA, iconografía tenue |
| `--gold-400` | `gold-400` | `#C9A227` | **ACENTO PRIMARIO**: veta, foco, barra, borde activo |
| `--gold-300` | `gold-300` | `#DDBB5C` | etiquetas UPPERCASE, enlaces |
| `--gold-200` | `gold-200` | `#EBD59A` | texto sobre botón obsidiana, nav activa |
| `--gold-100` | `gold-100` | `#F6EBC9` | texto en hover del botón primario |

Derivados del oro — **los únicos permitidos**, no inventes más:

| Token | Valor | Uso |
|---|---|---|
| `--gold-wash` | `rgba(201,162,39,.07)` | relleno de chip activo |
| `--gold-wash-fuerte` | `rgba(201,162,39,.09)` | conmutador activo |
| `--gold-borde` | `rgba(201,162,39,.45)` | borde de badge y chip |
| `--gold-halo` | `rgba(201,162,39,.20)` | halo de veta de 1 px |
| `--gold-glow` | `rgba(201,162,39,.12)` | glow interior en hover |
| `--gold-shimmer` | `rgba(201,162,39,.09)` | brillo del skeleton |
| `--gold-foco` | `rgba(201,162,39,.30)` | anillo de foco suave |

Gradiente de pan de oro: `--gold-leaf` =
`linear-gradient(135deg,#6E5417 0%,#A8842A 30%,#F0DFA8 50%,#A8842A 70%,#6E5417 100%)`

### Semánticos · estado de un anime

| Estado (BD) | Color de punto/borde | Color de texto | Valores |
|---|---|---|---|
| `VISTO` | `--estado-visto` | `--gold-200` | `#C9A227` / `#EBD59A` |
| `VIENDO` | `--estado-viendo` | `--estado-viendo-texto` | `#C97F2A` / `#E2A468` |
| `EN_ESPERA` | `--estado-espera` | `--ash-400` | `#7A838E` |
| `ABANDONADO` | `--estado-abandonado` | `--estado-abandonado-texto` | `#8A3B3B` / `#C08A8A` |
| `PENDIENTE` | `--estado-pendiente` | `--ash-400` | `#565E68` / `#7A838E` |
| favorito | `--estado-favorito` | — | `#EBD59A` |

**Crítico:** `--estado-viendo` y `--estado-abandonado` son para **puntos, barras y bordes**.
Como color de texto se usan **siempre** sus variantes `-texto` (contraste ≥4.5:1).
El granate `#8A3B3B` es color de **estado**, nunca de marca y nunca de texto. Pinta el punto del
estado `ABANDONADO` (badge y chip de filtro), el relleno de la barra de progreso de un anime
abandonado, el subrayado de la pestaña Peligro, el hover del botón `destructivo`, el borde del
campo con error de validación y los puntos de «esto no funciona» (espejo caído en Sitios, fila
con error en Importar). Fuera de esos sitios no se escribe.

`--estado-pendiente` y `--ash-inactivo` valen lo mismo (`#565E68`) y son **tokens distintos a
propósito**: el primero es punto y borde, el segundo es texto inactivo, y separarlos es lo que
permite que el lint de texto inactivo no tenga que hacer excepciones. `--ash-500` es el nombre
muerto de los dos: `design/tokens.css` lo conserva, pero ese fichero no entra en el build y en
`globals.css` no existe ningún `--ash-500`, así que `var(--ash-500)` no resuelve a nada.

Bordes y washes semánticos disponibles: `--estado-viendo-borde` `rgba(201,127,42,.45)` ·
`--estado-abandonado-borde` `rgba(138,59,59,.50)` · `--estado-viendo-wash` `rgba(201,127,42,.07)`
· `--estado-abandonado-wash` `rgba(138,59,59,.09)`.

## Tipografía

Tres familias, cargadas con `next/font/google`, y ningún peso más:

| Familia | Variable | Pesos | Uso |
|---|---|---|---|
| Cormorant Garamond | `--font-display` | 300, 400 | titulares, números grandes, logotipo |
| Inter | `--font-ui` | 400, 500, 600 | toda la interfaz |
| IBM Plex Mono | `--font-mono` | 400 | datos y meta: episodios, fechas, contadores |

Escala **display** (Cormorant): `hero` 84 · `display-xl` 72 · `display-l` 64 · `display-m` 56 ·
`display-s` 44 · `display-xs` 40 · `titulo-l` 34 · `titulo-m` 32 · `titulo-s` 28 · `titulo-xs` 26.
Fuera de la escala, y solo para el logotipo: `marca` 19 (ver «Reglas duras»).

Escala **UI** (Inter): `cuerpo-l` 17 · `cuerpo` 16 · `cuerpo-s` 15 · `ui` 14 · `ui-s` 13 ·
`ui-xs` 12 · `etiqueta` 11 · `etiqueta-xs` 10.

Escala **mono** (IBM Plex Mono): `mono-l` 14 · `mono` 12 · `mono-s` 11.

Tracking: `--tracking-display` .02em · `--tracking-etiqueta` .18em · `--tracking-marca` .22em ·
`--tracking-boton` .04em · `--tracking-badge` .10em.

Interlineado: `hero` 1.02 · `display` 1.05 · `titulo` 1.2 · `cuerpo` 1.7 · `cuerpo-l` 1.8 ·
`ui` 1.4 · `solido` 1.

Reglas duras:

- **Cormorant nunca por debajo de 26 px, con una única excepción: el logotipo.**
  `--text-marca` (utilidad `text-marca`, 19 px, `globals.css:111`) es ese hueco, y vale **solo**
  para la marca: `src/components/ui/marca.tsx` y el logotipo de la landing. `DESIGN-SPEC.md` §2
  fija el logotipo entre 15 y 19 px, y no encaja ni en la escala display —que empieza en 26— ni
  en la de UI, porque es Cormorant. Tiene nombre propio en vez de quedarse como un `text-[19px]`
  suelto: así se busca, se cambia en un sitio, y la excepción queda declarada en vez de
  incumplida en silencio. Cualquier otra pieza en Cormorant sube a `titulo-xs` (26). No se
  añaden más excepciones. Ojo con la cabecera de este documento: `--text-marca` es el único
  token de `@theme` que nace en `globals.css` y no está ni en `design/tokens.json` ni en
  `design/tokens.css`.
- **Mono nunca para texto corrido.**
- Etiquetas UPPERCASE siempre en `--gold-300`, nunca en `--gold-400` (satura).
- No se sustituyen las fuentes. Nada de Roboto, Arial ni `system-ui` como primaria.

## Espaciado, geometría, sombra, movimiento

Rejilla base **8 px**:
`--e-0` 0 · `--e-05` 4 · `--e-1` 8 · `--e-1-5` 12 · `--e-2` 16 · `--e-2-5` 20 · `--e-3` 24 ·
`--e-3-5` 28 · `--e-4` 32 · `--e-5` 40 · `--e-6` 48 · `--e-7` 56 · `--e-8` 64 · `--e-9` 72 ·
`--e-10` 80 · `--e-12` 96 · `--e-13` 104.

`--e-3-5` (28) está **fuera de la rejilla, y a propósito**: `DESIGN-SPEC.md` lo pide en dos
sitios concretos —el alto del chip de espejo (§4, artboard 09) y el gutter vertical de la
rejilla de cards (§1)— y ya existía como literal `[28px]` escrito a mano, que es peor. **No** es espaciado
general: para eso están `--e-3` y `--e-4`. La lista de arriba es la escala **completa**; quien
la lea como incompleta volverá a escribir `[28px]`, que es justo lo que el token evita.

Contenedor `--contenedor-max` 1440 · gutters 24 / 32 / 40 · `--marco-offset` 24 ·
`--tactil-min` 44.

Radios (piedra tallada, nada de píldoras): card 6 · input 4 · botón 4 · chip 3 · barra 1 ·
avatar 50 %. El marco dorado **nunca** lleva radio (`--radio-marco: 0`).

Sombras planas, **nunca de color**: `--sombra-losa` `0 8px 24px rgba(0,0,0,.6)` ·
`--sombra-hoja` (bottom sheet móvil) · `--glow-oro` (inset) · `--halo-veta` · `--halo-punto` ·
`--halo-subrayado`.

Duraciones: `--dur-instante` 90 · `--dur-rapida` 120 · `--dur-base` 180 · `--dur-lenta` 260 ·
`--dur-shimmer` 2600 · `--dur-giro` 1100.
Curvas: `--ease-base` `cubic-bezier(.4,0,.2,1)` · `--ease-entrada` `cubic-bezier(0,0,.2,1)` ·
`--ease-salida` `cubic-bezier(.4,0,1,1)`.

Breakpoints: `movil` 390 · `tablet` 768 · `laptop` 1024 · `desktop` 1440.

## La veta kintsugi

Divisor de 1 px con halo. Tres formas, y solo tres:

1. **Divisor de sección** — `h-px` + `bg-[image:var(--veta-horizontal)]` +
   `shadow-[var(--halo-veta)]`.
2. **Borde izquierdo en hover** — `border-l border-transparent hover:border-[var(--gold-400)]`
   sobre la card o la fila.
3. **Veta decorativa SVG** — `stroke:var(--gold-400)` a 1 px más un segundo trazo de 4–5 px al
   7–14 % de opacidad como halo. **Solo** en hero de landing y header del dashboard.

## Fondo global (tres capas, de abajo arriba)

1. Color plano `--slate-950`.
2. Polígonos de laja fracturada: SVG en `background-image`, tile 1200 × 900, trazo
   `--porcelain-100` al 5,5 % (`--textura-laja-opacidad`).
3. Ruido monocromo: `feTurbulence fractalNoise baseFrequency .9`, saturación 0, tile 180 × 180,
   al 3,2 % (`--textura-ruido-opacidad`).

La laja fotográfica (`public/texturas/laja-*.webp`) solo aparece en el hero de la landing, el
fondo de auth y el fondo móvil, siempre bajo un velo de `--void` al 86–97 %.

## Las reglas del oro (no negociables)

1. **El oro nunca cubre más del 10 % del área de una pantalla.** Si al entornar los ojos ves
   oro antes que piedra, sobra oro.
2. **Nunca oro sobre oro.** Ni texto dorado sobre relleno dorado, ni borde dorado dentro de una
   card con borde dorado, ni badge dorado sobre chip dorado.
3. **Un solo botón de relleno dorado sólido por pantalla, como máximo.** El resto son obsidiana
   con borde dorado. Landing → `Entrar al Vault`. Modal → `Añadir al vault`.
   Ajustes → `Importar N series`.
4. Nunca texto dorado por debajo de 12 px sobre fondo claro.

## Qué NO hacer

- Nada de gradientes morados, neón, glow de color ni estética «gamer».
- Nada de sombras de color: la elevación se comunica con el hairline dorado y `--sombra-losa`.
- Nada de píldoras redondas salvo el avatar.
- No usar las texturas de laja ni las piezas kintsugi como relleno decorativo: **solo** hero de
  landing, fondo de auth, fondo del artboard móvil y los paneles de arte explícitos.
- No inventar tonos intermedios de gris ni de oro.
- **No animar con `transform: scale()` en hover de cards.** El movimiento del sistema es de
  opacidad y de color de borde.
