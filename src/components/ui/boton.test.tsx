import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Boton } from "./boton";

import type { ReactElement } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `href` DECIDE EL ELEMENTO, Y NO DECIDE NADA MÁS.
 *
 * ── QUÉ ESTÁ PROTEGIENDO ESTE FICHERO ─────────────────────────────────────
 *
 * Que un botón y un enlace con aspecto de botón se vean **exactamente igual**.
 * No «parecido»: igual, clase por clase.
 *
 * Antes de existir el polimorfismo había dos reconstrucciones de la apariencia
 * del botón —`boton-enlace.tsx` en la landing y `aspecto-boton.ts` en la ficha—
 * y **ya habían divergido en tres cosas** sin que nadie lo decidiera: el peso de
 * la tipografía del relleno dorado, el fondo del secundario y la altura del CTA
 * de nav.
 *
 * Esa clase de deriva no la detecta ningún test de comportamiento: las tres
 * pantallas funcionaban. Se ve comparando las clases de los dos elementos, que
 * es justo lo que hace la segunda tanda de pruebas de aquí.
 *
 * ── POR QUÉ `renderToStaticMarkup` Y NO UNA LIBRERÍA DE TESTS DE REACT ────
 *
 * Porque no hay ninguna instalada, y meter `@testing-library/react` + `jsdom`
 * para comparar dos cadenas de clases sería añadir dos dependencias y un
 * entorno de DOM a un proyecto cuyo stack está cerrado en `CLAUDE.md`.
 *
 * `react-dom` ya está. El componente no tiene estado ni efectos: lo que hay que
 * comprobar es qué etiqueta sale y con qué atributos, y eso se ve entero en el
 * HTML renderizado.
 *
 * ── LO QUE NO SE PUEDE PROBAR AQUÍ, Y ESTÁ BIEN ───────────────────────────
 *
 * Que `<Boton href="/x" cargando>` no compile es cosa del compilador, no de
 * Vitest: la unión discriminada lo rechaza y no hay forma de escribir el caso
 * sin un `as` que precisamente el lint del contrato prohíbe.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-24):
 *   Se añadió una clase suelta a la rama de enlace —`cn(clases, "underline")`—
 *   → 17 tests en rojo, todos los de «el aspecto es EL MISMO». Restaurado → 30
 *   en verde. O sea que esto detecta la deriva de verdad, no solo se lee bien.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** El HTML que produce un elemento, para mirarlo tal cual sale. */
function html(elemento: ReactElement): string {
  return renderToStaticMarkup(elemento);
}

/** La etiqueta del elemento raíz: `button`, `a` o `span`. */
function etiquetaRaiz(marca: string): string {
  return /^<([a-z]+)/.exec(marca)?.[1] ?? "";
}

/** El `class` del elemento raíz, que es lo que se compara. */
function clasesRaiz(marca: string): string {
  return /^<[a-z]+[^>]*\sclass="([^"]*)"/.exec(marca)?.[1] ?? "";
}

/** ¿Lleva el raíz este atributo con este valor? */
function tieneAtributo(marca: string, nombre: string, valor?: string): boolean {
  const apertura = /^<[a-z]+[^>]*>/.exec(marca)?.[0] ?? "";
  if (valor === undefined) return new RegExp(`\\s${nombre}[=>\\s]`).test(apertura);
  return apertura.includes(`${nombre}="${valor}"`);
}

const VARIANTES = ["primario", "solido", "secundario", "destructivo", "fantasma"] as const;
const TAMANOS = ["s", "m", "l"] as const;

describe("el elemento que se renderiza", () => {
  it("SIN href es un <button>, y lleva type=button para no enviar formularios sin querer", () => {
    const marca = html(<Boton>Guardar</Boton>);

    expect(etiquetaRaiz(marca)).toBe("button");
    // Un `<button>` sin `type` dentro de un `<form>` es `submit` por defecto.
    // Es la causa clásica de «el formulario se envía al pulsar cualquier cosa».
    expect(tieneAtributo(marca, "type", "button")).toBe(true);
    expect(tieneAtributo(marca, "href")).toBe(false);
  });

  it("CON href es un <a> de verdad, con su href puesto", () => {
    const marca = html(<Boton href="/app">Entrar al vault</Boton>);

    expect(etiquetaRaiz(marca)).toBe("a");
    expect(tieneAtributo(marca, "href", "/app")).toBe(true);
    // Un ancla no lleva `type`: es la prop que se copia de un botón y no hace
    // nada, quedándose como atributo inválido en el DOM.
    expect(tieneAtributo(marca, "type")).toBe(false);
    expect(marca).toContain("Entrar al vault");
  });

  it("un href externo abre en pestaña nueva y NUNCA sin rel", () => {
    const marca = html(
      <Boton href="https://animeflv.net/ver/algo" externo>
        Continuar viendo
      </Boton>,
    );

    expect(etiquetaRaiz(marca)).toBe("a");
    expect(tieneAtributo(marca, "target", "_blank")).toBe(true);
    // `security.md` §6: sin `noopener`, la pestaña abierta puede reescribir la
    // nuestra con `window.opener`. No es opcional y no depende de acordarse.
    expect(tieneAtributo(marca, "rel", "noopener noreferrer")).toBe(true);
  });

  it("un href peligroso NO se renderiza como enlace", () => {
    // `javascript:` es XSS. La guarda vive en la primitiva `Enlace`, y esto
    // comprueba que el botón sigue pasando por ella en vez de rodearla.
    const marca = html(<Boton href="javascript:alert(1)">Pulsa</Boton>);

    expect(etiquetaRaiz(marca)).not.toBe("a");
    expect(marca).not.toContain("javascript:");
  });
});

describe("el aspecto es EL MISMO con y sin href", () => {
  it.each(VARIANTES.flatMap((v) => TAMANOS.map((t) => [v, t] as const)))(
    "variante %s, tamaño %s",
    (variante, tamano) => {
      const deBoton = clasesRaiz(
        html(
          <Boton variante={variante} tamano={tamano}>
            Igual
          </Boton>,
        ),
      );
      const deEnlace = clasesRaiz(
        html(
          <Boton href="/app" variante={variante} tamano={tamano}>
            Igual
          </Boton>,
        ),
      );

      // Control positivo: si `clasesRaiz` dejara de encontrar nada, los dos
      // serían "" y el test pasaría sin comprobar nada.
      expect(deBoton).not.toBe("");
      expect(
        deEnlace,
        "el enlace y el botón han dejado de verse igual: eso es exactamente la " +
          "deriva que el polimorfismo vino a impedir",
      ).toBe(deBoton);
    },
  );

  it("`ancho` estira los dos por igual", () => {
    const deBoton = clasesRaiz(html(<Boton ancho>Ancho</Boton>));
    const deEnlace = clasesRaiz(
      html(
        <Boton href="/app" ancho>
          Ancho
        </Boton>,
      ),
    );

    expect(deBoton).toContain("w-full");
    expect(deEnlace).toBe(deBoton);
  });

  it("un `className` propio se aplica igual en las dos ramas", () => {
    const deBoton = clasesRaiz(html(<Boton className="mt-4">X</Boton>));
    const deEnlace = clasesRaiz(
      html(
        <Boton href="/app" className="mt-4">
          X
        </Boton>,
      ),
    );

    expect(deBoton).toContain("mt-4");
    expect(deEnlace).toBe(deBoton);
  });
});

describe("lo que solo tiene sentido en un botón", () => {
  it("`cargando` bloquea, lo anuncia con aria-busy y pinta el spinner", () => {
    const marca = html(<Boton cargando>Guardando</Boton>);

    expect(tieneAtributo(marca, "disabled")).toBe(true);
    // Quien informa del estado es `aria-busy`, no un dibujo que gira.
    expect(tieneAtributo(marca, "aria-busy", "true")).toBe(true);
    expect(marca).toContain("spinner-aro");
  });

  it("el spinner ocupa el hueco del icono, así que cargar no cambia el ancho", () => {
    const conIcono = html(<Boton icono={<span>★</span>}>Fijo</Boton>);
    const cargando = html(<Boton cargando>Fijo</Boton>);

    const hueco = /<span class="([^"]*)" aria-hidden="true">/;

    // Mismo contenedor de 14 px en los dos casos: empezar a cargar no refluye
    // la fila de botones.
    expect(hueco.exec(conIcono)?.[1]).toBe(hueco.exec(cargando)?.[1]);
    expect(hueco.exec(conIcono)?.[1]).toContain("size-[14px]");
  });

  it("sin icono y sin cargar no se pinta un hueco vacío", () => {
    expect(html(<Boton>Pelado</Boton>)).not.toContain('aria-hidden="true"');
  });

  it("`disabled` a secas también bloquea", () => {
    const marca = html(<Boton disabled>No</Boton>);

    expect(tieneAtributo(marca, "disabled")).toBe(true);
    // Pero sin `aria-busy`: deshabilitado no es lo mismo que ocupado.
    expect(tieneAtributo(marca, "aria-busy")).toBe(false);
  });
});

describe("las props de apariencia no se derraman al DOM", () => {
  it.each(["variante", "tamano", "ancho", "icono"])("%s no llega como atributo", (prop) => {
    const marca = html(
      <Boton variante="solido" tamano="l" ancho icono={<span>★</span>}>
        Limpio
      </Boton>,
    );

    // React avisa por consola de cada atributo desconocido, y en una fila de
    // botones eso es ruido en cada render.
    expect(tieneAtributo(marca, prop)).toBe(false);
  });

  it("tampoco en la rama de enlace", () => {
    const marca = html(
      <Boton href="/app" variante="solido" tamano="l" ancho>
        Limpio
      </Boton>,
    );

    for (const prop of ["variante", "tamano", "ancho", "externo"]) {
      expect(tieneAtributo(marca, prop), `${prop} se derramó al ancla`).toBe(false);
    }
  });
});
