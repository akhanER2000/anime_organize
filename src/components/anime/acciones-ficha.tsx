"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  borrarAnime,
  editarAnime,
  guardarProgreso,
  progresoRapido,
  type AccionRapida,
} from "@/app/app/acciones";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Casilla } from "@/components/ui/casilla";
import { DialogoConfirmacion } from "@/components/ui/dialogo-confirmacion";
import { MensajeError } from "@/components/ui/mensaje-error";
import { Modal } from "@/components/ui/modal";
import { ProgresoEditable } from "@/components/ui/progreso-editable";
import { Selector } from "@/components/ui/selector";
import { Toast } from "@/components/ui/toast";
import { ESTADOS, ETIQUETA_ESTADO } from "@/lib/domain/enums";

import type { Estado } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS ACCIONES DE LA FICHA — editar, borrar y mover el progreso.
 *
 * ── EL «DESHACER» ESPERA ANTES DE BORRAR, NO DESPUÉS ──────────────────────
 *
 * El encargo pide «confirmación y deshacer de 10 segundos». Hay dos formas y
 * fallan de manera muy distinta:
 *
 *   · borrar ya y recrear al deshacer → si la pestaña se cierra dentro de esos
 *     10 s, la instantánea se va con ella y **los datos se pierden**; y el
 *     anime volvería con otro `id`, así que su ficha quedaría enlazada a nada;
 *   · esperar los 10 s y borrar al final → si la pestaña se cierra, el borrado
 *     no llega a ocurrir.
 *
 * Se elige la segunda. El peor caso es «lo que querías borrar sigue ahí», que
 * se arregla volviéndolo a borrar; el peor caso de la primera es perder datos.
 *
 * **Consecuencia asumida, y el aviso la dice con esas palabras: si cierras esta
 * pestaña antes de que acabe la cuenta atrás, no se borra.** Una interfaz que
 * se callara eso estaría mintiendo por omisión.
 *
 * Y el `beforeunload` NO se usa para forzar el borrado al cerrar: un `fetch`
 * disparado ahí no está garantizado, así que a veces borraría y a veces no —
 * que es peor que no borrar nunca, porque no se puede explicar.
 *
 * ── EL PROGRESO ES OPTIMISTA Y SE REVIERTE ────────────────────────────────
 *
 * Skill §4: «se pinta el cambio y se revierte si el servidor falla». La
 * etiqueta local se pinta al instante y el valor de verdad llega del servidor,
 * que es quien sabe sumar sobre el progreso guardado — «+1 episodio» calculado
 * en el cliente daría dos resultados distintos con dos pestañas abiertas.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SEGUNDOS_PARA_DESHACER = 10;

export type PropsAccionesFicha = {
  readonly animeId: string;
  readonly titulo: string;
  readonly estado: Estado;
  readonly esFavorito: boolean;
  readonly notas: string | null;
  readonly porcentaje: number | null;
  readonly etiquetaProgreso: string;
};

export function AccionesFicha(props: PropsAccionesFicha) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState({
    porcentaje: props.porcentaje,
    etiqueta: props.etiquetaProgreso,
  });
  const [, iniciar] = useTransition();

  // El borrado pendiente: se guarda el temporizador para poder cancelarlo.
  const [borradoPendiente, setBorradoPendiente] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Si el componente se desmonta —navegación interna— el borrado no se
    // ejecuta. Es coherente con la decisión de arriba: el peor caso es que siga
    // ahí, nunca que se pierda.
    return () => {
      if (temporizador.current !== null) clearTimeout(temporizador.current);
    };
  }, []);

  const pedirBorrado = () => {
    setConfirmando(false);
    setBorradoPendiente(true);

    temporizador.current = setTimeout(() => {
      void borrarAnime(props.animeId).then((respuesta) => {
        setBorradoPendiente(false);
        if (!respuesta.ok) {
          setError(respuesta.error.mensaje);
          return;
        }
        // A la biblioteca: la ficha que se estaba mirando ya no existe, y
        // dejarla en pantalla sería enseñar datos borrados.
        router.push("/app");
      });
    }, SEGUNDOS_PARA_DESHACER * 1000);
  };

  const deshacerBorrado = () => {
    if (temporizador.current !== null) clearTimeout(temporizador.current);
    temporizador.current = null;
    setBorradoPendiente(false);
  };

  const rapido = (accion: AccionRapida) => {
    iniciar(async () => {
      const respuesta = await progresoRapido(props.animeId, accion);
      if (!respuesta.ok) {
        setError(respuesta.error.mensaje);
        return;
      }
      // La etiqueta viene del SERVIDOR, que es quien sumó sobre el progreso
      // guardado. Componerla aquí sería adivinar.
      setProgreso((previo) => ({ ...previo, etiqueta: respuesta.data.etiqueta }));
      router.refresh();
    });
  };

  const moverPorcentaje = (nuevo: number) => {
    const anterior = progreso;
    // Optimista: se pinta ya.
    setProgreso({ porcentaje: nuevo, etiqueta: `${String(nuevo)} %` });

    iniciar(async () => {
      const respuesta = await guardarProgreso({
        animeId: props.animeId,
        etiqueta: null,
        porcentaje: nuevo,
      });

      if (!respuesta.ok) {
        // Y se revierte. Sin esto, la barra se quedaría enseñando un valor que
        // la base no tiene, y el usuario no se enteraría hasta recargar.
        setProgreso(anterior);
        setError(respuesta.error.mensaje);
        return;
      }

      setProgreso({ porcentaje: nuevo, etiqueta: respuesta.data.etiqueta });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-[var(--e-3)]">
      {error !== null && <MensajeError>{error}</MensajeError>}

      <ProgresoEditable
        porcentaje={progreso.porcentaje}
        etiqueta={progreso.etiqueta}
        abandonado={props.estado === "ABANDONADO"}
        disabled={borradoPendiente}
        onCambiar={moverPorcentaje}
        onEpisodioMas={() => {
          rapido("EPISODIO_MAS");
        }}
        onTemporadaCompleta={() => {
          rapido("TEMPORADA_COMPLETA");
        }}
        onTodoVisto={() => {
          rapido("TODO_VISTO");
        }}
      />

      <div className="flex flex-wrap gap-[var(--e-1-5)]">
        <Boton
          variante="secundario"
          onClick={() => {
            setEditando(true);
          }}
          disabled={borradoPendiente}
        >
          Editar
        </Boton>

        <Boton
          variante="destructivo"
          onClick={() => {
            setConfirmando(true);
          }}
          disabled={borradoPendiente}
        >
          Borrar
        </Boton>
      </div>

      <ModalEditar
        // El spread delante: `abierto` y `alCerrar` los manda ESTE componente,
        // que es quien tiene el estado. Detrás, `props` podía dejar el modal
        // abierto o secuestrar el cierre.
        {...props}
        abierto={editando}
        alCerrar={() => {
          setEditando(false);
        }}
      />

      <DialogoConfirmacion
        abierto={confirmando}
        alCerrar={() => {
          setConfirmando(false);
        }}
        titulo={`¿Borrar «${props.titulo}»?`}
        descripcion={`Se borrarán también su portada, su progreso y sus enlaces. Tendrás ${String(SEGUNDOS_PARA_DESHACER)} segundos para deshacerlo.`}
        etiquetaConfirmar="Borrar"
        alConfirmar={pedirBorrado}
      />

      {borradoPendiente && (
        <Toast
          tipo="error"
          mensaje={`Se borrará «${props.titulo}». Si cierras esta pestaña antes, no se borra.`}
          duracionMs={null}
          accion={{ etiqueta: "Deshacer", alPulsar: deshacerBorrado }}
        />
      )}
    </div>
  );
}

/** El modal de edición: los mismos campos del alta, ya rellenos. */
function ModalEditar({
  abierto,
  alCerrar,
  animeId,
  titulo: tituloInicial,
  estado: estadoInicial,
  esFavorito: favoritoInicial,
  notas: notasIniciales,
}: PropsAccionesFicha & { readonly abierto: boolean; readonly alCerrar: () => void }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(tituloInicial);
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [esFavorito, setEsFavorito] = useState(favoritoInicial);
  const [notas, setNotas] = useState(notasIniciales ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  // Al ABRIR se recarga desde las props: si otra pestaña cambió el anime, el
  // formulario tiene que enseñar lo que hay ahora, no lo que había al montar.
  useEffect(() => {
    if (!abierto) return;
    setTitulo(tituloInicial);
    setEstado(estadoInicial);
    setEsFavorito(favoritoInicial);
    setNotas(notasIniciales ?? "");
    setError(null);
  }, [abierto, tituloInicial, estadoInicial, favoritoInicial, notasIniciales]);

  const guardar = () => {
    iniciar(async () => {
      const respuesta = await editarAnime({
        animeId,
        titulo,
        estado,
        esFavorito,
        notas: notas.trim() === "" ? null : notas,
      });

      if (!respuesta.ok) {
        setError(respuesta.error.mensaje);
        return;
      }

      alCerrar();
      router.refresh();
    });
  };

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Editar"
      ancho="estrecho"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            variante="solido"
            onClick={guardar}
            disabled={titulo.trim() === "" || guardando}
            cargando={guardando}
          >
            Guardar
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-[var(--e-3)]">
        {error !== null && <MensajeError>{error}</MensajeError>}

        <Campo
          etiqueta="Título"
          value={titulo}
          onChange={(evento) => {
            setTitulo(evento.target.value);
          }}
        />

        <Selector
          etiqueta="Estado"
          opciones={ESTADOS.map((uno) => ({ valor: uno, etiqueta: ETIQUETA_ESTADO[uno] }))}
          value={estado}
          onChange={(evento) => {
            const elegido = ESTADOS.find((uno): uno is Estado => uno === evento.target.value);
            if (elegido !== undefined) setEstado(elegido);
          }}
        />

        <AreaTexto
          etiqueta="Notas"
          value={notas}
          onChange={(evento) => {
            setNotas(evento.target.value);
          }}
          rows={4}
        />

        <Casilla
          etiqueta="Favorito"
          checked={esFavorito}
          onChange={(evento) => {
            setEsFavorito(evento.target.checked);
          }}
        />
      </div>
    </Modal>
  );
}
