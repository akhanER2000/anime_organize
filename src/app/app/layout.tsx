import { AccionAnadirConModal } from "@/components/anime/accion-anadir-con-modal";
import { exigirSesionParaLeer } from "@/auth";
import { Buscador } from "@/components/anime/buscador";
import { AvatarDeCuenta, BarraSuperior } from "@/components/layout/barra-superior";

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
export default async function LayoutVault({ children }: { children: ReactNode }) {
  // ── EL LAYOUT LEE LA SESIÓN, Y NO ES DUPLICAR LA PROTECCIÓN ────────────
  //
  // Solo para pintar la inicial del avatar. La comprobación de acceso sigue
  // siendo la de cada pantalla al pedir SUS datos; si esto fallara, la
  // pantalla de dentro fallaría igual. Lo único que se evita es un avatar sin
  // letra mientras la página de debajo ya sabe quién eres.
  const sesion = await sesionDelMarco();
  return (
    <div className="fondo-laja fondo-ruido min-h-screen">
      {/* El botón y su modal viven juntos en un componente de cliente: el
       * estado «abierto» es lo único que necesita el navegador, y este layout
       * tiene que seguir siendo de servidor. */}
      <BarraSuperior
        buscador={<Buscador />}
        accion={
          <>
            <AccionAnadirConModal />
            {/* El avatar lleva a Ajustes. Sin él, esa pantalla existía y no
             * había forma de llegar: el problema simétrico del enlace muerto. */}
            <AvatarDeCuenta email={sesion.email} nombre={sesion.nombre} />
          </>
        }
      />
      <main className="mx-auto max-w-[var(--contenedor-max)]">{children}</main>
    </div>
  );
}

/**
 * La sesión para el marco, o `null`.
 *
 * No redirige: **redirigir es cosa de la pantalla**, que es quien sabe a dónde
 * volver después. Un layout que redirige convierte cualquier error de sesión en
 * un salto sin `callbackUrl`, y el usuario acaba en la biblioteca en vez de en
 * donde estaba.
 */
async function sesionDelMarco(): Promise<{ email: string; nombre: string | null }> {
  try {
    const sesion = await exigirSesionParaLeer();
    return { email: sesion.email, nombre: null };
  } catch {
    // Sin sesión el marco se pinta igual; la pantalla de dentro es la que
    // manda al login. El avatar cae a un email vacío, que no se pinta.
    return { email: "", nombre: null };
  }
}
