import Link from "next/link";

import { BadgeEstado } from "@/components/ui/badge";
import { cn } from "@/lib/ui/cn";

import type { Estado } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CARD DE UN ANIME — DESIGN-SPEC §03, y compartida con §04 y §08.
 *
 * ── LA PORTADA SALE SIEMPRE DE `/api/covers`, NUNCA DEL DOMINIO ORIGINAL ──
 *
 * Es la invariante que comprueba el e2e crítico del proyecto. La URL que pegó
 * el usuario es solo el ORIGEN: los bytes viven en Postgres, ya re-encodeados
 * por sharp, y se sirven desde nuestro endpoint tras comprobar la propiedad.
 *
 * Apuntar al dominio original tendría tres problemas a la vez: filtraría a ese
 * dominio qué mira el usuario y cuándo, dejaría la portada rota el día que ese
 * host caiga, y serviría bytes que nadie ha inspeccionado.
 *
 * ── EL `?v=` NO ES DECORACIÓN ─────────────────────────────────────────────
 *
 * La respuesta es `immutable` durante un año, así que sin el checksum en la URL
 * un cambio de portada no se vería nunca. Con él, cambiar la imagen cambia la
 * URL y el navegador pide la nueva.
 *
 * ── PROPORCIÓN 2:3, SIN EXCEPCIÓN ─────────────────────────────────────────
 *
 * `aspect-ratio: 2/3` y `object-fit: cover`. Una card que se salga de eso
 * descuadra la rejilla entera, y el hueco reservado evita el salto de layout
 * mientras la imagen carga.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type AnimeParaCard = {
  id: string;
  titulo: string;
  estado: Estado;
  esFavorito: boolean;
  /** `null` si todavía no tiene portada: se pinta el hueco de laja. */
  checksumPortada: string | null;
  /** La etiqueta que escribió el usuario. Nunca una reescrita por nosotros. */
  progresoEtiqueta: string | null;
};

export function AnimeCard({ anime }: { anime: AnimeParaCard }) {
  const src =
    anime.checksumPortada === null
      ? `/api/covers/${anime.id}`
      : `/api/covers/${anime.id}?v=${anime.checksumPortada}`;

  return (
    <article
      className={cn(
        // §03: «padding-left: 14px + border-left 1px transparent, que pasa a
        // --gold-400 en hover». La veta kintsugi en su segunda forma.
        "group relative border-l border-transparent pl-[var(--e-1-5)]",
        "transition-colors duration-[var(--dur-base)] ease-base",
        "hover:border-[var(--gold-400)]",
      )}
    >
      <Link
        href={`/app/anime/${anime.id}`}
        className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-card border border-[var(--slate-700)] bg-[var(--slate-850)]">
          {/* `<img>` y no `next/image`: los bytes ya salen optimizados de
           * nuestro pipeline (WebP 82, 480×720) y pasar por el optimizador de
           * Next sería procesarlos dos veces para nada. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- ya optimizada por sharp en /api/covers */}
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />

          <div className="absolute left-[var(--e-1)] top-[var(--e-1)]">
            <BadgeEstado estado={anime.estado} />
          </div>

          {anime.esFavorito && (
            <span
              className="absolute right-[var(--e-1)] top-[var(--e-1)] text-[var(--estado-favorito)]"
              // El color no comunica solo: lleva su texto para el lector.
              title="Favorito"
            >
              <span aria-hidden="true">★</span>
              <span className="sr-only">Favorito</span>
            </span>
          )}
        </div>

        {/* `break-words` no es cosmético: el `<li>` de la rejilla lleva `min-w-0`
         * para que un título largo no ensanche su columna, y sin esto una sola
         * palabra larguísima —hay títulos japoneses transliterados sin espacios—
         * se desborda y se pinta ENCIMA de la card vecina. Era la única de las
         * tres pantallas que no lo tenía. */}
        <h3 className="mt-[var(--e-1-5)] break-words font-ui text-ui font-[var(--fw-ui-medium)] leading-ui text-[var(--porcelain-100)]">
          {anime.titulo}
        </h3>

        {anime.progresoEtiqueta !== null && (
          <p className="mt-[var(--e-05)] font-mono text-mono text-[var(--ash-400)]">
            {anime.progresoEtiqueta}
          </p>
        )}
      </Link>
    </article>
  );
}
