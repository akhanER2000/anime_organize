"use server";

import "server-only";

import { headers } from "next/headers";

import { MENSAJES, mensajeRegistroHecho } from "@/lib/auth/mensajes";
import { consumirTiempoEquivalente, hashearPassword } from "@/lib/auth/password";
import { seExigeVerificacionEmail } from "@/lib/config/entorno";
import {
  buscarCuentaPorEmail,
  crearCuenta as crearCuentaEnLaBase,
  señueloDeAlta,
} from "@/lib/db/cuentas";
import { clavePorIp, ipDelCliente, registrarIntentos } from "@/lib/rate-limit";
import { EsquemaRegistro } from "@/lib/validation/auth";

import { procesarRegistro } from "./registro";

import type { EstadoRegistro, ResultadoRegistro, TipoCorreoRegistro } from "./registro";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SERVER ACTION DEL REGISTRO — no un Route Handler, y es una decisión.
 *
 * `security.md` §2 ter: **Next comprueba el origen de las Server Actions por su
 * cuenta** (compara `Origin` con `Host` y rechaza si no casan). Es protección
 * CSRF por defecto, sin código propio que se pueda olvidar. Un
 * `POST /api/registro` con una cookie de sesión se ejecuta venga de donde venga
 * y habría que acordarse de poner la guarda de `src/lib/api/csrf.ts` a mano.
 *
 * ── EL ORDEN OBLIGATORIO ──────────────────────────────────────────────────
 *      1. parsear con Zod          (barato: aritmética de strings)
 *      2. RATE LIMIT               (5 / hora / IP — security.md §5)
 *      3. y SOLO entonces la base o el hash
 *
 * Argon2id cuesta 19 MiB y decenas de ms **por diseño**. Comprobar el límite
 * después convertiría este endpoint en un amplificador de denegación de
 * servicio. El parseo va antes del límite porque hace falta el email ya
 * normalizado para construir la clave: `EsquemaEmail` recorta y pasa a
 * minúsculas, y sin eso `A@B.com` y `a@b.com` consumirían cubos distintos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** El nombre de la acción dentro de las claves del limitador. */
const ACCION = "registro";

export async function crearCuenta(datos: unknown): Promise<EstadoRegistro> {
  // ── 1. PARSEAR ─────────────────────────────────────────────────────────
  // El cliente ya validó con este mismo esquema, POR UX. Aquí se revalida POR
  // SEGURIDAD: lo que llega a una Server Action es lo que el navegador quiera
  // mandar (security.md §8).
  const parseado = EsquemaRegistro.safeParse(datos);

  if (!parseado.success) {
    return { estado: "VALIDACION", errores: erroresPorCampo(parseado.error.issues) };
  }

  // ── 2. RATE LIMIT ──────────────────────────────────────────────────────
  const veredicto = await comprobarLimite();

  if (!veredicto.permitido) {
    return {
      estado: "LIMITE_EXCEDIDO",
      reintentarEnSegundos: veredicto.reintentarEnSegundos,
    };
  }

  // ── 3. PERSISTENCIA ────────────────────────────────────────────────────
  //
  // ══════════════════════════════════════════════════════════════════════
  // AQUÍ SE PARÓ EL AGENTE QUE ESCRIBIÓ ESTA PANTALLA, Y HIZO BIEN.
  //
  // Crear el usuario significa insertar en `users`, y desde `src/app/**` eso
  // no se puede hacer: `eslint.config.mjs` veta `@/lib/db/schema` y
  // `@/lib/db/interno` fuera de la capa de datos —imports dinámicos incluidos,
  // que era la puerta de atrás obvia— y `vaultDe(ctx)` exige un
  // `ContextoUsuario` que en un registro **no puede existir todavía**: la
  // cuenta es justo lo que aún no hay.
  //
  // No buscó un rodeo: paró y lo reportó. Que el contrato detuviera a un agente
  // que trabajaba solo, sin nadie mirando, es la prueba de que el contrato vale
  // para algo.
  //
  // Lo que faltaba era la pieza, no el permiso. Está en
  // `src/lib/db/cuentas.ts`, dentro de la capa de datos, con sus 13 tests
  // contra Postgres real y cinco mutaciones verificadas.
  // ══════════════════════════════════════════════════════════════════════
  return traducir(
    await procesarRegistro(parseado.data, {
      // Ya se comprobó arriba: no se cuenta dos veces el mismo intento.
      comprobarLimite: async () => veredicto,
      buscarCuenta: async (email) => {
        const cuenta = await buscarCuentaPorEmail(email);
        return cuenta === null ? null : { verificada: cuenta.verificada };
      },
      crearUsuario: async (datos) => {
        const alta = await crearCuentaEnLaBase(datos);
        // `creada: false` significa que otra petición se adelantó con el mismo
        // correo. NO se convierte en un mensaje distinto: quien llama responde
        // lo mismo exista o no la cuenta (security.md §2). El `userId` vacío no
        // se usa en esa rama.
        return { userId: alta.creada ? alta.userId : "" };
      },
      hashearPassword,
      // ── EL SEÑUELO PAGA TAMBIÉN LA ESCRITURA ──────────────────────────
      // La rama que CREA la cuenta hace hash + `INSERT`; las ramas «ese correo
      // ya existe» hacían solo el hash señuelo. Medido por el auditor contra la
      // app arrancada: correo nuevo 611 ms, correo existente 464 ms. **147 ms
      // de diferencia reproducible**, y en dirección inversa a la intuición: la
      // respuesta RÁPIDA significaba «ya registrado».
      //
      // El texto es idéntico en las dos ramas, así que el reloj era el único
      // canal — y bastaba.
      consumirTiempoEquivalente: async () => {
        await consumirTiempoEquivalente();
        await señueloDeAlta();
      },
      enviarCorreo,
      seExigeVerificacion: seExigeVerificacionEmail,
    }),
  );
}

/**
 * Traduce el resultado del flujo puro al estado que pinta la pantalla.
 *
 * El mensaje se pide a `mensajeRegistroHecho(bandera)` en vez de usar el que
 * trae el resultado: con la verificación apagada —el valor por defecto— no se
 * manda ningún correo, y prometer uno manda a la persona a vigilar una bandeja
 * donde no va a llegar nada.
 */
function traducir(resultado: ResultadoRegistro): EstadoRegistro {
  if (resultado.estado !== "OK") return resultado;

  return {
    ...resultado,
    mensaje:
      resultado.mensaje === MENSAJES.correoNoEnviado
        ? MENSAJES.correoNoEnviado
        : mensajeRegistroHecho(seExigeVerificacionEmail()),
  };
}

/**
 * Manda el correo que toque. **Nunca lanza**: que un correo no salga no puede
 * tumbar un registro que ya está hecho.
 *
 * ── LO QUE FALTA, DICHO SIN ADORNOS ────────────────────────────────────────
 * Con `AUTH_REQUIRE_EMAIL_VERIFICATION` **apagada** —el valor por defecto— no
 * hay nada que enviar: la cuenta ya sirve para entrar. Se devuelve `true`
 * porque no ha fallado nada, y el mensaje que ve la persona no promete ningún
 * correo (ver `traducir`).
 *
 * Con la bandera ENCENDIDA hace falta emitir un token de verificación en
 * `verification_tokens` y mandarlo con `plantillaVerificacion`. Esa pieza NO
 * está construida, así que se devuelve `false` y la persona ve «no hemos podido
 * enviar el correo», que es la verdad. No se devuelve `true` para que la
 * pantalla quede bonita: eso dejaría a alguien esperando un correo que nadie ha
 * mandado.
 *
 * TODO(registro): emitir el token de verificación en `src/lib/db/cuentas.ts`
 * —junto a `emitirEnlaceDeReset`, que ya hace exactamente esto para el reset— y
 * enviarlo aquí con `plantillaVerificacion`.
 */
async function enviarCorreo(_destino: {
  email: string;
  tipo: TipoCorreoRegistro;
}): Promise<boolean> {
  if (!seExigeVerificacionEmail()) return true;

  console.error(
    "[registro] AUTH_REQUIRE_EMAIL_VERIFICATION está encendida pero la emisión " +
      "del token de verificación no está construida. Ver el TODO(registro) en acciones.ts.",
  );
  return false;
}

/**
 * Aplica el límite de `security.md` §5: **5 / hora, por IP**.
 *
 * Solo por IP, y no también por email: la tabla `LIMITES` no define
 * `registro:email` y no es un olvido. Limitar el registro por dirección de
 * correo permitiría a un atacante **impedir que alguien se registre** gastándole
 * el cubo, y de paso convertiría el limitador en un detector de direcciones que
 * alguien está intentando registrar.
 */
async function comprobarLimite(): Promise<{ permitido: boolean; reintentarEnSegundos: number }> {
  const ip = ipDelCliente(await headers());

  if (ip === null) {
    // Sin cabecera de IP la clave no se aplica, tal como fija `security.md` §5:
    // «no se inventa un cubo "desconocido" compartido», porque todos los
    // clientes sin cabecera se bloquearían entre sí. En Vercel la cabecera
    // siempre llega y la pone la plataforma.
    console.warn(
      "[registro] Petición sin cabecera de IP: el límite por IP no se aplica. " +
        "Esperable en desarrollo local; en Vercel no debería ocurrir.",
    );
    return { permitido: true, reintentarEnSegundos: 0 };
  }

  const veredicto = await registrarIntentos([
    { nombre: "registro:ip", clave: clavePorIp(ACCION, ip) },
  ]);

  return {
    permitido: veredicto.permitido,
    reintentarEnSegundos: veredicto.reintentarEnSegundos,
  };
}

/**
 * Aplana los problemas de Zod a `{ campo: mensaje }`.
 *
 * Solo el PRIMER mensaje por campo: el formulario pinta uno bajo cada input, y
 * apilar tres bajo el mismo campo empuja el resto de la card hacia abajo cada
 * vez que alguien teclea.
 *
 * Nunca sale de aquí nada que no sea el mensaje del propio esquema: ni un stack,
 * ni el valor recibido —que es la contraseña en claro— ni la ruta interna.
 */
function erroresPorCampo(
  problemas: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): Record<string, string> {
  const errores: Record<string, string> = {};

  for (const problema of problemas) {
    const campo = problema.path[0];
    if (typeof campo !== "string" || campo in errores) continue;
    errores[campo] = problema.message;
  }

  return errores;
}
