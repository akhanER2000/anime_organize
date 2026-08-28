import { cn } from "@/lib/ui/cn";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL LOGOTIPO — hexágono de laja partida y la palabra en Cormorant.
 *
 * ── HABÍA TRES DIBUJOS DISTINTOS DE LA MISMA MARCA ────────────────────────
 *
 * | dónde | icono | palabra |
 * |---|---|---|
 * | landing (`marca.tsx`) | hexágono ancho 24×24 | «Anime Vault» en una línea |
 * | auth (`(auth)/layout.tsx`) | hexágono ALTO 25×42 | «Anime⏎Vault» en dos |
 * | barra del vault | el mismo alto, a 18×30 | «Anime⏎Vault», y sin el peso |
 *
 * No es una diferencia de tamaño: son **dos figuras geométricas distintas**
 * —una ancha y una alargada— y dos formas de escribir el nombre. Quien pasa de
 * la landing al login ve cambiar el logotipo, que es lo único de una interfaz
 * que nunca debería cambiar.
 *
 * ── QUIÉN GANA, Y NO ES UNA OPINIÓN ───────────────────────────────────────
 *
 * `design/ANIME-VAULT.dc.html`, que es el diseño aprobado:
 *
 *   · `M12 2 L21 7 v10 L12 22 L3 17 V7 Z` aparece **10 veces**. El hexágono
 *     alargado de auth y de la barra: **0**. Se lo inventaron las dos.
 *   · «ANIME VAULT» aparece **12 veces en una sola línea**. Partida en dos:
 *     **0**.
 *
 * Diez contra cero no se discute.
 *
 * ── LO QUE SÍ VARÍA, Y ESTÁ EN EL DISEÑO ──────────────────────────────────
 *
 * Tres cosas, y por eso son props en vez de tres ficheros:
 *
 *   · **el tamaño** — 22 px en la nav del hero, 20 en la barra del vault, 18 en
 *     el pie de la landing;
 *   · **el tono de la palabra** — `--porcelain-050` sobre el hero, `-100` en el
 *     resto;
 *   · **la tercera veta** (`M3 7 L21 17` al 30 %) — solo la lleva el logotipo
 *     grande de la nav del hero; el de 18 y el de 20 llevan solo la vertical.
 *
 * ── EL COLOR DEL TRAZO ENTRA POR `currentColor` ───────────────────────────
 *
 * Una utilidad `stroke-[var(--x)]` es ambigua para Tailwind v4 —no puede saber
 * si el valor es un color o un grosor— y `text-*` no lo es. Por eso el `<span>`
 * lleva el color y el `<svg>` hereda.
 *
 * ── LOS 19 PX SON LA ÚNICA EXCEPCIÓN A «CORMORANT NUNCA BAJO 26» ──────────
 *
 * `design-tokens.md` lo prohíbe, y `globals.css` declara `--text-marca` como la
 * excepción **para el logotipo y solo para el logotipo**. El artboard dibuja
 * 19, 16 y 15 según el sitio; el sistema tiene un solo token y los tres lo usan.
 * Anotado en `SUPUESTOS.md`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsMarca = {
  /** 22 en la nav del hero · 20 en la barra del vault · 18 en el pie. */
  readonly tamanoIcono?: number;
  /** `claro` es `--porcelain-050`, para el hero. El resto usa `normal`. */
  readonly tono?: "claro" | "normal" | "apagado";
  /** La diagonal al 30 %. Solo el logotipo grande de la nav del hero. */
  readonly conVetaDiagonal?: boolean;
  /**
   * En móvil se enseña solo el hexágono; la palabra aparece a partir de tablet.
   *
   * Es lo que necesita la barra del vault, donde el buscador se come el ancho.
   * Va como prop y no como una clase suelta del que llama porque afecta a la
   * ESTRUCTURA de la marca: quien la esconda por su cuenta acabará escondiendo
   * el `<span>` equivocado el día que este componente cambie por dentro.
   */
  readonly palabraDesdeTablet?: boolean;
  readonly className?: string;
};

const TONOS = {
  claro: "text-[var(--porcelain-050)]",
  normal: "text-[var(--porcelain-100)]",
  apagado: "text-[var(--porcelain-200)]",
} as const;

export function Marca({
  tamanoIcono = 22,
  tono = "normal",
  conVetaDiagonal = false,
  palabraDesdeTablet = false,
  className,
}: PropsMarca) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[var(--e-1-5)] text-[var(--gold-400)]",
        className,
      )}
    >
      <svg
        width={tamanoIcono}
        height={tamanoIcono}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M12 2 L21 7 v10 L12 22 L3 17 V7 Z" />
        <path d="M12 2 L12 22" opacity=".55" />
        {conVetaDiagonal && <path d="M3 7 L21 17" opacity=".3" />}
      </svg>

      <span
        className={cn(
          "font-display text-marca font-[var(--fw-display)] uppercase",
          // `whitespace-nowrap` no es cosmética: es lo que impide que vuelva a
          // partirse en dos líneas cuando el contenedor se estreche.
          "leading-[var(--lh-solido)] tracking-marca whitespace-nowrap",
          palabraDesdeTablet && "hidden tablet:inline",
          TONOS[tono],
        )}
      >
        Anime Vault
      </span>
    </span>
  );
}
