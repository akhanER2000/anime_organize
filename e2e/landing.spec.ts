import { expect, test } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRIDO EN NAVEGADOR — LA LANDING (artboard 02), en Chromium y contra el
 * build de producción.
 *
 * `.claude/rules/testing.md` § «Ninguna pantalla está terminada sin un
 * RECORRIDO EN NAVEGADOR»: es el único nivel que ejercita la aplicación entera
 * —red, CSP, hidratación de React, navegación de cliente— y es donde aparecen
 * los fallos que todo lo demás deja pasar.
 *
 * **Sin `bypassCSP`, y no es negociable.** El peor fallo del proyecto fue una
 * CSP que servía la aplicación EN BLANCO: el build salía a 0, las cabeceras
 * eran impecables y el HTML llegaba entero. Un spec que desactiva la política
 * deja de ver exactamente eso. La landing es además la primera pantalla que
 * carga un visitante: si se sirve en blanco, no hay segunda oportunidad.
 *
 * ── LO QUE NO TIENE ESTA PANTALLA, Y CÓMO SE CUBRE IGUAL ──────────────────
 * La landing **no tiene formulario ni campo opcional**: son cinco secciones de
 * texto y siete enlaces. El caso que la regla exige —«dejar en blanco todo lo
 * opcional y enviar»— se recorre por el camino que abre la propia pantalla: se
 * pulsa «Entrar al Vault», se envía el formulario de login VACÍO y se comprueba
 * que la pantalla se queja en vez de tragárselo. Anotado en `SUPUESTOS.md`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Palabras con las que el navegador informa de que ha bloqueado algo. */
const AVISO_DE_BLOQUEO = /Content Security Policy|refused to (execute|load|apply|connect)/i;

test.describe("la landing, usada por una persona", () => {
  test("SE PINTA con la CSP de producción puesta", async ({ page }) => {
    await page.goto("/");

    // Si la CSP bloquea los scripts de Next, React monta y vacía el árbol: el
    // `<h1>` desaparece y `body` queda vacío. Esas dos aserciones son la prueba.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("guardado en piedra");
    await expect(page.locator("body")).not.toBeEmpty();

    // Y que sigue siendo `/`: la landing es pública y no redirige a nadie.
    await expect(page).toHaveURL(/\/$/);
  });

  test("NINGÚN recurso lo bloquea la CSP", async ({ page }) => {
    const bloqueos: string[] = [];
    page.on("console", (mensaje) => {
      const texto = mensaje.text();
      if (AVISO_DE_BLOQUEO.test(texto)) bloqueos.push(texto);
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // El hero carga `laja-hero.webp` y dos piezas kintsugi como fondo CSS. Si
    // alguien estrechara `img-src`, la pantalla se quedaría sin su textura y
    // nada más avisaría: el HTML seguiría llegando entero.
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();

    expect(bloqueos, `la CSP bloqueó ${String(bloqueos.length)} recursos`).toEqual([]);
  });

  test("«Entrar al Vault» lleva al login", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Entrar al Vault" }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();
  });

  test("«Crear cuenta» lleva al registro", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Crear cuenta" }).click();

    await expect(page).toHaveURL(/\/registro/);
    await expect(page.getByRole("heading", { level: 1, name: "Crear cuenta" })).toBeVisible();
  });

  test("«Entrar» de la barra superior lleva también al login", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link", { name: "Entrar", exact: true })
      .click();

    await expect(page).toHaveURL(/\/login/);
  });

  test("TODA ancla de la navegación lleva a algo que EXISTE, y no hay más entradas", async ({
    page,
  }) => {
    // Un ancla muerta no da error en ninguna parte: el navegador simplemente no
    // se mueve. Aquí se comprueba que el destino está en la página y se ve.
    //
    // ── ERAN TRES Y AHORA ES UNA ──────────────────────────────────────────
    //
    // «Precios» apuntaba al KPI de «0 €» y «Sitios» a una tarjeta que habla de
    // retomar un episodio, no de sitios de streaming —de los que hay CERO
    // sembrados—. Las dos se quitaron con las cifras inventadas del hero.
    //
    // Este test comprobaba que las tres anclas llegaban a algún sitio, y las
    // tres llegaban: el ancla funcionaba y lo que mentía era lo que prometía.
    // Por eso ahora comprueba también CUÁNTAS entradas hay: si alguien vuelve a
    // añadir una, tiene que declarar aquí a qué lleva.
    const destinos = [
      { etiqueta: "Características", hash: "#caracteristicas", texto: "Un solo catálogo" },
    ] as const;

    await page.goto("/");

    // Lo que hay en la nav, dicho por su nombre accesible: el logotipo, las
    // anclas de la lista y el CTA. Contar contra una lista explícita en vez de
    // contra un número deja claro QUÉ se espera, y si alguien añade una entrada
    // el fallo dice cuál sobra en vez de «esperaba 3, recibí 4».
    const nombres = await page
      .getByRole("navigation", { name: "Principal" })
      .getByRole("link")
      .allInnerTexts();
    const limpios = nombres.map((n) => n.replace(/\s+/g, " ").trim()).filter((n) => n !== "");

    expect(limpios).toEqual(["ANIME VAULT", ...destinos.map((d) => d.etiqueta), "Entrar"]);

    for (const destino of destinos) {
      await page.goto("/");
      await page.getByRole("link", { name: destino.etiqueta }).click();

      await expect(page).toHaveURL(new RegExp(`${destino.hash}$`));
      await expect(page.getByText(destino.texto, { exact: false }).first()).toBeVisible();
    }
  });

  test("NO HAY CIFRAS INVENTADAS ni promesas de lo que no existe", async ({ page }) => {
    // ── POR QUÉ ESTE TEST ─────────────────────────────────────────────────
    //
    // La landing desplegada decía «2 480 series catalogadas», «18 sitios
    // enlazados» y «0 € para empezar», en Cormorant 34 px y con el aspecto de
    // un dato. El vault tiene 83 animes, `streaming_site` tiene cero filas y
    // esto no se vende. Era una página pública con el nombre de su dueño
    // detrás afirmando tres cosas falsas.
    //
    // Un enlace muerto se nota al pulsarlo. Un número inventado no se nota
    // nunca, y por eso es peor: nadie lo comprueba porque parece un hecho.
    //
    // Las tarjetas prometían además importar desde AniList o .xlsx, espejos
    // V1/V2/V3 y etiquetas por IA. Ninguna de las tres está construida.
    await page.goto("/");

    // ── EL TEXTO VISIBLE NO BASTA ─────────────────────────────────────────
    //
    // La primera versión de este test solo miraba `body.innerText()`, y por eso
    // dejó pasar «Importa desde AniList o desde un .xlsx» escondido en el
    // `<meta name="description">` — que es la frase MÁS pública de todas: la
    // que sale en Google y en la previsualización de cualquier enlace.
    //
    // Lo cazó un `curl` que no distinguía entre texto visible y metadatos.
    const visible = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const meta = (await page.locator('meta[name="description"]').getAttribute("content")) ?? "";
    const titulo = await page.title();
    const texto = `${visible} ${meta} ${titulo}`;

    for (const mentira of [
      "2 480",
      "2480",
      "sitios enlazados",
      "series catalogadas",
      "0 €",
      "para empezar",
      "Precios",
      ".xlsx",
      "espejos V1",
      "la IA sugiere",
      "Detección de duplicados al añadir",
      "Historial de cambios",
      "Marca el episodio en el móvil",
    ]) {
      expect(texto, `la landing volvió a decir «${mentira}»`).not.toContain(mentira);
    }
  });

  test("el logotipo vuelve a la landing desde el login", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Entrar al Vault" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page
      .getByRole("link", { name: /anime\s*vault/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("VOLVER ATRÁS deja la landing usable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/registro/);

    await page.goBack();

    // El botón de atrás sirve el HTML de la caché, y ahí es donde una pantalla
    // mal hidratada se queda inerte: se ve, pero no responde. Por eso no basta
    // con comprobar que el titular está: hay que volver a pulsar algo.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("link", { name: "Entrar al Vault" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("RECARGAR a mitad de la página no la rompe", async ({ page }) => {
    await page.goto("/");

    // Se baja hasta el pie, se recarga y se comprueba que todo sigue en pie.
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
    await page.reload();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText("Anime Vault");
    await expect(page.getByRole("link", { name: "Entrar al Vault" })).toBeVisible();
  });

  test("EN BLANCO Y ENVIAR: el camino que abre la landing se queja, no traga", async ({ page }) => {
    // La landing no tiene formulario. El caso «dejarlo todo en blanco y enviar»
    // se recorre por donde ella lleva: su CTA principal.
    await page.goto("/");
    await page.getByRole("link", { name: "Entrar al Vault" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByRole("button", { name: /entrar al vault/i }).click();

    // Ni entra ni se queda callado. No se comprueba el texto exacto del aviso
    // —esa pantalla es de otro agente— sino lo que sí es contrato: que NO se
    // ha entrado al vault y que el formulario sigue disponible.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /entrar al vault/i })).toBeVisible();

    // Y desde ahí se puede volver a la landing y seguir usándola.
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("en móvil (390 px) la landing sigue completa y pulsable", async ({ page }) => {
    // 390 px es el breakpoint `movil` del sistema. A ese ancho el marco dorado
    // se retira y las tres columnas se apilan; lo que no puede pasar es que
    // algo se salga o deje de poder pulsarse.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Un solo catálogo")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();

    // Nada de scroll horizontal: es el síntoma clásico de una medida fija que
    // no se encogió.
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda, "la landing desborda a lo ancho en 390 px").toBe(false);

    await page.getByRole("link", { name: "Entrar al Vault" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
