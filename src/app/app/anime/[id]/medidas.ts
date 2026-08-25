/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS MEDIDAS DE LA FICHA, CALCULADAS UNA VEZ — DESIGN-SPEC §05 y §3.
 *
 * La ficha, su esqueleto de carga y su 404 comparten envoltorio. Si cada uno
 * escribiera su padding, en un mes serían tres paddings distintos y el
 * esqueleto saltaría al convertirse en contenido. Ya le pasó a las tres cards
 * de autenticación (ver `--ancho-card-auth` en `globals.css`).
 *
 * Son cadenas de clases, no números: Tailwind v4 las encuentra escaneando este
 * fichero igual que cualquier `.tsx`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Padding lateral de pantalla — DESIGN-SPEC §3: 40 · 32 · 24 · 20 px.
 *
 * Mobile-first: lo de abajo es móvil (20 px) y cada breakpoint sube. Los
 * prefijos son los del proyecto (`tablet:` `laptop:` `desktop:`); los de
 * Tailwind (`sm:` `md:` `lg:`) están BORRADOS en `globals.css` a propósito.
 */
export const PADDING_LATERAL =
  "px-[var(--e-2-5)] tablet:px-[var(--e-3)] laptop:px-[var(--gutter)] desktop:px-[var(--gutter-l)]";

/**
 * Padding vertical — §05: «padding 48/40/56».
 *
 * En móvil el aire de arriba es cero: la portada va **a sangre** y tiene que
 * pegarse a la barra superior (§12). Desde tablet, los 48 px del artboard.
 */
export const PADDING_VERTICAL = "pb-[var(--e-7)] tablet:pt-[var(--e-6)]";

/**
 * La rejilla de la ficha, breakpoint a breakpoint (DESIGN-SPEC §3, fila «Ficha»):
 *
 * | desktop ≥1440 | portada 380 px + contenido `1fr`, gap 56 |
 * | laptop 1024–1439 | portada 320 px, gap 40 |
 * | tablet 768–1023 | una columna, portada 280 px centrada |
 * | móvil 390–767 | portada a sangre 300 px, contenido debajo |
 *
 * Los 380 y 320 son medidas literales del diseño, no espaciados: no existen
 * como token y no deben —`--e-*` es la rejilla de 8, no un catálogo de anchos
 * de columna—. Se escriben aquí, en un sitio, con la fila de la spec al lado.
 */
export const REJILLA_FICHA = [
  "grid grid-cols-1 gap-[var(--e-3)]",
  "tablet:gap-[var(--e-5)]",
  "laptop:grid-cols-[320px_1fr] laptop:gap-[var(--e-5)]",
  "desktop:grid-cols-[380px_1fr] desktop:gap-[var(--e-7)]",
].join(" ");

/**
 * La columna de la portada.
 *
 * En tablet la ficha es de una sola columna con la portada **centrada a 280 px**;
 * desde laptop la rejilla ya le da el ancho y esta restricción se retira.
 */
export const COLUMNA_PORTADA = "tablet:mx-auto tablet:w-[280px] laptop:mx-0 laptop:w-auto";

/** Etiqueta de sección: Inter 11/600 UPPERCASE, tracking .18em, `--gold-300`. */
export const ETIQUETA_SECCION = [
  "font-ui text-etiqueta font-[var(--fw-ui-bold)] uppercase",
  "tracking-etiqueta text-[var(--gold-300)]",
].join(" ");

/**
 * El título de la ficha — DESIGN-SPEC §2: Cormorant 64/300, tracking +.02em.
 *
 * 64 px es la medida de desktop. En 390 px de ancho, «Chotto dake Ai ga Omoi
 * Dark Elf ga Isekai kara Oikaketekita» a 64 px ocupa media pantalla de alto,
 * así que baja por la escala display sin salirse de ella y sin bajar nunca de
 * 26, que es el suelo de Cormorant.
 */
export const TITULO_FICHA = [
  "font-display font-[var(--fw-display-light)] leading-titulo tracking-display",
  "text-[var(--porcelain-050)]",
  "text-titulo-l tablet:text-display-s laptop:text-display-m desktop:text-display-l",
].join(" ");
