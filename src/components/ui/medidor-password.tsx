import { calcularFortaleza } from "@/lib/ui/fortaleza-password";
import { TRANSICION } from "@/lib/ui/clases";
import { cn } from "@/lib/ui/cn";

/**
 * MEDIDOR DE CONTRASEÑA — DESIGN-SPEC §07:
 * «cuatro segmentos de 2 px; llenos en `--gold-400`».
 *
 * ── SE ANUNCIA CON PALABRAS, NO CON ORO ────────────────────────────────────
 * Los cuatro segmentos son `aria-hidden`: para un lector de pantalla, cuatro
 * barritas doradas no significan nada. La información real viaja en el texto
 * («Aceptable»), dentro de un `role="status"` que se relee solo cuando cambia.
 * Es la misma regla que el badge de estado: **el color nunca comunica solo**.
 *
 * El nivel se calcula en `@/lib/ui/fortaleza-password`, que es puro y tiene sus
 * propios tests. Aquí no hay lógica: solo pintura.
 */

export type PropsMedidorPassword = {
  password: string;
  /** Id del elemento al que este medidor describe, para `aria-describedby`. */
  id?: string;
  className?: string;
};

const TOTAL_SEGMENTOS = 4;

export function MedidorPassword({ password, id, className }: PropsMedidorPassword) {
  const { nivel, etiqueta } = calcularFortaleza(password);

  return (
    <div id={id} className={cn("flex flex-col gap-[var(--e-05)]", className)}>
      <div className="flex gap-[var(--e-05)]" aria-hidden="true">
        {Array.from({ length: TOTAL_SEGMENTOS }, (_, i) => (
          <span
            key={i}
            className={cn(
              // 2 px exactos, radio de barra: DESIGN-SPEC §07.
              "h-[2px] flex-1 rounded-barra",
              TRANSICION,
              i < nivel ? "bg-[var(--gold-400)]" : "bg-[var(--slate-700)]",
            )}
          />
        ))}
      </div>

      {/* `role="status"` y no `alert`: informa sin interrumpir lo que el
       * usuario está tecleando. */}
      <p role="status" className="font-mono text-mono text-[var(--ash-400)]">
        {etiqueta}
      </p>
    </div>
  );
}
