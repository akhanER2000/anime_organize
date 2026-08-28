"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MensajeError } from "@/components/ui/mensaje-error";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { Enlace } from "@/components/ui/enlace";
import { MedidorPassword } from "@/components/ui/medidor-password";
import { EsquemaNuevaPassword } from "@/lib/validation/auth";

import { establecerPassword } from "./acciones";

import type { EstadoNuevaPassword } from "./acciones";
import type { z } from "zod";

type Datos = z.infer<typeof EsquemaNuevaPassword>;

/**
 * El mínimo sale del ESQUEMA, no de un número escrito a mano.
 *
 * Es la misma decisión que en `/registro`: si mañana el mínimo sube a 14, el
 * texto sube con él. Un placeholder que dice 12 mientras el servidor exige 14 es
 * una pantalla que miente a quien intenta usarla.
 */
function minimoDeCaracteres(): number {
  const campo = EsquemaNuevaPassword.shape.password;
  const min = campo.minLength;
  if (min === null) {
    throw new Error("EsquemaNuevaPassword perdió su `.min()`: el texto de ayuda mentiría.");
  }
  return min;
}

export function FormularioNuevaPassword({ token }: { token: string }) {
  const [estado, setEstado] = useState<EstadoNuevaPassword>({ estado: "INICIAL" });
  const [enviando, iniciarEnvio] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Datos>({
    resolver: zodResolver(EsquemaNuevaPassword),
    defaultValues: { token, password: "" },
  });

  const password = watch("password");

  if (estado.estado === "OK") {
    return (
      <div className="flex flex-col gap-[var(--e-2)]">
        <p
          role="status"
          className="border-l-2 border-[var(--gold-400)] bg-[var(--gold-wash)] py-[var(--e-1-5)] pl-[var(--e-1-5)] font-ui text-ui-s text-[var(--porcelain-100)]"
        >
          {estado.mensaje}
        </p>
        <Enlace href="/login">Entrar con la contraseña nueva</Enlace>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void handleSubmit((datos) => {
          iniciarEnvio(() => {
            void establecerPassword(datos).then(setEstado);
          });
        })(e);
      }}
      className="flex flex-col gap-[var(--e-2)]"
    >
      {/* El token no se enseña: va oculto. Pintarlo lo dejaría en capturas de
       * pantalla y en el historial del portapapeles sin ninguna ventaja. */}
      <input {...register("token")} type="hidden" />

      <div className="flex flex-col gap-[var(--e-1)]">
        <Campo
          {...(errors.password?.message !== undefined ? { error: errors.password.message } : {})}
          {...register("password")}
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          autoFocus
          placeholder={`Mínimo ${String(minimoDeCaracteres())} caracteres`}
          ayuda="Una frase larga es más segura que un críptico corto."
        />
        <MedidorPassword password={password} />
      </div>

      {/* Un enlace inválido, caducado o ya usado responde lo mismo, y ese
       * mensaje se anuncia con `role="alert"` porque aparece tras enviar. */}
      {(estado.estado === "ENLACE_INVALIDO" ||
        estado.estado === "LIMITE_EXCEDIDO" ||
        estado.estado === "VALIDACION") && <MensajeError>{estado.mensaje}</MensajeError>}

      <Boton type="submit" variante="solido" ancho cargando={enviando}>
        Guardar y entrar
      </Boton>
    </form>
  );
}
