---
name: hexagonal-frontend-permissive-system
description: Design, scaffold, review, or restructure TypeScript frontends using functional-first hexagonal architecture with bounded-context modules, domain/application/infrastructure layers, explicit ports and adapters, Result-based errors, validated external data, and permissive direct imports of sibling modules' public use cases constrained to an acyclic dependency graph. Use for clean-architecture or DDD-style frontend work, layer and folder placement decisions, cross-module dependencies, use-case and adapter design, or enforcement of architectural import boundaries.
---

# Hexagonal Frontend — Permissive

Apply a functional-first hexagonal architecture to TypeScript frontends. Organize
the application as coarse bounded-context modules and keep dependencies pointing
inward. Permit feature-to-feature reuse only through application use cases and
keep the feature graph acyclic.

This skill defines the framework-independent architecture. For React-specific
code inside `infrastructure/ui/`, apply `react-hexagonal-ui-system` as well.

## Workflow

1. Identify bounded contexts and assign each capability to one owning module.
2. Declare immutable domain data in `domain/entities/` and implement pure
   invariant-preserving functions in `domain/services/`.
3. Declare narrow domain ports for capabilities requiring I/O.
4. Implement application use cases that coordinate domain behavior and ports.
5. Implement external-boundary adapters under `infrastructure/server/`.
6. Compose adapters and use cases from `infrastructure/ui/` or a neutral app
   composition root.
7. Add cross-module edges only through the provider module's public use cases.
8. Verify entity files contain declarations only, layer direction, module
   acyclicity, and `shared` governance.

## Canonical Structure

```text
src/modules/
  <feature>/
    domain/
      entities/                 # readonly interface declarations only
      services/                 # pure domain behavior and smart constructors
      ports/
      constants/
    application/
      use-cases/                 # public behavioral surface
    infrastructure/
      server/
        adapters/
        dtos/
        mappers/
        schemas/
      ui/                        # framework-specific code and module composition
  shared/
    domain/
      entities/
      services/
      ports/
      results/
      errors/
    infrastructure/
      server/                    # generic technical primitives only
      ui/                        # design-system primitives
  app/
    infrastructure/
      ui/                        # neutral cross-module composition when needed
```

Use plural concept folders and singular filenames. Do not place loose files at
layer roots. Treat the names `server/` and `ui/` as architectural seams, not
deployment processes: `server/` owns external data mechanisms; `ui/` owns the
selected frontend framework and composition.

## Dependency Rules

Apply these directions:

```text
feature infrastructure -> feature application -> feature domain -> shared domain
feature infrastructure ------------------------> feature domain
any layer --------------------------------------> compatible shared layer
feature A application --------------------------> feature B application/use-cases
```

Enforce these constraints:

- Keep domain free of UI frameworks, Zod, HTTP clients, storage APIs, DTOs, and
  application or infrastructure imports.
- Keep application free of framework and wire-format details.
- Keep `server/` from importing `ui/`.
- Forbid feature A from importing feature B's `domain/**` or
  `infrastructure/**`.
- Allow feature A to import feature B's `application/use-cases/**` directly,
  then inject the bound callable where it is consumed.
- Keep the feature graph a DAG. Resolve a cycle by changing ownership,
  extracting eligible pure logic, or inverting one direction through a narrow
  shared port.
- Do not use barrels to conceal invalid imports.

When module A needs module B's adapters to build B's use case, compose them in a
neutral `app/infrastructure/ui/` root. Do not make A's private infrastructure
reach into B's private infrastructure.

## Core Modeling Rules

- Keep `domain/entities/` declaration-only: use readonly interfaces for
  entities and value-like domain concepts, with type-only imports. Do not
  define runtime values or functions there.
- Put pure domain behavior, including predicates and smart constructors,
  under `domain/services/`. Do not use classes or mutable
  closures-as-objects.
- Put pure invariant checks in domain smart constructors such as
  `makeOrder(args): Result<Order, OrderDomainError>`.
- Prefer destructuring object parameters and returned objects when their fields
  are used individually. Keep an object intact when passing or validating it as
  a whole; do not destructure only to reconstruct the same object.
- Model ports as callable `...Port` types with one `...PortRequest` object and a
  narrow `...PortError` union.
- Use hand-rolled `Result<T, E>` values across expected boundaries. Reserve
  thrown exceptions for unexpected defects.
- Give each operation the smallest honest tagged error union it can produce.
- Keep async operations async and synchronous operations synchronous.

## Use Cases

Use an existing domain or port contract directly when it expresses a use-case
parameter or result exactly. Declare a `...Args` interface only when the use
case needs its own fields. Do not create a type alias solely to rename an
unchanged input or error type.

Use a curried factory when dependencies must be bound:

```ts
export type ProcessPaymentUseCase = (
  dependencies: ProcessPaymentDependencies,
) => (
  args: ProcessPaymentArgs,
) => Promise<Result<Receipt, ProcessPaymentError>>;
```

Export a direct function when the use case only coordinates pure imported
domain functions and has no injected dependencies. Do not invent an empty
dependency object.

For a query, prefer an ordinary callable that receives its request. Bind it to a
no-argument query function in the UI adapter when a request library requires
that shape. Do not make the application API depend on a particular query
library's callback convention.

## External Data Adapters

Treat every external payload as `unknown`. At a read boundary, execute:

```text
unknown
  -> Zod schema parses a DTO
  -> total mapper converts DTO to smart-constructor args
  -> domain smart constructor enforces invariants
  -> Result<DomainValue, PortError>
```

Keep DTOs, Zod schemas, transport clients, and wire names in infrastructure.
Let adapters invoke domain constructors; never duplicate domain invariant logic
inside adapters. Let use cases trust the domain-valid value promised by a port.

## Shared Governance

Treat `shared` as a leaf kernel, not a feature:

- Put `Result`, stable error primitives, eligible pure domain logic, generic
  technical primitives, and design-system UI primitives there.
- Keep use cases and feature adapters out of `shared`.
- Move eligible code to `shared` only when a genuine second consumer appears.
- Allow design-system primitives to originate in
  `shared/infrastructure/ui/`.
- Prefer duplication when bounded contexts model superficially similar concepts
  differently.

## Read References Selectively

- Read [architecture.md](references/architecture.md) for detailed layer,
  naming, error, module-interaction, and lint rules.
- Read [use-cases-and-adapters.md](references/use-cases-and-adapters.md) when
  designing ports, application APIs, smart constructors, or external-data
  pipelines.
- Read [examples.md](references/examples.md) for an end-to-end feature,
  cross-module composition, and both `shared` channels.
