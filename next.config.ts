import type { NextConfig } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CABECERAS DE SEGURIDAD — `.claude/rules/security.md` §6.
 *
 * ── LA CSP DE LAS PÁGINAS NO ESTÁ AQUÍ, Y ES A PROPÓSITO ───────────────────
 *
 * Estaba, con `script-src 'self'` y sin nonce, y **servía la aplicación en
 * blanco en producción**: Next entrega el árbol de React en `<script>` EN LÍNEA
 * (184 en una sola pantalla de este proyecto) y esa directiva los bloquea
 * todos. Medido con la CSP real: cero `<h1>`, cero inputs, `body.innerText`
 * vacío. En desarrollo no se veía porque la CSP de desarrollo llevaba
 * `'unsafe-inline'`.
 *
 * Un nonce hay que generarlo **por petición**, y `headers()` de Next es
 * estática: se evalúa una vez al construir. Por eso la CSP de las páginas vive
 * ahora en `src/middleware.ts`, que sí corre por petición. Ver
 * `src/lib/security/csp.ts` para el porqué completo.
 *
 * Aquí queda **solo la de `/api/*`**, que el middleware no cubre (está fuera de
 * su matcher, también a propósito). Esas respuestas son JSON y binarios: no
 * ejecutan scripts, así que `script-src 'none'` es la respuesta correcta y la
 * más estricta posible.
 *
 * IMPORTANTE: no volver a poner una CSP para `/:path*`. Se acumularía con la
 * del middleware y **el navegador aplica la intersección**, así que la más
 * restrictiva ganaría y volvería el blanco.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const cspDeApi = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'none'",
  "img-src 'self' data: blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

const esProduccion = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        // La CSP de las páginas la pone el middleware, con nonce por petición.
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: cspDeApi }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          ...(esProduccion
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
