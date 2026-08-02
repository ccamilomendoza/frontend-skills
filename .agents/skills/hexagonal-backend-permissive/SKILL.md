---
name: hexagonal-backend-permissive
description: Opinionated functional-first hexagonal architecture for TypeScript backends with bounded-context modules, Zod-validated inbound and outbound boundaries, module-owned framework composition, and permissive acyclic cross-module use-case imports. Use when scaffolding or restructuring a backend into domain/application/infrastructure layers; designing ports, adapters, handlers, presenters, persistence, transactions, or message consumers; or applying clean/hexagonal/DDD-style boundaries while allowing direct feature reuse.
---

# Hexagonal Backend — Permissive

Structure TypeScript backends as coarse bounded-context modules with pure
domain logic, functional application use cases, and mechanism-first
infrastructure. A feature may import another feature's public
`application/use-cases/` surface directly as long as the module graph remains
acyclic.

## Core principles

1. **Functional-first.** Prefer pure functions, immutable data, readonly
   interfaces, explicit arguments, and functional dependency injection. Do not
   use classes, `this`, mutation, or closures as domain objects.
2. **Three layers per feature.** Dependencies point inward:
   `infrastructure → application → domain`. Domain imports no framework, I/O,
   Zod, application, or infrastructure code.
3. **Modules are bounded contexts.** Keep them coarse and few. A feature's
   `domain/**` and `infrastructure/**` are private.
4. **Permissive cross-module behavior.** A feature may import another feature's
   `application/use-cases/**` directly. Keep the module dependency graph a DAG.
5. **Errors are values.** Expected failures use a hand-rolled
   `Result<T, E>` with narrow per-operation tagged error unions.
6. **Parse every boundary.** Use Zod for all untrusted inbound values and all
   data returned by databases, caches, brokers, storage, and external APIs.
7. **Keep protocol policy at the edge.** Inbound handlers parse, map, call use
   cases, present results, validate public outputs, and emit through the
   framework. Core code knows no status codes, acknowledgments, headers, or
   framework request objects.
8. **Own composition locally.** Each feature wires itself in
   `infrastructure/compositions/`; a minimal `src/main/` only creates shared
   runtime resources, connects modules, and owns process lifecycle.

## Folder structure

Create only folders containing real code.

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
        use-cases/                 # PUBLIC feature surface
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
    entries/                        # API, worker, CLI process entry points
```

Organize inbound infrastructure by invocation mechanism; its subtree may use
one concrete framework/provider directly. Add another provider scope only when
multiple implementations coexist. Organize outbound infrastructure by
capability and then provider. In both directions, group artifact types last.
Never share DTOs or schemas merely because two protocols currently have the
same shape.

Every file belongs to a named concept folder; concept folder names are plural.
Do not place loose files at a layer root and do not create barrel `index.ts`
facades.

## Naming conventions

- **Entities:** plain nouns with no `Entity` suffix; singular filenames;
  readonly object `interface`s with no methods.
- **Domain services:** cohesive pure behavior groups with no `Service` suffix.
- **Smart constructors:** `make<Entity>` and `Make<Entity>Args`; return
  `Result<Entity, DomainError>`.
- **Ports:** narrow callable types ending in `Port`; accept one
  `<Operation>PortRequest` object and return a narrow `<Operation>PortError`
  union. Do not create generic CRUD repositories.
- **Use cases:** keep the `UseCase` suffix. Use `Dependencies` and `Args`;
  factories are `make...UseCase(dependencies) => (args) => Result`.
  Zero-dependency use cases are direct functions.
- **Adapters:** end in `Adapter`; use `make...Adapter` only when binding real
  infrastructure dependencies.
- **Protocol DTOs:** include mechanism and direction:
  `CreateOrderHttpRequestDto`, `OrderHttpResponseDto`,
  `OrderCreatedMessageDto`.
- **Persistence records:** use `Record`, never `Dto`: `OrderRecord`,
  `orderRecordSchema`.
- **Schemas:** camelCase `<TypeName>Schema` Zod values.
- **Mappers:** pure total `transform<Source>To<Target>` functions.
- **Presenters:** `present<Operation><Mechanism>Result`; exhaustively translate
  `Result` into a mechanism outcome and validate emitted DTOs.
- **Shared primitives:** use plain names (`Result`, `Clock`, `Logger`), never
  `Shared` or `Common` prefixes.

## Boundary pipelines

### Inbound

```text
unknown external input
  → Zod request/message schema
  → protocol DTO
  → pure mapper
  → primitive application Args
  → use case
  → Result
  → presenter + output mapper
  → Zod output schema
  → framework emission
```

Map new or changed request values into primitive `Args`; let the use case invoke
domain smart constructors. Already-established context such as a verified
`Actor` may enter as a domain value.

### Outbound read

```text
database/API/cache/broker result as unknown
  → Zod Record/Dto schema
  → pure mapper
  → Make<Entity>Args
  → domain smart constructor
  → Result<Entity, PortError>
```

Adapters catch and translate expected library failures. Rethrow unexpected
programming defects to one framework-level safety boundary.

## Quick workflow

1. Model immutable entities and pure invariants in `domain/`.
2. Define narrow outbound capability ports in domain terms.
3. Implement application orchestration as a use case; pass every
   business-relevant value explicitly in `Args`.
4. Implement outbound adapters under their mechanism/provider; parse every
   returned value before hydrating domain data.
5. Implement inbound DTOs, Zod schemas, mappers, presenters, handlers, and
   registration code under the relevant mechanism.
6. Wire the feature inside `infrastructure/compositions/`.
7. Register the composed feature from a thin `src/main/` entry point.
8. Import another feature's public use-case type/factory when needed; inject its
   bound runtime function through composition and preserve the module DAG.

## Hard rules

- Feature-to-feature imports target only
  `modules/<owner>/application/use-cases/**`.
- A direct cross-feature import means importing the public use-case
  contract/factory. It never permits constructing sibling infrastructure;
  composition supplies the already-bound runtime function.
- `shared/**` is universally importable but remains a leaf: no use cases,
  orchestration, feature handlers, or feature adapters.
- Inbound handlers call use cases directly; do not duplicate them with inbound
  port/controller interfaces.
- Middleware handles technical cross-cutting concerns only. Authorization and
  domain invariants belong in use cases/domain.
- Never pass framework requests, ORM clients, raw transactions, `AbortSignal`,
  or generic `RequestContext` bags into use cases.
- Validate every public success and error DTO with Zod in every environment.
  Output-schema mismatch is a defect, not a domain error.
- Use cases decide atomic scope. Infrastructure transaction runners provide
  transaction-bound port bundles, commit only on `ok`, and roll back on `err`
  or throw.
- Keep `RunInTransactionPort` in the owning module's `domain/ports/`; promote
  the generic zero-dependency type to `shared/domain/ports/` only after a real
  second consumer appears.
- Required `Fetch...Port` absence is a tagged `NotFound`; optional
  `Find...Port` absence is successful `null`; empty searches return `[]`.
- Apply optimistic concurrency to mutable read-modify-write aggregates when
  lost updates are possible.
- Message presenters map use-case results to abstract
  `Acknowledge | Retry | Reject`; consumers alone call broker APIs.

## Read next

- Read [REFERENCE.md](REFERENCE.md) for full layer rules, security, composition,
  persistence, transaction, concurrency, message, shared-kernel, and lint
  guidance.
- Read [EXAMPLES.md](EXAMPLES.md) before implementing a new feature or
  cross-module interaction.
- For reliable asynchronous side effects, read the optional domain-event and
  transactional-outbox section in [REFERENCE.md](REFERENCE.md).
