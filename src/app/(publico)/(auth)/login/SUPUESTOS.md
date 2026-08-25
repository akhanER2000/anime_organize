# Supuestos · pantalla «Iniciar sesión» (artboard 07, card izquierda)

Todo lo que he asumido, todo lo que no estaba decidido y toda contradicción que me he
encontrado. Ordenado por lo que más te puede interesar revisar.

---

## 1. Desviaciones conscientes respecto al PNG

### 1.1 El mensaje de error — **la regla de seguridad gana**

El artboard pinta **«Contraseña incorrecta · te quedan 4 intentos»**. No se ha implementado,
y no es un olvido:

- «Contraseña incorrecta» confirma que **el correo existe** — si no existiera, el mensaje
  sería otro. Es un oráculo de enumeración de cuentas.
- «te quedan 4 intentos» confirma que **hay una cuenta contando intentos** para esa
  dirección. Es el mismo oráculo por otra puerta.

Las dos cosas están prohibidas por `.claude/rules/security.md` §2 («`/registro`, `/login` y
`/recuperar` responden con el mismo mensaje […] exista o no la cuenta»).

**Lo que se pinta:** `mensajeLoginFallido(seExigeVerificacionEmail())`, de
`@/lib/auth/mensajes`. Texto idéntico si el correo no existe, si la contraseña es mala, si
la cuenta está desactivada o si falta la verificación. Fijado en `flujo.test.ts`
(«el mensaje NO menciona la contraseña ni cuántos intentos quedan»).

### 1.2 El fallo de credenciales NO pinta ningún campo en rojo

En el PNG el borde granate está en el campo **Contraseña**. Señalar ese campo es decir «el
correo está bien», que es el oráculo del punto anterior con otra forma. Por eso:

| Tipo de error                                       | Dónde se pinta                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Formato (Zod: correo mal formado, contraseña vacía) | en el campo, con `Campo error=…` — comprueba la forma del texto, no si la cuenta existe |
| Credenciales / cuenta / verificación                | **aviso del formulario**, sin marcar campos                                             |
| Límite de intentos                                  | aviso del formulario                                                                    |

El aviso del formulario usa exactamente la forma visual del error de campo del artboard:
mono 12 px, `--estado-abandonado-texto`, icono `⚠`, y va **en el mismo sitio** del PNG
(entre el campo de contraseña y la fila de «Recordarme»).

### 1.3 El conmutador «ver» no cambia su texto a «ocultar»

`Campo` reserva 36 px para el adorno (48 px de `padding-right` menos 12 de separación).
«ocultar» a 13 px mide ~45 px: se comería las últimas letras de lo escrito. El texto se
queda en «ver», como el artboard, y el estado lo llevan `aria-pressed` y el nombre
accesible («Mostrar la contraseña» / «Ocultar la contraseña»). Para quien ve, el estado ya
está en el propio campo: puntos o texto.

---

## 2. PARADAS · cosas que no he podido hacer sin salir de mi carpeta

### 2.1 «Recordarme» **no cambia la duración de la sesión** 🚩

La casilla existe, se valida (`EsquemaLogin.recordarme`) y llega al servidor. Y ahí se
queda: `session: { strategy: "jwt" }` en `src/auth.config.ts` no declara `maxAge`, así que
todas las sesiones duran lo mismo (los 30 días por defecto de Auth.js), se marque o no.

Auth.js v5 no ofrece un `maxAge` por login: habría que escribir la marca en el callback
`jwt` de `src/auth.ts` y leerla al codificar. **`src/auth.ts` y `src/auth.config.ts` son de
solo lectura para mí**, así que paro y lo reporto en vez de tocarlos.

Decisión que hay que tomar (no la tomo yo):

- **a)** implementar `maxAge` variable en `src/auth.ts` (sesión corta por defecto, larga con
  «Recordarme»), o
- **b)** quitar la casilla del diseño, porque una casilla que no hace nada es peor que no
  tenerla.

Mientras tanto el valor viaja y se ignora, con un `TODO` en el código que lo dice.

### 2.2 El test del CAMINO REAL del rate limit sigue pendiente 🚩

`.claude/rules/testing.md` § «Estado de la verificación» dice literalmente que
«**`registrarIntento` sin test** es lo más grave de esta tabla […] va en cuanto exista la
Server Action de login, con Postgres real», y marca «Rate limit antes del hash» como
**RECONSTRUIDO**.

La Server Action ya existe. El test que lo subiría a **REAL** necesita Postgres real y
`next start` (un `*.integracion.test.ts` o un spec de Playwright), y ninguno de los dos cae
dentro de mi carpeta; la tabla de estado vive en `.claude/**`, que también es de solo
lectura para mí. Lo dejo señalado:

- `flujo.test.ts` verifica el **orden** con dependencias inyectadas (y lo dice en su
  cabecera: RECONSTRUIDO, no REAL).
- Falta: un test que haga login de verdad contra el endpoint, agote el límite y compruebe
  el bloqueo **sin** que se haya llegado a Argon2id.

---

## 3. Valores que no estaban en los tokens, y qué he hecho

| Lo que pide el diseño             | Token                                                                  | Qué he escrito                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Padding de card **36 / 32** (§07) | no existe `36px`; la rejilla es de 8 y hay `--e-4` (32) y `--e-5` (40) | `p-[var(--e-4)]` → **32 / 32**. Diferencia real: 4 px arriba y abajo. Si te importa, la salida limpia es añadir el token, no el literal.                                                              |
| Ancho de card **416 px**          | no hay token de ancho de card                                          | derivado de tokens: `(--contenedor-max − 2·--marco-offset − 2·--gutter-l − 2·--gutter) / 3`, que da exactamente 416. Así, si cambia el gutter, la card sigue siendo la del diseño.                    |
| Tamaño del título                 | §07 no lo fija                                                         | `text-titulo-l` (34 px, Cormorant). Medido sobre el PNG: ~186 px de ancho para «Iniciar sesión» en una card de 416. Cumple «Cormorant nunca por debajo de 26».                                        |
| Subtítulo                         | §07 no lo fija                                                         | `text-cuerpo-s` (15) en `--porcelain-200`.                                                                                                                                                            |
| Color del adorno «ver»            | el PNG lo pinta gris apagado                                           | `--porcelain-200`. Sobre `--slate-800` (el fondo del input) `--ash-400` se queda en **4.17:1** y `design-tokens.md` dice que ahí el mínimo real es `--porcelain-200`. La regla gana al matiz del PNG. |

### 3.1 Aviso para la integración · el ancho no coincide con el de `/registro`

La pantalla de `/registro` (otro agente, en paralelo) deriva su card con
`calc((--contenedor-max − 2·--gutter-l − 2·--e-4) / 3)` ≈ **432 px**; la mía descuenta
además el marco de 24 px y da **416 px**, que es lo que mide la card en el PNG.

No es un fallo de ninguna de las dos: la spec describe las tres cards juntas y cada pantalla
pinta una sola. Pero **si alguna vez se ven seguidas, se notará**. La salida limpia es un
token compartido (`--ancho-card-auth`) en `globals.css`, y eso no lo decido yo.

Segundo aviso del mismo párrafo: **ese `calc` no se ha compilado todavía**, porque tengo
prohibido lanzar `npm run build`. Es una utilidad arbitraria de Tailwind v4 y depende de que
el escáner la extraiga. Si en el build la card sale a ancho completo, la causa es esa y el
arreglo es pasar el `calc` a un `style={{ maxWidth: … }}` (sigue sin literales de color, así
que `lint:tokens` no se queja). Afecta igual a `/registro`.

---

## 4. Decisiones de arquitectura y por qué

### 4.1 Server Action, y eso **es** la defensa CSRF

`acciones.ts` es `"use server"`, no un Route Handler. Next compara `Origin` con `Host` en
cada Server Action y rechaza si no casan: protección por defecto, sin código propio que se
pueda olvidar (`security.md` §2 ter). Las cookies de Auth.js son `SameSite=Lax` como segunda
capa.

### 4.2 El orden: parsear → rate limit → `signIn`

`ejecutarLogin` (en `flujo.ts`) comprueba el límite **antes** de tocar `signIn`, que es
quien acaba en `authorize` → Argon2id (19 MiB y decenas de ms). Una petición bloqueada no
llega al hash **ni consulta al usuario**. Verificado por mutación, con los números medidos
en la cabecera de `flujo.test.ts`.

Dos claves independientes, como manda `security.md` §5: `login:email` (5 / 15 min) y
`login:ip` (20 / 15 min). Sin cabecera de IP **no se aplica** la clave por IP: no se inventa
un cubo «desconocido» compartido.

### 4.3 La lógica testable vive en un `.ts`, no en el `.tsx`

Vitest corre con `environment: "node"` y no transforma JSX; y un módulo `"use server"`
arrastra `next/headers` y Auth.js al importarse. Por eso el orden vive en `flujo.ts` con las
dependencias inyectadas: es la única forma de **afirmar** que `autenticar` recibe cero
llamadas cuando el límite bloquea.

### 4.4 Códigos de error declarados en local

`api-conventions.md` dice que `CodigoError` vive en `src/lib/api/errors.ts`. **Ese fichero
no existe todavía** en el repositorio. La unión `CodigoErrorLogin` de `flujo.ts` usa los
mismos nombres de la tabla (`VALIDACION`, `LIMITE_EXCEDIDO`, `NO_AUTENTICADO`,
`ERROR_INTERNO`) para que, cuando exista, sea un cambio de import y nada más.

### 4.5 `Retry-After` no se expone al cliente

`security.md` §5 pide `Retry-After` al superar el límite. Una Server Action no devuelve
cabeceras, y meter los segundos en el sobre habría añadido un campo fuera del contrato de
`api-conventions.md`. El texto de `MENSAJES.loginDemasiadosIntentos` ya orienta («espera
unos minutos»). Si quieres el contador en la UI, hay que decidir dónde va en el sobre.

### 4.6 El limitador **falla cerrado**

Si `registrarIntentos` revienta (base caída), la acción deniega el intento. Efecto lateral
que conviene conocer: el usuario ve el mensaje de «demasiados intentos» aunque la causa real
sea que Neon no responde. Es lo que prescribe `security.md` §5 («si la base no responde, se
deniega»), y no es dramático: sin base tampoco habría login que permitir.

### 4.7 Destino tras entrar: `/app`

No estaba escrito en el encargo de la pantalla. Sale de `src/auth.config.ts`
(`PREFIJO_PRIVADO = "/app"`, y las rutas de auth redirigen ahí si ya hay sesión). La acción
llama a `redirect("/app")` **fuera** del `try/catch`, porque `redirect()` funciona lanzando y
un `catch` lo convertiría en un «error interno» con la sesión ya iniciada.

### 4.8 `hayErrorEnUrl`, cinturón además de tirantes

Auth.js **lanza** `AuthError` cuando fallan las credenciales, y ese es el camino normal.
Además se comprueba si la URL que devuelve `signIn(..., { redirect: false })` trae
`?error=`: si una versión de la beta dejara de lanzar, sin esa comprobación un fallo se
leería como un login correcto. Está testeado.

---

## 5. Textos que he tenido que escribir (no estaban en `mensajes.ts`)

Los de autenticación salen todos de `@/lib/auth/mensajes`. Estos dos no existen allí porque
no son de autenticación; si prefieres que vivan con los demás, se mueven:

| Dónde                                        | Texto                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `acciones.ts`, `ERROR_INTERNO`               | «No hemos podido completar la operación. Inténtalo de nuevo en unos minutos.»            |
| `formulario.tsx`, fallo de red del navegador | «No hemos podido contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.» |

Ninguno de los dos dice nada de la cuenta, así que no enumera.

---

## 6. `accionesLogin()` — consultada, y por qué no se pinta una lista extra

`mensajes.ts` ofrece `accionesLogin(seExigeVerificacion)` para enseñar las salidas junto al
mensaje de fallo. Con la bandera **apagada** (el valor por defecto) devuelve exactamente
`recuperar` y `registrarse`, y **las dos ya están permanentemente en la card**: «¿Olvidaste?»
→ `/recuperar` y «¿Sin cuenta? Crear una» → `/registro`. Repetirlas bajo el error sería
duplicar dos enlaces dorados en una pantalla que ya tiene su cuota de oro.

Con la bandera **encendida** aparece una tercera acción, «Reenviar el correo de
verificación», **que no tiene ruta en el proyecto**: no existe ninguna página ni handler de
reenvío. No pinto un enlace a ninguna parte. La pista sí llega al usuario, porque
`mensajeLoginFallido(true)` añade «Si acabas de registrarte, comprueba antes tu correo de
verificación». **Pendiente para quien active la verificación**: crear esa ruta y añadir aquí
la acción.

---

## 7. Dependencias de otras pantallas

- `/recuperar` y `/registro` **todavía no existen** (los escriben otros agentes en paralelo).
  Los dos enlaces del artboard apuntan ahí igualmente, que es lo correcto: la pantalla no
  debe esperar a que existan.
- El fondo, el marco dorado y el logotipo los pone `(auth)/layout.tsx`. No lo he tocado.

---

## 8. Comprobaciones ejecutadas

`npx tsc --noEmit`, `npx vitest run` sobre `flujo.test.ts`, `npm run lint` y
`npm run lint:tokens`: los cuatro en verde (salida literal en el informe de entrega).

**No he ejecutado `npm run build` ni `npm run dev`**: hay otros agentes trabajando sobre el
mismo árbol y `.next/` es compartido. La integración la hace quien coordina.

Lo que esas cuatro comprobaciones **no** cubren, y hay que mirarlo en la integración:

- la fidelidad visual contra `design/screens/07-auth.png` (subagente `ui-fidelity-checker`);
- el camino real del rate limit y del login (§2.2);
- que `Recordarme` haga algo (§2.1).
