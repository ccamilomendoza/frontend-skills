# Cache Examples

Use these examples for paginated query orchestration and optimistic mutation
rollback with `Result`-returning use cases.

## Contents

1. [Paginated query](#paginated-query)
2. [Pagination orchestration](#pagination-orchestration)
3. [Optimistic update](#optimistic-update)

## Paginated Query

```ts
// query-keys/payment-history-query-key.ts
export const paymentHistoryQueryKey = (
  request: FetchPaymentHistoryArgs,
) => ["payments", "history", request] as const;
```

```ts
// hooks/use-fetch-payment-history/use-fetch-payment-history.ts
export const useFetchPaymentHistory = (
  request: FetchPaymentHistoryArgs,
) => {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: paymentHistoryQueryKey(request),
    queryFn: () => fetchPaymentHistory(request),
  });

  const result = query.data;
  const expectedError = result?.ok === false
    ? result.error
    : undefined;

  return {
    payments: result?.ok
      ? result.value.items.map((payment) => ({
          id: payment.id.value,
          merchantName: payment.merchantName,
          amountInMinorUnits:
            payment.amount.minorUnits,
          currency: payment.amount.currency,
        }))
      : [],
    totalPages: result?.ok
      ? result.value.totalPages
      : 0,
    errorMessage: expectedError
      ? t(
          fetchPaymentHistoryErrorMessageKeys[
            expectedError.type
          ],
        )
      : query.isError
        ? t("payments.errors.unexpected")
        : undefined,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isSuccess: query.isSuccess && result?.ok === true,
    isError:
      query.isError || expectedError !== undefined,
    refetch: query.refetch,
  };
};
```

## Pagination Orchestration

```ts
// hooks/use-payment-history/use-payment-history.ts
interface UsePaymentHistory {
  readonly accountId:
    FetchPaymentHistoryArgs["accountId"];
  readonly pageSize: number;
}

export const usePaymentHistory = (
  args: UsePaymentHistory,
) => {
  const [page, setPage] = useState(1);
  const history = useFetchPaymentHistory({
    accountId: args.accountId,
    page,
    pageSize: args.pageSize,
  });

  return {
    ...history,
    page,
    nextPage: () => {
      setPage((current) =>
        Math.min(current + 1, history.totalPages),
      );
    },
    previousPage: () => {
      setPage((current) =>
        Math.max(current - 1, 1),
      );
    },
  };
};
```

The request hook owns one request. The orchestration hook owns interactive page
state.

## Optimistic Update

Expected `Result.err` values resolve successfully from the request library's
perspective. Roll back in both `onSuccess` for an expected error and `onError`
for a thrown defect.

```ts
// hooks/use-update-payment-note/use-update-payment-note.ts
type FetchPaymentDetailsResult = Awaited<
  ReturnType<typeof fetchPaymentDetails>
>;

export const useUpdatePaymentNote = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (args: UpdatePaymentNoteArgs) =>
      updatePaymentNote(args),

    onMutate: async (args) => {
      const queryKey = paymentDetailsQueryKey({
        paymentId: args.paymentId,
      });

      await queryClient.cancelQueries({ queryKey });

      const previous =
        queryClient.getQueryData<
          FetchPaymentDetailsResult
        >(queryKey);

      queryClient.setQueryData<
        FetchPaymentDetailsResult
      >(queryKey, (current) => {
        if (!current?.ok) return current;

        return {
          ...current,
          value: {
            ...current.value,
            note: args.note,
          },
        };
      });

      return { previous, queryKey };
    },

    onSuccess: (result, _args, context) => {
      if (result.ok || !context) return;

      queryClient.setQueryData(
        context.queryKey,
        context.previous,
      );
    },

    onError: (_error, _args, context) => {
      if (!context) return;

      queryClient.setQueryData(
        context.queryKey,
        context.previous,
      );
    },

    onSettled: (_result, _error, _args, context) => {
      if (!context) return;

      void queryClient.invalidateQueries({
        queryKey: context.queryKey,
      });
    },
  });

  const expectedError = mutation.data?.ok === false
    ? mutation.data.error
    : undefined;

  return {
    updatePaymentNote: mutation.mutate,
    errorMessage: expectedError
      ? t(
          updatePaymentNoteErrorMessageKeys[
            expectedError.type
          ],
        )
      : mutation.isError
        ? t("payments.errors.unexpected")
        : undefined,
    isPending: mutation.isPending,
    isSuccess:
      mutation.isSuccess && mutation.data?.ok === true,
    isError:
      mutation.isError || expectedError !== undefined,
  };
};
```

Keep cache value typing anchored to the bound query callable or its public
application return contract. Never re-create the cached `Result` type by hand.
