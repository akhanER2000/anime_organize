import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Inter } from "next/font/google";

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
  themeColor: "#07080a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
