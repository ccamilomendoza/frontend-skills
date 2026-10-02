# Architecture Reference

Use this reference when deciding bounded-context ownership, layer placement,
imports, authentication boundaries, composition, naming, shared governance, or
lint enforcement.

## Contents

1. [Bounded contexts](#bounded-contexts)
2. [Dependency model](#dependency-model)
3. [Infrastructure organization](#infrastructure-organization)
4. [Authentication and technical context](#authentication-and-technical-context)
5. [Module interaction](#module-interaction)
6. [Composition and process roots](#composition-and-process-roots)
7. [Shared governance](#shared-governance)
8. [Naming conventions](#naming-conventions)
9. [Enforcement](#enforcement)

## Bounded Contexts

Create a small number of coarse feature modules such as `orders`, `users`, or
`billing`. Assign every business capability to one owner. A module owns its
domain language, application operations, inbound mechanisms, outbound
capabilities, and composition.

Treat reuse as an ownership question:

- If a provider context owns the behavior, consume its public use case.
- If pure logic genuinely spans contexts and has two consumers, consider
  `shared`.
- If contexts give similar-looking concepts different meanings, keep separate
  representations and translate at the consuming boundary.
- Do not import a sibling entity merely because its fields are convenient.

Use plural bounded-context folder names. Keep the number of modules low enough
that each one represents a real domain boundary rather than a technical slice.

## Dependency Model

Within one feature:

```text
infrastructure -> application -> domain
```

| Layer | Owns | Must not own |
| --- | --- | --- |
| Domain | Immutable entities, invariants, pure behavior, outbound capability ports | Zod, framework types, I/O, orchestration, protocol DTOs |
| Application | Use-case orchestration, authorization decisions, operation errors | Protocol status, framework requests, ORM clients, concrete adapters |
| Infrastructure | Parsing, frameworks, I/O, adapters, handlers, presenters, registration, composition | Business invariants |

Domain may import only compatible zero-dependency primitives from
`shared/domain/**`. Application may import its own domain, compatible shared
code, and a sibling module's public `application/use-cases/**` surface.
Infrastructure may import inward within its owning module.

Treat import rules as allowlists. A convenient import that crosses a private
boundary is an architecture change, not a local exception.

## Infrastructure Organization

Use three top-level responsibilities inside a feature's infrastructure:

```text
infrastructure/
  compositions/
  inbound/<mechanism>/
  outbound/<capability>/<provider>/
```

- `inbound/` contains mechanisms that drive the application.
- `outbound/` contains mechanisms the application calls.
- `compositions/` is the only module-local location that may construct both
  sides.

### Inbound

Group by invocation mechanism first:

```text
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
```

A mechanism subtree may use one concrete framework or provider directly. Add a
provider scope only when multiple implementations coexist. Keep HTTP and
message DTOs separate even when their current fields match; each contract may
evolve independently.

### Outbound

Group by capability and then provider:

```text
outbound/
  persistence/
    postgres/
      adapters/ records/ schemas/ mappers/
  integrations/
    stripe/
      adapters/ dtos/ schemas/ mappers/
  messaging/
    kafka/
      adapters/ dtos/ schemas/ mappers/
```

Use `Record` for persistence shapes and `Dto` for external wire contracts.
Provider-specific clients, exceptions, transactions, schemas, and naming stay
inside the provider subtree.

Group artifact types last in both directions. Create only folders containing
real code. Every file belongs to a named concept folder; do not place loose
files at `domain/`, `application/`, or `infrastructure/` roots.

## Authentication and Technical Context

Separate authentication from authorization:

1. Inbound infrastructure extracts and verifies credentials.
2. It parses verified claims and constructs a framework-free `Actor`.
3. The handler passes `actor` explicitly to the use case.
4. The use case makes the business authorization decision.
5. Reusable pure authorization predicates live in domain services.

Middleware may reject missing or invalid credentials. It must not decide
whether an authenticated actor may perform a domain operation.

Middleware may also own technical cross-cutting concerns:

- request or message IDs
- tracing and generic logging
- CORS and protocol security headers
- body-size and rate limits
- technical authentication

Middleware must not invoke use cases, apply business invariants, replace
operation-specific schemas, or map use-case errors.

Keep disconnect signals, technical deadlines, and `AbortSignal` in
infrastructure. Bind request-scoped adapters to cancellation when useful. Pass
a deadline into application or domain only when it has business meaning, such
as an auction close or payment cutoff.

Pass every business-relevant value explicitly. If an IP address becomes a legal
audit input, add that specific value to the relevant use case instead of
introducing a generic context bag.

## Module Interaction

Permit one feature-to-feature channel:

```text
modules/<provider>/application/use-cases/**
```

When `checkout` needs behavior owned by `users`:

1. `checkout` imports the user use-case contract or factory.
2. `checkout` declares the bound callable as a dependency.
3. Composition supplies the bound implementation.
4. `users` must not depend back on `checkout`.

“Direct import” describes the public source-code contract. It never permits the
consumer to construct or import sibling infrastructure. Do not import sibling
entities, services, ports, DTOs, schemas, adapters, handlers, presenters, or
compositions.

Keep the feature dependency graph a DAG. If `A -> B` and `B -> A` appears:

1. Reconsider capability ownership.
2. Extract eligible pure logic to `shared` after a second consumer exists.
3. Invert one direction through a narrow shared port when the capability
   genuinely crosses ownership.
4. Move combined orchestration to a new owning module when neither feature
   should own it.

Do not use barrels, package aliases, re-exports, or dependency containers to
conceal a cycle or private import.

## Composition and Process Roots

Each feature owns construction under `infrastructure/compositions/`:

```text
modules/orders/infrastructure/compositions/
  compose-order-use-cases.ts
  register-order-http.ts
  register-order-consumers.ts
```

A feature composition may import:

- its own application, domain, and infrastructure
- shared code
- public sibling use-case callables supplied as explicit dependencies

It must not import or construct sibling infrastructure.

`src/main/entries/` is the deliberate boundary exception that connects the
application:

```text
main/
  entries/
    api.ts
    worker.ts
    cli.ts
```

An entry point may create shared database, HTTP, broker, cache, and storage
clients; call module composition or registration functions; pass one module's
bound public use case to another module; and own process startup and shutdown.

Keep business rules, request schemas, DTO mappers, presenters, repository
implementations, and use-case error mapping out of `main`. Modules never import
`main`.

```ts
const database = makeDatabasePool(config);
const http = makeHttpServer(config);

const users = composeUsersModule({ database, http });

composeCheckoutModule({
  database,
  http,
  fetchCurrentUser: users.fetchCurrentUser,
});

await http.start();
```

## Shared Governance

Treat `shared` as a dependency sink. Everyone may import compatible shared
code; shared imports no feature at runtime.

Eligible contents:

- `Result` and helpers
- stable technical error primitives
- genuinely shared IDs and immutable value concepts
- genuinely shared pure domain logic
- narrow leaf ports such as `Clock`
- generic technical infrastructure foundations

Forbidden contents:

- use cases or runtime orchestration
- feature repositories or integrations
- feature handlers or presenters
- feature DTOs or message contracts
- service locators that fan out into feature behavior

Use the rule of two: start code in its owning feature and promote only when a
real second consumer appears. “Reusable” is insufficient; shared code must stay
stable, zero-knowledge about features, and free of runtime fan-out.

## Naming Conventions

| Concept | Convention |
| --- | --- |
| Entity | Plain noun, readonly interface, singular filename, no `Entity` suffix |
| Domain behavior | Cohesive pure group in `services/`, no `Service` suffix |
| Smart constructor | `make<Entity>` and `Make<Entity>Args` |
| Port | Callable `...Port` |
| Port request | `...PortRequest` |
| Port error | Narrow `...PortError` union |
| Use-case factory type | `...UseCase` |
| Bound use-case callable | Operation name such as `PlaceOrder` |
| Dependencies | `...Dependencies` |
| Execution values | `...Args` |
| Adapter | `...Adapter` |
| Adapter factory | `make...Adapter` only when binding real dependencies |
| Protocol DTO | Include mechanism and direction, such as `CreateOrderHttpRequestDto` |
| Persistence shape | `...Record`, never `...Dto` |
| Zod schema value | camelCase `<TypeName>Schema` |
| Mapper | `transform<Source>To<Target>` |
| Presenter | `present<Operation><Mechanism>Result` |
| Shared primitive | Plain name; no `Shared` or `Common` prefix |

Use singular filenames, plural concept folders, and no barrel `index.ts`
facades. Mechanism and provider scope names are exempt from the plural concept
folder rule.

## Enforcement

Use `eslint-plugin-boundaries`, `no-restricted-imports`, a cycle detector, or
equivalent tooling to enforce:

- `domain/**` imports only its own domain and allowed `shared/domain/**`
- `application/**` imports its own domain, compatible shared code, and sibling
  `application/use-cases/**` only
- `inbound/**` imports its own application, domain, shared code, and framework
  packages, but not `outbound/**`
- `outbound/**` imports its own domain, shared code, and provider packages, but
  not `inbound/**` or application orchestration
- `compositions/**` may import both sides of its own feature
- `main/**` imports module compositions, never deep adapters or domain internals
- feature-to-feature imports target only the provider's public use cases
- `shared/**` imports no feature module
- Zod appears only in infrastructure
- the feature dependency graph is acyclic
- no barrel files, loose layer-root files, or empty speculative folders exist

Review every lint exception as an architectural decision. Prefer changing
ownership or composition over weakening the boundary matrix.
