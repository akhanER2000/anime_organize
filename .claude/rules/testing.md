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

## Verificación por mutación · OBLIGATORIA en los tests de seguridad

**Un test verde no distingue entre «esto protege» y «esto no comprueba nada».**
Un test de aislamiento que pasa porque la consulta devuelve vacío *siempre* se ve
exactamente igual que uno que pasa porque el filtro funciona.

Por eso, **todo test que proteja un límite de seguridad se verifica rompiendo la
protección a propósito**:

1. **Romper** — se elimina la protección en el código (el filtro `user_id`, la
   comprobación de rate limit, el corte de `sessions_valid_from`…).
2. **Confirmar el rojo** — se ejecuta y se comprueba que el test falla, **y por
   el motivo correcto**. Si sigue verde, el test no vale y hay que reescribirlo.
3. **Restaurar** — se devuelve el código a su estado y se confirma el verde.
4. **Anotar** — en el propio test se deja escrito **qué mutación lo hace fallar**.

El paso 4 es el que hace que esto sirva de algo dentro de seis meses: quien lea
el test sabe qué está protegiendo de verdad, y quien lo modifique sabe cómo
volver a comprobarlo.

### Qué está sujeto a esta regla

| Límite | Mutación con la que se verifica |
|---|---|
| **Aislamiento por `user_id`** | quitar `eq(anime.userId, …)` del `WHERE` |
| **Propiedad antes de mutar** | quitar la llamada a `exigirAnimePropio` |
| **Rate limiting** | devolver siempre `permitido: true` |
| **Revocación de sesión** | devolver siempre `{ valida: true }` en `evaluarSesion` |
| **Validación SSRF** | permitir cualquier IP en el validador |
| **Deduplicación** | quitar el `UNIQUE (user_id, title_normalized)` |
| **Vinculación OAuth** | poner `allowDangerousEmailAccountLinking: true` |
| **Hash de contraseña** | comparar en claro |

### Forma de la anotación

```ts
/**
 * VERIFICADO POR MUTACIÓN (2026-08-23):
 *   Se quitó `eq(anime.userId, parametros.userId)` de `exigirAnimePropio`
 *   → 3 tests en rojo. Restaurado.
 */
```

Con la fecha, porque una verificación de hace dos años sobre un código que ha
cambiado veinte veces no dice gran cosa. Si tocas la protección, la vuelves a
hacer y actualizas la fecha.

### Lo que NO cuenta como verificación

- Que el test «parezca» correcto al leerlo.
- Que falle por un typo en el nombre de una variable: eso prueba que el fichero
  se ejecuta, no que la aserción compruebe el límite.
- Un test que solo cubre el caso negativo. **Se comprueba también el positivo**
  —que el dueño legítimo SÍ ve lo suyo—, o una función que devuelve vacío
  siempre pasaría el test entero.

## La operación tuvo éxito. ¿SOBRE QUÉ? · OBLIGATORIA

> **Un `ok: true` dice que algo funcionó. No dice sobre qué.**

Cinco fallos de este proyecto son el mismo fallo. En los cinco, todos los
indicadores estaban en verde y **la operación se aplicó a la entidad
equivocada**:

| # | Qué decía «bien» | Sobre qué actuaba de verdad |
|---|---|---|
| 1 | `sessions_valid_from`: 17 tests y mutación aprobada | **una función desconectada** — el sistema no la llamaba |
| 2 | El limitador: 8 tests contra Postgres real | **la puerta equivocada** — no estaba en la que se ataca |
| 3 | `db:verificar`: «Esquema verificado: todo correcto» | **la rama equivocada** — leía `DATABASE_URL_UNPOOLED` de `.env.local` |
| 4 | El despliegue: 895 + 74 + 48 tests verdes | **el commit equivocado** — nada se había subido |
| 5 | El seed: «83 animes, 83 portadas, 3,5 MB» | **no se comprobó de quién eran** — la cuenta que entra ve 0 |
| 6 | Lo mismo, otra vez: el seed de producción | **la rama equivocada** — el recuento salió de `development` porque en línea solo viajó `DATABASE_URL`, y quien cuenta prefiere `DATABASE_URL_UNPOOLED` |

> **El sexto es el tercero repetido, y por eso ya no basta con anunciar.**
> `db:migrate`, `seed` y `db:verificar` decían su destino en voz alta desde el
> fallo número 3 — y el 6 pasó igual, porque **el anuncio decía la verdad**: la
> variable que anunciaba sí apuntaba a producción. La que usaba el contador,
> no. Un anuncio honesto sobre una de dos variables no protege de nada.
>
> Arreglado con `exigirMismaRama()` en `scripts/rama-destino.ts`, que **para
> antes de escribir** si `DATABASE_URL` y `DATABASE_URL_UNPOOLED` son de ramas
> distintas. La lección general: **anunciar no es comprobar.** Si dos caminos
> pueden llevar a sitios distintos, el que decide tiene que ser uno solo, o hay
> que negarse a arrancar.

Ninguno se habría evitado con más tests de la operación. Los seis necesitaban
**una comprobación distinta**: no «¿funcionó?», sino «¿sobre qué?».

### La pregunta, en tres formas

Ante cualquier operación que escriba, migre, despliegue o verifique, hay que
responder las tres antes de darla por buena:

1. **¿SOBRE QUÉ FILA?** — ¿el `id` que se tocó es el que se pretendía?
2. **¿EN QUÉ BASE?** — ¿la rama de Neon es la que se cree? ¿de dónde salió la
   cadena, del entorno o de un fichero?
3. **¿QUÉ VERSIÓN?** — ¿el código que corre es el que se acaba de escribir?

Un test que solo comprueba el efecto responde a «¿funcionó?». Estas tres
responden a «¿le funcionó a quien tenía que funcionarle?», que es la pregunta
que fallaron los cinco.

### Cómo se comprueba, en la práctica

- **Toda operación destructiva o de escritura masiva ANUNCIA su destino antes de
  actuar.** Es lo que hacen ya `db:migrate`, `seed` y `db:verificar`: imprimen el
  host, la base, y **si la cadena vino del entorno o de un fichero**. Sin eso, el
  número 3 de la tabla habría dicho «todo correcto» sobre desarrollo.
- **Todo test de una escritura afirma sobre el ID, no solo sobre el efecto.** No
  basta con «se creó un anime»: hay que comprobar `user_id`. No basta con «la
  contraseña cambió»: hay que comprobar **de qué fila**. El número 5 es
  exactamente esto: se contaron 83 animes y 83 portadas con un `count(*)` que
  **tenía el `user_id` delante en la misma tabla**, y nadie lo agrupó por él.
  Un `GROUP BY user_id` en vez de un `count(*)` habría contado la misma cosa y
  además habría respondido la pregunta que importaba.
- **Todo despliegue compara el SHA servido con `origin`.** Es la puerta 0 de
  `/project:deploy`.
- **Cuando algo pueda existir dos veces, se cuenta.** `SELECT count(*)` antes de
  asumir que hay uno. Dos usuarios con el mismo correo, dos proyectos apuntando
  al mismo repositorio, dos ramas con el mismo esquema: en los tres casos, todo
  responde 200 y la mitad de las veces es la mitad equivocada.

### El control que lo delata

El mismo que ya exige la sección de mutación, aplicado a la identidad: **además
del caso positivo, se comprueba que la operación NO tocó a quien no debía.**

```ts
// Insuficiente: dice que funcionó, no sobre qué.
expect(resultado.valido).toBe(true);

// Suficiente: dice sobre QUIÉN funcionó, y sobre quién no.
expect(resultado.userId).toBe(idEsperado);
expect(await filasDe(otroUsuario)).toEqual(filasAntesDeOtroUsuario);
```

Es el mismo razonamiento que el control positivo de siempre —una función que
devuelve vacío pasa cualquier test negativo—, movido de «¿hace algo?» a «¿a
quién se lo hace?».

## Verificación por el CAMINO REAL · OBLIGATORIA, del mismo rango que la mutación

> **Un test que fabrica el insumo demuestra que la función es correcta, no que el
> sistema esté protegido.**

Toda protección de seguridad necesita **al menos un test que la ejercite por el camino
real del sistema**, no por uno reconstruido. Si el test no atraviesa el middleware, los
callbacks y el transporte de verdad, **no cuenta como verificación de esa protección**.

### Qué es un insumo fabricado

| Fabricado (no cuenta) | Real (cuenta) |
|---|---|
| un `iat` inventado que se pasa a la función | la cookie que devuelve el servidor tras un login |
| una sesión simulada `{ user: { id } }` | `auth()` sobre una petición con cookie real |
| un `Headers` montado a mano | la cabecera que llega a un Route Handler arrancado |
| un mock del cliente de base de datos | Postgres de verdad |
| dependencias inyectadas con `vi.fn()` | las dependencias reales cableadas |

Las dos formas son útiles y **ninguna sustituye a la otra**: la fabricada aísla la lógica y
permite cubrir casos límite baratos; la real comprueba que la lógica **está conectada**.

### El fallo que hizo nacer esta regla

`sessions_valid_from` estaba implementado, testeado con 17 casos, verificado por mutación
—al romperlo, tres tests en rojo— y **no se disparaba nunca**.

El middleware de Auth.js re-firma el JWT en cada navegación, así que `iat` era siempre
«ahora» y la comparación con el corte de revocación pasaba siempre. Los tests fabricaban el
`iat`, así que nunca vieron el problema.

**La mutación demostró que la función funcionaba. Nadie comprobó que estuviera conectada.**

Es la clase de fallo que sobrevive a todas las revisiones porque todos los indicadores
están en verde: el test pasa, la mutación lo tumba, la cobertura es alta, y la protección
no existe.

### La pregunta que hay que responder por cada protección

> Si alguien **desconectara** este mecanismo del sistema —sin tocar su código—,
> ¿se pondría rojo algún test?

Si la respuesta es no, la protección está verificada solo como función. Hace falta un test
del camino real.

### Cómo se anota

En la cabecera del test, junto a la nota de mutación:

```ts
/**
 * CAMINO REAL (2026-08-23): el test arranca `next start`, hace login por el
 * endpoint de verdad, guarda la cookie que devuelve el servidor, cambia la
 * contraseña, y comprueba que la siguiente navegación —atravesando el
 * middleware real— responde 401.
 *
 * NO se fabrica el token, ni la sesión, ni las cabeceras.
 */
```

### El registro de qué está verificado y cómo

`.claude/rules/testing.md` § «Estado de la verificación» (abajo) lleva la tabla de qué
protección se prueba por el camino real y cuál solo por uno reconstruido. **Una protección
en «reconstruido» es una protección que puede estar desconectada ahora mismo y nadie lo
sabría.** La tabla se actualiza cada vez que se añade o se cambia una protección.


## Estado de la verificación · qué se prueba por el camino real

> Actualizado: 2026-08-23. **Se revisa cada vez que se añade o cambia una protección.**
>
> Una protección en «reconstruido» **puede estar desconectada ahora mismo y nadie lo
> sabría**. Eso es exactamente lo que le pasó a `sessions_valid_from`.

| Protección | Cómo se prueba | Estado |
|---|---|---|
| **Revocación de sesión** (`sessions_valid_from`) | login real → cookie real → cambio de contraseña → navegación real contra el middleware | **REAL** ✓ |

<!-- lo que sigue no es retórica: es lo que encontró el primer test del camino real -->

### Lo que encontró el camino real en su PRIMERA ejecución

`src/lib/auth/revocacion.camino-real.test.ts` destapó **dos fallos que ninguna suite de
unidad podía ver**, porque los dos son de CONEXIÓN y no de lógica:

1. **El Route Handler de Auth.js no existía.** `src/auth.ts` exportaba `handlers` desde el
   primer día y **nadie los montaba**: no había `src/app/api/auth/[...nextauth]/route.ts`.
   La autenticación entera estaba escrita y desconectada. Los tests no lo vieron porque
   todos fabricaban la sesión en vez de pedírsela al servidor.
2. **Truncamiento al segundo entre `em` y `sessions_valid_from`.** El primero iba en segundos
   enteros (imitando al `iat` del JWT), el segundo en milisegundos. Una cuenta creada a las
   `10:00:00.800` cuyo dueño entraba a las `10:00:00.900` quedaba **revocada en el mismo
   segundo en que se registraba**: habría roto el registro con entrada automática, en
   producción, el primer día. El primer arreglo —truncar los dos lados— cambió el agujero por
   el contrario y volvió el test **intermitente**; la señal de que la solución no era elegir
   qué agujero tolerar, sino dejar de truncar (`em` es un claim propio, va en milisegundos).
3. **Los relojes de Neon y de la aplicación difieren ~600 ms** (medido: 566–737 ms), y
   `sessions_valid_from` se rellenaba con `DEFAULT now()` —reloj de la base— para compararse
   contra una marca del reloj de la aplicación. Se quitó el default: ver
   `db-conventions.md` § «Dos relojes, y no coinciden».

Ambos estaban en código que tenía tests verdes y verificación por mutación aprobada.
**La mutación mide si la función es correcta. El camino real mide si está enchufada.**
Son dos preguntas distintas y hacen falta las dos.
| **Contrato de datos** (no forjar contexto) | `vaultDe()` real + `tsc` y `eslint` reales sobre ficheros reales | **REAL** ✓ |
| **Aislamiento por `user_id`** | vault real contra Postgres real | **REAL** en la capa de datos · *no atraviesa `auth()`* |
| **Deduplicación** (`UNIQUE`) | Postgres real rechaza el duplicado | **REAL** ✓ |
| **Borrado en cascada** | Postgres real | **REAL** ✓ |
| **Tokens de diseño** | el script recorre los ficheros de verdad | **REAL** ✓ |
| **Scripts fantasma** | lee `package.json` real y comprueba el disco | **REAL** ✓ |
| **Enumeración por tiempo · login** | `verificarPassword` real y medida real. El hash señuelo iguala los dos caminos (165 ms contra 165 ms, medido por el auditor a través del endpoint) | **REAL** ✓ |
| **Enumeración por tiempo · recuperar** | `tiempo-recuperacion.integracion.test.ts`: mide los dos caminos contra Postgres real y compara la razón | **REAL** ✓ |
| **Rate limit antes del hash** | `revocacion.camino-real.test.ts`: martillea `POST /api/auth/callback/credentials` contra la app arrancada, comprueba los cubos en Postgres y que los bloqueados NO pagan Argon2id | **REAL** ✓ |
| **La CSP no deja la app en blanco** | `e2e/auth-humo.spec.ts`: Chromium **sin `bypassCSP`**, comprueba que el `<h1>` se pinta y que la consola no reporta bloqueos | **REAL** ✓ |
| **Registro → login → vault** | el mismo spec, rellenando los formularios de verdad | **REAL** ✓ |
| **Recuperar la contraseña Y ENTRAR después** | `e2e/recuperar-y-entrar.spec.ts`: dos recorridos en Chromium que restablecen y a continuación inician sesión, uno de ellos partiendo de una cuenta bloqueada por intentos | **REAL** ✓ |
| **El límite de login se gasta UNA vez por envío** | el mismo spec, contando en qué envío aparece «Demasiados intentos» (el sexto, con el límite en 5) | **REAL** ✓ |
| **404 y nunca 403 en la ficha** (`security.md` §1) | `e2e/ficha-anime.spec.ts` mira `response.status()` de un uuid inexistente, de un uuid ajeno y de tres cadenas que no son uuid | **REAL** ✓ |
| **Contrato de datos alcanzable** | el control positivo de `lint:contrato` OBTIENE el contexto con `exigirSesionParaLeer()`, no lo recibe como parámetro | **REAL** ✓ |
| **El limitador contra Postgres** (`registrarIntento`) | 8 casos contra la base real: cuenta, atomicidad con 12 llamadas concurrentes, ventana deslizante, aislamiento de claves | **REAL** ✓ |
| **CSRF** | `Headers` montadas a mano; nunca un Route Handler arrancado | **RECONSTRUIDO** |
| **Vinculación OAuth** | lógica pura. Aceptable: el proveedor está apagado y no hay camino real todavía | **RECONSTRUIDO** (justificado) |
| **SSRF en `/api/covers`** | — | **NO IMPLEMENTADO** (FASE 2) |

### Lo que encontró cada nivel de verificación · 2026-08-24

Tres verificadores independientes revisaron el artboard 07 y **cada nivel encontró lo que
los de abajo no podían ver**. Merece quedar escrito, porque justifica el coste de tenerlos
todos:

| Nivel | Lo que solo él podía ver |
|---|---|
| Tests de unidad (499) | la lógica, los casos límite, las mutaciones |
| Integración contra Postgres (38) | atomicidad, índices, cascadas, y los **dos relojes** |
| Camino real por HTTP | que el limitador **no estaba en la puerta que se ataca** |
| Un navegador con la CSP puesta | que la aplicación **se servía en blanco**, y que **todo registro sin nombre fallaba** |
| Un agente dedicado a REFUTAR | que `Reflect.construct` forjaba contextos, que la migración 0003 **nunca se aplicó**, y que un test «vigilante» eran dos tautologías |

El patrón se repite: **cuanto más cerca del usuario está la prueba, más grave es lo que
encuentra.** El fallo de la CSP no lo veía nada de lo anterior —el build salía a 0, las
cabeceras eran impecables, el HTML llegaba entero— y dejaba la aplicación inservible.

### Lo que hay que arreglar, y cuándo

- ~~**`registrarIntento` sin test**~~ — **HECHO (2026-08-23)**. Era lo más grave de esta
  tabla: código que corre en producción en cada login y que nadie había comprobado nunca.
  Ya está en `src/lib/rate-limit/limitador.integracion.test.ts`, contra Postgres real y con
  verificación por mutación. Lo que estaba testeado antes era `evaluar()`, la función PURA
  que decide a partir de dos contadores **ya calculados**; quien cuenta es el
  `INSERT … ON CONFLICT DO UPDATE`, y ese no se había ejecutado jamás en un test.
  La distinción es exactamente la de esta sección: la unidad medía la decisión, no el
  recuento.
- **Rate limit antes del hash** y **CSRF** pasan a REAL cuando existan las rutas: el test
  hará login contra el endpoint de verdad y comprobará el 429 y el rechazo por origen.
- **Aislamiento** sube a REAL completo cuando el test entre por una Server Action en vez
  de por `vaultDe` directamente.
- **SSRF** nace ya con test del camino real: un servidor local que redirige a `127.0.0.1`,
  no un mock de `fetch`.

## Ninguna pantalla está terminada sin un RECORRIDO EN NAVEGADOR · OBLIGATORIO

> **Un navegador de verdad, pulsando botones. No un test que llame a la Server Action.**

Toda pantalla necesita **al menos un recorrido e2e en Chromium** que la use como la usaría
la persona que va a usarla. No es una comprobación más: es el único nivel que ejercita la
aplicación entera —red, CSP, hidratación de React, el viaje de ida y vuelta de los datos—
y es donde aparecen los fallos que todo lo demás deja pasar.

### El fallo que trajo esta regla

`EsquemaNombre` convertía `""` en `null` en el cliente, y el servidor rechazaba `null` con
«Invalid input: expected string, received null». **Todo registro que dejara el nombre en
blanco fallaba** — el caso NORMAL, en un campo opcional.

Sobrevivió a:

| Nivel | Por qué no lo vio |
|---|---|
| `tsc --noEmit` | los tipos de entrada y de salida eran correctos **por separado** |
| ESLint | no es una cuestión de estilo |
| 499 tests de unidad | ninguno hacía el viaje de ida y vuelta |
| El resolver del formulario | aceptaba `""` sin problema; el fallo estaba al volver |
| Auditoría de seguridad | no es un agujero de seguridad |
| Verificador de fidelidad visual | la pantalla se pintaba perfecta |

Lo encontró **un navegador, en el primer intento**. No fue suerte: fue la única herramienta
que recorrió el camino entero.

El mismo día, el mismo nivel destapó que la aplicación **se servía en blanco en
producción** porque la CSP bloqueaba los scripts de Next. El build salía a 0, las cabeceras
eran impecables y el HTML llegaba completo. Ningún otro nivel podía verlo.

### Y lo segundo que encontró: un 404 que respondía 200

El mismo nivel, en la integración de las tres pantallas del vault, destapó que
`/app/anime/<uuid-que-no-existe>` respondía **200**. El cuerpo era el correcto —se pintaba
«No encontrado»— y el código de estado no.

La causa estaba en un fichero que **no era el de la ficha**: `src/app/app/loading.tsx`.
Un `loading.tsx` es un `<Suspense>`, y un `<Suspense>` autoriza a Next a **vaciar la
cabecera con 200** y mandar el esqueleto mientras la página sigue resolviéndose; cuando el
`notFound()` se lanza, las cabeceras ya viajaron. Y como estaba en el segmento padre,
cubría todo el subárbol.

Se acotó midiendo, una variable por build —no razonando—:

| Configuración | Estado |
|---|---|
| `notFound()` en una página suelta de `(publico)` | 404 |
| la misma página bajo `/app`, con `src/app/app/loading.tsx` | **200** |
| la misma, quitando ese `loading.tsx` | 404 |
| la ficha con su propio `[id]/loading.tsx` | **200** |
| lanzando el `notFound()` desde `generateMetadata`, que corre antes | **200** |

Por el camino se descartaron tres sospechosos con la misma disciplina: **no era el
middleware** (falla igual desactivándolo), **no era el layout de `/app`** (falla igual
vaciándolo) y **no era el `not-found.tsx` del segmento** (falla igual sin él).

Por qué importa: `security.md` §1 responde 404 y nunca 403 precisamente para que no se
distinga «no existe» de «no es tuyo». Con 200 en los dos casos, **quien enumera el vault
ajeno no necesita ni leer el cuerpo de la respuesta**. Y ningún test que comprobara el HTML
podía verlo, porque el HTML era el correcto.

Arreglado moviendo la biblioteca al grupo de ruta `(biblioteca)` —conserva su esqueleto,
que es donde hace falta— y dejando la ficha sin `loading.tsx`. Fijado por
`src/app/app/anime/[id]/sin-loading.test.ts`, verificado por mutación.

### Y la peor de todas: el flujo de recuperación llegó roto a producción

`/recuperar` devolvía 200. `/recuperar/nueva` devolvía 200. Los formularios se
veían. Se dio por bueno.

**Nadie completó el ciclo**: restablecer **y a continuación entrar**. En
producción no funcionaba, y el dueño perdió horas — que además empeoraban el
problema, porque cada intento renovaba el bloqueo.

Al diagnosticarlo midiendo, la causa no estaba donde parecía. El
restablecimiento funcionaba perfectamente: escribía el hash correcto, en la fila
correcta, con la marca de revocación en el pasado. Lo que impedía entrar era el
**limitador de intentos**, que no se liberaba al restablecer:

| paso | resultado |
|---|---|
| cinco intentos fallidos | bloqueado 15 minutos |
| login con la contraseña **correcta** | rechazado |
| restablecer | «Contraseña cambiada» |
| login con la **nueva** | **rechazado** |
| vaciar solo el cubo, sin tocar nada más | **entra** |

El último paso es el control que lo cierra: la contraseña siempre fue buena.

Y debajo había un segundo fallo que lo aceleraba: la Server Action del login
llamaba a `registrarIntentos` **para poder enseñar el mensaje**, y `authorize`
volvía a registrar. Un envío del formulario gastaba **dos** intentos —medido,
`contador = 2`—, así que el límite de cinco se agotaba al tercer envío.

Las dos cosas son de la misma familia que el resto de esta sección: **cada pieza
medía bien y nadie midió el conjunto**.

### Y una lección sobre los propios tests: `count()` no reintenta

Dos tests de la biblioteca leían `await tarjetas(page).count()` justo después de pulsar un
chip. Los chips son anclas normales, así que pulsarlos provoca una carga de página
**completa**, y `count()` es una foto **sin reintento**: salía `0` porque la rejilla nueva
aún no existía. Uno de los dos fallaba con «esperaba 0, recibí 83», que se lee como si
recargar hubiera perdido el filtro —era justo al revés—; el otro **pasaba por suerte**.

Se afirman con `toHaveCount`, que sí reintenta, y contra el recuento del chip —dato del
servidor— en vez de contra «lo que había antes». La comprobación queda además más fuerte.

### Qué tiene que hacer ese recorrido

No vale con abrir la página y comprobar que hay un `<h1>`. El recorrido **usa** la pantalla:

1. **Rellenar y enviar** el camino feliz, hasta ver el resultado.
2. **Dejar EN BLANCO todo lo que sea opcional.** Es el caso que se coló, y es el que más
   gente hace: la mayoría no rellena lo que no es obligatorio.
3. **Equivocarse**: enviar el formulario vacío, con un correo mal formado, con la
   contraseña demasiado corta. Y comprobar que el error se ve y dice algo útil.
4. **Volver atrás** con el botón del navegador y comprobar que la pantalla sigue usable.
5. **Recargar a mitad** —con datos escritos y sin enviar— y comprobar que no se rompe.
6. **Sin `bypassCSP`.** Si el spec desactiva la política, deja de detectar el fallo que
   más caro salió.

### Cómo se comprueba que existe

- Cada pantalla tiene su `e2e/<pantalla>.spec.ts`.
- `npm run test:e2e` los corre contra `build` + `start`, **nunca contra `dev`**: en
  desarrollo la CSP lleva `'unsafe-inline'` y el fallo del blanco no aparece.
- `npm run verificar:todo` lo encadena todo. Es el que se ejecuta antes de decir
  «terminado».

### Para los agentes de pantalla

Una pantalla sin su recorrido en navegador **no está entregada**, aunque compile, aunque
pase el lint, aunque tenga cien tests verdes y aunque se vea idéntica al artboard. Si el
recorrido no se puede escribir —porque la pantalla depende de algo que todavía no existe—
se dice explícitamente qué falta, y la pantalla queda como NO TERMINADA.

## El exit code es el resultado. No se enmascara.

**Ningún comando de verificación se encadena con `echo`, ni con nada que pueda producir
un éxito prestado.** El código de salida es la única prueba; el texto que lo acompaña es
decoración, y la decoración miente.

```bash
# MAL — el echo se imprime aunque tsc haya fallado: `tail` devolvió 0,
#       y en una tubería el estado es el del ÚLTIMO comando.
npm run typecheck 2>&1 | tail -5 && echo "typecheck OK"

# MAL — `|| true` convierte cualquier fallo en éxito.
npm run test || true

# MAL — el && encadena, pero el mensaje final afirma más de lo comprobado.
npm run lint && echo "todo verde"

# BIEN — se ejecuta solo y se mira el exit code.
npm run typecheck
echo "exit: $?"

# BIEN — si hace falta recortar la salida, se preserva el estado.
set -o pipefail
npm run typecheck 2>&1 | tail -5
```

Corolarios:

- **Se lee la salida, no se asume.** Un comando que «suele pasar» no está verificado.
- Nada de `2>/dev/null` sobre un comando de verificación: esconder el error no lo arregla.
- En un informe al usuario no se escribe «OK» junto a un comando cuyo exit code no se ha
  visto. Si se ha enmascarado por accidente, **se vuelve a ejecutar aislado y se dice**.
- `npm run verificar` encadena con `&&` a propósito: ahí el `&&` corta en el primer fallo,
  que es justo lo que se quiere. El problema no es `&&`, es afirmar el éxito por encima de él.

Este apartado existe porque pasó: un `| tail -5 && echo "typecheck OK"` imprimió «OK»
mientras `tsc` reportaba un error real.

## Antes de decir «terminado»

Se ejecuta y se **mira la salida** (regla de `verification-before-completion`):

```
npm run typecheck && npm run lint && npm run lint:tokens && npm run test && npm run build
```

y para las fases con UI, además `npm run test:e2e`.

No se declara una fase cerrada con tests en rojo, con `test.skip` nuevos, ni con un
`@ts-expect-error` recién añadido. Si algo queda fuera, se dice explícitamente qué y por qué.
