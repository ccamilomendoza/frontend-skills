# React Hexagonal UI - Decision Notes

## Context

We are redesigning the `react-hexagonal-ui` skill from scratch so it explains
how React code should live inside `modules/<module>/infrastructure/ui/` while
remaining compatible with the `hexagonal-frontend-permissive` architecture.

The goal is to keep the React layer easy to unit test and easy to reason about
by separating UI artifacts into explicit roles:

- components for presentation;
- containers for mechanical wiring;
- hooks for behavior, request state, forms, and orchestration;
- layouts for structure;
- pages for app views;
- routers, providers, contexts, schemas, and query keys as supporting UI
  infrastructure concepts.

The skill should explain how query and mutation use cases from the application
layer are consumed by React hooks without letting components or containers
import use cases, adapters, domain models, or server-state libraries directly.
The rules should remain request-library agnostic; TanStack Query can appear as
an example implementation, not as the source of the architecture convention.

This file records the questions already answered during the redesign, the
current unanswered questions, and the parked decisions that should be revisited
later.

## Answered Questions

### Module placement

**Should UI artifacts always live inside a module folder?**

Yes. Every UI artifact belongs under a module, either `shared` or a specific
bounded-context module.

**Can pages/layouts live outside modules?**

No. Pages and layouts also live under a module.

**Can `shared` own pages?**

No. `shared` can own generic reusable UI, but feature pages belong to feature
modules. Cross-context app views belong to an explicit app/orchestration module.

### Pages

**What is a page?**

A page groups containers and components to fulfill one app view feature.

**Should pages call hooks or use cases?**

No. Pages are thin composition only.

**Can pages compose layouts, components, and containers?**

Yes. Pages may compose them into a view.

**Should pages use a suffix?**

Yes. Pages use the `Page` suffix, for example `CheckoutPage`.

### Layouts

**What is a layout?**

A layout owns HTML/CSS structure, responsive arrangement, and typed slots.

**Can layouts import components or containers directly?**

No. Layouts receive rendered components/containers through props.

**Can layouts use hooks, use cases, adapters, or domain logic?**

No. Layouts are structural only.

**Should layouts use a suffix?**

Yes. Layouts use the `Layout` suffix, for example `CheckoutLayout`.

### Containers

**Should containers use the `Container` suffix?**

No. Containers use plain capability names. The folder communicates the role.

**What should containers do?**

Containers call hooks, pass values/actions into components, and compose
components when needed.

**Should containers perform business interpretation?**

No.

**Should containers perform request-error mapping?**

No.

**Should containers perform presentation mapping, such as deciding button text?**

No. Presentation decisions belong in components.

**Can containers call multiple hooks?**

Yes, when the hooks are behaviorally independent.

**When should behavior be moved out of a container?**

When hooks need to coordinate a flow, create a focused orchestration hook
instead of wiring behavior inline in the container.

**Should containers unpack hook returns before passing props to components?**

Yes. Components receive the props they need, not whole hook result objects.

**Can containers pass a form object to a form component?**

Yes, when it is the form object created/configured by the form hook.

### Components

**What should components receive?**

Components receive UI-oriented props, not domain/application entities.

**Why not pass domain/application entities to components?**

Because component contracts should describe what the UI renders, not the shape
of the domain model that happened to supply the data.

**Can components receive expected error objects?**

No. Errors are mapped before reaching components.

**Can components call translation hooks?**

Yes. Components may translate their own visual/static copy.

**Can components call UI-library or accessibility hooks?**

Yes. Presentation-only hooks are allowed.

**Can components own local state?**

Yes, for presentation mechanics such as dropdown state, active tabs, focus, or
uncontrolled visual input state.

**Can components own feature state, request state, or business decisions?**

No.

**Can form components use the form-library object directly?**

Yes. This should be documented in a library-agnostic way, so it can apply to
React Hook Form, TanStack Form, or another form library.

### Hooks

**What do hooks own?**

Hooks own behavior, request state, form setup, error mapping, and coordination
between UI-facing operations.

**Should hooks return the full `useQuery` result?**

No. Query hooks expose a curated contract.

**Should hooks return the full `useMutation` result?**

No. Mutation hooks expose a curated contract.

**Can query/mutation hooks return fields from TanStack Query when needed?**

Yes. They may return any needed field/action, but each field must be selected
intentionally.

**Should query hooks accept external TanStack options, such as `enabled`?**

No. Query/request-library configuration is derived inside the hook from the
request, route or context values, or internal hook state.

**Should mutation hooks accept external TanStack options?**

No. Mutation/request-library configuration, lifecycle callbacks, invalidation,
navigation, and notifications live inside the hook or composed lifecycle hooks.

**Should request hooks keep the application use-case verb?**

Yes. `FetchUserProfileUseCase` becomes `useFetchUserProfile`, and
`ProcessPaymentUseCase` becomes `useProcessPayment`.

**Should query hook data fields repeat the verb?**

No. Use the noun only, for example `userProfile`.

**Should collection query data fields be plural nouns?**

Yes, for example `users`, `orders`, or `paymentMethods`.

**Should mutation action fields use the operation verb?**

Yes, for example `processPayment`, `createOrder`, or `updateUserProfile`.

**When a mutation returns data, should the data field be generic `result`?**

No. Use a specific noun such as `paymentReceipt` or `createdOrder`.

**Should hook error message fields be operation-specific?**

No. Use generic names such as `errorMessage`.

**Should hooks expose original expected error objects?**

No. Hooks expose UI-ready values such as `errorMessage`, `fieldErrors`, or
specific UI-ready flags.

**Should hooks expose unexpected thrown errors?**

No. Unexpected thrown errors are also mapped before leaving hooks.

**How should unexpected thrown errors be messaged?**

Use a module-level generic message by default. Use an operation-level fallback
message when the operation needs more specific copy.

**Where should hook-owned error translation happen?**

Inside hooks. Components translate their own visual/static copy; hooks translate
request-result and unexpected-error messages.

**Should error maps store rendered strings or translation keys?**

Translation keys.

**How should error translation-key maps be named?**

Use the `MessageKeys` suffix, for example `processPaymentErrorMessageKeys`.

**What should the error map key type be?**

Use the error discriminant union, for example
`Record<ProcessPaymentError["type"], string>`.

**Can hooks compose other hooks?**

Yes. Hooks may compose other hooks.

**Can orchestration hooks compose other orchestration hooks?**

Yes, sparingly, when it reflects a real UI capability.

**Should hook return types be explicit?**

No. Infer hook return types by default.

**Can hooks return nested objects?**

Yes, when nesting preserves meaningful concepts.

### Hook parameters and types

**Should hooks redefine use-case request types as UI-specific args?**

No. Reuse the use-case request/args types when the hook receives use-case data.

**Should mutation operation functions receive the use-case request type?**

Yes.

**What should query hook parameters be called when they reuse use-case request
types?**

Use `request`.

**What should orchestration hooks call UI-only parameters?**

Use `args`.

**Should UI-only hook args be typed as interfaces?**

Yes.

**How should UI-only hook args interfaces be named?**

Use the capitalized hook name without `Args`, `Props`, `Input`, or `Request`.
For example, `interface UseCheckout`.

**Should hooks with no args define empty interfaces?**

No.

**Should hook args be a single object argument?**

Yes, whenever args exist.

### Query hooks

**Should query hooks bind request data immediately?**

Yes. Query hooks receive the request and use it to create the query function.

**Should query hooks expose `status`?**

No. Expose generic booleans such as `isPending`, `isFetching`, `isSuccess`, and
`isError`.

**Should request-state library names define the skill rules?**

No. Rules are request-library agnostic. TanStack Query may be used in examples,
but the convention is to expose curated UI hook contracts instead of raw
library results.

**Should query keys be inline arrays?**

No. Query keys should be named reusable definitions.

**How should query key files be organized?**

Query key definitions are flat under `query-keys/`; they do not need same-name
leaf folders.

**Should query keys use a suffix?**

Yes. Use `QueryKey`, for example `userProfileQueryKey`.

**Are query keys public across modules?**

Yes. Query keys are public UI surface so other modules can invalidate owned
queries without duplicating keys.

**Should query hooks expose semantic refetch names?**

No. Use the generic name `refetch`. The hook name already provides the
operation context.

**Should infinite and paginated query hooks use special names?**

No. Keep the normal `useFetch...` hook name. Pagination or infinite loading is
represented by the hook contract, not by adding `Infinite` or `Paginated` to the
hook name.

**For paginated queries, where does pagination info come from?**

Pagination info is passed through the request. The hook reuses the use-case
request shape, and page/cursor values are part of that request when the use case
needs them.

**Who owns interactive pagination state?**

A focused orchestration hook owns interactive pagination state and builds the
request passed to the base `useFetch...` query hook.

**What names should infinite-loading hooks expose?**

Use generic page-loading names such as `fetchNextPage`, `hasNextPage`, and
`isFetchingNextPage`. These names describe the UI capability and are not tied to
one request-state library.

### Mutation hooks

**What is the default mutation hook contract?**

Expose the operation function with the operation name and expose the needed
curated fields. With TanStack Query, this usually means aliasing `mutate`:

```ts
return {
  processPayment: mutation.mutate,
  errorMessage,
  isPending,
  isSuccess,
  isError,
};
```

**Should mutation hooks expose `reset` by default?**

No. The broader rule is that mutation hooks expose only what the situation
needs from the request-state library result.

**Should `mutateAsync` be exposed by default?**

No. Expose it only when genuinely needed.

**Can mutation hooks compose success/error lifecycle hooks?**

Yes, when those hooks perform real behavior.

**Should empty lifecycle hooks be created for uniformity?**

No.

**What should mutation success/error lifecycle hooks own?**

UI reactions such as cache invalidation, navigation, analytics, or
notifications.

**Where does required business follow-up belong?**

In the use case, not in mutation lifecycle hooks.

**Should optimistic updates be part of this skill?**

Yes, but only as a boundary rule. Optimistic updates belong inside request hooks
or focused orchestration hooks, never in containers/components. They may use
public query keys or request-library APIs to update cache state, and rollback or
error UI still leaves the hook through a curated UI contract.

The final `EXAMPLES.md` should include examples for optimistic updates.

### React Query result semantics

**Should expected `Result` failures be treated as thrown errors for now?**

No. Current provisional convention keeps `Result` as a resolved value.

**How should hooks normalize booleans under the current convention?**

Because React Query sees resolved error results as success, hooks derive UI
booleans from both the query/mutation state and the `Result` branch.

**What is React Query `onError` for under the current convention?**

Unexpected thrown defects.

**Should this convention be revisited later?**

Yes. It is parked in `react-hexagonal-ui-open-decisions.md`.

### Form schemas and forms

**Where do form schemas live?**

In `infrastructure/ui/schemas/`.

**Should UI form schemas use a suffix?**

Yes. Use `FormSchema`, for example `paymentFormSchema`.

**Do form schemas need same-name leaf folders?**

No. Schema files are flat under `schemas/`.

**Where should feature form state live?**

In hooks.

**Should form hooks call mutation/query hooks directly?**

No by default.

**How should form state and request execution be coordinated?**

Create a third orchestration hook.

**What is the default split for submitted forms?**

`usePaymentForm` creates/configures the form object, `useProcessPayment` owns
the mutation, and `usePayment` coordinates submit behavior.

**Should form hooks use the `Form` suffix?**

Yes.

**Should form hooks create/configure the form-library instance?**

Yes.

**Should form hooks own schema selection, default values, and validation mode?**

Yes.

**Where should submit handlers live?**

Always in orchestration hooks.

**Does every submitted form need an orchestration hook?**

Yes.

**Can form hooks return the whole form-library object?**

Yes.

### Orchestration hooks

**How should orchestration hooks be named?**

Use the plain capability name, such as `usePayment`, without `Flow`,
`Controller`, `Submit`, or `Orchestrator` suffixes.

**Should a container always call exactly one orchestration hook?**

No. Avoid creating a single oversized hook just to match a container.

**When should an orchestration hook be created?**

When multiple hooks need to coordinate a meaningful behavior or flow.

### Pure/sync use cases

**Should pure synchronous use cases be wrapped in React Query?**

No. Call them directly from hooks. TanStack Query is reserved for async
server-state operations.

### Routers

**Should routers be a UI concept?**

Yes. Routers live under `routers/`.

**What is a router's role?**

A router is UI infrastructure around routing libraries. It maps URLs to pages,
applies route-level layouts, redirects, and extracts route params.

**Can routers fetch data or contain feature logic?**

No.

**Should routers use a suffix?**

Yes. Use `Router`.

**Can routers import pages from other modules?**

Yes, through public page surfaces.

**Can UI artifacts use React Router or TanStack Router directly?**

Yes, according to role restrictions. Hooks may use routing hooks, components may
render declarative links, containers keep routing logic inside hooks, layouts
remain slot-only, and pages remain hook-free.

**Are routers public UI surface?**

No. Routers are private to the owning app/navigation module.

### Providers

**Should providers be a UI concept?**

Yes. Providers live under `providers/`.

**What do providers own?**

Providers compose framework contexts and children, such as query, router, and
theme providers.

**Can providers contain feature behavior?**

No.

**Should providers use a suffix?**

Yes. Use `Provider`.

**Are providers public UI surface?**

No.

### Contexts

**Should contexts be a UI concept?**

Yes. Contexts live under `contexts/` inside the bounded context that needs them.

**What do contexts own?**

Contexts define typed React context only.

**Who supplies context values?**

Providers.

**Who reads and interprets context values?**

Hooks.

**Can components or containers call `useContext` directly?**

No.

**Should contexts use a suffix?**

Yes. Use `Context`.

**Are contexts public UI surface?**

No. Sibling modules consume public hooks instead of importing contexts.

**What kind of state should contexts hold?**

Cross-tree client UI state only. Do not duplicate server state already owned by
React Query.

### Cross-module UI reuse

**Can UI artifacts be reused across modules?**

Yes, through the public UI surface and an acyclic dependency graph.

**What is currently public UI surface?**

`components/`, `containers/`, `hooks/`, `layouts/`, `pages/`, and
`query-keys/`.

**What is currently private UI surface?**

`routers/`, `providers/`, `contexts/`, and `schemas/`.

**Does cross-module reuse change role restrictions?**

No. Role restrictions are the same for local and cross-module imports.

### UI dependency matrix

**What may components import?**

Components may import other components, presentation-only hooks such as
translation and accessibility hooks, form-library APIs when rendering a
supplied form object, and router APIs for navigation or route-aware
presentation.

Components do not import containers, pages, layouts, request or orchestration
hooks, contexts, use cases, adapters, or domain concepts.

**What may containers import?**

Containers may import components; request, form, context-access, presentation,
and orchestration hooks; other containers when composing an independently
reusable child capability; and React APIs such as `Suspense`.

Containers do not import pages, layouts, contexts directly, schemas, query
keys, use cases, adapters, or domain concepts. They access routing behavior
through hooks.

**What may hooks import?**

Hooks may import other hooks; application use cases and their request/result
contracts; form schemas and query keys; and request, form, routing,
translation, and other React hook APIs. Only a dedicated context-access hook
imports its context.

Hooks do not import components, containers, layouts, pages, routers, providers,
adapters, or domain concepts directly.

**What may layouts import?**

Layouts may import other layouts when composing reusable structural regions,
plus React types and styling assets or utilities. All rendered feature content
arrives through typed props.

Layouts do not import components, containers, hooks, pages, routers, providers,
contexts, schemas, query keys, use cases, adapters, or domain concepts.

**What may pages import?**

Pages may import layouts, components, containers, React composition APIs, and
declarative router primitives when required. Pages do not call routing hooks.

Pages do not import other pages, hooks, routers, providers, contexts, schemas,
query keys, use cases, adapters, or domain concepts.

**What may routers import?**

Routers may import pages, including public pages from other modules;
route-level loading and error components; router-library APIs; and layouts used
as structural shells shared by multiple pages in a route subtree. Page-specific
layouts remain composed by their page.

Routers do not import containers, hooks, providers, contexts, schemas, query
keys, use cases, adapters, or domain concepts. Providers and routers are
composed together at the application entry point instead of importing each
other.

**What may providers import?**

Providers may import their owned contexts, React APIs, external
provider-library APIs, and other providers only when creating an intentional
provider bundle for the application entry point.

Providers do not import components, containers, hooks, layouts, pages, routers,
schemas, query keys, use cases, adapters, or domain concepts.

**What may contexts import?**

Contexts may import only React and UI-only state contracts declared in the same
context file.

Contexts do not import other UI concepts, application use cases, adapters, or
domain concepts. Providers supply their values, and dedicated hooks consume
them.

**What may form schemas import?**

Form schemas may import their schema-validation library, pure domain validation
functions when reusing the same business rule, and application request
contracts when needed to verify schema compatibility.

Schemas do not import other UI concepts, use cases, ports, or adapters. They
define validation and do not coordinate behavior.

**What may query keys import?**

Query keys may import only application request contracts needed by typed key
factories.

Query keys do not import hooks, request-library APIs, other UI concepts, use
cases, adapters, ports, or domain concepts. They remain pure serializable key
definitions.

**What may the application entry point import?**

The application entry point may import provider bundles or individual
providers, the root router, React mounting APIs, and global styles.

It does not import feature components, containers, hooks, use cases, adapters,
or domain concepts directly. It only assembles the UI runtime.

### Folder conventions

**Do first-level UI concepts use plural folders?**

Yes: `components/`, `containers/`, `hooks/`, `layouts/`, `pages/`,
`routers/`, `providers/`, `contexts/`, `schemas/`, and `query-keys/`.

**Do UI artifacts use same-name leaf folders?**

Yes for components, containers, hooks, layouts, pages, routers, providers, and
contexts.

**Do schemas and query keys use same-name leaf folders?**

No. They are flat files inside `schemas/` and `query-keys/`.

**Does the UI define a dedicated `constants/` concept?**

No. Constants stay colocated with the concept that owns them. Established
concepts such as query keys keep their existing placement.

**Should each same-name artifact folder contain only the main artifact file?**

Yes by default.

**Where do hook-specific helper maps/functions live?**

Inside the hook file.

**Should this skill define testing folders?**

No. Testing conventions will be handled by a separate unit-test skill.

### Props and interfaces

**Where should component prop contracts live?**

Inside the same component file.

**Should prop contracts use `interface` or `type`?**

Use `interface`.

**Does the `interface` rule apply across UI artifacts?**

Yes. Component, container, layout, page, provider, router, and hook UI-only arg
contracts use interfaces.

**Should React prop interfaces be exported?**

No by default. If another file needs the shape, use React utility types such as
`ComponentProps<typeof PaymentForm>`.

**How should component-like prop interfaces be named?**

Use the `Props` suffix, for example `PaymentFormProps`.

### Translation and error mapping

**Where should request error mapping happen by default?**

Inside hooks.

**What should components receive for errors?**

UI-ready values such as `errorMessage`, `fieldErrors`, or UI-ready flags.

**Can components translate their own visual copy?**

Yes.

**Can hooks translate request-result copy?**

Yes.

### Suspense and error boundaries

**Should Suspense and error boundaries be in scope for this skill?**

Yes. Suspense should receive a complete description because it is a core React
concept. Error boundaries should also be described as the mechanism for
unexpected render/runtime failures.

**Does Suspense replace hook request contracts?**

No. Suspense is a rendering coordination mechanism. Hooks still expose curated
contracts unless a specific Suspense-oriented hook pattern is explicitly shown
in examples.

**Can Suspense-only hooks omit loading booleans?**

Yes. A hook explicitly designed to suspend may omit loading booleans when it is
always rendered under a Suspense boundary. Normal request hooks still expose the
curated booleans needed by their consumers.

**Should Suspense request hooks use a `Suspense` suffix or duplicate the normal
hook?**

No. Use one request hook per use case. If that hook is Suspense-based, keep the
normal `useFetch...` name and document/compose it under a Suspense boundary.

**Do Suspense-based request hooks throw expected
request/domain/application errors to error boundaries?**

No. Suspense handles loading, while expected errors remain mapped inside hooks
into UI-ready values such as `errorMessage`, `fieldErrors`, or flags. Error
boundaries are for unexpected render/runtime failures.

**Where do Suspense and error boundary artifacts live?**

They are components under `components/`, not a separate first-level UI concept.

**Where should boundaries be composed?**

Feature-level Suspense and error boundaries are composed by containers. This
keeps the boundary scope aligned with the smart UI feature area while pages stay
thin and layouts stay structural.

App-shell or route-loading boundaries may live higher, such as in routers,
providers, or pages, only when they protect framework-level loading/rendering
rather than feature behavior.

**Should Suspense fallback UI be inline JSX?**

No. Suspense fallbacks should be components.

**Should the UI define a generic wrapper around React's `Suspense`?**

No. Containers should use React's `Suspense` component directly and pass a
fallback component. A custom component is justified only when it adds meaningful
shared behavior instead of forwarding the same props to `Suspense`.

**Should error boundary fallback UI be inline JSX?**

No. Error boundary fallbacks should be components.

**How are fallback components named?**

Use plain feature-specific state names such as `PaymentLoading`,
`PaymentError`, `UserProfileLoading`, and `UserProfileError`. Do not add a
`Fallback` suffix.

**Do error fallback components always receive an optional retry callback?**

No. When recovery is supported, the fallback declares a required `onRetry`
prop. When recovery is not possible, it does not declare the prop.

**Should the skill prescribe a generic shared `ErrorBoundary` component?**

No. The skill describes error-boundary responsibilities and composition without
requiring a shared implementation or a particular library abstraction.

### Final documentation structure

**How should the final skill content be divided?**

- `SKILL.md` contains concise rules, UI roles, the dependency matrix, and
  decision guidance.
- `REFERENCE.md` contains deeper explanations, contracts, folder structure, and
  edge cases.
- `EXAMPLES.md` contains complete code examples for queries, mutations, forms,
  orchestration, pagination, optimistic updates, contexts, routing, and
  Suspense.

**Should `EXAMPLES.md` use disconnected snippets or one coherent feature?**

Use one coherent payments/checkout feature so query, mutation, form,
orchestration, pagination, optimistic update, context, routing, layout, page,
container, and Suspense examples demonstrate their real import and composition
boundaries together.

**Which concrete libraries should `EXAMPLES.md` use?**

Use TanStack Query for request hooks, React Hook Form for form state, Zod for
form schemas, and React Router for routing. Label these as replaceable
implementations rather than architectural requirements.

**Should the React examples show adapter construction or use-case binding?**

No. `EXAMPLES.md` starts from already-composed callable use cases supplied by
the surrounding hexagonal architecture and focuses only on consuming those
callables through hooks.

**How should `EXAMPLES.md` organize the coherent feature?**

Use focused sections that share the same payments contracts:

1. Query hook and container.
2. Mutation hook and error mapping.
3. Form hook plus orchestration hook.
4. Pagination orchestration.
5. Optimistic update.
6. Context and provider.
7. Router, layout, page, and Suspense composition.

Each section shows its complete relevant artifacts without repeating the whole
feature.

**Should `EXAMPLES.md` include a synchronous use-case hook?**

Yes. Include a short example showing a synchronous use case called directly
from a hook without wrapping it in TanStack Query.

**Where should the canonical UI folder structure be documented?**

Put the complete structure in `SKILL.md` because it is a core architectural
rule. Do not duplicate the full tree in `EXAMPLES.md`; use file-path headings
there to demonstrate placement.

## Unanswered Questions

There are no active unanswered questions for the React UI redesign.

## Parked Questions

These questions are intentionally parked and recorded in
`react-hexagonal-ui-open-decisions.md`.

1. Should React Query own expected request errors by receiving unwrapped
   rejected errors instead of resolved `Result` values?
2. Should all layers allow direct cross-module imports, instead of limiting
   access to declared public surfaces?
