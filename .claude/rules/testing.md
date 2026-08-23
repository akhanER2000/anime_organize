# Regla · Testing

Dos herramientas y ninguna más: **Vitest** para unidad e integración, **Playwright** para
el flujo crítico end-to-end.

```
npm run test          vitest run
npm run test:watch    vitest
npm run test:e2e      playwright test
npm run test:cov      vitest run --coverage
```

## Qué se testea, y con qué prioridad

### Nivel 1 — obligatorio, sin excepción

Lo que rompe datos o filtra información entre usuarios:

1. **Normalización de títulos** (`src/lib/domain/normalizar.ts`).
   Función pura, muchísimos casos, coste de test cero. Casos mínimos:
   acentos (`Kimi no Na wa` / `Kimi nó Ná wa`), mayúsculas, puntuación (`:`, `!`, `?`, `.`,
   `,`, `-`, `~`, `'`), sufijos de temporada en español e inglés (`temporada 2`, `season 2`,
   `2nd season`, `s2`, `part 2`, `cour 2`), números romanos, espacios múltiples,
   ancho completo japonés, paréntesis de año (`Higurashi no Naku Koro ni (2020)`),
   y el caso de **no** normalizar de más: `Fate/Zero` y `Fate/stay night` no pueden colapsar.
2. **Detector de duplicados** (`src/lib/domain/duplicados.ts`).
   Exacto sobre `(user_id, title_normalized)`; similitud trigram en el umbral **0.55**
   (casos justo por encima y justo por debajo); igualdad por `anilist_id` con títulos
   distintos; y el caso negativo importante: dos temporadas legítimamente distintas no se
   marcan como el mismo anime si el usuario las quiere separadas.
3. **Aislamiento por `user_id`.** Test de integración con dos usuarios sembrados: cada
   repositorio y cada Server Action se prueba pidiendo el recurso del *otro* usuario y
   debe devolver `NO_ENCONTRADO` (404), nunca los datos y nunca un 403.
4. **SSRF de `/api/covers`** (`src/lib/covers/fetch-remote.ts`). Un test por bypass:
   `http://127.0.0.1`, `http://localhost`, `http://[::1]`, `http://169.254.169.254`
   (metadata de nube), `http://10.0.0.1`, `http://192.168.1.1`, IPv4 mapeada en IPv6,
   decimal/octal (`http://2130706433`), `file://`, `data:`, credenciales embebidas,
   redirección 302 a una IP privada, y DNS rebinding (hostname que resuelve a pública y
   luego a privada). **Todos deben ser rechazados.**
5. **Mapeo de progreso** (`COMPLETO` / `T1` / `EN_PROCESO` del seed → `progress.kind`).

### Nivel 2 — se testea siempre que se toque

- Pipeline de portadas: checksum reutilizado, límite de 8 MB, mime no soportado,
  dimensiones de salida (480×720 y 100×150), y que `source_url` **no** sea la fuente de verdad.
- Parseo de la respuesta de Claude: JSON válido, JSON con texto alrededor, JSON inválido,
  etiqueta fuera del vocabulario controlado, más de 2 etiquetas nuevas propuestas,
  confianza fuera de `[0,1]`. Nada de eso puede llegar a la BD.
- Mapeo de AniList → nuestro modelo, incluida la sanitización del HTML de `description`.
- Importación de `.xlsx`/`.csv`: mapeo de columnas, filas vacías, duplicados dentro del
  propio fichero, y el reporte de errores.
- Rate limiter: que corta al superar el límite y que devuelve `Retry-After`.
- Esquemas Zod de filtros: `searchParams` con basura no rompe la página.

### Nivel 3 — no se testea

- Que Tailwind aplique una clase.
- Que Next renderice un `<div>`.
- Getters y setters triviales.
- Mocks de todo que solo verifican que se llamó a un mock. Un test que no puede fallar por
  un bug real es deuda, no cobertura.

## Umbral mínimo

- **`src/lib/domain/` → 95 % de líneas y ramas.** Es lógica pura: no hay excusa.
- **`src/lib/covers/`, `src/lib/enrich/`, `src/lib/import-export/` → 85 %.**
- **Global → 70 %.**
- La cobertura de UI no cuenta para el umbral: para eso está el e2e.

CI falla por debajo del umbral. La cobertura es un suelo, no un objetivo: 100 % de líneas
con asserts flojos no vale nada.

## Cómo se escriben

- **Un test, un comportamiento.** El nombre describe el comportamiento en español:
  `it("colapsa 'Season 2' y 'temporada 2' al mismo título normalizado")`.
- **Arrange–Act–Assert** visible, con líneas en blanco entre los tres bloques.
- Sin lógica en el test: nada de `if`, `for` ni cálculos. Si necesitas un bucle, es
  `it.each` con una tabla de casos.
- **Nada de mocks de lo que puedes ejecutar de verdad.** `normalizarTitulo` se llama tal cual.
  Se mockea solo la frontera: `fetch` a AniList, el SDK de Anthropic, el DNS del validador
  de SSRF, y el reloj cuando el test depende del tiempo.
- Base de datos en los tests de integración: Postgres real (Neon *branch* de test o
  contenedor local), **nunca** un mock del ORM. Cada test corre en una transacción que se
  revierte al final.
- Los tests no dependen del orden entre ellos ni comparten estado global.

## Test-Driven Development

Para las reglas de dominio (normalización, deduplicación, mapeo de progreso, validación de
la respuesta de la IA) se escribe **el test primero**:

1. **Rojo** — un test que falla por el motivo correcto. Se ejecuta y se comprueba el fallo.
2. **Verde** — el código mínimo que lo pasa.
3. **Refactor** — se limpia con la red puesta.

Para UI y para *plumbing* de framework, TDD no aporta: se implementa y se cubre después.

## E2E — el flujo crítico

Un único `spec` de Playwright que no puede romperse nunca
(`e2e/vault-critico.spec.ts`), exactamente el que pidió el enunciado:

1. Registro de un usuario nuevo con email desechable.
2. Añadir un anime **pegando una URL de imagen**.
3. **Verificar que la portada se sirve desde `/api/covers/<id>` y NO desde el dominio
   original.** Se comprueba interceptando la red: no puede haber ninguna petición de imagen
   al host de origen, y el `src` del `<img>` debe empezar por `/api/covers/`.
4. Filtrar la biblioteca (por estado y por texto) y comprobar que el resultado y la URL
   (`searchParams`) cambian de forma coherente.
5. **Eliminar la cuenta**: re-autenticación, escribir el email, recibir el `.json` de export
   y comprobar que después de borrar no queda nada (login con esas credenciales falla).

Además, tres specs cortos: duplicado exacto bloqueado, sugerencia de similar, y navegación
por teclado (`/` enfoca el buscador, `Esc` limpia, foco visible).

Reglas del e2e:

- **Selectores por rol y texto accesible** (`getByRole("button", { name: "Añadir al vault" })`).
  Nada de selectores CSS frágiles ni de `nth-child`. `data-testid` solo cuando no hay
  nombre accesible razonable, y entonces es señal de que falta una `aria-label`.
- **Cero `waitForTimeout`.** Se espera por estado (`toBeVisible`, `toHaveURL`, `waitForResponse`).
  Un test con `sleep` es un test flaky con retraso.
- Cada spec crea su propio usuario y limpia al final. No comparten vault.
- Corre contra `npm run build && npm run start`, no contra `dev`.

## Antes de decir «terminado»

Se ejecuta y se **mira la salida** (regla de `verification-before-completion`):

```
npm run typecheck && npm run lint && npm run lint:tokens && npm run test && npm run build
```

y para las fases con UI, además `npm run test:e2e`.

No se declara una fase cerrada con tests en rojo, con `test.skip` nuevos, ni con un
`@ts-expect-error` recién añadido. Si algo queda fuera, se dice explícitamente qué y por qué.
