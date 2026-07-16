---
name: hexagonal-frontend-permissive
description: Opinionated functional-first hexagonal (ports & adapters) architecture for frontend apps where cross-module imports are allowed — a feature module may import another feature module's use-cases directly (their public surface; internals stay private), kept to an acyclic module dependency graph. Use when scaffolding or structuring a frontend codebase into bounded-context modules with domain/application/infrastructure layers, when deciding where entities, ports, use cases, adapters, or validation live, or when the user wants a hexagonal/clean/DDD-style functional frontend that allows direct module reuse.
---

# Hexagonal Frontend — Permissive

A functional-first, hexagonal architecture for frontend apps, split into
bounded-context **modules**, each with three layers. The defining rule here: a
module may import another module's **public surface** (its
`application/use-cases/`) directly, as long as the dependency graph stays
acyclic.

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
4. **PERMISSIVE interaction:** between two FEATURE modules the only direct
   surface is the owner's `application/use-cases/`; their `domain/**` and
   `infrastructure/**` stay private. Imports must form a **DAG** — no cycles (see
   [REFERENCE.md](REFERENCE.md) §Module interaction). `shared` is the EXCEPTION:
   any module may import `shared` at any layer. So shared pure domain logic and
   shared UI primitives travel through `shared`, not through a sibling.
5. **Errors as values.** No exceptions across boundaries: boundaries return a
   hand-rolled `Result<T, E>`. `E` is a per-operation tagged union.
6. **Framework-agnostic core.** All framework code lives in `infrastructure/ui/`;
   this skill never prescribes how `ui/` is built.

## Folder structure

```
src/modules/
  <module>/                      # a bounded context, e.g. user, payments
    domain/
      entities/                  # readonly interfaces; behavior = pure fns
      services/                  # pure behavior groups; no Service suffix
      ports/                     # callable Port types the core needs from outside
      constants/
    application/
      use-cases/                 # PUBLIC surface; importable by other modules
    infrastructure/
      ui/                        # ALL framework code (framework-specific)
      server/
        adapters/                # fat: I/O + parse + map -> Result
        dtos/                    # raw wire shapes with Dto suffix
        mappers/                 # transform<Source>To<Target>
        schemas/                 # camelCase DtoSchema values
  shared/                        # a LEAF kernel (no use cases); imported by all
    domain/
      results/                   # the Result type + helpers
      errors/                    # shared NetworkError / ParseError primitives
      entities/  services/       # shared domain (incl. multi-entity pure logic),
                                 #   by the "rule of two"
    infrastructure/
      ui/                        # the design system: Button, Input, Dialog…
                                 #   generic primitives are born here directly
```

**Naming rule:** every file lives in a folder named after its concept, and
folder names are ALWAYS plural (`entities/`, `ports/`, `results/`, `errors/`…).
No loose files at a layer root. This is mechanically lint-enforceable.

## Naming conventions

- **Entities:** plain domain nouns, no `Entity` suffix. Files are singular
  (`entities/user.ts`). All entities, including value-like concepts (`Email`,
  `Money`, `UserId`), are readonly object `interface`s with no methods.
- **Domain services:** no `Service` suffix. Files are cohesive behavior groups
  (`services/cart-total.ts`), exports are behavior names (`calculateCartTotal`).
- **Smart constructors:** use `make<Entity>` and `Make<Entity>Args` when an
  object parameter is needed.
- **Ports:** callable function types ending in `Port`; every port receives one
  `PortRequest` object and declares a `PortError` union.
- **Use cases:** exported type/factory names keep `UseCase`; supporting types are
  `Dependencies` and `Args`. Query use cases use `Fetch...UseCase`, bind `args`
  inside `Dependencies`, and return a no-arg thunk. Mutation use cases receive
  `args` at execution time. Zero-dependency use cases are direct functions.
- **Adapters:** port implementations end in `Adapter`. Use `make...Adapter` only
  when real infrastructure dependencies are bound; otherwise export the adapter
  function directly.
- **DTOs/schemas/mappers:** raw wire shapes use `Dto`; schemas are camelCase
  `...DtoSchema` values; mapper functions use
  `transform<Source>To<Target>`.
- **Shared names:** shared UI primitives and shared technical primitives use
  plain names (`Button`, `Input`, `Result`, `NetworkError`), without `Shared` or
  `Common` prefixes.

## Quick start (add a feature)

1. Model the **entity** as a `readonly` `interface` in `domain/entities/`.
2. Add a **smart-constructor** `make<Entity>(...): Result<Entity, DomainError>`
   in the domain for business invariants (pure). Use cases invoke it on writes;
   adapters invoke it at the read boundary (see REFERENCE.md).
3. Declare a callable **port** type in `domain/ports/` for any I/O you need,
   phrased purely in domain terms (entities, `Result`, domain errors — never
   DTOs/Zod).
4. Write a **use case** in `application/use-cases/`. If it has injected
   dependencies, use a curried factory:
   `make…UseCase(dependencies) => (args) => Result<T, E>`. If it only
   coordinates imported pure domain services/functions, export it as a direct
   function: `someUseCase(args) => Result<T, E>`.
5. Implement the port as a **fat adapter** in `infrastructure/server/adapters/`:
   I/O → Zod-parse to DTO → pure mapper → invoke domain smart-constructor →
   `Result`.
6. Need another feature's behavior? Import its `use-cases/` directly and inject it
   as a dep — keep the graph acyclic.
7. Need shared pure logic or a UI primitive? Reach into `shared` —
   `shared/domain/services/` for multi-entity/shared logic,
   `shared/infrastructure/ui/` for the design system — never into a sibling.

## Hard rules (enforce with ESLint)

- Between two FEATURE modules, imports are allowed ONLY from the owner's
  `application/use-cases/`. Importing a sibling's `domain/**` or
  `infrastructure/**` is forbidden.
- `shared` is exempt: any module may import `shared/**` at any layer. Shared pure
  domain logic lives in `shared/domain/services/`; reusable presentation
  primitives live in `shared/infrastructure/ui/`.
- The module dependency graph MUST be acyclic (enforce with a cycle check).
- Domain imports nothing framework- or IO-specific (no Zod, no fetch, no UI
  framework).
- No barrels/`index.ts` façades; rely on the folder convention + lint.

## Read next

- [REFERENCE.md](REFERENCE.md) — full conventions: layers, the fat-adapter
  pipeline, `Result`/error model, use-case shape, module interaction (DAG),
  `shared` governance, and the lint config sketch.
- [EXAMPLES.md](EXAMPLES.md) — a worked `payments` module + a cross-module
  (`checkout` imports `user`) example in TypeScript.
