import { redirect } from "next/navigation";

import { ErrorSesionInvalida, exigirSesionParaLeer } from "@/auth";
import { Pestanas } from "@/components/ui/pestanas";
import { ETIQUETA_SECCION, TITULAR_PANTALLA } from "@/lib/ui/clases";

import { sitiosDe } from "@/lib/db/sitios";

import { FormularioPassword } from "./formulario-password";
import { Importar } from "./importar";
import { Sitios } from "./sitios";
import { ZonaPeligro } from "./zona-peligro";

import type { Metadata } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AJUSTES — artboards 09 a 12.
 *
 * ── LO QUE HAY HOY, Y LO QUE NO ───────────────────────────────────────────
 *
 * Está la pestaña **Perfil** con el cambio de contraseña, que es lo que el
 * dueño necesita para dejar de depender del enlace de recuperación.
 *
 * Está la pestaña **Sitios** (lote B2): los trece sitios de la semilla más
 * los propios, con sus espejos y el botón de comprobarlos.
 *
 * **Importar** es el lote C y todavía no existe. No se pinta como una pestaña
 * vacía ni con botones apagados: se dice qué falta y cuándo llega. Una pestaña
 * que se abre y no hace nada es peor que una pestaña que no está — la primera
 * parece rota, la segunda parece pendiente.
 *
 * ── `force-dynamic` ───────────────────────────────────────────────────────
 *
 * Depende de la sesión, así que no se cachea (`api-conventions.md` § Caché:
 * «nunca se cachea una página con datos de un usuario concreto»).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ajustes",
  robots: { index: false, follow: false },
};

export default async function PaginaAjustes() {
  let sesion;
  try {
    sesion = await exigirSesionParaLeer();
  } catch (error) {
    if (error instanceof ErrorSesionInvalida) redirect("/login");
    throw error;
  }

  const sitios = await sitiosDe(sesion.ctx).listar();

  return (
    <div className="px-[var(--e-2-5)] py-[var(--e-6)] tablet:px-[var(--gutter-s)] laptop:px-[var(--gutter)] desktop:px-[var(--gutter-l)]">
      <header className="flex flex-col gap-[var(--e-1)]">
        <h1 className={TITULAR_PANTALLA}>Ajustes</h1>
        <p className="font-mono text-mono text-[var(--ash-400)]">{sesion.email}</p>
      </header>

      <div className="mt-[var(--e-4)] max-w-[720px]">
        <Pestanas
          etiqueta="Ajustes de la cuenta"
          pestanas={[
            {
              id: "perfil",
              etiqueta: "Perfil",
              contenido: (
                <section className="flex flex-col gap-[var(--e-3)]">
                  <h2 className={ETIQUETA_SECCION}>Contraseña</h2>
                  <FormularioPassword />
                </section>
              ),
            },
            {
              id: "importar",
              etiqueta: "Importar",
              contenido: <Importar />,
            },
            {
              id: "sitios",
              etiqueta: "Sitios",
              contenido: <Sitios sitios={sitios} />,
            },
            {
              id: "peligro",
              etiqueta: "Peligro",
              tono: "peligro",
              contenido: <ZonaPeligro email={sesion.email} />,
            },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * Lo que todavía no está, dicho sin fingir.
 *
 * Sin botones apagados ni campos que no guardan: `testing.md` y el encargo
 * coinciden en que un control inerte es peor que su ausencia, porque el
 * primero parece roto y el segundo parece pendiente.
 */
// El componente que anunciaba una pestaña «todavía no construida» vivía
// aquí. Ya no queda ninguna: Sitios (lote B2) e Importar (lote C2) están
// hechas, así que se va. Sin código muerto — para eso está git.
