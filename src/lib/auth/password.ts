import "server-only";

import { hash, verify } from "@node-rs/argon2";

/**
 * Hash y verificación de contraseñas con Argon2id.
 *
 * Parámetros del perfil recomendado por OWASP: `m=19456 KiB (19 MiB)`, `t=2`,
 * `p=1`. Ver `.claude/rules/security.md` §2.
 */

const PARAMETROS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashearPassword(password: string): Promise<string> {
  return hash(password, PARAMETROS);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * HASH SEÑUELO — el que cierra la enumeración de usuarios POR TIEMPO.
 *
 * EL ATAQUE: si la cuenta no existe y se responde sin llegar a ejecutar Argon2,
 * la respuesta vuelve en milisegundos. Si existe, tarda lo que tarde el hash
 * (decenas de ms, por diseño). Un atacante distingue cuentas reales
 * **cronometrando**, sin leer un solo mensaje y sin importar lo cuidadoso que
 * sea el texto de la respuesta.
 *
 * LA DEFENSA: cuando el usuario no existe, se verifica contra este señuelo —con
 * los MISMOS parámetros, así que cuesta lo mismo— y se descarta el resultado.
 * Los dos caminos pagan el mismo precio en CPU.
 *
 * El señuelo se calcula **una vez por proceso** y de forma perezosa: hacerlo al
 * importar retrasaría el arranque en frío de cada función serverless.
 * ══════════════════════════════════════════════════════════════════════════
 */
let senuelo: Promise<string> | null = null;

function hashSenuelo(): Promise<string> {
  // El contenido da igual; lo que importa es que sea un hash válido con los
  // mismos parámetros, para que `verify` tarde lo mismo.
  senuelo ??= hash("contrasena señuelo que nunca autentica a nadie", PARAMETROS);
  return senuelo;
}

/**
 * Verifica una contraseña contra el hash almacenado.
 *
 * @param hashAlmacenado  el hash del usuario, o `null` si el usuario no existe
 *                        o no tiene contraseña (solo entra por OAuth).
 *
 * Devuelve `false` en ambos casos, pero **habiendo tardado lo mismo** que si el
 * usuario existiera. Esa es toda la gracia.
 */
export async function verificarPassword(
  password: string,
  hashAlmacenado: string | null,
): Promise<boolean> {
  if (hashAlmacenado === null) {
    // Trabajo equivalente y resultado descartado.
    await verify(await hashSenuelo(), password).catch(() => false);
    return false;
  }

  try {
    return await verify(hashAlmacenado, password);
  } catch {
    // Un hash corrupto o con otro formato no es una excepción del flujo: es un
    // fallo de autenticación. Propagarlo daría un 500 que además distingue esa
    // cuenta de las demás.
    return false;
  }
}

/**
 * Consume el mismo tiempo que una verificación, sin verificar nada.
 *
 * Para los flujos que no comprueban contraseña pero SÍ delatan por tiempo si la
 * cuenta existe: «olvidé mi contraseña» y el reenvío de verificación. Ahí el
 * trabajo caro no es el hash sino la consulta y el envío de correo, así que se
 * iguala el camino corto con el largo.
 */
export async function consumirTiempoEquivalente(): Promise<void> {
  await verify(await hashSenuelo(), "no importa").catch(() => false);
}

/** Los parámetros, expuestos para los tests. */
export const PARAMETROS_ARGON2 = PARAMETROS;
