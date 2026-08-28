import { redirect } from "next/navigation";

import { ErrorSesionInvalida, exigirSesionParaLeer } from "@/auth";
import { Pestanas } from "@/components/ui/pestanas";
import { ETIQUETA_SECCION, NOTA_SECUNDARIA, TITULAR_PANTALLA } from "@/lib/ui/clases";
import { cn } from "@/lib/ui/cn";

import { FormularioPassword } from "./formulario-password";

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
 * **Importar**, **Sitios** y **Peligro** son los lotes C y D del encargo y
 * todavía no existen. No se pintan como pestañas vacías ni con botones
 * apagados: se dice qué falta y cuándo llega. Una pestaña que se abre y no
 * hace nada es peor que una pestaña que no está — la primera parece rota, la
 * segunda parece pendiente.
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
              contenido: <Pendiente que="La importación de .xlsx y .csv" lote="C" />,
            },
            {
              id: "sitios",
              etiqueta: "Sitios",
              contenido: <Pendiente que="El hub de sitios y sus espejos" lote="B" />,
            },
            {
              id: "peligro",
              etiqueta: "Peligro",
              tono: "peligro",
              contenido: <Pendiente que="El borrado de la cuenta con su export" lote="D" />,
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
function Pendiente({ que, lote }: { que: string; lote: string }) {
  return (
    <p
      className={cn(
        "rounded-card border border-dashed border-[var(--slate-600)]",
        "px-[var(--e-2-5)] py-[var(--e-3)]",
        "font-ui text-cuerpo-s leading-cuerpo text-[var(--porcelain-200)]",
      )}
    >
      {que} todavía no está construida.
      <span className={NOTA_SECUNDARIA}>
        Llega en el lote {lote}. Esta pestaña no tiene controles porque ninguno funcionaría todavía.
      </span>
    </p>
  );
}
