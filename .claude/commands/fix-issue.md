---
description: Reproducir, corregir y testear un bug siguiendo depuración sistemática
argument-hint: "<descripción del bug o número de issue>"
allowed-tools: Bash(npm *), Bash(npx *), Bash(git *), Read, Edit, Write, Grep, Glob
---

# /project:fix-issue — reproducir, corregir, testear

Bug: **$ARGUMENTS**

Sigue este orden. **No escribas el arreglo antes del paso 3.** Un arreglo sin
reproducción es una conjetura con confianza.

## 1. Entender el síntoma

Reformula el bug en una frase: qué esperaba el usuario, qué pasó, dónde.
Si falta información para reproducirlo (datos, usuario, pantalla, pasos), **pregunta**
en vez de suponer.

## 2. Reproducir — el paso que no se salta

Consigue un fallo determinista antes de tocar nada:

- ¿Es lógica de dominio? → un test de Vitest que falle.
- ¿Es de UI o de flujo? → un spec de Playwright, o `npm run dev` y los pasos exactos.
- ¿Es de datos? → la query mínima contra una base de desarrollo.

Pega la salida real del fallo. Si no consigues reproducirlo, dilo y para: investigar a
ciegas cuesta más que pedir un dato.

## 3. Localizar la causa raíz

- Lee el código de la ruta implicada **entera**, no solo la línea del stack.
- Formula 2–3 hipótesis y descarta cada una con una comprobación concreta
  (un `console.log` temporal, un test, una query). Anota qué descartaste y por qué.
- Distingue **causa** de **síntoma**. Si el `undefined` viene de tres capas más arriba,
  el arreglo va arriba, no un `?? []` donde explotó.
- Pregunta obligatoria: **¿esto mismo puede estar pasando en otro sitio?** Grep del patrón.

## 4. Escribir el test que falla

Convierte la reproducción en un test permanente **antes** del arreglo. Ejecuta y
comprueba que falla por el motivo correcto (rojo por la razón buena, no por un typo).

## 5. Arreglar

- El cambio mínimo que ataca la causa raíz. Nada de refactor oportunista en el mismo commit.
- Respeta `@.claude/rules/code-style.md`. Sin `any`, sin `!`, sin `catch {}`.
- Si el arreglo toca seguridad o `user_id`, relee `@.claude/rules/security.md`.

## 6. Verificar

```
!npm run typecheck && npm run lint && npm run test
```

Lee la salida. El test nuevo en verde y **ningún otro en rojo**.
Si el bug era de UI, compruébalo también en el navegador.

## 7. Cerrar

Resume en cuatro líneas:

- **Síntoma:** …
- **Causa raíz:** …
- **Arreglo:** archivo y qué cambió.
- **Cobertura:** el test que ahora lo impide, y si el patrón aparecía en otro sitio.
