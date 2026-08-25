import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

/**
 * Carga las variables de entorno para los scripts de CLI.
 *
 * Next.js carga `.env.local` por su cuenta, pero `tsx` no: sin esto, `npm run
 * db:migrate` y `npm run seed` no verían ninguna variable.
 *
 * Orden de precedencia (gana el primero que defina cada variable, como en Next):
 *   1. lo que ya venga del entorno real (CI, Vercel) — nunca se pisa
 *   2. .env.local
 *   3. .env
 */
/**
 * Las variables que YA estaban en el entorno real antes de leer ningún fichero.
 *
 * Es la única forma de distinguir después «esto lo pasé en la línea de
 * comandos» de «esto salió de `.env.local`», y esa distinción es la que evita
 * sembrar la rama equivocada de Neon. Ver `scripts/rama-destino.ts`.
 */
const DEL_ENTORNO_REAL = new Set<string>();

/** ¿Esta variable venía del entorno real, y no de un fichero? */
export function vinoDelEntorno(nombre: string): boolean {
  return DEL_ENTORNO_REAL.has(nombre);
}

export function cargarEntorno(): void {
  for (const [clave, valor] of Object.entries(process.env)) {
    if (valor !== undefined && valor !== "") DEL_ENTORNO_REAL.add(clave);
  }

  const raiz = fileURLToPath(new URL("..", import.meta.url));

  for (const fichero of [".env.local", ".env"]) {
    const ruta = `${raiz}${fichero}`;
    if (existsSync(ruta)) {
      // `override: false` es lo que respeta la precedencia: una variable ya
      // presente en el entorno real gana sobre el fichero.
      config({ path: ruta, override: false, quiet: true });
    }
  }
}
