"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Boton } from "@/components/ui/boton";
import { MensajeDeFallo } from "@/components/ui/mensaje-error";
import { NOTA_SECUNDARIA } from "@/lib/ui/clases";

import { enriquecerAnime } from "./acciones-enriquecer";

import type { Fallo } from "@/lib/api/respuesta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «ENRIQUECER» — el botón que dispara AniList y, si hay clave, Claude.
 *
 * ── LO QUE PASA SE CUENTA, AUNQUE SEA A MEDIAS ───────────────────────────
 *
 * El enriquecimiento tiene DOS pasos y cada uno puede salir distinto. La
 * tentación es enseñar «hecho» o «error», pero el caso más frecuente en este
 * proyecto —sin `ANTHROPIC_API_KEY`— es exactamente el de en medio: AniList sí,
 * IA no. Decir «error» ahí sería mentir sobre un enriquecimiento que funcionó.
 *
 * Por eso el mensaje lo compone el servidor a partir de los dos estados y aquí
 * sólo se pinta: quien conoce el resultado es quien lo vivió.
 *
 * ── UN AVISO NO ES UN FALLO, Y NO SE PINTA COMO TAL ──────────────────────
 *
 * `ok: true` con un aviso va en gris, no en granate. El granate está reservado
 * para lo que de verdad salió mal (`design-tokens.md`: el granate no es un
 * color de marca, aparece sólo en errores y en la zona de peligro).
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function BotonEnriquecer({
  animeId,
  yaEnriquecido,
}: {
  readonly animeId: string;
  readonly yaEnriquecido: boolean;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [fallo, setFallo] = useState<Fallo | null>(null);

  const lanzar = (reanalizar: boolean): void => {
    setAviso(null);
    setFallo(null);
    iniciar(() => {
      void enriquecerAnime(animeId, reanalizar).then((r) => {
        if (r.ok) {
          setAviso(r.data.mensaje);
          router.refresh();
        } else {
          setFallo(r.error);
        }
      });
    });
  };

  return (
    <div className="flex flex-col gap-[var(--e-1)]">
      <div className="flex flex-wrap gap-[var(--e-1)]">
        <Boton
          variante="secundario"
          tamano="s"
          disabled={pendiente}
          onClick={() => {
            lanzar(false);
          }}
        >
          {pendiente ? "Consultando…" : yaEnriquecido ? "Ya enriquecido" : "Enriquecer"}
        </Boton>

        {yaEnriquecido && (
          // La escotilla del contrato: `{ reanalizar: true }`. Sin ella, un
          // enriquecimiento que salió mal no se podría repetir NUNCA, porque el
          // `anilist_id` ya está puesto y el flujo se salta el paso 1.
          <Boton
            variante="fantasma"
            tamano="s"
            disabled={pendiente}
            onClick={() => {
              lanzar(true);
            }}
          >
            Volver a analizar
          </Boton>
        )}
      </div>

      {fallo !== null && <MensajeDeFallo fallo={fallo} />}
      {aviso !== null && (
        <p className={NOTA_SECUNDARIA} role="status" aria-live="polite">
          {aviso}
        </p>
      )}
    </div>
  );
}
