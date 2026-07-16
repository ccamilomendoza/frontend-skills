---
name: hexagonal-frontend-strict
description: Opinionated functional-first hexagonal (ports & adapters) architecture for frontend apps where feature modules never import one another — every cross-module need is inverted through a port defined in modules/shared. Use when scaffolding or structuring a frontend codebase into bounded-context modules with domain/application/infrastructure layers, when deciding where entities, ports, use cases, adapters, or validation live, or when the user asks for a hexagonal/clean/DDD-style functional frontend with fully isolated feature modules.
---

# Hexagonal Frontend — Strict

A functional-first, hexagonal architecture for frontend apps, split into
bounded-context **modules**, each with three layers. The defining rule here:
feature modules are fully isolated and never import one another; any cross-module
need is inverted through a port in `modules/shared`.

Framework-specific UI code is intentionally out of scope — this skill only
specifies that it lives behind the `infrastructure/ui/` seam.

## Core principles

1. **Functional-first.** Prefer pure functions. No classes, no `this`, no
   mutation, no closures-as-objects. Entities are immutable data; behavior is
   free functions.
2. **Three layers per module:** `domain/` (pure core), `application/` (use
   cases), `infrastructure/` (I/O, framework, adapters). Dependencies point
   INWARD: infra → application → domain. Domain depends on nothing external.
3. **Modules = bounded contexts** (`user`, `payments`, `catalog`…). Coarse, few.
4. **STRICT isolation:** a module imports only **itself** and **`modules/shared`**.
   Never `modules/X → modules/Y`. Cross-module needs are inverted through a port
   defined in `shared` (see [REFERENCE.md](REFERENCE.md) §Module interaction).
5. **Errors as values.** No exceptions across boundaries: boundaries return a
   hand-rolled `Result<T, E>`. `E` is a per-operation tagged union.
6. **Framework-agnostic core.** All framework code lives in `infrastructure/ui/`;
   this skill never prescribes how `ui/` is built.

## Folder structure

```
src/modules/
  <module>/                      # a bounded context, e.g. user, payments
    domain/
      entities/                  # interfaces, readonly fields; behavior = pure fns
      services/                  # unified pure domain logic (single + multi entity)
      ports/                     # interfaces the core needs from outside (I/O)
      constants/
    application/
      use-cases/                 # make…(deps) => (input) => Result / Promise<Result>
    infrastructure/
      ui/                        # ALL framework code (framework-specific)
      server/
        adapters/                # fat: I/O + parse + map -> Result
        dtos/                    # raw wire shapes
        mappers/                 # pure DTO -> entity
        schemas/                 # Zod schemas validating DTOs (wire shape)
  shared/                        # a LEAF kernel (no use cases); imported by all
    domain/
      results/                   # the Result type + helpers
      errors/                    # shared NetworkError / ParseError primitives
      ports/                     # cross-module port interfaces (strict inversion)
      entities/  services/       # shared domain (incl. multi-entity pure logic),
                                 #   by the "rule of two"
    infrastructure/
      ui/                        # the design system: Button, Input, Dialog…
                                 #   generic primitives are born here directly
```

**Naming rule:** every file lives in a folder named after its concept, and
folder names are ALWAYS plural (`entities/`, `ports/`, `results/`, `errors/`…).
No loose files at a layer root. This is mechanically lint-enforceable.

## Quick start (add a feature)

1. Model the **entity** as a `readonly` `interface` in `domain/entities/`.
2. Add a **smart-constructor** `make<Entity>(...): Result<Entity, DomainError>`
   in the domain for business invariants (pure). Use cases invoke it on writes;
   adapters invoke it at the read boundary (see REFERENCE.md).
3. Declare a **port** interface in `domain/ports/` for any I/O you need, phrased
   purely in domain terms (entities, `Result`, domain errors — never DTOs/Zod).
4. Write a **use case** in `application/use-cases/` as a curried factory:
   `make…(deps) => (input: XInput) => Promise<Result<T, E>>`.
5. Implement the port as a **fat adapter** in `infrastructure/server/adapters/`:
   I/O → Zod-parse to DTO → pure mapper → invoke domain smart-constructor →
   `Result`.
6. Wire it in the UI layer: composition (building use cases from adapters)
   happens inside `infrastructure/ui/`.
7. Need shared pure logic or a UI primitive? Reach into `shared` —
   `shared/domain/services/` for multi-entity/shared logic,
   `shared/infrastructure/ui/` for the design system — never into a sibling.

## Hard rules (enforce with ESLint)

- No `modules/X → modules/Y` imports. A module imports only itself + `shared`.
- Nothing outside a FEATURE module imports its internals; the public surface is
  `application/use-cases/` and shared-port `adapters/` only.
- `shared` is the exception: any module may import `shared/**` at any layer.
  Shared pure domain logic lives in `shared/domain/services/`; reusable
  presentation primitives live in `shared/infrastructure/ui/`.
- Domain imports nothing framework- or IO-specific (no Zod, no fetch, no UI
  framework).
- No barrels/`index.ts` façades; rely on the folder convention + lint.

## Read next

- [REFERENCE.md](REFERENCE.md) — full conventions: layers, the fat-adapter
  pipeline, `Result`/error model, use-case shape, module interaction, `shared`
  governance, and the lint config sketch.
- [EXAMPLES.md](EXAMPLES.md) — a worked `payments` module + a cross-module
  (`checkout` needs `user`) example in TypeScript.
