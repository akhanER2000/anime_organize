import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  buscarCuentaPorEmail,
  consumirTokenDeReset,
  crearCuenta,
  emitirEnlaceDeReset,
  hashDeToken,
} from "./cuentas";
import { dbInterna } from "./interno";
import { passwordResetTokens, users } from "./schema";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ALTAS Y RECUPERACIÓN, CONTRA POSTGRES DE VERDAD.
 *
 * CAMINO REAL (2026-08-24) — `.claude/rules/testing.md` § «Verificación por el
 * CAMINO REAL».
 *
 * Lo que se prueba aquí NO se puede probar con un doble: son garantías que da
 * la BASE, no el código. Que un `onConflictDoNothing` no inserte dos veces, que
 * un `UPDATE … WHERE used_at IS NULL … RETURNING` sea atómico bajo concurrencia,
 * que un índice único exista. Un mock diría que sí a todo.
 *
 * ── VERIFICADO POR MUTACIÓN · 2026-08-24 ───────────────────────────────────
 *
 * | Mutación | Qué se rompe | Resultado |
 * |---|---|---|
 * | guardar el token EN CLARO en vez de `sha256` | un volcado de la tabla abre cualquier cuenta | **3 en ROJO** |
 * | no invalidar los tokens pendientes al emitir | cada petición deja vivo un token más | **1 en ROJO** |
 * | quitar `isNull(usedAt)` del `WHERE` | el enlace vale más de una vez | **3 en ROJO** |
 * | quitar la comprobación de `expiresAt` | un token caducado sigue valiendo | **1 en ROJO** |
 * | no mover `sessionsValidFrom` al restablecer | quien entró con la contraseña robada sigue dentro | **1 en ROJO** |
 *
 * ── UN TEST QUE TUVE QUE QUITAR, Y POR QUÉ ─────────────────────────────────
 * Había aquí un caso de 8 altas simultáneas del mismo correo para demostrar
 * que no hay ventana de carrera. **No discriminaba**: al mutar `crearCuenta` a
 * comprobar-y-luego-insertar, unas ejecuciones salían rojas y otras verdes
 * según cómo se solaparan las peticiones por red. Un test de seguridad
 * intermitente no prueba nada y además gasta la confianza en los que sí.
 *
 * Lo sustituyen dos comprobaciones deterministas que miden la garantía real:
 * que `uq_users_email` existe —es la base quien impide el duplicado, no el
 * código— y que un conflicto devuelve `creada: false` en vez de lanzar.
 *
 * El caso de 6 consumos simultáneos del MISMO token sí se queda: ahí las seis
 * peticiones chocan contra la misma fila y Postgres las serializa, así que la
 * mutación lo pone rojo de forma fiable (comprobado arriba).
 *
 * Los correos llevan un uuid y se limpian al final; la cascada se lleva los
 * tokens.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SUFIJO = randomUUID();
const correosUsados: string[] = [];

const HASH_FALSO = "$argon2id$v=19$m=19456,t=2,p=1$" + "x".repeat(22) + "$" + "y".repeat(43);
const CADUCIDAD_MS = 60 * 60 * 1000;

function correo(nombre: string): string {
  const e = `cuentas-${nombre}-${SUFIJO}@ejemplo.test`;
  correosUsados.push(e);
  return e;
}

describe("crearCuenta · contra Postgres", () => {
  afterAll(async () => {
    if (correosUsados.length > 0) {
      await dbInterna().delete(users).where(inArray(users.email, correosUsados));
    }
  });

  it("crea la cuenta y la deja encontrable", async () => {
    const email = correo("alta");
    const alta = await crearCuenta({ email, passwordHash: HASH_FALSO, nombre: "Rocío" });

    expect(alta.creada).toBe(true);
    const cuenta = await buscarCuentaPorEmail(email);
    expect(cuenta?.tienePassword).toBe(true);
    expect(cuenta?.verificada).toBe(false);
  });

  it("SESSIONS_VALID_FROM sale del reloj de la APLICACIÓN, no del de Postgres", async () => {
    // El reloj de Neon va ~600 ms por delante del de esta máquina (medido). Si
    // la columna se rellenara con `now()` de la base, la marca quedaría en el
    // FUTURO respecto a la aplicación y la sesión de quien entra justo después
    // de registrarse nacería revocada.
    const antes = new Date();
    const email = correo("reloj");
    await crearCuenta({ email, passwordHash: HASH_FALSO, nombre: null });
    const despues = new Date();

    const [fila] = await dbInterna()
      .select({ marca: users.sessionsValidFrom })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const marca = fila?.marca.getTime() ?? 0;
    expect(marca).toBeGreaterThanOrEqual(antes.getTime());
    expect(marca).toBeLessThanOrEqual(despues.getTime());
  });

  it("el correo duplicado NO crea una segunda fila", async () => {
    const email = correo("duplicado");
    const primera = await crearCuenta({ email, passwordHash: HASH_FALSO, nombre: "Primera" });
    const segunda = await crearCuenta({ email, passwordHash: HASH_FALSO, nombre: "Segunda" });

    expect(primera.creada).toBe(true);
    expect(segunda.creada).toBe(false);

    const filas = await dbInterna()
      .select({ nombre: users.displayName })
      .from(users)
      .where(eq(users.email, email));

    expect(filas).toHaveLength(1);
    // Y NO se ha pisado a la que ya estaba.
    expect(filas[0]?.nombre).toBe("Primera");
  });

  it("`citext`: el mismo correo con otra caja es el MISMO correo", async () => {
    // Si esto fallara, la deduplicación de cuentas se saltaría escribiendo
    // `Rocio@…` en vez de `rocio@…`, y habría dos cuentas para una persona.
    const email = correo("caja");
    await crearCuenta({ email, passwordHash: HASH_FALSO, nombre: null });

    const otraCaja = email.toUpperCase();
    expect(
      (await crearCuenta({ email: otraCaja, passwordHash: HASH_FALSO, nombre: null })).creada,
    ).toBe(false);
    expect(await buscarCuentaPorEmail(otraCaja)).not.toBeNull();
  });

  it("EL ÍNDICE ÚNICO EXISTE: la garantía la da la BASE, no el código", async () => {
    // ── POR QUÉ SE COMPRUEBA EL ÍNDICE Y NO UNA CARRERA ────────────────────
    // Aquí había un test de 8 altas simultáneas del mismo correo. Lo quité
    // porque **no discriminaba**: al mutar `crearCuenta` a comprobar-y-luego-
    // insertar —la versión con ventana de carrera— unas ejecuciones se ponían
    // rojas y otras verdes, según cómo se solaparan las peticiones por red. Un
    // test de seguridad intermitente no prueba nada; solo gasta la confianza.
    //
    // Lo que de verdad impide dos cuentas con el mismo correo no es el código:
    // es `uq_users_email`. Si alguien lo quitara en una migración, ninguna
    // carrera haría falta para duplicar una cuenta. Eso sí se comprueba de
    // forma determinista, y es la garantía real.
    const filas = await dbInterna()
      .select({ definicion: sql<string>`indexdef` })
      .from(sql`pg_indexes`)
      .where(sql`schemaname = 'public' and indexname = 'uq_users_email'`);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.definicion).toMatch(/UNIQUE/i);
  });

  it("el conflicto NO revienta: devuelve `creada: false` en vez de lanzar", async () => {
    // Es lo que aporta `onConflictDoNothing`. Sin él, dos altas simultáneas del
    // mismo correo hacen que una de las dos lance un error de clave duplicada,
    // y ese error acabaría en un 500 delante de alguien que solo se estaba
    // registrando — además de delatar, por la vía del fallo, que el correo ya
    // existía.
    const email = correo("sin-lanzar");
    await crearCuenta({ email, passwordHash: HASH_FALSO, nombre: null });

    await expect(crearCuenta({ email, passwordHash: HASH_FALSO, nombre: null })).resolves.toEqual({
      creada: false,
    });
  });
});

describe("recuperación · contra Postgres", () => {
  afterAll(async () => {
    if (correosUsados.length > 0) {
      await dbInterna().delete(users).where(inArray(users.email, correosUsados));
    }
  });

  async function cuentaLista(nombre: string): Promise<{ email: string; userId: string }> {
    const email = correo(nombre);
    const alta = await crearCuenta({ email, passwordHash: HASH_FALSO, nombre: null });
    if (!alta.creada) throw new Error("no se pudo preparar la cuenta");
    return { email, userId: alta.userId };
  }

  it("un correo SIN cuenta no emite nada y no deja rastro", async () => {
    // ── POR QUÉ NO SE CUENTAN LAS FILAS DE TODA LA TABLA ───────────────────
    // La primera versión comparaba `count(password_reset_tokens)` antes y
    // después. Era **inestable**: vitest corre los ficheros de test en paralelo,
    // así que cualquier otro test que emitiera un token entre las dos consultas
    // lo ponía rojo sin que hubiera ningún fallo. Y una intermitencia en un test
    // de seguridad es peor que no tenerlo: se acaba ignorando el rojo.
    //
    // Lo que de verdad hay que comprobar es que ese correo no deja rastro, y eso
    // se mide sobre ESE correo, no sobre la tabla entera.
    const inexistente = `nadie-${randomUUID()}@ejemplo.test`;

    const enlace = await emitirEnlaceDeReset({ email: inexistente, caducidadMs: CADUCIDAD_MS });

    expect(enlace).toBeNull();
    // Ni se ha creado la cuenta por el camino…
    expect(await buscarCuentaPorEmail(inexistente)).toBeNull();
    // …ni existe usuario alguno con esa dirección.
    const filas = await dbInterna()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, inexistente));
    expect(filas).toHaveLength(0);
  });

  it("EN LA BASE SOLO ESTÁ EL HASH: el token en claro no se guarda", async () => {
    // Si se guardara el token, quien leyera esta tabla —un volcado, una copia
    // mal guardada— entraría en cualquier cuenta. Con el hash, no.
    const { email, userId } = await cuentaLista("hash");
    const enlace = await emitirEnlaceDeReset({ email, caducidadMs: CADUCIDAD_MS });
    if (enlace === null) throw new Error("debería haber emitido");

    const [fila] = await dbInterna()
      .select({ tokenHash: passwordResetTokens.tokenHash })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .limit(1);

    expect(fila?.tokenHash).toBe(hashDeToken(enlace.token));
    expect(fila?.tokenHash).not.toBe(enlace.token);
  });

  it("pedir un enlace nuevo INVALIDA los pendientes", async () => {
    const { email } = await cuentaLista("reemisión");

    const viejo = await emitirEnlaceDeReset({ email, caducidadMs: CADUCIDAD_MS });
    const nuevo = await emitirEnlaceDeReset({ email, caducidadMs: CADUCIDAD_MS });
    if (viejo === null || nuevo === null) throw new Error("debería haber emitido");

    // El viejo ya no vale…
    expect(
      (await consumirTokenDeReset({ token: viejo.token, passwordHash: HASH_FALSO })).valido,
    ).toBe(false);
    // …y el nuevo sí.
    expect(
      (await consumirTokenDeReset({ token: nuevo.token, passwordHash: HASH_FALSO })).valido,
    ).toBe(true);
  });

  it("UN SOLO USO: el segundo intento con el mismo token falla", async () => {
    const { email } = await cuentaLista("un-uso");
    const enlace = await emitirEnlaceDeReset({ email, caducidadMs: CADUCIDAD_MS });
    if (enlace === null) throw new Error("debería haber emitido");

    expect(
      (await consumirTokenDeReset({ token: enlace.token, passwordHash: HASH_FALSO })).valido,
    ).toBe(true);
    expect(
      (await consumirTokenDeReset({ token: enlace.token, passwordHash: HASH_FALSO })).valido,
    ).toBe(false);
  });

  it("un token CADUCADO responde exactamente igual que uno inválido", async () => {
    const { email } = await cuentaLista("caducado");
    // Emitido con caducidad negativa: nace vencido.
    const enlace = await emitirEnlaceDeReset({ email, caducidadMs: -1000 });
    if (enlace === null) throw new Error("debería haber emitido");

    const caducado = await consumirTokenDeReset({ token: enlace.token, passwordHash: HASH_FALSO });
    const basura = await consumirTokenDeReset({ token: "no-existe", passwordHash: HASH_FALSO });

    expect(caducado).toEqual(basura);
  });

  it("RESTABLECER ECHA A LAS SESIONES ABIERTAS: la marca de corte avanza", async () => {
    // Es la mitad del punto de restablecer una contraseña. Sin esto, quien
    // entró con la contraseña robada sigue dentro después del cambio.
    const { email, userId } = await cuentaLista("revoca");

    const [antes] = await dbInterna()
      .select({ marca: users.sessionsValidFrom })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const enlace = await emitirEnlaceDeReset({ email, caducidadMs: CADUCIDAD_MS });
    if (enlace === null) throw new Error("debería haber emitido");

    const despuesDe = new Date(Date.now() + 5000);
    await consumirTokenDeReset({
      token: enlace.token,
      passwordHash: HASH_FALSO,
      ahora: despuesDe,
    });

    const [ahora] = await dbInterna()
      .select({ marca: users.sessionsValidFrom, hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    expect(ahora?.marca.getTime()).toBeGreaterThan(antes?.marca.getTime() ?? 0);
    expect(ahora?.hash).toBe(HASH_FALSO);
  });

  it("SIN VENTANA DE CARRERA: 6 consumos simultáneos del mismo token, solo uno vale", async () => {
    const { email } = await cuentaLista("carrera-token");
    const enlace = await emitirEnlaceDeReset({ email, caducidadMs: CADUCIDAD_MS });
    if (enlace === null) throw new Error("debería haber emitido");

    const resultados = await Promise.all(
      Array.from({ length: 6 }, () =>
        consumirTokenDeReset({ token: enlace.token, passwordHash: HASH_FALSO }),
      ),
    );

    expect(resultados.filter((r) => r.valido)).toHaveLength(1);
  });
});
