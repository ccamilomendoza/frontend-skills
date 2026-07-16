# Hexagonal Frontend (Strict) — Reference

Detailed conventions. Read `SKILL.md` first for the overview and folder map.

## 1. Domain layer

Pure, dependency-free core. Imports nothing from `application/`,
`infrastructure/`, or any third party — except the shared `Result`/error
primitives from `modules/shared/domain`.

### Entities (`domain/entities/`)
- Declared as **`interface`s**, never `type` aliases.
- All fields `readonly`. Entities are immutable data.
- No methods, no `this`, no classes. Behavior lives in pure functions.

```ts
export interface User {
  readonly id: UserId;
  readonly email: Email;
  readonly age: number;
}
```

### Services (`domain/services/`)
One unified bucket of **pure domain functions** — both single-entity behavior
(`renameUser`) and multi-entity logic (`canCheckout(cart, wallet)`). No
distinction by entity-arity. This is the DDD "domain service" notion. Always
pure: the moment something needs I/O, it becomes a use case backed by a port.

```ts
export const applyDiscount = (order: Order, pct: Percentage): Order => ({
  ...order,
  total: scale(order.total, 1 - pct),
});
```

### Smart-constructors (domain invariants)
Business invariants (`age >= 18`, valid state transitions) are checked by a pure
`make<Entity>` in the **domain layer** that returns a `Result`. Invariant logic
is never authored in infra — adapters and use cases only **invoke** it. Keep the
underlying predicates exported so the UI form layer can reuse the exact same rule
(single source of truth).

**Two boundaries, one function:**
- **Read (hydrate from server):** the adapter does I/O + parse + map, then
  **invokes** `make<Entity>` to satisfy the port contract
  (`Result<Entity, E>`). The use case calls the port and branches on the
  `Result` — it does not re-validate.
- **Write (create from user input):** the use case receives `XInput`, **invokes**
  `make<Entity>` itself, then persists via a port.

```ts
export const makeUser = (input: {
  id: UserId; email: Email; age: number;
}): Result<User, DomainError> =>
  input.age < 18
    ? err({ type: "InvalidAge", min: 18 })
    : ok({ id: input.id, email: input.email, age: input.age });
```

### Ports (`domain/ports/`)
Interfaces describing what the core needs from the outside world (repositories,
clocks, gateways). Phrased **purely in domain terms** — entities, `Result`,
domain errors. NEVER reference DTOs or Zod. Infra implements them as adapters.

```ts
export interface UserRepository {
  getById(id: UserId): Promise<Result<User, UserGetError>>;
}
```

### Constants (`domain/constants/`)
Business constants that belong to the domain.

## 2. Application layer — use cases (`application/use-cases/`)

A use case is an application entry point that satisfies **one feature's**
acceptance criteria. It is what the UI calls. It orchestrates the domain over
ports; it never constructs its own dependencies.

**Use case vs domain service:** the test is ROLE, not "has a port". A use case is
feature-coupled application orchestration; a domain service is reusable,
feature-agnostic pure logic. A use case may even be synchronous and port-free.

### Shape — curried factory + command object
Deps via the outer `make…` factory (partial application). The returned function
takes ONE named command object (`XInput`).

```ts
export interface ProcessPaymentDeps {
  readonly payments: PaymentGateway;
  readonly clock: Clock;
}
export interface ProcessPaymentInput {
  readonly orderId: OrderId;
  readonly amount: Money;
}

export const makeProcessPayment =
  (deps: ProcessPaymentDeps) =>
  (input: ProcessPaymentInput): Promise<Result<Receipt, ProcessPaymentError>> =>
    deps.payments.charge(input.orderId, input.amount);
```

### Return type — honest typing
- Async use cases return `Promise<Result<T, E>>`.
- Synchronous use cases return `Result<T, E>` (no fake Promise wrapping).
- Changing sync→async is a deliberate, breaking signature change.

### Errors — per-operation narrow unions
Each use case (and each port) declares a union of ONLY the variants it can
actually produce — not a module-wide god-union. The module's `errors/` holds the
building-block variants; operations compose the relevant ones.

```ts
export type ProcessPaymentError =
  | NetworkError              // shared transport primitive
  | ParseError                // shared transport primitive
  | { type: "InsufficientFunds"; balance: Money }
  | { type: "OrderAlreadyProcessed"; orderId: OrderId };
```

**Create flows — use case invokes the smart-constructor:**

```ts
export const makeRegisterUser =
  (deps: { users: UserRepository }) =>
  async (input: RegisterUserInput): Promise<Result<User, RegisterUserError>> => {
    const user = makeUser(input); // domain invariant check — use case boundary
    if (!user.ok) return user;
    return deps.users.save(user.value);
  };
```

## 3. Infrastructure layer

All I/O and framework code. Split into `ui/` (framework-specific) and `server/`
(everything else at the data boundary).

### The fat adapter (`server/adapters/`)
At the **read boundary**, the adapter is dumb plumbing: I/O + wire-parse +
structural map. It **invokes** the domain smart-constructor as the final step to
satisfy the port contract — it does not contain invariant logic itself.

```
unknown
  → schema.safeParse   (wire validity; Zod; infra)        -> DTO | ParseError
  → toEntity           (pure mapper; infra)               -> entity-shaped fields
  → makeEntity         (domain fn; invoked by adapter)    -> Result<Entity, E>
  → Result<Entity, E>
```

- The Zod **schema validates the DTO** (raw wire shape), not the entity. Parse,
  don't validate, at the boundary.
- The **mapper is total**: it always receives an already-validated DTO, so it
  cannot throw.
- **`makeEntity` lives in domain**; the adapter calls it. Business rules are not
  implemented in infra.
- The adapter implements a `domain/ports/` interface, so its public type speaks
  pure domain. Use cases never see a DTO or Zod. On reads, the use case trusts
  the port's `Result<Entity, E>` and does not call `makeEntity` again.

```ts
export const makeHttpUserRepository =
  (deps: { http: HttpClient }): UserRepository => ({
    async getById(id) {
      const res = await deps.http.get(`/users/${id}`);
      if (!res.ok) return err({ type: "NetworkError", status: res.status });
      const parsed = userDtoSchema.safeParse(res.body);
      if (!parsed.success)
        return err({ type: "ParseError", issues: parsed.error.issues.map(String) });
      return makeUser(toUserEntity(parsed.data)); // Result<User, DomainError>
    },
  });
```

### `dtos/`, `mappers/`, `schemas/`
- `dtos/` — raw external shapes (TypeScript types of the wire payload).
- `mappers/` — pure `DTO → entity-fields` functions.
- `schemas/` — Zod schemas validating DTOs. `server/` NEVER imports `ui/`.

### `ui/`
All framework-specific code. The architecture only says "framework stuff lives
here". Composition (building use cases from adapters) happens in this layer. The
concrete framework mechanism is out of scope for this skill.

## 4. Module interaction (STRICT)

A module imports only **itself** and **`modules/shared`**. When module X needs
behavior owned by module Y at runtime:

1. Define the contract as a **port interface in `modules/shared/domain/ports/`**.
2. X depends only on that shared port.
3. Y provides an **adapter implementing it** (in Y's infrastructure).
4. The composition point (the root UI shell, in `infrastructure/ui/`) binds Y's
   adapter to the shared port so X receives it via DI.

Modules never import each other. An event bus is reserved for fire-and-forget
notifications only, never core flows.

**Non-runtime sharing (no port needed).** Port inversion above is for *runtime
behavior* owned by another feature. Two other shared needs go directly into
`shared` — `shared` is the one module everyone may import, at any layer:

- **Shared pure domain logic** (including multi-entity functions like
  `canCheckout(cart, wallet)`) lives in `shared/domain/services/`. A pure domain
  service has no port and no I/O, so it can never be a use case — when it's
  genuinely shared, promote it here (rule of two) rather than reaching into a
  sibling's `domain/`.
- **Reusable presentation primitives** (`Button`, `Input`, `Dialog` — the design
  system) live in `shared/infrastructure/ui/`. They are cross-cutting
  presentation, NOT feature UI, so they never belong in a feature's
  `infrastructure/ui/`. Feature UI imports them from `shared`.

## 5. `Result` and error primitives (`modules/shared/domain`)

Hand-rolled, zero-dependency (no `neverthrow`) so the domain imports nothing.

```ts
// modules/shared/domain/results/
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
// + isOk, isErr, map, mapErr, andThen, match, and async helpers as needed.
```

```ts
// modules/shared/domain/errors/  — transport primitives, used VERBATIM
export interface NetworkError { readonly type: "NetworkError"; readonly status?: number }
export interface ParseError   { readonly type: "ParseError"; readonly issues: readonly string[] }
```

**Error rules:**
- `E` is a per-module tagged discriminated union, tagged by a literal `type`.
- `NetworkError`/`ParseError` are defined ONCE in `shared` and used verbatim.
- Modules MUST NOT `extends`/mutate the shared error shapes. To add module
  meaning, ADD a new tagged variant with a fresh discriminant — never reshape a
  shared primitive.
- Match exhaustively with a `switch` on `type`.

## 6. `shared` governance — a leaf kernel, not a feature module

`shared` is the **sink** of the dependency graph: everyone imports it, it
orchestrates nothing. The defining invariant:

> `shared` code NEVER reaches into the app's ports, adapters, or other modules at
> runtime — it only computes over the inputs handed to it (no runtime fan-out
> into the module graph).

Consequences:
- `shared` has **NO `application/use-cases/`** and holds **no use cases**. A use
  case orchestrates ports → runtime fan-out → it would turn `shared` into a
  god-module. There is no such thing as a "shared use case" (see below).
- `shared` holds **no feature adapters** either; a feature adapter lives in its
  owning module (as in Example 2). Only **generic technical primitives** with no
  feature semantics (`HttpClient`, `Clock`, `Storage` and their interfaces) may
  live in `shared/infrastructure/`.
- Eligible `shared` contents: `Result`, errors, entities, pure domain services,
  port interfaces (incl. cross-module ports), the design system, generic tech
  primitives.

**"Reusable" is NOT the criterion** — "stable leaf with no runtime fan-out" is.
The rule of two gates *when* an eligible thing moves; this invariant gates *what
kind* is eligible:
- Code is BORN in its owning feature module.
- It is MOVED to `shared` ONLY when a genuine SECOND consumer appears.
- Never place something in `shared` speculatively.
- When contexts diverge even slightly, PREFER duplicating over a shared
  abstraction (bounded contexts model the same concept differently).

**No "shared use case".** A capability needed by two modules is resolved by
OWNERSHIP, never by relocation to `shared`:
- It belongs to one context (core feature or a supporting-subdomain module like
  `notifications`/`audit`) → that module owns the use case; others consume it
  through a shared port (§4). `shared` holds at most the port interface.
- Two features that *look* like they run the same orchestration are either one
  owner with multiple UI/consumer entry points, or honest per-context
  duplication (rule of two / divergence above) — not a shared use case.

**Design-system carve-out:** generic presentation primitives (`Button`, `Input`,
`Dialog`) are inherently cross-cutting — they are BORN in `shared/infrastructure/ui/`
directly, not promoted from a feature. The rule of two still governs
*feature-flavored* shared components (e.g. a `<UserAvatar>`): those start in their
owning feature and move on a genuine second consumer.

## 7. Lint configuration (sketch)

Use `eslint-plugin-boundaries` or `no-restricted-imports` to enforce:

- A FEATURE module's `domain/**` and `infrastructure/**` are not importable from
  outside the owning module (public surface = `application/use-cases/` and
  shared-port adapters only).
- `modules/shared/**` is exempt: any module may import it at any layer — this is
  how `shared/domain/services/` and `shared/infrastructure/ui/` reach every
  feature.
- Any `modules/X → modules/Y` import is forbidden (X ≠ Y, Y ≠ `shared`).
- `domain/**` may not import Zod, `fetch`, a UI framework, or anything from
  `infrastructure/**` or `application/**`.
- `server/**` may not import `ui/**`.
- Folder-name convention: concept folders are plural; no loose files at a layer
  root.
