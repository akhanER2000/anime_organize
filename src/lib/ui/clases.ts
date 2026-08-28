/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS RECETAS DE CLASES QUE LA SPEC DECLARA NORMATIVAS.
 *
 * ── QUÉ ENTRA AQUÍ Y QUÉ NO ───────────────────────────────────────────────
 *
 * **No** todo lo que se repite. Un `flex items-center gap-2` que aparece en
 * doce sitios es coincidencia, no un concepto, y meterlo aquí solo añadiría una
 * indirección que hay que ir a leer.
 *
 * Entra lo que cumple las dos condiciones:
 *
 *   1. **DESIGN-SPEC lo declara**, con esas palabras y ese valor — así que
 *      escribirlo distinto es incumplir el diseño, no tener otro gusto; y
 *   2. **aparece en más de un fichero**, así que puede divergir.
 *
 * ── EL QUE YA HABÍA DIVERGIDO ─────────────────────────────────────────────
 *
 * El mensaje de error de un campo estaba escrito **seis veces**, y no eran
 * iguales: `login` y `recuperar` llevaban `leading-ui`; `registro`,
 * `recuperar/nueva`, `campo.tsx` y `zona-arrastre.tsx`, no. El mismo mensaje con
 * dos interlineados, en formularios que la gente ve seguidos.
 *
 * Y había una séptima copia peor: `accion-continuar.tsx` lo escribía en
 * `font-ui text-ui-s` cuando DESIGN-SPEC §6 dice «mensaje **mono**». Ésa no
 * divergía en un detalle: era otro tipo de letra.
 *
 * ── POR QUÉ CONSTANTES Y NO COMPONENTES ───────────────────────────────────
 *
 * Porque el elemento cambia según dónde: el error de un campo es un `<p>` con
 * `role="alert"` en unos sitios y un `<span>` dentro de un `<label>` en otros, y
 * el anillo de foco se aplica a botones, enlaces, chips e inputs. Un componente
 * obligaría a envolver; una constante se compone con `cn()` y no impone forma.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { cn } from "./cn";

/**
 * EL ANILLO DE FOCO — DESIGN-SPEC §7, y es una regla de accesibilidad:
 * «Foco siempre visible: anillo de 2 px `--gold-400` con 2 px de offset, nunca
 * `outline:none` sin sustituto.»
 *
 * Estaba en seis ficheros. Que coincidieran era suerte: es la clase de detalle
 * que alguien ajusta en el componente que está tocando.
 */
export const FOCO_DORADO = cn(
  "focus-visible:outline-2 focus-visible:outline-offset-2",
  "focus-visible:outline-[var(--gold-400)]",
);

/**
 * El anillo suave, para lo que ya tiene borde propio: el input cambia su borde
 * a `--gold-400` y el anillo va en `--gold-foco` para no doblar el trazo.
 * DESIGN-SPEC §6, fila «Input / textarea».
 */
export const FOCO_DORADO_SUAVE = cn(
  "focus-visible:border-[var(--gold-400)] focus-visible:outline-2",
  "focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-foco)]",
);

/**
 * EL MENSAJE DE ERROR DE UN CAMPO — DESIGN-SPEC §6: «mensaje mono
 * `--estado-abandonado-texto`».
 *
 * `leading-ui` va incluido: era la divergencia, y el interlineado por defecto de
 * un mono a 12 px deja las dos líneas demasiado juntas cuando el mensaje no cabe
 * en una.
 */
export const ERROR_DE_CAMPO = cn(
  "flex items-start gap-[var(--e-05)]",
  "font-mono text-mono leading-ui text-[var(--estado-abandonado-texto)]",
);

/**
 * LA TRANSICIÓN DEL SISTEMA — `design-tokens.md`: el movimiento es de opacidad
 * y de color, `--dur-base` con `--ease-base`.
 *
 * Once ficheros. No hay divergencia todavía y por eso mismo conviene fijarla:
 * la primera vez que alguien escriba `duration-200` a mano, se notará.
 */
export const TRANSICION = "transition-colors duration-[var(--dur-base)] ease-base";

/** La corta, para lo que responde bajo el dedo: casillas, chips, filas. */
export const TRANSICION_RAPIDA = "transition-colors duration-[var(--dur-rapida)] ease-base";

/**
 * LA ETIQUETA UPPERCASE — `design-tokens.md`: «Etiquetas UPPERCASE siempre en
 * `--gold-300`, nunca en `--gold-400` (satura)».
 *
 * El color NO va incluido: la cabecera de una tabla la usa en `--ash-400`, que
 * es otra cosa. Lo normativo es la tipografía y el tracking.
 */
export const ETIQUETA_UPPERCASE = cn(
  "font-ui text-etiqueta font-[var(--fw-ui-bold)] uppercase tracking-etiqueta",
);

/**
 * EL TITULAR DE UNA PANTALLA — Cormorant 34 px, ligero, con su tracking.
 * DESIGN-SPEC §2. Tres ficheros lo escribían entero.
 */
export const TITULAR_PANTALLA = cn(
  "font-display text-titulo-l font-[var(--fw-display-light)]",
  "leading-titulo tracking-display text-[var(--porcelain-050)]",
);

/**
 * LA CAJA DE UN CONTROL DE TEXTO — DESIGN-SPEC §6, fila «Input / textarea»:
 * fondo `--slate-800`, borde `--slate-600`, altura táctil.
 *
 * El hover ACLARA la superficie y no el borde. `--slate-500` no existe en el
 * sistema y en la rampa de obsidiana el número BAJA al aclarar, así que
 * `hover:border-[var(--slate-700)]` —que es lo que había— oscurecía el campo al
 * pasar el ratón: la señal de «deshabilitado», justo lo contrario de lo que la
 * spec quiere decir. Contado entero en `campo.tsx`.
 */
export const CAJA_DE_CONTROL = cn(
  "w-full rounded-input border bg-[var(--slate-800)]",
  "h-[var(--tactil-min)] px-[var(--e-2)]",
  "font-ui text-ui text-[var(--porcelain-100)]",
  "border-[var(--slate-600)]",
  TRANSICION,
  "hover:bg-[var(--slate-700)]",
  FOCO_DORADO_SUAVE,
  // lint-tokens-ok: `--ash-inactivo` es exactamente el token de deshabilitado
  "disabled:cursor-not-allowed disabled:bg-[var(--slate-900)] disabled:text-[var(--ash-inactivo)]",
);

/**
 * EL MARCO DORADO DE SECCIÓN — DESIGN-SPEC §1: «24 px en desktop y laptop,
 * 16 px en tablet, se retira en móvil».
 *
 * Estaba escrito **tres veces**: en las medidas de la landing, en las de la
 * ficha y a pelo dentro de `(auth)/layout.tsx`. Las tres iguales hoy, y las tres
 * con el mismo comentario copiado explicando por qué se retira en móvil — señal
 * de que el razonamiento viajó con el copiar-pegar en vez de quedarse en un
 * sitio.
 *
 * El «se retira en móvil» no es estética: un marco de 24 px por lado en una
 * pantalla de 390 se come 48 px y aprieta la tarjeta contra sí misma.
 */
export const MARCO_DORADO = cn(
  "pointer-events-none absolute border border-[var(--gold-700)]",
  "hidden tablet:block",
  "inset-[var(--e-2)] laptop:inset-[var(--marco-offset)]",
);

/**
 * LA ETIQUETA DE SECCIÓN — `ETIQUETA_UPPERCASE` en `--gold-300`.
 *
 * `design-tokens.md`: «Etiquetas UPPERCASE siempre en `--gold-300`, nunca en
 * `--gold-400` (satura)». Escrita dos veces, en las medidas de la landing y en
 * las de la ficha.
 */
export const ETIQUETA_SECCION = cn(ETIQUETA_UPPERCASE, "text-[var(--gold-300)]");
