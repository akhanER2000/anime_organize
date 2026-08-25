import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { marcaDeRevocacion } from "@/lib/auth/sesion";

import { dbInterna } from "./interno";
import { passwordResetTokens, users } from "./schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ALTAS Y RECUPERACIÓN — la capa de datos ANTERIOR a que exista una sesión.
 *
 * ── POR QUÉ ESTE FICHERO EXISTE Y POR QUÉ ESTÁ AQUÍ ────────────────────────
 *
 * Dos agentes escribieron `/registro` y `/recuperar` en paralelo y **los dos
 * pararon en el mismo sitio**, sin saltarse nada: el contrato de datos prohíbe
 * alcanzar las tablas crudas desde `src/app/**`, y `vaultDe(ctx)` no sirve
 * aquí porque exige un `ContextoUsuario` que en un alta **no puede existir
 * todavía** — la cuenta es justo lo que se está creando.
 *
 * Que los dos se detuvieran en vez de encontrar un rodeo es la señal de que el
 * contrato funciona. Lo que faltaba no era permiso: era esta pieza.
 *
 * Vive en `src/lib/db/**` porque es el único sitio, junto con `src/auth.ts` y
 * el limitador, donde tocar las tablas crudas es legítimo. Ver
 * `.claude/rules/db-conventions.md` § «Quién puede tocar la capa cruda».
 *
 * ── LO QUE ESTE FICHERO NO HACE, Y ES DELIBERADO ───────────────────────────
 *
 * **No decide nada.** No decide si se manda un correo, ni qué mensaje ve el
 * usuario, ni si el correo ya existía. Eso vive en `src/lib/auth/registro.ts`
 * y en el `flujo.ts` de cada pantalla, que están testeados aparte. Aquí solo se
 * escribe en la base, y las funciones devuelven hechos, no veredictos.
 *
 * Es lo que permite que la política anti-enumeración se pruebe sin base y que
 * esto se pruebe sin política.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Lo que necesita saber la política sobre un correo. Nunca sale del servidor. */
export type CuentaExistente = {
  id: string;
  /** `email_verified` no es `null`. */
  verificada: boolean;
  /** Tiene contraseña: puede entrar por credenciales. */
  tienePassword: boolean;
};

/**
 * Busca una cuenta viva por correo.
 *
 * `users.email` es `citext`, así que la comparación ya es insensible a
 * mayúsculas en la base: **no se envuelve la columna en `lower()`**, que
 * desactivaría el índice único y dejaría la deduplicación de correos apoyada en
 * la suerte.
 *
 * Una cuenta con `deleted_at` **no se devuelve**: para todo lo de fuera, no
 * existe.
 */
export async function buscarCuentaPorEmail(email: string): Promise<CuentaExistente | null> {
  const [fila] = await dbInterna()
    .select({
      id: users.id,
      emailVerified: users.emailVerified,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (fila === undefined) return null;

  return {
    id: fila.id,
    verificada: fila.emailVerified !== null,
    tienePassword: fila.passwordHash !== null,
  };
}

/** El alta salió, o chocó con una cuenta que ya estaba. */
export type ResultadoAlta = { creada: true; userId: string } | { creada: false };

/**
 * Crea una cuenta.
 *
 * ── LA CARRERA SE RESUELVE EN LA BASE, NO ANTES ────────────────────────────
 * Comprobar «¿existe ya?» y después insertar deja una ventana entre las dos
 * consultas por la que caben dos registros simultáneos del mismo correo. Aquí
 * se inserta directamente con `onConflictDoNothing` sobre `uq_users_email`: si
 * la fila ya estaba, no se inserta y se devuelve `creada: false`. **Una sola
 * ida y vuelta, sin ventana.**
 *
 * Quien llama NO debe convertir ese `false` en un mensaje distinto: la política
 * anti-enumeración exige la misma respuesta exista o no la cuenta
 * (`security.md` §2). Aquí solo se informa del hecho.
 *
 * ── `sessionsValidFrom` VA EXPLÍCITO ───────────────────────────────────────
 * La columna no tiene `DEFAULT` a propósito. El reloj de Neon va ~600 ms por
 * delante del de la aplicación (medido), y como esa marca se compara contra la
 * marca de emisión del JWT —que escribe la aplicación—, dejarla en manos de la
 * base haría **nacer revocada** la sesión de quien entra justo después de
 * registrarse. Ver `db-conventions.md` § «Dos relojes, y no coinciden».
 */
export async function crearCuenta(datos: {
  email: string;
  passwordHash: string;
  nombre: string | null;
}): Promise<ResultadoAlta> {
  const [fila] = await dbInterna()
    .insert(users)
    .values({
      email: datos.email,
      passwordHash: datos.passwordHash,
      displayName: datos.nombre,
      sessionsValidFrom: marcaDeRevocacion(new Date()),
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  return fila === undefined ? { creada: false } : { creada: true, userId: fila.id };
}

/** sha256 en hexadecimal. Lo mismo que guarda `password_reset_tokens`. */
export function hashDeToken(token: string): string {
  return createHash("sha256").update(token, "utf-8").digest("hex");
}

export type EnlaceDeReset = {
  /** El token EN CLARO. Va al correo y **no se guarda en ningún sitio**. */
  token: string;
  userId: string;
  caducaEn: Date;
};

/**
 * Emite un enlace de recuperación. `null` si ese correo no tiene cuenta viva.
 *
 * ── SOLO SE GUARDA EL HASH ─────────────────────────────────────────────────
 * En la tabla va `sha256(token)`, nunca el token. Quien consiguiera leer
 * `password_reset_tokens` —una copia de seguridad mal guardada, un volcado en
 * un log— **no puede entrar en ninguna cuenta**: tendría los hashes, y de un
 * hash no se saca el token. Es la misma razón por la que no se guarda la
 * contraseña.
 *
 * ── LOS ANTERIORES SE INVALIDAN EN LA MISMA TRANSACCIÓN ─────────────────────
 * Pedir un enlace nuevo mata los pendientes. Si no, cada petición dejaría vivo
 * un token más y la ventana de ataque crecería con cada clic del usuario — que
 * además clica varias veces justo cuando el correo tarda.
 *
 * `null` se devuelve **sin escribir nada**. Quien llama tiene que pagar el
 * tiempo equivalente en ese camino, o la diferencia de duración delata qué
 * direcciones tienen cuenta sin necesidad de leer un solo mensaje.
 */
export async function emitirEnlaceDeReset(datos: {
  email: string;
  caducidadMs: number;
  ahora?: Date;
}): Promise<EnlaceDeReset | null> {
  const cuenta = await buscarCuentaPorEmail(datos.email);

  if (cuenta === null) {
    // ── EL SEÑUELO PAGA LO MISMO, Y LO PAGA ESTRUCTURALMENTE ──────────────
    //
    // Devolver `null` aquí sin más era un oráculo de tiempo: el camino real
    // hace DOS idas y vuelta a Neon (buscar + escribir) y este solo una, así
    // que la respuesta llegaba en la mitad de tiempo y bastaba un cronómetro
    // para saber qué direcciones tienen cuenta. Medido: 295 ms contra 154 ms,
    // una diferencia de 141 ms perfectamente separable.
    //
    // La defensa NO es una constante de espera: una constante se calibra hoy
    // contra un coste que cambia mañana —y ya pasó, con
    // `consumirTiempoEquivalente` ajustado a un `verify` de Argon2 mientras el
    // camino real hacía una transacción por WebSocket de 1.180 ms—.
    //
    // Se paga **la misma operación** contra un id que no existe: mismo `batch`,
    // mismo número de sentencias, misma ida y vuelta, cero escrituras (los dos
    // `UPDATE` no casan con ninguna fila). Si el coste real cambia, el del
    // señuelo cambia con él, porque es el mismo código.
    await señueloDeEscritura();
    return null;
  }

  const ahora = datos.ahora ?? new Date();
  const caducaEn = new Date(ahora.getTime() + datos.caducidadMs);

  // 32 bytes de `randomBytes`: aleatoriedad criptográfica, no `Math.random()`.
  const token = randomBytes(32).toString("base64url");

  // ── `batch` SOBRE HTTP, NO UNA TRANSACCIÓN POR WEBSOCKET ────────────────
  // Neon ejecuta un `batch` como UNA transacción, así que la garantía es la
  // misma: o se invalidan los anteriores y se inserta el nuevo, o no pasa nada.
  //
  // Lo que cambia es el transporte, y ahí había dos problemas serios:
  //
  //  1. **Reventaba en producción.** `conTransaccion` abre un `Pool` por
  //     WebSocket, y `ws` empaquetado dentro del servidor de Next falla con
  //     `TypeError: b.mask is not a function`. Medido por el auditor: pedir un
  //     enlace para una cuenta EXISTENTE colgaba 20 s y acababa en timeout,
  //     mientras que para una inexistente respondía en 0,5 s.
  //  2. **Era un oráculo de tiempo.** Abrir un pool nuevo, hacer la transacción
  //     y cerrarlo costaba ~1.180 ms medidos, contra los ~9 ms del señuelo del
  //     camino «no hay cuenta». Un segundo entero de diferencia: cronometrando
  //     el formulario se sabía qué direcciones tienen cuenta sin leer un solo
  //     mensaje. Ver `security.md` §2, «Enumeración por tiempo».
  //
  // Además `db-conventions.md` § «Conexión» ya lo decía: en Server Actions y
  // Route Handlers va el driver HTTP; el WebSocket es para scripts y seed.
  await dbInterna().batch([
    dbInterna()
      .update(passwordResetTokens)
      .set({ usedAt: ahora })
      .where(and(eq(passwordResetTokens.userId, cuenta.id), isNull(passwordResetTokens.usedAt))),
    dbInterna()
      .insert(passwordResetTokens)
      .values({
        userId: cuenta.id,
        tokenHash: hashDeToken(token),
        expiresAt: caducaEn,
      }),
  ]);

  return { token, userId: cuenta.id, caducaEn };
}

export type ResultadoConsumo =
  | { valido: true; userId: string }
  /** Inválido, caducado o ya usado. **Los tres responden igual** (§2). */
  | { valido: false };

/**
 * Consume un token de recuperación y revoca todas las sesiones del usuario.
 *
 * ── UN SOLO USO, GARANTIZADO POR LA BASE ───────────────────────────────────
 * El `UPDATE … WHERE used_at IS NULL … RETURNING` es **atómico**: si dos
 * peticiones llegan con el mismo token, solo una devuelve fila. Comprobar y
 * después marcar dejaría una ventana por la que el mismo enlace vale dos veces.
 *
 * ── Y REVOCA LAS SESIONES, QUE ES LA MITAD DEL PUNTO ───────────────────────
 * Restablecer la contraseña sin echar a las sesiones abiertas no sirve de nada
 * en el caso que importa: alguien que entró con la contraseña robada sigue
 * dentro. Por eso `sessions_valid_from` se mueve **en la misma transacción**.
 * Está verificado por el camino real en `revocacion.camino-real.test.ts`.
 */
export async function consumirTokenDeReset(datos: {
  token: string;
  passwordHash: string;
  ahora?: Date;
}): Promise<ResultadoConsumo> {
  const ahora = datos.ahora ?? new Date();
  const hash = hashDeToken(datos.token);

  // ── UN SOLO STATEMENT, NO UNA TRANSACCIÓN INTERACTIVA ───────────────────
  // El `WITH … UPDATE` encadena las dos escrituras en **una sola sentencia**,
  // así que Postgres las hace atómicas por definición: no hay ventana entre
  // consumir el token y cambiar la contraseña, y no hace falta el driver por
  // WebSocket —que además revienta empaquetado dentro del servidor de Next y
  // costaba más de un segundo, delatando por tiempo qué correos tienen cuenta—.
  //
  // La garantía de UN SOLO USO sigue viniendo de la base: `used_at IS NULL` en
  // el `WHERE` del `UPDATE` hace que solo una de N peticiones simultáneas
  // devuelva fila. Está verificado con 6 consumos concurrentes del mismo token.
  const filas = await dbInterna().execute(sql`
    with consumido as (
      update password_reset_tokens
         set used_at = ${ahora}
       where token_hash = ${hash}
         and used_at is null
         and expires_at > ${ahora}
      returning user_id
    )
    update users u
       set password_hash      = ${datos.passwordHash},
           sessions_valid_from = ${marcaDeRevocacion(ahora)},
           updated_at          = ${ahora}
      from consumido c
     where u.id = c.user_id
    returning u.id
  `);

  const primera = (filas as unknown as { rows?: { id?: string }[] }).rows ?? [];
  const id = primera[0]?.id;

  return id === undefined ? { valido: false } : { valido: true, userId: id };
}

/**
 * Paga lo que cuesta escribir, sin escribir nada.
 *
 * Dos `UPDATE` contra un uuid aleatorio —que por construcción no pertenece a
 * nadie— dentro de un `batch`, igual que la emisión real. Casan con cero filas,
 * así que no hay efecto: lo único que consumen es exactamente la misma ida y
 * vuelta a Neon que consumiría el camino de verdad.
 *
 * Es la diferencia entre «esperar 141 ms porque hoy medí 141» y «hacer el mismo
 * trabajo». Lo segundo no se desincroniza.
 */
export async function señueloDeAlta(): Promise<void> {
  // Misma forma que `crearCuenta`: una ida y vuelta con un `INSERT` que la base
  // descarta por conflicto. Se inserta contra un correo aleatorio que YA
  // insertamos en la misma sentencia… no: se usa un `UPDATE` que no casa, que
  // cuesta lo mismo en red y no deja fila.
  //
  // El camino «ese correo ya existe» no hashea ni inserta: pagaba solo el
  // señuelo de Argon2 y respondía 147 ms antes que el camino que sí crea la
  // cuenta. Con esto los dos pagan hash + una escritura.
  const nadie = randomUUID();
  await dbInterna().update(users).set({ updatedAt: new Date() }).where(eq(users.id, nadie));
}

async function señueloDeEscritura(): Promise<void> {
  const nadie = randomUUID();
  await dbInterna().batch([
    dbInterna()
      .update(passwordResetTokens)
      .set({ usedAt: null })
      .where(and(eq(passwordResetTokens.userId, nadie), isNull(passwordResetTokens.usedAt))),
    dbInterna()
      .update(passwordResetTokens)
      .set({ usedAt: null })
      .where(eq(passwordResetTokens.userId, nadie)),
  ]);
}
