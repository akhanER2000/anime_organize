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
export function cargarEntorno(): void {
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
