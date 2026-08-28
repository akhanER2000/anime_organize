import { AccionAnadirConModal } from "@/components/anime/accion-anadir-con-modal";
import { BarraSuperior } from "@/components/layout/barra-superior";

import type { ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MARCO DEL VAULT — común a la biblioteca, la lista, la ficha y los ajustes.
 *
 * ── ESTO NO ES DE NINGUNA PANTALLA ────────────────────────────────────────
 * La barra superior la comparten los artboards 03, 04, 05, 08, 09 y 10. Vive
 * aquí para que ninguna se acuerde de pintarla —y, sobre todo, para que ninguna
 * la pinte ligeramente distinta—. Las pantallas que cuelgan de `/app` **no la
 * tocan**: si una cree que necesita cambiarla, para y lo pregunta.
 *
 * ── EL MIDDLEWARE NO ES LA PROTECCIÓN ─────────────────────────────────────
 * `/app/*` está en el matcher del middleware, que redirige a `/login` si no hay
 * cookie válida. Pero eso es ENRUTADO: corre en Edge y no puede consultar
 * Postgres, así que no sabe si la cuenta sigue existiendo ni si las sesiones
 * fueron revocadas (`security.md` §1 bis).
 *
 * La comprobación de verdad la hace cada pantalla al pedir sus datos, con
 * `exigirSesionParaLeer()`, que sí corre en Node y sí consulta. Este layout no
 * la duplica: duplicarla daría una falsa sensación de red.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function LayoutVault({ children }: { children: ReactNode }) {
  return (
    <div className="fondo-laja fondo-ruido min-h-screen">
      {/* El botón y su modal viven juntos en un componente de cliente: el
       * estado «abierto» es lo único que necesita el navegador, y este layout
       * tiene que seguir siendo de servidor. */}
      <BarraSuperior accion={<AccionAnadirConModal />} />
      <main className="mx-auto max-w-[var(--contenedor-max)]">{children}</main>
    </div>
  );
}
