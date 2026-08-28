"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MensajeError } from "@/components/ui/mensaje-error";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { MedidorPassword } from "@/components/ui/medidor-password";
import { EsquemaRegistro } from "@/lib/validation/auth";

import { crearCuenta } from "./acciones";
import {
  AYUDA_PASSWORD,
  PLACEHOLDER_NOMBRE,
  PLACEHOLDER_PASSWORD,
  mensajeLimiteExcedido,
} from "./registro";

import type { EstadoRegistro } from "./registro";
import type { z } from "zod";

/**
 * FORMULARIO DE «CREAR CUENTA» — artboard 07, card central.
 *
 * `"use client"` está justificado: hay estado de campo, validación en vivo y el
 * medidor de contraseña reacciona a cada pulsación. La card que lo envuelve
 * (`page.tsx`) sigue siendo un Server Component, que es lo que pide
 * `code-style.md`: el `"use client"` va lo más abajo posible del árbol.
 *
 * ── UN SOLO ESQUEMA, DOS LADOS ────────────────────────────────────────────
 * `EsquemaRegistro` es el mismo objeto Zod que revalida la Server Action. El
 * cliente lo usa **por UX** —para no hacer viajar un formulario que ya se sabe
 * inválido— y el servidor **por seguridad**, sin fiarse de nada de lo que llegue.
 */

/**
 * Los dos lados del esquema, y no son el mismo tipo.
 *
 * `EsquemaNombre` termina en `.optional().transform(...)`, así que lo que ENTRA
 * es `string | undefined` y lo que SALE es `string | null`. React Hook Form
 * modela justo eso con sus tres genéricos: los campos del formulario tienen la
 * forma de la ENTRADA y el resolver entrega la SALIDA ya transformada.
 * Confundirlos hace que `defaultValues: { nombre: "" }` no compile.
 */
type EntradaRegistro = z.input<typeof EsquemaRegistro>;
type SalidaRegistro = z.output<typeof EsquemaRegistro>;

const ESTADO_INICIAL: EstadoRegistro = { estado: "INICIAL" };

/**
 * `exactOptionalPropertyTypes: true` prohíbe pasar `error={undefined}` a una
 * prop declarada `error?: string`. Esparcir el objeto es la forma que usa el
 * resto del repo (`...(entorno !== undefined ? { entorno } : {})`).
 */
function propsError(mensaje: string | undefined): { error?: string } {
  return mensaje === undefined ? {} : { error: mensaje };
}

export function FormularioRegistro() {
  const [estado, setEstado] = useState<EstadoRegistro>(ESTADO_INICIAL);
  const [enviando, iniciarEnvio] = useTransition();

  const { register, handleSubmit, watch, formState } = useForm<
    EntradaRegistro,
    unknown,
    SalidaRegistro
  >({
    resolver: zodResolver(EsquemaRegistro),
    // `onTouched`: no se regaña a nadie mientras teclea la primera vez, pero en
    // cuanto un campo se ha visitado y corregido, la corrección se ve al vuelo.
    mode: "onTouched",
    defaultValues: { nombre: "", email: "", password: "" },
  });

  // El medidor necesita el valor VIVO, no el del último blur: los cuatro
  // segmentos del artboard se llenan mientras se escribe o no sirven de nada.
  const password = watch("password") ?? "";

  const erroresServidor = estado.estado === "VALIDACION" ? estado.errores : {};

  /** El del cliente manda; el del servidor rellena lo que el cliente no vio. */
  const errorDe = (campo: keyof EntradaRegistro): string | undefined =>
    formState.errors[campo]?.message ?? erroresServidor[campo];

  const alEnviar = (datos: SalidaRegistro) => {
    iniciarEnvio(async () => {
      setEstado(await crearCuenta(datos));
    });
  };

  // Aceptado: el formulario desaparece. Dejarlo en pantalla invita a reenviar,
  // y cada reenvío gasta uno de los cinco intentos por hora de esa IP.
  if (estado.estado === "OK") {
    return (
      <p role="status" className="font-ui text-cuerpo-s leading-cuerpo text-[var(--porcelain-200)]">
        {estado.mensaje}
      </p>
    );
  }

  return (
    <form
      // `noValidate`: la validación es la de Zod. Sin esto el navegador pinta
      // además su propio globo, con su propio texto y en el idioma del sistema.
      noValidate
      onSubmit={handleSubmit(alEnviar)}
      className="flex flex-col gap-[var(--e-2)]"
    >
      <Campo
        {...propsError(errorDe("nombre"))}
        {...register("nombre")}
        etiqueta="Nombre"
        placeholder={PLACEHOLDER_NOMBRE}
        autoComplete="name"
      />

      <Campo
        {...propsError(errorDe("email"))}
        {...register("email")}
        etiqueta="Correo"
        type="email"
        // `inputMode="email"` saca el teclado con @ en móvil; `autoComplete`
        // deja que el gestor de contraseñas rellene y, sobre todo, que GUARDE.
        inputMode="email"
        autoComplete="email"
      />

      <div className="flex flex-col gap-[var(--e-1)]">
        <Campo
          {...propsError(errorDe("password"))}
          {...register("password")}
          etiqueta="Contraseña"
          type="password"
          placeholder={PLACEHOLDER_PASSWORD}
          ayuda={AYUDA_PASSWORD}
          // `new-password` es lo que hace que el navegador OFREZCA generar una
          // y no rellene la del login. Con `current-password` haría lo contrario.
          autoComplete="new-password"
        />

        {/* Los cuatro segmentos de 2 px del artboard. El cálculo es puro y vive
         * en `@/lib/ui/fortaleza-password`; aquí solo se le pasa el valor.
         *
         * NO se conecta con `aria-describedby` al input: `Campo` ya construye
         * el suyo con el error y la ayuda, y pasarle otro lo SOBRESCRIBIRÍA,
         * desconectando el mensaje de error. El medidor se anuncia solo, con
         * su propio `role="status"`. */}
        <MedidorPassword password={password} />
      </div>

      {/* ── EL BOTÓN ES `primario`, NO `solido` ────────────────────────────
       * Regla del oro nº 3: **un solo botón de relleno dorado por pantalla**.
       * En el artboard 07 ese botón es «Entrar al Vault», de la card de login.
       * Este es obsidiana con borde dorado, tal como lo pinta el PNG. */}
      <Boton type="submit" variante="primario" tamano="m" ancho cargando={enviando}>
        Crear mi vault
      </Boton>

      {(estado.estado === "ERROR" || estado.estado === "LIMITE_EXCEDIDO") && (
        <MensajeError>
          {estado.estado === "LIMITE_EXCEDIDO"
            ? mensajeLimiteExcedido(estado.reintentarEnSegundos)
            : estado.mensaje}
        </MensajeError>
      )}
    </form>
  );
}
