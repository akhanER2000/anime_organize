import { cn } from "@/lib/ui/cn";

import type { TipoGenero } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHIPS DE GÉNERO — DESIGN-SPEC §05 y `anime-vault-domain` §6.
 *
 * ── LOS DOS TIPOS SE PINTAN DISTINTO A PROPÓSITO ──────────────────────────
 * «Nunca se mezclan con las etiquetas de IA: son dos `kind` distintos y se
 * pintan distinto (oficial → borde sólido `--gold-borde`, texto `--gold-300`;
 * IA → borde **punteado**, texto `--gold-500`, prefijo `✦`)».
 *
 * No es decoración: un género oficial viene de AniList y una etiqueta de IA la
 * propuso un modelo con una confianza. Que se distingan de un vistazo es lo que
 * permite al dueño del vault fiarse de unos y revisar los otros. Y no se
 * distinguen **solo** por color —eso sería un fallo de accesibilidad—: el borde
 * punteado y el prefijo `✦` lo dicen sin depender de la vista, y el
 * `<span class="sr-only">` lo dice para quien no ve ninguno de los dos.
 *
 * `USUARIO` es el tercer `kind` del dominio (`genre.kind`). Todavía no hay
 * pantalla que cree géneros propios, así que se pinta como el oficial —es un
 * dato que el usuario ha confirmado— y sin `✦`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type GeneroDeFicha = {
  id: string;
  nombre: string;
  kind: TipoGenero;
};

const BASE = cn(
  "inline-flex items-center gap-[var(--e-05)] rounded-chip border",
  "h-[var(--e-4)] px-[var(--e-1-5)] font-ui text-ui-s",
);

/**
 * Nada de `--gold-400` como texto de etiqueta: DESIGN-SPEC §2 lo prohíbe
 * («satura»). Oficial va en `--gold-300`; la etiqueta de IA en `--gold-500`,
 * que es lo que pide §05 para distinguirla sin gritar.
 */
const POR_TIPO: Readonly<Record<TipoGenero, string>> = {
  OFICIAL: "border-[var(--gold-borde)] text-[var(--gold-300)]",
  USUARIO: "border-[var(--gold-borde)] text-[var(--gold-300)]",
  IA: "border-dashed border-[var(--gold-700)] text-[var(--gold-500)]",
};

export function ChipGenero({ genero }: { genero: GeneroDeFicha }) {
  const esDeIa = genero.kind === "IA";

  return (
    <li className={cn(BASE, POR_TIPO[genero.kind])}>
      {esDeIa && <span aria-hidden="true">✦</span>}
      {genero.nombre}
      {/* El origen no se comunica solo con un borde punteado y un símbolo. */}
      {esDeIa && <span className="sr-only"> (etiqueta propuesta por IA)</span>}
    </li>
  );
}
