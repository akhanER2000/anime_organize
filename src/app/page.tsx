import { Landing } from "@/app/(publico)/landing/landing";

import type { Metadata } from "next";

/**
 * `/` — la landing pública (artboard 02).
 *
 * La pantalla entera vive en `src/app/(publico)/landing/`; aquí solo se monta,
 * porque la ruta raíz no puede estar dentro del grupo `(publico)` sin dejar de
 * ser `/`.
 *
 * **No se declara `dynamic` aquí**: lo hace el layout raíz para toda la
 * aplicación, y es un requisito de la CSP —el nonce se genera por petición y no
 * cabe en un HTML prerenderizado, así que una página estática se serviría en
 * blanco en producción—. Ver el comentario largo de `src/app/layout.tsx`.
 */
export const metadata: Metadata = {
  title: { absolute: "Anime Vault · lo que viste, guardado en piedra" },
  // ── LA DESCRIPCIÓN TAMBIÉN PROMETÍA LO QUE NO EXISTE ──────────────────
  //
  // Decía «Importa desde AniList o desde un .xlsx». La importación no está
  // construida, y esta frase es **la más pública de todas**: es la que sale en
  // Google y en la previsualización de cualquier enlace que se comparta.
  //
  // Se coló al limpiar la landing porque no está en la landing: vive en la
  // metadata de la página, y el recorrido en navegador solo mira texto VISIBLE.
  // Por eso el test de esta pantalla comprueba ahora también el `<meta>`.
  description:
    "Tu biblioteca personal de anime: qué viste, por dónde vas y el enlace exacto para seguir, en una sola pantalla.",
};

export default function Home() {
  return <Landing />;
}
