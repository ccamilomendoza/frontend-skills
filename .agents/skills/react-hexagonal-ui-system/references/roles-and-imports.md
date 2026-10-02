# Roles and Imports

Use this reference when classifying UI artifacts, choosing names, or reviewing
dependency boundaries.

## Contents

1. [Components](#components)
2. [Containers](#containers)
3. [Hooks](#hooks)
4. [Layouts and pages](#layouts-and-pages)
5. [Routers](#routers)
6. [Providers and contexts](#providers-and-contexts)
7. [Composition](#composition)
8. [Schemas and query keys](#schemas-and-query-keys)
9. [Files and types](#files-and-types)
10. [Dependency matrix](#dependency-matrix)

## Components

Use a component to render:

- UI-oriented props
- accessibility semantics
- static or visual translation copy
- UI-library primitives
- declarative links
- ephemeral presentation state such as focus, tabs, and dropdown visibility

Do not give components domain entities, application errors, use cases, query
objects, or feature decisions. Convert them into exact display values before
crossing the component boundary.

A form component may operate on a supplied form-library object when it is
module-private. Prefer field-level props for public reusable components.

Name components plainly. Keep `<ComponentName>Props` private in the component
file:

```tsx
interface PaymentSummaryProps {
  readonly amount: string;
  readonly onConfirm: () => void;
}

export const PaymentSummary = ({
  amount,
  onConfirm,
}: PaymentSummaryProps) => {
  // Render only.
};
```

Infer its props elsewhere with `ComponentProps<typeof PaymentSummary>` when
needed.

## Containers

Use a container to:

- call one or more behaviorally independent hooks
- unpack curated return values
- pass exact props to components
- compose a genuine child capability implemented as a container
- place a feature-level Suspense or error boundary around a subtree

Do not map errors, translate business outcomes, select business copy, construct
use cases, or coordinate coupled hooks inline. A good container is mechanical.

Use the plain capability name without a `Container` suffix.

## Hooks

Use hooks to own React-facing behavior:

- consume bound application use cases
- integrate request, form, router, and translation libraries
- map entities and errors into UI-ready values
- read and interpret contexts
- coordinate multiple hooks around one capability
- implement lifecycle reactions and cache behavior

Reuse application `Args` or request interfaces when the values belong to the
use-case contract. Use one object parameter named `args` for UI-only
orchestration values. Name its local interface after the capitalized hook:

```ts
interface UseCheckout {
  readonly orderId: string;
}

export const useCheckout = (args: UseCheckout) => {
  // ...
};
```

Do not add an empty args interface. Infer return types. Return named object
fields rather than a bare callable or positional tuple.

## Layouts and Pages

Use a layout for reusable structure:

- own HTML, CSS, responsive placement, and landmarks
- receive rendered content through typed slots
- compose other layouts when the result remains structural

Do not import feature components or containers into a layout. Use a `Layout`
suffix.

Use a page to compose one view from layouts, components, and containers. Keep
pages hook-free. Permit declarative routing primitives when view composition
needs them. Use a `Page` suffix.

## Routers

Use a router to:

- map URLs to pages
- configure redirects
- define route parameters
- attach route-level loading and error elements
- apply one shared structural shell to a route subtree

Keep data fetching and feature behavior out. Use a layout in the route tree only
when several pages share the shell. Keep routers private and use a `Router`
suffix.

## Providers and Contexts

Use context only for cross-tree client UI state. Do not mirror server cache data
in context.

Keep the flow explicit:

```text
context declares shape
  -> provider supplies value
    -> dedicated hook reads and interprets
      -> container consumes
        -> component receives UI props
```

Components and containers do not call `useContext` directly. Providers and
contexts remain private; publish the access hook when another module may consume
the capability.

Let a provider import another provider only to form an intentional bundle for an
application entry point.

## Composition

Use a private composition file to build concrete module dependencies:

```ts
// infrastructure/ui/compositions/payments-composition.ts
const fetchPaymentDetailsAdapter =
  makeHttpFetchPaymentDetailsAdapter({ http });

export const fetchPaymentDetails =
  makeFetchPaymentDetailsUseCase({
    fetchPaymentDetails: fetchPaymentDetailsAdapter,
  });
```

Hooks may import the exported bound callable. Keep adapter imports confined to
composition and other infrastructure implementations.

Use `app/infrastructure/ui/` when composition needs private adapters from
several modules. Prefer an app-owned hook or provider to expose that combined
capability to React. Do not make a feature composition file a loophole into
sibling infrastructure.

## Schemas and Query Keys

Keep form schemas flat under `schemas/`. Name schema values with a
`FormSchema` suffix. Use built-in schema checks for ordinary form feedback.
Pass domain-owned policy values to built-in checks, or use pure domain
predicates in refinements, when the form must enforce an identical business
rule. The domain constructor still decides whether the value is valid.

Export a UI-only `...FormValues` type from the schema only when form values do
not match an application args contract:

```ts
export const paymentFormSchema = z.object({
  paymentId: z.string().min(1),
  amountInMinorUnits: z.number().int(),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
```

Do not expose the schema or this private type through a public component API.

Keep query keys flat under `query-keys/`. Use serializable values and include
every request value that changes the result:

```ts
export const paymentDetailsQueryKey = (
  request: FetchPaymentDetailsArgs,
) => ["payments", "details", request] as const;
```

Query keys are public because mutations and other modules may need stable cache
identity.

## Files and Types

- Declare functions with arrow syntax.
- Use absolute imports for project files.
- Prefer readonly interfaces for UI-owned object contracts.
- Preserve library-controlled callback and return contracts.
- Keep hook helper maps in the owning hook file unless genuinely reused.
- Colocate constants with their owner; do not create a generic UI
  `constants/` folder.
- Use plain `className` strings unless the project has an explicit styling
  standard.

| Concept | Name |
| --- | --- |
| Component or container | Plain capability |
| Hook | `use` + capability |
| Query hook | `useFetch...` |
| Form hook | `use...Form` |
| Layout | `...Layout` |
| Page | `...Page` |
| Router | `...Router` |
| Provider | `...Provider` |
| Context | `...Context` |
| Form schema | `...FormSchema` |
| Query key | `...QueryKey` |
| Error key map | `...ErrorMessageKeys` |
| Loading/error component | Feature + state |

## Dependency Matrix

Treat this matrix as an allowlist:

| Role | May import |
| --- | --- |
| Components | components, presentation hooks, UI/form libraries, declarative router APIs; owned schema types only for a private form contract |
| Containers | components, hooks, independent child containers, React composition APIs |
| Hooks | hooks, bound use cases from composition, application contracts, type-only domain or port inputs reused by a use case, schemas, query keys, hook-oriented libraries; context only in its access hook |
| Layouts | layouts, React types, styles |
| Pages | layouts, components, containers, React composition APIs, declarative router primitives |
| Routers | pages, route fallbacks, router APIs, shared route-tree layouts |
| Providers | owned contexts, React/provider APIs, intentional provider bundles |
| Contexts | React and UI-only contracts declared with the context |
| Compositions | own adapters and application factories; app composition may access explicitly selected modules |
| Schemas | schema library, domain-owned validation constants and pure predicates, compatible application contracts, type-only domain or port inputs reused by a use case |
| Query keys | application request contracts, type-only domain or port inputs reused by a use case |
| App entry | provider bundles, root router, mounting APIs, global styles |

UI roles never import `infrastructure/server/**` directly. The composition file
is the only UI role that constructs adapters. Components and containers never
import use cases.
