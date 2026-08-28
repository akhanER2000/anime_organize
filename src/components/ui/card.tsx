import { cn } from "@/lib/ui/cn";

import type { HTMLAttributes, ReactNode } from "react";

/**
 * CARD — superficie base del sistema.
 *
 * `--slate-850` con borde `--slate-700` y radio 6. El borde superior dorado
 * (`acento`) marca la card destacada de una pantalla: **solo una**, igual que
 * el botón sólido.
 */
/**
 * `className` SÍ se acepta, y es deliberado.
 *
 * Prohibirlo obligaría a las doce pantallas a envolver cada primitiva en un
 * `<div>` solo para colocarla, que es exactamente el código repetido que se
 * quería evitar. Lo que impide inventarse un color no es el tipo: es
 * `npm run lint:tokens`, que falla si aparece un hex fuera de globals.css.
 *
 * Se fusiona con `cn()`, así que lo que se pase aquí GANA sobre lo del
 * componente (twMerge resuelve el conflicto en favor de lo último).
 */
export type PropsCard = {
  /** Borde superior de 1 px en `--gold-400`. Máximo una por pantalla. */
  acento?: boolean;
  /** Card elevada: `--slate-800` en vez de `--slate-850`. */
  elevada?: boolean;
  /** Veta dorada en el borde izquierdo al pasar por encima. */
  vetaEnHover?: boolean;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function Card({
  acento = false,
  elevada = false,
  vetaEnHover = false,
  children,
  className,
  ...resto
}: PropsCard) {
  return (
    <div
      className={cn(
        "rounded-card border border-[var(--slate-700)]",
        elevada ? "bg-[var(--slate-800)]" : "bg-[var(--slate-850)]",
        acento && "border-t-[var(--gold-400)]",
        vetaEnHover &&
          cn(
            "border-l border-l-transparent transition-colors duration-[var(--dur-base)] ease-base",
            "hover:border-l-[var(--gold-400)]",
          ),
        className,
      )}
      {...resto}
    >
      {children}
    </div>
  );
}

/**
 * VETA KINTSUGI — divisor de sección.
 *
 * Una de las TRES formas permitidas del sistema (DESIGN-SPEC §1). Las otras dos
 * son el borde izquierdo en hover (`Card vetaEnHover`) y la veta decorativa SVG,
 * que solo va en el hero de la landing y el header del dashboard.
 */
export function Veta({ corta = false }: { corta?: boolean }) {
  return <div className={corta ? "veta-corta" : "veta-divisor"} role="presentation" />;
}

/**
 * BARRA DE PROGRESO — DESIGN-SPEC §6, fila «Barra de progreso».
 *
 * Hairline de 1 px en la card, 2 px en la ficha. En estado ABANDONADO el relleno
 * es granate **sin halo**: el halo dorado es de progreso vivo.
 *
 * `porcentaje: null` = progreso indeterminado (tipo CUSTOM sin total conocido):
 * se pinta la pista sola, sin relleno. Ver `anime-vault-domain` §4.
 */
export type PropsBarraProgreso = {
  /** 0–100, o `null` si es indeterminado. */
  porcentaje: number | null;
  grosor?: "hairline" | "acento";
  abandonado?: boolean;
  /** Texto para lectores de pantalla: «Temporada 2 · episodio 7». */
  etiqueta: string;
  /**
   * Dentro de una figura decorativa: se pinta igual pero NO se anuncia.
   *
   * ── POR QUÉ ESTA PROP EXISTE ─────────────────────────────────────────────
   *
   * Sin ella, la landing tenía **dos reconstrucciones a mano** de esta misma
   * barra —en `sincronia.tsx` y en `vistazo.tsx`—, con la pista, el relleno y
   * el halo copiados. Coincidían hoy; el día que la barra cambie de grosor o de
   * halo, cambiará en el vault y no en la landing, y nadie lo notará porque las
   * dos pantallas no se miran juntas.
   *
   * No usaban la primitiva por un motivo real: un `role="progressbar"` dentro de
   * una maqueta decorativa anuncia al lector de pantalla un progreso que no es
   * de nadie. La respuesta correcta no era copiar el aspecto, era dejar que la
   * SEMÁNTICA varíe manteniendo un solo dueño del dibujo.
   */
  decorativa?: boolean;
};

export function BarraProgreso({
  porcentaje,
  grosor = "hairline",
  abandonado = false,
  etiqueta,
  decorativa = false,
}: PropsBarraProgreso) {
  const acotado = porcentaje === null ? null : Math.min(100, Math.max(0, porcentaje));

  return (
    <div
      role={decorativa ? undefined : "progressbar"}
      aria-hidden={decorativa ? true : undefined}
      aria-valuenow={decorativa ? undefined : (acotado ?? undefined)}
      aria-valuemin={decorativa ? undefined : 0}
      aria-valuemax={decorativa ? undefined : 100}
      aria-label={decorativa ? undefined : etiqueta}
      className={cn(
        "w-full overflow-hidden rounded-barra bg-[var(--slate-700)]",
        grosor === "hairline" ? "h-px" : "h-[2px]",
      )}
    >
      {acotado !== null && (
        <div
          className={cn(
            "h-full rounded-barra transition-[width] duration-[var(--dur-lenta)] ease-base",
            abandonado
              ? "bg-[var(--estado-abandonado)]"
              : "bg-[var(--gold-400)] shadow-[var(--halo-punto)]",
          )}
          style={{ width: `${acotado}%` }}
        />
      )}
    </div>
  );
}
