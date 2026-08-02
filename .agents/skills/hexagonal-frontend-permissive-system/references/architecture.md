# Architecture Reference

Use this reference when deciding ownership, layer placement, imports, naming, or
lint boundaries.

## Contents

1. [Bounded contexts](#bounded-contexts)
2. [Domain layer](#domain-layer)
3. [Application layer](#application-layer)
4. [Infrastructure layer](#infrastructure-layer)
5. [Module interaction](#module-interaction)
6. [Shared governance](#shared-governance)
7. [Naming conventions](#naming-conventions)
8. [Lint boundaries](#lint-boundaries)

## Bounded Contexts

Create a small number of coarse feature modules such as `users`, `payments`, or
`catalog`. Assign every business capability to one owner. A module owns its
domain language, application operations, adapters, and feature UI.

Treat a concept used by another module as an ownership question:

- If the provider context owns the behavior, consume its public use case.
- If pure logic truly spans contexts and has two consumers, consider `shared`.
- If two contexts use different meanings, keep separate representations and
  translate at the consuming boundary.
- Do not import a sibling's entity merely because its fields look convenient.

Use plural bounded-context folder names consistently.

## Domain Layer

Keep `domain/` pure and dependency-free except for compatible primitives from
`shared/domain`.

### Entities

- Name entities as plain domain nouns without an `Entity` suffix.
- Use readonly interfaces, including for value-like concepts.
- Keep methods, framework decorators, persistence annotations, and mutation out.
- Put behavior in pure domain functions.

```ts
export interface UserId {
  readonly value: string;
}

export interface Email {
  readonly value: string;
}

export interface User {
  readonly id: UserId;
  readonly email: Email;
  readonly age: number;
}
```

### Services and smart constructors

Put cohesive pure behavior under `domain/services/`. Name a file after the
behavior group and avoid a `Service` suffix.

Use smart constructors to protect invariants:

```ts
export interface MakeUserArgs {
  readonly id: UserId;
  readonly email: Email;
  readonly age: number;
}

export type UserDomainError = {
  readonly type: "InvalidAge";
  readonly minimum: number;
};

export const makeUser = (
  args: MakeUserArgs,
): Result<User, UserDomainError> =>
  args.age < 18
    ? err({ type: "InvalidAge", minimum: 18 })
    : ok(args);
```

Export a pure predicate separately when UI validation must reuse exactly the
same business rule. The predicate remains domain-owned; the UI schema invokes
it.

### Ports

Describe required outside capabilities using domain language:

```ts
export interface FetchUserPortRequest {
  readonly userId: UserId;
}

export type FetchUserPortError =
  | NetworkError
  | ParseError
  | { readonly type: "UserNotFound"; readonly userId: UserId };

export type FetchUserPort = (
  request: FetchUserPortRequest,
) => Promise<Result<User, FetchUserPortError>>;
```

Never mention DTOs, Zod, HTTP responses, browser storage, query-library
callbacks, or framework objects in a port.

## Application Layer

Treat `application/use-cases/` as the module's behavioral public surface. A use
case satisfies one feature-level acceptance criterion by coordinating domain
functions and ports.

Use these placement tests:

- Reusable pure business calculation: domain service.
- Feature-coupled orchestration: application use case.
- External mechanism: infrastructure adapter.
- Rendering or request-library integration: UI infrastructure.

Do not let a use case instantiate an HTTP client, repository, adapter, router,
or framework object. Bind those dependencies at a composition root.

Name supporting contracts `...Dependencies` and `...Args`. Keep operation error
unions narrow. Return `Promise<Result<T, E>>` only when the operation is
actually asynchronous.

## Infrastructure Layer

Split infrastructure by mechanism:

- `infrastructure/server/`: HTTP, storage, browser APIs, SDKs, DTO parsing, and
  other external-data mechanisms.
- `infrastructure/ui/`: the selected UI framework, request and form libraries,
  route integration, and composition.

The word `server` does not mean code that runs on the backend. It identifies the
frontend's boundary with remote or external data. Keep the name for consistency
with this architecture, but revisit it if the project adopts a clearer
mechanism-level vocabulary.

### Composition

Build concrete graphs near the mechanism that owns their lifecycle:

- A feature's UI may build its own adapters and use cases.
- A neutral `app/infrastructure/ui/` root may build several modules when a
  cross-feature graph requires access to multiple modules' private adapters.
- A consuming feature may import a provider module's public use-case type or
  bound callable, but it must not import the provider's adapter.

Do not confuse a source-code import with runtime dependency injection. Directly
import the public factory or type, then inject the concrete bound callable.

## Module Interaction

Allow two cross-module channels.

### Feature behavior

Permit feature A to import feature B only through:

```text
modules/B/application/use-cases/**
```

Prefer a narrow callable contract. Keep B's domain and infrastructure private.
Track module-level edges and enforce a DAG.

If A needs B and B later needs A:

1. Reconsider ownership.
2. Extract eligible pure logic to `shared` after a second consumer exists.
3. Introduce a narrow shared port to invert one direction when a capability
   genuinely crosses ownership.
4. Split orchestration into an app-level module when neither feature should own
   the combined workflow.

### Shared primitives

Allow any compatible layer to import `shared`. Use it for stable leaf
primitives, not for cross-feature orchestration.

## Shared Governance

Apply this invariant:

> Shared code computes over inputs handed to it and never fans out at runtime
> into feature ports, adapters, or use cases.

Eligible contents include:

- `Result` and helpers
- stable transport-error primitives
- genuinely shared immutable domain values
- pure domain services
- narrow shared port types
- generic technical clients such as `Clock` or `HttpClient`
- design-system primitives

Exclude:

- feature use cases
- feature adapters
- workflows that coordinate several modules
- speculative abstractions with only one consumer

Use the rule of two for eligible code. The design system is the carve-out:
generic controls may originate directly in `shared/infrastructure/ui/`.

## Naming Conventions

| Concept | Convention |
| --- | --- |
| Entity | Plain noun, readonly interface |
| Smart constructor | `make<Entity>` and `Make<Entity>Args` |
| Port | Callable `...Port` |
| Port request | `...PortRequest` |
| Port error | `...PortError` |
| Use case type | `...UseCase` |
| Dependencies | `...Dependencies` |
| Execution values | `...Args` |
| Adapter | `...Adapter` |
| Adapter factory | `make...Adapter` only when binding dependencies |
| DTO | `...Dto` |
| Zod schema value | camelCase `...DtoSchema` |
| Mapper | `transform<Source>To<Target>` |
| Shared primitive | Plain name; no `Shared` or `Common` prefix |

Use plural concept folders and singular filenames. Avoid `index.ts` barrels.

## Lint Boundaries

Configure `eslint-plugin-boundaries`, `no-restricted-imports`, or equivalent
rules to enforce:

- feature domain imports only its own domain and compatible `shared/domain`
- feature application imports its own domain, its own application, compatible
  shared code, and sibling public use cases
- feature infrastructure imports inward within its owner
- sibling domain and sibling infrastructure imports are forbidden
- `server/**` cannot import `ui/**`
- feature module cycles are forbidden
- Zod and UI frameworks are forbidden from domain and application
- concept folders are plural and layer-root files are forbidden

Treat the matrix as an allowlist. Review exceptions as architectural decisions,
not convenient local fixes.
