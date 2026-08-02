# Requests and Errors

Use this reference when adapting application operations to a request library,
normalizing `Result`, selecting hook returns, paginating, or updating caches.

## Contents

1. [Bound callables](#bound-callables)
2. [Query hooks](#query-hooks)
3. [Mutation hooks](#mutation-hooks)
4. [Result semantics](#result-semantics)
5. [Suspending hooks](#suspending-hooks)
6. [Synchronous use cases](#synchronous-use-cases)
7. [Pagination](#pagination)
8. [Optimistic updates](#optimistic-updates)

## Bound Callables

Import a bound application callable from private composition:

```ts
import { fetchPaymentDetails } from
  "@/modules/payments/infrastructure/ui/compositions/payments-composition";
```

Keep the use-case function free of React and request-library contracts:

```ts
const queryFn = () => fetchPaymentDetails(request);
```

Do not pass a React event, query options, `AbortSignal`, router object, or query
client into the use case unless the application contract independently owns
that concept.

## Query Hooks

Name a query hook after its `Fetch...` operation:

```ts
export const useFetchPaymentDetails = (
  request: FetchPaymentDetailsArgs,
) => {
  const query = useQuery({
    queryKey: paymentDetailsQueryKey(request),
    queryFn: () => fetchPaymentDetails(request),
  });

  // Normalize and curate.
};
```

Expose:

- singular noun data for one value
- plural noun data for collections
- only required generic state such as `isPending`, `isFetching`, `isSuccess`,
  and `isError`
- `refetch` when a consumer needs manual retry
- UI-ready messages or field errors

Do not expose:

- the complete query object
- `status`
- the original entity when the component needs only display fields
- original application errors or thrown values
- a generic external options object

Derive enablement, retry, stale timing, and request callbacks inside the hook
from its typed request, route/context values, or focused orchestration state.

## Mutation Hooks

Expose the exact operation verb:

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

Return `mutateAsync`, `reset`, failure counts, or other library fields only when
a consumer has a concrete need.

Keep UI lifecycle reactions in hooks:

- navigation
- notifications
- analytics
- query invalidation
- local UI-state updates

Split a lifecycle helper into `useProcessPaymentSuccess` or
`useProcessPaymentError` only when it performs real behavior. Do not create
empty indirection.

Keep mandatory business follow-up in the application use case. A UI lifecycle
callback is not a reliable business transaction boundary.

## Result Semantics

Assume the application returns `Result<T, E>`:

- `ok` is expected success.
- `err` is expected application or boundary failure.
- a thrown value is an unexpected defect.

Request libraries normally see both `Result` branches as resolved data.
Normalize them:

```ts
const result = query.data;
const expectedError = result?.ok === false
  ? result.error
  : undefined;

const isSuccess = query.isSuccess && result?.ok === true;
const isError = query.isError || expectedError !== undefined;
```

Map expected errors exhaustively:

```ts
const fetchPaymentDetailsErrorMessageKeys: Record<
  FetchPaymentDetailsError["type"],
  string
> = {
  NetworkError: "payments.errors.network",
  ParseError: "payments.errors.invalidResponse",
  PaymentNotFound: "payments.errors.notFound",
};
```

Translate application/request outcomes in the hook. Let a component translate
its own static visual copy.

In a non-suspending hook, map a thrown defect to one generic UI message:

```ts
const errorMessage = expectedError
  ? t(fetchPaymentDetailsErrorMessageKeys[expectedError.type])
  : query.isError
    ? t("payments.errors.unexpected")
    : undefined;
```

Do not silently convert expected `Result.err` values into rejected requests
unless the surrounding architecture explicitly changes its contract.

## Suspending Hooks

Use the request library's suspending API when the subtree is intentionally
protected by Suspense and an error boundary.

- Keep the normal `useFetch...` name.
- Omit loading booleans when the hook always suspends until data exists.
- Keep expected `Result.err` as a value and map it to UI fields.
- Let unexpected thrown defects propagate to the nearest error boundary.
- Do not catch a defect merely to turn it into a value and then expect the
  boundary to render.

This is the exception to the normal rule of mapping unexpected request defects
inside the hook. The boundary owns their presentation and recovery.

## Synchronous Use Cases

Call synchronous use cases directly:

```ts
export const useCalculatePaymentTotal = () => {
  const { t } = useTranslation();

  const calculatePaymentTotal = (
    args: CalculatePaymentTotalArgs,
  ) => {
    const result = calculatePaymentTotalUseCase(args);

    if (!result.ok) {
      return {
        total: undefined,
        errorMessage: t(
          calculatePaymentTotalErrorMessageKeys[result.error.type],
        ),
      };
    }

    return {
      total: {
        amountInMinorUnits: result.value.amount.minorUnits,
        currency: result.value.amount.currency,
      },
      errorMessage: undefined,
    };
  };

  return { calculatePaymentTotal };
};
```

Do not wrap pure synchronous coordination in a server-state library.

## Pagination

Put page, cursor, and limit values in application args when the operation owns
them. Keep one base request hook:

```ts
useFetchPaymentHistory(request)
```

Use a focused orchestration hook to own interactive page state and construct
the current request. Do not add `Paginated` or `Infinite` to the base hook name.

For infinite loading, expose generic capabilities:

```ts
return {
  payments,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
};
```

## Optimistic Updates

Keep cache mechanics inside a request or focused orchestration hook:

1. Cancel affected requests.
2. Snapshot the cached `Result`.
3. Apply an optimistic replacement.
4. Roll back on an expected `Result.err`.
5. Roll back on a thrown defect.
6. Revalidate after settlement.

Expected failures do not reach the request library's thrown-error callback, so
handle rollback from the resolved `Result` lifecycle as well.

Use public query keys and preserve the exact cached value type. Never place this
sequence in a component or container.
