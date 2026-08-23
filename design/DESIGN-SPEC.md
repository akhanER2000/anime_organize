# ANIME VAULT — Especificación de diseño

Obsidiana y oro. Una losa de laja negra partida y reparada con kintsugi: el oro es la
reparación, no el relleno.

Todos los valores de color, tipografía, espaciado, radio, sombra y duración que
aparecen aquí existen como custom property en `tokens.css`. Si un valor no está en
`tokens.css`, no debe escribirse en el código.

---

## 1. Fundamentos

| Concepto | Valor | Token |
|---|---|---|
| Rejilla base | 8 px | `--e-1` |
| Contenedor máximo | 1440 px | `--contenedor-max` |
| Padding lateral de pantalla | 40 px | `--gutter-l` |
| Gutter de rejilla de cards | 24 px horizontal / 28 px vertical | `--gutter-s` |
| Marco dorado de sección | rectángulo de 1 px `--gold-700` a 24 px del borde | `--marco-offset` |
| Elevación | `0 8px 24px rgba(0,0,0,.6)` | `--sombra-losa` |
| Radios | card 6 · input/botón 4 · chip 3 · avatar 50 % | `--radio-*` |
| Área táctil mínima (móvil) | 44 × 44 px | `--tactil-min` |

### Fondo global (tres capas, de abajo arriba)

1. Color plano `--slate-950`.
2. Polígonos de laja fracturada: SVG en `background-image`, tile de 1200 × 900,
   trazo `--porcelain-100` a `--textura-laja-opacidad` (5,5 %).
3. Ruido monocromo: `feTurbulence fractalNoise baseFrequency .9`, saturación 0,
   tile 180 × 180, a `--textura-ruido-opacidad` (3,2 %).

La laja fotográfica (`assets/web/laja-*.jpg`) solo aparece en hero de landing,
fondo de auth y fondo del artboard móvil, siempre por debajo de un velo de
`--void` al 86–97 %.

### La veta kintsugi

Divisor de 1 px con halo. Tres formas:

- **Divisor de sección** — `height:1px` + `--veta-horizontal` + `box-shadow: var(--halo-veta)`.
- **Borde izquierdo en hover** — `border-left:1px solid var(--gold-400)` sobre la card o fila.
- **Veta decorativa** — `<svg>` con `stroke:var(--gold-400)` a 1 px, más un segundo
  trazo de 4–5 px al 7–14 % de opacidad como halo. Solo en hero de landing y header
  del dashboard.

---

## 2. Tipografía

| Rol | Familia | Tamaño / peso | Tracking | Color |
|---|---|---|---|---|
| H1 landing | Cormorant Garamond | 84 / 300 | +.02em | `--porcelain-050` |
| Título de ficha | Cormorant Garamond | 64 / 300 | +.02em | `--porcelain-050` |
| H2 de sección | Cormorant Garamond | 56 / 300 | +.02em | `--porcelain-050` |
| H2 de pantalla | Cormorant Garamond | 44 / 300 | +.02em | `--porcelain-050` |
| H2 de contenido | Cormorant Garamond | 40 / 300 | +.02em | `--porcelain-050` |
| H3 card / vacío | Cormorant Garamond | 34 / 300 | +.02em | `--porcelain-050` |
| H3 modal | Cormorant Garamond | 32 / 300 | +.02em | `--porcelain-050` |
| Número KPI | Cormorant Garamond | 56 / 300 (34 en resúmenes) | 0 | `--porcelain-050` o `--gold-400` |
| Logotipo | Cormorant Garamond | 15–19 / 400 | +.22em | `--porcelain-100` |
| Cuerpo largo | Inter | 16–17 / 400 · lh 1.75 | 0 | `--porcelain-200` |
| Cuerpo | Inter | 15 / 400 · lh 1.7 | 0 | `--ash-400` |
| UI / botón | Inter | 14 / 500 | +.04em en botones | `--porcelain-100` |
| UI secundaria | Inter | 13 / 400 | 0 | `--porcelain-200` |
| Etiqueta de sección | Inter | 11 / 600 UPPERCASE | +.18em | `--gold-300` |
| Badge GRATIS/PAGO | Inter | 10 / 500 UPPERCASE | +.10em | `--porcelain-200` / `--gold-200` |
| Datos y meta | IBM Plex Mono | 12 / 400 | 0 | `--ash-400` |
| Meta menor | IBM Plex Mono | 11 / 400 | 0 | `--ash-500` |

Reglas: Cormorant nunca por debajo de 26 px. Mono nunca para texto corrido.
Etiquetas UPPERCASE siempre en `--gold-300`, nunca en `--gold-400` (satura).

---

## 3. Breakpoints

| Nombre | Rango | Token |
|---|---|---|
| `movil` | 390 – 767 | `--breakpoint-movil` |
| `tablet` | 768 – 1023 | `--breakpoint-tablet` |
| `laptop` | 1024 – 1439 | `--breakpoint-laptop` |
| `desktop` | ≥ 1440 | `--breakpoint-desktop` |

### Qué cambia en cada uno

| Elemento | desktop ≥1440 | laptop 1024–1439 | tablet 768–1023 | móvil 390–767 |
|---|---|---|---|---|
| Rejilla de portadas | 5 columnas | 4 columnas | 3 columnas | 2 columnas |
| Padding lateral | 40 px | 32 px | 24 px | 20 px |
| Barra superior | logo + buscador 520 px + CTA + avatar | buscador flexible | buscador colapsa a icono | logo + icono de lupa |
| Barra de filtros | chips + 3 selects + conmutador | chips + selects, conmutador a la derecha | chips en fila con scroll horizontal | chips con scroll horizontal, sin selects |
| Vista lista | 8 columnas | oculta Géneros | oculta Géneros y Actualizado | se sustituye por cards |
| Ficha | portada 380 px + contenido `1fr`, gap 56 | portada 320 px, gap 40 | una columna, portada 280 px centrada | portada a sangre 300 px, contenido debajo |
| Buscador | panel lateral 320 px fijo | panel 280 px | panel colapsado en `<details>` | hoja inferior de filtros |
| Hub de streaming | 4 columnas | 3 columnas | 2 columnas | 1 columna |
| Modal | 760 px centrado | 680 px | 90 vw | hoja inferior a sangre |
| Navegación | superior | superior | superior | inferior de 4 ítems, 82 px + safe area |
| Marco dorado de sección | 24 px | 24 px | 16 px | se retira |

---

## 4. Artboard por artboard

Medidas tomadas del lienzo `ANIME-VAULT.dc.html`. Todos los artboards miden
1440 px de ancho salvo indicación.

### 01 · Hoja de estilo — 1440 × 1732
- Padding interno 72 px vertical / 80 px horizontal. Marco dorado a 24 px.
- Paleta: tres filas de `grid-template-columns: repeat(7,1fr)`, gap 16 px;
  muestra de 88 px de alto (56 px en la fila de texto), radio 6 px.
- Tipografía: dos columnas `1fr 1fr`, gap 64 px; cada espécimen es una fila
  `flex` con la etiqueta mono a 120 px fijos.
- Texturas: rejilla 2 × 2, gap 16 px, muestras de 120 px de alto.
- Componentes: `grid-template-columns: 1.15fr 1fr`, gap 56 px.

### 02 · Landing — 1440 × 2764
- **Hero** 900 px de alto. Fondo `laja-hero.jpg` al 50 % + velo diagonal
  `linear-gradient(105deg, …)`. Veta dorada en SVG de esquina inferior izquierda
  a superior derecha. Marco a 24 px.
- Nav a 56 px del borde superior; H1 a 250 px; ancho de columna de texto 640 px.
- CTA: un único botón de relleno dorado (`Entrar al Vault`) + secundario de borde.
- KPIs: tres números Cormorant 34 px en `--gold-400`, meta mono 12 px.
- Panel de arte a la derecha: 404 × 560, marco de 1 px `--gold-700` con 10 px de aire.
- **Características**: 3 columnas, gap 64 px, padding 104/80/96. Iconos hairline
  de 34 px, `stroke-width:1`, `--gold-400`.
- **Captura enmarcada**: marco `--gold-700` de 1 px con 14 px de aire sobre `--void`.
- **Progreso**: 2 columnas, gap 96 px, fondo `--slate-900`, veta superior de 1 px.
- **Footer**: marco dorado a 24 px, tres columnas de enlaces, gap 72 px.

### 03 · Biblioteca (rejilla) — 1440 × 1160
- Barra superior 76 px, fondo `--slate-900`, veta dorada de 1 px en el borde
  inferior + veta decorativa SVG en la esquina derecha.
  Buscador de 520 px, alto 44 px, con atajo `⌘K` en mono 11.
- Barra de filtros: padding 16/40, `border-bottom:1px solid --slate-800`.
  Chips a la izquierda (alto 32 px, radio 3), selects y conmutador a la derecha.
- Contenido: padding 36/40/56. Cabecera con H2 40 px + contador mono.
- Rejilla: `repeat(5,1fr)`, gap 28 px vertical / 24 px horizontal.
  Card: `padding-left:14px` + `border-left:1px solid transparent`
  (pasa a `--gold-400` en hover).
- Progreso: hairline de 1 px, pista `--slate-700`, relleno `--gold-400`
  con `--halo-punto`. En estado *Abandonado* el relleno es `--estado-abandonado` sin halo.

### 04 · Vista lista — 1440 × 823
- Barra superior 64 px. Padding de contenido 32/40/48.
- Tabla: `grid-template-columns: 28px 44px 2fr 1.3fr 1.2fr 1.5fr .95fr 96px`, gap 18 px,
  padding de fila 13/20, alto de fila 74 px.
- Cabecera `--slate-850` con etiquetas de 11 px en `--gold-300`.
- Cebra: filas impares `--slate-950`, pares `--slate-900`.
- Miniatura 32 × 48, radio 3, inicial en Cormorant 16 px.
- Menú de acciones: 196 px, `--slate-800`, borde superior `--gold-400`, sombra de losa.

### 05 · Ficha de anime — 1440 × 1081
- Barra superior 64 px. Contenido `grid-template-columns: 380px 1fr`, gap 56 px,
  padding 48/40/56.
- Portada: marco `--gold-700` de 1 px con 10 px de aire, proporción 2:3.
- Títulos alternativos: mono 13 px, tres líneas, gap 5 px.
- Chips de género: oficiales con borde `rgba(201,162,39,.4)` y texto `--gold-300`;
  etiquetas IA con borde **punteado** y texto `--gold-500`, prefijo `✦`.
- Bloque de progreso: card `--slate-850`, borde superior `--gold-400`, padding 28/32.
  Número 56 px Cormorant, botones − / + de 44 × 44, barra de 2 px.
- Enlaces para continuar: filas de 48 px con veta izquierda en hover.
- Dónde verlo: 3 columnas, gap 12 px; chips V1/V2/V3 en mono 11 px,
  el activo con `--gold-wash` + `--gold-borde`.

### 06 · Modal añadir — lienzo 1440 × min 1080 (1303 con aviso)
- Fondo: biblioteca al 40 % + velo `rgba(7,8,10,.86)`.
- Modal 760 px, `--slate-900`, borde superior `--gold-400`, radio 6, sombra de losa,
  96 px de aire arriba y abajo.
- Campo de título en foco: borde `--gold-400` + anillo `--gold-foco` con 2 px de offset.
- Lista de autocompletado: máximo 3 visibles, ítem activo con `--gold-wash`
  y veta izquierda; miniatura 30 × 44.
- Aviso de duplicado: card `--slate-850`, borde `--estado-viendo-borde`,
  borde izquierdo de 2 px `--estado-viendo`, icono `⚠`, dos botones
  (`Ver el que tengo` con borde dorado · `Añadir igualmente` neutro).
- Imagen: campo de URL + zona de arrastre punteada (que pasa a `--gold-400` en hover)
  y vista previa 2:3 enmarcada en oro.
- Pie: `✦ Completar con IA` (borde punteado dorado) a la izquierda; a la derecha
  Cancelar + el único botón de relleno dorado de la pantalla.

### 07 · Auth — 1440 × 754
- Fondo `laja-marco.jpg` al 55 % + radial de `--void`. Marco a 24 px.
- Tres cards de igual ancho, `repeat(3,1fr)`, gap 32 px, padding interno 36/32.
- Solo la card activa (Iniciar sesión) lleva borde superior `--gold-400`.
- Campo con error: borde `--estado-abandonado`, mensaje en mono 12 px
  `--estado-abandonado-texto` con icono `⚠`.
- Medidor de contraseña: cuatro segmentos de 2 px; llenos en `--gold-400`.

### 08 · Buscador y filtros — 1440 × 950
- Barra superior 76 px con el buscador en foco ocupando el ancho restante.
- `grid-template-columns: 320px 1fr`; el panel lleva `border-right:1px solid --slate-800`
  y padding 32/28/48.
- Faceta: casilla de 15 px (radio 2, borde `--slate-600`); marcada = relleno
  `--gold-400` con `✓` en `--void`. Recuento a la derecha en mono 11.
- Divisores entre grupos de facetas: `linear-gradient(90deg,--gold-700,transparent)`.
- Resultados: 2 columnas, gap 16 px; card de 110 px de alto con miniatura 52 × 78.
- Contador en vivo: número Cormorant 40 px + leyenda mono.
- Vacío: icono de laja de 72 px, H3 34 px, párrafo 380 px máx., botón de borde dorado.

### 09 · Hub de streaming — 1440 × 626
- Padding 44/40/56. Rejilla `repeat(4,1fr)`, gap 20 px.
- Card 132 px mínimo: icono 40 × 40 (radio 4, borde `--slate-600`),
  nombre 15/500, recuento mono 11, badge GRATIS/PAGO arriba a la derecha.
- Solo la primera card (sitio preferido) lleva borde superior `--gold-400`.
- Chips de espejo: 28 px de alto, el activo con `--gold-wash`.
- Última celda: card punteada de «Añadir otro sitio».

### 10 · Ajustes — 1440 × 823 (mínimo)
- Pestañas de 48 px de alto sobre `border-bottom:1px solid --slate-800`;
  la activa lleva subrayado de 1 px `--gold-400` con `--halo-subrayado`
  (en Peligro el subrayado es `--estado-abandonado`).
- Importar: `grid-template-columns: 1fr 340px`, gap 40 px.
  Tabla de previsualización con cebra y columna de resultado
  (`✓ nuevo` oro · `⚠ duplicado` brasa · `✕ error` granate de texto).
- Resumen: card con tres cifras Cormorant 34 px separadas por hairlines.
- Peligro: card con borde `--estado-abandonado-borde`, confirmación escrita
  («BORRAR MI VAULT») y botón destructivo deshabilitado hasta que el texto coincide.

### 11 · Estados del sistema — 1440 × 1048
- Rejilla 2 × 2 con divisores de 1 px `--slate-800`; cada celda 380–440 px de alto,
  padding 56/48.
- **Vacío**: icono de losa 96 px, H3 38 px, dos botones.
- **Skeleton**: `linear-gradient(100deg, --slate-850 30%, --gold-shimmer 50%, --slate-850 70%)`,
  `background-size:300% 100%`, animación `vetaBrillo 2.6s linear infinite`,
  desfase de 0 / .3 / .6 s por columna.
- **Toasts**: 460 px máx., borde izquierdo de 2 px (`--gold-400` éxito ·
  `--estado-viendo` error), sombra de losa, acción a la derecha en mono 12.
  El spinner es un aro de 14 px con `border-top-color:--gold-400` girando 1,1 s.
- **404**: número 96 px Cormorant, veta SVG rota al fondo, botón de borde dorado.

### 12 · Móvil — tres pantallas de 390 × 844
- Marco de dispositivo: borde 1 px `--slate-600`, radio 10, `overflow:hidden`.
- Barra de estado 9:41 en mono 13.
- **Biblioteca**: cabecera 60 px, chips con scroll horizontal (alto 34 px),
  rejilla de 2 columnas gap 28/16, degradado de 56 px sobre el corte inferior.
- **Ficha**: portada a sangre de 300 px con degradado a `--slate-950`;
  contenido montado −42 px sobre la imagen; botones − / + de 44 × 44.
- **Hoja de añadir**: bottom sheet con `--sombra-hoja`, borde superior `--gold-400`,
  radio 10 solo arriba, tirador de 44 × 3 px, padding 14/22/30.
- **Navegación inferior**: 4 ítems, 52 px de alto + 22 px de safe area,
  veta dorada de 1 px en el borde superior; ítem activo en `--gold-200`,
  resto en `--ash-400`.

---

## 5. Portadas 2:3 (placeholders)

En esta entrega los huecos de portada van **vacíos a propósito**: las imágenes de
prueba no forman parte del sistema.

| Propiedad | Valor |
|---|---|
| Proporción | `aspect-ratio: 2 / 3`, sin excepción |
| Radio | 6 px (`--radio-card`) |
| Borde | 1 px `--slate-700` |
| Fondo en reposo | `--slate-850` |
| Recorte | `object-fit: cover`, `overflow: hidden` |
| Anchos de referencia | 253 px (rejilla 5 col) · 167 px (móvil 2 col) · 380 px (ficha) · 52 × 78 (resultado de búsqueda) · 32 × 48 (fila de tabla) |
| Reposo | imagen plana, badge de estado arriba a la izquierda, estrella de favorito arriba a la derecha |
| Hover | veta dorada de 1 px en el borde izquierdo de la card + franja inferior de 66 px con `linear-gradient(transparent, rgba(7,8,10,.94))` que revela tres acciones de 36 × 36 px (`▶` con borde `--gold-400`, `✎` y `★` con borde `--slate-600`); transición `opacity var(--dur-base) var(--ease-base)` |
| Sin imagen | fondo `--slate-850` + inicial del título en Cormorant `--ash-500`, o el hueco soltable del lienzo |
| Carga | skeleton con shimmer dorado (ver artboard 11) |

---

## 6. Componente → variantes → estados

| Componente | Variantes | default | hover | focus | active | disabled | loading | error | vacío |
|---|---|---|---|---|---|---|---|---|---|
| Botón | primario (borde oro), sólido oro, secundario, destructivo, fantasma | obsidiana + borde 1 px `--gold-400`, texto `--gold-200` | borde `--gold-leaf` + `--glow-oro`, texto `--gold-100` | anillo 2 px `--gold-400`, offset 2 px | fondo `--slate-700`, sin desplazamiento | borde `--slate-600`, fondo `--slate-900`, texto `--ash-500`, `cursor:not-allowed` | spinner de 14 px a la izquierda del label, ancho fijo | borde `--estado-abandonado` (solo destructivo) | — |
| Input / textarea | texto, contraseña, URL, búsqueda | fondo `--slate-800`, borde `--slate-600` | borde `--slate-500`≈`--slate-600` aclarado | borde `--gold-400` + anillo `--gold-foco` 2 px offset 2 | cursor visible en `--gold-400` | fondo `--slate-900`, texto `--ash-500` | skeleton de 44 px | borde `--estado-abandonado` + mensaje mono `--estado-abandonado-texto` | placeholder en `--ash-500` |
| Chip de filtro | estado, favorito, género, formato | borde `--slate-700`, fondo `--slate-900` | borde `--slate-600`, texto `--porcelain-100` | anillo dorado | `--gold-wash` + subrayado 1 px `--gold-400` con halo | opacidad .5 | — | — | recuento `0` en `--ash-500` |
| Badge de estado | visto, viendo, en espera, abandonado, favorito | borde y texto del color semántico sobre `rgba(12,14,16,.85)` | — (no interactivo) | — | — | — | — | — | — |
| Chip de espejo | V1 · V2 · V3 | borde `--slate-700`, texto `--ash-400` | borde `--gold-700`, texto `--gold-300` | anillo dorado | `--gold-wash` + borde `--gold-borde` + texto `--gold-200` | opacidad .4 | — | enlace roto: texto `--estado-abandonado-texto` | «sin espejos» en mono `--ash-500` |
| Card de portada | rejilla, móvil, resultado, ficha | borde `--slate-700` | veta izquierda `--gold-400` + overlay de acciones | anillo dorado sobre la card entera | overlay al 100 % | opacidad .5 | skeleton con shimmer | miniatura fallida → inicial en Cormorant | hueco 2:3 con leyenda |
| Fila de tabla | normal, cebra, seleccionada | fondo `--slate-950` / `--slate-900` alterno | fondo `--slate-900` + veta izquierda | anillo dorado interior | veta izquierda + texto `--porcelain-050` | texto `--ash-500` | skeleton de 74 px | celda de resultado en granate | «sin resultados» centrado |
| Pestaña | perfil, importar, sitios, peligro | texto `--ash-400` | texto `--porcelain-100` | anillo dorado | subrayado 1 px `--gold-400` + halo (granate en Peligro) | texto `--ash-500` | — | punto brasa en la pestaña con error | — |
| Barra de progreso | hairline (card), 2 px (ficha) | pista `--slate-700` | — | — | relleno `--gold-400` + `--halo-punto` | relleno `--ash-500` | shimmer dorado | relleno `--estado-abandonado` sin halo | pista sola, sin relleno |
| Modal / hoja | añadir, confirmar, duplicado | `--slate-900` + borde superior `--gold-400` | — | foco atrapado dentro | — | — | pie con spinner y botones bloqueados | aviso brasa con borde izquierdo de 2 px | — |
| Toast | éxito, aviso, progreso | `--slate-850`, borde izquierdo 2 px | acción subrayada | anillo dorado en la acción | — | — | spinner de 14 px | borde `--estado-viendo-borde` | — |
| Conmutador de vista | rejilla / lista | icono `--porcelain-200` | fondo `--slate-700` | anillo dorado | `--gold-wash-fuerte` + subrayado dorado | — | — | — | — |
| Faceta | casilla | borde `--slate-600` | borde `--gold-700` | anillo dorado | relleno `--gold-400` + `✓` en `--void` | texto `--ash-500`, recuento 0 | — | — | grupo colapsado |
| Zona de arrastre | imagen, .xlsx | borde punteado `--slate-600` | borde `--gold-400` | anillo dorado | fondo `--gold-wash` | — | barra de progreso dorada | borde granate + motivo | icono + texto de ayuda |
| Navegación inferior | 4 ítems | icono y texto `--ash-400` | — | anillo dorado | icono y texto `--gold-200` | — | — | punto brasa sobre el icono | — |

---

## 7. Accesibilidad

- Contraste mínimo 4.5:1 para texto normal. `--gold-400` sobre `--slate-900`
  pasa; `--gold-600` y más oscuros **no se usan como texto** en ningún caso.
- Los colores semánticos brasa y granate solo se usan como texto en sus
  variantes `-texto` (`#E2A468`, `#C08A8A`).
- Foco siempre visible: anillo de 2 px `--gold-400` con 2 px de offset,
  nunca `outline:none` sin sustituto.
- Áreas táctiles ≥ 44 × 44 px en móvil; en escritorio, ≥ 32 px con separación de 8 px.
- El estado nunca se comunica solo por color: cada badge lleva etiqueta de texto
  y cada punto de color va acompañado del nombre del estado.
- `prefers-reduced-motion` desactiva shimmer, spinner y transiciones (ya en `tokens.css`).

---

## 8. Qué NO hacer

**Las reglas del oro (no negociables)**

1. **El oro nunca cubre más del 10 % del área de una pantalla.** Si al entornar los
   ojos ves oro antes que piedra, sobra oro.
2. **Nunca oro sobre oro.** Ni texto dorado sobre relleno dorado, ni borde dorado
   dentro de una card con borde dorado, ni badge dorado sobre chip dorado.
3. **Un solo botón de relleno dorado sólido por pantalla, como máximo.** El resto
   son obsidiana con borde dorado. En la landing es `Entrar al Vault`; en el modal,
   `Añadir al vault`; en Ajustes, `Importar 34 series`.
4. Nunca texto dorado por debajo de 12 px sobre fondo claro.

**Y además**

- Nada de gradientes morados, neón, glow de color ni estética «gamer».
- Nada de sombras de color: la elevación se comunica con el hairline dorado y con
  `--sombra-losa`, nunca con blur teñido.
- Nada de píldoras redondas salvo el avatar. Radios pequeños, sensación de piedra tallada.
- El granate `#8A3B3B` aparece **solo** en la pestaña Peligro y en los estados de
  error de validación. No es un color de marca.
- No uses las texturas de laja ni las piezas kintsugi como decoración de relleno:
  solo hero de landing, fondo de auth, fondo del artboard móvil y los paneles de
  arte explícitos.
- No inventes tonos intermedios de gris ni de oro. Si falta un valor, se añade a
  `tokens.css` y se justifica; no se escribe suelto en un componente.
- No sustituyas las fuentes: Cormorant Garamond para display, Inter para UI,
  IBM Plex Mono para datos. Nada de Roboto, Arial ni system-ui como primaria.
- No animes con `transform: scale()` en hover de cards; el movimiento del sistema
  es de opacidad y de color de borde.
