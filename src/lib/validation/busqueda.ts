import type { ParametrosCrudos } from "./biblioteca";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL NOMBRE DEL PARÁMETRO VIVE AQUÍ, NO EN EL COMPONENTE.
 *
 * ── Y NO ES ORGANIZACIÓN: ERA UN BUG ──────────────────────────────────────
 *
 * Estaba exportado desde `components/anime/buscador.tsx`, que lleva
 * `"use client"`. Cuando un Server Component importa algo de un módulo de
 * cliente, **Next no le da el valor**: le da una referencia de cliente, un
 * proxy que el bundler resuelve en el navegador.
 *
 * Así que `crudos[PARAMETRO_BUSQUEDA]` en el servidor no leía `crudos["q"]`, y
 * `leerConsulta` devolvía `null` SIEMPRE. El buscador escribía `?q=…` en la URL
 * y la página seguía enseñando los 83 — **incluso cargando la URL directamente**,
 * que es lo que separó «la navegación no ocurre» de «el término no llega».
 *
 * El fallo no daba ningún error: todo compilaba, el lint pasaba, la URL
 * cambiaba y la rejilla se pintaba entera. Solo se veía contando tarjetas.
 *
 * ── LA REGLA GENERAL ──────────────────────────────────────────────────────
 *
 * Una constante que usan los dos lados **no puede vivir en un módulo de
 * cliente**. Vive en uno neutral —sin `"use client"` ni `server-only`— y los dos
 * la importan de ahí.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const PARAMETRO_BUSQUEDA = "q";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL TÉRMINO DE BÚSQUEDA, LEÍDO DE LA URL.
 *
 * ── UN SOLO DUEÑO PARA EL NOMBRE DEL PARÁMETRO ────────────────────────────
 *
 * El buscador lo escribe y las dos pantallas lo leen. Si el nombre se escribiera
 * a mano en los tres sitios, cambiarlo rompería dos de ellos **en silencio**: el
 * campo seguiría funcionando y la pantalla dejaría de filtrar, que es la peor
 * forma de romperse.
 *
 * ── UN TÉRMINO VACÍO ES `null`, NO CADENA VACÍA ───────────────────────────
 *
 * Son dos estados distintos: «no se ha buscado» y «se buscó y no hay nada». El
 * primero enseña el vault; el segundo, el vacío de búsqueda. Colapsarlos en `""`
 * obligaría a cada consumidor a acordarse de la diferencia.
 *
 * ── EL TOPE DE 200 NO ES ESTÉTICO ─────────────────────────────────────────
 *
 * El término entra en un `LIKE` con comodines a los dos lados y en un
 * `similarity()`. Una cadena de megabytes en la URL sería trabajo regalado
 * contra la base, y no hay ningún título de 200 caracteres.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function leerConsulta(crudos: ParametrosCrudos): string | null {
  const valor = crudos[PARAMETRO_BUSQUEDA];
  // Un `?q=a&q=b` llega como array: se queda el primero en vez de reventar o de
  // concatenarlos, que produciría un término que nadie escribió.
  const texto = Array.isArray(valor) ? valor[0] : valor;

  if (typeof texto !== "string") return null;

  const limpio = texto.trim().slice(0, 200);
  return limpio === "" ? null : limpio;
}
