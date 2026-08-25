/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS MEDIDAS COMPARTIDAS DE LA LANDING, CALCULADAS UNA VEZ.
 *
 * Cinco secciones con el mismo padding lateral y el mismo marco dorado. Si cada
 * una lo escribiera por su cuenta, dentro de un mes serían cinco paddings
 * ligeramente distintos — que es exactamente lo que le pasó a las tres cards de
 * autenticación (ver `--ancho-card-auth` en `globals.css`).
 *
 * ── EL PADDING LATERAL DE ESTA PANTALLA NO ES EL GENÉRICO ─────────────────
 * DESIGN-SPEC §1 y §3 fijan 40/32/24/20 px como padding lateral **de pantalla**.
 * El artboard 02 dibuja la landing con **80 px** (`left:80px; right:80px` en la
 * nav, `padding:104px 80px 96px` en características…). Manda lo específico:
 * 80 px en desktop, bajando por breakpoint hasta 24 en móvil. Anotado en
 * `SUPUESTOS.md`.
 *
 * Son cadenas de clases, no números: Tailwind v4 las encuentra escaneando este
 * fichero igual que cualquier `.tsx`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** 24 · 40 · 64 · 80 px. El de desktop es el del artboard. */
export const PADDING_LATERAL =
  "px-[var(--e-3)] tablet:px-[var(--e-5)] laptop:px-[var(--e-8)] desktop:px-[var(--e-10)]";

/** El contenedor de 1440 px centrado, común a todas las secciones. */
export const CONTENEDOR = "mx-auto w-full max-w-[var(--contenedor-max)]";

/**
 * Marco dorado de sección: 1 px `--gold-700` a 24 px del borde.
 *
 * DESIGN-SPEC §3: 24 px en desktop y laptop · 16 px en tablet · **se retira en
 * móvil**. En 390 px de ancho, 24 px por lado se comen 48 y aprietan el texto
 * contra sí mismo. Sin radio: «el marco dorado nunca lleva radio».
 */
export const MARCO_DORADO = [
  "pointer-events-none absolute border border-[var(--gold-700)]",
  "hidden tablet:block",
  "inset-[var(--e-2)] laptop:inset-[var(--marco-offset)]",
].join(" ");

/** Etiqueta de sección: Inter 11/600 UPPERCASE, tracking .18em, `--gold-300`. */
export const ETIQUETA_SECCION = [
  "font-ui text-etiqueta font-[var(--fw-ui-bold)] uppercase",
  "tracking-etiqueta text-[var(--gold-300)]",
].join(" ");

/**
 * Aire por encima de un ancla al saltar a ella.
 *
 * Sin esto, `#caracteristicas` deja el título pegado al borde superior de la
 * ventana y parece que no ha pasado nada.
 */
export const AIRE_DE_ANCLA = "scroll-mt-[var(--e-8)]";
