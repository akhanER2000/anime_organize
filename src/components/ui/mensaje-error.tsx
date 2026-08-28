import { cn } from "@/lib/ui/cn";
import { ERROR_DE_CAMPO } from "@/lib/ui/clases";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MENSAJE DE ERROR — DESIGN-SPEC §6: «mensaje mono
 * `--estado-abandonado-texto`», con el ⚠ delante.
 *
 * ── ESTABA ESCRITO SEIS VECES, Y NO ERAN IGUALES ──────────────────────────
 *
 * | dónde | interlineado |
 * |---|---|
 * | `login/formulario.tsx` | `leading-ui` |
 * | `recuperar/formulario.tsx` | `leading-ui` |
 * | `recuperar/nueva/formulario.tsx` | el de por defecto |
 * | `registro/formulario.tsx` | el de por defecto |
 * | `ui/campo.tsx` | el de por defecto |
 * | `ui/zona-arrastre.tsx` | el de por defecto |
 *
 * Dos de las seis eran **la misma función copiada**, `AvisoDelFormulario`, con
 * su comentario incluido. El mismo mensaje con dos interlineados en pantallas
 * que la gente ve seguidas —login y recuperar— y que además enlazan entre sí.
 *
 * Gana `leading-ui`: un mono a 12 px con el interlineado por defecto deja las
 * dos líneas demasiado juntas, y el mensaje de error es justo el que se parte
 * en dos («Demasiados intentos. Vuelve a probar en 14 minutos.»).
 *
 * ── EL ⚠ VA `aria-hidden`, Y NO ES UN DETALLE ─────────────────────────────
 *
 * El lector de pantalla ya anuncia el `role="alert"`. Sin ocultarlo, lee
 * «signo de admiración dentro de un triángulo» antes de cada error, en todos
 * los formularios de la aplicación.
 *
 * ── `alert` Y NO `status` ─────────────────────────────────────────────────
 *
 * Un error interrumpe lo que la persona estaba haciendo y tiene que anunciarse
 * en cuanto aparece, sin esperar a que el foco llegue.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsMensajeError = {
  readonly children: React.ReactNode;
  /** Para que un campo lo referencie con `aria-describedby`. */
  readonly id?: string;
  readonly className?: string;
};

export function MensajeError({ children, id, className }: PropsMensajeError) {
  return (
    <p id={id} role="alert" className={cn(ERROR_DE_CAMPO, className)}>
      <span aria-hidden="true">⚠</span>
      {children}
    </p>
  );
}
