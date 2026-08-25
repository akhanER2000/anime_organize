/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA POLÍTICA DE SEGURIDAD DE CONTENIDO, EN UN SOLO SITIO.
 *
 * ── EL FALLO QUE LA TRAJO AQUÍ ─────────────────────────────────────────────
 *
 * La CSP vivía en `next.config.ts` con `script-src 'self'` y **sin nonce**.
 * Parecía la opción estricta y correcta. Lo que hacía en realidad era servir la
 * aplicación **en blanco** en producción.
 *
 * Next.js entrega el árbol de React como una serie de `<script>` EN LÍNEA con
 * el payload RSC (`self.__next_f.push(...)`) — 184 de ellos en una sola página
 * de este proyecto—. Con `script-src 'self'`, el navegador bloquea los 184: los
 * chunks externos sí cargan, React arranca, no encuentra payload y **vacía el
 * árbol**. Resultado medido con la CSP real: `querySelector('h1') === null`,
 * cero inputs, `body.innerText === ""`. Negro total en las tres pantallas.
 *
 * Y lo peor: en desarrollo no se ve, porque la CSP de desarrollo añade
 * `'unsafe-inline'`. Un fallo que solo existe en producción y que el build no
 * detecta, porque compilar sale bien: lo que falla es el navegador del usuario.
 *
 * `.claude/rules/security.md` §6 ya decía «Los `script-src` usan **nonce** por
 * petición». La regla estaba escrita; el código no la implementaba. Otra vez el
 * mismo patrón: la protección existía en el papel y no en el camino real.
 *
 * ── POR QUÉ EL NONCE Y NO `'unsafe-inline'` ────────────────────────────────
 *
 * `'unsafe-inline'` arreglaría el blanco en una línea, y desactivaría la CSP
 * para lo único que de verdad protege: un XSS que inyecte un `<script>` se
 * ejecutaría con permiso. El nonce es un valor aleatorio por petición que el
 * atacante no puede adivinar ni leer antes de que su carga se sirva, así que
 * los scripts de Next se ejecutan y los inyectados no.
 *
 * `'strict-dynamic'` acompaña al nonce: permite que un script ya confiado
 * cargue los suyos —que es exactamente lo que hace el runtime de Next— sin
 * tener que enumerar cada chunk.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Los tres orígenes externos permitidos, y solo tres. Añadir un cuarto es una
 * decisión consciente que se justifica aquí:
 *
 *   · `graphql.anilist.co`  — el enriquecimiento de fichas
 *   · `api.anthropic.com`   — el paso 2 del enriquecimiento
 *   · fuentes de Google     — Cormorant, Inter e IBM Plex Mono
 */
export function construirCsp(opciones: { nonce: string; desarrollo: boolean }): string {
  const { nonce, desarrollo } = opciones;

  const scriptSrc = desarrollo
    ? // En desarrollo Next necesita `eval` para el refresco en caliente. El
      // nonce va igualmente para que el camino que se prueba a diario sea el
      // mismo que corre en producción — si solo lo pusiéramos en producción,
      // un fallo del nonce se descubriría al desplegar.
      `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const connectSrc = desarrollo
    ? "'self' ws: http://localhost:* https://graphql.anilist.co https://api.anthropic.com"
    : "'self' https://graphql.anilist.co https://api.anthropic.com";

  const directivas = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // `'unsafe-inline'` en estilos es inevitable con Tailwind v4 y next/font, y
    // es MUCHO menos grave: un `<style>` inyectado no ejecuta código. Se acepta
    // conscientemente, igual que documenta `security.md` §6.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  // `upgrade-insecure-requests` en desarrollo rompería `http://localhost`.
  if (!desarrollo) directivas.push("upgrade-insecure-requests");

  return directivas.join("; ");
}

/**
 * Un nonce nuevo por petición.
 *
 * `crypto.getRandomValues` está disponible en el runtime Edge, que es donde
 * corre el middleware. **No vale `Math.random()`**: un nonce adivinable no es
 * un nonce, es un `'unsafe-inline'` con pasos extra.
 *
 * 16 bytes en base64 son 128 bits de entropía, lo que recomienda la
 * especificación de CSP.
 */
export function generarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // `btoa` existe en Edge y en Node ≥16. Se evita `Buffer`, que no está en Edge.
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

/** La cabecera donde viaja el nonce hasta los Server Components. */
export const CABECERA_NONCE = "x-nonce";
