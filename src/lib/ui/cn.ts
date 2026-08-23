import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Une clases y resuelve conflictos de Tailwind.
 *
 * `twMerge` importa: sin él, `cn("px-4", "px-6")` deja las dos y gana la que el
 * CSS ponga última, que es impredecible. Con él gana la última que se pasa, que
 * es lo que espera quien escribe el componente.
 */
export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}
