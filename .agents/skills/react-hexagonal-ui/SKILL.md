---
name: react-hexagonal-ui
description: Structure and implement React code inside a functional-first hexagonal frontend's infrastructure/ui layer. Use when organizing module-owned components, containers, hooks, layouts, pages, routers, providers, contexts, form schemas, or query keys; consuming query, mutation, or synchronous application use cases through React hooks; designing curated request-hook contracts; coordinating forms and mutations; or applying Suspense and error-boundary responsibilities while preserving hexagonal layer boundaries.
---

# React Hexagonal UI

Implement React inside `modules/<module>/infrastructure/ui/`. Apply this skill
with the surrounding hexagonal architecture, especially its module ownership,
application use-case contracts, `Result` model, and public-surface rules.

Keep this skill focused on React consumption. Treat callable use cases as
already supplied by the surrounding architecture; do not define infrastructure
binding here.

## Workflow

1. Place every UI artifact inside the owning bounded-context module or
   `shared`. Put cross-context app views in an explicit app/orchestration
   module, not `shared`.
2. Classify each artifact by responsibility before writing it.
3. Reach application use cases only through hooks.
4. Keep containers mechanical and components presentation-oriented.
5. Expose curated hook contracts instead of request-library result objects.
6. Move behavior shared by multiple hooks into a focused orchestration hook.
7. Check every import against the dependency matrix.

## Canonical Structure

Use plural first-level concept folders. Use a same-name leaf folder for every
artifact except schemas and query keys.

```text
src/modules/<module>/infrastructure/ui/
  components/
    payment-form/
      payment-form.tsx
  containers/
    payment/
      payment.tsx
  hooks/
    use-payment/
      use-payment.ts
    use-payment-form/
      use-payment-form.ts
    use-process-payment/
      use-process-payment.ts
  layouts/
    checkout-layout/
      checkout-layout.tsx
  pages/
    checkout-page/
      checkout-page.tsx
  routers/
    checkout-router/
      checkout-router.tsx
  providers/
    checkout-provider/
      checkout-provider.tsx
  contexts/
    checkout-context/
      checkout-context.ts
  schemas/
    payment-form-schema.ts
  query-keys/
    payment-details-query-key.ts
```

Keep one main artifact file in each same-name folder by default. Keep
hook-specific helper maps and functions in the hook file. Do not create a
generic `constants/` concept; colocate constants with their owner.

## Roles

### Components

Render UI-oriented props. Do not receive domain/application entities or error
objects. Allow local state only for presentation mechanics such as focus,
dropdowns, tabs, and visual input behavior.

Allow translation, accessibility, UI-library, form-library, and declarative
routing APIs when they serve rendering. A form component may operate on the
form-library object supplied through props.

Name components plainly. Keep a private `interface` named
`<ComponentName>Props` in the component file. Use
`ComponentProps<typeof Component>` when another file needs its prop type.

### Containers

Call hooks, unpack their results, and pass only required values and actions to
components. Compose components and, when useful, an independently reusable
child container.

Do not map errors, interpret business outcomes, choose presentation copy, or
coordinate coupled behavior inline. Move coupled behavior to an orchestration
hook. Use plain capability names without a `Container` suffix.

### Hooks

Own behavior, request state, form setup, error mapping, routing behavior,
context access, and UI orchestration. Hooks may compose other hooks.

Reuse application request/args interfaces instead of redefining them. Name a
query parameter `request`. For UI-only orchestration parameters, use one object
argument named `args` and a local `interface` named after the capitalized hook,
for example `interface UseCheckout`. Do not create empty arg interfaces.

Infer hook return types. Return nested objects only when nesting preserves a
meaningful concept.

### Layouts

Own HTML/CSS structure, responsive arrangement, and typed slots. Receive all
rendered content through props; do not import feature components or containers.
Allow composition of other layouts. Use the `Layout` suffix.

### Pages

Compose layouts, components, and containers into one app view. Keep pages
hook-free and free of feature behavior. Allow declarative routing primitives
when composition requires them. Use the `Page` suffix.

### Routers

Map URLs to pages, redirects, route parameters, and route-tree shells. Allow a
router to use a layout only when multiple pages share that structural shell;
keep page-specific layouts in their page. Keep routers private and use the
`Router` suffix.

### Providers And Contexts

Use providers to supply framework or client UI state. Use contexts only to
declare typed React context. Let providers supply values and dedicated hooks
read and interpret them; components and containers do not call `useContext`
directly.

Store only cross-tree client UI state in context. Do not duplicate server state
owned by the request-state library. Keep providers and contexts private and use
the `Provider` and `Context` suffixes.

### Schemas And Query Keys

Keep form schemas flat under `schemas/` and name values with the `FormSchema`
suffix, such as `paymentFormSchema`. Reuse pure domain validation functions
when a form enforces the same business rule.

Keep named, serializable query-key definitions flat under `query-keys/`. Use
the `QueryKey` suffix, such as `paymentDetailsQueryKey`. Query keys are public
UI surface.

## Request Hooks

Keep conventions request-library agnostic. Use TanStack Query only as an
implementation example.

### Queries

- Name a query hook after its `Fetch...UseCase`, such as
  `useFetchUserProfile`.
- Receive and bind the request when calling the hook so the query function is
  no-argument.
- Return noun data fields such as `userProfile`; pluralize collections.
- Return selected generic booleans such as `isPending`, `isFetching`,
  `isSuccess`, and `isError`; do not return `status`.
- Use the generic action name `refetch`.
- Keep paginated/infinite hooks named `useFetch...`; represent pagination in
  the request and return contract.

### Mutations

- Name a mutation hook after the application operation.
- Expose the mutation action with the exact operation verb, such as
  `processPayment`.
- Give returned data a specific noun, such as `paymentReceipt`.
- Return only required request-library fields. Do not expose `reset` or an
  asynchronous mutation action by default.
- Keep request-library configuration, lifecycle reactions, invalidation,
  navigation, and notifications inside hooks.

Expected `Result` errors currently remain resolved values. Derive UI booleans
from both the request-library state and the `Result` branch. Reserve the
library's thrown-error path for unexpected defects. This convention is
provisional; do not reinterpret expected errors as rejected requests unless the
architecture explicitly changes that contract.

Map expected and unexpected errors before they leave hooks. Expose UI-ready
fields such as `errorMessage`, `fieldErrors`, and flags, never original error
objects. Store translation keys in exhaustive maps named with `MessageKeys`,
for example:

```ts
const processPaymentErrorMessageKeys: Record<
  ProcessPaymentError["type"],
  string
> = {
  CardDeclined: "payments.errors.cardDeclined",
  NetworkError: "payments.errors.network",
};
```

Lifecycle hooks may own real UI reactions such as notifications, analytics,
navigation, and invalidation. Do not create empty lifecycle hooks. Keep
required business follow-up inside the application use case.

## Forms And Orchestration

Let a form hook create and configure the form-library object, including schema,
defaults, and validation mode, and return the whole object.

For every submitted form, separate:

- `usePaymentForm`: form state and validation.
- `useProcessPayment`: mutation state and execution.
- `usePayment`: focused orchestration and the submit handler.

Keep every submit handler in the orchestration hook. Name orchestration hooks
after the plain capability without `Flow`, `Controller`, `Submit`, or
`Orchestrator`. Do not create one oversized hook merely to mirror a container;
a container may call behaviorally independent hooks directly.

Call synchronous use cases directly from hooks. Do not wrap pure synchronous
coordination in a server-state library.

## Suspense And Error Boundaries

Use Suspense to coordinate rendering while descendants wait for a suspending
resource. It does not replace curated hook contracts or turn expected
application errors into exceptions.

- Use one `useFetch...` hook per use case. Do not create normal and
  `Suspense`-suffixed duplicates.
- Let a hook that always suspends omit loading booleans.
- Keep expected errors mapped to UI-ready hook values.
- Compose feature-level boundaries in containers.
- Compose app-shell or route-level boundaries higher only for framework-level
  loading or failures.
- Make every loading/error fallback a component under `components/`.
- Name fallbacks plainly, such as `PaymentLoading` and `PaymentError`, without
  a `Fallback` suffix.
- Use React's `Suspense` directly. Do not wrap it with a pass-through component.
- Give an error component a required `onRetry` only when recovery exists; omit
  the prop otherwise.

Treat error boundaries as protection from unexpected render/runtime failures.
Do not prescribe a generic shared error-boundary implementation.

## Public Surface

Allow cross-module reuse through `components/`, `containers/`, `hooks/`,
`layouts/`, `pages/`, and `query-keys/`. Keep `routers/`, `providers/`,
`contexts/`, and `schemas/` private.

Preserve role restrictions across module boundaries and keep the module graph
acyclic.

## Dependency Matrix

| Role | May import |
| --- | --- |
| Components | components, presentation-only hooks, form/UI libraries, declarative router APIs |
| Containers | components, hooks, independent child containers, React composition APIs |
| Hooks | hooks, application use cases/contracts, schemas, query keys, hook-oriented libraries; context only in its access hook |
| Layouts | layouts, React types, styles |
| Pages | layouts, components, containers, React composition APIs, declarative router primitives |
| Routers | pages, route-level loading/error components, router APIs, shared route-tree layouts |
| Providers | owned contexts, React/provider APIs, intentional provider bundles |
| Contexts | React and UI-only contracts declared in the same file |
| Schemas | schema library, pure domain validation functions, compatible application request contracts |
| Query keys | application request contracts needed by typed key factories |
| App entry | providers, root router, React mounting APIs, global styles |

Anything not listed is disallowed by default. In particular, components and
containers never import application use cases, and UI roles do not reach into
server infrastructure.

## Read Next

- Read [REFERENCE.md](REFERENCE.md) for detailed contracts, edge cases, and
  import guidance.
- Read [EXAMPLES.md](EXAMPLES.md) when implementing query, mutation, form,
  pagination, optimistic-update, context, routing, or Suspense patterns.
