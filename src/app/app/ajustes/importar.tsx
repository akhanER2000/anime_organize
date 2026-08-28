"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Boton } from "@/components/ui/boton";
import { Casilla } from "@/components/ui/casilla";
import { MensajeDeFallo } from "@/components/ui/mensaje-error";
import { ZonaArrastre } from "@/components/ui/zona-arrastre";
import { ETIQUETA_SECCION, NOTA_SECUNDARIA } from "@/lib/ui/clases";
import { cn } from "@/lib/ui/cn";

import { confirmarImportacion } from "./acciones-importar";

import type { PlanDeImportacion } from "@/app/api/import/route";
import type { Fallo, Respuesta } from "@/lib/api/respuesta";
import type { ResultadoImportacion } from "./acciones-importar";
import type { Veredicto } from "@/lib/import-export/plan";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AJUSTES → IMPORTAR — lote C2.
 *
 * ── DOS PASOS, Y EL PRIMERO NO ESCRIBE NADA ─────────────────────────────
 *
 * Soltar el fichero **enseña qué pasaría**. Escribir es una segunda decisión,
 * con la lista delante y las casillas marcables. Una importación de 300 filas
 * que se ejecuta al soltar es irreversible en la práctica: deshacerla es
 * borrar 300 animes a mano.
 *
 * ── SE DICE TODO LO QUE NO ENTRA, Y POR QUÉ ─────────────────────────────
 *
 * Duplicadas, repetidas dentro del propio fichero y erróneas salen con su
 * motivo y con **el número de fila de la hoja** —el que el usuario ve al abrir
 * su Excel—, no con un índice interno. Y al terminar se ofrece el CSV de
 * incidencias, que es lo que permite arreglar la hoja y volver a intentarlo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ETIQUETA_VEREDICTO: Readonly<Record<Veredicto, string>> = {
  NUEVA: "Se importará",
  DUPLICADA: "Ya la tienes",
  REPETIDA_EN_EL_FICHERO: "Repetida en el fichero",
  ERROR: "No se puede importar",
};

/** El punto de color va SIEMPRE con su texto: el color no comunica solo. */
const PUNTO: Readonly<Record<Veredicto, string>> = {
  NUEVA: "bg-[var(--estado-visto)]",
  DUPLICADA: "bg-[var(--estado-espera)]",
  REPETIDA_EN_EL_FICHERO: "bg-[var(--estado-espera)]",
  ERROR: "bg-[var(--estado-abandonado)]",
};

export function Importar() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  const [subiendo, setSubiendo] = useState(false);
  const [plan, setPlan] = useState<PlanDeImportacion | null>(null);
  const [marcadas, setMarcadas] = useState<ReadonlySet<number>>(new Set());
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [hecho, setHecho] = useState<ResultadoImportacion | null>(null);

  const subir = (ficheros: readonly File[]): void => {
    const fichero = ficheros[0];
    if (fichero === undefined) return;

    setFallo(null);
    setHecho(null);
    setPlan(null);
    setSubiendo(true);

    const cuerpo = new FormData();
    cuerpo.set("fichero", fichero);

    void fetch("/api/import", { method: "POST", body: cuerpo })
      .then(async (r) => (await r.json()) as Respuesta<PlanDeImportacion>)
      .then((r) => {
        if (!r.ok) {
          setFallo(r.error);
          return;
        }
        setPlan(r.data);
        // Preseleccionadas las que el servidor marcó importables. El usuario
        // corrige lo que quiera antes de confirmar.
        setMarcadas(new Set(r.data.plan.filter((f) => f.seleccionada).map((f) => f.filaDeLaHoja)));
      })
      .catch(() => {
        setFallo({ codigo: "ERROR_INTERNO", mensaje: "No se ha podido subir el fichero." });
      })
      .finally(() => {
        setSubiendo(false);
      });
  };

  const alternar = (fila: number): void => {
    setMarcadas((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(fila)) siguiente.delete(fila);
      else siguiente.add(fila);
      return siguiente;
    });
  };

  const confirmar = (): void => {
    if (plan === null) return;
    setFallo(null);
    iniciar(() => {
      void confirmarImportacion({ loteId: plan.loteId, filas: [...marcadas] }).then((r) => {
        if (!r.ok) {
          setFallo(r.error);
          return;
        }
        setHecho(r.data);
        setPlan(null);
        router.refresh();
      });
    });
  };

  /**
   * La descarga se construye en el navegador con lo que devolvió la acción.
   *
   * No hay un `GET` que sirva el CSV, y es a propósito: sería una URL con las
   * incidencias del vault de alguien, alcanzable por cualquiera que la tuviera.
   * Es el mismo criterio que el export del borrado de cuenta (`security.md`).
   */
  const descargarCsv = (): void => {
    if (hecho?.csv == null) return;
    // El BOM es lo que hace que Excel abra el CSV en UTF-8. Sin él, los
    // acentos de los títulos salen rotos justo en el fichero que existe para
    // que el usuario los arregle.
    const blob = new Blob([`﻿${hecho.csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const ancla = document.createElement("a");
    ancla.href = url;
    ancla.download = hecho.nombreCsv;
    ancla.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex flex-col gap-[var(--e-3)]">
      <header className="flex flex-col gap-[var(--e-1)]">
        <h2 className={ETIQUETA_SECCION}>Importar una hoja</h2>
        <p className={NOTA_SECUNDARIA}>
          Un .xlsx o un .csv con una fila por serie. Primero se enseña qué pasaría; no se escribe
          nada hasta que lo confirmes.
        </p>
      </header>

      {fallo !== null && <MensajeDeFallo fallo={fallo} />}

      {plan === null && hecho === null && (
        <ZonaArrastre
          {...(subiendo ? { progreso: null } : {})}
          etiqueta="Suelta aquí tu hoja"
          ayuda=".xlsx o .csv · hasta 5 MB"
          accept=".xlsx,.csv,text/csv"
          disabled={subiendo}
          onFicheros={subir}
        />
      )}

      {plan !== null && (
        <>
          <div className="flex flex-col gap-[var(--e-1)]">
            <p className="font-ui text-cuerpo-s text-[var(--porcelain-100)]">
              {plan.nombreFichero} · {plan.resumen.total} filas
            </p>
            <p className={NOTA_SECUNDARIA}>
              {plan.resumen.nuevas} nuevas · {plan.resumen.duplicadas} ya las tienes ·{" "}
              {plan.resumen.repetidas} repetidas en el fichero · {plan.resumen.errores} con error
            </p>
            {plan.recortada && (
              <p className="font-mono text-mono text-[var(--estado-viendo-texto)]">
                La hoja tiene más filas de las que se pueden leer de una vez. Se han cargado las
                primeras; el resto se importa en una segunda pasada.
              </p>
            )}
          </div>

          <ul className="flex max-h-[420px] flex-col gap-[var(--e-05)] overflow-y-auto">
            {plan.plan.map((fila) => (
              <li
                key={fila.filaDeLaHoja}
                className="flex items-center gap-[var(--e-1-5)] border-b border-[var(--slate-700)] py-[var(--e-05)]"
              >
                <Casilla
                  // El nombre accesible dice fila Y título: «casilla» a secas
                  // deja a quien navega con lector sin saber qué está marcando.
                  // Va en sr-only porque el título ya se ve al lado.
                  etiqueta={
                    <span className="sr-only">
                      Fila {fila.filaDeLaHoja}: {fila.datos.titulo}
                    </span>
                  }
                  checked={marcadas.has(fila.filaDeLaHoja)}
                  disabled={fila.veredicto === "ERROR"}
                  onChange={() => {
                    alternar(fila.filaDeLaHoja);
                  }}
                />

                <span className="w-[3ch] shrink-0 font-mono text-mono-s text-[var(--ash-400)]">
                  {fila.filaDeLaHoja}
                </span>

                <span className="min-w-0 grow truncate font-ui text-ui-s text-[var(--porcelain-100)]">
                  {fila.datos.titulo === "" ? "(sin título)" : fila.datos.titulo}
                </span>

                <span
                  aria-hidden="true"
                  className={cn("size-[6px] shrink-0 rounded-barra", PUNTO[fila.veredicto])}
                />
                <span className="shrink-0 font-mono text-mono-s text-[var(--ash-400)]">
                  {ETIQUETA_VEREDICTO[fila.veredicto]}
                  {fila.motivo !== null && ` · ${fila.motivo}`}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-[var(--e-2)]">
            <Boton
              variante="primario"
              disabled={pendiente || marcadas.size === 0}
              onClick={confirmar}
            >
              {pendiente ? "Importando…" : `Importar ${String(marcadas.size)} series`}
            </Boton>
            <Boton
              variante="fantasma"
              disabled={pendiente}
              onClick={() => {
                setPlan(null);
              }}
            >
              Cancelar
            </Boton>
          </div>
        </>
      )}

      {hecho !== null && (
        <div className="flex flex-col gap-[var(--e-2)]">
          <p
            role="status"
            aria-live="polite"
            className="font-ui text-cuerpo-s text-[var(--porcelain-100)]"
          >
            {hecho.creadas} importadas · {hecho.duplicadas} ya estaban · {hecho.errores} con error
          </p>

          {hecho.csv !== null && (
            <div className="flex flex-wrap items-center gap-[var(--e-2)]">
              <Boton variante="secundario" onClick={descargarCsv}>
                Descargar el detalle (.csv)
              </Boton>
              <span className={NOTA_SECUNDARIA}>
                Lleva el número de fila de tu hoja, para que puedas arreglarla y volver a subirla.
              </span>
            </div>
          )}

          <div>
            <Boton
              variante="fantasma"
              onClick={() => {
                setHecho(null);
              }}
            >
              Importar otra hoja
            </Boton>
          </div>
        </div>
      )}
    </section>
  );
}
