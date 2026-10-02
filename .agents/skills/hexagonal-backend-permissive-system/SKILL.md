---
name: hexagonal-backend-permissive-system
description: Design, scaffold, review, or restructure TypeScript backends using functional-first hexagonal architecture with bounded-context modules, Zod-validated boundaries, Result-based errors, module-owned composition, and permissive direct imports of sibling modules' public use cases constrained to an acyclic dependency graph. Use for clean-architecture or DDD-style backend work, layer and folder placement, ports, adapters, handlers, presenters, persistence, transactions, message consumers, or architectural boundary enforcement.
---

# Hexagonal Backend — Permissive

Apply functional-first hexagonal architecture to TypeScript backends. Organize
the application as coarse bounded-context modules, keep dependencies pointing
inward, and place protocol and provider policy at infrastructure boundaries.
Permit feature-to-feature reuse only through application use cases and keep the
feature graph acyclic.

## Workflow

1. Identify bounded contexts and assign each capability to one owning module.
2. Model immutable domain values and pure invariant-preserving functions.
3. Declare narrow domain ports for required I/O capabilities.
4. Implement application use cases that coordinate domain behavior and ports.
5. Implement outbound adapters that parse every value returned by external
   systems before hydrating domain values.
6. Implement inbound handlers as parse, map, call, present, validate, and emit
   pipelines.
7. Compose each feature inside its own `infrastructure/compositions/` folder.
8. Connect feature compositions from a thin `src/main/` process root.
9. Verify layer direction, public module edges, acyclicity, boundary parsing,
   and `shared` governance.

## Canonical Structure

Create only folders that contain real code.

```text
src/
  modules/
    <module>/
      domain/
        entities/
        services/
        ports/
        constants/
      application/
        use-cases/                 # public behavioral surface
      infrastructure/
        compositions/              # module-owned wiring
        inbound/
          http/
            routes/ handlers/ middlewares/
            dtos/ schemas/ mappers/ presenters/
          messaging/
            consumers/ handlers/
            dtos/ schemas/ mappers/ presenters/
          jobs/
            schedules/ handlers/
          websockets/
            events/ handlers/
          cli/
            commands/ handlers/
        outbound/
          persistence/
            <provider>/
              adapters/ records/ schemas/ mappers/
          integrations/
            <provider>/
              adapters/ dtos/ schemas/ mappers/
          messaging/
            <provider>/
              adapters/ dtos/ schemas/ mappers/
    shared/                         # leaf kernel; no use cases
      domain/
        entities/ services/ ports/ results/ errors/
      infrastructure/
        clients/ configurations/ loggers/
  main/
    entries/                        # API, worker, and CLI process roots
```

Use plural concept folders and singular filenames. Do not put loose files at a
layer root or create barrel `index.ts` facades. Group inbound infrastructure by
invocation mechanism. Group outbound infrastructure by capability and then
provider. Add a provider scope to inbound code only when multiple concrete
implementations coexist.

## Dependency Rules

Apply these directions:

```text
feature infrastructure -> feature application -> feature domain -> shared domain
feature infrastructure ------------------------> feature domain
feature A application --------------------------> feature B application/use-cases
main -------------------------------------------> feature compositions
```

Enforce these constraints:

- Keep domain free of frameworks, I/O, Zod, DTOs, application, and
  infrastructure imports.
- Keep application free of protocol status, framework request objects, ORM
  clients, wire formats, and concrete adapters.
- Forbid feature A from importing feature B's `domain/**` or
  `infrastructure/**`.
- Allow feature A to import feature B's `application/use-cases/**` contract or
  factory, then inject the already-bound callable at composition time.
- Keep the feature graph a DAG. Resolve a cycle by changing ownership,
  extracting eligible pure logic, or inverting one direction through a narrow
  shared port.
- Let a feature composition import both sides of its own module, but never a
  sibling module's private infrastructure.
- Keep `shared/**` a dependency sink with no runtime import of a feature.
- Do not use barrels or aliases to conceal invalid imports.

## Core Modeling Rules

- Use readonly interfaces for entities and value-like domain concepts.
- Keep behavior in pure functions; do not use classes, `this`, mutation, or
  mutable closures-as-domain-objects.
- Put invariant checks in smart constructors such as
  `makeOrder(args): Result<Order, OrderDomainError>`.
- Model ports as narrow callable `...Port` types accepting one
  `...PortRequest` object and returning a narrow `...PortError` union.
- Use a hand-rolled `Result<T, E>` for expected failures. Reserve exceptions
  for unexpected defects and unrecognized library failures.
- Bind stable dependencies in `make...UseCase(dependencies)` and receive
  execution values through one `...Args` object. Export a direct function for
  a zero-dependency use case.
- Pass every business-relevant value explicitly. Do not pass framework
  requests, raw transactions, ORM clients, `AbortSignal`, dependency
  containers, or generic `RequestContext` bags into use cases.

## Boundary Rules

Treat all inbound values and every value returned by a database, cache, broker,
storage provider, or external API as `unknown` until Zod parses it.

```text
inbound unknown
  -> Zod protocol schema
  -> protocol DTO
  -> pure mapper
  -> application Args
  -> use case
  -> Result
  -> presenter and output mapper
  -> Zod public-output schema
  -> framework emission

outbound unknown
  -> Zod Record or Dto schema
  -> pure mapper
  -> Make<Entity>Args
  -> domain smart constructor
  -> Result<DomainValue, PortError>
```

Use cases construct new or changed domain values from primitive `Args`.
Outbound read adapters hydrate existing values through the same smart
constructors. Never duplicate invariants in schemas, mappers, or adapters.

Inbound handlers call use cases directly; do not add controller or inbound-port
interfaces that duplicate the use-case callable. Presenters exhaustively map
the complete `Result` into a mechanism outcome and validate every public
success and error DTO in every environment. An invalid presenter output is a
defect, not a domain error.

## Composition and Runtime Concerns

Each feature owns its wiring under `infrastructure/compositions/`. A minimal
`src/main/entries/` root creates shared runtime clients, calls module
composition or registration functions, passes bound public use cases between
modules, and owns process startup and shutdown. Keep business rules, DTOs,
schemas, mappers, presenters, and adapters out of `main`.

Use cases decide transaction scope. Infrastructure runners supply
transaction-bound port bundles, commit only on `Result.ok`, and roll back on
`Result.err` or throw. Apply optimistic concurrency when mutable
read-modify-write aggregates can lose updates.

Message presenters return broker-neutral `Acknowledge | Retry | Reject`
outcomes. Consumers alone call broker APIs. Use a transactional outbox only
when persistence and asynchronous publication intent must be reliable and
atomic.

## Shared Governance

Treat `shared` as a stable leaf kernel:

- Put `Result`, stable technical error primitives, genuinely shared immutable
  values and pure logic, narrow generic ports, and generic technical
  foundations there.
- Keep use cases, feature adapters, handlers, presenters, DTOs, message
  contracts, and cross-feature orchestration out.
- Promote eligible code only after a genuine second consumer appears.
- Prefer duplication when bounded contexts give similar-looking concepts
  different meanings.

## Read References Selectively

- Read [architecture.md](references/architecture.md) when deciding module
  ownership, folder placement, dependency direction, authentication boundaries,
  composition, naming, shared governance, or lint rules.
- Read [use-cases-and-boundaries.md](references/use-cases-and-boundaries.md)
  when designing entities, smart constructors, ports, use cases, handlers,
  presenters, DTOs, schemas, mappers, or persistence and integration adapters.
- Read
  [transactions-messaging-and-events.md](references/transactions-messaging-and-events.md)
  for transaction runners, optimistic concurrency, message acknowledgment,
  domain events, idempotency, or transactional outbox work.
- Read [examples.md](references/examples.md) before implementing an end-to-end
  feature, a cross-module interaction, a multi-write transaction, or a message
  consumer.
