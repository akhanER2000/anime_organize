"use client";

import { useState } from "react";

import { Campo } from "@/components/ui/campo";
import { Casilla } from "@/components/ui/casilla";
import { MedidorPassword } from "@/components/ui/medidor-password";

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

/**
 * CASILLA — las facetas del panel de filtros (DESIGN-SPEC §08).
 * Se muestran los cinco estados que existen, incluido el indeterminado, que es
 * el que siempre se olvida al implementar «seleccionar todo».
 */
export function MuestraCasillas() {
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({
    visto: true,
    viendo: false,
  });

  const alternar = (clave: string) =>
    setMarcadas((previo) => ({ ...previo, [clave]: previo[clave] !== true }));

  const algunas = Object.values(marcadas).some(Boolean);
  const todas = Object.values(marcadas).every(Boolean);

  return (
    <div className="flex max-w-[320px] flex-col">
      <Casilla
        etiqueta="Todos los estados"
        checked={todas}
        indeterminado={algunas && !todas}
        onChange={() => setMarcadas({ visto: !todas, viendo: !todas })}
      />
      <Casilla
        etiqueta="Visto"
        recuento={69}
        checked={marcadas.visto === true}
        onChange={() => alternar("visto")}
      />
      <Casilla
        etiqueta="Viendo"
        recuento={10}
        checked={marcadas.viendo === true}
        onChange={() => alternar("viendo")}
      />
      <Casilla etiqueta="Abandonado" recuento={0} />
      <Casilla etiqueta="En espera (deshabilitada)" recuento={4} disabled />
    </div>
  );
}

/**
 * MEDIDOR DE CONTRASEÑA — DESIGN-SPEC §07. Escribe para verlo moverse;
 * prueba `1234567890123456` para comprobar que la longitud no compra nivel.
 */
export function MuestraMedidorPassword() {
  const [valor, setValor] = useState("");

  return (
    <div className="flex max-w-[380px] flex-col gap-[var(--e-1)]">
      <Campo
        etiqueta="Contraseña"
        type="password"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        ayuda="Mínimo 12 caracteres. Una frase larga es mejor que un críptico corto."
      />
      <MedidorPassword password={valor} />
    </div>
  );
}
