/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS DESTINOS DE LA LANDING, EN UN SOLO SITIO Y COMPROBABLES.
 *
 * ── POR QUÉ ESTO ES UN `.ts` Y NO VIVE DENTRO DEL `.tsx` ───────────────────
 * Vitest corre con `environment: "node"` y **no transforma JSX**: un test que
 * importe un componente falla al parsear. Así que la lógica que merece test
 * sale del componente a un módulo puro. Es la regla del repo, no una
 * preferencia (ver la cabecera de `src/lib/ui/href.ts`).
 *
 * ── QUÉ PROTEGE ───────────────────────────────────────────────────────────
 * Dos cosas que en una landing se rompen en silencio:
 *
 * 1. **Un ancla muerta.** `#precios` en la nav y ningún elemento con
 *    `id="precios"` no da error en ninguna parte: el navegador simplemente no
 *    se mueve. `anclasMuertas()` lo convierte en un test rojo.
 * 2. **La regla del oro nº 3** — «un solo botón de relleno dorado sólido por
 *    pantalla, como máximo» (`design-tokens.md`). No hay tipo que lo impida:
 *    dos `variante="solido"` en dos ficheros distintos compilan igual. Aquí
 *    los tres CTA se declaran juntos y un test cuenta los sólidos.
 *
 * La comprobación de que los ids se PINTAN de verdad la hace el navegador en
 * `e2e/landing.spec.ts`: esta lista es el contrato, el e2e es el camino real.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type EnlaceLanding = {
  readonly etiqueta: string;
  readonly href: string;
};

/** Las tres variantes de botón que usa la landing. Ver `components/ui/boton.tsx`. */
export type VarianteCta = "solido" | "primario" | "secundario";

export type CtaLanding = EnlaceLanding & { readonly variante: VarianteCta };

/** Las dos únicas rutas a las que apunta la landing. Ambas existen hoy. */
export const RUTA_LOGIN = "/login";
export const RUTA_REGISTRO = "/registro";

/**
 * Los `id` que la landing pinta de verdad.
 *
 * **Si añades un ancla a la pantalla, añádela aquí; si quitas una, quítala.**
 * No se deriva del JSX porque este módulo no puede leerlo — de eso se encarga
 * el recorrido en navegador, que pulsa cada enlace y comprueba que el destino
 * se ve.
 */
/** Las anclas que ALGUIEN pinta de verdad. Si una entrada de nav no está
 * aquí, `anclasMuertas` la delata. */
export const ANCLAS_PINTADAS = ["caracteristicas"] as const;

/** Nav del hero. Las tres son anclas de la propia página: no hay más rutas. */
export const ENLACES_NAV: readonly EnlaceLanding[] = [
  // ── AQUÍ HABÍA TRES ENTRADAS Y QUEDA UNA ──────────────────────────────
  //
  // «Precios» apuntaba al KPI de «0 €», que se ha quitado por inventado: sin
  // él, el ancla `#precios` no existe. Y no hay precio que enseñar, así que
  // tampoco hay sección que construir.
  //
  // «Sitios» caía en una tarjeta que habla de retomar un episodio, no de
  // sitios de streaming — y `streaming_site` tiene CERO filas. Una entrada de
  // navegación que promete una sección de sitios cuando no hay ni sección ni
  // sitios es la misma mentira que un enlace muerto, solo que más difícil de
  // ver: el ancla funciona, y lo que falla es lo que prometía.
  //
  // Queda la que lleva a una sección que existe de verdad.
  { etiqueta: "Características", href: "#caracteristicas" },
];

/** Botón de la nav: obsidiana con borde dorado. */
export const CTA_NAV: CtaLanding = {
  etiqueta: "Entrar",
  href: RUTA_LOGIN,
  variante: "primario",
};

/** **El único relleno dorado sólido de la pantalla** (regla del oro nº 3). */
export const CTA_PRINCIPAL: CtaLanding = {
  etiqueta: "Entrar al Vault",
  href: RUTA_LOGIN,
  variante: "solido",
};

export const CTA_SECUNDARIO: CtaLanding = {
  etiqueta: "Crear cuenta",
  href: RUTA_REGISTRO,
  variante: "secundario",
};

/** Todos los CTA de la pantalla, juntos, para poder contarlos. */
export const CTAS_LANDING: readonly CtaLanding[] = [CTA_NAV, CTA_PRINCIPAL, CTA_SECUNDARIO];

/** Todo lo pulsable de la landing, para las comprobaciones de destino. */
export const ENLACES_LANDING: readonly EnlaceLanding[] = [...ENLACES_NAV, ...CTAS_LANDING];

export function esAncla(href: string): boolean {
  return href.startsWith("#");
}

/** `"#precios"` → `"precios"`. Una ruta devuelve `null`, no una cadena vacía. */
export function idDeAncla(href: string): string | null {
  if (!esAncla(href)) return null;
  const id = href.slice(1);
  return id.length === 0 ? null : id;
}

/**
 * Anclas que apuntan a un `id` que la pantalla no pinta.
 *
 * Devuelve la lista, no un booleano, para que el test diga CUÁL está muerta.
 */
export function anclasMuertas(
  enlaces: readonly EnlaceLanding[],
  idsPintados: readonly string[],
): string[] {
  const conocidos = new Set(idsPintados);
  return enlaces
    .map((enlace) => idDeAncla(enlace.href))
    .filter((id): id is string => id !== null && !conocidos.has(id));
}

/** Destinos que no son ni ruta propia (`/…`) ni ancla (`#…`). Deben ser cero. */
export function destinosAjenos(enlaces: readonly EnlaceLanding[]): string[] {
  return enlaces
    .filter((enlace) => !enlace.href.startsWith("/") && !esAncla(enlace.href))
    .map((enlace) => enlace.href);
}

/** Los CTA de relleno dorado sólido. La regla del oro permite **uno**. */
export function botonesSolidos(ctas: readonly CtaLanding[]): CtaLanding[] {
  return ctas.filter((cta) => cta.variante === "solido");
}
