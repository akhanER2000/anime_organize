"use client";

import { useState } from "react";

import { Boton } from "@/components/ui/boton";
import { Combobox, type OpcionCombobox } from "@/components/ui/combobox";
import { DialogoConfirmacion } from "@/components/ui/dialogo-confirmacion";
import { Pestanas } from "@/components/ui/pestanas";
import { ProgresoEditable } from "@/components/ui/progreso-editable";
import { Selector } from "@/components/ui/selector";
import { Tooltip } from "@/components/ui/tooltip";
import { ZonaArrastre } from "@/components/ui/zona-arrastre";
import { ESTADOS, ETIQUETA_ESTADO, type Estado } from "@/lib/domain/enums";

import type { ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MUESTRAS INTERACTIVAS DE LAS SIETE PRIMITIVAS NUEVAS.
 *
 * Fichero aparte de `muestras.tsx` por lo mismo que aquel existe: la galería es
 * un Server Component y `"use client"` va lo más abajo posible del árbol
 * (`code-style.md`). Partirlo en dos también evita que un cambio en el selector
 * obligue a rehidratar las muestras del modal.
 *
 * **Estas muestras están para USARSE, no para mirarlas.** Cada una expone el
 * estado que hay que probar con el teclado: las flechas de las pestañas, el
 * `aria-activedescendant` del combobox, el texto exigido del diálogo. Si algo
 * de aquí no responde al teclado, la primitiva está rota aunque se vea bien.
 * ═══════════════════════════════════════════════════════════════════════════
 */

function Parrafo({ children }: { children: ReactNode }) {
  return <p className="font-ui text-cuerpo-s text-[var(--porcelain-200)]">{children}</p>;
}

/** SELECTOR — reposo, con una opción apagada y deshabilitado. */
export function MuestraSelector() {
  const [estado, setEstado] = useState("");

  const opciones = ESTADOS.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTADO[e] }));
  const elegido = ESTADOS.find((e): e is Estado => e === estado);

  return (
    <div className="grid max-w-[720px] gap-[var(--e-3)] tablet:grid-cols-3">
      <Selector
        etiqueta="Estado"
        opciones={opciones}
        vacia="Cualquiera"
        value={estado}
        onChange={(evento) => {
          setEstado(evento.target.value);
        }}
        ayuda={elegido === undefined ? "Sin filtrar" : `Filtrando por ${ETIQUETA_ESTADO[elegido]}`}
      />

      <Selector
        etiqueta="Con una opción apagada"
        opciones={[
          ...opciones.slice(0, 2),
          { valor: "x", etiqueta: "No disponible", deshabilitada: true },
        ]}
      />

      <Selector etiqueta="Deshabilitado" opciones={opciones} disabled />
    </div>
  );
}

/**
 * PESTAÑAS — con la de Peligro en granate y el punto de error.
 *
 * Para probarla: tabula hasta la primera y muévete con ← →. El tabulador debe
 * entrar UNA vez al grupo, no cuatro.
 */
export function MuestraPestanas() {
  return (
    <Pestanas
      etiqueta="Ajustes de la cuenta"
      pestanas={[
        {
          id: "perfil",
          etiqueta: "Perfil",
          contenido: <Parrafo>Nombre, correo y avatar.</Parrafo>,
        },
        {
          id: "importar",
          etiqueta: "Importar",
          conError: true,
          contenido: <Parrafo>Tres filas del .xlsx no se pudieron leer.</Parrafo>,
        },
        {
          id: "sitios",
          etiqueta: "Sitios",
          contenido: <Parrafo>Espejos y su orden.</Parrafo>,
        },
        {
          id: "peligro",
          etiqueta: "Peligro",
          tono: "peligro",
          contenido: <Parrafo>Borrar la cuenta. Granate, y solo aquí.</Parrafo>,
        },
      ]}
    />
  );
}

/** TOOLTIP — siempre sobre algo que YA se entiende sin él. */
export function MuestraTooltip() {
  return (
    <div className="flex flex-wrap items-center gap-[var(--e-4)] py-[var(--e-4)]">
      <Tooltip texto="Vista de rejilla">
        <Boton variante="secundario" aria-label="Vista de rejilla">
          ▦
        </Boton>
      </Tooltip>

      <Tooltip texto="Se abre hacia abajo" lado="abajo">
        <Boton variante="secundario">Pásame el ratón, o tabula hasta aquí</Boton>
      </Tooltip>
    </div>
  );
}

/** ZONA DE ARRASTRE — reposo, subiendo y con error. */
export function MuestraZonaArrastre() {
  const [ultimo, setUltimo] = useState<string | null>(null);

  const inerte = () => {
    /* muestra estática: el estado se fija por props */
  };

  return (
    <div className="grid max-w-[860px] gap-[var(--e-3)] tablet:grid-cols-3">
      <ZonaArrastre
        etiqueta="Arrastra la portada, o pulsa para elegirla"
        ayuda={ultimo ?? "PNG, JPG o WebP · hasta 8 MB"}
        accept="image/*"
        onFicheros={(ficheros) => {
          setUltimo(ficheros[0]?.name ?? null);
        }}
      />

      <ZonaArrastre etiqueta="Subiendo…" accept="image/*" progreso={62} onFicheros={inerte} />

      <ZonaArrastre
        etiqueta="Arrastra el .xlsx"
        accept=".xlsx,.csv"
        error="El fichero pesa 14 MB. El máximo son 8."
        onFicheros={inerte}
      />
    </div>
  );
}

/** DIÁLOGO DE CONFIRMACIÓN — con y sin texto exigido. */
export function MuestraDialogoConfirmacion() {
  const [simple, setSimple] = useState(false);
  const [duro, setDuro] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-[var(--e-2)]">
      <Boton
        variante="secundario"
        onClick={() => {
          setSimple(true);
        }}
      >
        Quitar de favoritos
      </Boton>

      <Boton
        variante="destructivo"
        onClick={() => {
          setDuro(true);
        }}
      >
        Borrar la cuenta
      </Boton>

      {hecho !== null && (
        <span className="font-mono text-mono text-[var(--gold-300)]">{hecho}</span>
      )}

      <DialogoConfirmacion
        abierto={simple}
        alCerrar={() => {
          setSimple(false);
        }}
        titulo="¿Quitar de favoritos?"
        descripcion="Se puede volver a marcar en cualquier momento."
        etiquetaConfirmar="Quitar"
        tono="normal"
        alConfirmar={() => {
          setHecho("quitado de favoritos");
          setSimple(false);
        }}
      />

      <DialogoConfirmacion
        abierto={duro}
        alCerrar={() => {
          setDuro(false);
        }}
        titulo="Borrar la cuenta"
        descripcion="Se borrarán 83 series con sus portadas y su progreso. No hay deshacer."
        textoExigido="castrolorenzosegundo@gmail.com"
        etiquetaConfirmar="Borrar para siempre"
        alConfirmar={async () => {
          // El retardo enseña «pie con spinner y botones bloqueados» (§6).
          await new Promise((listo) => setTimeout(listo, 900));
          setHecho("(era una muestra: no se borró nada)");
          setDuro(false);
        }}
      />
    </div>
  );
}

/**
 * COMBOBOX — filtra escribiendo, elige con teclado o con ratón.
 *
 * Las dos formas de elegir hay que probarlas: es justo donde falla el patrón,
 * porque el `blur` del ratón llega antes que el `click`.
 */
export function MuestraCombobox() {
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);

  const todas: readonly OpcionCombobox[] = [
    { valor: "aot", etiqueta: "Attack on Titan", detalle: "2013" },
    { valor: "hig", etiqueta: "Higurashi no Naku Koro ni", detalle: "2006" },
    { valor: "hig2020", etiqueta: "Higurashi no Naku Koro ni (2020)", detalle: "2020" },
    { valor: "wa", etiqueta: "White Album", detalle: "2009" },
    { valor: "wa2", etiqueta: "White Album 2", detalle: "2013" },
    { valor: "fz", etiqueta: "Fate/Zero", detalle: "2011" },
  ];

  const filtradas = todas.filter((opcion) =>
    opcion.etiqueta.toLowerCase().includes(texto.toLowerCase()),
  );

  return (
    <div className="flex max-w-[420px] flex-col gap-[var(--e-1)]">
      <Combobox
        etiqueta="Serie"
        placeholder="Escribe para filtrar…"
        opciones={filtradas}
        valor={texto}
        onCambiar={setTexto}
        onElegir={(opcion) => {
          setTexto(opcion.etiqueta);
          setElegido(opcion.etiqueta);
        }}
      />

      <p className="font-mono text-mono-s text-[var(--ash-400)]">
        {elegido === null ? "nada elegido todavía" : `elegido: ${elegido}`}
      </p>
    </div>
  );
}

/** BARRA DE PROGRESO EDITABLE — con los tres botones rápidos de la skill §4. */
export function MuestraProgresoEditable() {
  const [porcentaje, setPorcentaje] = useState(35);
  const [etiqueta, setEtiqueta] = useState("Temporada 2 · episodio 7");

  return (
    <div className="flex max-w-[420px] flex-col gap-[var(--e-4)]">
      <ProgresoEditable
        porcentaje={porcentaje}
        etiqueta={etiqueta}
        onCambiar={(n) => {
          setPorcentaje(n);
          setEtiqueta(`${String(n)} %`);
        }}
        onEpisodioMas={() => {
          setPorcentaje((n) => Math.min(100, n + 9));
          setEtiqueta("Temporada 2 · episodio 8");
        }}
        onTemporadaCompleta={() => {
          setPorcentaje(50);
          setEtiqueta("Solo 1ra temporada");
        }}
        onTodoVisto={() => {
          setPorcentaje(100);
          setEtiqueta("Completo (Todo Visto)");
        }}
      />

      <ProgresoEditable
        porcentaje={40}
        etiqueta="Abandonado en el episodio 4"
        abandonado
        disabled
        onCambiar={() => {
          /* muestra estática */
        }}
      />
    </div>
  );
}
