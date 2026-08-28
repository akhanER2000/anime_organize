"use client";

import { useEffect, useState } from "react";

import { Boton } from "./boton";
import { Campo } from "./campo";
import { Modal } from "./modal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIÁLOGO DE CONFIRMACIÓN — DESIGN-SPEC §6, fila «Modal / hoja», variante
 * «confirmar», y §5 (pestaña Peligro de Ajustes).
 *
 * ── NO ES UN MODAL CON DOS BOTONES ────────────────────────────────────────
 *
 * Lo que lo distingue es la **fricción proporcional al daño**. `security.md` §3
 * lo fija para el borrado de cuenta: re-autenticación, y confirmación
 * **escribiendo el email exacto**. Un «¿Seguro?» con un botón rojo no es una
 * confirmación: es un paso que la gente aprende a pulsar sin leer, y a la
 * décima vez lo pulsa sobre lo que no quería.
 *
 * Por eso `textoExigido` no es decorativo. Cuando está, el botón de confirmar
 * **no se habilita** hasta que lo escrito coincide exactamente. Es la diferencia
 * entre «reconoce que hay un aviso» y «ha leído QUÉ va a borrar».
 *
 * ── EL BOTÓN PELIGROSO NO ES EL PREDETERMINADO ────────────────────────────
 *
 * Cancelar va primero en el DOM y es el que recibe el foco al abrir. Escape
 * cancela —lo da `<dialog>` gratis— y `Enter` sobre el foco inicial también.
 * Los tres caminos accidentales llevan a «no hacer nada», que es lo reversible.
 *
 * ── LA PROMESA SE ESPERA, Y MIENTRAS TANTO NO SE PUEDE PULSAR DOS VECES ───
 *
 * `alConfirmar` puede ser asíncrono. Mientras corre, los dos botones quedan
 * bloqueados y el de confirmar muestra su spinner: DESIGN-SPEC §6, «pie con
 * spinner y botones bloqueados». Sin eso, un doble clic manda dos borrados —y
 * el segundo llega cuando el primero ya cambió el estado del mundo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsDialogoConfirmacion = {
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  readonly titulo: string;
  /** Qué va a pasar exactamente. Sin eufemismos: «Se borrarán 83 series». */
  readonly descripcion: string;
  /**
   * Texto que hay que escribir para habilitar el botón. Para lo irreversible.
   * Ver `security.md` §3: el borrado de cuenta exige el email exacto.
   */
  readonly textoExigido?: string;
  /** Etiqueta del campo cuando hay `textoExigido`. */
  readonly etiquetaConfirmacion?: string;
  readonly etiquetaConfirmar?: string;
  readonly etiquetaCancelar?: string;
  /** `destructivo` pinta el botón en granate. Es el uso normal aquí. */
  readonly tono?: "destructivo" | "normal";
  readonly alConfirmar: () => void | Promise<void>;
};

export function DialogoConfirmacion({
  abierto,
  alCerrar,
  titulo,
  descripcion,
  textoExigido,
  etiquetaConfirmacion,
  etiquetaConfirmar = "Confirmar",
  etiquetaCancelar = "Cancelar",
  tono = "destructivo",
  alConfirmar,
}: PropsDialogoConfirmacion) {
  const [escrito, setEscrito] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  // Se limpia al ABRIR, no al cerrar: si se limpiara al cerrar, el campo se
  // vaciaría a la vista mientras el diálogo se desvanece. Y sin limpiar en
  // absoluto, reabrirlo dejaría el botón peligroso ya habilitado — que es
  // justo lo que esta primitiva existe para impedir.
  useEffect(() => {
    if (abierto) {
      setEscrito("");
      setTrabajando(false);
    }
  }, [abierto]);

  const exigeTexto = textoExigido !== undefined;
  const coincide = !exigeTexto || escrito === textoExigido;
  const puedeConfirmar = coincide && !trabajando;

  const confirmar = () => {
    if (!puedeConfirmar) return;

    setTrabajando(true);
    // `void` explícito: `alConfirmar` puede ser síncrona, y `Promise.resolve`
    // uniforma los dos casos sin obligar a quien la escribe a devolver nada.
    void Promise.resolve(alConfirmar()).finally(() => {
      setTrabajando(false);
    });
  };

  return (
    <Modal
      abierto={abierto}
      alCerrar={() => {
        // Cerrar en mitad de la operación dejaría la promesa corriendo sin
        // nadie mirando su resultado. Se ignora Escape mientras trabaja.
        if (!trabajando) alCerrar();
      }}
      titulo={titulo}
      descripcion={descripcion}
      ancho="estrecho"
      pie={
        <>
          {/* Cancelar PRIMERO en el DOM: es quien recibe el foco al abrir, y el
           * camino accidental tiene que llevar a lo reversible. */}
          <Boton variante="secundario" onClick={alCerrar} disabled={trabajando}>
            {etiquetaCancelar}
          </Boton>
          <Boton
            variante={tono === "destructivo" ? "destructivo" : "primario"}
            onClick={confirmar}
            disabled={!puedeConfirmar}
            cargando={trabajando}
          >
            {etiquetaConfirmar}
          </Boton>
        </>
      }
    >
      {exigeTexto ? (
        <Campo
          etiqueta={etiquetaConfirmacion ?? `Escribe «${textoExigido}» para confirmar`}
          value={escrito}
          onChange={(evento) => {
            setEscrito(evento.target.value);
          }}
          disabled={trabajando}
          // Los cuatro apagados a la vez: el autocompletado del navegador
          // rellenaría el texto exigido y anularía la fricción entera.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      ) : null}
    </Modal>
  );
}
