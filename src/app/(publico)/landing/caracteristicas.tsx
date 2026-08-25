import { cn } from "@/lib/ui/cn";

import { AIRE_DE_ANCLA, CONTENEDOR, PADDING_LATERAL } from "./medidas";

import type { ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CARACTERÍSTICAS — artboard 02, la banda de tres columnas.
 *
 * «3 columnas, gap 64, padding 104/80/96. Iconos hairline de 34 px,
 * `stroke-width:1`, `--gold-400`» (DESIGN-SPEC §02).
 *
 * La veta superior es el **divisor de sección**, una de las tres formas
 * permitidas de la veta kintsugi. Va inset por el padding lateral, como la
 * dibuja el artboard (`left:80px; right:80px`), no de borde a borde.
 *
 * Los títulos son `<h2>`: la pantalla tiene un solo `<h1>` —el del hero— y
 * saltar de ahí a `<h3>` deja un hueco que un lector de pantalla anuncia como
 * un nivel perdido. El tamaño (26 px, `text-titulo-xs`) es el del artboard y no
 * depende del nivel.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Caracteristica = {
  readonly id?: string;
  readonly titulo: string;
  readonly texto: string;
  readonly icono: ReactNode;
};

/** Iconos hairline de 34 px. El color entra por `currentColor` desde el `<li>`. */
const PROPS_ICONO = {
  width: 34,
  height: 34,
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1,
  "aria-hidden": true,
} as const;

/**
 * ── LAS TRES DESCRIBÍAN FUNCIONES QUE NO EXISTEN ──────────────────────────
 *
 * Decían «importa desde AniList o un .xlsx», «con sus espejos V1, V2 y V3» y
 * «la IA sugiere las etiquetas que faltan». La importación no está construida,
 * `streaming_mirror` tiene cero filas y no hay interfaz para gestionarlos, y el
 * enriquecimiento es fase 4.
 *
 * En una landing eso se lee como una promesa, no como un dato — pero es la
 * misma regla: la interfaz no miente. Quien entre el primer día y busque el
 * botón de importar no lo va a encontrar.
 *
 * Ahora las tres dicen algo que la aplicación HACE hoy: la rejilla con estado y
 * progreso, el enlace de continuar viendo, y la deduplicación que mantiene
 * separados los tres Higurashi del vault real.
 *
 * Cuando esas funciones existan, el texto anterior está en el historial de git
 * y vuelve tal cual. Lo que no puede es ir por delante de lo construido.
 */
const CARACTERISTICAS: readonly Caracteristica[] = [
  {
    titulo: "Un solo catálogo",
    texto:
      "Toda tu biblioteca en una pantalla, con su portada, su estado y por dónde vas en cada serie.",
    icono: (
      <svg {...PROPS_ICONO}>
        <rect x="3" y="5" width="26" height="22" />
        <path d="M3 11 h26" />
        <path d="M11 11 v16" />
        <path d="M15 16 h10 M15 20 h7" />
      </svg>
    ),
  },
  {
    // Ya no lleva `id: "sitios"`: la entrada de navegación que apuntaba aquí se
    // ha quitado, porque esta tarjeta habla de retomar un episodio y no de
    // sitios de streaming —de los que además hay cero sembrados—.
    titulo: "Retomar sin buscar",
    texto: "Guarda el enlace exacto del episodio en el que te quedaste y ábrelo de un clic.",
    icono: (
      <svg {...PROPS_ICONO}>
        <circle cx="16" cy="16" r="12" />
        <path d="M16 8 v8 l6 4" />
        <path d="M4 16 h4 M24 16 h4" opacity=".5" />
      </svg>
    ),
  },
  {
    titulo: "Los títulos parecidos no se mezclan",
    texto:
      "Tres Higurashi son tres fichas. El catálogo avisa de lo que se parece y decides tú, no él.",
    icono: (
      <svg {...PROPS_ICONO}>
        <path d="M16 3 L20 12 L29 13 L22 19 L24 28 L16 23 L8 28 L10 19 L3 13 L12 12 Z" />
      </svg>
    ),
  },
];

export function Caracteristicas() {
  return (
    <section
      id="caracteristicas"
      aria-label="Características"
      className={cn("relative", AIRE_DE_ANCLA)}
    >
      {/* Divisor de sección, inset por el padding lateral como en el artboard. */}
      <div
        aria-hidden="true"
        className={cn(CONTENEDOR, PADDING_LATERAL, "absolute inset-x-0 top-0")}
      >
        <div className="veta-divisor" />
      </div>

      <div
        className={cn(
          CONTENEDOR,
          PADDING_LATERAL,
          "pb-[var(--e-12)] pt-[var(--e-10)] laptop:pt-[var(--e-13)]",
        )}
      >
        <ul className="grid gap-[var(--e-6)] tablet:grid-cols-3 laptop:gap-[var(--e-8)]">
          {CARACTERISTICAS.map((caracteristica) => (
            <li
              key={caracteristica.titulo}
              id={caracteristica.id}
              className={cn("text-[var(--gold-400)]", AIRE_DE_ANCLA)}
            >
              {caracteristica.icono}

              <h2 className="mt-[var(--e-3)] font-display text-titulo-xs font-[var(--fw-display)] leading-titulo tracking-display text-[var(--porcelain-050)]">
                {caracteristica.titulo}
              </h2>

              <p className="mt-[var(--e-1-5)] font-ui text-cuerpo-s leading-cuerpo text-[var(--ash-400)]">
                {caracteristica.texto}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
