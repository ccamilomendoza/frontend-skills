# Hexagonal Backend — Permissive: Design Notes

Living notes for the design interview. This file records settled decisions and
questions that must be revisited before the skill is finalized.

## Goal

Create a TypeScript-specific, backend-framework-agnostic counterpart to
`hexagonal-frontend-permissive` with the same functional-first, three-layer,
bounded-context architecture and permissive acyclic cross-module imports.

## Settled decisions

- Keep the per-module `domain/`, `application/`, and `infrastructure/` layers.
- Keep the functional-first model: immutable data, pure domain functions,
  functional dependency injection, and errors represented as `Result` values.
- Keep permissive feature-to-feature imports: a feature may import another
  feature's public `application/use-cases/` surface, but not its `domain/` or
  `infrastructure/`, and the module dependency graph must remain acyclic.
- Make the skill TypeScript-specific while remaining independent of any one
  backend framework.
- Cover every inbound mechanism, including HTTP, message consumers, scheduled
  jobs, WebSockets, and CLI commands.
- Parse every untrusted inbound value at the infrastructure boundary, including
  request bodies, path parameters, query strings, headers, messages, frames,
  job payloads, and CLI arguments.
- Treat data returned through outbound infrastructure as untrusted as well,
  including database rows, cache values, third-party API responses, and broker
  acknowledgements. Parse it before mapping it into domain data.
- Outbound reads follow the boundary pipeline `unknown external data -> schema
  -> DTO or record -> mapper -> domain smart constructor`.
- Keep structural and protocol validation in infrastructure schemas. Keep
  business invariants in domain smart constructors.
- Inbound mappers transform parsed DTOs into application `Args`. Use cases call
  domain smart constructors when creating or changing domain values.
- An inbound adapter owns the complete protocol translation:
  external input parsing, DTO-to-Args mapping, direct use-case invocation, and
  mapping the resulting value or error into the protocol response.
- Domain and application code must not reference framework request/response
  objects, protocol status codes, headers, or other transport details.
- Inbound adapters call use cases directly. Do not add duplicate controller or
  handler-facing inbound port interfaces.
- Explicit `Port` types remain for outbound capabilities such as repositories,
  clocks, mailers, brokers, storage, and external APIs.
- Outbound adapters catch expected exceptions from infrastructure libraries and
  translate them into narrow `Result` error variants.
- Use cases express expected business and operational failures as `Result`
  values, and inbound adapters translate those errors into protocol outcomes.
- Unexpected programming defects do not become variants in every use-case error
  union. One framework-level outer safety boundary logs them and produces the
  mechanism's generic failure outcome.
- Use hybrid composition. Each feature owns its adapter, use-case, handler, and
  registration wiring inside `infrastructure/compositions/`. A minimal
  `src/main/` process root only creates shared runtime resources, invokes module
  composition/registration functions, passes public use-case dependencies
  between modules, and owns process startup and shutdown. Business logic and
  module-specific construction remain inside their modules.
- Finalize `infrastructure/inbound/` and `infrastructure/outbound/` as the
  directional adapter scopes. `inbound/` contains mechanisms that call the
  application; `outbound/` contains implementations of capabilities the
  application calls.
- Use mechanism-first infrastructure organization. Group by boundary mechanism
  or provider first—such as `inbound/http/`,
  `inbound/messaging/`, `outbound/persistence/postgres/`, or
  `outbound/integrations/stripe/`—and only then by artifact type such as
  `handlers/`, `dtos/`, `schemas/`, `mappers/`, `presenters/`, or `adapters/`.
  Create only folders containing real code; do not scaffold empty mechanisms or
  speculatively share DTOs and schemas across different protocols.
- Keep `shared/` as a leaf kernel with no use cases, runtime orchestration,
  feature handlers, feature repositories, or feature-specific adapters.
- Allow `shared/` to contain stable shared domain primitives and pure logic plus
  generic technical foundations such as logging contracts, clocks,
  configuration parsing, HTTP-client foundations, and feature-neutral framework
  utilities. Apply the rule of two except where a primitive is inherently
  cross-cutting.
- Cover transaction boundaries explicitly. A use case decides which operations
  must be atomic, while infrastructure provides the concrete transaction
  mechanism. Domain functions and inbound handlers do not control transactions.
- Prescribe an injected functional transaction runner for multi-operation atomic
  work. The runner opens the concrete transaction and passes the use case a
  bundle of outbound port implementations already bound to that transaction.
  The use case sees business-facing functions, never an ORM client, database
  session, or raw transaction object. Avoid async-local or global transaction
  state.
- A transaction commits only when its callback returns `Result.ok`. It rolls
  back when the callback returns `Result.err` or throws. The runner translates
  expected infrastructure exceptions into `Result` errors after rollback and
  rethrows unexpected defects to the outer safety boundary.
- Inbound infrastructure extracts credentials and performs protocol-specific
  authentication such as JWT signature verification, then maps the verified
  identity into a framework-free application value such as `Actor`. Use cases
  enforce authorization for each operation; reusable pure business
  authorization policies live in domain services.
- Zod is the mandatory schema library for parsing untrusted inbound and outbound
  infrastructure data. Backend frameworks remain interchangeable because the
  core and port contracts never depend on Zod.
- Inbound mappers transform newly supplied or changed request data into
  primitive application `Args`; they do not construct new domain values. The
  use case invokes domain smart constructors so business-invariant failures are
  use-case outcomes. Already-established context such as a verified `Actor` may
  enter as a domain value. Outbound hydration of existing persisted data still
  ends with the adapter invoking domain smart constructors.
- Every public protocol output is mapped to a DTO and validated with Zod before
  leaving an inbound adapter, in every environment. This applies to success and
  public error responses for HTTP, messaging, WebSockets, CLI, and other
  mechanisms. A response-schema mismatch is an unexpected programming defect,
  not a domain or use-case `Result` error.
- Every inbound mechanism uses `handlers/` for the complete parse, input-map,
  use-case invocation, presentation, and emission pipeline. Separate
  mechanism-specific registration folders bind handlers to the runtime:
  `http/routes/`, `messaging/consumers/`, `jobs/schedules/`, and
  `cli/commands/`.
- Require `presenters/` for output-producing handlers. Mappers remain pure,
  total shape transformations: inbound DTO to use-case `Args`, or a successful
  domain/application value to an output DTO. A presenter exhaustively interprets
  the complete use-case `Result`, chooses mechanism-specific semantics, invokes
  the output mapper and Zod schema, and returns a validated protocol outcome.
  The handler only coordinates the pipeline and emits that outcome through the
  concrete framework.
- Name DTOs and schemas explicitly by mechanism and direction, such as
  `CreateOrderHttpRequestDto` / `createOrderHttpRequestDtoSchema`,
  `OrderHttpResponseDto` / `orderHttpResponseDtoSchema`, and
  `OrderCreatedMessageDto` / `orderCreatedMessageDtoSchema`. Mapper names retain
  the `transform<Source>To<Target>` convention and include those explicit type
  names.
- Restrict middleware to mechanism-level technical concerns such as
  authentication, request IDs, tracing, CORS, body limits, and generic logging.
  Middleware must not enforce business authorization, invoke use cases, apply
  domain invariants, replace operation-specific Zod parsing in handlers, or map
  use-case errors. Authentication middleware may reject invalid credentials and
  supply a verified `Actor`; use cases still authorize the operation.
- Forbid framework-specific objects and generic `RequestContext` or
  `ExecutionContext` bags in use cases. Pass each business-relevant value—such
  as `actor`, `tenantId`, or a legally significant locale—explicitly through
  the operation's named `Args`. Keep request IDs, trace spans, client IPs,
  loggers, and concrete request objects in infrastructure unless a specific
  value becomes an explicit business requirement.
- Keep client disconnects, technical timeouts, and `AbortSignal` in
  infrastructure. Request-scoped outbound adapters may be bound to the
  mechanism's cancellation signal; use cases never receive the raw signal or
  request. A deadline enters application `Args` only when the deadline itself
  has business meaning, represented as a domain value.
- Require narrow, operation-specific outbound capability ports such as
  `FetchOrderPort`, `SaveOrderPort`, or `FindOrdersByCustomerPort`. Do not create
  generic CRUD repository base abstractions. Each port declares the precise
  domain inputs, result, and error union required by its consumers.
- Use the `Record` suffix for persistence row/document shapes and `Dto` only for
  external protocol representations. Zod persistence schemas use names such as
  `orderRecordSchema`; persistence mappers use explicit names such as
  `transformOrderRecordToMakeOrderArgs`.
- For mutable aggregates exposed to concurrent read-modify-write operations,
  prescribe optimistic concurrency. Fetches return a framework-neutral revision
  with the aggregate; save ports require the expected revision and adapters
  perform an atomic conditional update. A stale revision returns a tagged
  `ConcurrencyConflict` result. Do not impose revisions on immutable,
  append-only, or otherwise concurrency-safe data.
- Let absence semantics follow the port's intent. A required `Fetch...Port`
  returns a tagged `...NotFound` error; an optional `Find...Port` returns a
  successful nullable value; collection searches return a successful empty
  collection. Protocol presenters map those outcomes independently—for example,
  an HTTP presenter normally maps required-resource `NotFound` to `404`, not
  `204`.
- Cover domain events and the transactional outbox as an optional advanced
  pattern, not a mandatory architectural rule. `SKILL.md` should contain only a
  small pointer; `REFERENCE.md` should explain immutable domain-event values,
  atomic aggregate-plus-outbox persistence, infrastructure publication,
  retries, and idempotent consumption in detail.
- Message presenters exhaustively translate each use-case `Result` into an
  abstract `Acknowledge`, `Retry`, or `Reject` outcome. Framework-specific
  consumers apply that outcome using broker APIs such as acknowledgments,
  negative acknowledgments, offset commits, visibility changes, or dead-letter
  routing. Use cases never reference brokers or delivery mechanics.

## Interview status

Completed on 2026-07-27. Hybrid module-owned composition was finalized on
2026-07-28, followed by the `inbound/` and `outbound/` names and mechanism-first
organization. No architectural review questions remain. Smaller operational and
tooling conventions are intentionally deferred until concrete usage reveals a
need. The architecture is ready to draft as a skill.
