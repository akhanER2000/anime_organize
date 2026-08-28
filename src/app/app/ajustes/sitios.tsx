"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { DialogoConfirmacion } from "@/components/ui/dialogo-confirmacion";
import { Enlace } from "@/components/ui/enlace";
import { MensajeDeFallo } from "@/components/ui/mensaje-error";
import { Selector } from "@/components/ui/selector";
import { TIPOS_SITIO } from "@/lib/domain/enums";
import { ETIQUETA_SECCION, NOTA_SECUNDARIA } from "@/lib/ui/clases";
import { cn } from "@/lib/ui/cn";
import { fechaCorta } from "@/lib/ui/fecha";

import {
  anadirEspejo,
  borrarEspejo,
  borrarSitio,
  comprobarEspejosDelUsuario,
  crearSitio,
} from "./acciones-sitios";

import type { Fallo } from "@/lib/api/respuesta";
import type { SitioConEspejos } from "@/lib/db/sitios";
import type { TipoSitio } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AJUSTES → SITIOS — encargo §8, lote B2.
 *
 * ── LA FRASE QUE ORDENA TODA ESTA PANTALLA ───────────────────────────────
 *
 * «Los dominios espejo cambian con frecuencia y **NO son verdad permanente**»
 * (skill de dominio §8). De ahí sale todo lo demás:
 *
 * · Los trece sitios de la semilla llegan **sin dominios**. Poner los que hoy
 *   funcionan sería inventarse datos con fecha de caducidad, y el dueño se
 *   encontraría enlaces muertos que él no escribió. Los pone él.
 * · Un espejo caído **se apaga, no se borra**. Vuelve a estar en pie la semana
 *   que viene y la dirección sigue ahí.
 * · Se enseña **cuándo se comprobó**. «Caído» sin fecha no es información: un
 *   caído de hace tres semanas no dice nada del estado de ahora.
 *
 * ── LOS SITIOS DE LA SEMILLA NO SE EDITAN, Y SE DICE POR QUÉ ─────────────
 *
 * Son `is_global = true`: la misma fila la ven todos los usuarios, así que
 * renombrar «Crunchyroll» se lo renombraría a todo el mundo. En vez de un
 * botón apagado sin explicación —que se lee como avería—, no hay botón y hay
 * una nota. Lo que sí es suyo son **sus espejos**, y esos se añaden igual.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ETIQUETA_TIPO: Readonly<Record<TipoSitio, string>> = {
  GRATIS: "Gratis",
  PAGO: "De pago",
  MIXTO: "Mixto",
};

type Resumen = { readonly comprobados: number; readonly vivos: number; readonly caidos: number };

/** Lo que devuelve cualquiera de las acciones, visto desde aquí. */
type ResultadoAccion = { readonly ok: boolean; readonly error?: Fallo };

type Ejecutar = (accion: () => Promise<ResultadoAccion>) => void;

export function Sitios({ sitios }: { readonly sitios: readonly SitioConEspejos[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [porBorrar, setPorBorrar] = useState<SitioConEspejos | null>(null);

  /**
   * Un solo punto por el que pasan TODAS las acciones.
   *
   * Sin esto, cada botón repetiría el mismo `if (!r.ok) setFallo(...)` y a la
   * quinta copia una diría otra cosa. Es «un concepto, un dueño» aplicado
   * dentro de un componente.
   */
  const ejecutar: Ejecutar = (accion) => {
    setFallo(null);
    setResumen(null);
    iniciar(() => {
      void accion().then((r) => {
        if (!r.ok && r.error !== undefined) setFallo(r.error);
        else router.refresh();
      });
    });
  };

  const totalEspejosMios = sitios.reduce((n, s) => n + (s.esGlobal ? 0 : s.espejos.length), 0);

  return (
    <section className="flex flex-col gap-[var(--e-4)]">
      <header className="flex flex-col gap-[var(--e-1)]">
        <h2 className={ETIQUETA_SECCION}>Sitios y espejos</h2>
        <p className={NOTA_SECUNDARIA}>
          Los dominios espejo cambian a menudo. Aquí guardas los tuyos y compruebas cuáles siguen en
          pie. Un espejo caído se apaga, nunca se borra solo.
        </p>
      </header>

      {fallo !== null && <MensajeDeFallo fallo={fallo} />}

      <div className="flex flex-wrap items-center gap-[var(--e-2)]">
        <Boton
          variante="primario"
          disabled={pendiente || totalEspejosMios === 0}
          onClick={() => {
            ejecutar(async () => {
              const r = await comprobarEspejosDelUsuario();
              if (r.ok) setResumen(r.data);
              return r;
            });
          }}
        >
          {pendiente ? "Comprobando…" : "Comprobar espejos"}
        </Boton>

        {totalEspejosMios === 0 && (
          <span className={NOTA_SECUNDARIA}>Añade un espejo para poder comprobarlo.</span>
        )}

        {resumen !== null && (
          <span
            role="status"
            aria-live="polite"
            className="font-mono text-mono text-[var(--porcelain-200)]"
          >
            {resumen.comprobados} comprobados · {resumen.vivos} en pie · {resumen.caidos} caídos
          </span>
        )}
      </div>

      <NuevoSitio pendiente={pendiente} ejecutar={ejecutar} />

      <ul className="flex flex-col gap-[var(--e-2)]">
        {sitios.map((sitio) => (
          <li key={sitio.id}>
            <FichaSitio
              sitio={sitio}
              pendiente={pendiente}
              ejecutar={ejecutar}
              alPedirBorrado={() => {
                setPorBorrar(sitio);
              }}
            />
          </li>
        ))}
      </ul>

      <DialogoConfirmacion
        abierto={porBorrar !== null}
        alCerrar={() => {
          setPorBorrar(null);
        }}
        titulo="Borrar este sitio"
        descripcion={
          porBorrar === null
            ? ""
            : `Se borrará «${porBorrar.nombre}» y sus ${String(porBorrar.espejos.length)} espejo(s). No se toca ningún anime.`
        }
        etiquetaConfirmar="Borrar el sitio"
        tono="destructivo"
        alConfirmar={() => {
          const objetivo = porBorrar;
          setPorBorrar(null);
          if (objetivo === null) return;
          ejecutar(() => borrarSitio({ sitioId: objetivo.id }));
        }}
      />
    </section>
  );
}

/** El alta de un sitio propio. */
function NuevoSitio({
  pendiente,
  ejecutar,
}: {
  readonly pendiente: boolean;
  readonly ejecutar: Ejecutar;
}) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoSitio>("GRATIS");

  return (
    <form
      // Un borde normal, NO `MARCO_DORADO`: esa receta es el marco decorativo
      // de la PANTALLA —`absolute` + `pointer-events-none`— y usarla como caja
      // dejó este formulario flotando sobre la página sin recibir un solo clic.
      // El botón se veía perfecto y no hacía nada; lo cazó el recorrido en
      // navegador, porque el HTML era correcto y el fallo era de capas.
      className="flex flex-col gap-[var(--e-2)] rounded-card border border-[var(--gold-700)] p-[var(--e-2)]"
      onSubmit={(evento) => {
        evento.preventDefault();
        ejecutar(async () => {
          const r = await crearSitio({ nombre, tipo });
          if (r.ok) setNombre("");
          return r;
        });
      }}
    >
      <h3 className={ETIQUETA_SECCION}>Añadir un sitio</h3>

      <div className="flex flex-col gap-[var(--e-2)] tablet:flex-row tablet:items-end">
        <div className="grow">
          <Campo
            etiqueta="Nombre"
            value={nombre}
            onChange={(evento) => {
              setNombre(evento.target.value);
            }}
            placeholder="AnimeYupi"
            autoComplete="off"
          />
        </div>

        <Selector
          etiqueta="Tipo"
          value={tipo}
          onChange={(evento) => {
            // El `value` de un select es `string`. Se estrecha contra la lista
            // canónica en vez de castear: el valor sale de un `<option>` que
            // pintamos nosotros, y castear sería fiarse de eso.
            const elegido = TIPOS_SITIO.find((t) => t === evento.target.value);
            if (elegido !== undefined) setTipo(elegido);
          }}
          opciones={TIPOS_SITIO.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO[t] }))}
        />

        <Boton variante="secundario" type="submit" disabled={pendiente || nombre.trim() === ""}>
          Añadir sitio
        </Boton>
      </div>
    </form>
  );
}

/** Un sitio con sus espejos. */
function FichaSitio({
  sitio,
  pendiente,
  ejecutar,
  alPedirBorrado,
}: {
  readonly sitio: SitioConEspejos;
  readonly pendiente: boolean;
  readonly ejecutar: Ejecutar;
  readonly alPedirBorrado: () => void;
}) {
  const [url, setUrl] = useState("");
  const [etiqueta, setEtiqueta] = useState("");

  return (
    <div className="rounded-card border border-[var(--slate-700)] bg-[var(--slate-850)] p-[var(--e-2)]">
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--e-1)]">
        <h3 className="font-ui text-cuerpo text-[var(--porcelain-100)]">
          {sitio.nombre}{" "}
          <span className="font-mono text-mono-s text-[var(--ash-400)]">
            {ETIQUETA_TIPO[sitio.tipo]}
          </span>
        </h3>

        {sitio.esGlobal ? (
          <span className={NOTA_SECUNDARIA}>De la lista compartida · sus espejos son tuyos</span>
        ) : (
          <Boton variante="fantasma" tamano="s" disabled={pendiente} onClick={alPedirBorrado}>
            Borrar sitio
          </Boton>
        )}
      </div>

      {sitio.espejos.length === 0 ? (
        <p className={cn(NOTA_SECUNDARIA, "mt-[var(--e-1)]")}>
          Sin espejos todavía. Los dominios no se siembran a propósito: caducan.
        </p>
      ) : (
        <ul className="mt-[var(--e-2)] flex flex-col gap-[var(--e-1)]">
          {sitio.espejos.map((espejo) => (
            <li
              key={espejo.id}
              className="flex flex-wrap items-center gap-[var(--e-1-5)] border-t border-[var(--slate-700)] pt-[var(--e-1)]"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-[6px] shrink-0 rounded-barra",
                  espejo.activo ? "bg-[var(--estado-visto)]" : "bg-[var(--estado-abandonado)]",
                )}
              />
              <span className="font-mono text-mono text-[var(--gold-300)]">{espejo.etiqueta}</span>

              <Enlace href={espejo.url} externo className="min-w-0 grow truncate">
                {espejo.url}
              </Enlace>

              {/* El color nunca comunica solo: el punto va SIEMPRE con su texto,
                  igual que los estados de un anime. */}
              <span className="font-mono text-mono-s text-[var(--ash-400)]">
                {espejo.activo ? "En pie" : "Caído"}
                {espejo.comprobadoEn === null
                  ? " · sin comprobar"
                  : ` · ${fechaCorta(espejo.comprobadoEn)}`}
              </span>

              <Boton
                variante="fantasma"
                tamano="s"
                disabled={pendiente}
                onClick={() => {
                  ejecutar(() => borrarEspejo({ espejoId: espejo.id }));
                }}
              >
                Quitar
              </Boton>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-[var(--e-2)] flex flex-col gap-[var(--e-1-5)] tablet:flex-row tablet:items-end"
        onSubmit={(evento) => {
          evento.preventDefault();
          ejecutar(async () => {
            const r = await anadirEspejo({ sitioId: sitio.id, url, etiqueta });
            if (r.ok) {
              setUrl("");
              setEtiqueta("");
            }
            return r;
          });
        }}
      >
        <div className="grow">
          <Campo
            etiqueta={`Nuevo espejo de ${sitio.nombre}`}
            etiquetaOculta
            value={url}
            onChange={(evento) => {
              setUrl(evento.target.value);
            }}
            placeholder="https://…"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="tablet:w-[112px]">
          <Campo
            etiqueta={`Etiqueta del nuevo espejo de ${sitio.nombre}`}
            etiquetaOculta
            value={etiqueta}
            onChange={(evento) => {
              setEtiqueta(evento.target.value);
            }}
            // Vacío = «pónmela tú», que es lo que hace `siguienteEtiquetaDeEspejo`.
            placeholder="V1, V2…"
            autoComplete="off"
          />
        </div>

        <Boton variante="secundario" type="submit" disabled={pendiente || url.trim() === ""}>
          Añadir espejo
        </Boton>
      </form>
    </div>
  );
}
