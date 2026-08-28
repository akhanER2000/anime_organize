"use client";

import { useState, useTransition } from "react";

import { crearAnime, type ResultadoAlta } from "@/app/app/acciones";
import { Boton } from "@/components/ui/boton";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Casilla } from "@/components/ui/casilla";
import { MensajeError } from "@/components/ui/mensaje-error";
import { Modal } from "@/components/ui/modal";
import { Selector } from "@/components/ui/selector";
import { ESTADOS, ETIQUETA_ESTADO } from "@/lib/domain/enums";
import { cn } from "@/lib/ui/cn";

import type { Estado } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODAL DE AÑADIR ANIME — artboard 06.
 *
 * ── EL AVISO DE PARECIDOS NO ES UN ERROR, Y SE PINTA COMO LO QUE ES ───────
 *
 * Skill de dominio §2c: la similitud **pregunta**. Con los datos reales del
 * dueño, `Higurashi no Naku Koro ni (2020)` se parece al de 2006 por encima del
 * umbral **y son dos series distintas que tiene a propósito**. Si esto se
 * pintara en granate con un ⚠, la respuesta natural sería «cancelar», y el
 * usuario perdería una serie de su vault por obedecer a un color.
 *
 * Por eso va en oro, con los dos caminos abiertos y el de «añadir igualmente»
 * como acción principal: la pregunta la contesta él, no el color.
 *
 * ── LA PREVISUALIZACIÓN NO SE GUARDA, Y NO ES LO MISMO QUE LA PORTADA ─────
 *
 * El `<img>` de la vista previa apunta a la URL que acaba de pegar, porque es
 * lo único que hay antes de enviar. Eso NO es la portada: al guardar, el
 * servidor descarga esa imagen una vez, la re-encodea con sharp y guarda los
 * bytes; el `<img>` de la card apuntará a `/api/covers/…`. Que aquí se vea la
 * de origen es correcto y temporal — y por eso lleva `referrerPolicy` para no
 * decirle a ese dominio desde dónde se está mirando.
 *
 * ── QUÉ NO TIENE ESTE MODAL TODAVÍA, DICHO EN VOZ ALTA ────────────────────
 *
 * El autocompletado desde AniList y el botón «✦ Completar con IA» son el LOTE C
 * del encargo. No hay un botón inerte esperándolos: cuando existan, se añaden.
 * Un control que no hace nada es peor que su ausencia.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Estadillo =
  | { readonly clase: "EDITANDO" }
  | {
      readonly clase: "PREGUNTA";
      readonly candidatos: readonly { readonly id: string; readonly titulo: string }[];
    }
  | { readonly clase: "ERROR"; readonly mensaje: string };

export type PropsModalAnadir = {
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  /** Se llama tras crear, con el aviso de la portada si lo hubo. */
  readonly alCrear?: (id: string, avisoPortada: string | null) => void;
};

export function ModalAnadir({ abierto, alCerrar, alCrear }: PropsModalAnadir) {
  const [titulo, setTitulo] = useState("");
  const [estado, setEstado] = useState<Estado>("PENDIENTE");
  const [urlPortada, setUrlPortada] = useState("");
  const [etiquetaProgreso, setEtiquetaProgreso] = useState("");
  const [notas, setNotas] = useState("");
  const [esFavorito, setEsFavorito] = useState(false);
  const [estadillo, setEstadillo] = useState<Estadillo>({ clase: "EDITANDO" });
  const [enviando, iniciar] = useTransition();

  const limpiar = () => {
    setTitulo("");
    setEstado("PENDIENTE");
    setUrlPortada("");
    setEtiquetaProgreso("");
    setNotas("");
    setEsFavorito(false);
    setEstadillo({ clase: "EDITANDO" });
  };

  const cerrar = () => {
    limpiar();
    alCerrar();
  };

  const enviar = (forzar: boolean) => {
    iniciar(async () => {
      const respuesta = await crearAnime(
        {
          titulo,
          estado,
          urlPortada: urlPortada.trim() === "" ? null : urlPortada,
          esFavorito,
          notas: notas.trim() === "" ? null : notas,
          etiquetaProgreso: etiquetaProgreso.trim() === "" ? null : etiquetaProgreso,
        },
        forzar,
      );

      if (!respuesta.ok) {
        setEstadillo({ clase: "ERROR", mensaje: respuesta.error.mensaje });
        return;
      }

      const resultado: ResultadoAlta = respuesta.data;

      if (resultado.clase === "PREGUNTA") {
        setEstadillo({ clase: "PREGUNTA", candidatos: resultado.candidatos });
        return;
      }

      alCrear?.(resultado.id, resultado.avisoPortada);
      cerrar();
    });
  };

  const urlValida = urlPortada.trim() !== "" && /^https?:\/\//i.test(urlPortada.trim());
  const preguntando = estadillo.clase === "PREGUNTA";

  return (
    <Modal
      abierto={abierto}
      alCerrar={cerrar}
      titulo="Añadir al vault"
      descripcion="El título es lo único obligatorio. Todo lo demás se puede rellenar después."
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar} disabled={enviando}>
            Cancelar
          </Boton>
          <Boton
            variante="solido"
            onClick={() => {
              // `forzar` solo cuando la pregunta ya se hizo: el botón cambia de
              // texto para que quede claro que la segunda pulsación NO es un
              // reintento de la primera.
              enviar(preguntando);
            }}
            disabled={titulo.trim() === "" || enviando}
            cargando={enviando}
          >
            {preguntando ? "Añadir igualmente" : "Añadir al vault"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-[var(--e-3)]">
        {estadillo.clase === "ERROR" && <MensajeError>{estadillo.mensaje}</MensajeError>}

        {preguntando && <AvisoParecidos candidatos={estadillo.candidatos} />}

        <Campo
          etiqueta="Título"
          value={titulo}
          onChange={(evento) => {
            setTitulo(evento.target.value);
            // Cambiar el título invalida la pregunta: los parecidos eran de OTRO
            // texto. Dejarla puesta haría que «añadir igualmente» saltara la
            // comprobación de un título que nadie ha comprobado.
            if (estadillo.clase !== "EDITANDO") setEstadillo({ clase: "EDITANDO" });
          }}
          autoFocus
          ayuda="Como lo tengas tú. No se reescribe."
        />

        <div className="grid gap-[var(--e-3)] tablet:grid-cols-2">
          <Selector
            etiqueta="Estado"
            opciones={ESTADOS.map((uno) => ({ valor: uno, etiqueta: ETIQUETA_ESTADO[uno] }))}
            value={estado}
            onChange={(evento) => {
              const elegido = ESTADOS.find((uno): uno is Estado => uno === evento.target.value);
              if (elegido !== undefined) setEstado(elegido);
            }}
          />

          <Campo
            etiqueta="Progreso"
            value={etiquetaProgreso}
            onChange={(evento) => {
              setEtiquetaProgreso(evento.target.value);
            }}
            placeholder="Solo 1ra temporada"
            ayuda="Escríbelo como quieras: es lo que se verá."
          />
        </div>

        <div className="flex flex-col gap-[var(--e-2)] tablet:flex-row tablet:items-start">
          <Campo
            etiqueta="Portada (dirección de la imagen)"
            value={urlPortada}
            onChange={(evento) => {
              setUrlPortada(evento.target.value);
            }}
            placeholder="https://…"
            inputMode="url"
            className="flex-1"
            ayuda="Se descarga y se guarda en tu vault. La dirección solo es el origen."
          />

          <VistaPrevia url={urlValida ? urlPortada.trim() : null} />
        </div>

        <AreaTexto
          etiqueta="Notas"
          value={notas}
          onChange={(evento) => {
            setNotas(evento.target.value);
          }}
          rows={3}
          ayuda="Opcional. Para ti."
        />

        <Casilla
          etiqueta="Marcar como favorito"
          checked={esFavorito}
          onChange={(evento) => {
            setEsFavorito(evento.target.checked);
          }}
        />
      </div>
    </Modal>
  );
}

/**
 * El aviso de parecidos: **oro, no granate**.
 *
 * DESIGN-SPEC §6 reserva el granate para los errores y la pestaña Peligro. Esto
 * no es un error: es una pregunta con dos respuestas igual de válidas, y la más
 * probable —«sí, son distintos, añádelo»— es la que un color de alarma
 * desaconsejaría.
 */
function AvisoParecidos({
  candidatos,
}: {
  readonly candidatos: readonly { readonly id: string; readonly titulo: string }[];
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-[var(--e-1)] rounded-card border-l-2 p-[var(--e-2)]",
        "border-l-[var(--gold-400)] bg-[var(--gold-wash)]",
      )}
    >
      <p className="font-ui text-ui font-[var(--fw-ui-medium)] text-[var(--gold-200)]">
        {candidatos.length === 1 ? "Puede que ya lo tengas" : "Puede que ya tengas alguno de estos"}
      </p>

      <ul className="flex flex-col gap-[var(--e-05)]">
        {candidatos.map((candidato) => (
          <li key={candidato.id}>
            <Boton href={`/app/anime/${candidato.id}`} variante="fantasma" tamano="s">
              {candidato.titulo}
            </Boton>
          </li>
        ))}
      </ul>

      <p className="font-ui text-ui-s text-[var(--porcelain-200)]">
        Si es otra serie —una segunda temporada, un remake, una película—, pulsa «Añadir
        igualmente». No se pierde nada por tener las dos.
      </p>
    </div>
  );
}

/** El hueco 2:3 con la imagen que se acaba de pegar. */
function VistaPrevia({ url }: { readonly url: string | null }) {
  const [rota, setRota] = useState(false);

  return (
    <div
      className={cn(
        "aspect-[2/3] w-[96px] shrink-0 overflow-hidden rounded-input",
        "border border-[var(--slate-700)] bg-[var(--slate-850)]",
        "grid place-items-center text-center",
      )}
    >
      {url !== null && !rota ? (
        // eslint-disable-next-line @next/next/no-img-element -- es una URL de origen arbitraria, no un asset del proyecto: `next/image` exige declarar el dominio en la configuración y aquí el dominio lo elige el usuario
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          // No se le dice al dominio de origen desde qué página se le mira.
          referrerPolicy="no-referrer"
          onError={() => {
            setRota(true);
          }}
          onLoad={() => {
            setRota(false);
          }}
        />
      ) : (
        <span className="px-[var(--e-05)] font-mono text-mono-s text-[var(--ash-400)]">
          {rota ? "no carga" : "vista previa"}
        </span>
      )}
    </div>
  );
}
