# React Hexagonal UI - Open Decisions

This file records decisions intentionally parked while redesigning the
`react-hexagonal-ui` skill. Its contents are not final conventions.

## React Query success and error semantics

### Question to revisit

Should React Query receive a use case's `Result` unchanged, or should the UI
integration translate an error `Result` into a rejected promise so React Query
can represent it through `isError`, `error`, and `onError`?

### Current provisional convention

Keep application errors as values. A mutation use case returns
`Promise<Result<T, E>>`, so React Query's `onSuccess` receives both branches of
the `Result`.

The mutation hook delegates each branch to a dedicated hook. Use an early return
instead of a ternary:

```ts
export const useProcessPayment = () => {
  const handleSuccess = useProcessPaymentSuccess();
  const handleError = useProcessPaymentError();

  return useMutation({
    mutationFn: processPayment,
    onSuccess: (result) => {
      if (!result.ok) {
        handleError(result.error);
        return;
      }

      handleSuccess(result.value);
    },
  });
};
```

Under this convention, React Query's `onError` is reserved for unexpected
thrown defects. Expected application and boundary failures remain in the
`Result` error branch.

### Alternative to evaluate later

Add a UI-boundary translation that unwraps the `Result`:

- An `ok` result resolves with its value.
- An error result rejects with its typed error.
- React Query then owns the request's success/error state and invokes
  `onSuccess` or `onError` according to the translated outcome.

The later discussion must decide whether this translation preserves the
architecture's errors-as-values rule at the application boundary and whether
the resulting React Query error typing remains explicit and reliable.

## Cross-module access across all layers

### Question to revisit

Should the permissive architecture allow direct cross-module imports from every
layer, rather than restricting cross-module access to declared public surfaces?

This would require deciding whether one feature may import another feature's:

- domain entities, services, ports, and constants;
- application use cases;
- infrastructure UI artifacts;
- server adapters, DTOs, schemas, and mappers.

### Current convention

This question does not change the current decision tree.

For now, direct cross-module reuse is limited to:

- `application/use-cases/**` for application behavior;
- the feature-owned public UI surface for reusable components, hooks,
  containers, layouts, and pages.

The module dependency graph remains acyclic. A feature's remaining domain and
server infrastructure stay private, while `shared` remains available for
eligible generic primitives and pure shared logic.

### Concerns to evaluate later

- Whether broad access weakens bounded-context ownership.
- Whether domain imports expose models that should remain context-specific.
- Whether importing server infrastructure couples features to implementation
  details.
- Whether a DAG alone provides a sufficient architectural boundary.
- Whether explicit public surfaces provide enough reuse without opening every
  layer.
