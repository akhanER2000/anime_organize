import { cn } from "@/lib/ui/cn";

/**
 * SKELETON — DESIGN-SPEC artboard 11.
 *
 * Shimmer dorado a 2,6 s, con desfase de 0 / .3 / .6 s por columna para que no
 * pulsen todos a la vez.
 *
 * `prefers-reduced-motion` ya desactiva la animación desde `globals.css`: no hay
 * que hacer nada aquí, pero conviene saber que el skeleton sigue siendo visible
 * (fondo plano) para quien la tenga puesta.
 */
export type PropsSkeleton = {
  /** Índice de columna: aplica el desfase 0 / .3 / .6 s. */
  columna?: 0 | 1 | 2;
  /** Alto en tokens de espaciado o una clase de altura. */
  alto?: string;
  ancho?: string;
  /** Proporción 2:3, para huecos de portada. */
  portada?: boolean;
  redondeo?: "card" | "input" | "chip" | "avatar";
};

const DESFASE = ["0s", "0.3s", "0.6s"] as const;

export function Skeleton({
  columna = 0,
  alto = "h-4",
  ancho = "w-full",
  portada = false,
  redondeo = "input",
}: PropsSkeleton) {
  return (
    <div
      // `aria-hidden`: un esqueleto no tiene contenido que anunciar. Lo que se
      // anuncia es el `aria-busy` del contenedor que lo envuelve.
      aria-hidden="true"
      className={cn(
        "skeleton-veta",
        portada ? "aspect-[2/3] w-full" : cn(alto, ancho),
        redondeo === "card" && "rounded-card",
        redondeo === "input" && "rounded-input",
        redondeo === "chip" && "rounded-chip",
        redondeo === "avatar" && "rounded-avatar",
      )}
      style={{ animationDelay: DESFASE[columna] }}
    />
  );
}

/** Rejilla de esqueletos de portada, con el desfase por columna ya puesto. */
export function SkeletonRejilla({ cuantos = 5 }: { cuantos?: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Cargando tu biblioteca"
      className="grid grid-cols-2 gap-x-[var(--gutter-s)] gap-y-[28px] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {Array.from({ length: cuantos }, (_, i) => (
        <div key={i} className="flex flex-col gap-[var(--e-1)]">
          <Skeleton portada redondeo="card" columna={(i % 3) as 0 | 1 | 2} />
          <Skeleton alto="h-4" ancho="w-4/5" columna={(i % 3) as 0 | 1 | 2} />
          <Skeleton alto="h-3" ancho="w-1/2" columna={(i % 3) as 0 | 1 | 2} />
        </div>
      ))}
    </div>
  );
}
