import { cn } from "@/lib/ui/cn";

import { CONTENEDOR, PADDING_LATERAL } from "./medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VISTAZO — artboard 02, la captura enmarcada.
 *
 * «Marco `--gold-700` de 1 px con 14 px de aire sobre `--void`»
 * (DESIGN-SPEC §02). Dentro va una maqueta de la biblioteca: huecos de portada
 * 2:3 vacíos —los rellenos van vacíos A PROPÓSITO, DESIGN-SPEC §5— con su
 * barra de progreso hairline.
 *
 * ── POR QUÉ CINCO COLUMNAS Y NO OCHO ──────────────────────────────────────
 * El PNG dibuja **ocho** huecos y su propio pie dice «5 columnas a tamaño
 * real». Se contradicen entre sí, y DESIGN-SPEC §3 —que es normativa— fija la
 * rejilla de portadas en **5 columnas en desktop, 4 en laptop, 3 en tablet y 2
 * en móvil**. Gana la regla: con cinco columnas el pie deja de mentir y cada
 * hueco mide ~230 px, que es «a tamaño real» de verdad (la referencia son 253).
 * Con ocho medirían 140 y el pie sería falso en las dos mitades.
 * Anotado en `SUPUESTOS.md`.
 *
 * Se pintan cinco huecos y se ocultan los sobrantes por breakpoint, para que la
 * fila esté siempre completa y no quede un hueco huérfano al final.
 *
 * Todo el interior es `aria-hidden`: es una ilustración de la aplicación, no la
 * aplicación. Lo que sí se anuncia es el `<figcaption>`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Los cinco primeros porcentajes del artboard, en orden. */
const HUECOS = [
  { progreso: 60, visible: "" },
  { progreso: 100, visible: "" },
  { progreso: 25, visible: "hidden tablet:block" },
  { progreso: 80, visible: "hidden laptop:block" },
  { progreso: 45, visible: "hidden desktop:block" },
] as const;

const CHIPS = [
  { etiqueta: "Viendo", activo: true },
  { etiqueta: "Visto", activo: false },
  { etiqueta: "En espera", activo: false },
] as const;

export function Vistazo() {
  return (
    <section className={cn(CONTENEDOR, PADDING_LATERAL, "pb-[var(--e-13)]")}>
      <figure className="m-0">
        {/* El marco dorado con su aire, sobre --void. */}
        <div className="border border-[var(--gold-700)] bg-[var(--void)] p-[var(--e-1-5)]">
          <div
            aria-hidden="true"
            className="rounded-input border border-[var(--slate-800)] bg-[var(--slate-950)] p-[var(--e-3)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-[var(--e-2)] border-b border-[var(--slate-800)] pb-[var(--e-2)]">
              {/* El artboard escribe la marca a 13 px; «Cormorant nunca por
               * debajo de 26» solo tiene UNA excepción declarada, el token del
               * logotipo (19 px). Se usa esa. Ver `SUPUESTOS.md`. */}
              <span className="font-display text-marca font-[var(--fw-display)] uppercase leading-[var(--lh-solido)] tracking-marca text-[var(--porcelain-200)]">
                Anime Vault
              </span>

              <div className="flex flex-wrap gap-[var(--e-1)]">
                {CHIPS.map((chip) => (
                  <span
                    key={chip.etiqueta}
                    className={cn(
                      "rounded-chip border px-[var(--e-1)] py-[var(--e-05)]",
                      "font-ui text-etiqueta",
                      chip.activo
                        ? "border-[var(--gold-borde)] text-[var(--gold-200)]"
                        : "border-[var(--slate-700)] text-[var(--ash-400)]",
                    )}
                  >
                    {chip.etiqueta}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-[var(--e-1-5)] pt-[var(--e-2-5)] tablet:grid-cols-3 laptop:grid-cols-4 desktop:grid-cols-5">
              {HUECOS.map((hueco, indice) => (
                <div key={hueco.progreso} className={hueco.visible}>
                  {/* Hueco de portada: 2:3 sin excepción, radio 4, borde
                   * `--slate-700`. Las superficies alternan igual que en el
                   * artboard. */}
                  <div
                    className={cn(
                      "aspect-[2/3] w-full rounded-input border border-[var(--slate-700)]",
                      indice % 2 === 0 ? "bg-[var(--slate-850)]" : "bg-[var(--slate-800)]",
                    )}
                  />
                  {/* Barra de progreso hairline: pista `--slate-700`, relleno
                   * `--gold-400` con `--halo-punto` (DESIGN-SPEC §6). */}
                  <div className="mt-[var(--e-1)] h-px w-full rounded-barra bg-[var(--slate-700)]">
                    <div
                      className="h-full rounded-barra bg-[var(--gold-400)]"
                      style={{
                        width: `${String(hueco.progreso)}%`,
                        boxShadow: "var(--halo-punto)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <figcaption className="mt-[var(--e-2)] text-center font-mono text-mono text-[var(--ash-400)]">
          Vista rejilla · 5 columnas a tamaño real
        </figcaption>
      </figure>
    </section>
  );
}
