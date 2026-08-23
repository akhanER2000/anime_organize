import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { textoObligatorio } from "@/lib/config/entorno";

import * as schema from "./schema";

/**
 * Cliente de base de datos para la APLICACIÓN.
 *
 * Driver HTTP (`neon-http`): no mantiene socket abierto, que es lo correcto en
 * funciones serverless donde cada invocación puede vivir milisegundos. La
 * contrapartida es que NO soporta transacciones interactivas de varias idas y
 * vueltas; para eso están los scripts (ver `scripts/migrate.ts`), que usan `Pool`.
 *
 * Una sola instancia por proceso. Nada de crear clientes sueltos por ahí.
 */

function crear() {
  const url = textoObligatorio("DATABASE_URL", {
    pista:
      "Es la cadena POOLED de Neon (lleva '-pooler' en el host).\n" +
      "console.neon.tech → tu proyecto → Connection Details.",
  });

  return drizzle(neon(url), { schema, casing: "snake_case" });
}

// Lazy: si se creara al importar, cualquier test o script que toque este módulo
// exigiría DATABASE_URL aunque no llegue a consultar nada.
let instancia: ReturnType<typeof crear> | null = null;

export function db(): ReturnType<typeof crear> {
  instancia ??= crear();
  return instancia;
}

export { schema };
