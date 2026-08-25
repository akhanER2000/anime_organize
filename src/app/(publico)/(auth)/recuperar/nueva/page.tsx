import { Card } from "@/components/ui/card";
import { Enlace } from "@/components/ui/enlace";

import { FormularioNuevaPassword } from "./formulario";

import type { Metadata } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELEGIR CONTRASEÑA NUEVA — el destino del enlace del correo.
 *
 * ── ESTA RUTA DEVOLVÍA 404 ─────────────────────────────────────────────────
 * `plantillaReset()` genera desde hace tiempo un enlace a
 * `/recuperar/nueva?token=…`. Todo el flujo estaba construido y verificado
 * —token de 32 bytes, solo el hash en la base, un solo uso garantizado por un
 * `UPDATE` atómico, caducidad, revocación de todas las sesiones— y terminaba en
 * una página inexistente. Lo destapó un agente pidiendo esa URL contra el
 * servidor arrancado.
 *
 * El artboard 07 no dibuja esta pantalla: es la continuación de la card de
 * «Recuperar acceso», así que hereda su estructura —mismo marco, misma card,
 * mismo ancho— y no inventa nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const metadata: Metadata = {
  title: "Elegir contraseña nueva",
  description: "Escribe la contraseña nueva de tu vault.",
  // Lleva un token en la URL. Ni indexar ni seguir, y `Referrer-Policy` ya
  // impide que el token viaje a un tercero si la página enlazara fuera.
  robots: { index: false, follow: false, nocache: true },
};

const ANCHO_CARD = "max-w-[var(--ancho-card-auth)]";

export default async function PaginaNuevaPassword({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const bruto = params.token;
  // Un `?token=a&token=b` llega como array. Se queda en cadena vacía, que la
  // acción rechaza igual que un token inventado: mismo mensaje para los tres.
  const token = typeof bruto === "string" ? bruto : "";

  return (
    <Card acento className={`w-full ${ANCHO_CARD} p-[var(--e-4)]`}>
      <header className="flex flex-col gap-[var(--e-05)]">
        <h1 className="font-display text-titulo-l font-[var(--fw-display-light)] tracking-display text-[var(--porcelain-050)]">
          Contraseña nueva
        </h1>
        <p className="font-ui text-ui-s text-[var(--ash-400)]">
          Elige una y entra. Cerraremos el resto de sesiones.
        </p>
      </header>

      <div className="mt-[var(--e-3)]">
        {/* El token viaja como prop y NO se pinta en ningún sitio visible: va en
         * un input oculto. Enseñarlo no aporta nada y lo deja en capturas de
         * pantalla y en el historial de copiar y pegar. */}
        <FormularioNuevaPassword token={token} />
      </div>

      <footer className="mt-[var(--e-3)] text-center font-ui text-ui-s text-[var(--porcelain-200)]">
        <Enlace href="/login">← Volver a iniciar sesión</Enlace>
      </footer>
    </Card>
  );
}
