"use server";

import { headers } from "next/headers";

import { consumirTiempoEquivalente } from "@/lib/auth/password";
import { clavePorEmail, clavePorIp, ipDelCliente, registrarIntentos } from "@/lib/rate-limit";

import { MENSAJE_ERROR_INTERNO, SEGUNDOS_ESPERA_POR_DEFECTO } from "./constantes";
import { emitirEnlaceDeRecuperacion } from "./emision";
import { ejecutarRecuperacion } from "./flujo";

import type { RespuestaRecuperar } from "./flujo";
import type { NombreLimite } from "@/lib/rate-limit";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SERVER ACTION, NO ROUTE HANDLER. Y eso ES la defensa CSRF.
 *
 * Next **comprueba el origen de las Server Actions por su cuenta** (compara
 * `Origin` con `Host` y rechaza si no casan). Es protección por defecto, sin
 * código propio que se pueda olvidar en la ruta número doce. Un
 * `POST /api/recuperar` no tiene nada de eso: se ejecuta venga de donde venga.
 * Ver `.claude/rules/security.md` §2 ter y `api-conventions.md`.
 *
 * En esta pantalla concreta importa menos que en las que mutan una cuenta con
 * sesión —aquí no hay cookie que aprovechar—, pero la regla es la regla, y sin
 * ella cualquier página del mundo podría disparar correos a nombre del sitio.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Las dos claves del limitador para esta acción.
 *
 * `security.md` §5 fija `POST /api/recuperar` en «3/hora, clave IP + email».
 * `src/lib/rate-limit/politica.ts` lo implementa como 3/hora por EMAIL y
 * 10/hora por IP, y esos son los valores que se usan: la política es de `lib` y
 * no se reescribe desde una pantalla. Ver `SUPUESTOS.md`.
 *
 * Por EMAIL frena a quien insiste contra UNA dirección aunque rote IPs; por IP
 * frena el barrido de muchas direcciones desde un mismo origen. Hacen falta las
 * dos, y `registrarIntentos` las registra AMBAS aunque una ya haya bloqueado:
 * cortocircuitar dejaría el contador de la otra clave sin avanzar.
 */
const LIMITE_POR_EMAIL: NombreLimite = "recuperar:email";
const LIMITE_POR_IP: NombreLimite = "recuperar:ip";

/** Nombre de la acción dentro de la clave del limitador. */
const ACCION = "recuperar";

/**
 * Pide un enlace de un solo uso para elegir una contraseña nueva.
 *
 * El orden —parsear → rate limit → trabajar— vive en `./flujo.ts`, que es donde
 * se testea. Aquí solo se cablean las dependencias reales.
 *
 * @param entrada lo que manda el formulario. `unknown` A PROPÓSITO: tiparlo
 * sería una promesa que el navegador no tiene por qué cumplir.
 */
export async function solicitarEnlaceDeRecuperacion(entrada: unknown): Promise<RespuestaRecuperar> {
  try {
    return await ejecutarRecuperacion(entrada, {
      comprobarLimite: comprobarLimiteDeRecuperacion,
      emitirEnlace: emitirEnlaceDeRecuperacion,
      consumirTiempoEquivalente,
    });
  } catch (error) {
    // Lo inesperado no se le enseña al usuario: ni un stack, ni un hostname
    // interno, ni el error del driver (`api-conventions.md`). Se registra sin
    // el correo: los logs de producción no llevan direcciones completas.
    console.error("recuperar: fallo inesperado en la Server Action", error);

    return {
      ok: false,
      error: { codigo: "ERROR_INTERNO", mensaje: MENSAJE_ERROR_INTERNO },
    };
  }
}

/**
 * Registra el intento contra las dos claves y devuelve el veredicto.
 *
 * FALLA CERRADO: si el limitador no responde se deniega. Aquí es todavía más
 * claro que en el login — sin base no hay cuenta que buscar ni token que
 * guardar, así que no hay nada que permitir.
 */
async function comprobarLimiteDeRecuperacion({ email }: { email: string }): Promise<{
  permitido: boolean;
  reintentarEnSegundos: number;
}> {
  try {
    const ip = ipDelCliente(await headers());

    const entradas: { nombre: NombreLimite; clave: string }[] = [
      { nombre: LIMITE_POR_EMAIL, clave: clavePorEmail(ACCION, email) },
    ];

    // Sin cabecera de IP no se aplica la clave por IP. NO se inventa un cubo
    // «desconocido» compartido: todos los clientes sin cabecera se bloquearían
    // entre sí (`security.md` §5).
    if (ip !== null) {
      entradas.push({ nombre: LIMITE_POR_IP, clave: clavePorIp(ACCION, ip) });
    }

    const veredicto = await registrarIntentos(entradas);

    return {
      permitido: veredicto.permitido,
      reintentarEnSegundos: veredicto.reintentarEnSegundos,
    };
  } catch (error) {
    console.error("recuperar: el limitador no respondió; se deniega el intento", error);

    return { permitido: false, reintentarEnSegundos: SEGUNDOS_ESPERA_POR_DEFECTO };
  }
}
