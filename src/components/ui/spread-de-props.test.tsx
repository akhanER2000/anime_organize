import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AreaTexto, Campo } from "./campo";
import { Chip } from "./chip";
import { Enlace } from "./enlace";
import { Selector } from "./selector";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SPREAD DE PROPS NO PUEDE PISAR LO QUE LA PRIMITIVA CALCULA.
 *
 * ── EL FALLO QUE TRAJO ESTE FICHERO ──────────────────────────────────────
 *
 * En producción, con un navegador, el campo «Portada» del modal de añadir se
 * veía de 198 × 26 px y no se podía escribir en él. La causa:
 *
 *     <input className={cn(CONTROL, …)} {...resto} />
 *
 * `resto` traía un `className` del llamador, y JSX aplica los atributos EN
 * ORDEN: el segundo sustituye al primero **entero**. No lo mezcla. Toda la
 * receta de clases del control desaparecía y quedaba la del llamador.
 *
 * ── POR QUÉ NINGÚN OTRO NIVEL LO VE ──────────────────────────────────────
 *
 * `tsc` no lo ve: pasar `className` a un componente que acepta `className` es
 * correcto. ESLint no lo ve: no es una cuestión de estilo. Los tests de unidad
 * no lo ven porque **no renderizan**. Y quien lee el código ve una llamada a
 * `cn(...)` justo encima y da por hecho que gana.
 *
 * Sólo se ve renderizando y MIRANDO EL ATRIBUTO QUE SALE. Eso es este fichero.
 *
 * ── LA CLASE ENTERA, NO EL CASO ──────────────────────────────────────────
 *
 * Un barrido de 23 componentes encontró **ocho agujeros más de la misma
 * forma**, en cuatro primitivas, y ninguno tenía síntoma todavía: nadie pasaba
 * todavía la prop que los dispara. Eran bugs con fecha de caducidad futura.
 *
 * Cada `it` de aquí abajo es uno de ellos. Y la regla general que sale, escrita
 * donde se pueda tropezar con ella:
 *
 *   **LO QUE LA PRIMITIVA GARANTIZA VA DESPUÉS DEL SPREAD. LO QUE EL LLAMADOR
 *   PUEDE ELEGIR, ANTES.**
 *
 * `scripts/lint-spread.mjs` lo comprueba en cada commit sobre el código fuente,
 * porque un test sólo cubre las props que a alguien se le ocurrió escribir.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** El primer `<etiqueta …>` del HTML, tal cual salió. */
function marca(html: string, etiqueta: string): string {
  const apertura = `<${etiqueta}`;
  for (let i = html.indexOf(apertura); i !== -1; i = html.indexOf(apertura, i + 1)) {
    // `<select` no puede casar con `<selector`: el siguiente carácter manda.
    const siguiente = html[i + apertura.length];
    if (siguiente !== " " && siguiente !== ">") continue;
    const cierre = html.indexOf(">", i);
    if (cierre !== -1) return html.slice(i, cierre + 1);
  }
  throw new Error(`no se pintó ningún <${etiqueta}> en: ${html}`);
}

/** El valor de un atributo dentro de esa marca, o `null` si no está. */
function atributo(html: string, etiqueta: string, nombre: string): string | null {
  const etiquetaAbierta = marca(html, etiqueta);
  // Sin distinguir mayúsculas: React 19 emite `autoComplete` tal cual, no
  // `autocomplete`, y HTML no distingue. Buscar la forma exacta daría `null`
  // —un test que pasa porque no encuentra nada, que es el peor verde.
  const clave = ` ${nombre.toLowerCase()}="`;
  const i = etiquetaAbierta.toLowerCase().indexOf(clave);
  if (i === -1) return null;
  const desde = i + clave.length;
  const cierre = etiquetaAbierta.indexOf(String.fromCharCode(34), desde);
  return cierre === -1 ? null : etiquetaAbierta.slice(desde, cierre);
}

describe("Campo · el llamador no desconecta el error ni la ayuda", () => {
  /**
   * VERIFICADO POR MUTACIÓN (2026-08-28):
   *   Se movió `{...resto}` de la primera posición del `<input>` a la última
   *   (como estaba antes del arreglo) → 4 tests de este fichero en rojo.
   *   Restaurado.
   */
  it("un `aria-describedby` externo NO deja huérfanos al error ni a la ayuda", () => {
    const html = renderToStaticMarkup(
      <Campo
        etiqueta="Contraseña"
        ayuda="Mínimo 12 caracteres"
        error="Demasiado corta"
        {...{ "aria-describedby": "pista-externa" }}
      />,
    );

    const describedby = atributo(html, "input", "aria-describedby") ?? "";

    expect(describedby).toContain("-error");
    expect(describedby).toContain("-ayuda");
  });

  it("un `aria-invalid` externo NO apaga el estado de error de un campo con error", () => {
    const html = renderToStaticMarkup(
      <Campo etiqueta="Contraseña" error="Demasiado corta" {...{ "aria-invalid": false }} />,
    );

    expect(atributo(html, "input", "aria-invalid")).toBe("true");
  });

  it("AreaTexto tampoco: mismo componente, mismo fallo, misma garantía", () => {
    const html = renderToStaticMarkup(
      <AreaTexto
        etiqueta="Notas"
        ayuda="Máximo 500 caracteres"
        error="Demasiado largo"
        {...{ "aria-describedby": "pista-externa", "aria-invalid": false }}
      />,
    );

    const describedby = atributo(html, "textarea", "aria-describedby") ?? "";

    expect(describedby).toContain("-error");
    expect(describedby).toContain("-ayuda");
    expect(atributo(html, "textarea", "aria-invalid")).toBe("true");
  });

  /**
   * EL CONTROL POSITIVO. Sin él, un componente que ignorase `resto` entero
   * pasaría los tres de arriba y rompería todos los formularios: `register()`
   * de react-hook-form entra por ahí, y sin `name` no se envía nada.
   */
  it("y lo que el llamador SÍ puede elegir sigue llegando al control", () => {
    const html = renderToStaticMarkup(
      <Campo etiqueta="Correo" type="email" name="email" autoComplete="username" />,
    );

    expect(atributo(html, "input", "type")).toBe("email");
    expect(atributo(html, "input", "name")).toBe("email");
    expect(atributo(html, "input", "autocomplete")).toBe("username");
  });
});

describe("Selector · la ayuda sigue anunciándose", () => {
  it("un `aria-describedby` externo NO desconecta el texto de ayuda", () => {
    const html = renderToStaticMarkup(
      <Selector
        etiqueta="Estado"
        ayuda="Filtra por estado"
        opciones={[{ valor: "VISTO", etiqueta: "Visto" }]}
        {...{ "aria-describedby": "pista-externa" }}
      />,
    );

    expect(atributo(html, "select", "aria-describedby") ?? "").toContain("-ayuda");
  });
});

describe("Chip · sigue siendo un botón inerte dentro de un formulario", () => {
  /**
   * `<button>` sin `type` DENTRO DE UN `<form>` es `submit`. El `type="button"`
   * explícito existe para eso. Un `<Chip type="submit">` lo anulaba: pulsar un
   * chip de filtro enviaba el formulario, y si además era el primer botón, se
   * convertía en el envío por defecto al pulsar Enter en cualquier input.
   */
  it("un `type` externo NO convierte un chip de filtro en el botón de envío", () => {
    const html = renderToStaticMarkup(<Chip {...{ type: "submit" as const }}>Viendo</Chip>);

    expect(atributo(html, "button", "type")).toBe("button");
  });
});

describe("Enlace externo · `rel` y `target` no son configurables, como dice su cabecera", () => {
  /**
   * ESTE ES EL DE SEGURIDAD, y es el que security.md §6 exige en todo
   * `target="_blank"`. Sin `noopener`, la página destino recibe un
   * `window.opener` vivo con el que puede redirigir la pestaña del vault a una
   * copia del login (reverse tabnabbing).
   *
   * Y es ALCANZABLE: los dos llamadores de `Enlace externo` —el gestor de
   * enlaces y el botón de continuar— le pasan **URLs que pega el usuario**.
   *
   * VERIFICADO POR MUTACIÓN (2026-08-28):
   *   Se devolvió `{...propsAncla}` al final del `<a>` → los dos tests de este
   *   bloque en rojo (`rel=""` y `target="_self"`). Restaurado.
   */
  it("un `rel` externo NO deja la pestaña de origen expuesta", () => {
    const html = renderToStaticMarkup(
      <Enlace href="https://ejemplo.tld/capitulo-7" externo {...{ rel: "" }}>
        Continuar
      </Enlace>,
    );

    expect(atributo(html, "a", "rel")).toBe("noopener noreferrer");
  });

  it("un `target` externo NO hace mentir al aviso de «se abre en una pestaña nueva»", () => {
    const html = renderToStaticMarkup(
      <Enlace href="https://ejemplo.tld/capitulo-7" externo {...{ target: "_self" }}>
        Continuar
      </Enlace>,
    );

    expect(atributo(html, "a", "target")).toBe("_blank");
    expect(html).toContain("se abre en una pestaña nueva");
  });
});
