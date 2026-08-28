"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { abrirEnlace, borrarEnlace, guardarEnlace } from "@/app/app/acciones";
import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { Enlace } from "@/components/ui/enlace";
import { MensajeDeFallo } from "@/components/ui/mensaje-error";
import { esHrefSeguro } from "@/lib/ui/href";

import type { Fallo } from "@/lib/api/respuesta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS ENLACES PARA CONTINUAR — skill de dominio §7, y artboard 05.
 *
 * `AccionContinuar` pinta el más reciente como acción primaria y lo hace bien.
 * Lo que faltaba era todo lo demás: **poder añadir uno, poder borrarlo, y que
 * abrirlo cuente como usarlo**.
 *
 * ── ABRIR SIGUE SIENDO UN `<a>`, Y EL REGISTRO VA ENCIMA ──────────────────
 *
 * La tentación es convertirlo en un `<button>` que llame a la acción y luego
 * haga `window.open`. Eso pierde el clic central, «copiar dirección», arrastrar
 * a marcadores y funcionar con JavaScript caído — y encima el navegador bloquea
 * el `open` si el clic no es directo.
 *
 * Se queda como ancla y el registro de uso viaja **como efecto secundario del
 * clic**, sin `preventDefault`. Si la acción falla, la pestaña se ha abierto
 * igual: abrir el capítulo importa más que la contabilidad de cuándo se abrió.
 *
 * ── EL ORDEN LO DECIDE LA BASE, NO ESTE COMPONENTE ────────────────────────
 *
 * Llegan ya ordenados por `last_used_at DESC NULLS LAST`. El `NULLS LAST` es lo
 * que impide que un enlace recién pegado —sin usar— adelante al que se abrió
 * hace un minuto, y por tanto que la acción primaria sea el equivocado. Está
 * fijado en `enlaces.integracion.test.ts`.
 *
 * ── TRES CAPAS SOBRE LA URL, Y NINGUNA SOBRA ──────────────────────────────
 *
 * La pega el usuario, así que es XSS almacenado si nadie mira:
 *   1. `EsquemaUrlEnlace` en la Server Action (parser de URL, no `startsWith`);
 *   2. el `CHECK ck_continue_link_url` de la columna;
 *   3. `esHrefSeguro` aquí, para no pintar como acción algo que `Enlace`
 *      degradaría a texto inerte con aspecto de botón.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type EnlaceGuardado = {
  readonly id: string;
  readonly url: string;
  readonly etiqueta: string | null;
  readonly ultimoUso: string | null;
};

export function GestorEnlaces({
  animeId,
  enlaces,
}: {
  readonly animeId: string;
  readonly enlaces: readonly EnlaceGuardado[];
}) {
  const router = useRouter();
  const [anadiendo, setAnadiendo] = useState(false);
  const [url, setUrl] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  // Se guarda el FALLO entero, no solo su texto: el motivo de verdad viaja en
  // `detalles`, y quedarse con `mensaje` deja «revisa los campos marcados» sin
  // ningún campo marcado.
  const [error, setError] = useState<Fallo | null>(null);
  const [trabajando, iniciar] = useTransition();

  const guardar = () => {
    iniciar(async () => {
      const respuesta = await guardarEnlace({
        animeId,
        url,
        etiqueta: etiqueta.trim() === "" ? null : etiqueta,
        temporada: null,
        episodio: null,
      });

      if (!respuesta.ok) {
        setError(respuesta.error);
        return;
      }

      setUrl("");
      setEtiqueta("");
      setAnadiendo(false);
      setError(null);
      router.refresh();
    });
  };

  const quitar = (id: string) => {
    iniciar(async () => {
      const respuesta = await borrarEnlace(id);
      if (!respuesta.ok) {
        setError(respuesta.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-[var(--e-2)]">
      {error !== null && <MensajeDeFallo fallo={error} />}

      {enlaces.length > 0 && (
        <ul className="flex flex-col gap-[var(--e-1)]">
          {enlaces.map((enlace, indice) => {
            const nombre = enlace.etiqueta ?? enlace.url;
            // ── EL PRIMERO NO SE PINTA COMO ENLACE OTRA VEZ ────────────────
            //
            // `AccionContinuar` ya lo enseña arriba como el botón dorado, que es
            // la acción primaria de la pantalla. Repetirlo aquí como un segundo
            // ancla al mismo sitio deja dos controles idénticos a diez píxeles,
            // y quien mira no sabe si hacen lo mismo.
            //
            // Su fila sigue existiendo —hace falta para poder quitarlo— pero es
            // texto, y dice POR QUÉ está aquí en vez de repetir la acción.
            const esLaPrimaria = indice === 0;

            return (
              <li key={enlace.id} className="flex items-center gap-[var(--e-1)]">
                {!esHrefSeguro(enlace.url) ? (
                  <span
                    role="alert"
                    className="min-w-0 flex-1 truncate font-mono text-mono text-[var(--estado-abandonado-texto)]"
                  >
                    ⚠ Enlace no válido: {enlace.url}
                  </span>
                ) : esLaPrimaria ? (
                  <span className="min-w-0 flex-1 truncate font-ui text-ui-s text-[var(--gold-200)]">
                    {nombre}
                    <span className="ml-[var(--e-05)] font-mono text-mono-s text-[var(--ash-400)]">
                      · el de arriba
                    </span>
                  </span>
                ) : (
                  <Enlace
                    href={enlace.url}
                    externo
                    className="min-w-0 flex-1 truncate font-ui text-ui-s text-[var(--porcelain-200)]"
                    onClick={() => {
                      // SIN `preventDefault`: la pestaña se abre igual. Esto solo
                      // apunta que se usó, y si falla no se cancela nada — abrir
                      // el capítulo importa más que la contabilidad.
                      void abrirEnlace(enlace.id).then(() => {
                        router.refresh();
                      });
                    }}
                  >
                    {nombre}
                  </Enlace>
                )}

                <Boton
                  variante="fantasma"
                  tamano="s"
                  onClick={() => {
                    quitar(enlace.id);
                  }}
                  disabled={trabajando}
                  aria-label={`Quitar el enlace ${nombre}`}
                >
                  Quitar
                </Boton>
              </li>
            );
          })}
        </ul>
      )}

      {anadiendo ? (
        <div className="flex flex-col gap-[var(--e-1-5)]">
          <Campo
            etiqueta="Dirección del capítulo"
            value={url}
            onChange={(evento) => {
              setUrl(evento.target.value);
            }}
            placeholder="https://…"
            inputMode="url"
            autoFocus
            ayuda="La dirección EXACTA del capítulo por el que vas, no la de la serie."
          />

          <Campo
            etiqueta="Etiqueta"
            value={etiqueta}
            onChange={(evento) => {
              setEtiqueta(evento.target.value);
            }}
            placeholder="AnimeFLV V2 · Ep 7"
            ayuda="Opcional. Si la dejas vacía se enseña la dirección."
          />

          <div className="flex gap-[var(--e-1)]">
            <Boton
              variante="primario"
              tamano="s"
              onClick={guardar}
              disabled={url.trim() === "" || trabajando}
              cargando={trabajando}
            >
              Guardar el enlace
            </Boton>
            <Boton
              variante="fantasma"
              tamano="s"
              onClick={() => {
                setAnadiendo(false);
                setError(null);
              }}
              disabled={trabajando}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      ) : (
        <Boton
          variante="secundario"
          tamano="s"
          onClick={() => {
            setAnadiendo(true);
          }}
        >
          {enlaces.length === 0 ? "Guardar por dónde voy" : "Añadir otro enlace"}
        </Boton>
      )}
    </div>
  );
}
