import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Inter } from "next/font/google";

import { COLOR_CROMO_NAVEGADOR } from "@/lib/design/cromo-navegador";

import "./globals.css";

/**
 * Las tres familias del sistema, con los pesos del paquete de diseño y
 * NINGUNO más. Cargarlas con next/font las autoaloja: no hay petición a
 * Google en runtime, que además es lo que exige la CSP.
 */
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--fuente-display",
  display: "swap",
});

const ui = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-ui",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--fuente-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Anime Vault",
    template: "%s · Anime Vault",
  },
  description:
    "Tu catálogo personal de anime: portadas, progreso y enlaces para continuar donde lo dejaste.",
  applicationName: "Anime Vault",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: COLOR_CROMO_NAVEGADOR,
  colorScheme: "dark",
};

/**
 * ── TODA LA APLICACIÓN ES DINÁMICA, Y ES UNA CONSECUENCIA DE LA CSP ────────
 *
 * La CSP de este proyecto usa un **nonce por petición** para los `<script>` en
 * línea que Next emite con el payload de React (`security.md` §6). Un nonce por
 * petición **no cabe en una página estática**: el HTML de una ruta prerenderizada
 * se genera una vez, al construir, y se sirve idéntico a todo el mundo — no hay
 * dónde meter un valor que cambia en cada visita.
 *
 * Consecuencia comprobada: con `/login` como `○ (Static)`, la cabecera llevaba
 * el nonce correcto y el HTML servía **9 scripts en línea sin nonce**. El
 * navegador los bloqueaba y la pantalla salía **en blanco**. La cabecera estaba
 * bien y la página seguía rota; medirlo en el HTML servido fue lo único que lo
 * enseñó.
 *
 * Las alternativas y por qué no:
 *
 *   · `'unsafe-inline'` — arregla el blanco y desactiva la CSP para lo único que
 *     de verdad protege. Un XSS inyectado se ejecutaría con permiso.
 *   · `'unsafe-inline'` como respaldo junto al nonce (los navegadores modernos
 *     lo ignoran si hay nonce) — pero las páginas estáticas NO tienen nonce, así
 *     que quedarían apoyadas justo en el respaldo inseguro. Peor: parecería
 *     protegido.
 *   · Hashes en vez de nonce — Next no emite los hashes de sus scripts.
 *
 * El coste es una función por visita en vez de un fichero de CDN. Para un vault
 * personal y multiusuario donde **casi todo depende de la sesión** —y donde
 * `api-conventions.md` ya exige dinamismo para eso— es un coste que no se nota.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
