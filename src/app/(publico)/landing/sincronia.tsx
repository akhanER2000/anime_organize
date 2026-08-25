import { cn } from "@/lib/ui/cn";

import { CONTENEDOR, ETIQUETA_SECCION, PADDING_LATERAL } from "./medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SINCRONÍA — artboard 02, la banda de dos columnas sobre `--slate-900`.
 *
 * «2 columnas, gap 96, fondo `--slate-900`, veta superior de 1 px»
 * (DESIGN-SPEC §02). Aquí la veta va de borde a borde, no inset: es la única
 * sección donde el artboard la dibuja así.
 *
 * La ilustración de la derecha —el móvil de kintsugi y la tarjeta de «último
 * cambio»— es un EJEMPLO. Lleva su `<figcaption>` diciéndolo, en vez de
 * ocultarla a los lectores de pantalla: el texto que se ve se lee.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const VENTAJAS = [
  "Exportación a .xlsx cuando quieras irte",
  "Detección de duplicados al añadir",
  "Historial de cambios por serie",
] as const;

/** El progreso de la tarjeta de ejemplo, tal cual lo dibuja el artboard. */
const PROGRESO_EJEMPLO = 79;

export function Sincronia() {
  return (
    <section className="relative bg-[var(--slate-900)]">
      {/* Divisor de sección, de borde a borde. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-0">
        <div className="veta-divisor" />
      </div>

      <div
        className={cn(
          CONTENEDOR,
          PADDING_LATERAL,
          "grid gap-[var(--e-10)] py-[var(--e-12)] laptop:grid-cols-2 laptop:items-center laptop:gap-[var(--e-12)]",
        )}
      >
        <div>
          <p className={ETIQUETA_SECCION}>Sincronía</p>

          <h2
            className={cn(
              "mt-[var(--e-3)] font-display font-[var(--fw-display-light)]",
              "tracking-display text-[var(--porcelain-050)]",
              "text-display-xs leading-titulo tablet:text-display-m tablet:leading-display",
            )}
          >
            Tu progreso,
            <br />
            siempre contigo
          </h2>

          <p className="mt-[var(--e-3)] max-w-[460px] font-ui text-cuerpo leading-cuerpo text-[var(--porcelain-200)]">
            Marca el episodio en el móvil mientras cenas y sigue en el portátil. El vault vive en tu
            cuenta, no en el navegador.
          </p>

          <ul className="mt-[var(--e-4)] flex flex-col gap-[var(--e-1-5)]">
            {VENTAJAS.map((ventaja) => (
              <li key={ventaja} className="flex items-center gap-[var(--e-1-5)]">
                <span
                  aria-hidden="true"
                  className="size-[var(--e-05)] shrink-0 bg-[var(--gold-400)]"
                />
                <span className="font-ui text-cuerpo-s leading-ui text-[var(--porcelain-200)]">
                  {ventaja}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="m-0 flex flex-wrap items-center justify-center gap-[var(--e-3)]">
          {/* Panel de arte explícito: la pieza kintsugi va enmarcada, como en el
           * hero. Fuera de estos paneles el sistema no permite las texturas. */}
          <div className="w-[212px] shrink-0 border border-[var(--gold-700)] bg-[var(--void)] p-[var(--e-1)]">
            <div
              role="img"
              aria-label="Ilustración: un cauce de piedra negra recorrido por vetas de oro"
              className="aspect-[9/19.5] w-full bg-[url('/texturas/kintsugi-rio.webp')] bg-cover bg-center"
            />
          </div>

          <div className="w-[260px] shrink-0 border border-[var(--slate-700)] bg-[var(--slate-950)] p-[var(--e-1)] shadow-losa">
            <div className="rounded-input bg-[var(--slate-850)] p-[var(--e-2)]">
              <p className="font-mono text-mono uppercase text-[var(--ash-400)]">Último cambio</p>

              {/* 22 px en el artboard; «Cormorant nunca por debajo de 26 px» es
               * regla dura, así que sube a `text-titulo-xs`. Ver `SUPUESTOS.md`. */}
              <p className="mt-[var(--e-1-5)] font-display text-titulo-xs font-[var(--fw-display)] leading-titulo text-[var(--porcelain-050)]">
                Vinland Saga
              </p>

              <p className="mt-[var(--e-1)] font-mono text-mono text-[var(--gold-400)]">
                EP 18 → EP 19
              </p>

              <div className="mt-[var(--e-1-5)] h-px w-full rounded-barra bg-[var(--slate-700)]">
                <div
                  className="h-full rounded-barra bg-[var(--gold-400)]"
                  style={{
                    width: `${String(PROGRESO_EJEMPLO)}%`,
                    boxShadow: "var(--halo-punto)",
                  }}
                />
              </div>

              <p className="mt-[var(--e-1)] font-mono text-mono text-[var(--ash-400)]">
                hace 4 minutos · móvil
              </p>
            </div>
          </div>

          <figcaption className="sr-only">
            Ejemplo de cómo se ve el último cambio registrado en un vault.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
