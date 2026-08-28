import { Enlace } from "@/components/ui/enlace";
import { cn } from "@/lib/ui/cn";

import { Marca } from "./marca";
import { RUTA_LOGIN, RUTA_REGISTRO } from "./enlaces";
import { CONTENEDOR, ETIQUETA_SECCION, MARCO_DORADO, PADDING_LATERAL } from "./medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PIE — artboard 02, la última banda.
 *
 * «Marco dorado a 24 px, tres columnas de enlaces, gap 72» (DESIGN-SPEC §02).
 *
 * ── AQUÍ HABÍA NUEVE ENTRADAS Y AHORA HAY DOS ENLACES DE VERDAD ────────
 *
 * El artboard dibuja tres columnas —Producto, Recursos, Legal— con nueve
 * entradas. Se pintaron como texto plano porque **ninguno de esos nueve
 * destinos existe**: no hay `/guia`, ni `/estado`, ni `/privacidad`.
 *
 * Texto inerte no era la solución, era el problema aplazado. Nueve palabras
 * colocadas y espaciadas como enlaces son enlaces a los ojos de cualquiera: se
 * pulsan, no pasa nada, y la interfaz queda como algo a medio hacer.
 *
 * Así que se recortan en vez de construirse. `/privacidad` y `/términos` ni
 * siquiera tienen sentido en una aplicación personal de un solo usuario —no hay
 * a quién informar ni con quién contratar—, y «Guía» o «Estado» son producto
 * que no existe. El día que el vault se abra a más gente, se añaden entonces,
 * con su ruta detrás.
 *
 * Lo que queda son los dos únicos destinos reales que tiene hoy la aplicación,
 * y los dos son anclas de verdad. Un pie corto y vivo dice la verdad sobre el
 * tamaño de lo que hay; uno largo y muerto miente sobre ello.
 *
 * ── Y LAS ETIQUETAS NO REPITEN LAS DE ARRIBA ────────────────────────
 *
 * «Iniciar sesión» y «Registrarse», no «Entrar al vault» y «Crear cuenta», que
 * son las del hero. Dos enlaces con el mismo nombre accesible en la misma
 * página son ambiguos para quien navega por lista de enlaces con un lector de
 * pantalla —«Entrar al Vault, enlace» dos veces, sin forma de distinguirlos—.
 *
 * Lo cazaron cinco recorridos de `e2e/landing.spec.ts` a la vez, porque
 * `getByRole("link", { name: ... })` encontraba dos y se negaba a elegir. Un
 * selector por rol y nombre accesible falla exactamente donde falla una persona
 * que navega por nombres, que es la razón de usarlo en vez de un CSS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Solo destinos que existen. Si añades uno, la ruta va primero. */
const ENLACES = [
  { etiqueta: "Iniciar sesión", href: RUTA_LOGIN },
  { etiqueta: "Registrarse", href: RUTA_REGISTRO },
] as const;

export function Pie() {
  return (
    <footer className="relative pb-[var(--e-8)] pt-[var(--e-9)]">
      <div aria-hidden="true" className={MARCO_DORADO} />

      <div className={cn(CONTENEDOR, PADDING_LATERAL, "relative")}>
        <div className="flex flex-col justify-between gap-[var(--e-8)] py-[var(--e-4)] laptop:flex-row laptop:px-[var(--e-5)]">
          <div className="max-w-[280px]">
            <Marca tamanoIcono={18} />
            <p className="mt-[var(--e-2)] font-ui text-ui-s leading-cuerpo text-[var(--ash-400)]">
              Una vitrina para lo que ya viste. Hecho por una persona, para gente que anota
              episodios en libretas.
            </p>
          </div>

          <nav aria-label="Enlaces del pie" className="flex flex-col gap-[var(--e-1-5)]">
            <p className={ETIQUETA_SECCION}>Entrar</p>
            <ul className="flex flex-col gap-[var(--e-1-5)]">
              {ENLACES.map((enlace) => (
                <li key={enlace.href}>
                  {/* La primitiva, no una copia de sus clases. La versión que
                   * había aquí subrayaba con `--gold-700` —el dorado apagado del
                   * marco de sección— mientras el resto de la aplicación usa
                   * `--gold-borde`, así que los enlaces del pie se veían más
                   * muertos que cualquier otro enlace del sistema. */}
                  <Enlace href={enlace.href} className="text-ui-s">
                    {enlace.etiqueta}
                  </Enlace>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mt-[var(--e-3-5)] font-mono text-mono text-[var(--ash-400)] laptop:px-[var(--e-5)]">
          © 2026 Anime Vault · construido sobre laja negra
        </p>
      </div>
    </footer>
  );
}
