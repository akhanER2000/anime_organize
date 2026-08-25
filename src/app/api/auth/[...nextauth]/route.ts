import { handlers } from "@/auth";

/**
 * Endpoints de Auth.js: `/api/auth/session`, `/api/auth/csrf`,
 * `/api/auth/callback/credentials`, `/api/auth/signout`…
 *
 * ── ESTE FICHERO FALTABA ───────────────────────────────────────────────────
 * `src/auth.ts` exportaba `handlers` desde el principio, pero nadie los
 * montaba: la autenticación estaba escrita y **desconectada**. Ningún test lo
 * vio porque todos fabricaban la sesión en vez de pedirla al servidor.
 *
 * Lo encontró el primer test del camino real, al intentar hacer login de verdad
 * y recibir un 404. Es exactamente el fallo que describe
 * `.claude/rules/testing.md` § «Verificación por el CAMINO REAL».
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `runtime = "nodejs"` no es opcional: `authorize` usa Argon2id (módulo nativo)
 * y el driver de Neon. En el runtime edge no arrancan.
 */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
