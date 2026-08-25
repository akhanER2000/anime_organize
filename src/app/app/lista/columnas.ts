/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS COLUMNAS DE LA VISTA LISTA — DESIGN-SPEC §04 y §3.
 *
 * §04 fija ocho columnas:
 *
 *     grid-template-columns: 28px 44px 2fr 1.3fr 1.2fr 1.5fr .95fr 96px
 *
 * y §3 fija qué se cae al estrecharse la ventana:
 *
 *     desktop ≥1440   las ocho
 *     laptop  1024    oculta Géneros
 *     tablet  768     oculta Géneros y Actualizado
 *     móvil   390     NO HAY TABLA: se sustituye por cards (§3)
 *
 * ── POR QUÉ ESTO ES UN MÓDULO PURO Y NO CLASES SUELTAS EN EL JSX ──────────
 *
 * Porque la regla de colapso es LÓGICA, y una regla escrita solo como
 * `hidden laptop:table-cell` repartida por seis celdas no se puede comprobar:
 * hay que abrir un navegador, estrecharlo y mirar. Aquí la misma regla está
 * escrita una vez, se testea sin navegador (`columnas.test.ts`) y el JSX se
 * limita a recorrer la lista.
 *
 * `columnasVisibles()` es el MODELO —qué se ve a cada ancho— y
 * `claseDeVisibilidad()` es su TRADUCCIÓN a Tailwind. El test comprueba que las
 * dos dicen lo mismo, que es justo el fallo que este proyecto lleva persiguiendo
 * todo el día: dos representaciones de la misma regla que se separan en
 * silencio.
 *
 * Vitest corre en `environment: "node"` y no transforma `.tsx`, así que esta
 * lógica vive en un `.ts` a propósito (regla del encargo).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Los cuatro anchos del sistema. Son los MISMOS valores que `@theme` declara
 * como `--breakpoint-*` en `globals.css` y que DESIGN-SPEC §3 tabula.
 *
 * Se repiten aquí en píxeles porque este módulo no puede leer CSS. `movil` no
 * aparece en `DesdeBreakpoint`: por debajo de `tablet` no hay tabla en absoluto,
 * así que ninguna columna puede empezar ahí.
 */
export const BREAKPOINTS = {
  movil: 390,
  tablet: 768,
  laptop: 1024,
  desktop: 1440,
} as const;

export type NombreBreakpoint = keyof typeof BREAKPOINTS;

/** A partir de qué ancho existe una columna. Nunca `movil`: ver arriba. */
export type DesdeBreakpoint = "tablet" | "laptop" | "desktop";

export type IdColumna =
  | "seleccion"
  | "portada"
  | "titulo"
  | "estado"
  | "progreso"
  | "generos"
  | "actualizado"
  | "acciones";

export type Columna = {
  id: IdColumna;
  /** Lo que se anuncia como cabecera de columna. Nunca vacío: §7. */
  etiqueta: string;
  /**
   * La cabecera existe para el lector de pantalla pero no se pinta. Las dos
   * primeras columnas del artboard van en blanco: una casilla y una miniatura
   * no llevan rótulo, pero SÍ tienen que anunciarse al navegar por celdas.
   */
  etiquetaOculta: boolean;
  /** El ancho mínimo al que esta columna se ve. */
  desde: DesdeBreakpoint;
  /**
   * Ancho de la columna en la tabla (`table-fixed`).
   *
   * ── DE `fr` A PORCENTAJE, Y POR QUÉ ─────────────────────────────────────
   * §04 escribe los anchos en `fr`, que es sintaxis de CSS Grid. El encargo
   * exige una `<table>` de verdad (la navegación por celdas y el anuncio de
   * cabeceras se pierden con una rejilla de `<div>`), y una tabla no entiende
   * `fr`. La conversión conserva la PROPORCIÓN: 2 / 1.3 / 1.2 / 1.5 / .95 sobre
   * un total de 6.95 son 28.8 / 18.7 / 17.3 / 21.6 / 13.7 %, reescalados aquí
   * para dejar sitio a las tres columnas de ancho fijo.
   *
   * Las fijas llevan sumado el padding de fila de §04 (20 px a cada extremo):
   * 28 + 20 = 48 en la primera y 96 + 20 = 116 en la última.
   */
  ancho: string;
};

export const COLUMNAS: readonly Columna[] = [
  {
    id: "seleccion",
    etiqueta: "Seleccionar",
    etiquetaOculta: true,
    desde: "tablet",
    ancho: "w-[48px]",
  },
  { id: "portada", etiqueta: "Portada", etiquetaOculta: true, desde: "tablet", ancho: "w-[62px]" },
  { id: "titulo", etiqueta: "Título", etiquetaOculta: false, desde: "tablet", ancho: "w-[26%]" },
  { id: "estado", etiqueta: "Estado", etiquetaOculta: false, desde: "tablet", ancho: "w-[17%]" },
  {
    id: "progreso",
    etiqueta: "Progreso",
    etiquetaOculta: false,
    desde: "tablet",
    ancho: "w-[16%]",
  },
  { id: "generos", etiqueta: "Géneros", etiquetaOculta: false, desde: "desktop", ancho: "w-[20%]" },
  {
    id: "actualizado",
    etiqueta: "Actualizado",
    etiquetaOculta: false,
    desde: "laptop",
    ancho: "w-[13%]",
  },
  {
    id: "acciones",
    etiqueta: "Acciones",
    etiquetaOculta: false,
    desde: "tablet",
    ancho: "w-[116px]",
  },
] as const;

/**
 * Qué columnas se ven a un ancho de ventana dado.
 *
 * Devuelve `[]` por debajo de 768 px, y eso NO es un caso raro: es §3 diciendo
 * que en móvil «la lista se sustituye por cards». La tabla entera desaparece.
 */
export function columnasVisibles(anchoPx: number): readonly Columna[] {
  return COLUMNAS.filter((columna) => anchoPx >= BREAKPOINTS[columna.desde]);
}

/**
 * La traducción de `desde` a utilidades de Tailwind.
 *
 * Las columnas de `tablet` no llevan clase: la TABLA entera es
 * `hidden tablet:table`, así que por debajo de 768 no se ve ninguna y no hace
 * falta repetirlo celda a celda.
 *
 * OJO: `sm:` `md:` `lg:` `xl:` están desactivados en este proyecto
 * (`--breakpoint-*: initial` en `globals.css`) y compilan a CERO. Los nombres
 * son `movil:` `tablet:` `laptop:` `desktop:`.
 */
export function claseDeVisibilidad(columna: Columna): string {
  switch (columna.desde) {
    case "desktop":
      return "hidden desktop:table-cell";
    case "laptop":
      return "hidden laptop:table-cell";
    case "tablet":
      return "";
  }
}
