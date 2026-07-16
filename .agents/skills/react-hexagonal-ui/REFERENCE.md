# React Hexagonal UI - Reference

Use this reference after reading [SKILL.md](SKILL.md). It expands the contracts
without changing the surrounding hexagonal architecture.

## Contents

1. [Choose A UI Role](#choose-a-ui-role)
2. [File And Type Conventions](#file-and-type-conventions)
3. [Request Hook Contracts](#request-hook-contracts)
4. [Result And Error Semantics](#result-and-error-semantics)
5. [Forms And Orchestration](#forms-and-orchestration)
6. [Pagination And Optimistic Updates](#pagination-and-optimistic-updates)
7. [Contexts, Providers, And Routing](#contexts-providers-and-routing)
8. [Suspense And Error Boundaries](#suspense-and-error-boundaries)
9. [Module Reuse And Imports](#module-reuse-and-imports)

## Choose A UI Role

Classify an artifact by the responsibility it owns, not by how much JSX it
contains.

### Component

Use a component for presentation:

- Render UI-oriented props.
- Translate static or visual copy.
- Use accessibility and UI-library hooks.
- Own ephemeral presentation state.
- Render and operate on a supplied form-library object.
- Render declarative navigation.

Do not let a component understand entities, application errors, request state,
or feature decisions. Convert an entity into the exact display values the
component needs before crossing the component boundary.

### Container

Use a container for mechanical React wiring:

- Call one or more independent hooks.
- Unpack hook returns.
- Pass exact values and callbacks to components.
- Compose a real child capability implemented by another container.
- Place a feature-level `Suspense` or error boundary around a subtree.

Do not map errors, derive business meaning, choose labels, or coordinate coupled
hooks inline. A container should become boring once its hooks are correct.

### Hook

Use a hook for React-facing behavior:

- Consume callable application use cases.
- Own request-library state and configuration.
- Map request results and defects into UI-ready fields.
- Create form-library objects.
- Read and interpret contexts.
- Use router hooks.
- Coordinate multiple hooks around one capability.

Create a focused orchestration hook when multiple hooks must agree on timing,
arguments, or outcomes. Do not create one merely to reduce the number of hook
calls in a container.

### Layout

Use a layout for reusable structure. Define typed slots and own HTML, CSS,
responsive placement, and landmark structure. Receive rendered elements through
props. Do not select which feature components occupy those slots.

Layouts may compose other layouts when the result remains structural.

### Page

Use a page to assemble one view from layouts, containers, and components. Keep
it free of hooks and use cases. A page may use declarative router primitives,
but route-state behavior belongs in hooks and route-tree configuration belongs
in routers.

### Router

Use a router to:

- Map paths to pages.
- Configure redirects.
- Define route-level loading/error elements.
- Extract or declare route parameters.
- Apply one structural shell to a route subtree.

Do not fetch data or implement feature behavior. Keep page-specific layouts in
pages. Use a layout from a router only when several child pages share the shell.

### Provider And Context

Use a context to declare a typed channel for cross-tree client UI state. Use a
provider to supply its value. Use a dedicated hook to read and interpret it.

Do not put server cache data in context. Do not call `useContext` from
components or containers.

## File And Type Conventions

Declare functions with arrow syntax. Give every UI-owned function that accepts
values one object parameter typed by an `interface`, an application contract,
or an inline object interface when no other function reuses the shape. Return
named object properties from hooks and other UI-owned APIs instead of returning
a bare callable or unnamed positional structure.

Preserve framework-controlled contracts. React components return JSX, query-key
factories return key tuples, effect-only actions may return `void`, and library
callbacks retain the parameters and return values required by that library.

Use absolute imports for project code and styles. Configure `@/*` to resolve
from `src/*`, then import through paths such as
`@/modules/payments/infrastructure/ui/components/payment-form/payment-form`.
Use plain `className` strings for styling; do not use CSS Modules.

Use these naming rules:

| Concept | Name |
| --- | --- |
| Component | plain name, e.g. `PaymentForm` |
| Container | plain capability, e.g. `Payment` |
| Hook | `use` + capability, e.g. `usePayment` |
| Query hook | `useFetch...`, matching the query use case |
| Form hook | `use...Form` |
| Layout | `...Layout` |
| Page | `...Page` |
| Router | `...Router` |
| Provider | `...Provider` |
| Context | `...Context` |
| Form schema value | `...FormSchema` |
| Query key value/factory | `...QueryKey` |
| Error key map | `...ErrorMessageKeys` |
| Loading/error component | feature + state, e.g. `PaymentLoading` |

Keep component-like props local and private:

```tsx
interface PaymentSummaryProps {
  amount: string;
  onConfirm: () => void;
}

export const PaymentSummary = ({
  amount,
  onConfirm,
}: PaymentSummaryProps) => {
  // ...
};
```

When another artifact needs the contract, infer it:

```ts
type PaymentSummaryProps = ComponentProps<typeof PaymentSummary>;
```

Use `interface` for UI-only props and hook args. For an orchestration hook, name
the args interface after the capitalized hook without another suffix:

```ts
interface UseCheckout {
  readonly orderId: string;
}

export const useCheckout = (args: UseCheckout) => {
  // ...
};
```

Do not introduce that interface when the hook has no args. Reuse an application
request/args interface directly when the values already belong to the use-case
contract.

## Request Hook Contracts

Keep request-library APIs inside request hooks. Do not return the complete
library result and do not accept an external options object.

Derive options such as enablement, stale timing, retry behavior, lifecycle
callbacks, and invalidation from the request, route/context values, or internal
hook state.

### Query Hooks

Receive the application request when calling the hook:

```ts
export const useFetchPaymentDetails = (
  request: FetchPaymentDetailsArgs,
) => {
  const queryFn = fetchPaymentDetails(request);
  // Pass queryFn to the selected request library.
};
```

The surrounding UI composition point supplies `fetchPaymentDetails`. The
operation shown here binds `request` and returns the no-argument function
required by a query library. Its concrete import is intentionally omitted; do
not invent a composition-folder convention or recreate infrastructure binding
in this skill.

Expose a curated result:

```ts
return {
  paymentDetails,
  errorMessage,
  isPending,
  isFetching,
  isSuccess,
  isError,
  refetch,
};
```

Apply these field rules:

- Use singular nouns for one value.
- Use plural nouns for collections.
- Do not repeat `fetch` in data fields.
- Use generic state booleans.
- Do not expose `status`.
- Use `refetch`, not an operation-specific refetch alias.

### Mutation Hooks

Expose the operation verb and selected state:

```ts
return {
  processPayment: mutation.mutate,
  paymentReceipt,
  errorMessage,
  isPending,
  isSuccess,
  isError,
};
```

Expose `reset`, asynchronous execution, failure counts, or other library fields
only when the consumer has a concrete need. Never return the full mutation
object for convenience.

Keep lifecycle behavior in hooks. Split it into hooks such as
`useProcessPaymentSuccess` or `useProcessPaymentError` only when each hook
performs real behavior. Use early returns when branching on `Result`:

```ts
onSuccess: (result) => {
  if (!result.ok) {
    handleError({ error: result.error });
    return;
  }

  handleSuccess({ value: result.value });
},
```

Required business follow-up is not a UI lifecycle reaction. Keep it in the
application use case.

### Synchronous Use Cases

Call synchronous application use cases directly from a hook. Use a
server-state library only for asynchronous server-state operations.

## Result And Error Semantics

The current convention sends `Result<T, E>` through the request library as a
resolved value:

- `ok` is an expected success.
- `err` is an expected application/boundary failure.
- A thrown value is an unexpected defect.

This means a request library may report transport success for both `Result`
branches. Normalize the UI contract:

```ts
const result = query.data;
const hasExpectedError = result?.ok === false;

const isError = query.isError || hasExpectedError;
const isSuccess = query.isSuccess && result?.ok === true;
```

Do not expose the expected error or thrown value. Map both to UI-ready values.
Use a module-level generic defect message unless the operation needs a more
specific fallback.

Define exhaustive translation-key maps in the owning hook file:

```ts
const processPaymentErrorMessageKeys: Record<
  ProcessPaymentError["type"],
  string
> = {
  CardDeclined: "payments.errors.cardDeclined",
  NetworkError: "payments.errors.network",
  OrderAlreadyProcessed: "payments.errors.orderAlreadyProcessed",
};
```

Translate request-result messages in hooks. Let components translate their own
static and visual copy. This gives components strings and flags instead of
architecture-shaped error unions.

The resolved-`Result` convention is intentionally provisional. Do not silently
change to rejected expected errors unless the architecture explicitly changes
that contract.

## Forms And Orchestration

Keep form concerns separated:

1. A schema defines input validation.
2. A form hook selects the schema, defaults, mode, and creates the form object.
3. A mutation hook owns request execution.
4. A focused orchestration hook creates the submit handler.
5. A form component renders the supplied form object.
6. A container wires the orchestration result to the component.

Use this default shape:

```text
usePaymentForm      -> form object
useProcessPayment   -> processPayment + curated request state
usePayment          -> form + onSubmit + fields needed by the container
Payment             -> unpacks and wires
PaymentForm         -> renders
```

Every submitted form gets an orchestration hook, even when the initial
coordination is small. Keep the submit handler there so the form hook does not
depend on the mutation hook and the component does not acquire feature
behavior.

Return the whole form-library object from the form hook. This is an intentional
exception to the curated request-result rule: the form component needs the
library's field registration, validation, and submission APIs as one coherent
object.

Map form values to an application request inside the orchestration hook when
their shapes differ. Keep business validation in the domain/application layer;
the form schema may reuse pure domain predicates to provide immediate feedback.

## Pagination And Optimistic Updates

### Pagination

Put page, cursor, or limit values in the application request when the operation
requires them. Keep the base request hook focused on one request:

```ts
useFetchPaymentHistory(request)
```

Use another focused orchestration hook to own interactive pagination state,
construct each request, and call the base hook. Do not add `Paginated` or
`Infinite` to the request-hook name.

For infinite loading, expose generic capability names:

```ts
return {
  payments,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
};
```

### Optimistic Updates

Keep optimistic cache behavior inside a request hook or focused orchestration
hook. It may use public query keys and request-library cache APIs to:

1. Cancel relevant work.
2. Snapshot cached state.
3. Apply the optimistic value.
4. Roll back on failure.
5. Revalidate after settlement.

Never place this sequence in a component or container. Expose rollback/error
outcomes through the same curated UI contract as any other request behavior.

## Contexts, Providers, And Routing

### Context Flow

Keep the dependency direction explicit:

```text
Context declares value shape
  -> Provider supplies value
    -> dedicated hook reads/interprets value
      -> container consumes hook
        -> component receives UI props
```

Keep context and provider private to their module. Publish the access hook when
another module may consume the capability.

### Provider Bundles

Let a provider import another provider only when building an intentional bundle
for the application entry point. Ordinary providers should supply their own
context or external framework provider.

Compose provider bundles and the root router at the application entry point.
The entry point may also import React mounting APIs and global styles; it does
not compose feature components directly.

### Routing

Allow routing APIs according to role:

- Components may render links or other declarative navigation.
- Hooks may use navigation, params, and route-state hooks.
- Containers obtain routing behavior from hooks.
- Pages remain hook-free.
- Layouts remain router-agnostic slots.
- Routers configure the route tree.

When a group of pages shares one shell, let the router pass its outlet into a
layout slot. Otherwise, let the page compose its own layout.

## Suspense And Error Boundaries

Suspense coordinates rendering for descendants that suspend. It is not a
request-state replacement:

- A normal non-suspending request hook exposes the booleans its consumer needs.
- A hook that always suspends may omit loading booleans.
- Both forms keep the regular `useFetch...` name.
- Never create duplicate normal and Suspense versions for the same use case.

Compose React's `Suspense` directly:

```tsx
<Suspense fallback={<PaymentLoading />}>
  <PaymentContent />
</Suspense>
```

Do not create a component that merely forwards `children` and `fallback` to
`Suspense`.

Expected `Result` errors remain UI values even in a suspending hook. Do not
throw them to an error boundary. Use error boundaries for unexpected
render/runtime failures.

Treat fallbacks as ordinary components under `components/`:

- `PaymentLoading`
- `PaymentError`

Do not add a `Fallback` suffix. Give an error component a required `onRetry`
prop only when its boundary can actually reset or recover the subtree. When
recovery is unavailable, omit the prop entirely.

Compose feature-level boundaries in containers. Put app-shell or route-level
boundaries higher only when they protect framework-level loading or rendering.
Do not require one generic shared error-boundary implementation; use the
application's chosen mechanism.

## Module Reuse And Imports

Treat these folders as public UI surface:

- `components/`
- `containers/`
- `hooks/`
- `layouts/`
- `pages/`
- `query-keys/`

Treat these as module-private:

- `routers/`
- `providers/`
- `contexts/`
- `schemas/`

Keep cross-module imports acyclic. Reuse does not relax role boundaries: a
component importing another module's public component remains valid, while a
component importing that module's public request hook remains invalid.

Use the matrix in `SKILL.md` as an allowlist. If an import is not listed,
refactor toward the owning role instead of broadening access casually.

For complete implementations using TanStack Query, React Hook Form, Zod, and
React Router, read [EXAMPLES.md](EXAMPLES.md).
