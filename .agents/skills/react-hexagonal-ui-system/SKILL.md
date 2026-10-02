---
name: react-hexagonal-ui-system
description: Structure, implement, review, or refactor React and TypeScript code inside a functional-first hexagonal frontend's infrastructure/ui layer. Use for deciding between components, containers, hooks, layouts, pages, routers, providers, contexts, schemas, query keys, and composition roots; adapting application use cases to TanStack Query or another request library; orchestrating forms and mutations; implementing pagination or optimistic updates; and placing Suspense, error boundaries, routing, and cross-module UI reuse without violating hexagonal dependencies.
---

# React Hexagonal UI

Implement React as an inbound infrastructure adapter around application use
cases. Keep domain and application code unaware of React, request libraries,
forms, routers, contexts, and presentation concerns.

Apply this skill together with the surrounding frontend architecture. When both
system variants are available, use `hexagonal-frontend-permissive-system` for
module and layer rules.

## Workflow

1. Confirm the owning bounded context.
2. Classify each artifact by the responsibility it owns.
3. Build or locate the module's bound use cases in a private composition file.
4. Consume application operations only from hooks.
5. Give request hooks curated UI contracts.
6. Move coupled behavior into a focused orchestration hook.
7. Keep containers mechanical and components presentation-oriented.
8. Place routing, context, Suspense, and boundaries at the narrowest useful
   scope.
9. Check imports and public/private UI surfaces.

## Canonical Structure

```text
src/modules/<module>/infrastructure/ui/
  components/
    payment-form/payment-form.tsx
  containers/
    payment/payment.tsx
  hooks/
    use-payment/use-payment.ts
    use-payment-form/use-payment-form.ts
    use-process-payment/use-process-payment.ts
  layouts/
    checkout-layout/checkout-layout.tsx
  pages/
    checkout-page/checkout-page.tsx
  routers/
    checkout-router/checkout-router.tsx
  providers/
    checkout-provider/checkout-provider.tsx
  contexts/
    checkout-context/checkout-context.ts
  compositions/
    payments-composition.ts
  schemas/
    payment-form-schema.ts
  query-keys/
    payment-details-query-key.ts
```

Use plural first-level concept folders. Give every artifact except schemas,
query keys, and composition files a same-name leaf folder containing one main
file.

## Role Selection

| Role | Own |
| --- | --- |
| Component | Rendering, UI-oriented props, accessibility, visual local state |
| Container | Mechanical hook-to-component wiring and subtree composition |
| Hook | React behavior, request/form/router APIs, context access, UI mapping |
| Layout | Structural HTML/CSS and typed rendered slots |
| Page | Hook-free composition of one app view |
| Router | Route tree, redirects, route shells, route-level elements |
| Context | Typed cross-tree UI-state channel |
| Provider | Context or external framework value |
| Composition | Concrete adapters and bound application use cases |
| Schema | UI/form input parsing and immediate feedback |
| Query key | Serializable request-cache identity |

Keep domain entities, application errors, request-library objects, and use cases
out of components. Let containers call hooks and pass exact UI values/actions.
Put coupled behavior in hooks rather than containers.

Read [roles-and-imports.md](references/roles-and-imports.md) for detailed role,
naming, public-surface, and import rules.

## Composition and Use-Case Access

Bind infrastructure adapters to application factories in a private
`compositions/` file:

```ts
export const fetchPaymentDetails = makeFetchPaymentDetailsUseCase({
  fetchPaymentDetails: makeHttpFetchPaymentDetailsAdapter({ http }),
});
```

Let hooks import the bound callable from composition. Do not pass HTTP clients,
repositories, adapters, React events, router objects, or request-library options
into a use case.

For a graph requiring multiple modules' private adapters, compose it in a
neutral `app/infrastructure/ui/` root and expose the resulting callable through
an app-owned hook or provider. Do not let one feature's composition import
another feature's private adapter.

## Request Hooks

Keep request-library APIs inside hooks. Do not return a complete query or
mutation object and do not accept a generic external options object.

For queries:

- Name the hook after `Fetch...UseCase`.
- Receive an application request object.
- Bind it to the no-argument callback required by the request library.
- Return noun data fields, selected generic booleans, UI-ready errors, and
  `refetch` when required.

For mutations:

- Expose the exact application verb such as `processPayment`.
- Return specifically named data and only the state consumers need.
- Keep lifecycle reactions, cache work, navigation, analytics, and
  notifications in hooks.
- Keep required business follow-up inside the use case.

Treat `Result.err` as an expected resolved outcome and thrown values as
unexpected defects. In a normal hook, map both to UI-ready fields. In a hook
using a suspending request API, keep expected `Result` errors as UI values but
allow unexpected thrown defects to reach the nearest error boundary.

Read [requests-and-errors.md](references/requests-and-errors.md) for complete
contracts, error normalization, pagination, and optimistic-update rules.

## Forms and Orchestration

Separate each submitted form into:

```text
schema -> form hook -> mutation hook
                    \-> orchestration hook -> container -> component
```

Let the form hook create the form-library object. Let the orchestration hook own
the submit handler and map form values into application args. Let the component
render only the contract it receives.

Destructure the values returned by hooks when consuming their fields
individually. Keep a returned object intact when passing it through as one
contract, such as a form-library object supplied to a component.

Use the schema library's built-in checks for immediate form feedback on types,
required fields, and common formats. For an exact domain rule, pass a
domain-owned policy value to a built-in check when possible, or reuse a pure
domain predicate through a refinement. The use case still invokes the domain
constructor; form validation does not establish domain validity.

Avoid duplicated form-value interfaces:

- Reuse the use-case input type when the form shape matches it exactly,
  including when that input is an existing domain or port request type.
- Otherwise export a UI-only `...FormValues` type from the owned schema file and
  use it in the form hook.
- Permit a same-module form component to import that type only for typing a
  supplied form-library object.
- For a public cross-module component, expose field-level UI props instead of a
  prop type that leaks a private schema or form library.

Read [forms-and-state.md](references/forms-and-state.md) for form, context,
provider, and orchestration patterns.

## Suspense, Routing, and Reuse

- Keep route-tree configuration in routers and route-state behavior in hooks.
- Keep pages hook-free and layouts structural.
- Compose feature-level Suspense and error boundaries in containers.
- Use app- or route-level boundaries for framework-level failures.
- Use `useFetch...` for both suspending and non-suspending versions; do not add a
  `Suspense` suffix.
- Use ordinary components for loading and error fallbacks.
- Reserve error boundaries for unexpected thrown defects.

Reuse another module's public UI when that UI remains a self-contained
capability owned by the provider. Move the view to an app/orchestration module
when it coordinates behavior or state from multiple modules and no feature
clearly owns the combined experience.

Read [routing-boundaries-and-reuse.md](references/routing-boundaries-and-reuse.md)
for routing, Suspense, error-boundary, and cross-module placement details.

## Public Surface

Allow cross-module imports from:

- `components/`
- `containers/`
- `hooks/`
- `layouts/`
- `pages/`
- `query-keys/`

Keep private:

- `routers/`
- `providers/`
- `contexts/`
- `compositions/`
- `schemas/`

Public availability does not override role rules. A component may import a
public component, but it may not import a public request hook.

## Examples

- Read [request-examples.md](references/request-examples.md) for query,
  mutation, and error-mapping implementations.
- Read [form-and-routing-examples.md](references/form-and-routing-examples.md)
  for form orchestration, context, layout, page, router, and Suspense examples.
- Read [cache-examples.md](references/cache-examples.md) for pagination and
  optimistic updates.
