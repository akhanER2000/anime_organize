---
name: testing-strategy
description: Design test strategies and test plans. Trigger with "how should we test", "test strategy for", "write tests for", "test plan", "what tests do we need", or when the user needs help with testing approaches, coverage, or test architecture.
---

# Testing Strategy

Design effective testing strategies balancing coverage, speed, and maintenance.

## Testing Pyramid

```
        /  E2E  \         Few, slow, high confidence
       / Integration \     Some, medium speed
      /    Unit Tests  \   Many, fast, focused
```

## Strategy by Component Type

- **API endpoints**: Unit tests for business logic, integration tests for HTTP layer, contract tests for consumers
- **Data pipelines**: Input validation, transformation correctness, idempotency tests
- **Frontend**: Component tests, interaction tests, visual regression, accessibility
- **Infrastructure**: Smoke tests, chaos engineering, load tests

## What to Cover

Focus on: business-critical paths, error handling, edge cases, security boundaries, data integrity.

Skip: trivial getters/setters, framework code, one-off scripts.

## Output

Produce a test plan with: what to test, test type for each area, coverage targets, and example test cases. Identify gaps in existing coverage.

---

## Adaptaciones para Anime Vault

La estrategia de este proyecto ya está escrita y cerrada en **`.claude/rules/testing.md`**:
qué se testea, qué **no** se testea, umbrales por carpeta (95 % en `domain/`, 85 % en
`covers`/`enrich`/`import-export`, 70 % global) y el guion exacto del e2e crítico.

Usa esta skill para razonar sobre casos límite y cobertura de un módulo nuevo, no para
rediseñar la estrategia.

Lo que **no** se testea aquí, y es deliberado: que Tailwind aplique una clase, que Next
renderice un `<div>`, y cualquier test cuyo único aserto sea «se llamó al mock». Un test que
no puede fallar por un bug real es deuda, no cobertura.
