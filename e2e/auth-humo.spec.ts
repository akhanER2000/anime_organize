import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HUMO DE AUTENTICACIÓN — por el navegador, contra el build de producción.
 *
 * ── POR QUÉ ESTE FICHERO EXISTE ────────────────────────────────────────────
 * Todo lo demás de este proyecto se comprueba desde Node: peticiones HTTP,
 * consultas a Postgres, tests de unidad. **Nada de eso ejecuta JavaScript en un
 * navegador con la CSP puesta**, y ahí es donde vivía el peor fallo del día:
 * la aplicación se servía correcta, con su HTML completo y su cabecera de
 * seguridad impecable, y el navegador la dejaba **en blanco** porque bloqueaba
 * los 184 `<script>` en línea que Next usa para entregar el árbol de React.
 *
 * Un `curl` no lo ve. Un test de unidad no lo ve. El build no falla. Solo lo ve
 * un navegador de verdad aplicando la CSP de verdad.
 *
 * Por eso este spec **no usa `bypassCSP`**: si alguien vuelve a poner una
 * directiva que bloquee los scripts de Next, estas comprobaciones se caen.
 *
 * Cubre el camino que una persona recorre el primer día: entra, se registra,
 * inicia sesión y llega a su vault.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const PASSWORD = "una frase larga y tranquila para el vault";

test.describe("el navegador puede usar la aplicación de verdad", () => {
  test("las pantallas públicas se PINTAN con la CSP de producción puesta", async ({ page }) => {
    // Si la CSP bloquea los scripts de Next, React monta y vacía el árbol: el
    // `<h1>` desaparece y `body.innerText` queda vacío. Eso es exactamente lo
    // que pasaba, y es lo que estas tres aserciones detectan.
    for (const [ruta, titulo] of [
      ["/login", "Iniciar sesión"],
      ["/registro", "Crear cuenta"],
      ["/recuperar", "Recuperar acceso"],
    ] as const) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("ningún error de CSP en la consola", async ({ page }) => {
    // La prueba directa: el navegador informa de cada script que bloquea.
    const bloqueos: string[] = [];
    page.on("console", (msg) => {
      const texto = msg.text();
      if (/Content Security Policy|refused to execute/i.test(texto)) bloqueos.push(texto);
    });

    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(bloqueos, `la CSP bloqueó ${String(bloqueos.length)} recursos`).toEqual([]);
  });

  test("REGISTRO → LOGIN → VAULT, el camino del primer día", async ({ page }) => {
    const email = `humo-${randomUUID().slice(0, 8)}@ejemplo.test`;

    // ── 1. Crear la cuenta por el formulario real ─────────────────────────
    await page.goto("/registro");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña", { exact: false }).fill(PASSWORD);
    await page.getByRole("button", { name: /crear mi vault/i }).click();

    // Se busca EL TEXTO, no `role="status"`: ese rol lo llevan también el
    // medidor de contraseña y el anunciador de rutas de Next, así que la
    // consulta por rol resolvía a tres elementos y Playwright cortaba por modo
    // estricto. El fallo era del selector, no de la aplicación — merece la pena
    // distinguirlo antes de «arreglar» nada.
    //
    // El mensaje es el mismo exista o no la cuenta (security.md §2): se
    // comprueba que la acción respondió con éxito, no qué rama tomó.
    await expect(page.getByText(/cuenta creada/i)).toBeVisible({ timeout: 20_000 });

    // ── 2. Entrar con esa cuenta ──────────────────────────────────────────
    await page.goto("/login");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña", { exact: false }).fill(PASSWORD);
    await page.getByRole("button", { name: /entrar al vault/i }).click();

    // ── 3. Llegar al vault ────────────────────────────────────────────────
    // Es la comprobación de que TODA la cadena está enchufada: Server Action →
    // `signIn` → `authorize` → Argon2id → JWT → middleware → `/app`.
    await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
  });

  test("sin sesión, /app manda al login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });

  test("EQUIVOCARSE: el formulario vacío avisa, y el aviso dice algo útil", async ({ page }) => {
    await page.goto("/registro");
    await page.getByRole("button", { name: /crear mi vault/i }).click();

    // No basta con que «falle»: tiene que decir qué hacer. Un formulario que se
    // niega en silencio es peor que uno que se rompe.
    const aviso = page.getByRole("alert").filter({ hasText: "⚠" }).first();
    await expect(aviso).toBeVisible();
    await expect(aviso).not.toBeEmpty();
  });

  test("EQUIVOCARSE: correo mal formado y contraseña corta se explican por separado", async ({
    page,
  }) => {
    await page.goto("/registro");
    await page.getByLabel("Correo").fill("esto-no-es-un-correo");
    await page.getByLabel("Contraseña", { exact: false }).fill("corta");
    await page.getByRole("button", { name: /crear mi vault/i }).click();

    // Dos errores, dos avisos: si solo saliera uno, la persona corregiría uno y
    // volvería a fallar sin saber por qué.
    //
    // Se filtra por el ⚠ de los mensajes de campo: `role="alert"` a secas
    // recoge también el anunciador de rutas de Next, que siempre está ahí y
    // hacía que el conteo fuera 3. El fallo era del selector, no de la pantalla.
    const avisosDeCampo = page.getByRole("alert").filter({ hasText: "⚠" });
    await expect(avisosDeCampo).toHaveCount(2, { timeout: 10_000 });
    await expect(avisosDeCampo.first()).toContainText(/correo/i);
    await expect(avisosDeCampo.last()).toContainText(/12 caracteres/i);
  });

  test("RECARGAR A MITAD no rompe la pantalla", async ({ page }) => {
    await page.goto("/registro");
    await page.getByLabel("Correo").fill("a-medias@ejemplo.test");
    await page.reload();

    // Tras recargar: la pantalla sigue usable y el campo está limpio, que es lo
    // que debe pasar — un formulario de registro no restaura borradores.
    await expect(page.getByRole("heading", { level: 1, name: "Crear cuenta" })).toBeVisible();
    await expect(page.getByLabel("Correo")).toHaveValue("");
    await expect(page.getByRole("button", { name: /crear mi vault/i })).toBeEnabled();
  });

  test("VOLVER ATRÁS deja la pantalla anterior usable", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /crear una/i }).click();
    await expect(page).toHaveURL(/\/registro/);

    await page.goBack();

    // El botón de atrás sirve el HTML de la caché, y ahí es donde una pantalla
    // mal hidratada se queda inerte: se ve, pero no responde.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeVisible();
    await page.getByLabel("Correo").fill("sigo-funcionando@ejemplo.test");
    await expect(page.getByLabel("Correo")).toHaveValue("sigo-funcionando@ejemplo.test");
  });

  test("RECORDARME está DESMARCADA por defecto", async ({ page }) => {
    // La opción segura es la que no hay que elegir. Si un día alguien invierte
    // el `defaultValue`, la sesión pasaría a durar 30 días sin que nadie lo
    // pidiera, y no habría forma de notarlo mirando la pantalla.
    await page.goto("/login");
    await expect(page.getByRole("checkbox", { name: /recordarme/i })).not.toBeChecked();
  });
});
