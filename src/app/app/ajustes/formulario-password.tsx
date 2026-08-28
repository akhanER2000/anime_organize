"use client";

import { useState, useTransition } from "react";

import { cambiarPassword } from "./acciones";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { MedidorPassword } from "@/components/ui/medidor-password";
import { MensajeDeFallo } from "@/components/ui/mensaje-error";

import type { Fallo } from "@/lib/api/respuesta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAMBIAR LA CONTRASEÑA — artboard 09, pestaña «Perfil».
 *
 * ── LA CONSECUENCIA SE DICE ANTES, NO DESPUÉS ─────────────────────────────
 *
 * Cambiar la contraseña **revoca las sesiones de los demás dispositivos**: es
 * lo que la hace útil cuando el motivo es «creo que alguien ha entrado». Pero
 * también significa que el móvil se queda fuera, y enterarse de eso al día
 * siguiente, sin haberlo leído en ninguna parte, se parece mucho a un fallo.
 *
 * Va escrito junto al botón, antes de pulsarlo.
 *
 * ── EL MEDIDOR NO BLOQUEA ────────────────────────────────────────────────
 *
 * Lo que decide si la contraseña vale es `EsquemaPassword` —12 caracteres
 * mínimo— y lo comprueba el servidor. El medidor informa; una barra que además
 * impidiera enviar convertiría una heurística en una regla, y las heurísticas
 * de fortaleza rechazan frases largas perfectamente buenas.
 *
 * ── LOS TRES CAMPOS DESAPARECEN AL TERMINAR ──────────────────────────────
 *
 * Se limpian al guardar. Dejar la contraseña nueva escrita en un campo de una
 * pantalla que se queda abierta es exactamente lo que uno no quiere en un
 * ordenador compartido.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function FormularioPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState<Fallo | null>(null);
  const [hecho, setHecho] = useState(false);
  const [guardando, iniciar] = useTransition();

  /**
   * El error de UN campo, listo para esparcir sobre `Campo`.
   *
   * Devuelve `{}` en vez de `{ error: undefined }` porque con
   * `exactOptionalPropertyTypes` **no son lo mismo**: pasar la clave con
   * `undefined` no es lo mismo que no pasarla, y `Comunes` la declara opcional
   * sin admitir `undefined`. Es la distinción que hace TypeScript aquí, y
   * saltársela con un `!` sería taparla.
   */
  const errorDeCampo = (campo: string): { error?: string } => {
    const motivo = error?.detalles?.find((detalle) => detalle.campo === campo)?.motivo;
    return motivo === undefined ? {} : { error: motivo };
  };

  const enviar = () => {
    iniciar(async () => {
      const respuesta = await cambiarPassword({ actual, nueva });

      if (!respuesta.ok) {
        setError(respuesta.error);
        setHecho(false);
        return;
      }

      // Los campos se vacían: una contraseña escrita en una pantalla que se
      // queda abierta es un problema en un ordenador compartido.
      setActual("");
      setNueva("");
      setError(null);
      setHecho(true);
    });
  };

  return (
    <form
      className="flex max-w-[420px] flex-col gap-[var(--e-3)]"
      onSubmit={(evento) => {
        evento.preventDefault();
        enviar();
      }}
    >
      {/* Un error de CAMPO se pinta debajo de su campo; el de arriba es para lo
       * que no pertenece a ninguno —el límite, el conflicto—. Enseñar los dos
       * diría dos veces lo mismo. */}
      {error !== null && error.detalles === undefined && <MensajeDeFallo fallo={error} />}

      {hecho && (
        <p role="status" className="font-mono text-mono text-[var(--gold-300)]">
          Contraseña cambiada. Las sesiones de otros dispositivos se han cerrado.
        </p>
      )}

      <Campo
        {...errorDeCampo("actual")}
        etiqueta="Contraseña actual"
        type="password"
        autoComplete="current-password"
        value={actual}
        onChange={(evento) => {
          setActual(evento.target.value);
        }}
      />

      <div className="flex flex-col gap-[var(--e-1)]">
        <Campo
          {...errorDeCampo("nueva")}
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(evento) => {
            setNueva(evento.target.value);
          }}
          ayuda="Mínimo 12 caracteres. Una frase larga es más segura que un críptico corto."
        />

        <MedidorPassword password={nueva} />
      </div>

      <div className="flex flex-col gap-[var(--e-1)]">
        <Boton
          type="submit"
          variante="primario"
          disabled={actual === "" || nueva === "" || guardando}
          cargando={guardando}
        >
          Cambiar la contraseña
        </Boton>

        {/* Antes de pulsar, no después. */}
        <p className="font-ui text-ui-xs text-[var(--ash-400)]">
          Al cambiarla se cerrará tu sesión en los demás dispositivos. En éste sigues dentro.
        </p>
      </div>
    </form>
  );
}
