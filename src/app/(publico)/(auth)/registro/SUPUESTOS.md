# Supuestos · pantalla «Crear cuenta» (artboard 07, card central)

Todo lo que he asumido, todo lo que no estaba decidido y toda contradicción que
me he encontrado. Ordenado por lo que más te va a costar decidir.

---

## 0. Las tres contradicciones que me diste, y dónde está cada una

| #   | La contradicción                                                                                 | Cómo queda                                                                                                                                         | Verificado                                                                    |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | El PNG pinta «Mínimo **8** caracteres»; `EsquemaPassword` exige **12**                           | **Gana el esquema**, y el número no se escribe: se lee de `EsquemaPassword.minLength`. Ver §2.                                                     | Mutación (e): poner el literal del PNG → **2 rojos de 26**                    |
| 2   | El registro **no puede decir si el correo ya existe** — ni por texto, ni por campo, ni por reloj | Mensaje idéntico en las tres ramas (incluido el camino de fallo de correo), y `consumirTiempoEquivalente()` en las dos que no hashean. Ver §2 bis. | Mutaciones (b) **4 rojos de 26**, (c) **1 rojo de 26**, (d) **4 rojos de 26** |
| 3   | `users.sessions_valid_from` no tiene `DEFAULT`, y es a propósito                                 | **No he podido escribirlo: me he parado antes.** El `insert` no es alcanzable desde `src/app/**`. Ver §1 y §1 bis.                                 | — (bloqueado por el contrato de datos)                                        |

---

## 1 bis. `sessions_valid_from`: lo que hay que escribir cuando se resuelva §1

No es un detalle de estilo, es el que hace que la cuenta recién creada pueda
entrar. La columna **no tiene `DEFAULT` a propósito**: se compara contra la marca
de emisión del JWT, que la escribe la **aplicación**, y un `defaultNow()` la
escribiría con el reloj de **Postgres**. Medido contra esta rama de Neon, la base
va **entre 566 y 737 ms por delante** de la máquina de desarrollo, así que quien
entrara justo después de registrarse tendría una marca **anterior a su propio
corte** y **nacería con la sesión revocada**
(`db-conventions.md` § «Dos relojes, y no coinciden»; `sesion.ts`
§ «El único sitio donde interviene el reloj de Postgres»).

Al insertar en `users` hay que poner, explícitamente:

```ts
import { marcaDeRevocacion } from "@/lib/auth/sesion";
// …
sessionsValidFrom: marcaDeRevocacion(new Date()),
```

Quitar el `DEFAULT` convierte el olvido en un **error de tipos** —Drizzle exige
el campo—, así que quien escriba el alta se va a topar con esto sin necesidad de
acordarse. Está anotado también en el bloque `PERSISTENCIA` de `acciones.ts`,
que es donde lo va a leer quien cierre la costura.

---

## 1. ME HE PARADO: el registro NO puede crear el usuario desde `src/app/**`

**Esto es lo único que hace que la pantalla no funcione de extremo a extremo, y
es exactamente la costura que me dijiste que reportara en vez de rodear.**

`acciones.ts` hace lo que puede hacer —parsear con Zod y aplicar el rate limit—
y **se detiene antes de tocar `users`**. No hay forma legítima de continuar:

| Puerta                                         | Por qué está cerrada                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import { users } from "@/lib/db/schema"`      | `eslint.config.mjs` → `no-restricted-imports`. `src/app/**` no está en los `ignores` (solo `src/lib/db/**`, `src/auth.ts` y `src/lib/rate-limit/**`).                                                                                                                                   |
| `import { dbInterna } from "@/lib/db/interno"` | Igual.                                                                                                                                                                                                                                                                                  |
| `await import("@/lib/db/interno")`             | `no-restricted-syntax` cubre también los imports **dinámicos**. La puerta de atrás obvia ya estaba tapiada.                                                                                                                                                                             |
| `neon(...)` / `drizzle-orm/neon-http` a pelo   | Igual: el driver está en la lista de imports prohibidos, estáticos y dinámicos.                                                                                                                                                                                                         |
| `vaultDe(ctx)` / `enTransaccion(ctx, …)`       | **No es cuestión de lint, es de diseño.** Los dos exigen un `ContextoUsuario`, que solo nace de una sesión ya verificada. En un registro **no hay sesión**: la cuenta es justo lo que todavía no existe. El registro cae fuera del contrato de datos por construcción, no por descuido. |

No he escrito ningún `eslint-disable`, ningún `as ContextoUsuario` y ningún
import dinámico. Lo he dejado documentado en el bloque `PERSISTENCIA` de
`acciones.ts`, con el cableado exacto que falta.

**Lo que hace falta que decidas tú:** una función de alta en la capa de datos
—en `src/lib/db/**`, análoga al permiso que `src/auth.ts` tiene concedido para
autenticar por `users.id`— que exponga algo como:

```ts
buscarCuentaPorEmail(email): Promise<{ verificada: boolean } | null>
altaDeUsuario({ email, passwordHash, nombre }): Promise<{ userId: string }>
```

Cuando exista, enchufarla es **una llamada**: `procesarRegistro(...)` en
`./registro.ts` ya está escrito, documentado y con 26 tests, incluido el orden
`rate limit → hash` verificado por mutación.

**Y el detalle que no se puede perder por el camino:** ese `insert` tiene que
escribir `sessionsValidFrom: marcaDeRevocacion(new Date())` de
`@/lib/auth/sesion`. La columna no tiene `DEFAULT` a propósito — el reloj de
Neon va ~600 ms por delante del de la aplicación y dejarlo en manos de la base
haría **nacer la sesión revocada**
(`db-conventions.md` § «Dos relojes, y no coinciden»).

Mientras tanto la acción responde `MENSAJE_REGISTRO_NO_DISPONIBLE` («Ahora mismo
no podemos crear cuentas nuevas») y loguea el motivo. **No responde
`MENSAJES.registroHecho`**: mandar a alguien a vigilar una bandeja de entrada
donde no va a llegar nada convierte un fallo visible en uno silencioso.

---

## 2. El placeholder del PNG dice 8; el esquema exige 12. Gana el esquema.

Resuelto como me indicaste, y con una vuelta de tuerca: el número **no está
escrito en ningún sitio de esta carpeta**. Se lee de `EsquemaPassword.minLength`
en `registro.ts`:

```ts
export const MINIMO_PASSWORD = minimoDeCaracteres(); // 12, del esquema
export const PLACEHOLDER_PASSWORD = `Mínimo ${MINIMO_PASSWORD} caracteres`;
```

Si mañana alguien sube el mínimo a 14, el texto sube solo. Y si alguien quita el
`.min()`, `minimoDeCaracteres()` **lanza** en vez de caer a un `?? 12` que sería
justo la copia desincronizada que esto evita.

Un test lo fija (`MINIMO_PASSWORD === EsquemaPassword.minLength`) y lo verifiqué
por mutación: al poner el literal «Mínimo 8 caracteres» del PNG, 2 tests en rojo.

**Supuesto mío:** he añadido una `ayuda` bajo el campo —«Una frase larga es más
segura que un críptico corto.»— que el artboard no lleva. Motivo:
`design-tokens.md` permite el placeholder en `--ash-inactivo` (2,44 : 1 sobre
`--slate-800`) **solo porque no porta información que no esté en la etiqueta**.
Con la cifra únicamente en el placeholder, esa condición no se cumpliría: la
información desaparece en cuanto se empieza a teclear. La ayuda no repite el
número, así que no hay redundancia visual.

---

## 2 bis. El registro NO dice si el correo ya existe. Por ningún canal.

Resuelto respetando `accionAnteEmailExistente`, que ya estaba decidido y
testeado. `procesarRegistro` ejecuta las tres ramas y **las tres devuelven lo
mismo**:

| Estado real de la cuenta | Qué se hace por detrás                                | Qué ve quien envía el formulario |
| ------------------------ | ----------------------------------------------------- | -------------------------------- |
| No existe                | se crea + correo de verificación                      | `MENSAJES.registroHecho`         |
| Existe, sin verificar    | **no se toca** + se reenvía la verificación           | `MENSAJES.registroHecho`         |
| Existe y verificada      | **no se toca** + «ya tienes cuenta, entra» al titular | `MENSAJES.registroHecho`         |

Tres canales de fuga, tres cerrados:

1. **Texto.** Un solo mensaje. Y el **camino de error también**
   (`MENSAJES.correoNoEnviado` es idéntico en las tres ramas): es el que un
   atacante puede provocar a voluntad saturando el rate limit del proveedor de
   correo, así que blindar solo el camino feliz no blindaría nada.
2. **Reloj.** Las dos ramas que no ejecutan Argon2id llaman a
   `consumirTiempoEquivalente()`. Sin eso responderían en microsegundos frente a
   las decenas de ms de la rama que sí hashea, y se enumeran cuentas
   **cronometrando**, sin leer un solo mensaje.
3. **Navegación.** Ninguna rama redirige ni entra automáticamente. Ver §3, que
   es la contradicción que esto destapa y que te dejo a ti.

Y una cuarta cosa que no es fuga sino secuestro: **una cuenta que ya existe no
se escribe jamás**. Si el registro sobrescribiera la contraseña de una dirección
ya registrada, sería una toma de cuenta con un solo formulario. Mutación (d)
—forzar la rama `CREAR` para todas— deja **4 tests en rojo de 26**.

---

## 3. CONTRADICCIÓN ENTRE DOS REGLAS: entrada automática vs. no enumerar

**No la he resuelto por mi cuenta. La he dejado apuntando al lado seguro y te la
traslado.**

- `decidirSiguientePaso` devuelve **`"ENTRAR"`** cuando
  `AUTH_REQUIRE_EMAIL_VERIFICATION` está apagada — y está apagada **por
  defecto** (`BANDERAS` en `entorno.ts`). Es decir: el diseño previsto es
  registrarse y entrar directamente. `sesion.ts` y `db-conventions.md` hablan
  explícitamente de «el registro con entrada automática».
- `security.md` §2 y `accionAnteEmailExistente` exigen que **el registro
  responda igual exista o no la cuenta**.

Las dos cosas no pueden ser ciertas a la vez. Entrar automáticamente **solo es
posible en la rama `CREAR`**: en las otras dos no hay ninguna prueba de que quien
rellena el formulario sea el titular. Si la pantalla entrase en un caso y
mostrase «revisa tu correo» en el otro, **la propia navegación sería el oráculo
de enumeración** que el mensaje único existe para cerrar — y uno mucho más
ruidoso que un texto, porque se lee sin leer nada.

**Lo que he hecho:** `procesarRegistro` calcula `siguientePaso` con la función ya
testeada y lo devuelve, pero **la card no ramifica sobre él**. Siempre se pinta
el mismo mensaje. Está anotado en el tipo `ResultadoRegistro` para que nadie lo
cablee sin leer esto.

**Lo que tienes que decidir:** o se acepta perder la entrada automática desde
`/registro` (lo que hay ahora), o se acepta el oráculo a cambio de la comodidad.
Si eliges lo segundo, el cambio es una línea en el formulario — pero entonces
`MENSAJES_QUE_NO_PUEDEN_DIVERGIR` está protegiendo un texto cuyo secreto ya se
filtró por la barra de direcciones, y conviene decirlo en su comentario.

---

## 4. DOS COPIAS DEL MENSAJE DE REGISTRO, Y NO DICEN LO MISMO

Encontradas en dos ficheros que ya existían, las dos presentadas como «el»
mensaje único del registro:

| Origen                                           | Texto                                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/lib/auth/registro` → `MENSAJE_REGISTRO`       | «Si la dirección es válida, te hemos enviado un correo. **Revisa tu bandeja de entrada.**»                                                                |
| `@/lib/auth/mensajes` → `MENSAJES.registroHecho` | «Si la dirección es válida, te hemos enviado un correo **para confirmar tu cuenta**. Revisa tu bandeja de entrada **y la carpeta de correo no deseado**.» |

Es literalmente la deriva contra la que avisa la cabecera de
`src/lib/validation/auth.ts`: dos copias que empezaron iguales y ya no lo son.

**He usado `MENSAJES.registroHecho`**, por dos motivos: es el que aparece dentro
de `MENSAJES_QUE_NO_PUEDEN_DIVERGIR` —o sea, el que tiene un test vigilándolo— y
es el que menciona la carpeta de spam, que es información útil de verdad.

**Sugerencia (no la he aplicado: los dos ficheros son de solo lectura para mí):**
que `MENSAJE_REGISTRO` pase a ser `export const MENSAJE_REGISTRO =
MENSAJES.registroHecho`, y que una copia deje de existir. Hoy `registro.test.ts`
comprueba que ninguna de las dos enumera, pero **no** que sean la misma.

---

## 5. Medidas del artboard que no existen como token

`globals.css` es de solo lectura para mí, así que ninguno de estos números se ha
escrito como literal:

| Lo que pide el PNG / la spec                  | Qué he puesto                                                                         | Por qué                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ancho de card ≈ **414 px** (medido en el PNG) | `max-w-[calc((var(--contenedor-max)-2*var(--gutter-l)-2*var(--e-4))/3)]` ≈ **432 px** | Ver §5 bis: de dónde sale mi número y por qué el de `/login` (416) es mejor.                                                                                             |
| Padding interno **36 / 32**                   | `p-[var(--e-4)]` (32 / 32)                                                            | 36 px no está en la escala de 8. La escala salta 32 → 40, y `--e-3-5` (28) existe como excepción declarada solo para el chip de espejo. No he inventado un tercer valor. |
| Separación medidor → botón ≈ 20 px            | `--e-2` (16) del `gap` del formulario                                                 | `--e-2-5` (20) existe, pero mantener un único ritmo vertical en el formulario se ve mejor que clavar cada hueco. Cámbialo si `ui-fidelity-checker` protesta.             |

---

## 5 bis. De dónde sale mi 432, y por qué me quedo con el 416 de `/login`

Me dices que el agente de `/login` deriva **416 px** y yo **432**. Aquí está mi
aritmética, para que elijas con los dos números delante.

**Lo que medí en el PNG** (`design/screens/07-auth.png`, 1443 × 754 px, o sea
1 : 1 con el artboard de 1440):

|                           | x inicial | x final | ancho                   |
| ------------------------- | --------- | ------- | ----------------------- |
| Card 1 · Iniciar sesión   | 65        | 479     | **414**                 |
| Card 2 · Crear cuenta     | 513       | 927     | **414**                 |
| Card 3 · Recuperar acceso | 961       | 1375    | **414**                 |
| Hueco entre cards         | 479       | 513     | **34** (≈ 32 = `--e-4`) |

Total ocupado: 1375 − 65 = **1310 px**, y `(1310 − 2 × 34) / 3 = 414`.

**Mi derivación** partió del contenedor y le restó los gutters laterales:

```
(--contenedor-max − 2 × --gutter-l − 2 × --e-4) / 3
= (1440 − 2×40 − 2×32) / 3
= (1440 − 80 − 64) / 3 = 1296 / 3 = 432
```

**Dónde me quedo corto:** resté `--gutter-l` (40 px de padding lateral de
pantalla) pero **no descontar el marco dorado**, que está a `--marco-offset`
= 24 px de cada borde. El PNG arranca la primera card en x = 65, no en x = 40:
los 65 son 24 (marco) + ~40 (aire hasta la card). Es decir, el marco y el gutter
**se suman**, no se solapan, y yo conté solo uno de los dos.

La derivación de `/login` corrige exactamente eso:

```
(1440 − 2×24 − 2×40 − 2×32) / 3 = 1248 / 3 = 416
```

**416 es el número correcto**, y cae a 2 px del medido (414), que es error de
medición sobre píxeles con antialias. El mío se pasa por 18 px.

**Conclusión: unifica con 416, no con 432.** No lo cambio yo porque me dijiste
que no lo tocara y porque el token compartido es tuyo; en cuanto exista
(`--ancho-card-auth` o equivalente), esta pantalla solo tiene que sustituir la
constante `ANCHO_CARD` de `page.tsx`, que está aislada en una línea justo para
eso.

---

## 6. Decisiones de implementación que no estaban escritas en ningún sitio

1. **El formulario necesita JavaScript para enviarse.** React Hook Form
   `handleSubmit` llama a `preventDefault()` siempre, así que no se puede
   combinar con `<form action={…}>` de React 19: o gobierna RHF, o gobierna la
   acción. Como el encargo pide RHF + `zodResolver` explícitamente, gobierna
   RHF y se pierde el envío sin JS. **Dilo si prefieres lo contrario**: la
   alternativa es `useActionState` con `FormData` y RHF solo para el medidor y
   la validación al salir de cada campo.
2. **La Server Action recibe un objeto, no `FormData`.** Es serializable y va
   tipado. No relaja nada: `EsquemaRegistro.safeParse` corre igual en el
   servidor y no se fía de lo que llegue.
3. **Al aceptar, el formulario desaparece** y deja solo el mensaje. Dejarlo en
   pantalla invita a reenviar, y cada reenvío gasta uno de los cinco intentos
   por hora de esa IP.
4. **El medidor NO se conecta con `aria-describedby` al input.** `Campo`
   construye el suyo con el error y la ayuda, y `...resto` se esparce **después**
   sobre el `<input>`: pasarle otro `aria-describedby` lo **sobrescribiría** y
   desconectaría el mensaje de error. El medidor ya se anuncia solo con su
   `role="status"`. _(Esto es un filo de la primitiva, no un fallo: si alguna
   pantalla llega a necesitar un descriptor extra, `Campo` tendría que fusionar
   en vez de dejar que lo pisen.)_
5. **El pie enlaza a `/terminos`, que no existe todavía.** Da 404. El texto sale
   del artboard; la ruta es mi suposición.
6. **`robots: { index: false }`** en la metadata. No lo pide ninguna regla: un
   formulario de alta no aporta nada a un buscador y sí atrae registros
   automáticos.

---

## 7. Rate limit: por IP y solo por IP

`LIMITES` define `registro:ip` (5 / hora) y **no** define `registro:email`. Lo he
tomado como deliberado y no he añadido la segunda clave: limitar el registro por
dirección de correo permitiría a un atacante **impedir que alguien se registre**
gastándole el cubo, y convertiría la tabla en un detector de qué direcciones está
intentando registrar la gente.

Consecuencia que sí conviene tener presente: **sin cabecera de IP no se aplica
ningún límite** al registro. Es lo que fija `security.md` §5 («no se inventa un
cubo _desconocido_ compartido»), y en Vercel la cabecera siempre llega puesta por
la plataforma — pero en local, o detrás de otro hosting, el registro queda sin
limitar. Queda un `console.warn` cuando ocurre.

---

## 8. Lo que NO he hecho, y a quién le toca

- **No he tocado nada fuera de esta carpeta.** Ni `globals.css`, ni `src/lib/**`,
  ni `src/components/**`, ni `(auth)/layout.tsx`, ni el esquema, ni las reglas.
- **No he instalado nada.**
- **No he ejecutado `npm run build` ni `npm run dev`** (hay otros agentes sobre
  el mismo árbol y `.next/` es compartido).
- **No hay test del CAMINO REAL.** No puede haberlo: la acción se detiene antes
  de crear el usuario. Los 26 tests son de insumo **reconstruido** —dependencias
  inyectadas con `vi.fn()`—, lo dicen en su cabecera, y demuestran que la función
  ordena bien, **no que esté enchufada**. En cuanto exista el alta en la capa de
  datos, esta pantalla da por fin el test real que `testing.md` § «Estado de la
  verificación» reclama para **«Rate limit antes del hash»** (hoy
  _RECONSTRUIDO_) y para **`registrarIntento` contra Postgres** (hoy _SIN
  TEST_, y marcado como lo más grave de esa tabla).
- **No he pasado `ui-fidelity-checker`.** Es obligatorio antes de cerrar la fase
  y te toca a ti lanzarlo contra `design/screens/07-auth.png`.
