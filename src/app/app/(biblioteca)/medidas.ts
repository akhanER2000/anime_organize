/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS MEDIDAS DE LA BIBLIOTECA, ESCRITAS UNA VEZ.
 *
 * La pantalla la componen cuatro piezas —cabecera, rejilla, vacío y el
 * esqueleto de `loading.tsx`— y las cuatro tienen que caer sobre la MISMA
 * columna. Si cada una escribiera su padding, el esqueleto se movería un par de
 * píxeles al llegar los datos: exactamente el salto de layout que el hueco 2:3
 * de la card ya evita dentro de cada celda.
 *
 * Son cadenas de clases, no números: Tailwind v4 las encuentra escaneando este
 * fichero igual que cualquier `.tsx`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Padding lateral de pantalla — DESIGN-SPEC §3: 40 · 32 · 24 · 20 px.
 *
 * Es el MISMO que aplica `BarraFiltros`, y tiene que serlo: los chips y la
 * primera columna de portadas comparten margen izquierdo en el artboard.
 */
export const PADDING_LATERAL = [
  "px-[var(--e-2-5)]",
  "tablet:px-[var(--gutter-s)]",
  "laptop:px-[var(--gutter)]",
  "desktop:px-[var(--gutter-l)]",
].join(" ");

/**
 * Padding vertical del contenido — DESIGN-SPEC §03: «padding 36/40/56».
 *
 * 36 px NO existe en la rejilla de 8 y `tokens.css` no lo declara (llega a 32
 * con `--e-4` y salta a 40 con `--e-5`). Se usa `--e-4`, que es el token que cae
 * al lado, en vez de escribir `pt-[36px]` suelto: la regla dice que un valor que
 * no esté en los tokens no se escribe en el código. Anotado en `SUPUESTOS.md`.
 */
export const PADDING_VERTICAL = "pt-[var(--e-4)] pb-[var(--e-7)]";

/**
 * La rejilla de portadas — DESIGN-SPEC §3 y §03.
 *
 * 5 columnas en desktop, 4 en laptop, 3 en tablet, 2 en móvil.
 * Gap 24 px horizontal (`--gutter-s`) / 28 px vertical (`--e-3-5`).
 *
 * Los breakpoints del proyecto son `movil` `tablet` `laptop` `desktop`. Los de
 * Tailwind (`sm:` `md:` `lg:`) están BORRADOS en `globals.css` y compilan a
 * nada, así que un despiste aquí no se vería: se vería una rejilla de 2
 * columnas en un monitor de 27 pulgadas.
 */
export const REJILLA = [
  "grid grid-cols-2 tablet:grid-cols-3 laptop:grid-cols-4 desktop:grid-cols-5",
  "gap-x-[var(--gutter-s)] gap-y-[var(--e-3-5)]",
].join(" ");

/**
 * Ancho máximo del párrafo de un estado vacío — DESIGN-SPEC §08: «párrafo
 * 380 px máx.».
 *
 * Es una medida del diseño, no un número inventado: vive aquí con su cita en
 * vez de repetida en dos componentes.
 */
export const ANCHO_PARRAFO_VACIO = "max-w-[380px]";

/**
 * ── UN ENLACE CON ASPECTO DE BOTÓN DE BORDE DORADO ────────────────────────
 *
 * «Quitar los filtros» **navega**: es un `<a>`, no un `<button>`. Solo un ancla
 * se abre con el clic central, se copia con «copiar dirección» y funciona con
 * JavaScript caído — y es coherente con que el filtro viva en la URL, que es
 * toda la premisa de esta pantalla.
 *
 * `components/ui/boton.tsx` renderiza siempre un `<button>` y sus mapas de
 * clases son privados del módulo, así que la apariencia se reconstruye con los
 * MISMOS tokens y la misma fila de DESIGN-SPEC §6 («Botón», variante primario:
 * obsidiana + borde 1 px `--gold-400`, texto `--gold-200`). Es el mismo camino
 * que tuvo que tomar la landing en `boton-enlace.tsx`; el día que `Boton`
 * acepte `href`, las dos copias se borran. Anotado en `SUPUESTOS.md`.
 */
export const BOTON_BORDE_DORADO = [
  "inline-flex items-center justify-center gap-[var(--e-1)] no-underline",
  "rounded-boton border font-ui text-ui font-[var(--fw-ui-medium)] tracking-boton",
  "h-[var(--tactil-min)] px-[var(--e-3)]",
  "border-[var(--gold-400)] bg-[var(--slate-950)] text-[var(--gold-200)]",
  "transition-colors duration-[var(--dur-base)] ease-base",
  "hover:borde-pan-de-oro hover:text-[var(--gold-100)]",
  "active:bg-[var(--slate-700)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]",
].join(" ");
