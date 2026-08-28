# BLOQUEO · falta la cadena de `production` para ESCRIBIR

> Escrito el 2026-08-27, reescrito el mismo día al cerrarse el diagnóstico.
> **Solo bloquea el arreglo de la FASE 0.** Todo lo demás sigue en marcha.

## El diagnóstico ya NO necesita la cadena. Está cerrado.

**`production` tiene tu cuenta y no tiene ni un anime.** No es una hipótesis:
sale de tres hechos medidos y de una restricción del esquema.

| Hecho                                                         | Cómo se midió                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| En `production` hay **exactamente un** `users`                | tu consulta 1 en la consola de Neon                             |
| `anime.user_id` tiene `FOREIGN KEY … REFERENCES users(id)`    | `drizzle/0001_esquema_inicial.sql:214`                          |
| → luego **todo** anime de `production` es de esa única cuenta | por la restricción: no cabe un `user_id` que no esté en `users` |
| `/app`, con esa cuenta iniciada, dice «0 de 0»                | lo viste tú en el navegador                                     |
| → **`production` tiene 0 filas en `anime`**                   | se sigue de los tres anteriores                                 |

El `GROUP BY user_id` que faltaba ya no hace falta: con una sola cuenta y la
clave foránea puesta, «cuántos ve esa cuenta» y «cuántos hay» son el mismo
número, y ese número lo enseñó la pantalla.

## Qué pasó, y por qué el seed pareció funcionar

Tu cuenta de `production` se creó **a las 02:48:46 del 25**, y el `created_at`
coincide al segundo con uno de tus `POST /registro`. La creó el registro.

Eso es lo que lo delata: el seed crea al propietario buscándolo por
`SEED_OWNER_EMAIL`. Si el seed hubiera corrido contra `production` **antes** de
ese registro, la cuenta ya habría existido y tu registro habría fallado por el
`UNIQUE` de email. Y si hubiera corrido **después**, habría encontrado tu cuenta
y colgado de ella los 83. Ninguna de las dos pasó. **El seed nunca escribió en
`production`.**

Los 83 que sí existen están en `development`, sembrados el **24 a las 18:50** —
el seed local de la FASE 1, no el del despliegue. Medido directamente:

```
DESTINO: ep-green-recipe-ay3kbq97-pooler…          (development)
users:   72314c6d… castrolorenzosegundo@gmail.com  2026-08-24T18:49:10Z
anime:   72314c6d… n=83   18:50:19 → 18:50:31
portadas: 83, 3,05 MB
```

Y el recuento de «83 animes, 83 portadas» que se dio por bueno como si fuera de
`production` salió **de ahí**. Es la sexta repetición del mismo fallo:
`db:verificar` y las transacciones prefieren `DATABASE_URL_UNPOOLED`, que seguía
valiendo lo de `.env.local` —`development`— porque en línea solo viajó
`DATABASE_URL`. Media operación en cada rama, y el resumen final impecable.

**Eso ya no puede volver a pasar**: `scripts/rama-destino.ts` tiene ahora
`exigirMismaRama()`, que **para antes de escribir nada** si las dos variables
apuntan a ramas distintas. Cableada en `seed`, `migrate` y `verificar-esquema`,
con 7 tests y verificada por mutación.

## Lo único que necesito de ti

Dejar el fichero **`J:\Code\Anime_Organize\neon-prod.txt`** con las dos cadenas
de la rama `production`, **las dos**:

```
POOLED=postgresql://…-pooler.…
DIRECTA=postgresql://…            (la misma sin "-pooler")
```

Lo busqué en `J:\Code\Anime_Organize\`, `J:\Code\`, y en tu carpeta de usuario,
Escritorio, Descargas y Documentos. No está en ninguna. **Lo borro en cuanto
termine**, como la otra vez.

## Qué haré con ella, exactamente

Nada que borre datos. El arreglo es **volver a sembrar `production`**:

1. `exigirMismaRama()` comprueba que las dos cadenas son de la misma rama.
2. Se anuncia el destino y se confirma el host `ep-broad-water-aym5x71z`.
3. `npm run db:migrate` — idempotente.
4. `npm run seed` — idempotente: `crear()` devuelve `null` ante el `UNIQUE`, así
   que correrlo dos veces no duplica nada. Encuentra tu cuenta por
   `SEED_OWNER_EMAIL` y le cuelga los 83 con sus portadas.
5. Se cuenta **agrupando por `user_id`**, no con un `count(*)` suelto — que es
   lo que escondió el problema la primera vez.
6. Se borra `neon-prod.txt`.

No se toca tu contraseña, no se borra tu cuenta, y no se borra ningún anime.

## Mientras tanto, esto sigue

Nada de lo de abajo escribe en `production`. Se construye y se verifica contra
`development`, que tiene los mismos 83 y el mismo esquema.

|                                                        |                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| FASE 1.1 · las primitivas que faltaban                 | **HECHA** — siete nuevas, más las dos que ya estaban                                                                       |
| FASE 1.2 · los conceptos duplicados                    | **HECHA** — de 26 recetas repetidas a 12, y el barrido es ahora `npm run lint:duplicados`, que **falla si el número sube** |
| FASE 1.3 · agregados en JavaScript                     | **HECHA**                                                                                                                  |
| LOTE A · el modal, editar, borrar, progreso y enlaces  | **HECHO**, con sus recorridos en navegador                                                                                 |
| LOTE B1 · el buscador global                           | **HECHO**                                                                                                                  |
| Ajustes · cambiar la contraseña con sesión iniciada    | **HECHO**, ciclo completo verificado: cambiar, entrar con la nueva, y que la vieja falle                                   |
| LOTE B2 · sitios de streaming                          | pendiente                                                                                                                  |
| LOTE C · IA, importar, exportar, espejo en Drive       | pendiente                                                                                                                  |
| LOTE D · borrado de cuenta, estados del sistema, móvil | pendiente                                                                                                                  |

**De tu criterio de «listo», lo único que sigue bloqueado es ver tus 83.** Todo
lo demás —añadir por URL de imagen con la portada guardada en la base, editar el
progreso, guardar un enlace y abrirlo, buscar, filtrar, ordenar, conmutar de
vista, y cambiar la contraseña con sesión iniciada— está construido y recorrido
con un navegador de verdad.

Puedes comprobarlo ya en producción **añadiendo un anime a mano**: el modal
funciona y la portada se guarda. Lo que falta es que tus 83 vuelvan.
