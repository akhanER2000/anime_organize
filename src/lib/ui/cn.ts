import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `cn()` — une clases y resuelve conflictos de Tailwind.
 *
 * `twMerge` importa: sin él, `cn("px-4", "px-6")` deja las dos y gana la que el
 * CSS ponga última, que es impredecible. Con él gana la última que se pasa, que
 * es lo que espera quien escribe el componente.
 *
 * ── POR QUÉ ESTÁ CONFIGURADO, Y NO ES UN DETALLE ──────────────────────────
 *
 * `twMerge` sin configurar **borraba en silencio la mitad del sistema visual**.
 * Lo encontró el verificador de fidelidad comparando el render con el artboard,
 * y es reproducible en tres líneas:
 *
 *     twMerge("text-etiqueta text-[var(--gold-300)]")  → "text-[var(--gold-300)]"
 *     twMerge("text-[var(--gold-300)]", "text-ui-s")   → "text-ui-s"
 *     twMerge("text-ui", "text-[var(--porcelain-100)]") → "text-[var(--porcelain-100)]"
 *
 * El motivo: `twMerge` no conoce la escala de este proyecto (`ui`, `ui-s`,
 * `etiqueta`, `cuerpo-s`, `titulo-l`…), y ante un `text-[var(--x)]` **no puede
 * saber si es un tamaño o un color**. Metía las dos cosas en el mismo grupo y
 * conservaba solo la última.
 *
 * Daño real medido en el artboard 07, antes de arreglarlo:
 *
 *   · las etiquetas CORREO / CONTRASEÑA / NOMBRE salían a 15 px en vez de 11
 *     (la palabra «CORREO» medía 76 px de ancho frente a los 56 del diseño);
 *   · todos los botones y el texto de los inputs, a 15 px en vez de 14;
 *   · y lo más visible: **«¿Olvidaste?», «Crear una» y «← Volver a iniciar
 *     sesión» no eran doradas**. El `text-[var(--gold-300)]` de la primitiva
 *     `Enlace` desaparecía en cuanto la pantalla pasaba un `text-ui-s`.
 *
 * Nada de esto rompía el build, ni el lint, ni un test. Simplemente el sistema
 * de diseño se aplicaba a medias, y en cada pantalla nueva se habría aplicado a
 * medias otra vez.
 *
 * ── EL ARREGLO ────────────────────────────────────────────────────────────
 *
 * Se declara el grupo `font-size` con **la escala real del proyecto**. A partir
 * de ahí `twMerge` sabe que `text-ui` es un tamaño, y como `text-[var(--x)]` ya
 * no encaja en ese grupo, lo trata como color. Los dos sobreviven, y los
 * conflictos DE VERDAD se siguen resolviendo:
 *
 *     text-ui + text-ui-s        → text-ui-s      (tamaño contra tamaño)
 *     text-gold-300 + text-gold-200 → text-gold-200 (color contra color)
 *     px-4 + px-6                → px-6           (lo de siempre, intacto)
 *
 * Está fijado en `cn.test.ts`, que se pone rojo si alguien quita esta config.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * La escala tipográfica, tal cual la declara `@theme` en `globals.css`.
 *
 * **Si añades un `--text-*` allí, añádelo aquí.** No se deriva automáticamente
 * porque `cn()` corre en el navegador y no puede leer el CSS; la alternativa
 * sería generarlo en build, y eso es más maquinaria de la que merece una lista
 * de 21 nombres que cambia dos veces al año. `cn.test.ts` compara esta lista
 * contra `globals.css` y falla si se desincronizan, así que el olvido se caza
 * igualmente.
 */
export const ESCALA_TIPOGRAFICA = [
  "hero",
  "display-xl",
  "display-l",
  "display-m",
  "display-s",
  "display-xs",
  "titulo-l",
  "titulo-m",
  "titulo-s",
  "titulo-xs",
  "marca",
  "cuerpo-l",
  "cuerpo",
  "cuerpo-s",
  "ui",
  "ui-s",
  "ui-xs",
  "etiqueta",
  "etiqueta-xs",
  "mono-l",
  "mono",
  "mono-s",
] as const;

const unir = extendTailwindMerge({
  override: {
    classGroups: {
      "font-size": [{ text: [...ESCALA_TIPOGRAFICA] }],
    },
  },
});

export function cn(...clases: ClassValue[]): string {
  return unir(clsx(clases));
}
