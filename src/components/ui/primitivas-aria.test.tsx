import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Combobox } from "./combobox";
import { Pestanas } from "./pestanas";
import { ProgresoEditable } from "./progreso-editable";
import { Selector } from "./selector";
import { ZonaArrastre } from "./zona-arrastre";

import type { ReactElement } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL CABLEADO ARIA DE LAS PRIMITIVAS NUEVAS.
 *
 * ── QUÉ SE PUEDE COMPROBAR AQUÍ, Y QUÉ NO ─────────────────────────────────
 *
 * `renderToStaticMarkup` pinta el HTML inicial: no hay eventos, no hay foco, no
 * corren los efectos. Así que **el teclado no se prueba en este fichero**, y
 * decirlo importa: un test que dijera «las pestañas responden a las flechas»
 * sería falso.
 *
 * Lo que sí se prueba es la otra mitad, y no es la mitad menor: **el cableado
 * de atributos**. Un `role="tab"` sin `aria-controls`, un `role="option"` cuyo
 * `id` no coincide con el `aria-activedescendant`, un `<label>` cuyo `htmlFor`
 * no apunta al `id` del input — los tres se ven enteros en el HTML, los tres
 * dejan la primitiva inservible con lector de pantalla, y ninguno rompe nada
 * visible. Es exactamente el tipo de fallo que sobrevive a la revisión.
 *
 * ── DÓNDE SE VERIFICA EL TECLADO, ENTONCES ────────────────────────────────
 *
 *   · La aritmética de las flechas: `src/lib/ui/navegacion-circular.test.ts`,
 *     que es donde vive el bug de verdad (`-1 % 4` es `-1`).
 *   · El recorrido completo con un navegador: cuando estas primitivas lleguen
 *     a una pantalla real —Ajustes usa `Pestanas`, `ZonaArrastre` y
 *     `DialogoConfirmacion`; la ficha usa `ProgresoEditable`—, en el
 *     `e2e/<pantalla>.spec.ts` que `testing.md` exige para cada una.
 *
 * `/dev/primitivas` NO sirve para ese recorrido: el e2e corre contra `build` +
 * `start`, y `src/app/dev/layout.tsx` devuelve 404 en producción a propósito.
 * Bajar esa guarda para poder testear sería cambiar una protección por una
 * comodidad.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-27):
 *   Quitando `aria-controls` del botón de pestaña → 1 rojo.
 *   Poniendo `tabIndex={0}` en todas las pestañas → 1 rojo.
 *   Quitando el `htmlFor` del label del selector → 1 rojo.
 *   Restaurado → verde.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const html = (elemento: ReactElement): string => renderToStaticMarkup(elemento);

/** Los atributos de la primera etiqueta que casa con `selector`. */
function atributos(markup: string, patron: RegExp): string {
  const encontrado = patron.exec(markup);
  return encontrado?.[0] ?? "";
}

describe("Pestanas · el patrón tablist", () => {
  const pestanas = [
    { id: "perfil", etiqueta: "Perfil", contenido: <p>uno</p> },
    { id: "peligro", etiqueta: "Peligro", tono: "peligro" as const, contenido: <p>dos</p> },
  ];

  const markup = html(<Pestanas etiqueta="Ajustes" pestanas={pestanas} />);

  it("el grupo es UNA sola parada de tabulador", () => {
    // Ésta es la mitad del patrón que casi nadie implementa: con `tabIndex=0`
    // en todas, el tabulador recorre las cuatro y el teclado nunca llega al
    // contenido en un paso. Con ninguna a 0, el grupo desaparece del tabulador.
    const conCero = markup.match(/tabindex="0"/g) ?? [];
    const conMenosUno = markup.match(/tabindex="-1"/g) ?? [];

    // Uno por la pestaña activa y otro por el panel, que también es parada.
    expect(conCero).toHaveLength(2);
    expect(conMenosUno).toHaveLength(1);
  });

  it("cada pestaña apunta a su panel y el panel de vuelta a ella", () => {
    const tabActiva = atributos(markup, /<button[^>]*aria-selected="true"[^>]*>/);
    const idPanel = /aria-controls="([^"]+)"/.exec(tabActiva)?.[1];
    const idTab = /id="([^"]+)"/.exec(tabActiva)?.[1];

    expect(idPanel).toBeDefined();
    expect(idTab).toBeDefined();

    // El panel pintado tiene que ser EXACTAMENTE el que la pestaña declara, y
    // devolver la referencia. Sin esto el lector anuncia «pestaña Perfil» y
    // luego lee un panel que no sabe de quién es.
    expect(markup).toContain(`role="tabpanel" id="${String(idPanel)}"`);
    expect(markup).toContain(`aria-labelledby="${String(idTab)}"`);
  });

  it("solo se monta el panel activo", () => {
    expect(markup).toContain("uno");
    expect(markup).not.toContain("dos");
  });

  it("el punto de error va acompañado de texto, no solo de color", () => {
    // DESIGN-SPEC §7: el estado nunca se comunica solo por color.
    const conError = html(
      <Pestanas
        etiqueta="Ajustes"
        pestanas={[{ id: "a", etiqueta: "Importar", conError: true, contenido: <p>x</p> }]}
      />,
    );

    expect(conError).toContain("(tiene errores)");
  });
});

describe("Combobox · el patrón combobox", () => {
  const opciones = [
    { valor: "aot", etiqueta: "Attack on Titan" },
    { valor: "fz", etiqueta: "Fate/Zero" },
  ];

  const markup = html(
    <Combobox
      etiqueta="Serie"
      opciones={opciones}
      valor=""
      onCambiar={() => undefined}
      onElegir={() => undefined}
    />,
  );

  it("declara el rol y el estado cerrado, no una caja de texto a secas", () => {
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-autocomplete="list"');
  });

  it("la lista NO está en el DOM mientras está cerrada", () => {
    // Una lista siempre montada con `hidden` la siguen leyendo algunos
    // lectores al recorrer la página: cada combobox se leería dos veces.
    expect(markup).not.toContain('role="listbox"');
    expect(markup).not.toContain("Attack on Titan");
  });

  it("el `aria-controls` apunta al id que tendrá la lista", () => {
    // Se declara aunque la lista no exista todavía: es lo que permite al
    // lector saber qué se va a abrir. Que coincida es lo que se comprueba.
    const idLista = /aria-controls="([^"]+)"/.exec(markup)?.[1];
    expect(idLista).toBeDefined();
    expect(idLista).toMatch(/-lista$/);
  });

  it("la etiqueta está conectada al input por id, no por proximidad", () => {
    const idInput = /<input[^>]*\sid="([^"]+)"/.exec(markup)?.[1];
    expect(idInput).toBeDefined();
    expect(markup).toContain(`for="${String(idInput)}"`);
  });
});

describe("Selector", () => {
  const markup = html(
    <Selector
      etiqueta="Estado"
      opciones={[{ valor: "VISTO", etiqueta: "Visto" }]}
      vacia="Cualquiera"
      ayuda="Sin filtrar"
    />,
  );

  it("la etiqueta apunta al select por id", () => {
    const idSelect = /<select[^>]*\sid="([^"]+)"/.exec(markup)?.[1];
    expect(idSelect).toBeDefined();
    expect(markup).toContain(`for="${String(idSelect)}"`);
  });

  it("la ayuda se anuncia, no solo se pinta", () => {
    const idAyuda = /aria-describedby="([^"]+)"/.exec(markup)?.[1];
    expect(idAyuda).toBeDefined();
    expect(markup).toContain(`id="${String(idAyuda)}"`);
  });

  it("la opción vacía tiene valor vacío, no está deshabilitada", () => {
    // Fingir un placeholder con una opción `disabled` deja al usuario sin
    // forma de VOLVER a «ninguno» después de elegir.
    expect(markup).toContain('<option value="">Cualquiera</option>');
  });

  it("la punta no se come el clic", () => {
    // Sin `pointer-events-none`, el tercio derecho del control deja de abrir el
    // desplegable. Es un fallo que solo se ve pulsando justo ahí.
    expect(markup).toContain("pointer-events-none");
  });
});

describe("ZonaArrastre", () => {
  it("el control real es un input de fichero con su etiqueta", () => {
    // Arrastrar no existe en móvil ni con teclado: si el elemento fuera un
    // `<div>` con `onDrop`, la primitiva dejaría fuera a media aplicación.
    const markup = html(
      <ZonaArrastre etiqueta="Arrastra la portada" accept="image/*" onFicheros={() => undefined} />,
    );

    // El `\s` del patrón no es cosmético: `aria-invalid="false"` CONTIENE la
    // subcadena `id="false"`, y sin la frontera el test se ataba a ese `false`
    // y pasaba por el motivo equivocado.
    const idInput = /<input[^>]*\sid="([^"]+)"/.exec(markup)?.[1];
    expect(idInput).toBeDefined();
    expect(markup).toContain('type="file"');
    expect(markup).toContain(`for="${String(idInput)}"`);
    // `sr-only`, nunca `hidden`: un input con `display:none` no recibe foco.
    expect(markup).toContain('class="sr-only"');
  });

  it("el error se anuncia como alerta y queda conectado al input", () => {
    const markup = html(
      <ZonaArrastre
        etiqueta="Arrastra el .xlsx"
        error="El fichero pesa 14 MB."
        onFicheros={() => undefined}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-invalid="true"');

    const idError = /aria-describedby="([^"]+)"/.exec(markup)?.[1];
    expect(idError).toBeDefined();
    expect(markup).toContain(`id="${String(idError)}"`);
  });
});

describe("ProgresoEditable", () => {
  const markup = html(
    <ProgresoEditable
      porcentaje={35}
      etiqueta="Temporada 2 · episodio 7"
      onCambiar={() => undefined}
      onEpisodioMas={() => undefined}
      onTodoVisto={() => undefined}
    />,
  );

  it("es un control de rango de verdad, no una barra con onClick", () => {
    expect(markup).toContain('type="range"');
    expect(markup).toContain('value="35"');
  });

  it("anuncia el TEXTO del progreso, no el número suelto", () => {
    // «65» no dice nada. El lector tiene que oír lo mismo que se ve.
    expect(markup).toContain('aria-valuetext="Temporada 2 · episodio 7"');
  });

  it("solo se pintan los botones rápidos que tienen acción", () => {
    expect(markup).toContain("+1 episodio");
    expect(markup).toContain("Todo visto");
    // `onTemporadaCompleta` no se pasó: un botón inerte es peor que su ausencia.
    expect(markup).not.toContain("Temporada completa");
  });

  it("el progreso NO se anuncia dos veces", () => {
    // El `range` ya lo dice. La barra pintada va `aria-hidden` para que el
    // lector no lea el mismo dato con dos voces distintas.
    const barras = markup.match(/role="progressbar"/g) ?? [];
    expect(barras).toHaveLength(1);
    expect(markup).toContain('aria-hidden="true"');
  });
});
