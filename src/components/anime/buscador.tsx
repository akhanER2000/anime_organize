"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CAJA_DE_CONTROL } from "@/lib/ui/clases";
import { ID_BUSCADOR } from "@/lib/ui/eventos";
import { PARAMETRO_BUSQUEDA } from "@/lib/validation/busqueda";
import { cn } from "@/lib/ui/cn";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUSCADOR GLOBAL — artboard 07, y el hueco de la barra superior de §03.
 *
 * ── EL TÉRMINO VIVE EN LA URL ─────────────────────────────────────────────
 *
 * `api-conventions.md`: «el estado de filtros vive en la URL, no en el
 * cliente: una vista se comparte pegando el enlace». Lo mismo vale para el
 * buscador, y además da gratis el botón de atrás, la recarga y el marcador.
 *
 * ── EL DEBOUNCE ES DE 250 ms Y NO ES UN NÚMERO SUELTO ─────────────────────
 *
 * Cada pulsación sin debounce es una navegación del servidor y una consulta.
 * Escribir «attack on titan» son 16 consultas para enseñar una. El encargo fija
 * 250 ms: por debajo se notan las consultas de más, por encima se nota el
 * retraso.
 *
 * ── LA PRIMERA BÚSQUEDA APILA; LAS DEMÁS REEMPLAZAN ──────────────────────
 *
 * Con `push` en cada tecla, salir de «attack on titan» con el botón de atrás
 * son dieciséis pulsaciones.
 *
 * Con `replace` en TODAS —que fue la primera versión— pasa lo contrario y es
 * peor: la entrada de «el vault sin buscar» se pisa con la primera letra, así
 * que **atrás te saca del vault entero**. Lo cazó el recorrido en navegador
 * intentando deshacer una búsqueda.
 *
 * La combinación correcta es la mixta: `push` cuando no había término —para que
 * quede UNA entrada de «antes de buscar»— y `replace` mientras se escribe. Así
 * una sola pulsación de atrás deshace la búsqueda entera.
 *
 * ── EL VALOR ES LOCAL Y LA URL LO SIGUE, NO AL REVÉS ──────────────────────
 *
 * El input es controlado por un estado propio. Si leyera directamente de la
 * URL, cada letra viajaría al servidor y volvería, y el campo iría a tirones —
 * escribiendo rápido se pierden letras porque llega una respuesta con el valor
 * de hace 200 ms. El estado local escribe al instante y la URL le sigue.
 *
 * ── «/» ENFOCA, «Esc» LIMPIA ──────────────────────────────────────────────
 *
 * Es lo que pide el encargo, y el atajo se ignora si el foco ya está en un
 * campo de texto: escribir una barra dentro de una nota no puede robar el foco
 * al buscador. Ese detalle es el que separa un atajo útil de uno molesto.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const RETARDO_MS = 250;

export function Buscador({ placeholder = "Buscar por título, género o etiqueta…" }) {
  const parametros = useSearchParams();
  const ruta = usePathname();
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);

  const enLaUrl = parametros.get(PARAMETRO_BUSQUEDA) ?? "";
  const [valor, setValor] = useState(enLaUrl);

  // ── LA URL MANDA CUANDO CAMBIA POR FUERA ────────────────────────────────
  //
  // Atrás, adelante, o un enlace pegado. Sin esto, volver atrás cambiaría los
  // resultados y dejaría el campo con lo de antes: la pantalla diría dos cosas.
  useEffect(() => {
    setValor(enLaUrl);
  }, [enLaUrl]);

  // ── EL DEBOUNCE ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (valor === enLaUrl) return;

    const temporizador = setTimeout(() => {
      const siguiente = new URLSearchParams(parametros.toString());
      if (valor.trim() === "") siguiente.delete(PARAMETRO_BUSQUEDA);
      else siguiente.set(PARAMETRO_BUSQUEDA, valor);

      const cadena = siguiente.toString();
      const destino = cadena === "" ? ruta : `${ruta}?${cadena}`;

      // `push` solo al EMPEZAR a buscar: es lo que deja en el historial la
      // vista de antes. Mientras se escribe, `replace`, o cada letra sería una
      // entrada. Ver la cabecera.
      if (enLaUrl === "") router.push(destino, { scroll: false });
      else router.replace(destino, { scroll: false });
    }, RETARDO_MS);

    return () => {
      clearTimeout(temporizador);
    };
  }, [valor, enLaUrl, parametros, ruta, router]);

  // ── «/» ENFOCA ──────────────────────────────────────────────────────────
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== "/") return;

      // Si ya se está escribiendo en algo, la barra es una barra. Sin esta
      // comprobación, escribir «AC/DC» en una nota saltaría al buscador.
      const activo = document.activeElement;
      const escribiendo =
        activo instanceof HTMLInputElement ||
        activo instanceof HTMLTextAreaElement ||
        (activo instanceof HTMLElement && activo.isContentEditable);
      if (escribiendo) return;

      evento.preventDefault();
      campo.current?.focus();
    };

    window.addEventListener("keydown", alPulsar);
    return () => {
      window.removeEventListener("keydown", alPulsar);
    };
  }, []);

  return (
    <div className="relative w-full max-w-[520px]">
      <label htmlFor="buscador-global" className="sr-only">
        Buscar en tu vault
      </label>

      <input
        id={ID_BUSCADOR}
        ref={campo}
        type="search"
        role="searchbox"
        value={valor}
        placeholder={placeholder}
        onChange={(evento) => {
          setValor(evento.target.value);
        }}
        onKeyDown={(evento) => {
          if (evento.key !== "Escape") return;
          // Escape limpia; si ya está vacío, suelta el foco. Dos pulsaciones
          // para salir del todo, que es lo que la gente espera.
          if (valor !== "") setValor("");
          else campo.current?.blur();
        }}
        className={cn(CAJA_DE_CONTROL, "h-[var(--tactil-min)] pl-[var(--e-5)]")}
      />

      {/* La lupa. `pointer-events-none` para no comerse el clic del campo. */}
      <svg
        aria-hidden="true"
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--ash-400)"
        strokeWidth="1"
        className="pointer-events-none absolute top-1/2 left-[var(--e-2)] -translate-y-1/2"
      >
        <circle cx="7" cy="7" r="5" />
        <path d="M11 11 L14.5 14.5" />
      </svg>
    </div>
  );
}
