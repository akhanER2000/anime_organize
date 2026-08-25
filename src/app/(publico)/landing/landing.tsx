import { Caracteristicas } from "./caracteristicas";
import { Hero } from "./hero";
import { Pie } from "./pie";
import { Sincronia } from "./sincronia";
import { Vistazo } from "./vistazo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA LANDING — artboard 02, entera.
 *
 * Server Component de arriba abajo: aquí no hay estado, ni eventos, ni una sola
 * API del navegador. La única interacción son enlaces, y un enlace no necesita
 * JavaScript. Por eso no hay ni un `"use client"` en toda la pantalla
 * (`code-style.md` § «Server / Client Components»).
 *
 * ── EL FONDO GLOBAL, Y POR QUÉ HACE FALTA `isolate` ───────────────────────
 * DESIGN-SPEC §1 describe el fondo en tres capas: color plano `--slate-950`
 * (lo pone `body`), polígonos de laja al 5,5 % y ruido monocromo al 3,2 %.
 * Las dos últimas las pintan `.fondo-laja::before` y `.fondo-ruido::after`
 * (`styles/componentes.css`) como pseudo-elementos `position:fixed` con
 * `z-index` NEGATIVO.
 *
 * Un z-index negativo se pinta en el paso 2 del contexto de apilamiento que lo
 * contiene, y el fondo de los bloques en flujo —incluido el de `body`, que es
 * `--slate-950` opaco— en el paso 3. Sin un contexto de apilamiento propio, esos
 * pseudo-elementos caen en el del elemento raíz y **quedan tapados por el fondo
 * del `body`**: la textura se paga y no se ve.
 *
 * `isolate` (`isolation: isolate`) crea aquí ese contexto. Dentro de él las dos
 * capas se pintan por encima del fondo del `body` y por debajo de las secciones.
 * Por eso las secciones que en el artboard son `--slate-950` NO declaran fondo:
 * dejan ver el fondo global, que es justo lo que la spec pide. La única con
 * fondo propio es «Sincronía» (`--slate-900`), como en el artboard, y el hero,
 * que lleva su propia laja fotográfica.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function Landing() {
  return (
    <div className="fondo-laja fondo-ruido isolate min-h-screen">
      <Hero />
      <main>
        <Caracteristicas />
        <Vistazo />
        <Sincronia />
      </main>
      <Pie />
    </div>
  );
}
