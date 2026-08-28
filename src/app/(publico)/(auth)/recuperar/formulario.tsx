"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FOCO_DORADO } from "@/lib/ui/clases";
import { MensajeError } from "@/components/ui/mensaje-error";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { Boton } from "@/components/ui/boton";
import { Campo } from "@/components/ui/campo";
import { cn } from "@/lib/ui/cn";
import { EsquemaRecuperar } from "@/lib/validation/auth";

import { solicitarEnlaceDeRecuperacion } from "./acciones";
import { SEGUNDOS_ANTES_DE_REENVIAR } from "./constantes";
import { etiquetaReenvio, puedeReenviar, segundosRestantes } from "./cuenta-atras";

import type { z } from "zod";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORMULARIO DE «RECUPERAR ACCESO» — artboard 07, card derecha.
 *
 * ── TIENE DOS ESTADOS Y EL PNG SOLO ENSEÑA EL SEGUNDO ─────────────────────
 *   (a) PEDIR    — el campo CORREO y el botón de envío.
 *   (b) ENVIADO  — el aviso «✓ Enlace enviado», la cuenta atrás del reenvío y
 *                  el botón bloqueado mientras corre.
 * El artboard está rotulado «estado 03 · correo enviado»: es (b). El (a) es el
 * que ve todo el mundo al llegar, así que existe igualmente.
 *
 * ── EL ESTADO (b) SE ENSEÑA EXISTA O NO LA CUENTA ─────────────────────────
 * Es lo que impide que este formulario se convierta en un buscador de
 * direcciones registradas: se escriben mil correos, se miran mil respuestas y
 * se sabe cuáles tienen cuenta. Aquí no hay nada que mirar — la respuesta del
 * servidor es la misma, byte a byte, y lo garantiza `flujo.ts` con un test
 * (`security.md` §2).
 *
 * Por eso NO existe «ese correo no está registrado», ni un error de campo que
 * lo insinúe, ni un tiempo de respuesta distinto.
 *
 * ── EL MISMO ESQUEMA EN LOS DOS LADOS ─────────────────────────────────────
 * `EsquemaRecuperar` se usa aquí **por UX** y otra vez en la Server Action
 * **por seguridad**. No son dos validaciones: es una, escrita una vez en
 * `@/lib/validation/auth`. El servidor no se fía de esta (`security.md` §8).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ENTRADA vs SALIDA del esquema.
 *
 * `EsquemaEmail` lleva `.trim().toLowerCase()`, así que Zod TRANSFORMA: lo que
 * escribe el usuario y lo que sale del resolver no son el mismo valor.
 * `zodResolver` devuelve `Resolver<input, ctx, output>`; con un solo tipo, o no
 * encaja el resolver o `handleSubmit` recibe un tipo que miente.
 */
type EntradaFormulario = z.input<typeof EsquemaRecuperar>;
type SalidaFormulario = z.output<typeof EsquemaRecuperar>;

/** Lo que hay que recordar del envío para poder pintar (b) y reenviar. */
type EstadoEnviado = {
  /** El correo YA normalizado por Zod: es el que se reenvía. */
  correo: string;
  /** El texto canónico que devolvió el servidor. */
  mensaje: string;
  /** Sale de la constante compartida, nunca de un número escrito en la vista. */
  minutos: number;
};

export function FormularioRecuperar() {
  const [enviado, setEnviado] = useState<EstadoEnviado | null>(null);
  const [errorDelServidor, setErrorDelServidor] = useState<string | null>(null);

  /**
   * LA CUENTA ATRÁS SE GUARDA COMO UN INSTANTE DE FIN, NO COMO UN CONTADOR.
   *
   * Con un contador que baja de uno en uno, cualquier pestaña dormida, cualquier
   * `setInterval` estrangulado por el navegador en segundo plano y cualquier
   * cambio de pestaña dejan el número desfasado para siempre. Con un instante
   * de fin, cada tic recalcula desde el reloj y el desfase se corrige solo.
   *
   * Empieza en `null` a propósito: calcular `Date.now()` durante el primer
   * render rompería la hidratación (servidor y cliente darían valores
   * distintos). El instante se fija cuando llega la respuesta, ya en el cliente.
   */
  const [finReenvio, setFinReenvio] = useState<number | null>(null);
  const [restantes, setRestantes] = useState(SEGUNDOS_ANTES_DE_REENVIAR);
  const [reenviando, setReenviando] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EntradaFormulario, unknown, SalidaFormulario>({
    resolver: zodResolver(EsquemaRecuperar),
    defaultValues: { email: "" },
  });

  const pedirEnlace = useCallback(
    async (datos: SalidaFormulario) => {
      setErrorDelServidor(null);

      const respuesta = await solicitarEnlaceDeRecuperacion(datos);

      if (!respuesta.ok) {
        const { codigo, mensaje, detalles } = respuesta.error;

        // Un fallo de FORMATO sí se señala en el campo: comprueba la forma del
        // texto, no si la cuenta existe, así que no enumera a nadie.
        if (codigo === "VALIDACION" && detalles !== undefined && detalles.length > 0) {
          for (const detalle of detalles) {
            setError(detalle.campo, { message: detalle.motivo });
          }
          return;
        }

        // El resto —límite excedido, error interno— es un mensaje de
        // FORMULARIO, nunca de campo: no habla del correo escrito.
        setErrorDelServidor(mensaje);
        return;
      }

      setEnviado({
        correo: datos.email,
        mensaje: respuesta.data.mensaje,
        minutos: respuesta.data.minutosCaducidad,
      });
      setFinReenvio(Date.now() + respuesta.data.segundosHastaReenvio * 1000);
      setRestantes(respuesta.data.segundosHastaReenvio);
    },
    [setError],
  );

  const reenviar = useCallback(async () => {
    if (enviado === null || reenviando) return;

    setReenviando(true);
    try {
      // Mismo camino que el primer envío: vuelve a pasar por Zod y por el rate
      // limit del servidor. La cuenta atrás del cliente no sustituye a nada.
      await pedirEnlace({ email: enviado.correo });
    } finally {
      setReenviando(false);
    }
  }, [enviado, pedirEnlace, reenviando]);

  // ── EL TIC DE LA CUENTA ATRÁS ────────────────────────────────────────────
  useEffect(() => {
    if (finReenvio === null) return;

    setRestantes(segundosRestantes(finReenvio, Date.now()));

    const id = setInterval(() => {
      const quedan = segundosRestantes(finReenvio, Date.now());
      setRestantes(quedan);
      // Al llegar a cero no queda nada que contar: el temporizador se apaga en
      // vez de seguir despertando el hilo cada segundo para nada.
      if (quedan <= 0) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [finReenvio]);

  if (enviado !== null) {
    return (
      <div className="flex flex-col gap-[var(--e-2)]">
        <AvisoEnviado minutos={enviado.minutos} mensajeCanonico={enviado.mensaje} />

        {errorDelServidor !== null && <MensajeError>{errorDelServidor}</MensajeError>}

        {/* NO es `solido`: el único botón de relleno dorado de esta pantalla es
         * «Entrar al Vault», en la card de login (regla del oro nº 3).
         *
         * Deshabilitado mientras corre la cuenta atrás, y su etiqueta dice por
         * qué — que es también su nombre accesible: un lector de pantalla lee
         * «Reenviar en 0:42, no disponible» y se entiende. */}
        <Boton
          type="button"
          ancho
          disabled={!puedeReenviar(restantes)}
          cargando={reenviando}
          onClick={() => void reenviar()}
        >
          {etiquetaReenvio(restantes)}
        </Boton>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(pedirEnlace)}
      noValidate
      className="flex flex-col gap-[var(--e-2)]"
    >
      <Campo
        {...(errors.email?.message !== undefined ? { error: errors.email.message } : {})}
        {...register("email")}
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        inputMode="email"
        spellCheck={false}
        autoCapitalize="none"
      />

      {errorDelServidor !== null && <MensajeError>{errorDelServidor}</MensajeError>}

      <Boton type="submit" ancho cargando={isSubmitting}>
        Enviar el enlace
      </Boton>
    </form>
  );
}

/**
 * EL AVISO DE ÉXITO — artboard 07: borde izquierdo de 2 px, `✓`, titular y una
 * línea en mono debajo.
 *
 * Es la misma forma que el sistema ya usa para los avisos con borde izquierdo
 * (DESIGN-SPEC §6, filas «Toast» y «Modal»): éxito = `--gold-400`. No se usa la
 * primitiva `Toast` porque un toast es flotante, se cierra solo y lleva un solo
 * texto; esto es contenido fijo de la card con titular y cuerpo.
 *
 * ── POR QUÉ EL NÚMERO DE MINUTOS ENTRA POR PROP ───────────────────────────
 * Porque sale de la MISMA constante que usará el `expires_at` del token
 * (`constantes.ts` → `CADUCIDAD_ENLACE_MS`). Escrito a mano aquí, el día que
 * alguien cambie la caducidad del token la pantalla mentiría — y mentiría en la
 * dirección peor: el usuario creería que le queda una hora cuando el enlace ya
 * murió.
 */
function AvisoEnviado({ minutos, mensajeCanonico }: { minutos: number; mensajeCanonico: string }) {
  const contenedor = useRef<HTMLDivElement | null>(null);

  /**
   * El foco se mueve al aviso porque el botón que el usuario acababa de pulsar
   * ha dejado de existir: sin esto, el foco cae al `<body>` y quien navega con
   * teclado pierde el sitio. `role="status"` ya lo anuncia; esto además lo deja
   * donde puede seguir tabulando (`DESIGN-SPEC` §7).
   */
  useEffect(() => {
    contenedor.current?.focus();
  }, []);

  return (
    <div
      ref={contenedor}
      role="status"
      tabIndex={-1}
      className={cn(
        "flex items-start gap-[var(--e-1)] rounded-card",
        "border border-[var(--slate-700)] border-l-2 border-l-[var(--gold-400)]",
        "bg-[var(--slate-850)] px-[var(--e-2)] py-[var(--e-1-5)]",
        FOCO_DORADO,
      )}
    >
      <span aria-hidden="true" className="font-ui text-ui text-[var(--gold-400)]">
        ✓
      </span>

      <div className="flex flex-col gap-[var(--e-05)]">
        {/* El artboard pinta el titular del aviso en --gold-200. */}
        <p className="font-ui text-ui font-[var(--fw-ui-medium)] leading-ui text-[var(--gold-200)]">
          Enlace enviado
        </p>

        <p className="font-mono text-mono leading-ui text-[var(--ash-400)]">
          Caduca en {minutos} minutos. Revisa spam si no aparece.
        </p>

        {/* EL TEXTO CANÓNICO DE `MENSAJES.recuperarEnviado`, SOLO PARA LECTORES.
         *
         * Lo visible es la copia aprobada del artboard, que es deliberadamente
         * corta. Pero la frase que de verdad no confirma que la cuenta exista
         * —«Si esa dirección tiene una cuenta…»— es la de `mensajes.ts`, y es
         * la que devuelve el servidor. Va aquí para que llegue íntegra a quien
         * usa un lector de pantalla, sin romper la card del diseño.
         *
         * Anotado en SUPUESTOS.md: si se prefiere enseñarla a todo el mundo,
         * es quitar `sr-only`. */}
        <p className="sr-only">{mensajeCanonico}</p>
      </div>
    </div>
  );
}
