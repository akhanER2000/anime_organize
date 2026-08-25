"use server";

import "server-only";

import { headers } from "next/headers";

import { MENSAJES } from "@/lib/auth/mensajes";
import { hashearPassword } from "@/lib/auth/password";
import { consumirTokenDeReset } from "@/lib/db/cuentas";
import { clavePorIp, ipDelCliente, registrarIntentos } from "@/lib/rate-limit";
import { EsquemaNuevaPassword } from "@/lib/validation/auth";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ELEGIR CONTRASEÑA NUEVA — el destino del enlace del correo.
 *
 * ── ESTA RUTA NO EXISTÍA ───────────────────────────────────────────────────
 * `src/lib/email/plantillas.ts` genera desde hace tiempo un enlace a
 * `/recuperar/nueva?token=…`, y esa ruta **devolvía 404**. Todo el flujo de
 * recuperación estaba construido y verificado —token, hash, un solo uso,
 * caducidad, revocación de sesiones— y terminaba en una página que no existía.
 * Lo comprobó un agente refutador pidiendo la URL contra el servidor arrancado.
 *
 * Es el mismo patrón que este proyecto lleva persiguiendo todo el día: cada
 * pieza correcta, y la cadena rota por el eslabón que nadie recorrió entero.
 *
 * ── SERVER ACTION, NO ROUTE HANDLER ────────────────────────────────────────
 * `security.md` §2 ter: Next comprueba el origen de las Server Actions por su
 * cuenta. Un `POST /api/recuperar/nueva` se ejecutaría venga de donde viniera.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type EstadoNuevaPassword =
  | { estado: "INICIAL" }
  | { estado: "OK"; mensaje: string }
  | { estado: "VALIDACION"; mensaje: string }
  | { estado: "ENLACE_INVALIDO"; mensaje: string }
  | { estado: "LIMITE_EXCEDIDO"; mensaje: string };

export async function establecerPassword(datos: unknown): Promise<EstadoNuevaPassword> {
  // ── 1. PARSEAR ───────────────────────────────────────────────────────────
  const parseado = EsquemaNuevaPassword.safeParse(datos);
  if (!parseado.success) {
    return {
      estado: "VALIDACION",
      mensaje: parseado.error.issues[0]?.message ?? "Revisa la contraseña.",
    };
  }

  // ── 2. RATE LIMIT, ANTES DE HASHEAR Y ANTES DE TOCAR LA BASE ─────────────
  // Argon2id cuesta 19 MiB. Sin límite, este endpoint sería un amplificador de
  // denegación de servicio para cualquiera con un token inventado. Y también
  // frena la fuerza bruta contra el propio token: son 32 bytes aleatorios, así
  // que adivinarlo es inviable, pero el límite no cuesta nada y cierra el tema.
  const ip = ipDelCliente(await headers());
  if (ip !== null) {
    const veredicto = await registrarIntentos([
      { nombre: "recuperar:ip", clave: clavePorIp("recuperar-nueva", ip) },
    ]);
    if (!veredicto.permitido) {
      return { estado: "LIMITE_EXCEDIDO", mensaje: MENSAJES.limiteExcedido };
    }
  }

  // ── 3. CONSUMIR ──────────────────────────────────────────────────────────
  // Una sola sentencia atómica: marca el token como usado, cambia la contraseña
  // y **echa a todas las sesiones abiertas**. Ver `consumirTokenDeReset`.
  const resultado = await consumirTokenDeReset({
    token: parseado.data.token,
    passwordHash: await hashearPassword(parseado.data.password),
  });

  if (!resultado.valido) {
    // Inválido, caducado y ya usado responden EXACTAMENTE igual: distinguirlos
    // le diría a quien prueba tokens cuáles existieron alguna vez.
    return { estado: "ENLACE_INVALIDO", mensaje: MENSAJES.recuperarEnlaceInvalido };
  }

  return { estado: "OK", mensaje: MENSAJES.recuperarHecho };
}
