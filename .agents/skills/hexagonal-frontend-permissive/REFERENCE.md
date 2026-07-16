# Hexagonal Frontend — Reference

Detailed conventions. Read `SKILL.md` first for the overview and folder map.

This covers the domain, application, infrastructure, `Result`/error, and `shared`
governance rules, plus the defining **§4 Module interaction** rule (and the
cross-module parts of §7 lint).

## 1. Domain layer

Pure, dependency-free core. Imports nothing from `application/`,
`infrastructure/`, or any third party — except the shared `Result`/error
primitives from `modules/shared/domain`.

### Entities (`domain/entities/`)
- Named as plain domain nouns, with no `Entity` suffix.
- Entity files are singular and match the exported concept
  (`entities/user.ts` -> `User`).
- Declared as **`interface`s**, never `type` aliases.
- All fields `readonly`. Entities are immutable data.
- No methods, no `this`, no classes. Behavior lives in pure functions.
- Value-like domain concepts (`Email`, `Money`, `UserId`, `OrderId`) also live in
  `entities/` and are modeled as readonly object interfaces, not branded
  primitive aliases.

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

### Services (`domain/services/`)
One unified bucket of **pure domain functions** — both single-entity behavior
(`renameUser`) and multi-entity logic (`canCheckout(cart, wallet)`). No
distinction by entity-arity. This is the DDD "domain service" notion. Always
pure: the moment something needs I/O, it becomes a use case backed by a port.
Services do not use a `Service` suffix. Service files are named by cohesive
behavior group, not necessarily by the exact exported function name.

```ts
// domain/services/order-total.ts
export const applyDiscount = (order: Order, pct: Percentage): Order => ({
  ...order,
  total: scale(order.total, 1 - pct),
});
```

### Smart-constructors (domain invariants)
Business invariants (`age >= 18`, valid state transitions) are checked by a pure
`make<Entity>` in the **domain layer** that returns a `Result`. When the
constructor needs an object parameter, name it `Make<Entity>Args`. Invariant
logic is never authored in infra — adapters and use cases only **invoke** it.
Keep the underlying predicates exported so the UI form layer can reuse the exact
same rule (single source of truth).

**Two boundaries, one function:**
- **Read (hydrate from server):** the adapter does I/O + parse + map, then
  **invokes** `make<Entity>` to satisfy the port contract
  (`Result<Entity, E>`). The use case calls the port and branches on the
  `Result` — it does not re-validate.
- **Write (create from user args):** the use case receives `XArgs`, **invokes**
  `make<Entity>` itself, then persists via a port.

```ts
export interface MakeUserArgs {
  readonly id: UserId;
  readonly email: Email;
  readonly age: number;
}

export const makeUser = (args: MakeUserArgs): Result<User, DomainError> =>
  args.age < 18
    ? err({ type: "InvalidAge", min: 18 })
    : ok({ id: args.id, email: args.email, age: args.age });
```

### Ports (`domain/ports/`)
Callable types ending in `Port` describing what the core needs from the outside
world. Every port receives one `PortRequest` object and returns a `Result` whose
error union ends in `PortError`. Ports are phrased **purely in domain terms** —
entities, `Result`, domain errors. NEVER reference DTOs or Zod. Infra implements
them as adapters.

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

### Constants (`domain/constants/`)
Business constants that belong to the domain.

## 2. Application layer — use cases (`application/use-cases/`)

A use case is an application entry point that satisfies **one feature's**
acceptance criteria. It is what the UI calls. It orchestrates the domain over
ports; it never constructs its own dependencies. `use-cases/` is also the
**public surface** other modules may import.

**Use case vs domain service:** the test is ROLE, not "has a port". A use case is
feature-coupled application orchestration; a domain service is reusable,
feature-agnostic pure logic. A use case may even be synchronous and port-free.

### Shape — dependencies, args, and direct functions
Use case callable/factory names keep the `UseCase` suffix. Supporting types use
`Dependencies` and `Args` — not `Deps`, `Input`, `Request`, `Payload`, or
`Command`.

Mutation use cases bind stable dependencies via the outer `make...UseCase`
factory. The returned function takes one named args object at execution time.

```ts
export interface ProcessPaymentDependencies {
  readonly chargePayment: ChargePaymentPort;
}

export interface ProcessPaymentArgs {
  readonly orderId: OrderId;
  readonly amount: Money;
}

export type ProcessPaymentUseCase = (
  dependencies: ProcessPaymentDependencies,
) => (
  args: ProcessPaymentArgs,
) => Promise<Result<Receipt, ProcessPaymentError>>;

export const makeProcessPaymentUseCase: ProcessPaymentUseCase =
  (dependencies) =>
  (args) =>
    dependencies.chargePayment(args);
```

Query use cases use the same `Fetch...` verb as their ports. They bind `args`
inside `Dependencies` and return a no-argument thunk, so the returned function can
be passed directly to `@tanstack/react-query`'s `queryFn`.

```ts
export type FetchUserArgs = FetchUserPortRequest;
export type FetchUserError = FetchUserPortError;

export interface FetchUserDependencies {
  readonly fetchUser: FetchUserPort;
  readonly args: FetchUserArgs;
}

export type FetchUserUseCase = (
  dependencies: FetchUserDependencies,
) => () => Promise<Result<User, FetchUserError>>;

export const makeFetchUserUseCase: FetchUserUseCase =
  (dependencies) =>
  async () =>
    dependencies.fetchUser(dependencies.args);
```

When a use case has no injected dependencies and only coordinates imported pure
domain services/functions, export it as a direct function. Do not create an
empty `Dependencies` type or a no-op `make...UseCase` factory.

```ts
export interface PrepareCheckoutArgs {
  readonly cart: Cart;
  readonly wallet: Wallet;
}

export type PrepareCheckoutUseCase = (
  args: PrepareCheckoutArgs,
) => Result<PreparedCheckout, PrepareCheckoutError>;

export const prepareCheckoutUseCase: PrepareCheckoutUseCase = (args) => {
  const eligible = canCheckout(args.cart, args.wallet);

  if (!eligible) {
    return err({ type: "InsufficientFunds" });
  }

  return ok({
    cart: args.cart,
    total: calculateCheckoutTotal(args.cart),
  });
};
```

### Return type — honest typing
- Async use cases return `Promise<Result<T, E>>`.
- Synchronous use cases return `Result<T, E>` (no fake Promise wrapping).
- Changing sync→async is a deliberate, breaking signature change.

### Errors — per-operation narrow unions
Each use case (and each port) declares a union of ONLY the variants it can
actually produce — not a module-wide god-union. The module's `errors/` holds the
building-block variants; operations compose the relevant ones.
Port boundary errors use the `PortError` suffix; use-case operation errors omit
`Port` and may compose relevant port errors.

```ts
export type ProcessPaymentError =
  | ChargePaymentPortError    // external capability failure
  | { readonly type: "InsufficientFunds"; readonly balance: Money }
  | { readonly type: "OrderAlreadyProcessed"; readonly orderId: OrderId };
```

**Create flows — use case invokes the smart-constructor:**

```ts
export interface RegisterUserDependencies {
  readonly saveUser: SaveUserPort;
}

export type RegisterUserUseCase = (
  dependencies: RegisterUserDependencies,
) => (
  args: RegisterUserArgs,
) => Promise<Result<User, RegisterUserError>>;

export const makeRegisterUserUseCase: RegisterUserUseCase =
  (dependencies) =>
  async (args) => {
    const user = makeUser(args); // domain invariant check — use case boundary
    if (!user.ok) return user;
    return dependencies.saveUser({ user: user.value });
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
  → transformDtoToArgs (pure mapper; infra)               -> MakeEntityArgs
  → makeEntity         (domain fn; invoked by adapter)    -> Result<Entity, E>
  → Result<Entity, E>
```

- The Zod **schema validates the DTO** (raw wire shape), not the entity. Parse,
  don't validate, at the boundary.
- The **mapper is total**: it always receives an already-validated DTO, so it
  cannot throw. Mapper functions use `transform<Source>To<Target>`.
- **`makeEntity` lives in domain**; the adapter calls it. Business rules are not
  implemented in infra.
- The adapter implements a `domain/ports/` port type, so its public type speaks
  pure domain. Use cases never see a DTO or Zod. On reads, the use case trusts
  the port's `Result<Entity, E>` and does not call `makeEntity` again.

```ts
export interface HttpFetchUserAdapterDependencies {
  readonly http: HttpClient;
}

export const makeHttpFetchUserAdapter =
  (dependencies: HttpFetchUserAdapterDependencies): FetchUserPort =>
  async (request) => {
    const res = await dependencies.http.get(`/users/${request.userId.value}`);
    if (!res.ok) return err({ type: "NetworkError", status: res.status });
    const parsed = userDtoSchema.safeParse(res.body);
    if (!parsed.success)
      return err({ type: "ParseError", issues: parsed.error.issues.map(String) });
    return makeUser(transformUserDtoToMakeUserArgs(parsed.data));
  };
```

### `dtos/`, `mappers/`, `schemas/`
- `dtos/` — raw external shapes (TypeScript types of the wire payload), named
  with the `Dto` suffix (`UserDto`).
- `schemas/` — Zod schemas validating DTOs, named as camelCase `DtoSchema`
  values (`userDtoSchema`). `server/` NEVER imports `ui/`.
- `mappers/` — pure `transform<Source>To<Target>` functions
  (`transformUserDtoToMakeUserArgs`, `transformUserToUserDto`).
- Adapter implementations use an `Adapter` suffix. Use `make...Adapter` only
  when real infrastructure dependencies are being bound; dependency-free
  adapters are direct functions.

### `ui/`
All framework-specific code. The architecture only says "framework stuff lives
here". Composition (building use cases from adapters) happens in this layer. The
concrete framework mechanism is out of scope for this skill.

## 4. Module interaction

There are two distinct cross-module channels. Don't conflate them.

### 4a. Feature → feature: behavior, via the public surface
A feature module MAY depend on another feature — but only on its **public
surface**, which is `application/use-cases/`. When module X needs behavior owned
by module Y:

1. X imports Y's use-case factory/type directly from `modules/Y/application/use-cases/`.
2. X injects it as a dependency (functional DI) — typically X's use case or its
   UI composition point receives Y's use case as a dep.
3. No shared port indirection is required for this; inject the use case directly.

**Constraints:**
- Import ONLY from `application/use-cases/`. Y's `domain/**` and
  `infrastructure/**` remain PRIVATE — a bounded context's domain model and
  adapters are never another feature's to import.
- The module dependency graph MUST be a **DAG** — no import cycles. If X→Y and
  Y→X both want to exist, that is a design smell: extract the shared piece to
  `shared` (rule of two) or invert one direction through a `shared` port.
- Prefer depending on a narrow use-case type over a broad one to limit coupling.

### 4b. Anyone → `shared`: pure logic and UI primitives
`shared` is the universal dependency: **any module may import `shared` at any
layer**. Use it for the two needs the use-cases surface can't carry:

- **Shared pure domain logic** (including multi-entity functions like
  `canCheckout(cart, wallet)`) lives in `shared/domain/services/`. A pure domain
  service has no port and no I/O, so it can never be a use case — when it's
  genuinely shared, promote it here (rule of two) rather than reaching into a
  sibling's `domain/`.
- **Reusable presentation primitives** (`Button`, `Input`, `Dialog` — the design
  system) live in `shared/infrastructure/ui/`. They are cross-cutting
  presentation, NOT feature UI, so they never belong in a feature's
  `infrastructure/ui/`. Feature UI imports them from `shared`. Use plain
  component names, never `SharedButton`, `BaseButton`, or `ButtonPrimitive`.

Cross-feature *behavior* is wired directly (4a), so `shared` carries less behavior
— but it remains the home for shared domain logic and the design system (4b).

## 5. `Result` and error primitives (`modules/shared/domain`)

Hand-rolled, zero-dependency (no `neverthrow`) so the domain imports nothing.
Shared technical primitives use plain names; do not prefix reusable primitives
with `Shared` or `Common`.

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
  owning module. Only **generic technical primitives** with no feature semantics
  (`HttpClient`, `Clock`, `Storage` and their interfaces) may live in
  `shared/infrastructure/`.
- Eligible `shared` contents: `Result`, errors, entities, pure domain services,
  port types, the design system, generic tech primitives.
- Shared primitives use plain names (`Result`, `NetworkError`, `Button`) because
  the `shared/` folder already communicates reuse.

**"Reusable" is NOT the criterion** — "stable leaf with no runtime fan-out" is.
The rule of two gates *when* an eligible thing moves; this invariant gates *what
kind* is eligible:
- Code is BORN in its owning feature module.
- It is MOVED to `shared` ONLY when a genuine SECOND consumer appears.
- Never place something in `shared` speculatively.
- When contexts diverge even slightly, PREFER duplicating over a shared
  abstraction (bounded contexts model the same concept differently).

**Design-system carve-out:** generic presentation primitives (`Button`, `Input`,
`Dialog`) are inherently cross-cutting — they are BORN in `shared/infrastructure/ui/`
directly, not promoted from a feature. The rule of two still governs
*feature-flavored* shared components (e.g. a `<UserAvatar>`): those start in their
owning feature and move on a genuine second consumer.

**No "shared use case".** A capability needed by two modules is resolved by
OWNERSHIP, never by relocation to `shared`:
- It belongs to one context (core feature or a supporting-subdomain module like
  `notifications`/`audit`) → that module owns the use case; others import it
  directly (§4a). For pure logic and UI primitives, `shared` is the home (§4b).
- Two features that *look* like they run the same orchestration are either one
  owner with multiple UI/consumer entry points, or honest per-context
  duplication — not a shared use case.

## 7. Lint configuration (sketch)

Use `eslint-plugin-boundaries` or `no-restricted-imports` to enforce:

- Between feature modules, imports are allowed ONLY from
  `modules/*/application/use-cases/**`. Importing a sibling's `modules/*/domain/**`
  or `modules/*/infrastructure/**` is forbidden.
- `modules/shared/**` is importable by any module at any layer (exempt from the
  rule above) — this is how `shared/domain/services/` and
  `shared/infrastructure/ui/` reach every feature.
- The module graph is acyclic — add a cycle detector
  (`eslint-plugin-import` `no-cycle`, or a custom boundaries rule).
- `domain/**` may not import Zod, `fetch`, a UI framework, or anything from
  `infrastructure/**` or `application/**`.
- `server/**` may not import `ui/**`.
- Folder-name convention: concept folders are plural; no loose files at a layer
  root.
