# Frontend Architecture Skill — Working Notes

> Working document capturing decisions made while designing a Cursor skill for a
> functional-first, hexagonal frontend architecture. Built incrementally via a
> grilling session. Open questions are parked explicitly so we can resume.

> **TWO SKILLS planned (see D12).** Both share the same core architecture
> (D1–D5, use cases, functional DI, D9 folders, D10 boundaries, D13 composition).
> They differ ONLY in the module-interaction rule:
> - **Skill 1 — Strict:** no cross-module imports; invert via a port in
>   `modules/shared` (D8).
> - **Skill 2 — Permissive:** modules may import another module's PUBLIC surface
>   (`use-cases/`) directly; `shared` stays primitives-only (Mode B / D11).

## Goal

Create a Cursor Agent Skill that encodes **my own** opinionated take on a
**hexagonal (ports & adapters) architecture** for **frontend development**,
following a **functional programming** approach (everything as a function where
possible).

## Architecture Overview

Three layers:

1. **Domain** — entities, services (how outer layers interact with domain
   entities / external systems), and "domain rules" (validations, constants, and
   business logic that belong to the business domain).
2. **Application** — "use cases": controller-like coordinators that orchestrate
   the domain to satisfy the acceptance criteria of a specific feature.
3. **Infrastructure** — all framework-specific concerns (e.g. React and
   other library/framework details), adapters, etc.

Cross-cutting principle: **functional-first** — prefer pure functions; avoid
classes/`this`/mutation where possible.

---

## Decisions So Far

### Domain Layer

**D1 — Entity representation** ✅ DECIDED
- Entities are plain immutable **data**, behavior lives in **free functions**
  (Option A from the grilling). No methods, no `this`, no closures-as-objects,
  no classes.
- Entities MUST be declared as **`interface`s**, not `type` aliases.
- Entity fields are `readonly`.
- All entity behavior is implemented as **pure functions** (no side effects, no
  mutation; return new objects).

**D2 — Ports = the interface/contract concept** ✅ DECIDED *(SUPERSEDED by D30: the "service = port" alias is RETIRED; the concept is now just called a "port")*
- ~~In this architecture's vocabulary, a **"service" = a port**~~ (alias dropped).
- A **port** is an `interface` declaring a contract the domain needs from the
  outside world (e.g. a repository, a clock, an external system gateway).
  Interfaces only — no implementation in the domain. Infra provides the concrete
  adapter. Folder: `domain/ports/` (D28).
**D3 — Domain services = concrete pure functions in the domain** ✅ DECIDED
- Pure multi-entity business logic (Option B) is included as a distinct named
  concept, implemented as **concrete pure functions directly in the domain
  layer** — NOT as interfaces. There is no external dependency to invert, so no
  port is needed.
- Naming: ✅ RESOLVED by D30 — the concept is named **`services/`** (DDD "domain
  services"), i.e. `domain/services/`. (D3 had wanted it kept distinct from the
  word "service"; D30 reverses that since "service = port" is retired.)
- Guiding principle established:
  - **interface/port** ⇔ there is I/O or a framework on the other side (invert
    the dependency; implement in infra).
  - **pure logic** ⇒ implement it directly in the domain (entity behavior =
    single entity; domain service = spans multiple entities).
- Boundary vs. application: a domain service stays pure; the moment it needs to
  fetch/persist/call something it becomes a **use case** that depends on a port.

**D4 — Unify single- and multi-entity pure logic into ONE concept** ✅ DECIDED
- No separation between single-entity behavior and multi-entity logic. There is
  ONE bucket of pure domain functions (Option 2). Reasons: avoids
  classification bikeshedding and refactor churn when a function's entity-arity
  changes.
- The user also stated they conceptually equate "domain rules" with this
  unified pure-logic concept.

**D5 — Domain layer taxonomy (reconciled)** ✅ DECIDED (names resolved by D30/D29)
The domain layer contains exactly:
1. **Entities** — `interface`s, `readonly` fields; behavior via pure functions.
2. **Domain logic** — ONE unified set of pure functions (single + multi entity).
   (User's "domain rules" / "domain services" collapse into this.)
   → NAMED `services/` by D30 (`domain/services/`).
3. **Constants** — business constants live in the domain. → `domain/constants/`.
4. **Ports** — `interface`s, implemented in infra. → `domain/ports/` (D28).
- Folder NAMES now resolved: `entities/`, `services/`, `constants/`, `ports/`
  (all plural per D29).

**D6 — Modular ("vertical slice") architecture** ✅ DECIDED (details TBD)
- Code is split into **modules**; each module contains all 3 hexagonal layers
  (domain / application / infrastructure). Example: a `user` module has its own
  domain, application, and infrastructure.
- **Rule: no cross-module imports.** e.g. `user` MUST NOT import from `payments`.
- **`shared` module:** any entity, function, use case, or infra adapter used by
  **2+ modules** must live in `shared`.
  - ⚠️ AMENDED by D34: "use case" and "feature infra adapter" are REMOVED from the
    shared-eligible list. `shared` is a LEAF KERNEL with no runtime fan-out — no
    use cases, no feature adapters. Use cases needed by 2+ modules are resolved by
    OWNERSHIP (owner module + consumption), never by moving to `shared`.
- Open module questions to resolve (grilling next):
  - Module granularity (bounded context vs. entity vs. feature)?
  - How do modules interact if they can't import each other (the big one)?
  - Does `shared` also follow the 3-layer structure? How to stop it becoming a
    dumping ground?
  - Where is the composition root / dependency wiring?

**D7 — Module granularity = bounded context** ✅ DECIDED
- A module is a **bounded context / business capability** (Option A), e.g.
  `user`, `payments`, `catalog`, `checkout`. Coarse-grained; few modules.
- Shared-vs-duplicate policy for entities that appear in multiple contexts:
  - If genuinely identical and shared → put it in `shared`.
  - **If there are even small differences, PREFER duplicating the entity inside
    each module** with its own context-specific shape, even at the cost of
    duplicated attributes. (Same real-world concept, different model per
    bounded context — avoid a wrong shared abstraction.)

**D8 — Inter-module interaction = Option D (app layer + shared contracts)** ✅ DECIDED
- **Structural composition:** a distinct top-level **`app` layer** (NOT a feature
  module) is the only place allowed to import multiple modules' public APIs and
  wire/orchestrate whole flows. It holds the **composition root** + React
  wiring (routing, pages, DI provider).
- **Runtime inversion:** when module X genuinely needs module Y's behavior at
  runtime, the **port `interface` lives in `shared`**; X depends only on the
  shared port; Y provides an adapter implementing it; the composition root binds
  them. Modules never import each other.
- Event bus reserved for fire-and-forget notifications only (not core flows).
- **Functional DI:** use cases & adapters are `make…` factory functions using
  partial application to inject deps (no classes / `this`).
- **Module public API:** each module exposes a curated `index.ts` barrel as its
  ONLY legal entry point; internals stay private so the `app` layer can't reach
  into module guts.
- A worked React/TypeScript example (user + payments + checkout, with
  `CurrentUserGateway` in `shared`) was produced during grilling and validated
  by the user.

**D9 — Concept-type folders + `shared` location** ✅ DECIDED
- **Every file lives in a folder named after its concept** (pluralized):
  `entities/`, `use-cases/`, `ports/`, `adapters/`, `constants/`, etc. No files
  loose at a layer root. Applies to all layers and modules. (Plural naming
  CONFIRMED strict-plural-always by D29 — including `results/`, `errors/`.)
- **`shared` lives inside `modules/`** → `modules/shared` (chosen for
  uniformity: all module-shaped folders in one place; import rule becomes
  "a module imports only itself and `shared`"). Supersedes the earlier
  top-level-`shared` recommendation.

**D10 — Public API via lint-enforced boundaries (no barrel)** ✅ DECIDED
- No barrel/`index.ts` façade. The public surface = what the folder convention
  exposes: outsiders (the `app` layer) may import ONLY from a module's
  `use-cases/` and its shared-port `adapters/`. Everything else (entities,
  ports, domain logic) is private.
- Enforced mechanically with **ESLint** (`no-restricted-imports` /
  `eslint-plugin-boundaries`): forbids importing `modules/*/domain/**` (and
  other internals) from outside the owning module, and forbids any
  `modules/X → modules/Y` import.

**D11 — Two interaction MODES being designed (decision pending)**
- The skill is exploring TWO branches for module interaction:
  - **Mode A — strict isolation (D8):** no cross-module imports; cross-module
    needs inverted through a port in `modules/shared`; app layer composes.
  - **Mode B — cross-module imports allowed (exploring now):** modules may
    import another module's PUBLIC surface (use-cases) directly. Consequences:
    the `shared` port contract becomes unnecessary (the depending module imports
    the source module's use-case TYPE directly), `shared` shrinks to pure
    primitives, BUT cycle risk appears (must impose a module DAG) and bounded
    contexts couple more tightly.
- OPEN: does the final skill mandate Mode A, Mode B, or present both as
  selectable modes? (And if B, restrict imports to public surface only?)

**D12 — Split into TWO skills** ✅ DECIDED
- Produce two separate skills from the two branches: Skill 1 (strict, no
  cross-module imports) and Skill 2 (permissive, cross-module imports allowed).
  Shared core; only the module-interaction rule differs.

**D13 — Composition: self-wire own adapters, inject across boundaries** ✅ DECIDED
- Applies to BOTH skills. Functional DI means use cases never construct their
  own deps.
- A module MAY self-wire its OWN adapters (e.g. `payments` infra bootstrap plugs
  its own Stripe adapter into its own use case).
- Anything crossing a module boundary (or any core↔infra choice the shell wants
  to control) MUST be injected from a layer that is allowed to see multiple
  modules (see D14 for WHERE that lives).
- Pattern: modules expose `bootstrap…` factories / hooks that RECEIVE external
  deps (cross-module deps + config) and internally wire their own adapters.

**D14 — Composition lives IN the infrastructure layer (UI), not a separate app layer** ✅ DECIDED
- There is NO separate top-level `app` layer as a distinct concept. The
  "composition root" responsibilities — (a) create concrete adapters, (b) inject
  them, (c) choose which concrete implementation to use — live in the
  **infrastructure layer**, specifically the **React UI: components, containers,
  hooks**.
- Binding pattern: a hook/container constructs the use case with its concrete
  adapters and exposes a ready-to-call function to components (e.g.
  `useProcessPayment()` builds `processPayment` from adapters and returns it).
  This replaces the earlier `ServicesProvider`/global-root sketch.
- This reframes D8's "app layer": composition is infra/UI, consistent across
  both skills.
- OPEN (D15): WHERE cross-module composition lives now that composition = infra.
  A feature module's hook cannot construct another module's use case (needs the
  other module's adapters → cross-module knowledge; forbidden in Skill 1). So a
  cross-module composition point that is allowed to see multiple modules is still
  needed — candidate: a **root infrastructure/UI shell** (the React app root)
  that fills shared DI contexts/tokens defined in `modules/shared`, which module
  hooks then read. To be grilled next.

**D15 — Cross-module composition = root UI shell + `shared` DI contexts** ✅ DECIDED
- Chosen Option A. Composition is split by scope, both inside infra/UI:
  - **Module-local composition:** each module's own hooks wire that module's
    use cases with its own adapters.
  - **Cross-module composition:** a **root UI shell** (outermost infra; the only
    place allowed to import multiple modules) supplies cross-module deps.
- Per-skill difference:
  - **Skill 1 (strict):** `modules/shared` defines a React DI context/token per
    cross-module port; the root shell fills each context with the providing
    module's adapter; consuming module hooks read from the shared context (so
    they depend only on `shared`, never on a sibling module).
  - **Skill 2 (permissive):** the root shell (or an orchestrating module's hook)
    imports sibling use cases directly and injects them; no shared context
    needed.

---

**D18 — Boundary validation lives in the FAT ADAPTER (use case does NOT validate on reads)** ✅ DECIDED (⚠️ CLARIFIED by D36)
- (Supersedes an earlier draft where the *use case* owned validation via an
  injected parser — that draft was explored and then reverted by the user.)
- The adapter is **"fat"** at the **read boundary**: it orchestrates **I/O + parse +
  map**, then **invokes** the domain smart-constructor to satisfy the port contract
  (`Result<Entity, E>`). Invariant logic is NOT authored in infra (see D36).
- Flow:
  ```
  unknown
    → (Zod schema parses → DTO)     # validation happens HERE, before the mapper
    → (pure mapper → entity-shaped fields)
    → (domain make<Entity> invoked by adapter) → Result<Entity, E>
  ```
- **The schema validates the DTO** (the raw wire shape), not the entity, because
  parsing runs before mapping ("parse, don't validate" at the boundary).
- **Mapper is total by construction:** since it always receives an
  already-validated, well-typed DTO, it cannot throw on bad input. (This removes
  the "mapper-totality" worry that the alternative `approach C` had.)
- **Port / service contract speaks pure domain:** e.g.
  `getUser(): Promise<Result<User, E>>`. The use case and domain NEVER reference
  a DTO or Zod.
- **Use case has NO validator dependency:** it just calls the port and branches on
  the `Result`. Use cases stay pure domain orchestration.
- Rejected alternatives: "use case owns validation" (added a validator dep + made
  use cases see DTOs/parsers) and "approach C" (adapter maps but use case
  validates the entity → needed a fragile mapper-totality rule).
- Hard dependency: this requires a shared **`Result` type** — see OQ1.

**D20 — `Result` type: roll our own (no `neverthrow`)** ✅ DECIDED
- We implement a **hand-rolled `Result`** — zero external dependencies — so the
  domain (which now returns `Result` from smart-constructors per D19) imports
  nothing. Consistent with the "domain stays dependency-free" principle that
  exiled Zod.
- Shape: `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`
  with `ok()`, `err()` constructors and helpers (`isOk`, `isErr`, `map`, `mapErr`,
  `andThen`, `match`); async helpers added as needed.
- Rejected `neverthrow` (would put a 3rd-party import into the domain layer).
- LOCATION: ✅ confirmed `modules/shared/domain/results/` (D23 + strict-plural
  D29). Shared transport errors (`NetworkError`/`ParseError`) at
  `modules/shared/domain/errors/` (D22).

**D19 — Domain invariants checked by pure domain smart-constructors** ✅ DECIDED (⚠️ CLARIFIED by D36)
- TWO distinct validation levels, kept in different places:
  - **Wire shape** (types, required fields, formats like `email`) → the **Zod DTO
    schema** in `infrastructure/server/schemas/` (D18).
  - **Domain invariants** (business rules: `age >= 18`, valid state transitions,
    "balance can't go negative") → a **pure domain smart-constructor**
    `make<Entity>(...) : Result<Entity, DomainError>` that lives in the **domain
    layer** (a pure function, fits D1; no external deps). **Authored in domain;
    invoked** at boundaries (adapter on reads, use case on writes — D36).
- Fat-adapter pipeline (read boundary):
  ```
  raw
    → schema.safeParse  (wire validity, infra/Zod)
    → DTO
    → toEntity          (pure mapper, infra)
    → make<Entity>      (domain fn; adapter invokes) → Result<Entity, E>
  ```
- Write boundary: use case receives `XInput`, invokes `make<Entity>`, then persists.
- **Single source of truth for business rules:** the same pure domain predicates
  used by the smart-constructor are REUSED by form validation in the React skill,
  so a rule like `age >= 18` runs identically at the form boundary AND the server
  boundary.
- Consequence: the domain now legitimately depends on the shared **`Result`** type
  (and a `DomainError` notion) — pins down OQ1's remaining piece.

**D21 — Error channel `E` = per-module tagged discriminated union** ✅ DECIDED
- Each module owns its own `XError` union (e.g. `UserError`), tagged by a literal
  field (`type` / `_tag`), covering the three boundary failure kinds:
  network/I/O, wire-parse (Zod), domain-invariant (smart-constructor).
- Exhaustively matchable via `switch` on the tag; modules stay decoupled (no
  central error enum).
- A tiny generic primitive (e.g. a shared `NetworkError` / `ParseError` shape)
  MAY be promoted to `modules/shared` ONLY if genuinely reused verbatim;
  errors default to per-module. (Exact split of shared-vs-local error pieces is
  a follow-up — see OQ4.)
- Rejected: (B) shared stringly-typed base error (no exhaustiveness); (C) one
  global union in `shared` (couples all modules, dumping ground, anti-modular).

**D22 — Shared transport errors used verbatim; specialize by ADDING variants** ✅ DECIDED
- Resolves OQ4. `NetworkError` and `ParseError` are defined ONCE in
  `modules/shared/domain` as generic transport/parse primitives carrying no
  domain meaning. (`ParseError` carries Zod issues; `NetworkError` carries
  transport info like an optional status.)
- A module's error union composes them verbatim:
  `type PaymentError = NetworkError | ParseError | <module-owned domain variants>`.
- **Specialization rule (Interpretation 2 — open for extension, closed for
  modification):** modules MUST NOT `extends`/mutate the shared error shapes.
  When a module needs more, it ADDS its own new tagged variant (fresh
  discriminant, e.g. `{ type: "GatewayTimeout"; gateway: ... }`) rather than
  reshaping `NetworkError`/`ParseError`.
- Rationale: keeps exhaustive `switch` matching clean, keeps the shared
  primitives a stable verbatim-reused contract, and treats the urge to attach
  module-specific fields to a transport error as a signal that the thing is
  actually a domain-meaningful variant (which then earns its own tag).
- Rejected: extending the shared interface while keeping the same discriminant
  (implicit structural-subtyping relationship, base holders miss the extra
  fields); and an "allow both / judgment call" policy (inconsistency).

**D23 — Shared domain primitives use strict folder-per-concept (D9)** ✅ DECIDED
- Resolves OQ1 (location). `Result` and the shared transport errors each get
  their OWN concept folder under `modules/shared/domain/`, per D9 (no loose
  files at a layer root, folder-per-concept):
  - `modules/shared/domain/result/` — the `Result` type + helpers (`ok`, `err`,
    `isOk`, `isErr`, `map`, `mapErr`, `andThen`, `match`, async helpers).
  - `modules/shared/domain/errors/` — shared `NetworkError` / `ParseError`
    (D22).
- Rejected: single `result.ts` file (mixes concepts) and co-located-but-split
  flat files (`result.ts` + `errors.ts`) — both violate the strict
  folder-per-concept convention the user wants applied even to single
  primitives.
- PLURALIZATION NUANCE (ties to the pending D9 plural-naming confirm): `errors/`
  pluralizes naturally; `result/` does NOT read well as `results/` (it is a
  single primitive, not a collection). Carry this to the D9 naming pass:
  decide whether plural is a hard rule or "plural where it reads as a
  collection" (which would keep `result/` singular). ← parked for D9 pass.

## Application Layer — Use Cases

**D24 — Use-case shape: curried factory + single command-object input** ✅ DECIDED
- Confirms/extends D8/D13 functional DI. Canonical shape:
  ```ts
  const makeProcessPayment =
    (deps: ProcessPaymentDeps) =>
    (input: ProcessPaymentInput): Promise<Result<Receipt, PaymentError>> => { ... }
  ```
- Deps are injected via the outer `make…` factory (partial application).
- The returned function takes ONE named command object (`XInput` type), not
  positional args. Rationale: self-documenting call sites, non-breaking
  field add/remove, and a reusable `XInput` type the React skill can feed from
  forms.
- Rejected: positional args (call-order fragile, no reusable input type) and a
  single non-curried `{ ...deps, ...input }` call (loses the partial-application
  DI seam).
**D25 — Per-operation narrow error unions from a module-local vocabulary** ✅ DECIDED
- The error channel `E` is scoped PER OPERATION, not per module. The module's
  `errors/` (D23) holds the variant building blocks — shared `NetworkError` /
  `ParseError` (D22) + module-owned domain variants — and each PORT and each
  USE CASE declares a union of ONLY the variants it can actually return.
- Example: `processPayment` →
  `Result<Receipt, NetworkError | ParseError | InsufficientFunds | OrderAlreadyProcessed>`,
  NOT a blanket `PaymentError` god-union that also claims `UserNotFound`.
- The use case propagates the port variants it does not handle and ADDS its own
  orchestration/domain variants (e.g. `OrderAlreadyProcessed`, smart-constructor
  `DomainError`s).
- Refines D21/D22: the "per-module union" is a vocabulary of variants, not a
  single hand-maintained type every operation returns.
- Rejected: one module-wide union for all ops (over-claims failure modes); and a
  fully separate use-case union requiring explicit port→use-case error mapping
  (decouples UI but heavy mapping boilerplate).
**D26 — Honest typing: sync use cases return `Result<T,E>`, async return `Promise<Result<T,E>>`** ✅ DECIDED
- Use cases are typed honestly about I/O: no needless `Promise` wrapping for
  synchronous flows. Async use cases return `Promise<Result<T,E>>`; synchronous
  ones return `Result<T,E>`.
- **Port-free synchronous use cases ARE allowed** (user's explicit choice). A use
  case does NOT need to depend on a port to exist. This SOFTENS D3 — see the D3
  amendment below.
- Trade-off accepted: changing a use case sync→async is a breaking signature
  change, and call sites must distinguish sync vs async. Chosen over uniform
  `Promise<Result>` to avoid faking async.
- Rejected: always-`Promise` (uniform but dishonest/dogmatic) and a "sync escape
  hatch only" middle option.
- CONSEQUENCE: with "has a port" no longer the use-case criterion, the
  use-case vs domain-service boundary needs a replacement criterion — see OQ5.

**D3 AMENDMENT (re D26):** D3's guideline ("the moment it needs to fetch/persist/
call something it becomes a use case") is NOT being treated as the *defining*
criterion anymore. A use case may be synchronous and even port-free (D26). D3's
underlying point still holds in one direction — *if* there is async I/O/a
framework on the other side, invert via a port and it's a use case — but the
converse (port-free ⇒ not a use case) is RETRACTED. The positive criterion for
"use case vs domain service" is now OQ5 (resolved by D27 below).

**D27 — Use-case vs domain-service criterion = ROLE/layer (resolves OQ5)** ✅ DECIDED
- Replaces the retired "has a port" test (D3 amendment / D26).
- **Use case** = an APPLICATION-layer entry point that satisfies a SPECIFIC
  feature's acceptance criteria. Feature-coupled; it is what a UI hook calls.
  May be async-with-ports, sync-with-sync-ports, or port-free-synchronous (D26)
  — the defining trait is its role, not its I/O.
- **Domain service** = reusable, feature-agnostic pure domain logic (D3/D4),
  never tied to one feature's acceptance criteria.
- It is a JUDGMENT CALL (accepted), but it aligns with the layer model: a unit
  that exists to fulfil "feature X needs to do Y" is application; a unit that is
  just business truth reusable across features is domain.
- Rejected: keeping the mechanical port test (contradicts D26) and the purely
  structural "anything a UI hook calls" test (would mislabel as use cases any
  pure helper a hook happens to call directly).

**D28 — Module-owned ports live in the DOMAIN layer** ✅ DECIDED
- Ports (the `interface`s from D2) live in `modules/<m>/domain/ports/`.
- They are phrased entirely in pure domain terms — entities, `Result`, domain
  errors (D18: never DTOs/Zod). The core owns its own contracts (orthodox DIP).
- BOTH the application layer (use cases) and the domain (services /
  smart-constructors, if they ever need an inverted dependency) depend INWARD on
  these ports; infrastructure implements them as adapters.
- Rejected: ports in the application layer (co-locates with use cases but the
  domain then can't depend on them, and splits "core owns contracts"); and a
  split-by-consumer scheme (most precise dependency direction but two homes for
  ports → more rules).
- Folder per D9/D23 conventions: `domain/ports/` (plural confirmed by D29).

**D29 — Plural-folder rule = STRICT PLURAL ALWAYS (resolves D9 confirm + D23 nuance)** ✅ DECIDED
- Every concept folder is pluralized, no exceptions: `entities/`, `ports/`,
  `adapters/`, `use-cases/`, `dtos/`, `mappers/`, `schemas/`, `constants/`,
  `errors/`, and yes `results/` (the `Result` type + helpers folder per D23).
- Decisive reason: D10 boundaries are ESLint-enforced; "all concept folders are
  plural" is a mechanical, lint-able rule with zero judgment, vs. "plural unless
  single-instance" which can't be enforced and drifts.
- Accepts the minor oddity of `results/` for a single primitive in exchange for
  uniformity + enforceability.
- Supersedes the D23 "parked plural nuance": `shared/domain/result/` becomes
  `shared/domain/results/`, alongside `shared/domain/errors/`.
- Rejected: plural-for-collections-only (judgment call, not lintable) and
  singular-everywhere (reads wrong for genuine collections).

**D30 — Vocabulary swap: `ports` = interfaces, `services` = unified domain logic** ✅ DECIDED
- Resolves the D5 naming of the unified pure-domain-functions concept (D4) AND
  cleans up D2's vocabulary, landing on the two industry-standard terms:
  - **`ports/`** (`domain/ports/`, D28) = the interface/contract concept. D2's
    "service = port" alias is RETIRED — a port is just called a port (standard
    hexagonal "ports & adapters" term).
  - **`services/`** (`domain/services/`) = the ONE unified bucket of pure domain
    functions (single-entity behavior + multi-entity logic + business "rules",
    per D4). This is the textbook DDD term "domain service".
- Why unambiguous here: the application layer is named **use cases**, so
  "service" in the DOMAIN layer cannot be confused with an application service.
- SUPERSEDES: D2 (alias dropped) and the part of D3 that deliberately avoided the
  word "service" for pure logic. Recorded as a clean reversal, not a silent edit.
- Caveat accepted: classic DDD reserves "domain service" for multi-entity logic
  and keeps single-entity behavior on the entity; D4 collapses both into
  `services/` anyway (user kept D4 as-is; rejected the "multi-entity only,
  reopen D4" option).
- Rejected: keeping a separate non-"service" name (`rules/` etc.) for the
  pure-logic concept.

## `shared` Module

**D31 — `modules/shared` is a FULL 3-layer module** ✅ DECIDED (⚠️ NARROWED by D34)
- ⚠️ NARROWED by D34: `shared` is NOT a full feature module. It is a LEAF KERNEL
  with `domain/` + `infrastructure/` (design system + generic tech primitives) but
  NO `application/use-cases/` layer. The "shared USE CASE / infra ADAPTER" allowance
  below is retracted — see D34.
- `shared` mirrors the normal module structure: it MAY have `domain/`,
  `application/`, and `infrastructure/` layers, just like any feature module.
  ("shared is just another module"; uniform with the D9 import rule "a module
  imports only itself and `shared`".)
- PRESERVES D6's original allowance: a shared entity, domain service, USE CASE,
  or infra ADAPTER used by 2+ modules may live in `shared`. (Supersedes the
  domain-only proposal that was rejected.)
- Known content so far: `shared/domain/results/`, `shared/domain/errors/`
  (D23/D29); cross-module `ports/` in the strict skill (D8); shared entities /
  `services/`.
- PER-SKILL RECONCILIATION (re D11): permissive skill still has LESS reason to
  populate `shared` (cross-module imports allowed → cross-module ports
  unnecessary), but the STRUCTURE is the same in both skills. D11's "shared
  shrinks to primitives" is now a tendency, not a structural rule.
- CONSEQUENCE: "full module" is the most dumping-ground-prone option → a
  governance rule is required. See D32 (next).

**D32 — `shared` governance = demand-driven "rule of two"** ✅ DECIDED
- Nothing is created in `shared` speculatively. Code is BORN in its owning
  feature module and is MOVED to `shared` ONLY when a genuine SECOND consumer
  appears. Until then it stays in the owning module, even if future sharing is
  suspected.
- Reinforced by D7: when contexts diverge even slightly, PREFER duplicating over
  a premature shared abstraction.
- Enforcement is primarily a REVIEW-TIME discipline (the "2+ consumers" bar is
  not fully lint-able like the D10 import boundaries). Light tooling MAY assist
  by flagging `shared` items imported by ≤1 module as demotion candidates.
- Rejected: proactive placement when sharing is merely expected (invites
  speculative dumping); and a hard CI/lint gate failing builds on <2 importers
  (strongest but heavy to build + noisy during refactors).

**D33 — Permissive cross-module surface: two channels, `shared` is universal** ✅ DECIDED
- Fixes an inconsistency in the permissive skill: the rule "the only cross-module
  import is `use-cases/`" was overstated and left no home for (a) reusable pure
  domain logic / multi-entity functions, or (b) reusable UI primitives.
- ROOT CAUSE: the rule forgot that `shared` (D31) is a UNIVERSAL dependency — any
  module may import `shared` at ANY layer. The use-cases-only rule governs
  FEATURE↔FEATURE imports, not imports of `shared`.
- Two distinct channels now stated explicitly:
  - **4a Feature → feature (behavior):** direct import of the owner's
    `application/use-cases/` only; siblings' `domain/**` + `infrastructure/**`
    stay private. Acyclic DAG.
  - **4b Anyone → `shared` (pure logic + UI):** shared pure domain logic (incl.
    multi-entity, e.g. `canCheckout(cart, wallet)`) → `shared/domain/services/`;
    reusable presentation primitives (Button/Input/Dialog = design system) →
    `shared/infrastructure/ui/`.
- Resolved forks (all "recommended"):
  - **Domain reuse = shared-only** (`shared_only`): use-cases remain the ONLY
    direct cross-feature surface; pure shared logic promotes to
    `shared/domain/services/` (rule of two), never a sibling-domain import.
  - **UI home = `shared/infrastructure/ui/`** (`shared_ui`), not a separate
    top-level design-system module.
  - **Design-system carve-out** (`carveout`): generic primitives are BORN in
    `shared` directly (inherently cross-cutting); rule of two still governs
    feature-flavored shared components (e.g. `<UserAvatar>`).
- Lint consequence: feature↔feature restricted to `use-cases/**`; `modules/shared/**`
  exempt (importable at any layer).
- Applied to permissive SKILL.md/REFERENCE.md (§4 split into 4a/4b, §6, §7) and
  EXAMPLES.md (new Example 3).
- STRICT mirror DONE: strict routes ALL cross-feature needs through `shared`, so
  the 4a/4b split is moot — but the same two shared homes now apply. Added to
  strict: shared folder map (`infrastructure/ui/`), §4 "non-runtime sharing" note
  (pure logic + UI primitives vs runtime ports), §6 design-system carve-out, §7
  lint exemption for `modules/shared/**`, SKILL quick-start step 7 + hard rule,
  and EXAMPLES Example 3.

**D34 — `shared` is a LEAF KERNEL; there is no "shared use case"** ✅ DECIDED
- Trigger: grilling "how would a shared use case work?" Resolved that the object
  does not exist — every scenario dissolves into ownership or duplication.
- DEFINING INVARIANT: `shared` code NEVER reaches into the app's ports, adapters,
  or other modules at runtime — it only computes over its inputs (no runtime
  fan-out into the module graph). `shared` is the SINK of the dependency graph.
- Consequences:
  - `shared` has NO `application/use-cases/` and holds NO use cases (a use case
    orchestrates ports = fan-out → would make `shared` a god-module).
  - `shared` holds NO feature adapters; a feature adapter lives in its owning
    module (as strict Example 2 already does). Only GENERIC technical primitives
    (`HttpClient`/`Clock`/`Storage` + their interfaces) may sit in
    `shared/infrastructure/`.
  - Eligible `shared`: `Result`, errors, entities, pure domain services, port
    interfaces (incl. cross-module ports), design system, generic tech primitives.
- "Reusable" is NOT the criterion — "stable leaf, no runtime fan-out" is. Rule of
  two (D32) gates WHEN an eligible thing moves; D34 gates WHAT KIND is eligible.
- Scenario resolutions (grilled, user-confirmed):
  - **Owned-and-consumed (A)** → use case stays in owner; others consume (port in
    strict / direct import in permissive). `shared` holds at most the port.
  - **"Ownerless" cross-cutting (B)** → user chose `own_module`: it's a
    supporting-subdomain MODULE (`notifications`/`audit`), consumed like any
    module. Not `shared`.
  - **Misclassified (C)** → pure logic → `shared/domain/services/` (D33).
  - **Identical orchestration (D)** → user chose `one_owner_two_entrypoints`: one
    capability, one owner, multiple UI/consumer entry points; else honest
    per-context duplication (D7). Never a shared use case.
- AMENDS D6 (drop use case + feature adapter from shared-eligible) and NARROWS
  D31 (shared = leaf kernel, no application layer).
- Applied to both skills: REFERENCE §6 rewritten ("leaf kernel" + invariant +
  no-shared-use-case section); SKILL folder-map comment → "LEAF kernel (no use
  cases)". Folder maps already had no `shared/application/`, so they were already
  consistent.

**D35 — Skill descriptions are SELF-CONTAINED + non-comparative** ✅ DECIDED
- Reinforces the earlier "no cross-references between skills" directive: comparative
  framing ("PERMISSIVE", "over enforced module isolation") implicitly references the
  other skill, so it's banned from descriptions too. Describe each skill on its OWN
  terms (absolute behavior), not by contrast.
- Applied to permissive description: now leads with "cross-module imports are
  allowed" and states the CONSTRAINT (feature→feature via use-cases only; internals
  private; acyclic DAG). Rejected the looser "just say imports are allowed" (drops
  the essential constraint → misrepresents the skill as "anything goes").
- ✅ DONE (consistency): the strict description got the same self-contained,
  non-comparative treatment. It now leads with the absolute behavior ("frontend
  apps where feature modules never import one another — every cross-module need is
  inverted through a port defined in modules/shared") and ends with "fully isolated
  feature modules", dropping both comparative tokens ("STRICT module isolation" and
  "strong module boundaries"). Both skill descriptions are now self-contained +
  non-comparative.

**D36 — Smart-constructor ownership vs invocation (two boundaries)** ✅ DECIDED
- Grilled: user preferred "business invariants = domain/application logic;
  adapter = dumb plumbing (I/O + wire-parse + structural map)" but rejected a
  separate `UserData` type on ports and rejected use cases seeing DTOs.
- Chosen **Option A**: `make<Entity>` is **authored in domain**; adapters and use
  cases only **invoke** it — they never contain invariant logic.
  - **Read boundary (hydrate from server):** adapter orchestrates I/O → Zod-parse
    → mapper, then **invokes** `make<Entity>` so the port can return
    `Result<Entity, E>`. Use case calls the port and branches — does NOT
    re-validate.
  - **Write boundary (create from user input):** use case receives `XInput`,
    **invokes** `make<Entity>`, then persists via a port.
- Rejected alternatives:
  - **`UserData` / unvalidated port type** — extra concept; user disliked it.
  - **Always invoke from use case on reads** — forces unvalidated types or DTOs in
    use cases, or invalid entities on the domain side.
  - **Port returns DTO; use case maps + validates** — clean layer split but use
    cases see wire shapes (violates D18 port contract).
- CLARIFIES D18/D19: "fat adapter" means boundary orchestration, not "business
  rules live in infra". The adapter **calls** domain; it does not **own** invariants.
- Applied to both architecture skills: REFERENCE §1 (smart-constructors), §2
  (create-flow example), §3 (fat adapter); SKILL quick-start steps 2 + 5.
- ⬜ **PARKED — review how this performs in practice.** After using the skills on a
  real codebase, revisit whether the read/write split feels right in day-to-day
  work (adapter invoking `makeEntity` vs always-from-use-case, error-union
  ergonomics, team mental model). Record findings here or amend D36 if needed.

## Skills authored ✅

All three SKILL.md files have been written from these notes (under
`.agents/skills/`):
- **`hexagonal-frontend-strict/`** — SKILL.md + REFERENCE.md + EXAMPLES.md
  (core architecture + strict module isolation; cross-module via `shared` ports).
- **`hexagonal-frontend-permissive/`** — SKILL.md + REFERENCE.md + EXAMPLES.md
  (same core; modules may import siblings' public `use-cases/`, acyclic DAG).
- **`react-hexagonal-ui/`** — SKILL.md + REFERENCE.md (React implementation of
  `infrastructure/ui/`; complements both architecture skills).

Remaining: POST-SKILLS EVALUATION (strict vs permissive) — see below.

## Open / Parked Questions

**OQ1 — Entity construction & validation ✅ FULLY RESOLVED**
- RESOLVED pieces:
  - Wire validation = Zod DTO schema in infra (D18); domain stays Zod-free.
  - Entity construction + domain invariants = pure domain smart-constructor
    `make<Entity>(...) : Result<Entity, DomainError>` (D19).
  - `Result` type = roll our own, no `neverthrow` (D20).
  - `Result` LOCATION: confirmed `modules/shared/domain/results/` (D23 +
    strict-plural D29). Shared errors at `modules/shared/domain/errors/`.

**OQ3 — How is the error channel `E` modeled? ✅ RESOLVED (via D21)**
- User explicitly chose branch **(A) per-module tagged discriminated union**. See
  D21 for the recorded decision. Original framing kept below for context.
- Context: a port's `Result<Entity, E>` must cover THREE failure kinds from the
  fat-adapter pipeline (D18/D19):
  1. **Network/I/O failure** (request itself failed),
  2. **Wire-parse failure** (Zod schema rejected the response),
  3. **Domain-invariant failure** (smart-constructor rejected it, e.g.
     `InvalidAge`).
  So `E` is a small union covering all three at the module boundary.
- Branches:
  - **(A) Per-module discriminated union**, tagged with a literal field
    (`type`/`_tag`), e.g.
    `type UserError = { type: "NetworkError" } | { type: "ParseError"; issues:
    string[] } | { type: "UserNotFound"; id: UserId } | { type: "InvalidAge";
    min: number }`. Precise, exhaustively matchable, modules stay decoupled.
    A tiny shared primitive (e.g. a generic `ValidationError` shape) may live in
    `shared` if genuinely reused, but errors default to per-module.
  - **(B) Shared base error** (`{ code: string; message: string }`) modules reuse
    — uniform but stringly-typed, no exhaustiveness.
  - **(C) One global error union in `shared`** — couples every module to a central
    enum; `shared` dumping ground; contradicts modularity.
- My recommendation: **(A) per-module tagged discriminated union.** AWAITING
  user's decision (do NOT assume).

**OQ2 — Where do Zod `schemas/` live? ✅ RESOLVED (via D18 fat adapter)**
- Resolution = "split by job":
  - **DTO / server-boundary schemas → `infrastructure/server/schemas/`**, consumed
    by the adapter to parse `unknown → DTO` (D18). They validate the WIRE shape.
  - **Form schemas → `infrastructure/ui/`** (React skill), validating form-input
    shapes.
- Dependency direction stays clean: `server/` never imports `ui/`.

---

**POST-SKILLS EVALUATION (do after BOTH skills are written)**
- Compare the two finished skills and judge which module-interaction policy is
  better overall: **strict (no cross-module imports)** vs **permissive (allow
  cross-module imports)**. Capture the verdict + when to prefer each.

**D16 — Core skills are FRAMEWORK-AGNOSTIC; `infrastructure/ui/` is a seam** ✅ DECIDED
- The two architecture skills (strict + permissive) must stay as clean of any
  concrete UI framework as possible.
- Inside the infrastructure layer there is a dedicated **`ui/` folder** that
  holds ALL UI-framework-specific concepts. The architecture skills only say
  "framework stuff lives in `infrastructure/ui/`"; they do NOT prescribe how it
  is built.
- A **separate framework-specific skill (React)** defines how `ui/` is
  implemented. The React skill complements BOTH architecture skills.
- Architecture-level principle that REMAINS in the core skills: composition
  happens in the infrastructure layer (within/around `ui/`). The concrete
  MECHANISM (hooks/containers/components) is React detail → React skill.

### Deferred to the React (framework-specific) skill
- **UI roles = Option A** (chosen): **components** = pure presentation (props in,
  JSX out; may NOT import use cases/adapters/other modules); **containers** =
  consume hooks, hold local UI state, feed components; **hooks** = composition +
  behavior (build use cases from adapters, expose callables). Hard rule:
  **use cases are reachable ONLY through hooks.**
- Sub-rule still PENDING: how strict is "no logic in components" (recommendation:
  allow pure presentation-only formatting like `formatMoney`, forbid anything
  touching domain/use cases/state).
- React mechanism for composition (D14): hook-as-composition-point
  (e.g. `useProcessPayment()` builds the use case from adapters).
- React mechanism for cross-module DI (D15): `shared`-defined React
  context/token per cross-module port, filled by the root UI shell (strict
  skill); direct injection (permissive skill).

**D17 — Infra (non-ui) boundary structure = Option B, grouped under `server/`** ✅ DECIDED
- Boundary mapping is explicit (Option B): DTOs (raw external shape), mappers
  (pure DTO ⇄ entity), adapters (orchestrate I/O + mapping, return Result).
  Pipeline: `unknown → DTO → entity (Result)`.
- Grouping: `dtos/`, `mappers/`, `adapters/` all live inside a **`server/`**
  folder within the infrastructure layer.
- Infra layer per module now looks like:
  ```
  modules/<m>/infrastructure/
    ui/        # framework-specific (React skill); form schemas live here
    server/
      adapters/
      dtos/
      mappers/
      schemas/   # Zod schemas that validate DTOs (wire shape) — see D18
  ```
- SCHEMA PLACEMENT (resolved via D18 fat adapter): **DTO/server-boundary schemas
  live in `server/schemas/`** (consumed by the adapter to parse `unknown → DTO`);
  **form schemas live in `ui/`** (React skill). Clean direction: `server/` never
  imports `ui/`.

## Next Up (grilling queue)

Resolved in this session:
- ✅ **ADAPTER/MAPPER boundary** — D18: fat adapter does I/O + parse + map →
  `Result<Entity, E>`; schema validates the DTO; use case does not validate.
- ✅ **OQ2** — D18: server schemas in `server/schemas/`, form schemas in `ui/`.
- ✅ **Domain invariants** — D19: pure domain smart-constructors
  (`make<Entity> : Result<Entity, DomainError>`); business rules reused by forms.
- ✅ **`Result` type** — D20: roll our own (no `neverthrow`).

Resolved this session (continued):
- ✅ **OQ3** — D21: error channel `E` = per-module tagged discriminated union.
- ✅ **OQ4** — D22: shared `NetworkError`/`ParseError` in `shared/domain`, used
  verbatim; modules specialize only by ADDING new tagged variants.
- ✅ **OQ1** — D23: strict folder-per-concept under `shared/domain/`
  (`result/`, `errors/`). Plural-naming nuance parked for the D9 pass.
- ✅ **Application Layer / use cases** — D24 (curried factory + command object),
  D25 (per-operation narrow error unions), D26 (honest sync/async typing,
  port-free use cases allowed), D27 (use-case vs domain-service = role/layer),
  D28 (ports live in `domain/ports/`).

- ✅ **Domain naming pass** — D29 (strict-plural-always) + D30 (vocab swap:
  `ports/` = interfaces, `services/` = unified domain logic). Domain folders:
  `entities/`, `services/`, `constants/`, `ports/`.

- ✅ **`shared` module internals + governance** — D34 (LEAF KERNEL, no use cases;
  narrows D31) + D32 (demand-driven "rule of two" governance).

Status:
- ✅ All architecture-design questions RESOLVED (D1–D36).
- ✅ All three SKILL.md files authored (see "Skills authored" section above).
- ⬜ POST-SKILLS EVALUATION (strict vs permissive) — compare the two finished
  skills and capture which module-interaction policy is better overall + when to
  prefer each.
- ⬜ D36 PARKED REVIEW — after real-world use, revisit how the read/write
  smart-constructor split performs in practice (see D36).
