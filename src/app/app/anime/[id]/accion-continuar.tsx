import { Boton } from "@/components/ui/boton";
import { cn } from "@/lib/ui/cn";
import { esHrefSeguro } from "@/lib/ui/href";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA ACCIÓN PRIMARIA DE LA FICHA — el enlace de continuación más reciente.
 *
 * `anime-vault-domain` §7: «El más reciente por `last_used_at` es la acción
 * primaria de la card y de la ficha». Un clic lo abre en pestaña nueva.
 *
 * ── ES UN `<a>`, NO UN `<button>`, Y NO ES UN DETALLE ─────────────────────
 * Navega a otro sitio. Solo un ancla se abre con el clic central, se copia con
 * «copiar dirección del enlace», se arrastra a la barra de marcadores y
 * funciona con JavaScript caído. Un `<button>` con `window.open` pierde las
 * cuatro cosas — y encima lo bloquea el navegador si el clic no es directo.
 *
 * ── LA URL LA PEGA EL USUARIO: ES XSS ALMACENADO SI NO SE MIRA ────────────
 * `security.md` §8: «Las URLs de `continue_link` se validan (`http`/`https`
 * únicamente) antes de renderizarse como `href`; `javascript:` es XSS».
 *
 * Hay TRES capas sobre esto y ninguna sobra:
 *   1. el `CHECK ck_continue_link_url` de la base (`~* '^https?://'`),
 *   2. `esHrefSeguro` aquí, que decide con el parser de URL y no con
 *      `startsWith` — ` javascript:` con espacios delante lo esquivaría—,
 *   3. la primitiva `Enlace`, que se niega a renderizar un esquema que no sea
 *      http(s) y además pone `rel="noopener noreferrer"` sola.
 *
 * La capa 2 existe para **no pintar un botón dorado que no hace nada**: sin
 * ella, `Enlace` degrada a texto inerte con aspecto de acción primaria, que es
 * peor que decir la verdad.
 *
 * ── EL ÚNICO BOTÓN DE RELLENO DORADO DE LA PANTALLA ──────────────────────
 * Regla del oro nº 3. En la ficha es este. Todo lo demás va en obsidiana con
 * borde, o sin borde.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type EnlaceDeContinuacion = {
  url: string;
  /** Legible: «AnimeFLV V2 · Ep 7». `null` si el usuario no puso ninguna. */
  etiqueta: string | null;
};

export function AccionContinuar({ enlace }: { enlace: EnlaceDeContinuacion | null }) {
  // ── ESTADO «SIN ENLACES DE CONTINUACIÓN» (DESIGN-SPEC §6) ───────────────
  // Hoy es el ÚNICO estado que se ve: `continue_link` está vacía en la base y
  // `enlaceMasReciente()` devuelve `null` para los 83 animes. Así que este es
  // el texto que va a leer el dueño del vault, no un caso de borde.
  if (enlace === null) {
    return (
      <p
        className={cn(
          "rounded-boton border border-dashed border-[var(--slate-600)]",
          "px-[var(--e-2)] py-[var(--e-1-5)] text-center",
          "font-ui text-ui-s leading-ui text-[var(--porcelain-200)]",
        )}
      >
        Sin enlaces para continuar.
        <span className="mt-[var(--e-05)] block font-mono text-mono-s text-[var(--ash-400)]">
          Cuando guardes el capítulo por el que vas, aparecerá aquí.
        </span>
      </p>
    );
  }

  // Un `href` que no sea http(s) no se pinta como acción: se dice que está
  // roto. Ver las tres capas en la cabecera.
  if (!esHrefSeguro(enlace.url)) {
    return (
      <p
        role="alert"
        className={cn(
          "rounded-boton border px-[var(--e-2)] py-[var(--e-1-5)] text-center",
          "border-[var(--estado-abandonado-borde)] bg-[var(--estado-abandonado-wash)]",
          "font-ui text-ui-s leading-ui text-[var(--estado-abandonado-texto)]",
        )}
      >
        <span aria-hidden="true">⚠ </span>
        El enlace guardado no es una dirección web válida, así que no se abre.
      </p>
    );
  }

  const etiqueta = enlace.etiqueta?.trim() ?? "";

  return (
    <Boton href={enlace.url} externo variante="solido" ancho>
      <span aria-hidden="true">▶</span>
      {/* La etiqueta es la que escribió el usuario («AnimeFLV V2 · Ep 7»). Sin
       * ella, un texto genérico: nunca uno inventado con datos del anime. */}
      {etiqueta.length > 0 ? etiqueta : "Continuar viendo"}
    </Boton>
  );
}
