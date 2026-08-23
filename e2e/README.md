# Tests end-to-end

Los specs llegan en la **FASE 6**. El guion está cerrado en
`.claude/rules/testing.md` § «E2E — el flujo crítico»:

1. Registro de un usuario nuevo.
2. Añadir un anime pegando una URL de imagen.
3. **Verificar que la portada se sirve desde `/api/covers/<id>` y NO desde el
   dominio original** — interceptando la red, no solo mirando el `src`.
4. Filtrar la biblioteca y comprobar que la URL (`searchParams`) cambia acorde.
5. Eliminar la cuenta: re-autenticación, escribir el email, recibir el export
   `.json` y comprobar que después no se puede entrar.

Reglas: selectores por rol y nombre accesible, cero `waitForTimeout`, cada spec
crea y limpia su propio usuario, y todo corre contra `build` + `start`.

Antes de la primera ejecución hace falta bajar los navegadores:

```bash
npx playwright install chromium
```
