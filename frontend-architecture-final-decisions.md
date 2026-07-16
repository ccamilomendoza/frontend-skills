# Frontend Architecture - Final Decisions

This document consolidates the final architecture and naming decisions for the
functional-first hexagonal frontend architecture.

It keeps only the decisions that made it into the current architecture. Earlier
branches, rejected options, superseded names, and parked review questions are
intentionally omitted.

## Architecture Goal

The architecture organizes frontend code around bounded-context modules using a
functional-first hexagonal style.

Each feature module owns three layers:

1. `domain/` - pure business model and business logic.
2. `application/` - use cases that satisfy feature/application workflows.
3. `infrastructure/` - framework code, I/O, adapters, DTOs, schemas, and mapping.

Dependencies point inward:

```txt
infrastructure -> application -> domain
```

The domain layer never imports framework, I/O, DTO, schema, or adapter code.

## Core Principles

- Prefer pure functions.
- Do not use classes, `this`, mutation, or closures-as-objects for domain logic.
- Model entities as immutable data.
- Put behavior in free functions.
- Return errors as values through `Result<T, E>`.
- Keep framework-specific code inside `infrastructure/ui/`.
- Keep module boundaries explicit and lint-enforced.
- Use dependency injection through functions and partial application, not service
  containers or class instances.

## Folder Rules

Every file lives inside a folder named after its concept.

Concept folders are always plural:

```txt
entities/
services/
constants/
ports/
use-cases/
adapters/
dtos/
mappers/
schemas/
results/
errors/
```

No files should live loose at a layer root.

The shared module lives inside `src/modules/`:

```txt
src/modules/
  user/
  payments/
  checkout/
  shared/
```

## Module Model

A module is a bounded context or business capability, such as `user`,
`payments`, `catalog`, or `checkout`.

Modules should be coarse-grained and few. They should not be organized as one
module per entity or one module per screen.

When the same real-world concept appears in multiple bounded contexts, prefer a
context-specific model in each module if the meaning or shape differs even
slightly. Shared abstractions are reserved for concepts that are genuinely
identical across consumers.

## Domain Layer

The domain layer contains the pure core of a module.

```txt
domain/
  entities/
  services/
  constants/
  ports/
```

The domain layer may import shared domain primitives such as `Result`,
`NetworkError`, and `ParseError`, but it must not import framework, I/O,
infrastructure, UI, DTO, schema, or adapter code.

### Entities

Entities are immutable domain data.

Entity types use plain domain nouns without an `Entity` suffix:

```ts
export interface User {
  readonly id: UserId;
  readonly email: Email;
}
```

Avoid:

```ts
export interface UserEntity {
  readonly id: UserId;
}
```

Entity files are singular and live in the plural `entities/` folder:

```txt
domain/entities/user.ts
domain/entities/receipt.ts
domain/entities/cart-item.ts
```

Entities are always declared as `interface`s, not object `type` aliases.

All entity attributes are `readonly`. Collections are readonly too:

```ts
export interface Cart {
  readonly id: CartId;
  readonly items: readonly CartItem[];
}
```

Entities do not contain methods. Domain behavior is implemented with pure
functions in `domain/services/` or smart constructors.

Value-like domain concepts also live in `entities/`. There is no separate
`value-objects/` concept in this architecture.

```ts
export interface UserId {
  readonly value: string;
}

export interface Email {
  readonly value: string;
}

export interface Money {
  readonly cents: number;
  readonly currency: string;
}
```

Scalar domain concepts are readonly object interfaces, not branded primitive
aliases.

### Domain Services

Domain services are pure domain functions.

They contain reusable business logic that is not tied to one specific feature
workflow. Single-entity behavior and multi-entity behavior both live here.

Domain service files are named by cohesive behavior group:

```txt
domain/services/cart-total.ts
domain/services/checkout-eligibility.ts
domain/services/payment-risk.ts
```

Exports are named as business behavior and do not use a `Service` suffix:

```ts
export const calculateCartTotal = (cart: Cart): Money => {
  // pure domain logic
};

export const canCheckout = (cart: Cart, wallet: Wallet): boolean => {
  // pure domain logic
};
```

Avoid:

```ts
CartTotalService
CheckoutEligibilityService
cart-service.ts
```

If logic needs I/O, persistence, framework state, or another external capability,
that dependency is inverted through a port and coordinated by a use case.

### Smart Constructors

Smart constructors are pure domain functions that enforce business invariants.

They use the `make<Entity>` naming convention:

```ts
export const makeEmail = (value: string): Result<Email, EmailError> => {
  // validate and normalize email
};
```

When a smart constructor receives an object parameter, the parameter type is
named `Make<Entity>Args`:

```ts
export interface MakeMoneyArgs {
  readonly cents: number;
  readonly currency: string;
}

export const makeMoney = (
  args: MakeMoneyArgs,
): Result<Money, MoneyError> => {
  // validate money invariants
};
```

Use `make` for pure domain construction. Reserve `create...` for application
operations that create something in the system, especially when persistence or
external effects are involved.

Smart constructors are authored in the domain. Adapters and use cases may invoke
them, but they do not own the invariant logic.

### Constants

Business constants live in `domain/constants/`.

Constants belong in the domain when they express domain rules or stable business
limits, not UI preferences or infrastructure configuration.

### Ports

Ports are callable function types owned by the domain.

They describe external capabilities required by the core and are implemented by
infrastructure adapters.

Port types live in `domain/ports/` and always use the `Port` suffix:

```ts
export type FetchUserProfilePort = (
  request: FetchUserProfilePortRequest,
) => Promise<Result<UserProfile, FetchUserProfilePortError>>;
```

Ports are not object interfaces with methods.

Avoid:

```ts
export interface FetchUserProfilePort {
  fetch(request: FetchUserProfilePortRequest): Promise<Result<UserProfile, E>>;
}
```

Every port receives one request object, even if it has one field:

```ts
export interface FetchUserProfilePortRequest {
  readonly userId: UserId;
}
```

Port request types use the `PortRequest` suffix.

Port boundary errors use the `PortError` suffix:

```ts
export type FetchUserProfilePortError =
  | NetworkError
  | ParseError
  | { readonly type: "UserProfileNotFound"; readonly userId: UserId };
```

Ports speak only in domain terms: entities, domain concepts, `Result`, and error
unions. They never expose DTOs, Zod schemas, HTTP response shapes, or framework
types.

## Application Layer

The application layer contains use cases.

```txt
application/
  use-cases/
```

Use cases are application entry points that satisfy concrete feature acceptance
criteria. They coordinate domain entities, domain services, smart constructors,
ports, and sometimes other use cases.

The defining trait of a use case is its role in the application layer, not
whether it is async or whether it depends on a port.

### Use Case Names

Use case callable and factory types keep the `UseCase` suffix:

```ts
export type ProcessPaymentUseCase = /* ... */;

export const makeProcessPaymentUseCase: ProcessPaymentUseCase = /* ... */;
```

Supporting use case types do not repeat `UseCase`.

Use:

```ts
ProcessPaymentDependencies
ProcessPaymentArgs
FetchUserProfileDependencies
FetchUserProfileArgs
```

Avoid:

```ts
ProcessPaymentUseCaseDeps
ProcessPaymentUseCaseInput
ProcessPaymentRequest
ProcessPaymentCommand
ProcessPaymentPayload
```

Use case parameter objects are called `Args`, not `Input`, `Request`,
`Command`, or `Payload`.

### Query Use Cases

Do not add `QueryUseCase` to query use case names.

Query use cases use the same `Fetch...` verb as their ports:

```ts
FetchUserProfilePort
FetchUserProfileUseCase
```

Avoid:

```ts
FetchUserProfileQueryUseCase
```

Query use cases bind args inside `Dependencies` and return a no-argument thunk.
This supports passing the returned function directly to React Query's `queryFn`.

```ts
export type FetchUserProfileArgs = FetchUserProfilePortRequest;

export interface FetchUserProfileDependencies {
  readonly fetchUserProfile: FetchUserProfilePort;
  readonly args: FetchUserProfileArgs;
}

export type FetchUserProfileUseCase = (
  dependencies: FetchUserProfileDependencies,
) => () => Promise<Result<UserProfile, FetchUserProfileError>>;

export const makeFetchUserProfileUseCase: FetchUserProfileUseCase =
  (dependencies) =>
  async () =>
    dependencies.fetchUserProfile(dependencies.args);
```

### Mutation Use Cases

Do not add `MutationUseCase` to mutation use case names.

Use the business operation verb:

```ts
ProcessPaymentUseCase
UpdateUserEmailUseCase
RegisterUserUseCase
```

Mutation use cases bind stable dependencies at construction time and receive
args at execution time:

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
  async (args) =>
    dependencies.chargePayment({
      orderId: args.orderId,
      amount: args.amount,
    });
```

### Use Cases That Coordinate Pure Domain Logic

A use case may exist without injected dependencies.

When feature-specific acceptance criteria require coordinating several pure
domain functions or domain services, that coordination belongs in
`application/use-cases/`.

If the use case has no injected dependencies, export it as a direct function.
Do not create an empty `Dependencies` interface or a no-op factory for uniformity.

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

The pure reusable behavior remains in `domain/services/`; the use case arranges
that behavior for a concrete application workflow.

### Args Ownership

When use case args have the same shape as the port request they delegate to,
reuse the port request type:

```ts
export type FetchUserProfileArgs = FetchUserProfilePortRequest;
```

When the use case needs application-only fields, extend the port request:

```ts
export interface FetchUserProfileArgs extends FetchUserProfilePortRequest {
  readonly includePermissions: boolean;
}
```

This avoids duplicate request-like shapes that drift while still allowing the
application layer to add fields when the workflow needs them.

### Use Case Return Types

Use cases are honest about sync and async behavior.

Synchronous use cases return `Result<T, E>`.

Asynchronous use cases return `Promise<Result<T, E>>`.

Do not wrap sync logic in a `Promise` only for uniformity.

### Use Case Errors

Use case errors are per-operation unions.

A use case returns only the variants it can actually produce. It may propagate
port errors and add application-specific variants:

```ts
export type ProcessPaymentError =
  | ChargePaymentPortError
  | { readonly type: "AlreadyProcessedPayment"; readonly orderId: OrderId };
```

Avoid a single broad module-wide error union that every operation returns.

## Infrastructure Layer

The infrastructure layer contains framework-specific code and concrete boundary
implementations.

```txt
infrastructure/
  ui/
  server/
    adapters/
    dtos/
    mappers/
    schemas/
```

### UI

All UI-framework-specific code lives in `infrastructure/ui/`.

The core architecture is framework-agnostic. It only defines `ui/` as the place
where framework concerns live. Concrete roles such as React hooks, containers,
and components are defined by the framework-specific UI skill.

Composition happens in the infrastructure layer, within or around `ui/`.

Use cases do not construct their own dependencies. UI composition code builds
use cases by injecting concrete adapters and other dependencies.

### Server Boundary

Non-UI infrastructure boundary code is grouped under `infrastructure/server/`.

The server boundary is explicit:

```txt
unknown
  -> DTO schema parse
  -> DTO
  -> mapper
  -> Make<Entity>Args
  -> make<Entity>
  -> Result<Entity, E>
```

The adapter owns the boundary orchestration. It performs I/O, parses unknown
data into a DTO, maps the DTO into domain constructor args, invokes the domain
smart constructor, and returns a `Result`.

The adapter invokes domain invariant checks, but the invariant logic itself
lives in the domain.

Use cases do not validate DTOs on reads. They call ports and branch on the
returned `Result`.

### DTOs

DTOs are raw wire shapes.

They live in `infrastructure/server/dtos/` and use the `Dto` suffix:

```ts
export interface UserDto {
  readonly id: string;
  readonly email: string;
}
```

Use `Dto`, not `DTO`.

Avoid ambiguous transport names:

```ts
UserResponse
ReceiptDTO
```

### Schemas

DTO schemas live in `infrastructure/server/schemas/`.

They validate the raw wire shape, not the domain entity.

Schema values use camelCase and end in `DtoSchema`:

```ts
export const userDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
}) satisfies z.ZodType<UserDto>;
```

Avoid:

```ts
UserDtoSchema
userSchema
parseUserDtoSchema
```

Form schemas belong in `infrastructure/ui/`, not `server/schemas/`.

### Mappers

Mappers live in `infrastructure/server/mappers/`.

They are pure transformations between boundary shapes and domain-facing shapes.

Mapper functions use the `transform<Source>To<Target>` naming pattern:

```ts
export const transformUserDtoToMakeUserArgs = (
  dto: UserDto,
): MakeUserArgs => ({
  id: { value: dto.id },
  email: { value: dto.email },
});

export const transformUserToUserDto = (user: User): UserDto => ({
  id: user.id.value,
  email: user.email.value,
});
```

Mapper files are named by transformation pair:

```txt
user-dto-to-make-user-args.ts
user-to-user-dto.ts
```

Avoid unclear mapper names:

```ts
toUser
fromUserDto
mapUserDtoToUser
userDtoMapper
```

### Adapters

Adapters implement domain ports.

They live in `infrastructure/server/adapters/` and use the `Adapter` suffix.

Adapter names should include the concrete technology or source plus the
capability being implemented:

```ts
export const makeHttpFetchUserProfileAdapter =
  (
    dependencies: HttpFetchUserProfileAdapterDependencies,
  ): FetchUserProfilePort =>
  async (request) => {
    // I/O + parse + map + make<Entity>
  };
```

Use a `make...Adapter` factory only when the adapter closes over real
infrastructure dependencies such as an HTTP client, SDK client, storage
implementation, or runtime configuration.

When an adapter has no dependencies to bind, export the adapter function
directly:

```ts
export const getCurrentTimeAdapter: GetCurrentTimePort = () =>
  ok(new Date());
```

Avoid dependency-free factories:

```ts
makeGetCurrentTimeAdapter
```

## Shared Module

`modules/shared` is a leaf kernel.

It is a universal dependency: any module may import shared code at any layer.
Shared code must not reach back into feature modules, app ports, adapters, or
runtime feature flows.

`shared` has no `application/use-cases/` layer.

```txt
modules/shared/
  domain/
    results/
    errors/
    entities/
    services/
  infrastructure/
    ui/
```

Eligible shared code includes:

- `Result` and result helpers.
- Generic shared errors such as `NetworkError` and `ParseError`.
- Truly shared entities.
- Pure shared domain services.
- Generic technical primitives.
- Shared UI primitives and design-system components.

Shared code does not include:

- Shared use cases.
- Feature adapters.
- Feature orchestration.
- Code that fans out into feature modules at runtime.

### Rule Of Two

Do not put code in `shared` speculatively.

Code is born in its owning feature module and moves to `shared` only when a
genuine second consumer appears.

If contexts differ even slightly, prefer duplication over a premature shared
abstraction.

Generic design-system primitives such as `Button`, `Input`, and `Dialog` may be
born directly in `shared/infrastructure/ui/` because they are inherently
cross-cutting.

### Shared Names

Shared UI primitives use plain names:

```tsx
Button
Input
Dialog
Select
```

Avoid:

```tsx
SharedButton
BaseButton
ButtonPrimitive
```

Shared technical primitives also use plain names:

```ts
Result
ok
err
NetworkError
ParseError
```

Avoid:

```ts
SharedResult
CommonError
SharedNetworkError
```

## Result And Errors

The architecture uses a hand-rolled `Result` type instead of an external library.

`Result` lives in `modules/shared/domain/results/` with helpers such as `ok`,
`err`, `isOk`, `isErr`, `map`, `mapErr`, `andThen`, and `match`.

```ts
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

Shared transport errors live in `modules/shared/domain/errors/`:

```ts
export interface NetworkError {
  readonly type: "NetworkError";
  readonly status?: number;
}

export interface ParseError {
  readonly type: "ParseError";
  readonly issues: readonly string[];
}
```

Modules may compose shared errors into operation-specific unions.

When a module needs more detail than a shared error provides, it adds a new
module-owned tagged variant instead of extending or reshaping the shared error.

Errors are returned as values. Boundaries do not throw across the core contract.

## Validation And Invariants

The architecture separates wire validation from domain invariants.

Wire validation:

- Lives in `infrastructure/server/schemas/`.
- Uses schemas to parse `unknown` into DTOs.
- Validates transport shape, required fields, and wire-level formats.

Domain invariants:

- Live in the domain layer.
- Are enforced by pure smart constructors and domain services.
- Represent business rules, valid state transitions, and domain constraints.

Read boundary:

```txt
I/O -> schema.safeParse -> DTO -> mapper -> make<Entity> -> Result<Entity, E>
```

Write boundary:

```txt
use case args -> make<Entity> -> port
```

The same pure domain rules may be reused by UI form validation through the
framework-specific UI layer.

## Permissive Module Interaction

This documentation targets the permissive version of the architecture.

Between two feature modules, direct imports are allowed only from the owner
module's public application surface:

```txt
modules/checkout -> modules/user/application/use-cases/*
```

A feature module must not import another feature module's `domain/**` or
`infrastructure/**`.

The feature-module dependency graph must stay acyclic.

`shared` is the exception: any module may import `modules/shared/**` at any
layer.

This creates two legal cross-module channels:

1. Feature to feature behavior: import the owner's `application/use-cases/`.
2. Shared primitives: import `modules/shared/**`.

Reusable pure domain logic promotes to `shared/domain/services/` by the rule of
two. Reusable UI primitives live in `shared/infrastructure/ui/`.

## Composition

Use cases and adapters are wired with functional dependency injection.

Use cases never construct their own dependencies.

A module may self-wire its own adapters into its own use cases from
infrastructure/UI composition code.

Cross-module dependencies are injected from composition code that is allowed to
see the required modules.

In the permissive architecture, an orchestrating module's infrastructure/UI code
or a root UI shell may import sibling use cases directly and inject them, as long
as the feature-module dependency graph remains acyclic.

## Lint-Enforced Boundaries

The architecture expects import boundaries to be mechanically enforced.

Rules to enforce:

- Feature modules may import another feature module only through
  `application/use-cases/`.
- Feature modules may not import sibling `domain/**` or `infrastructure/**`.
- `modules/shared/**` may be imported from any layer.
- The module dependency graph must be acyclic.
- Domain code must not import framework, I/O, DTO, schema, or adapter code.
- No barrel or `index.ts` facade is used as the public API.

## Documentation Style

Architecture skill descriptions and docs should be self-contained.

Describe the behavior of the architecture directly, including its constraints,
instead of relying on comparison with another architecture variant.

For this permissive variant, the important self-contained statement is:

- Feature modules may import another feature module's public
  `application/use-cases/` surface.
- Feature module internals remain private.
- The feature-module dependency graph must remain acyclic.
- `shared` remains a universal leaf dependency for shared primitives.

## Reference Structure

```txt
src/modules/
  <module>/
    domain/
      entities/
      services/
      constants/
      ports/
    application/
      use-cases/
    infrastructure/
      ui/
      server/
        adapters/
        dtos/
        mappers/
        schemas/
  shared/
    domain/
      results/
      errors/
      entities/
      services/
    infrastructure/
      ui/
```

## Naming Summary

```txt
Entity type:             User
Entity file:             domain/entities/user.ts
Value-like concept:      UserId, Email, Money
Smart constructor:       makeUser
Smart constructor args:  MakeUserArgs
Domain service export:   calculateCartTotal
Domain service file:     domain/services/cart-total.ts
Port type:               FetchUserProfilePort
Port request:            FetchUserProfilePortRequest
Port error:              FetchUserProfilePortError
Use case type:           FetchUserProfileUseCase
Use case factory:        makeFetchUserProfileUseCase
Use case dependencies:   FetchUserProfileDependencies
Use case args:           FetchUserProfileArgs
Adapter:                 makeHttpFetchUserProfileAdapter
Adapter dependencies:    HttpFetchUserProfileAdapterDependencies
DTO:                     UserDto
DTO schema:              userDtoSchema
Mapper:                  transformUserDtoToMakeUserArgs
Shared UI primitive:     Button
Shared primitive:        Result
```
