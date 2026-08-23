import { notFound } from "next/navigation";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RUTAS DE DESARROLLO — NO EXISTEN EN PRODUCCIÓN.
 *
 * Este layout envuelve TODO lo que cuelgue de `/dev`, así que la exclusión no
 * depende de que cada página se acuerde de comprobarlo: se hereda. Una página
 * nueva bajo `/dev` está protegida sin hacer nada.
 *
 * En producción devuelve 404 —no 403— por el mismo motivo que el resto del
 * proyecto: un 403 confirma que la ruta existe.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function LayoutDev({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <>{children}</>;
}
