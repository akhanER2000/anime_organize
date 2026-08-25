import { cn } from "@/lib/ui/cn";

/**
 * EL LOGOTIPO DE LA LANDING — hexágono de laja partida + palabra en Cormorant.
 *
 * Aparece dos veces en el artboard 02 (nav del hero y pie) con el mismo dibujo
 * y distinto tamaño de icono. Está aquí, en un solo sitio, para que no acaben
 * siendo dos logotipos ligeramente distintos.
 *
 * El color del trazo entra por `currentColor` desde el `<span>` que lo envuelve,
 * igual que en `(auth)/layout.tsx`: una utilidad `stroke-[var(--x)]` es
 * ambigua para Tailwind v4 —no puede saber si es color o grosor— y `text-*` no.
 *
 * El tamaño del texto es `text-marca` (19 px), **la excepción declarada** a
 * «Cormorant nunca por debajo de 26 px» que `globals.css` documenta para el
 * logotipo y solo para el logotipo. El artboard dibuja 19 px en la nav y 15 en
 * el pie; DESIGN-SPEC §2 admite 15–19 y el sistema solo tiene el token de 19,
 * así que los dos usan 19. Anotado en `SUPUESTOS.md`.
 */
export function Marca({ tamanoIcono = 22 }: { tamanoIcono?: number }) {
  return (
    <span className="inline-flex items-center gap-[var(--e-1-5)] text-[var(--gold-400)]">
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
        <path d="M3 7 L21 17" opacity=".3" />
      </svg>
      <span
        className={cn(
          "font-display text-marca font-[var(--fw-display)] uppercase",
          "leading-[var(--lh-solido)] tracking-marca text-[var(--porcelain-050)]",
        )}
      >
        Anime Vault
      </span>
    </span>
  );
}
