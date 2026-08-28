import { cn } from "@/lib/ui/cn";
import { ERROR_DE_CAMPO } from "@/lib/ui/clases";

import type { Fallo } from "@/lib/api/respuesta";

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN FALLO DEL SERVIDOR, CON SU MOTIVO CONCRETO.
 *
 * ── «REVISA LOS CAMPOS MARCADOS» SIN MARCAR NINGUNO ───────────────────────
 *
 * `falloDeValidacion` compone ese mensaje y mete el motivo de verdad —«La
 * dirección tiene que empezar por http:// o https://»— en `detalles`. Quien
 * pintaba solo `error.mensaje` dejaba al usuario con una orden que no puede
 * cumplir: no hay ningún campo marcado, y nada dice qué está mal.
 *
 * Se vio en el recorrido de los enlaces, pegando un `javascript:`: el servidor
 * lo rechazaba correctamente y la pantalla no explicaba nada.
 *
 * Esto no sustituye a marcar el campo —cuando el formulario sabe a cuál
 * corresponde, `Campo` recibe su `error` y lo pinta debajo—; es para el aviso
 * de arriba, que es lo único que hay cuando el fallo no es de un campo
 * concreto o el formulario no los tiene mapeados.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function MensajeDeFallo({ fallo, className }: { fallo: Fallo; className?: string }) {
  const motivos = fallo.detalles ?? [];
  // `exactOptionalPropertyTypes`: pasar `className={undefined}` NO es lo mismo
  // que no pasar la prop, y `MensajeError` la declara opcional sin `undefined`.
  const extra = className === undefined ? {} : { className };

  // Con un solo motivo se enseña ÉL y no el genérico: «revisa los campos» y
  // debajo un único «tiene que empezar por http://» es decir dos veces lo mismo,
  // y la primera vez peor.
  if (motivos.length === 1 && motivos[0] !== undefined) {
    return <MensajeError {...extra}>{motivos[0].motivo}</MensajeError>;
  }

  if (motivos.length === 0) {
    return <MensajeError {...extra}>{fallo.mensaje}</MensajeError>;
  }

  return (
    <MensajeError {...extra}>
      <span>
        {fallo.mensaje}
        <span className="mt-[var(--e-05)] block">
          {motivos.map((motivo) => (
            <span key={`${motivo.campo}-${motivo.motivo}`} className="block">
              · {motivo.motivo}
            </span>
          ))}
        </span>
      </span>
    </MensajeError>
  );
}
