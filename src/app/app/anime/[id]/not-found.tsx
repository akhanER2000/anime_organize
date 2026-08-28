import { Boton } from "@/components/ui/boton";
import { cn } from "@/lib/ui/cn";

import { PADDING_LATERAL } from "./medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 404 DE LA FICHA — artboard 11, celda «404».
 *
 * «Número 96 px Cormorant, veta SVG rota al fondo, botón de borde dorado.»
 *
 * Lo pinta Next cuando `page.tsx` llama a `notFound()`, y la respuesta lleva
 * **status 404 de verdad**. Se llega aquí por dos caminos que son
 * INDISTINGUIBLES a propósito (`security.md` §1):
 *
 *   · el anime no existe;
 *   · el anime existe y es **de otra persona**.
 *
 * Un 403 —o un texto distinto para cada caso, que es la misma fuga escrita en
 * español— confirmaría la existencia del recurso, y con eso se enumera el vault
 * ajeno un uuid cada vez. Por eso el texto no dice «no es tuyo» ni «no existe»:
 * dice que aquí no hay nada, que es lo único cierto en los dos casos.
 *
 * ── TIENE QUE SER USABLE, NO SOLO CORRECTA ───────────────────────────────
 * Una pantalla de error sin salida deja al usuario con el botón de atrás como
 * única herramienta. Esta lleva la vuelta a la biblioteca como acción explícita
 * —un `<a>` de verdad, no un `router.push`— y la barra superior del layout
 * sigue ahí con su enlace al vault.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function FichaNoEncontrada() {
  return (
    <div
      className={cn(
        PADDING_LATERAL,
        "relative min-h-[60vh] overflow-hidden",
        "py-[var(--e-10)] text-center",
      )}
    >
      {/* La veta rota del fondo: la losa partida que no se ha reparado. Dos
       * trazos —1 px de línea y 5 px de halo al 9 %— que es la tercera forma
       * permitida de la veta kintsugi (DESIGN-SPEC §1). `aria-hidden` porque no
       * comunica nada: si lo hiciera, tendría que ser texto. */}
      {/* Sin `z-index` negativo: las capas de textura del layout viven en
       * `z-index: -2` y una veta en `-10` quedaría por detrás de ellas. Aquí
       * los dos elementos son posicionados con `z-index: auto`, así que el
       * orden de pintado es el del DOM: el SVG primero, el contenido encima. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
        viewBox="0 0 600 320"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <path d="M40 250 L190 180 L268 214" stroke="var(--gold-400)" strokeWidth="1" opacity=".5" />
        <path
          d="M40 250 L190 180 L268 214"
          stroke="var(--gold-400)"
          strokeWidth="5"
          opacity=".09"
        />
        {/* El hueco entre los dos trazos ES la rotura: la veta no llega a unir
         * los dos lados. No es un despiste de coordenadas. */}
        <path d="M338 96 L410 140 L560 64" stroke="var(--gold-400)" strokeWidth="1" opacity=".5" />
        <path d="M338 96 L410 140 L560 64" stroke="var(--gold-400)" strokeWidth="5" opacity=".09" />
      </svg>

      <div className="relative flex flex-col items-center justify-center">
        {/* §11 pide 96 px; la escala display llega hasta `hero` (84) y
         * `design-tokens.md` prohíbe inventar valores fuera de ella. Se usa el
         * que cae al lado. Anotado en `SUPUESTOS.md`. */}
        <p
          aria-hidden="true"
          className="font-display text-display-m font-[var(--fw-display-light)] leading-[var(--lh-solido)] tracking-display text-[var(--gold-400)] tablet:text-hero"
        >
          404
        </p>

        <h1 className="mt-[var(--e-2)] font-display text-titulo-l font-[var(--fw-display-light)] leading-titulo tracking-display text-[var(--porcelain-050)] tablet:text-display-xs">
          Aquí no hay nada
        </h1>

        <p className="mt-[var(--e-1-5)] max-w-[46ch] font-ui text-cuerpo-s leading-cuerpo text-[var(--porcelain-200)]">
          Ese anime no está en tu vault. Puede que lo hayas borrado, que la dirección esté mal
          copiada, o que nunca haya existido.
        </p>

        <div className="mt-[var(--e-4)]">
          <Boton href="/app" variante="primario">
            Volver a la biblioteca
          </Boton>
        </div>
      </div>
    </div>
  );
}
