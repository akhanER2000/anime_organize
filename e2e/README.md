# Tests end-to-end

**16 specs, 108 casos**, en Chromium contra `build` + `start` y **sin
`bypassCSP`**. Se ejecutan con `npm run test:e2e`.

Este fichero decía «los specs llegan en la FASE 6». Llegaron; la frase se quedó, y un
README que describe un futuro que ya pasó es la primera cosa que engaña a quien abre la
carpeta. La regla que lo gobierna sigue siendo la misma:
`.claude/rules/testing.md` § «Ninguna pantalla está terminada sin un RECORRIDO EN
NAVEGADOR».

## Los specs

- `ajustes.spec.ts`
- `anadir-anime.spec.ts`
- `auth-humo.spec.ts`
- `biblioteca.spec.ts`
- `borrar-cuenta.spec.ts`
- `buscador.spec.ts`
- `enlaces-continuar.spec.ts`
- `enriquecer.spec.ts`
- `estados-sistema.spec.ts`
- `ficha-anime.spec.ts`
- `importar.spec.ts`
- `landing.spec.ts`
- `movil.spec.ts`
- `recuperar-y-entrar.spec.ts`
- `sitios.spec.ts`
- `vista-lista.spec.ts`

## El guion crítico, que sigue vigente

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
