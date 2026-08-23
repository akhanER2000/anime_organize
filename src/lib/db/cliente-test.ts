/**
 * Cliente de base de datos para los tests de integración.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DOS DRIVERS, EL MISMO TEST.
 *
 *   · en LOCAL   → `@neondatabase/serverless` contra la rama `development`.
 *   · en CI      → `pg` contra un contenedor `postgres:18` efímero.
 *
 * POR QUÉ un contenedor en CI y no una rama compartida de Neon:
 *   · base VACÍA y exclusiva en cada ejecución — dos PR simultáneos no
 *     comparten estado, que es de donde salen los fallos intermitentes que
 *     acaban con la confianza en CI;
 *   · sin secreto que gestionar, y este repositorio es PÚBLICO;
 *   · CI no se pone rojo cuando Neon tiene una incidencia.
 *
 * EL COSTE, asumido: el driver difiere del de producción. Lo que estos tests
 * verifican —que el `WHERE` lleve `user_id`, que las cascadas disparen, que el
 * `UNIQUE` aguante— es **semántica de SQL**, no del driver. Lo específico de
 * Neon (pooler, arranque en frío) no lo cubre este test de todas formas.
 *
 * La imagen se fija en `postgres:18` para igualar el 18.6 de Neon, y las tres
 * extensiones vienen en el contrib de la imagen oficial.
 * ══════════════════════════════════════════════════════════════════════════
 */
import { neonConfig, Pool as PoolNeon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PoolPg } from "pg";
import ws from "ws";

import * as schema from "./schema";

export type ClientePrueba = {
  db: ReturnType<typeof drizzlePg<typeof schema>> | ReturnType<typeof drizzleNeon<typeof schema>>;
  cerrar: () => Promise<void>;
  motor: "neon" | "postgres";
};

/** Una URL de Neon habla su protocolo por WebSocket; una local, no. */
function esNeon(url: string): boolean {
  return url.includes("neon.tech") || url.includes("neon.build");
}

export function crearClientePrueba(url: string): ClientePrueba {
  if (esNeon(url)) {
    neonConfig.webSocketConstructor = ws;
    const pool = new PoolNeon({ connectionString: url });
    return {
      db: drizzleNeon(pool, { schema, casing: "snake_case" }),
      cerrar: () => pool.end(),
      motor: "neon",
    };
  }

  const pool = new PoolPg({ connectionString: url });
  return {
    db: drizzlePg(pool, { schema, casing: "snake_case" }),
    cerrar: () => pool.end(),
    motor: "postgres",
  };
}

/** La URL de pruebas, de donde salga. */
export function urlDePruebas(): string | undefined {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  return url !== undefined && url.trim().length > 0 ? url.trim() : undefined;
}
