import { Marca } from "@/components/ui/marca";
import { PANTALLA_SUELTA } from "@/lib/ui/clases";
import { Pantalla404 } from "@/components/layout/pantalla-404";

import type { Metadata } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL 404 GLOBAL — artboard 11, celda «404», con su texto.
 *
 * ── POR QUÉ HACÍA FALTA UNO EN LA RAÍZ ──────────────────────────────────
 *
 * Sólo existía el de la ficha. Cualquier otra dirección inventada
 * —`/bibloteca`, un enlace viejo, una ruta que se renombró— caía en el 404 por
 * defecto de Next: fondo blanco, tipografía del sistema y un «This page could
 * not be found» en inglés. En una aplicación que se sirve entera en obsidiana y
 * español, eso se lee como una avería del servidor, no como una dirección
 * equivocada.
 *
 * ── LLEVA SU PROPIA MARCA ───────────────────────────────────────────────
 *
 * Este fichero se pinta con el layout RAÍZ, no con el de `/app`, así que aquí
 * **no hay barra superior**: quien llega desde fuera no tiene sesión. Sin una
 * marca, la pantalla no dice ni en qué sitio está.
 *
 * ── EL DESTINO ES `/`, NO `/app` ────────────────────────────────────────
 *
 * A diferencia del 404 de la ficha —donde quien lo ve ya está dentro—, aquí
 * puede llegar cualquiera. Mandar a `/app` sin sesión rebota al login, y eso
 * convierte «te equivocaste de dirección» en «inicia sesión», que es una
 * respuesta a otra pregunta.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const metadata: Metadata = {
  title: "Aquí no hay nada",
  robots: { index: false, follow: false },
};

export default function NoEncontrado() {
  return (
    <main className={PANTALLA_SUELTA}>
      <div className="py-[var(--e-4)]">
        <Marca />
      </div>

      <Pantalla404 titular="Esta losa no existe" destino="/" etiquetaDestino="Volver al principio">
        La grieta llevaba a otro sitio. Puede que la serie ya no esté en tu vault, o que el enlace
        se rompiera por el camino.
      </Pantalla404>
    </main>
  );
}
