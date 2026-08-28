import { Boton } from "@/components/ui/boton";
import { PARRAFO_DE_ESTADO } from "@/lib/ui/clases";
import { cn } from "@/lib/ui/cn";

import type { ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA PANTALLA DE «AQUÍ NO HAY NADA» — artboard 11, celda «404».
 *
 * «Número 96 px Cormorant, veta SVG rota al fondo, botón de borde dorado.»
 *
 * ── POR QUÉ ES UN COMPONENTE Y NO DOS PANTALLAS ─────────────────────────
 *
 * Porque hay al menos dos 404 en la aplicación —el de una ficha que no existe
 * y el de una ruta que no existe— y **el aspecto es el mismo**. Escribirlo dos
 * veces es la receta documentada de este proyecto para que dentro de tres meses
 * uno tenga la veta y el otro no.
 *
 * Lo que cambia entre los dos es **el texto**, y cambia por un motivo de fondo:
 * el de la ficha no puede decir «no existe» ni «no es tuyo», porque los dos
 * casos llegan aquí a propósito (`security.md` §1) y distinguirlos en el texto
 * sería la misma fuga escrita en español. Por eso el texto es un parámetro y no
 * una constante.
 *
 * ── TIENE QUE SER USABLE, NO SOLO CORRECTA ──────────────────────────────
 *
 * Una pantalla de error sin salida deja al usuario con el botón de atrás como
 * única herramienta. Ésta lleva siempre una acción explícita —un `<a>` de
 * verdad, no un `router.push`, para que funcione con el JavaScript caído—.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function Pantalla404({
  titular,
  children,
  destino = "/app",
  etiquetaDestino = "Volver a la biblioteca",
  className,
}: {
  readonly titular: string;
  readonly children: ReactNode;
  readonly destino?: string;
  readonly etiquetaDestino?: string;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "relative min-h-[60vh] overflow-hidden py-[var(--e-10)] text-center",
        className,
      )}
    >
      {/* La veta rota del fondo: la losa partida que no se ha reparado. Dos
       * trazos —1 px de línea y 5 px de halo al 9 %— que es la tercera forma
       * permitida de la veta kintsugi (DESIGN-SPEC §1). `aria-hidden` porque no
       * comunica nada: si lo hiciera, tendría que ser texto.
       *
       * Sin `z-index` negativo: las capas de textura del layout viven en
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
          {titular}
        </h1>

        <p className={PARRAFO_DE_ESTADO}>{children}</p>

        <div className="mt-[var(--e-4)]">
          <Boton href={destino} variante="primario">
            {etiquetaDestino}
          </Boton>
        </div>
      </div>
    </div>
  );
}
