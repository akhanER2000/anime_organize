import "server-only";

import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { textoObligatorio, textoOpcional } from "@/lib/config/entorno";

import { proxyHttpDeNeon } from "./motor";

import * as schema from "./schema";

import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLIENTE CRUDO. **NO SE USA DESDE EL CÓDIGO DE APLICACIÓN.**
 *
 * Es la única forma de obtener un cliente sin filtro por usuario, y por eso está
 * restringido por ESLint: importarlo desde fuera de `src/lib/db/**`,
 * `src/auth.ts` o `src/lib/rate-limit/**` es un error de lint que para el commit
 * y CI.
 *
 * Lo que usa la aplicación es `vaultDe(ctx)`. Si estás aquí porque quieres «una
 * consulta rápida sin el vault», la respuesta es no: añade el método al vault,
 * donde el filtro viene dado por la forma de la API.
 *
 * ── DOS DRIVERS, Y NO ES CAPRICHO ──────────────────────────────────────────
 *
 * `neon-http` NO soporta transacciones interactivas: cada consulta es una
 * petición HTTP independiente, así que no hay forma de mantener abierta una
 * transacción entre varias. Es lo correcto para una consulta suelta en una
 * función serverless, y es lo que usa la aplicación por defecto.
 *
 * Para lo que SÍ necesita una transacción de verdad —crear anime + portada +
 * progreso, o el borrado de cuenta— hace falta el driver por WebSocket.
 * `clienteTransaccional()` lo entrega, y **`vaultDe(...).transaccion()` lo
 * exige**: intentar abrir una transacción sobre el cliente HTTP es un error de
 * tipos, no una sorpresa en producción.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Cualquier cliente sobre el que el vault puede consultar.
 *
 * Cubre el driver HTTP, el de WebSocket, el de `pg` (tests) y también una
 * transacción abierta, porque `PgTransaction` extiende `PgDatabase`.
 */
export type ClienteInterno = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * El cliente HTTP CONCRETO, con `batch`.
 *
 * `ClienteInterno` es el tipo genérico que aceptan el vault y las funciones que
 * también pueden recibir una transacción. Pero el driver HTTP de Neon tiene algo
 * que el genérico no declara: **`batch`**, que ejecuta varias sentencias como
 * UNA transacción sin necesitar una conexión interactiva.
 *
 * Es lo que permite escribir de forma atómica desde una Server Action sin abrir
 * un WebSocket — que en el servidor empaquetado de Next falla, y que además
 * costaba más de un segundo y delataba por tiempo qué correos tienen cuenta.
 * Ver `src/lib/db/cuentas.ts`.
 */
export type ClienteHttp = NeonHttpDatabase<typeof schema>;

/** Cliente que además puede abrir transacciones interactivas. */
export type ClienteTransaccional = ClienteInterno & {
  transaction: <T>(cb: (tx: ClienteInterno) => Promise<T>) => Promise<T>;
};

function urlApp(): string {
  return textoObligatorio("DATABASE_URL", {
    pista:
      "Es la cadena POOLED de Neon (lleva '-pooler' en el host).\n" +
      "console.neon.tech → tu proyecto → Connection Details.",
  });
}

let http: ClienteHttp | null = null;

/**
 * Cliente HTTP: una consulta, una petición. Sin transacciones.
 *
 * @internal Restringido por ESLint fuera de `src/lib/db/**`.
 */
export function dbInterna(): ClienteHttp {
  if (http === null) {
    // CI corre un proxy que habla el protocolo HTTP de Neon delante de un
    // Postgres normal. Redirigir el endpoint es lo ÚNICO que hace falta: el
    // driver, las consultas y `batch` siguen siendo exactamente los de
    // producción. La alternativa —cambiar de driver cuando el destino no es
    // Neon— habría dejado los tests corriendo contra una variante, y `batch`
    // no tiene equivalente fiel en `pg`: las consultas de drizzle ya vienen
    // atadas a su cliente, así que meterlas en un `transaction()` no las
    // reata, y se perdería la atomicidad justo donde importa.
    //
    // En producción `NEON_HTTP_PROXY` no existe y esto no se ejecuta.
    const proxy = proxyHttpDeNeon();
    if (proxy !== undefined) neonConfig.fetchEndpoint = proxy;

    http = drizzleHttp(neon(urlApp()), { schema, casing: "snake_case" });
  }
  return http;
}

/**
 * Cliente por WebSocket, capaz de transacciones interactivas.
 *
 * Usa la cadena UNPOOLED si está disponible: el pooler no es el sitio para una
 * transacción larga. Se crea BAJO DEMANDA y se cierra al terminar, porque
 * mantener un socket abierto en una función serverless que puede morir en
 * cualquier momento es una fuga de conexiones.
 *
 * @internal Restringido por ESLint fuera de `src/lib/db/**`.
 */
export async function conTransaccion<T>(
  trabajo: (cliente: ClienteTransaccional) => Promise<T>,
): Promise<T> {
  neonConfig.webSocketConstructor = ws;

  const url = textoOpcional("DATABASE_URL_UNPOOLED") ?? urlApp();
  const pool = new Pool({ connectionString: url });

  try {
    const cliente = drizzleWs(pool, { schema, casing: "snake_case" });
    return await trabajo(cliente as unknown as ClienteTransaccional);
  } finally {
    await pool.end();
  }
}
