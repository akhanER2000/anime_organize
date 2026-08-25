import { ETIQUETA_ESTADO, type Estado } from "@/lib/domain/enums";
import { cn } from "@/lib/ui/cn";

/**
 * BADGE DE ESTADO — DESIGN-SPEC §6, fila «Badge de estado».
 *
 * ── LA REGLA DE ACCESIBILIDAD QUE ESTE COMPONENTE HACE CUMPLIR ─────────────
 * **El estado NUNCA se comunica solo por color.** Cada badge lleva su etiqueta
 * de texto, y no hay forma de pedir uno sin ella: la etiqueta sale de
 * `ETIQUETA_ESTADO`, no de una prop que se pueda omitir.
 *
 * ── LOS COLORES DE TEXTO NO SON LOS DE PUNTO ──────────────────────────────
 * `--estado-viendo` y `--estado-abandonado` son para puntos, barras y bordes.
 * Como TEXTO se usan sus variantes `-texto`, que son las únicas que pasan 4.5:1.
 * Aquí está resuelto de una vez, para que ninguna pantalla tenga que acordarse.
 */

/** Color del punto y del borde, por estado. */
const PUNTO: Record<Estado, string> = {
  VISTO: "bg-[var(--estado-visto)]",
  VIENDO: "bg-[var(--estado-viendo)]",
  EN_ESPERA: "bg-[var(--estado-espera)]",
  ABANDONADO: "bg-[var(--estado-abandonado)]",
  PENDIENTE: "bg-[var(--estado-pendiente)]",
};

/** Color del TEXTO. Distinto del punto en los dos semánticos. */
const TEXTO: Record<Estado, string> = {
  VISTO: "text-[var(--gold-200)] border-[var(--gold-borde)]",
  VIENDO: "text-[var(--estado-viendo-texto)] border-[var(--estado-viendo-borde)]",
  EN_ESPERA: "text-[var(--ash-400)] border-[var(--slate-600)]",
  ABANDONADO: "text-[var(--estado-abandonado-texto)] border-[var(--estado-abandonado-borde)]",
  PENDIENTE: "text-[var(--ash-400)] border-[var(--slate-600)]",
};

export type PropsBadgeEstado = {
  estado: Estado;
  /** Sin el punto de color, solo texto. Para contextos muy densos. */
  sinPunto?: boolean;
};

export function BadgeEstado({ estado, sinPunto = false }: PropsBadgeEstado) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[var(--e-05)] rounded-chip border",
        "px-[var(--e-1)] py-[2px]",
        "font-ui text-etiqueta-xs font-[var(--fw-ui-medium)] uppercase tracking-badge",
        "bg-[var(--slate-950)]/85",
        TEXTO[estado],
      )}
    >
      {!sinPunto && (
        <span className={cn("size-[5px] rounded-avatar", PUNTO[estado])} aria-hidden="true" />
      )}
      {/* El texto SIEMPRE está: el estado no se comunica solo por color. */}
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

export type PropsBadgeTipo = {
  /** GRATIS · PAGO · MIXTO, del hub de streaming. */
  children: string;
  destacado?: boolean;
};

/** Badge genérico de tipo. DESIGN-SPEC §6, «Badge GRATIS/PAGO». */
export function BadgeTipo({ children, destacado = false }: PropsBadgeTipo) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-chip border px-[var(--e-1)] py-[2px]",
        "font-ui text-etiqueta-xs font-[var(--fw-ui-medium)] uppercase tracking-badge",
        destacado
          ? "border-[var(--gold-borde)] text-[var(--gold-200)]"
          : "border-[var(--slate-600)] text-[var(--porcelain-200)]",
      )}
    >
      {children}
    </span>
  );
}
