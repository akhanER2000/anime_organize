import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad de .claude/rules/security.md §6.
 * La CSP permite exactamente tres origenes externos: AniList, Anthropic y las
 * fuentes de Google. Anadir un cuarto es una decision consciente.
 */
const cspProduccion = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://graphql.anilist.co https://api.anthropic.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// En desarrollo Next necesita eval para el refresco en caliente y websockets.
const cspDesarrollo = cspProduccion
  .replace("script-src 'self'", "script-src 'self' 'unsafe-eval' 'unsafe-inline'")
  .replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*")
  .replace("; upgrade-insecure-requests", "");

const esProduccion = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: esProduccion ? cspProduccion : cspDesarrollo },
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
