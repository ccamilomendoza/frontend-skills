# Routing, Boundaries, and Reuse

Use this reference when placing route logic, layouts, Suspense, error
boundaries, or UI that spans modules.

## Contents

1. [Routing responsibilities](#routing-responsibilities)
2. [Suspense](#suspense)
3. [Error boundaries](#error-boundaries)
4. [Loading and error components](#loading-and-error-components)
5. [Cross-module UI reuse](#cross-module-ui-reuse)

## Routing Responsibilities

Apply routing APIs by role:

- Components may render declarative links.
- Hooks may read params, navigate, and interpret route state.
- Containers obtain routing behavior through hooks.
- Pages compose the resulting view without hooks.
- Layouts receive rendered slots and remain router-agnostic.
- Routers configure paths, redirects, route elements, and shared route shells.

Create a route-aware adapter hook instead of coupling a reusable request hook to
the router:

```ts
export const useCheckoutPaymentDetails = () => {
  const { paymentId } = useParams<"paymentId">();

  return {
    paymentDetailsRequest: paymentId
      ? ({ paymentId } satisfies FetchPaymentDetailsArgs)
      : undefined,
  };
};
```

A container consumes this request and invokes the reusable feature container.

When several pages share one shell, configure the router to pass its outlet into
a structural layout slot. Keep page-specific layouts in the page.

## Suspense

Use React's `Suspense` directly:

```tsx
<Suspense fallback={<PaymentLoading />}>
  <PaymentDetailsContent request={request} />
</Suspense>
```

Do not create a pass-through wrapper around `Suspense`. Place it in a feature
container around the smallest coherent suspending subtree.

Use one `useFetch...` hook per application operation. Choose a suspending or
non-suspending request API based on how that hook is consumed; do not create a
second `Suspense`-suffixed hook.

Expected `Result.err` values do not trigger Suspense error boundaries. Map them
to UI fields and render them in the content subtree.

## Error Boundaries

Use error boundaries for unexpected thrown render/runtime/request defects.

- Put a feature boundary in the container that owns the protected capability.
- Put route or app-shell boundaries higher only for framework-level failures.
- Use the application's selected boundary mechanism; do not require one generic
  shared implementation.
- Provide a retry callback only when the boundary can reset itself or retry the
  failed resource.

A suspending request hook should allow unexpected thrown defects to propagate.
A non-suspending request hook may map request defects into a generic error
message instead. Do not do both for the same failure path.

## Loading and Error Components

Treat fallbacks as ordinary components under `components/`:

- `PaymentLoading`
- `PaymentError`

Do not add a `Fallback` suffix. Keep them presentation-only. Require `onRetry`
only when recovery exists; omit it otherwise.

## Cross-Module UI Reuse

Allow a module to import another module's declared public UI while preserving
role rules and a DAG.

Reuse provider-owned UI when all are true:

- The provider module still owns the capability and language.
- The imported artifact is self-contained.
- The consumer supplies UI props or a published capability contract.
- Reuse does not require importing private schemas, contexts, providers,
  compositions, or adapters.
- The edge does not create a cycle.

Use an app/orchestration module when any are true:

- The view coordinates state or operations from multiple feature modules.
- No single feature clearly owns the resulting user journey.
- Composition requires several modules' private adapters.
- The view would otherwise force reciprocal feature dependencies.

Do not move cross-feature orchestration to `shared`. `shared` is for leaf
primitives; an app module owns fan-out.

Examples:

- `checkout` rendering `payments/components/PaymentMethodBadge`: valid public
  provider-owned UI reuse.
- `checkout` embedding `payments/containers/PaymentSelector`: valid when
  payments still owns the complete selector capability and the graph stays
  acyclic.
- A page that fetches a user, starts checkout, processes payment, and schedules
  delivery: app/orchestration ownership, not any one feature's page.
