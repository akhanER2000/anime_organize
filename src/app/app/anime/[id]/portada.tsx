import { cn } from "@/lib/ui/cn";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA PORTADA DE LA FICHA — DESIGN-SPEC §05 y §12.
 *
 * ── LOS BYTES SALEN DE `/api/covers`, NUNCA DEL DOMINIO ORIGINAL ──────────
 * La URL que pegó el usuario es solo el ORIGEN. Los bytes viven en Postgres,
 * ya re-encodeados por sharp, y se sirven desde nuestro endpoint **después** de
 * comprobar la propiedad. Apuntar al dominio original filtraría a ese host qué
 * mira el usuario y cuándo, y dejaría la portada rota el día que caiga.
 *
 * Esa invariante la comprueba el e2e de esta pantalla interceptando la red: no
 * puede salir ni una petición de imagen a otro dominio.
 *
 * ── DOS FORMAS, UNA SOLA IMAGEN ──────────────────────────────────────────
 * §05 (escritorio): marco `--gold-700` de 1 px con aire alrededor, 2:3.
 * §12 (móvil): **a sangre**, 300 px de alto, con degradado a `--slate-950`.
 *
 * Es el MISMO `<img>` con clases distintas por breakpoint, no dos imágenes
 * ocultándose entre sí: un `hidden` no impide que el navegador descargue el
 * recurso, así que la variante «oculta» costaría una segunda descarga de la
 * portada entera para no verse nunca.
 *
 * ── CÓMO SE SALE DEL PADDING SIN TRUCOS ──────────────────────────────────
 * «A sangre» dentro de un contenedor con 20 px de padding se consigue con un
 * margen negativo del mismo tamaño (`-mx-[var(--e-2-5)]`). Sale del token, así
 * que si el padding de móvil cambia, esto cambia con él. Desde tablet se anula.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function Portada({ src }: { src: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        // MÓVIL: fuera del padding lateral, a sangre.
        "-mx-[var(--e-2-5)]",
        // DESDE TABLET: el marco dorado de 1 px con su aire. §05 pide 10 px;
        // el token que cae al lado es `--e-1` (8), el mismo criterio que usó el
        // panel de arte de la landing con su «10 px de aire». En `SUPUESTOS.md`.
        "tablet:mx-0 tablet:border tablet:border-[var(--gold-700)] tablet:p-[var(--e-1)]",
      )}
    >
      {/* `<img>` y no `next/image`: los bytes ya salen optimizados de nuestro
       * pipeline (WebP 82, 480×720) y pasar por el optimizador de Next sería
       * procesarlos dos veces para nada. Mismo criterio que `AnimeCard`.
       *
       * `alt=""`: es decorativa. El título va en el `<h1>` justo al lado, así
       * que un `alt` con el título lo repetiría en el lector de pantalla. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- ya optimizada por sharp en /api/covers */}
      <img
        src={src}
        alt=""
        // Es la imagen grande de la primera pantalla: nada de `lazy`.
        fetchPriority="high"
        decoding="async"
        className={cn(
          "block w-full",
          // MÓVIL (§12): banda de 300 px. `object-top` porque una portada 2:3
          // recortada a una banda ancha pierde la parte de abajo, no la de
          // arriba, que es donde está lo que identifica la serie.
          "h-[300px] object-cover object-top",
          // DESDE TABLET (§05 y §5): 2:3 SIN EXCEPCIÓN, con el hueco de laja
          // reservado para que no salte el layout mientras carga.
          "tablet:aspect-[2/3] tablet:h-auto tablet:rounded-card tablet:border",
          "tablet:border-[var(--slate-700)] tablet:bg-[var(--slate-850)] tablet:object-center",
        )}
      />

      {/* El degradado a `--slate-950` del artboard móvil: funde el corte de la
       * imagen con el fondo de la página. Desde tablet no existe: ahí la
       * portada está enmarcada y el corte es intencionado. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[var(--e-7)] tablet:hidden",
          "bg-[image:linear-gradient(to_bottom,transparent,var(--slate-950))]",
        )}
      />
    </div>
  );
}
