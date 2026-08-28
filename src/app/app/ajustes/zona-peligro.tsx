"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { borrarMiCuenta, exportarVault } from "./acciones-peligro";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { MensajeDeFallo } from "@/components/ui/mensaje-error";
import { NOTA_SECUNDARIA, SUPERFICIE_PELIGRO } from "@/lib/ui/clases";
import { cn } from "@/lib/ui/cn";

import type { Fallo } from "@/lib/api/respuesta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ZONA DE PELIGRO — artboard 12.
 *
 * ── LA DESCARGA LA PROVOCA EL NAVEGADOR, NO UN ENLACE ────────────────────
 *
 * El fichero llega como objeto desde la Server Action y aquí se convierte en un
 * `Blob` con una URL efímera. Es lo que exige `security.md` §2 ter: un
 * `GET /api/export` sería una dirección que, con la cookie puesta, cualquier
 * página podría hacer que el navegador visitara.
 *
 * `URL.revokeObjectURL` no es limpieza cosmética: sin él, el blob se queda en
 * memoria mientras la pestaña viva, y son megabytes.
 *
 * ── EL BORRADO SOLO SE HABILITA DESPUÉS DE DESCARGAR ─────────────────────
 *
 * `security.md` §3 pide el export **antes** de borrar. Se puede cumplir de dos
 * formas: descargándolo automáticamente al pulsar borrar, o exigiendo que el
 * usuario lo descargue primero.
 *
 * Se elige la segunda. La primera deja el fichero en la carpeta de descargas
 * sin que nadie lo mire, y quien borra su cuenta a las tres de la mañana no se
 * entera de que lo tiene. Con la segunda, la copia existe **y el usuario sabe
 * que existe**, que es la mitad del punto.
 *
 * ── TRES BARRERAS, Y CADA UNA PRUEBA OTRA COSA ───────────────────────────
 *
 *   · descargar el export → que hay copia;
 *   · escribir el email exacto → que sabes QUÉ estás borrando;
 *   · la contraseña → que eres TÚ.
 *
 * Quitar cualquiera deja un agujero distinto, y el del email es el que la gente
 * quita primero por parecer redundante: no lo es. Es el que impide que un clic
 * en el sitio equivocado, con la sesión abierta, borre 83 series.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function ZonaPeligro({ email }: { email: string }) {
  const router = useRouter();
  const [descargado, setDescargado] = useState(false);
  const [emailEscrito, setEmailEscrito] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Fallo | null>(null);
  const [trabajando, iniciar] = useTransition();

  const errorDeCampo = (campo: string): { error?: string } => {
    const motivo = error?.detalles?.find((detalle) => detalle.campo === campo)?.motivo;
    return motivo === undefined ? {} : { error: motivo };
  };

  const descargar = () => {
    iniciar(async () => {
      const respuesta = await exportarVault();
      if (!respuesta.ok) {
        setError(respuesta.error);
        return;
      }

      const blob = new Blob([JSON.stringify(respuesta.data.fichero, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const ancla = document.createElement("a");
      ancla.href = url;
      ancla.download = respuesta.data.nombre;
      ancla.click();
      // Sin esto el blob se queda en memoria mientras viva la pestaña.
      URL.revokeObjectURL(url);

      setDescargado(true);
      setError(null);
    });
  };

  const borrar = () => {
    iniciar(async () => {
      const respuesta = await borrarMiCuenta({ password, emailEscrito });
      if (!respuesta.ok) {
        setError(respuesta.error);
        return;
      }

      // La cuenta ya no existe y la sesión está invalidada. A la landing, que
      // es lo único que queda: quedarse en `/app` daría un error en vez de una
      // pantalla.
      router.push("/");
    });
  };

  const puedeBorrar = descargado && emailEscrito !== "" && password !== "" && !trabajando;

  return (
    <div className="flex flex-col gap-[var(--e-4)]">
      <section className="flex flex-col gap-[var(--e-2)]">
        <h3 className="font-ui text-cuerpo-s font-[var(--fw-ui-medium)] text-[var(--porcelain-100)]">
          Llévate tus datos
        </h3>

        <p className="font-ui text-ui-s leading-cuerpo text-[var(--porcelain-200)]">
          Un `.json` con tus series, sus estados, tus notas, el progreso con la etiqueta que
          escribiste y tus enlaces para continuar.
          <span className={NOTA_SECUNDARIA}>
            No lleva los bytes de las portadas, solo su huella y su dirección de origen: pesarían
            más de lo que cabe en una respuesta. Una portada se recupera pegando su dirección; unas
            notas, no.
          </span>
        </p>

        <div className="flex flex-wrap items-center gap-[var(--e-2)]">
          <Boton variante="secundario" onClick={descargar} disabled={trabajando}>
            Descargar mi vault
          </Boton>

          {descargado && (
            <span role="status" className="font-mono text-mono text-[var(--gold-300)]">
              Descargado.
            </span>
          )}
        </div>
      </section>

      <section
        className={cn(
          "flex flex-col gap-[var(--e-2-5)] rounded-card border p-[var(--e-3)]",
          // El granate del sistema, y este es uno de los DOS sitios donde se usa
          // (`design-tokens.md`): aquí y en los errores de validación.
          SUPERFICIE_PELIGRO,
        )}
      >
        <h3 className="font-ui text-cuerpo-s font-[var(--fw-ui-medium)] text-[var(--estado-abandonado-texto)]">
          Borrar la cuenta
        </h3>

        <p className="font-ui text-ui-s leading-cuerpo text-[var(--porcelain-200)]">
          Se borra todo: las series, las portadas, el progreso, los enlaces y la cuenta. No hay
          papelera y no se puede deshacer.
          <span className={NOTA_SECUNDARIA}>
            Descarga tu vault antes. El botón no se habilita hasta que lo hagas.
          </span>
        </p>

        {error !== null && error.detalles === undefined && <MensajeDeFallo fallo={error} />}

        <Campo
          etiqueta={`Escribe ${email} para confirmar`}
          value={emailEscrito}
          onChange={(evento) => {
            setEmailEscrito(evento.target.value);
          }}
          // Los cuatro apagados: el autocompletado rellenaría el correo y
          // anularía la barrera entera.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          {...errorDeCampo("emailEscrito")}
        />

        <Campo
          etiqueta="Tu contraseña"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(evento) => {
            setPassword(evento.target.value);
          }}
          {...errorDeCampo("password")}
        />

        <div>
          <Boton
            variante="destructivo"
            onClick={borrar}
            disabled={!puedeBorrar}
            cargando={trabajando}
          >
            Borrar mi cuenta para siempre
          </Boton>

          {!descargado && (
            <p className={NOTA_SECUNDARIA}>Descarga tu vault primero para habilitar el borrado.</p>
          )}
        </div>
      </section>
    </div>
  );
}
