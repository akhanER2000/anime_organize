"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { Casilla } from "@/components/ui/casilla";
import { Enlace } from "@/components/ui/enlace";
import { cn } from "@/lib/ui/cn";
import { EsquemaLogin } from "@/lib/validation/auth";

import { iniciarSesion } from "./acciones";

import type { RespuestaLogin } from "./flujo";
import type { z } from "zod";

/**
 * FORMULARIO DE «INICIAR SESIÓN» — artboard 07, card izquierda.
 *
 * Es lo ÚNICO de la pantalla que necesita ser cliente: hay estado (mostrar u
 * ocultar la contraseña), validación en vivo y un envío que no recarga. El
 * resto de la card —título, subtítulo, pie— se queda en el servidor, que es lo
 * que pide `code-style.md`: el `"use client"` lo más abajo posible del árbol.
 *
 * ── EL MISMO ESQUEMA EN LOS DOS LADOS ──────────────────────────────────────
 * `EsquemaLogin` se usa aquí **por UX** y otra vez en la Server Action **por
 * seguridad**. No son dos validaciones distintas: es una, escrita una vez en
 * `@/lib/validation/auth`. El servidor no se fía de esta (`security.md` §8).
 */

/**
 * ENTRADA vs SALIDA del esquema, y no es un detalle.
 *
 * `recordarme` lleva `.default(false)`, así que en la ENTRADA es opcional y en
 * la SALIDA no. `zodResolver` devuelve `Resolver<input, ctx, output>`: si se
 * tipara el formulario con un solo tipo, o el resolver no encaja o
 * `handleSubmit` recibe un `recordarme` que TypeScript cree opcional y en
 * realidad nunca lo es.
 */
type EntradaFormulario = z.input<typeof EsquemaLogin>;
type SalidaFormulario = z.output<typeof EsquemaLogin>;

export function FormularioLogin() {
  /** Mensaje que devuelve el servidor. No es de ningún campo: es del formulario. */
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);
  const [contrasenaVisible, setContrasenaVisible] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EntradaFormulario, unknown, SalidaFormulario>({
    resolver: zodResolver(EsquemaLogin),
    defaultValues: { email: "", password: "", recordarme: false },
  });

  const enviar = handleSubmit(async (datos) => {
    setErrorDelServidor(null);

    /**
     * `RespuestaLogin | undefined` A PROPÓSITO, aunque la acción prometa
     * devolver siempre un sobre: cuando el login va bien, la acción termina en
     * `redirect()` y lo que llega aquí es una navegación, no un valor. Leer
     * `.ok` de un `undefined` sería un error en pantalla justo en el camino
     * feliz.
     */
    let respuesta: RespuestaLogin | undefined;

    try {
      respuesta = await iniciarSesion(datos);
    } catch {
      // La red, no el servidor: el servidor devuelve sobres, no excepciones.
      setErrorDelServidor(
        "No hemos podido contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
      );
      return;
    }

    // Si fue bien, la Server Action ya ha lanzado la redirección a `/app`: no
    // hay nada que pintar aquí.
    if (respuesta === undefined || respuesta.ok) return;

    const { codigo, mensaje, detalles } = respuesta.error;

    // Un fallo de formato SÍ se puede señalar campo a campo: comprueba la forma
    // del texto, no si la cuenta existe, así que no enumera a nadie.
    if (codigo === "VALIDACION" && detalles !== undefined && detalles.length > 0) {
      for (const detalle of detalles) {
        setError(detalle.campo, { message: detalle.motivo });
      }
      return;
    }

    /**
     * El resto es un mensaje de FORMULARIO, nunca de campo.
     *
     * Marcar «Contraseña» en rojo sería decir «el correo está bien», que es
     * exactamente el oráculo que `security.md` §2 prohíbe. El texto sale de
     * `mensajeLoginFallido()` y es idéntico exista o no la cuenta.
     */
    setErrorDelServidor(mensaje);
  });

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-[var(--e-2)]">
      <Campo
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        autoCapitalize="none"
        {...(errors.email?.message !== undefined ? { error: errors.email.message } : {})}
        {...register("email")}
      />

      <Campo
        etiqueta="Contraseña"
        // El único efecto del conmutador: cambiar el `type`. Nada de duplicar
        // el input, que perdería el foco y el texto escrito al alternar.
        type={contrasenaVisible ? "text" : "password"}
        autoComplete="current-password"
        {...(errors.password?.message !== undefined ? { error: errors.password.message } : {})}
        adorno={
          <ConmutadorContrasena
            visible={contrasenaVisible}
            alPulsar={() => setContrasenaVisible((previo) => !previo)}
          />
        }
        {...register("password")}
      />

      {errorDelServidor !== null && <AvisoDelFormulario mensaje={errorDelServidor} />}

      <div className="flex items-center justify-between gap-[var(--e-2)]">
        <Casilla etiqueta="Recordarme" {...register("recordarme")} />
        <Enlace href="/recuperar" className="text-ui-s">
          ¿Olvidaste?
        </Enlace>
      </div>

      {/* EL ÚNICO BOTÓN DE RELLENO DORADO SÓLIDO DE LA PANTALLA (regla del oro
       * nº 3). Si algún día se añade otra acción a esta card, será `primario`. */}
      <Boton type="submit" variante="solido" ancho cargando={isSubmitting}>
        Entrar al Vault
      </Boton>
    </form>
  );
}

/**
 * El adorno «ver» del campo de contraseña.
 *
 * ── POR QUÉ EL TEXTO NO CAMBIA A «OCULTAR» ─────────────────────────────────
 * El hueco que `Campo` reserva para el adorno son 36 px (48 de `padding-right`
 * menos los 12 de separación). «ocultar» a 13 px mide ~45 px y se comería las
 * últimas letras de lo escrito. El artboard pone «ver» y ahí se queda; el
 * estado lo llevan `aria-pressed` —que un lector anuncia como «pulsado»— y el
 * nombre accesible, que sí cambia. Lo que ve el usuario vidente es el propio
 * campo: puntos o texto.
 */
function ConmutadorContrasena({ visible, alPulsar }: { visible: boolean; alPulsar: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={visible}
      onClick={alPulsar}
      className={cn(
        "grid min-h-[var(--e-4)] place-items-center rounded-boton px-[var(--e-05)]",
        // Sobre `--slate-800` —el fondo del input— `--ash-400` se queda en
        // 4.17:1. El mínimo real ahí es `--porcelain-200` (design-tokens.md).
        "font-ui text-ui-s text-[var(--porcelain-200)]",
        "transition-colors duration-[var(--dur-rapida)] ease-base",
        "hover:text-[var(--porcelain-100)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]",
      )}
    >
      <span aria-hidden="true">ver</span>
      <span className="sr-only">{visible ? "Ocultar la contraseña" : "Mostrar la contraseña"}</span>
    </button>
  );
}

/**
 * Aviso a nivel de formulario, con la misma forma que el error de campo del
 * artboard: mono 12 px, `--estado-abandonado-texto`, icono `⚠` (DESIGN-SPEC §07).
 *
 * `role="alert"` lo anuncia en cuanto aparece, sin esperar a que el foco pase
 * por él. Es la misma decisión que toma `Campo` para su error.
 */
function AvisoDelFormulario({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-[var(--e-05)] font-mono text-mono leading-ui text-[var(--estado-abandonado-texto)]"
    >
      <span aria-hidden="true">⚠</span>
      {mensaje}
    </p>
  );
}
