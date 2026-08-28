import { expect, test } from "@playwright/test";

import { entrarComoPropietario } from "./sesion-propietario";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — MÓVIL A 390 px (artboard 12, lote D3).
 *
 * Chromium a 390 × 844, que es el tamaño del artboard.
 *
 * ── QUÉ COMPRUEBA, Y POR QUÉ NADA MÁS LO PUEDE VER ──────────────────────
 *
 * Una barra `fixed` no ocupa sitio en el flujo. Si el contenido no reserva su
 * hueco, **el último elemento de la pantalla queda debajo de ella y no se puede
 * pulsar** — y no se nota mirando la página, porque se ve entero. Sólo se nota
 * intentando pulsarlo, que es lo que hace este spec.
 *
 * Y los dos ítems que no navegan —«Buscar» y «Añadir»— disparan un evento que
 * cruza el árbol. Si el oyente no estuviera montado, el botón no haría nada y
 * no habría error en ninguna parte: exactamente el «control inerte» que el
 * encargo prohíbe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const MOVIL = { width: 390, height: 844 };

test.describe("móvil a 390 px", () => {
  test.use({ viewport: MOVIL });

  test("la barra inferior está, con sus cuatro ítems", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");

    const barra = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(barra).toBeVisible();

    for (const etiqueta of ["Vault", "Buscar", "Añadir", "Ajustes"]) {
      await expect(barra.getByText(etiqueta, { exact: true })).toBeVisible();
    }
  });

  test("marca dónde estás, y con algo más que el color", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");

    const barra = page.getByRole("navigation", { name: "Navegación principal" });
    // `aria-current` es lo que lee un lector de pantalla. El oro solo no vale:
    // es la misma regla que los estados de un anime.
    await expect(barra.getByRole("link", { name: /Vault/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(barra.getByRole("link", { name: /Ajustes/ })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("en Ajustes se mueve la marca, y NO se marcan dos a la vez", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app/ajustes");

    const barra = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(barra.getByRole("link", { name: /Ajustes/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // El control que importa: con un `startsWith` a secas, `/app/ajustes`
    // marcaría también «Vault» y la barra diría dos cosas a la vez.
    await expect(barra.locator("[aria-current='page']")).toHaveCount(1);
  });

  test("«Añadir» ABRE EL MODAL, no es un botón inerte", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");

    await page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("button", { name: /Añadir/ })
      .click();

    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("«Buscar» ENFOCA el buscador", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");

    await page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("button", { name: /Buscar/ })
      .click();

    await expect(page.getByRole("searchbox")).toBeFocused();
  });

  test("LA BARRA NO TAPA EL CONTENIDO: el último anime se puede pulsar", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");

    // El mismo localizador que usa `biblioteca.spec.ts`: la rejilla es una
    // lista con nombre accesible, y sus tarjetas son sus `listitem`.
    const tarjetas = page.getByRole("list", { name: "Tus series" }).getByRole("listitem");
    await expect(tarjetas.first()).toBeVisible();

    const ultima = tarjetas.last().getByRole("link").first();
    await ultima.scrollIntoViewIfNeeded();

    // `click()` falla si algo intercepta el punto: es exactamente la
    // comprobación que hace falta, y la que un test de HTML no puede hacer.
    await ultima.click();
    await expect(page).toHaveURL(/\/app\/anime\//);
  });

  test("no hay scroll horizontal a 390 px", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.goto("/app");

    const desbordamiento = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(desbordamiento).toBeLessThanOrEqual(0);
  });

  test("desde tablet la barra inferior NO está", async ({ page }) => {
    await entrarComoPropietario(page);
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("/app");

    // El control negativo: sin él, una barra que se pintara siempre pasaría
    // todos los tests de arriba y rompería el escritorio.
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeHidden();
  });
});
