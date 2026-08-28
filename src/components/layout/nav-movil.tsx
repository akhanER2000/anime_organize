"use client";

import { usePathname } from "next/navigation";

import { Enlace } from "@/components/ui/enlace";
import { TRANSICION_RAPIDA } from "@/lib/ui/clases";
import { cn } from "@/lib/ui/cn";
import { enfocarBuscador, pedirAbrirAnadir } from "@/lib/ui/eventos";

import type { ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NAVEGACIÓN INFERIOR — artboard 12, y DESIGN-SPEC §12.
 *
 * «4 ítems, 52 px de alto + 22 px de safe area, veta dorada de 1 px en el
 * borde superior; ítem activo en `--gold-200`, resto en `--ash-400`.»
 *
 * ── POR QUÉ EXISTE, Y QUÉ RESUELVE ──────────────────────────────────────
 *
 * En móvil la barra superior sólo cabe con la marca y el buscador. Sin esta
 * barra, «añadir» y «ajustes» viven detrás de un menú que no está, y la única
 * forma de llegar a Ajustes desde el teléfono es escribir la URL.
 *
 * ── LA SAFE AREA NO ES OPCIONAL ─────────────────────────────────────────
 *
 * `env(safe-area-inset-bottom)` es la franja del gesto de inicio en los
 * teléfonos sin botón. Sin reservarla, el ítem de la derecha queda **debajo de
 * la barra del sistema** y no se puede pulsar — y en el emulador de escritorio
 * no se nota, porque ahí ese inset vale 0. La spec pide 22 px; se usa el
 * máximo entre eso y lo que diga el dispositivo.
 *
 * ── EL ACTIVO SE DICE CON TEXTO, NO SÓLO CON COLOR ──────────────────────
 *
 * `aria-current="page"` además del oro. Es la misma regla que los estados de un
 * anime: el color nunca comunica solo.
 *
 * ── SE OCULTA DESDE `tablet`, NO SE DESMONTA ────────────────────────────
 *
 * `tablet:hidden` y no un `useMediaQuery`: leer el ancho en JavaScript obliga a
 * pintar primero y corregir después, y eso es un salto visible en cada carga.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Dos clases de ítem, y la diferencia importa.
 *
 * · `href` → NAVEGA. Es un enlace de verdad: se puede abrir en otra pestaña,
 *   copiar la dirección y funciona con el JavaScript caído.
 * · `accion` → HACE ALGO en esta pantalla (abrir el modal, enfocar el
 *   buscador). Un enlace a `?anadir=1` habría metido el estado del modal en el
 *   historial, así que «atrás» cerraría el modal en vez de volver.
 *
 * Pintarlas iguales y comportarse distinto es lo que hace que una barra de
 * navegación resulte impredecible; aquí se ven iguales porque el diseño lo pide
 * y se comportan como lo que son.
 */
type Item = {
  readonly etiqueta: string;
  readonly icono: ReactNode;
  readonly href?: string;
  readonly accion?: () => void;
  /** Además del `href` exacto, qué rutas cuentan como «estoy aquí». */
  readonly tambien?: readonly string[];
};

/** Trazo de 1,5 px, `currentColor`: hereda el oro o el gris del ítem. */
function Icono({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[22px]"
    >
      {children}
    </svg>
  );
}

const ITEMS: readonly Item[] = [
  {
    href: "/app",
    etiqueta: "Vault",
    // Cuatro cuadrados: la rejilla de la biblioteca.
    icono: (
      <Icono>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </Icono>
    ),
    tambien: ["/app/lista", "/app/anime"],
  },
  {
    accion: () => {
      enfocarBuscador();
    },
    etiqueta: "Buscar",
    icono: (
      <Icono>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </Icono>
    ),
  },
  {
    accion: () => {
      pedirAbrirAnadir();
    },
    etiqueta: "Añadir",
    icono: (
      <Icono>
        <path d="M12 5v14M5 12h14" />
      </Icono>
    ),
  },
  {
    href: "/app/ajustes",
    etiqueta: "Ajustes",
    icono: (
      <Icono>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="9" cy="6" r="2" fill="var(--slate-950)" />
        <circle cx="15" cy="12" r="2" fill="var(--slate-950)" />
        <circle cx="8" cy="18" r="2" fill="var(--slate-950)" />
      </Icono>
    ),
  },
];

function estaActivo(item: Item, ruta: string): boolean {
  // Una acción nunca está «activa»: no es un sitio donde se pueda estar.
  if (item.href === undefined) return false;

  const base = item.href.split("?")[0] ?? item.href;
  if (base === "/app") {
    // `/app` sólo es «el vault» si la ruta es exactamente ésa o una de sus
    // hijas declaradas. Con un `startsWith` a secas, `/app/ajustes` marcaría
    // los DOS ítems y la barra diría dos cosas a la vez.
    return ruta === "/app" || (item.tambien ?? []).some((r) => ruta.startsWith(r));
  }
  return ruta === base || ruta.startsWith(`${base}/`);
}

export function NavMovil() {
  const ruta = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 tablet:hidden",
        "bg-[var(--slate-900)]",
        // La veta dorada de 1 px del borde superior (§12). Va como borde y no
        // como pseudo-elemento para que no tape el primer píxel del contenido.
        "border-t border-[var(--gold-700)]",
      )}
      style={{
        // 22 px de la spec, o lo que pida el dispositivo si es más.
        paddingBottom: "max(var(--e-2-5), env(safe-area-inset-bottom))",
      }}
    >
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const activo = estaActivo(item, ruta);
          const clases = cn(
            "flex h-[var(--e-7)] w-full flex-col items-center justify-center gap-[var(--e-05)]",
            "font-ui text-etiqueta",
            TRANSICION_RAPIDA,
            activo ? "text-[var(--gold-200)]" : "text-[var(--ash-400)]",
          );

          return (
            <li key={item.etiqueta}>
              {item.href === undefined ? (
                <button type="button" className={clases} onClick={item.accion}>
                  {item.icono}
                  {item.etiqueta}
                </button>
              ) : (
                <Enlace
                  {...(activo ? { "aria-current": "page" as const } : {})}
                  href={item.href}
                  desnudo
                  className={clases}
                >
                  {item.icono}
                  {item.etiqueta}
                </Enlace>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
