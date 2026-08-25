# Recuperar acceso — supuestos, desviaciones y paradas

Pantalla: artboard 07, card de la **derecha**. Carpeta: `src/app/(publico)/(auth)/recuperar/`.

Todo lo de aquí es una decisión que **no estaba tomada** en el encargo, o una
**contradicción** entre el PNG y una regla. Donde el PNG choca con una regla,
gana la regla y queda anotado abajo.

---

## 1. Desviaciones respecto al PNG

### 1.1 La caducidad: el PNG dice 15 minutos, la pantalla dice 60

**Gana la regla.** `.claude/rules/security.md` §2 fija **1 hora** para los tokens
de un solo uso. No es un caso de uno contra uno, son tres contra uno:

| Fuente                                                         | Dice                         |
| -------------------------------------------------------------- | ---------------------------- |
| `design/screens/07-auth.png`                                   | «Caduca en 15 minutos»       |
| `.claude/rules/security.md` §2                                 | 1 hora                       |
| `src/lib/db/schema/auth.ts`, cabecera de `passwordResetTokens` | «Caduca a 1 h»               |
| `src/lib/email/plantillas.ts`, `plantillaReset`                | «El enlace caduca en 1 hora» |

Además, `CLAUDE.md` § «El diseño manda» da al artboard autoridad **visual**, no
autoridad sobre una regla de seguridad. La card enseña **60 minutos**.

**Y el número no está escrito a mano.** Sale de `CADUCIDAD_ENLACE_MS` en
`./constantes.ts`, viaja en el sobre de la Server Action
(`data.minutosCaducidad`) y llega al componente como prop. Si un día se cambia
la caducidad del token y no el literal de la pantalla, la interfaz mentiría —y
mentiría en la dirección peor: el usuario creería que le queda una hora cuando
el enlace ya murió.

> **Costura abierta.** Hoy esa constante es la **única** copia, pero el backend
> todavía no la lee, porque el backend no existe (ver §3.1). Cuando exista, la
> constante debe **mudarse** a `src/lib/auth/` y ser la misma que calcule el
> `expires_at` del `INSERT`. Está escrito como `TODO(recuperar)` en
> `emision.ts`, punto (b).

### 1.2 El mensaje de éxito se enseña exista o no la cuenta

Es lo que impide que el formulario se convierta en un buscador de direcciones
registradas (`security.md` §2). No hay —ni puede haber— un «ese correo no está
registrado», ni un error de campo que lo insinúe.

Está construido para que no se pueda romper por descuido: el sobre de éxito es
**una constante**, `RESPUESTA_ENVIADO` en `flujo.ts`, no dos objetos idénticos en
dos ramas que alguien pueda «mejorar» por separado dentro de seis meses. Es el
mismo razonamiento de `MENSAJES_QUE_NO_PUEDEN_DIVERGIR` en `mensajes.ts`.

**Y tampoco delata por tiempo.** Cuidar el texto no basta: si el camino «no hay
cuenta» respondiera en microsegundos y el real tardara decenas de milisegundos
—consulta, token, correo—, la existencia de la cuenta se leería en el
cronómetro, sin leer un solo mensaje. Por eso el camino vacío llama a
`consumirTiempoEquivalente()`. Verificado por mutación (§5).

### 1.3 El PNG solo enseña un estado; hay dos

El artboard está rotulado «estado 03 · correo enviado»: es el estado de éxito.
El otro —el campo CORREO y su botón— es el que ve todo el mundo al llegar, y
está implementado igualmente. Las etiquetas grises del PNG son anotaciones del
tablero, **no van en la UI**.

### 1.4 Padding de la card: la spec pide 36/32, la card lleva 32

`DESIGN-SPEC` §07 dice «padding interno 36/32». **36 px no existe como token**:
la rampa va `--e-4: 32px` → `--e-5: 40px`, y `design-tokens.md` prohíbe
inventarse valores intermedios. Se usa `p-[var(--e-4)]` (32), que es lo que hace
también `login/page.tsx`. Si se quiere el 36 real, hay que añadirlo a
`design/tokens.json`, y eso no es de esta pantalla.

### 1.5 «Reenviar en 0:42» es un fotograma, no un valor inicial

El PNG congela el botón a mitad de cuenta atrás. El valor de partida no está en
ningún sitio del diseño: se ha elegido **60 s** (`SEGUNDOS_ANTES_DE_REENVIAR`).
Cualquier valor ≥ 42 es coherente con el artboard. Ver §2.1.

---

## 2. Supuestos (decisiones que no estaban tomadas)

### 2.1 La cuenta atrás es cosmética, y 60 s es una elección

**No protege nada.** El límite real lo impone el servidor: `recuperar:email`
permite 3/hora y `recuperar:ip` 10/hora. Quien abra las herramientas de
desarrollo pone el contador a cero en dos segundos, y da igual — la petición se
corta en el servidor igual. Lo que evita es el reenvío por reflejo del usuario
honesto, que si no se gastaría uno de sus tres intentos de la hora sin querer.

Está dicho en el propio módulo (`cuenta-atras.ts`) para que nadie lo confunda con
una defensa.

### 2.2 Textos que no estaban escritos

| Texto                                                                                                                                                         | De dónde sale                              | Nota                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| «Recuperar acceso», «Te mandamos un enlace de un solo uso.», «Enlace enviado», «Caduca en N minutos. Revisa spam si no aparece.», «← Volver a iniciar sesión» | Artboard 07                                | literal                                                                                                  |
| Mensaje de éxito canónico                                                                                                                                     | `MENSAJES.recuperarEnviado`                | ver §2.3                                                                                                 |
| Errores de campo                                                                                                                                              | `EsquemaRecuperar` / `MENSAJES.campos`     |                                                                                                          |
| **«Enviar el enlace»** (botón del estado (a))                                                                                                                 | **inventado**                              | El PNG no enseña ese estado. Sigue el tono de las otras dos cards («Entrar al Vault», «Crear mi vault»). |
| **«Demasiados intentos. Espera unos minutos antes de volver a pedir otro enlace.»**                                                                           | **inventado**                              | ver §3.3                                                                                                 |
| Error interno                                                                                                                                                 | `MENSAJE_ERROR_INTERNO` en `constantes.ts` | Copia el de `login/acciones.ts`. Debería vivir en `lib`.                                                 |

El campo CORREO va **sin placeholder**. El artboard enseña un valor escrito
(`rocio@correo.com`), no un placeholder, y la etiqueta ya dice qué va ahí.

### 2.3 `MENSAJES.recuperarEnviado` va en `sr-only`, y es discutible

Hay una tensión real que conviene que revises:

- El **artboard** pide una card compacta: titular «Enlace enviado» + una línea
  mono con el número de minutos.
- **`MENSAJES.recuperarEnviado`** es el texto canónico, revisado por seguridad, y
  el único que dice explícitamente «**Si esa dirección tiene una cuenta**…» — que
  es la frase honesta cuando la cuenta no existe.

Enseñar los dos duplica la palabra «Caduca» (el mensaje canónico lleva «una hora»
escrito **en prosa**, dentro de un fichero que no puedo editar: es la segunda
copia del mismo dato, justo lo que §1.1 intenta evitar).

**Decisión tomada:** lo visible es la copia del artboard con el número de la
constante; el texto canónico —que es el que devuelve el servidor— va en un
`<p class="sr-only">` dentro de la misma región `role="status"`, para que llegue
íntegro a quien usa un lector de pantalla.

**Si prefieres enseñárselo a todo el mundo, es quitar `sr-only`** en
`formulario.tsx` → `AvisoEnviado`. La alternativa limpia es que
`recuperarEnviado` se construya desde la constante compartida; entonces la línea
del artboard se queda solo en «Revisa spam si no aparece.» y no hay duplicación.
Las dos cosas están fuera de mi carpeta.

### 2.4 Detalles de diseño resueltos con el sistema, sin inventar

- **Ancho de card**: la misma expresión de tokens que `login/page.tsx`,
  `(1440 − 2·24 − 2·40 − 2·32)/3 = 416 px`. Escrito como `calc()` de variables,
  no como `416px`.
- **Sin `acento`**: `DESIGN-SPEC` §07 dice que el borde superior dorado lo lleva
  **solo** la card activa (Iniciar sesión).
- **Ningún botón `solido`**: el único relleno dorado de la pantalla es «Entrar al
  Vault», en la card de login (regla del oro nº 3). Los dos botones de esta card
  son `primario`.
- **El aviso de éxito no usa la primitiva `Toast`**: un toast es flotante, se
  cierra solo y lleva un único texto. Esto es contenido fijo de la card, con
  titular y cuerpo. Se compone con los mismos tokens y la misma forma que la
  spec da a los avisos con borde izquierdo de 2 px (§6, filas «Toast» y
  «Modal»): éxito = `--gold-400`.
- **Superficie del aviso**: `--slate-900`. Sobre `--slate-800` el mono en
  `--ash-400` se queda en 4.17:1 y `design-tokens.md` obliga a subir a
  `--porcelain-200`; sobre `--slate-900` pasa (4.80:1).
- **El foco se mueve al aviso** al pasar al estado de éxito: el botón que el
  usuario acababa de pulsar deja de existir y el foco caería al `<body>`.

---

## 3. Paradas y costuras que no me tocan a mí

### 3.1 PARADA — `password_reset_tokens` no se puede escribir desde `src/app/**`

**Esto es la parada gorda del encargo, y es de arquitectura, no un olvido.**

Para emitir un enlace de verdad hay que generar el token, guardar su `sha256` en
`password_reset_tokens` y mandar el correo. Desde una pantalla **no se puede**:

- `.claude/rules/db-conventions.md` § «El contrato de datos» cierra el acceso a
  las tablas crudas fuera de `src/lib/db/**`, y `eslint.config.mjs` lo hace
  cumplir: importar `@/lib/db/schema` o `@/lib/db/interno` desde `src/app/**` es
  un **error de lint**, y el import dinámico tampoco lo esquiva
  (`no-restricted-syntax`).
- `vaultDe(ctx)` tampoco sirve: exige un `ContextoUsuario`, y aquí **no hay
  sesión** —el usuario está precisamente fuera— ni puede haberla, porque el token
  es justo lo que va a demostrar quién es.

**No he intentado saltármelo.** La costura queda marcada en `./emision.ts`:
`emitirEnlaceDeRecuperacion()` devuelve `NADA_QUE_HACER` y su cabecera lleva un
`TODO(recuperar)` con los cuatro pasos que faltan, en orden.

**Lo que sí funciona hoy**: la pantalla valida, aplica el **rate limit real
contra Postgres**, paga el tiempo equivalente y enseña el estado de éxito. Lo
único que no ocurre es que salga un correo — y para el usuario es indistinguible
de una cuenta que no existe, que es exactamente lo que este flujo quiere que sea
indistinguible.

### 3.2 Contradicción — el correo SÍ está configurado, al contrario de lo que decía el encargo

El encargo decía que «el envío real del correo no está configurado y no hay
proveedor decidido». **En el árbol sí lo hay**: `src/lib/email/` tiene
`driver-resend.ts`, `driver-consola.ts`, `reintentos.ts` y —lo más relevante—
`plantillaReset()` ya escrita, con el enlace apuntando a
`/recuperar/nueva?token=…`.

No he metido ninguna dependencia de correo ni he escrito un cliente SMTP: no
hacía falta y no era mi encargo. Pero **la pieza que falta no es el transporte,
es el token** (§3.1). Cuando exista el orquestador, `enviarEmail(plantillaReset(…))`
está listo para usarse tal cual.

> Ojo también: sin `RESEND_API_KEY` y `EMAIL_FROM` el módulo cae al driver de
> consola. Eso es deliberado y está documentado allí.

### 3.3 `MENSAJES` no tiene entrada para «demasiados intentos» en recuperación

Solo existe `loginDemasiadosIntentos`, y termina con «Si no recuerdas la
contraseña, es más rápido restablecerla» — un consejo absurdo justo en la
pantalla de restablecer la contraseña. `mensajes.ts` es de solo lectura para mí,
así que el texto vive en `constantes.ts` como `MENSAJE_DEMASIADOS_INTENTOS`, con
su motivo y un `TODO(recuperar)`.

**Pendiente:** mover a `MENSAJES.recuperarDemasiadosIntentos` y borrar la copia.
Las copias divergen.

_(No enumera: el contador del limitador sube exista o no la cuenta, así que ver
ese mensaje no dice nada sobre la dirección escrita.)_

### 3.4 Contradicción menor — los números del rate limit

`security.md` §5 tabula `POST /api/recuperar` como «**3/hora**, clave IP + email».
`src/lib/rate-limit/politica.ts` lo implementa como **3/hora por email** y
**10/hora por IP**.

Uso los valores de `politica.ts` tal cual: la política es de `lib`, no se
reescribe desde una pantalla, y la clave que de verdad importa aquí —el email—
coincide con la regla. Merece una línea de aclaración en `security.md` §5 para
que la tabla y el código digan lo mismo.

### 3.5 El fallo de envío **no puede ser visible**, y hay que recordarlo al cerrar la costura

Cuando §3.1 se resuelva, un correo que no sale debe seguir devolviendo éxito de
cara al usuario. El camino «no hay cuenta» **nunca intenta enviar**, así que un
error de envío visible sería un oráculo perfecto de qué direcciones tienen
cuenta — y además un oráculo que el atacante puede **provocar a voluntad**
saturando el rate limit del proveedor. Es literalmente el caso
`FALLO_EN_RECUPERACION` de `MENSAJES_QUE_NO_PUEDEN_DIVERGIR`.

Por eso `MENSAJES.correoNoEnviado` **no se usa** en esta pantalla, y el botón de
reenvío es la salida para quien de verdad no reciba nada. Anotado como
`TODO(recuperar)` punto (c) en `emision.ts`.

---

## 4. Qué tipo de verificación tienen los tests

**RECONSTRUIDO**, en el vocabulario de `.claude/rules/testing.md`. Las
dependencias entran con `vi.fn()`: eso demuestra que la **función** es correcta,
no que esté **enchufada**. Nadie ha comprobado todavía que la Server Action llame
al limitador de verdad contra Postgres.

Sube a **REAL** cuando exista la costura de §3.1 y el test pueda arrancar la app,
pedir el enlace cuatro veces y ver el corte. Anotado como `TODO(recuperar)` punto
(d).

La cuenta atrás (`cuenta-atras.test.ts`) **no** es un test de seguridad y no
lleva nota de mutación: protege la lectura, no una frontera.

Los dos ficheros de test son `.ts` puros, sin JSX: Vitest corre con
`environment: "node"` y **no transforma `.tsx`**.

---

## 5. Verificación por mutación (ejecutada, con los números reales)

Obligatoria para tests de seguridad (`testing.md`). Cada mutación se aplicó a
`flujo.ts`, se **ejecutó**, y se restauró después.

Línea base: **32 passed (32)**, 2 ficheros.

| #     | Mutación                                                          | Resultado real               | Test que se puso en rojo                                                                                                                                     |
| ----- | ----------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | Borrar `await deps.consumirTiempoEquivalente()` del camino vacío  | `1 failed \| 31 passed (32)` | «cuando no hay nada que hacer, se paga el tiempo equivalente» — `expected "vi.fn()" to be called 1 times, but got 0 times`                                   |
| **B** | Comprobar el límite **después** de `emitirEnlace` en vez de antes | `1 failed \| 31 passed (32)` | «si el límite bloquea, el trabajo NO se hace: cero llamadas a emitirEnlace» — `expected "vi.fn()" to not be called at all, but actually been called 1 times` |
| **C** | Devolver «Ese correo no está registrado» en el camino vacío       | `2 failed \| 30 passed (32)` | «responde EXACTAMENTE lo mismo exista o no la cuenta» (`expected { ok: false … } to deeply equal { ok: true … }`) y, de rebote, la de tiempo equivalente     |

Tras restaurar: **32 passed (32)**, y `grep` confirma que no quedó ningún resto
de mutación en el fichero.

Las tres fallan **por el motivo correcto**, no por un fallo colateral: cada una
señala exactamente la aserción que protege esa frontera.

---

## 6. Ficheros de esta carpeta

| Fichero                                 | Qué es                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx`                              | Server Component. La card. Sin estado ni eventos.                                                                                         |
| `formulario.tsx`                        | `"use client"`. Los dos estados, react-hook-form + `zodResolver`.                                                                         |
| `acciones.ts`                           | `"use server"`. Cablea headers, limitador real y `consumirTiempoEquivalente`. Server Action, **no** Route Handler (`security.md` §2 ter). |
| `flujo.ts`                              | Puro. El **orden** parsear → rate limit → trabajar, con dependencias inyectadas. Aquí vive el sobre de respuesta.                         |
| `emision.ts`                            | `server-only`. **La costura**: hoy no envía nada, y explica por qué (§3.1).                                                               |
| `constantes.ts`                         | Puro. Caducidad, cuenta atrás y los textos que `MENSAJES` no tiene.                                                                       |
| `cuenta-atras.ts`                       | Puro. Formateo y corte de la cuenta atrás cosmética.                                                                                      |
| `flujo.test.ts`, `cuenta-atras.test.ts` | 32 tests.                                                                                                                                 |

**No he tocado ni un fichero fuera de esta carpeta.**
