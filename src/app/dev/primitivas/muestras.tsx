"use client";

import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";

/**
 * Las piezas de la galería que necesitan estado.
 *
 * Se separan para que la página principal siga siendo un Server Component: el
 * `"use client"` va lo más abajo posible del árbol (`code-style.md`).
 */

export function MuestraModal() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Boton onClick={() => setAbierto(true)}>Abrir el modal</Boton>
      <Modal
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Añadir un anime"
        descripcion="760 px, borde superior dorado, foco atrapado dentro. Prueba Escape y el tabulador."
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton variante="solido" onClick={() => setAbierto(false)}>
              Añadir al vault
            </Boton>
          </>
        }
      >
        <p className="font-ui text-cuerpo-s leading-cuerpo text-[var(--porcelain-200)]">
          El foco está atrapado dentro de este diálogo: el tabulador no sale de aquí, Escape lo
          cierra y el resto de la página es inerte para un lector de pantalla. Todo eso lo da el
          elemento <code className="font-mono text-mono">&lt;dialog&gt;</code> nativo, sin
          reimplementarlo.
        </p>
      </Modal>
    </>
  );
}

export function MuestraToasts() {
  const [visibles, setVisibles] = useState<string[]>(["exito", "error", "progreso"]);
  const ocultar = (t: string) => setVisibles((v) => v.filter((x) => x !== t));

  return (
    <div className="flex flex-col gap-[var(--e-1-5)]">
      {visibles.includes("exito") && (
        <Toast
          tipo="exito"
          mensaje="Anime eliminado del vault."
          accion={{ etiqueta: "Deshacer", alPulsar: () => ocultar("exito") }}
          duracionMs={null}
          alCerrar={() => ocultar("exito")}
        />
      )}
      {visibles.includes("error") && (
        <Toast
          tipo="error"
          mensaje="No hemos podido descargar la portada desde esa dirección."
          accion={{ etiqueta: "Reintentar", alPulsar: () => ocultar("error") }}
          duracionMs={null}
          alCerrar={() => ocultar("error")}
        />
      )}
      {visibles.includes("progreso") && (
        <Toast tipo="progreso" mensaje="Enriqueciendo 34 de 83…" duracionMs={null} />
      )}
      {visibles.length < 3 && (
        <Boton
          variante="fantasma"
          tamano="s"
          onClick={() => setVisibles(["exito", "error", "progreso"])}
        >
          Restaurar los tres
        </Boton>
      )}
    </div>
  );
}

export function MuestraCargando() {
  const [cargando, setCargando] = useState(false);

  return (
    <Boton
      cargando={cargando}
      onClick={() => {
        setCargando(true);
        setTimeout(() => setCargando(false), 2500);
      }}
    >
      Pulsa para ver el spinner
    </Boton>
  );
}
