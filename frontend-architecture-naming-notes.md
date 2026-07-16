# Frontend Architecture Naming — Working Notes

> Working document capturing naming decisions for the functional-first,
> hexagonal frontend architecture skills. Built incrementally via a grilling
> session. Open or parked questions are called out explicitly so the discussion
> can resume without losing context.

## Goal

Define a consistent naming vocabulary for the concepts inside the architecture:
ports, use cases, args, dependencies, adapters, DTOs, schemas, mappers,
errors, entities, domain services, smart constructors, and shared primitives.

This pass currently targets the permissive hexagonal frontend skill, but most
decisions are core architecture vocabulary and can be applied to the strict skill
too unless a later decision says otherwise.

## Decisions So Far

### Entities

**N14 — Domain entities use plain domain nouns** ✅ DECIDED
- Domain entity types do NOT use an `Entity` suffix.
- The `domain/entities/` folder already communicates the architectural role; the
  type name should stay in the ubiquitous language of the domain.
- Preferred:
  ```ts
  export interface User {
    readonly id: UserId;
    readonly email: Email;
  }

  export interface Receipt {
    readonly id: ReceiptId;
    readonly orderId: OrderId;
    readonly charged: Money;
  }

  export interface Cart {
    readonly id: CartId;
    readonly items: readonly CartItem[];
  }
  ```
- Avoid:
  ```ts
  UserEntity
  ReceiptEntity
  CartEntity
  ```
- File convention:
  ```txt
  domain/entities/user.ts      -> User
  domain/entities/receipt.ts   -> Receipt
  domain/entities/cart.ts      -> Cart
  ```

**N15 — Entity files are singular** ✅ DECIDED
- The folder remains plural because it is the concept bucket:
  `domain/entities/`.
- Each entity file is singular and matches the single exported entity name.
- Preferred:
  ```txt
  domain/entities/user.ts       -> User
  domain/entities/receipt.ts    -> Receipt
  domain/entities/cart.ts       -> Cart
  domain/entities/cart-item.ts  -> CartItem
  ```
- Avoid:
  ```txt
  domain/entities/users.ts
  domain/entities/receipts.ts
  domain/entities/carts.ts
  ```

**N16 — Entity attributes are readonly** ✅ DECIDED
- Every field on a domain entity is `readonly`.
- Collections must also be immutable:
  ```ts
  export interface Cart {
    readonly id: CartId;
    readonly items: readonly CartItem[];
  }
  ```
- Entity changes are represented by returning a new entity value from a pure
  domain function/service, not by mutating the existing object.
- Pattern:
  ```ts
  export const renameUser = (user: User, name: UserName): User => ({
    ...user,
    name,
  });
  ```
- Rationale: this makes state transitions explicit, avoids accidental shared
  mutation, fits React state/cache updates, and matches the functional-first
  architecture.

**N17 — Entities are declared as interfaces** ✅ DECIDED
- Object-shaped domain entities are declared with `interface`, not `type`.
- Preferred:
  ```ts
  export interface User {
    readonly id: UserId;
    readonly email: Email;
  }
  ```
- Avoid:
  ```ts
  export type User = {
    readonly id: UserId;
    readonly email: Email;
  };
  ```
- Rationale: `interface` makes object-shaped domain models visually distinct
  from unions, aliases, and function types, which remain `type`s.

**N18 — Entities contain no methods** ✅ DECIDED
- Domain entities are immutable data only.
- Do not attach behavior as methods, and do not use classes or `this`.
- Preferred:
  ```ts
  export interface User {
    readonly id: UserId;
    readonly email: Email;
  }

  export const renameUser = (user: User, email: Email): User => ({
    ...user,
    email,
  });
  ```
- Avoid:
  ```ts
  export interface User {
    readonly id: UserId;
    readonly email: Email;
    rename(email: Email): User;
  }
  ```
- Rationale: behavior belongs in pure domain functions/services, keeping
  entities serializable, easy to compare, and free of hidden runtime state.

**N19 — Value-like domain concepts also live in `entities/`** ✅ DECIDED
- Do not introduce a separate `value-objects/` concept for now.
- Value-like domain concepts such as `Email`, `Money`, `UserId`, `OrderId`, and
  `DateRange` live in `domain/entities/` alongside larger domain entities.
- Their semantic difference is expressed by their names, invariants, and pure
  constructor/functions, not by a different architectural folder.
- Preferred:
  ```txt
  domain/entities/user.ts       -> User
  domain/entities/email.ts      -> Email
  domain/entities/money.ts      -> Money
  domain/entities/order-id.ts   -> OrderId
  ```
- Pattern:
  ```ts
  export interface Email {
    readonly value: string;
  }

  export const makeEmail = (value: string): Result<Email, EmailError> => {
    // validate and normalize email
  };
  ```
- Rationale: this keeps the architecture vocabulary smaller. `User` and
  `Email` are both immutable domain data, while behavior remains in pure
  functions/services around those data shapes.

**N20 — Scalar domain concepts are readonly object interfaces** ✅ DECIDED
- IDs and other scalar-like domain concepts are still modeled as readonly object
  interfaces, not branded primitive aliases.
- Their fields follow the same readonly rule as every other entity.
- Preferred:
  ```ts
  export interface UserId {
    readonly value: string;
  }

  export interface OrderId {
    readonly value: string;
  }

  export interface Email {
    readonly value: string;
  }
  ```
- Avoid:
  ```ts
  export type UserId = string & { readonly __brand: "UserId" };
  export type OrderId = string & { readonly __brand: "OrderId" };
  ```
- Rationale: object interfaces keep all domain entities visually and
  structurally consistent, avoid TypeScript branding ceremony, and leave room
  for future metadata or normalized fields without changing the broad modeling
  style.

### Domain Services

**N21 — Domain services do not use a `Service` suffix** ✅ DECIDED
- Functions in `domain/services/` are named as plain domain behavior.
- The folder communicates the architectural concept; the exported functions
  should stay in the ubiquitous language of the domain.
- Service files are named by cohesive behavior group, not necessarily by the
  exact exported function name.
- Preferred:
  ```ts
  // domain/services/checkout-eligibility.ts
  export const canCheckout = (cart: Cart, wallet: Wallet): boolean => {
    // pure domain logic
  };

  // domain/services/payment-risk.ts
  export const assessPaymentRisk = (payment: Payment): PaymentRisk => {
    // pure domain logic
  };

  // domain/services/cart-total.ts
  export const calculateCartItemTotal = (item: CartItem): Money => {
    // pure domain logic
  };

  export const calculateCartTotal = (cart: Cart): Money => {
    // pure domain logic
  };
  ```
- Avoid:
  ```ts
  domain/services/cart-service.ts
  domain/services/calculate-cart-total.ts
  CheckoutEligibilityService
  CartTotalService
  PaymentRiskService
  ```
- Rationale: in this functional architecture, a domain service is not an
  object/class role. It is pure domain behavior grouped under
  `domain/services/`, so the exported name should read like the business
  operation itself. Behavior-group file names keep cohesive pure functions
  together without falling back to vague `*-service.ts` buckets.

### Smart Constructors

**N22 — Smart constructors use `make<Entity>`** ✅ DECIDED
- Pure domain constructors that enforce invariants use the `make<Entity>` naming
  convention.
- `make` is reserved for pure domain construction and validation. It does not
  imply persistence, network I/O, or creating a record in an external system.
- When a smart constructor needs an object parameter, name that parameter type
  `Make<Entity>Args`.
- Preferred:
  ```ts
  export const makeEmail = (value: string): Result<Email, EmailError> => {
    // validate and normalize email
  };

  export const makeMoney = (
    args: MakeMoneyArgs,
  ): Result<Money, MoneyError> => {
    // validate amount/currency invariants
  };

  export const makeUser = (args: MakeUserArgs): Result<User, UserError> => {
    // validate user invariants
  };
  ```
- Reserve `create...` for application/use-case language when the operation
  creates something in the system:
  ```ts
  CreateUserUseCase
  makeCreateUserUseCase
  ```
- Specialized conversion names are allowed when the source/operation matters:
  ```ts
  parseEmail(raw)
  moneyFromCents(cents)
  toUser(dto)
  ```
- Rationale: `make` reads as pure functional construction, while `create` is
  more naturally associated with application workflows, side effects, or
  persistence. `Args` keeps the domain constructor vocabulary aligned with
  general function/use-case vocabulary and avoids reserving `Input` for domain
  concepts when it may be useful for UI or raw inbound data.

### Ports

**N1 — Domain ports use the `Port` suffix** ✅ DECIDED
- Every type in `domain/ports/` that represents an external capability required
  by the core MUST end with `Port`.
- Examples:
  ```ts
  FetchUsersPort
  FetchUserProfilePort
  SaveUserPort
  ChargePaymentPort
  HasProcessedPaymentPort
  GetCurrentSessionPort
  GetCurrentTimePort
  ```
- Avoid architecture-ambiguous names for ports:
  ```ts
  UserRepository
  PaymentGateway
  Clock
  SessionService
  ```
- Rationale: `Port` says "required by the core, implemented outside" while
  repository/gateway/service/clock names drift into implementation-pattern
  vocabulary.

**N2 — Ports are callable function types** ✅ DECIDED
- A port is a callable function type, not an object interface with methods.
- Preferred:
  ```ts
  export type FetchUserProfilePort = (
    request: FetchUserProfilePortRequest,
  ) => Promise<Result<UserProfile, FetchUserProfilePortError>>;
  ```
- Avoid:
  ```ts
  export interface FetchUserProfilePort {
    fetch(request: FetchUserProfilePortRequest): Promise<Result<UserProfile, E>>;
  }
  ```
- This keeps use cases direct and functional:
  ```ts
  dependencies.fetchUserProfile({ userId: args.userId });
  ```

**N3 — Every port receives one `PortRequest` object** ✅ DECIDED
- A port ALWAYS receives a single request object, even when the request has only
  one field.
- Pattern:
  ```ts
  export interface FetchUserProfilePortRequest {
    readonly userId: UserId;
  }

  export type FetchUserProfilePort = (
    request: FetchUserProfilePortRequest,
  ) => Promise<Result<UserProfile, FetchUserProfilePortError>>;
  ```
- Rationale: one shape for all ports; no positional ambiguity; adding a new
  parameter is non-disruptive to call sites that already pass an object.

**N4 — Port errors use the `PortError` suffix** ✅ DECIDED
- Every port error union uses the `PortError` suffix.
- A `PortError` represents errors that can come from an external capability
  required by the domain/application core.
- Use cases may reuse port errors directly or compose them into broader
  operation-level error unions.
- Preferred:
  ```ts
  export type FetchUserProfilePortError =
    | NetworkError
    | ParseError
    | { readonly type: "UserProfileNotFound"; readonly userId: UserId };

  export type ChargePaymentPortError =
    | NetworkError
    | { readonly type: "PaymentRejected"; readonly reason: string };

  export type FetchUserProfileError = FetchUserProfilePortError;

  export type ProcessPaymentError =
    | ChargePaymentPortError
    | { readonly type: "AlreadyProcessedPayment"; readonly orderId: OrderId };
  ```
- Avoid:
  ```ts
  FetchUserProfileError // when naming the port boundary error directly
  ChargePaymentError // when naming the port boundary error directly
  FetchUserProfileAdapterError
  ```
- Rationale: `PortError` distinguishes "error from this external capability"
  from "error from this application operation." That lets use-case errors stay
  focused on application behavior while still composing port boundary failures.

### Infrastructure Adapters

**N23 — Port implementations use an `Adapter` suffix** ✅ DECIDED
- Infrastructure implementations of domain ports use the `Adapter` suffix.
- The name should include the concrete technology/source plus the capability
  being implemented.
- Use a `make...Adapter` factory only when the adapter needs stable
  infrastructure dependencies to close over, such as an HTTP client, SDK client,
  storage implementation, or runtime configuration.
- When an adapter has no dependencies, export the adapter function directly.
- Preferred:
  ```ts
  export const makeStripeChargePaymentAdapter =
    (dependencies: StripeChargePaymentAdapterDependencies): ChargePaymentPort =>
    async (request) => {
      // use dependencies.stripeClient
    };

  export const makeHttpFetchUserProfileAdapter =
    (dependencies: HttpFetchUserProfileAdapterDependencies): FetchUserProfilePort =>
    async (request) => {
      // use dependencies.httpClient
    };

  export const getCurrentTimeAdapter: GetCurrentTimePort = () =>
    ok(new Date());
  ```
- Avoid:
  ```ts
  makeStripeChargePayment
  makeHttpFetchUserProfile
  makeLocalStorageSaveSession
  makeGetCurrentTimeAdapter // no dependencies to bind
  ```
- Rationale: ports use the `Port` suffix on the domain side of the boundary, so
  adapter implementations should make the infrastructure side equally visible.
  The `make...Adapter` prefix is meaningful only when the adapter is being
  configured with real dependencies; otherwise a direct adapter function is
  simpler and more honest.

### DTOs

**N24 — Wire shapes use a `Dto` suffix** ✅ DECIDED
- Raw external/wire shapes in `infrastructure/server/dtos/` use the `Dto`
  suffix.
- Use `Dto`, not `DTO`, so composed TypeScript names stay readable.
- DTO names are PascalCase and singular per shape.
- Preferred:
  ```ts
  export interface UserDto {
    readonly id: string;
    readonly email: string;
  }

  export interface ReceiptDto {
    readonly id: string;
    readonly chargedAmount: number;
  }

  export interface FetchUsersResponseDto {
    readonly users: readonly UserDto[];
  }
  ```
- Avoid:
  ```ts
  UserDTO
  ReceiptDTO
  FetchUsersResponseDTO
  UserResponse // too ambiguous: response DTO, domain response, or use-case result?
  ```
- Rationale: `Dto` makes raw transport shapes visibly different from domain
  entities while keeping naming ergonomic in composed names such as
  `UserDtoSchema`.

### Schemas

**N25 — DTO schemas use camelCase names ending in `DtoSchema`** ✅ DECIDED
- Runtime validation schemas for DTOs mirror the DTO name and end with
  `DtoSchema`.
- Schemas are runtime values, so they use camelCase even though the DTO type is
  PascalCase.
- Preferred:
  ```ts
  export const userDtoSchema = z.object({
    id: z.string(),
    email: z.string(),
  }) satisfies z.ZodType<UserDto>;

  export const fetchUsersResponseDtoSchema = z.object({
    users: z.array(userDtoSchema),
  }) satisfies z.ZodType<FetchUsersResponseDto>;
  ```
- Avoid:
  ```ts
  UserDtoSchema // runtime value should not be PascalCase
  userSchema // hides that the schema validates a DTO, not a domain User
  parseUserDtoSchema // mixes parser/action naming with schema naming
  ```
- Rationale: `DtoSchema` keeps the validated shape explicit at the
  infrastructure boundary, while camelCase reflects that schemas are values.

### Mappers

**N26 — Mapper functions use `transform<Source>To<Target>`** ✅ DECIDED
- Pure mapper functions in `infrastructure/server/mappers/` use the
  `transform<Source>To<Target>` naming pattern.
- The function name should make both the source shape and target shape explicit.
- This applies in both directions when a module needs inbound and outbound
  transformations.
- Mapper files are named by the transformation pair.
- Preferred:
  ```ts
  // infrastructure/server/mappers/user-dto-to-user.ts
  export const transformUserDtoToUser = (
    dto: UserDto,
  ): Result<User, UserError> => {
    // DTO -> domain, usually through smart constructors
  };

  // infrastructure/server/mappers/user-to-user-dto.ts
  export const transformUserToUserDto = (user: User): UserDto => {
    // domain -> DTO
  };
  ```
- Avoid:
  ```ts
  toUser
  fromUserDto
  mapUserDtoToUser
  userDtoMapper
  transformUser // source/target unclear
  ```
- Rationale: mapper functions sit at a costly boundary where ambiguity causes
  bugs. The longer `transform<Source>To<Target>` name makes adapter pipelines
  self-documenting and works symmetrically for inbound and outbound mapping.

### Shared UI Primitives

**N27 — Shared UI primitives use plain component names** ✅ DECIDED
- Reusable UI primitives in `shared/infrastructure/ui/` use plain component
  names.
- Do not add architectural/context suffixes or prefixes to component names.
- Preferred:
  ```tsx
  Button
  Input
  Dialog
  Select
  ```
- Avoid:
  ```tsx
  SharedButton
  BaseButton
  ButtonPrimitive
  ```
- Rationale: the folder already communicates that these are shared UI
  primitives. Plain component names keep call sites ergonomic and avoid leaking
  architecture vocabulary into JSX.

### Shared Technical Primitives

**N28 — Shared technical primitives use plain names** ✅ DECIDED
- Shared technical/domain primitives under `shared/` use plain names.
- Do not add `Shared` or `Common` prefixes just because a primitive is reusable.
- Preferred:
  ```ts
  Result
  ok
  err
  NetworkError
  ParseError
  NonEmptyString
  ```
- Avoid:
  ```ts
  SharedResult
  CommonError
  SharedNetworkError
  CommonNonEmptyString
  ```
- Rationale: the `shared/` folder already communicates reuse. Plain names keep
  foundational primitives readable and avoid spreading architecture prefixes
  throughout domain/application code.

### Use Cases

**N5 — Use case callable/factory keeps the `UseCase` suffix** ✅ DECIDED
- Use cases remain the public application-layer behavior surface.
- The exported callable type and factory include `UseCase`.
- Pattern:
  ```ts
  export type ProcessPaymentUseCase = /* ... */;

  export const makeProcessPaymentUseCase: ProcessPaymentUseCase = /* ... */;
  ```
- `UseCase` is NOT repeated on supporting types such as dependencies or args.

**N6 — Supporting use case types use `Dependencies` and `Args`** ✅ DECIDED
- Use:
  ```ts
  ProcessPaymentDependencies
  ProcessPaymentArgs
  FetchUserProfileDependencies
  FetchUserProfileArgs
  ```
- Avoid:
  ```ts
  ProcessPaymentUseCaseDeps
  ProcessPaymentUseCaseInput
  ProcessPaymentRequest
  ProcessPaymentDeps
  ProcessPaymentCommand
  ProcessPaymentPayload
  ProcessPaymentContext
  ```
- Rationale:
  - `Dependencies` is explicit and avoids abbreviation in exported names.
  - `Args` is neutral function vocabulary and avoids the HTTP-flavored meaning
    of `Request`.
  - `UseCase` is already present on the callable/factory and does not need to be
    repeated everywhere.

**N7 — Do not add `QueryUseCase` / `MutationUseCase` by default** ✅ DECIDED
- Use the operation verb plus `UseCase`.
- Preferred:
  ```ts
  FetchUserProfileUseCase
  FetchUsersUseCase
  FetchProductsUseCase
  ProcessPaymentUseCase
  UpdateUserEmailUseCase
  ```
- Query use cases should use the same `Fetch...` verb as their ports:
  ```ts
  FetchUserProfilePort
  FetchUserProfileUseCase
  ```
- Avoid redundant names when the verb already communicates query/mutation:
  ```ts
  FetchUserProfileQueryUseCase
  ProcessPaymentMutationUseCase
  ```
- If the operation kind is ambiguous, rename the verb instead of adding
  `QueryUseCase` or `MutationUseCase`.

**N8 — Query and mutation use cases have different callable shapes** ✅ DECIDED
- Queries and mutations share the same naming surface (`UseCase`,
  `Dependencies`, `Args`), but their callable shapes differ because their UI
  execution models differ.
- Query use cases bind the args at construction time and return a no-argument
  thunk. This supports passing the returned function directly to
  `@tanstack/react-query`'s `queryFn`.
- Mutation use cases bind stable dependencies at construction time and return a
  args-taking function. This supports passing the returned function to
  `@tanstack/react-query`'s `mutationFn`, where variables are provided later by
  `mutate` / `mutateAsync`.

**N9 — Query use case `args` lives inside `Dependencies`** ✅ DECIDED
- Query use cases include `args` in the builder/dependencies object.
- Pattern:
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
- Rationale: this makes infrastructure/UI composition clean:
  ```ts
  useQuery({
    queryKey,
    queryFn: makeFetchUserProfileUseCase({
      fetchUserProfile,
      args: { userId },
    }),
  });
  ```

**N10 — Mutation use case args are passed at execution time** ✅ DECIDED
- Mutation use cases do NOT include `args` in `Dependencies`.
- Pattern:
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
- Rationale: the mutation args vary per invocation and map naturally to
  React Query mutation variables.

**N12 — Use cases may orchestrate pure domain services** ✅ DECIDED
- A use case does not need a port to be a use case.
- When feature-specific acceptance criteria require coordinating several pure
  domain functions or domain services, that coordination belongs in
  `application/use-cases/`.
- The pure reusable logic still belongs in `domain/services/`; the use case
  imports those services and arranges them for one feature workflow.
- Do not add `CoordinationUseCase`, `OrchestrationUseCase`, `QueryUseCase`, or
  `MutationUseCase` suffixes. Name the use case by the business operation.
- Pattern:
  ```ts
  // domain/services/checkout-eligibility.ts
  export const canCheckout = (cart: Cart, wallet: Wallet): boolean =>
    wallet.balance >= cart.total;

  export const calculateCheckoutTotal = (cart: Cart): Money =>
    cart.items.reduce(addLineTotal, zeroMoney);
  ```

  ```ts
  // application/use-cases/prepare-checkout.ts
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
- Rationale: the domain service is reusable, feature-agnostic business logic.
  The use case is the application entry point that composes that logic for a
  concrete user/application workflow.

**N13 — Zero-dependency use cases are direct functions** ✅ DECIDED
- When a use case only coordinates imported pure domain services/functions and
  has no injected dependencies, export it as a direct function.
- Do not create a no-op `Dependencies` type or a no-dependency
  `make...UseCase` factory just for uniformity.
- Preferred:
  ```ts
  export type PrepareCheckoutUseCase = (
    args: PrepareCheckoutArgs,
  ) => Result<PreparedCheckout, PrepareCheckoutError>;

  export const prepareCheckoutUseCase: PrepareCheckoutUseCase = (args) => {
    // coordinate pure domain services here
  };
  ```
- Avoid:
  ```ts
  export interface PrepareCheckoutDependencies {}

  export const makePrepareCheckoutUseCase =
    (_dependencies: PrepareCheckoutDependencies) =>
    (args: PrepareCheckoutArgs) => {
      // coordinate pure domain services here
    };
  ```
- Rationale: direct functions make the absence of external dependencies honest.
  The `make...UseCase` factory is reserved for use cases that bind real injected
  dependencies such as ports or other use cases.

### Args Ownership

**N11 — Use case args reuse port requests when the shape matches** ✅ DECIDED
- When use case args have the same shape as the port request they delegate
  to, reuse the port request type.
- If the use case needs application-only fields, define a named use case
  args type that extends the port request.
- Preferred for identical shapes:
  ```ts
  export type FetchUserProfileArgs = FetchUserProfilePortRequest;

  dependencies.fetchUserProfile(dependencies.args);
  ```
- Preferred when the use case needs more than the port needs:
  ```ts
  export interface FetchUserProfileArgs extends FetchUserProfilePortRequest {
    readonly includePermissions: boolean;
  }

  dependencies.fetchUserProfile(dependencies.args);
  ```
- Rationale: the port request already names the required external-capability
  shape. Reusing it avoids duplicate args interfaces that drift while still
  allowing the use case to add fields when the application behavior needs them.

## Current Locked Vocabulary

```ts
// domain/ports/fetch-user-profile-port.ts
export interface FetchUserProfilePortRequest {
  readonly userId: UserId;
}

export type FetchUserProfilePort = (
  request: FetchUserProfilePortRequest,
) => Promise<Result<UserProfile, FetchUserProfilePortError>>;
```

```ts
// application/use-cases/fetch-user-profile.ts
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

```ts
// application/use-cases/process-payment.ts
export interface ProcessPaymentArgs {
  readonly orderId: OrderId;
  readonly amount: Money;
}

export interface ProcessPaymentDependencies {
  readonly chargePayment: ChargePaymentPort;
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

## Next Up

Sync the locked naming decisions into the hexagonal frontend skill docs and
examples.
