# React Hexagonal UI - Examples

These focused examples share one payments/checkout feature. They use TanStack
Query, React Hook Form, Zod, and React Router as replaceable implementations of
the library-agnostic rules in [SKILL.md](SKILL.md).

The snippets call already-bound application operations from hooks:
`fetchPaymentDetails`, `fetchPaymentHistory`, `processPayment`, and
`updatePaymentNote`. Treat these names as values supplied to the UI by the
application's composition layer. Their concrete imports are intentionally
omitted because this skill does not define infrastructure binding or a
composition-folder convention.

UI-owned functions use arrow syntax, accept named object arguments, and return
named object properties. The snippets preserve framework-controlled contracts:
components return JSX, query-key factories return tuples, event handlers may
return `void`, and library callbacks keep their required signatures and return
values.

The examples assume `@/*` resolves from `src/*`. Use absolute imports for
project code and styles.

- `fetchPaymentDetails(request)` returns the already-bound no-argument query
  function.
- `fetchPaymentHistory(request)` returns the already-bound no-argument query
  function.
- `processPayment(args)` and `updatePaymentNote(args)` are already-bound
  mutation execution functions.

## Contents

1. [Query Hook And Container](#query-hook-and-container)
2. [Mutation Hook And Error Mapping](#mutation-hook-and-error-mapping)
3. [Form And Submit Orchestration](#form-and-submit-orchestration)
4. [Pagination Orchestration](#pagination-orchestration)
5. [Optimistic Update](#optimistic-update)
6. [Context And Provider](#context-and-provider)
7. [Router, Layout, Page, And Suspense](#router-layout-page-and-suspense)
8. [Synchronous Use Case](#synchronous-use-case)

## Query Hook And Container

### `query-keys/payment-details-query-key.ts`

```ts
import type { FetchPaymentDetailsArgs } from
  "@/modules/payments/application/use-cases/fetch-payment-details";

export const paymentDetailsQueryKey = (
  request: FetchPaymentDetailsArgs,
) => ["payments", "details", request] as const;
```

### `shared/infrastructure/ui/containers/fetch/fetch.tsx`

Use one shared container to resolve successful, expected-error, and empty
fetch states. Suspense prevents loading states from reaching this container.

```tsx
import type { ReactNode } from "react";

interface FetchErrorState {
  readonly data: undefined;
  readonly isSuccess: false;
  readonly isError: true;
  readonly isEmpty: false;
}

interface FetchEmptyState {
  readonly data: undefined;
  readonly isSuccess: true;
  readonly isError: false;
  readonly isEmpty: true;
}

interface FetchSuccessState<Data> {
  readonly data: Data;
  readonly isSuccess: true;
  readonly isError: false;
  readonly isEmpty: false;
}

type FetchState<Data> =
  | FetchErrorState
  | FetchEmptyState
  | FetchSuccessState<Data>;

interface FetchContent<Data> {
  readonly empty: ReactNode;
  readonly error: ReactNode;
  readonly renderElement: (args: { readonly data: Data }) => ReactNode;
}

interface FetchProps<Data> {
  readonly state: FetchState<Data>;
  readonly content: FetchContent<Data>;
}

export const Fetch = <Data,>({ state, content }: FetchProps<Data>) => {
  if (state.isError) return content.error;
  if (state.isEmpty) return content.empty;

  return content.renderElement({ data: state.data });
};
```

### `hooks/use-fetch-payment-details/use-fetch-payment-details.ts`

This query always suspends while loading, so it omits loading booleans. Expected
`Result` errors remain mapped values. This UI treats `PaymentNotFound` as an
empty state rather than an error state.

```ts
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  FetchPaymentDetailsError,
  FetchPaymentDetailsArgs,
} from "@/modules/payments/application/use-cases/fetch-payment-details";
import { paymentDetailsQueryKey } from
  "@/modules/payments/infrastructure/ui/query-keys/payment-details-query-key";

const fetchPaymentDetailsErrorMessageKeys: Record<
  Exclude<
    FetchPaymentDetailsError,
    { readonly type: "PaymentNotFound" }
  >["type"],
  string
> = {
  NetworkError: "payments.errors.network",
};

export const useFetchPaymentDetails = (
  request: FetchPaymentDetailsArgs,
) => {
  const { t } = useTranslation();
  const query = useSuspenseQuery({
    queryKey: paymentDetailsQueryKey(request),
    queryFn: fetchPaymentDetails(request),
  });

  const result = query.data;

  if (!result.ok) {
    if (result.error.type === "PaymentNotFound") {
      return {
        state: {
          data: undefined,
          isSuccess: true,
          isError: false,
          isEmpty: true,
        } as const,
        errorMessage: undefined,
        isFetching: query.isFetching,
        refetch: query.refetch,
      };
    }

    return {
      state: {
        data: undefined,
        isSuccess: false,
        isError: true,
        isEmpty: false,
      } as const,
      errorMessage: t(
        fetchPaymentDetailsErrorMessageKeys[result.error.type],
      ),
      isFetching: query.isFetching,
      refetch: query.refetch,
    };
  }

  return {
    state: {
      data: {
        merchantName: result.value.merchantName,
        amountInMinorUnits: result.value.amount.minorUnits,
        currency: result.value.amount.currency,
      },
      isSuccess: true,
      isError: false,
      isEmpty: false,
    } as const,
    errorMessage: undefined,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
};
```

### `components/payment-details-empty/payment-details-empty.tsx`

```tsx
import { useTranslation } from "react-i18next";

export const PaymentDetailsEmpty = () => {
  const { t } = useTranslation();
  return <p>{t("payments.details.empty")}</p>;
};
```

### `components/payment-details-error/payment-details-error.tsx`

```tsx
import { useTranslation } from "react-i18next";

interface PaymentDetailsErrorProps {
  readonly message?: string;
  readonly onRetry: () => void;
}

export const PaymentDetailsError = ({
  message,
  onRetry,
}: PaymentDetailsErrorProps) => {
  const { t } = useTranslation();

  return (
    <section>
      <p role="alert">{message}</p>
      <button type="button" onClick={onRetry}>
        {t("common.retry")}
      </button>
    </section>
  );
};
```

### `components/payment-details/payment-details.tsx`

The component receives a defined UI contract rather than a payment entity or
optional request data.

```tsx
interface PaymentDetailsProps {
  readonly paymentDetails: {
    readonly merchantName: string;
    readonly amountInMinorUnits: number;
    readonly currency: string;
  };
  readonly isFetching: boolean;
}

export const PaymentDetails = ({
  paymentDetails,
  isFetching,
}: PaymentDetailsProps) => {
  const amount = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: paymentDetails.currency,
  }).format(paymentDetails.amountInMinorUnits / 100);

  return (
    <section aria-busy={isFetching}>
      <h2>{paymentDetails.merchantName}</h2>
      <p>{amount}</p>
    </section>
  );
};
```

### `containers/payment-details-content/payment-details-content.tsx`

```tsx
import { Fetch } from
  "@/modules/shared/infrastructure/ui/containers/fetch/fetch";
import type { FetchPaymentDetailsArgs } from
  "@/modules/payments/application/use-cases/fetch-payment-details";
import { PaymentDetails } from
  "@/modules/payments/infrastructure/ui/components/payment-details/payment-details";
import { PaymentDetailsEmpty } from
  "@/modules/payments/infrastructure/ui/components/payment-details-empty/payment-details-empty";
import { PaymentDetailsError } from
  "@/modules/payments/infrastructure/ui/components/payment-details-error/payment-details-error";
import { useFetchPaymentDetails } from
  "@/modules/payments/infrastructure/ui/hooks/use-fetch-payment-details/use-fetch-payment-details";

interface PaymentDetailsContentProps {
  request: FetchPaymentDetailsArgs;
}

export const PaymentDetailsContent = ({
  request,
}: PaymentDetailsContentProps) => {
  const {
    state,
    errorMessage,
    isFetching,
    refetch,
  } = useFetchPaymentDetails(request);

  return (
    <Fetch
      state={state}
      content={{
        empty: <PaymentDetailsEmpty />,
        error: (
          <PaymentDetailsError
            message={errorMessage}
            onRetry={() => {
              void refetch();
            }}
          />
        ),
        renderElement: ({ data: paymentDetails }) => (
          <PaymentDetails
            paymentDetails={paymentDetails}
            isFetching={isFetching}
          />
        ),
      }}
    />
  );
};
```

## Mutation Hook And Error Mapping

### `hooks/use-process-payment-success/use-process-payment-success.ts`

This lifecycle hook performs real UI behavior: cache invalidation and
navigation.

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type {
  ProcessPaymentArgs,
} from "@/modules/payments/application/use-cases/process-payment";
import { paymentDetailsQueryKey } from
  "@/modules/payments/infrastructure/ui/query-keys/payment-details-query-key";

interface PaymentReceipt {
  readonly paymentId: string;
}

interface ProcessPaymentSuccessArgs {
  readonly receipt: PaymentReceipt;
  readonly args: ProcessPaymentArgs;
}

export const useProcessPaymentSuccess = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleSuccess = ({
    receipt,
    args,
  }: ProcessPaymentSuccessArgs) => {
    void queryClient.invalidateQueries({
      queryKey: paymentDetailsQueryKey({ paymentId: args.paymentId }),
    });
    navigate(`/payments/${receipt.paymentId}/receipt`);
  };

  return { handleSuccess };
};
```

### `hooks/use-process-payment-error/use-process-payment-error.ts`

```ts
import { useNotifications } from
  "@/modules/shared/infrastructure/ui/hooks/use-notifications/use-notifications";

interface ProcessPaymentErrorArgs {
  readonly errorMessage: string;
}

export const useProcessPaymentError = () => {
  const { notifyError } = useNotifications();

  const handleError = ({ errorMessage }: ProcessPaymentErrorArgs) => {
    notifyError(errorMessage);
  };

  return { handleError };
};
```

### `hooks/use-process-payment/use-process-payment.ts`

The request library sees an expected error `Result` as resolved. Normalize the
booleans with the `Result` branch.

```ts
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  ProcessPaymentArgs,
  ProcessPaymentError,
} from "@/modules/payments/application/use-cases/process-payment";
import { useProcessPaymentError } from
  "@/modules/payments/infrastructure/ui/hooks/use-process-payment-error/use-process-payment-error";
import { useProcessPaymentSuccess } from
  "@/modules/payments/infrastructure/ui/hooks/use-process-payment-success/use-process-payment-success";

const processPaymentErrorMessageKeys: Record<
  ProcessPaymentError["type"],
  string
> = {
  CardDeclined: "payments.errors.cardDeclined",
  NetworkError: "payments.errors.network",
  OrderAlreadyProcessed: "payments.errors.orderAlreadyProcessed",
};

export const useProcessPayment = () => {
  const { t } = useTranslation();
  const { handleSuccess } = useProcessPaymentSuccess();
  const { handleError } = useProcessPaymentError();

  const mutation = useMutation({
    mutationFn: (args: ProcessPaymentArgs) => processPayment(args),
    onSuccess: (result, args) => {
      if (!result.ok) {
        handleError({
          errorMessage: t(
            processPaymentErrorMessageKeys[result.error.type],
          ),
        });
        return;
      }

      handleSuccess({
        receipt: { paymentId: result.value.paymentId },
        args,
      });
    },
    onError: () => {
      handleError({
        errorMessage: t("payments.errors.unexpected"),
      });
    },
  });

  const result = mutation.data;
  const expectedError = result?.ok === false ? result.error : undefined;

  return {
    processPayment: mutation.mutate,
    paymentReceipt: result?.ok
      ? {
          receiptId: result.value.id,
          paymentId: result.value.paymentId,
        }
      : undefined,
    errorMessage: expectedError
      ? t(processPaymentErrorMessageKeys[expectedError.type])
      : mutation.isError
        ? t("payments.errors.unexpected")
        : undefined,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess && result?.ok === true,
    isError: mutation.isError || expectedError !== undefined,
  };
};
```

The nested conditional above only selects a value; use early returns for
behavioral branches such as lifecycle handling.

## Form And Submit Orchestration

### `schemas/payment-form-schema.ts`

```ts
import { z } from "zod";
import { hasPositiveAmount } from
  "@/modules/payments/domain/services/payment-rules";

export const paymentFormSchema = z.object({
  paymentId: z.string().min(1),
  amountInMinorUnits: z.number().int().refine(hasPositiveAmount),
});
```

### `hooks/use-payment-form/use-payment-form.ts`

```ts
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { paymentFormSchema } from
  "@/modules/payments/infrastructure/ui/schemas/payment-form-schema";

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const usePaymentForm = () => {
  return useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    mode: "onBlur",
    defaultValues: {
      paymentId: "",
      amountInMinorUnits: 0,
    },
  });
};
```

### `hooks/use-payment/use-payment.ts`

The orchestration hook owns the submit handler and coordinates the independent
form and mutation hooks.

```ts
import { usePaymentForm } from
  "@/modules/payments/infrastructure/ui/hooks/use-payment-form/use-payment-form";
import { useProcessPayment } from
  "@/modules/payments/infrastructure/ui/hooks/use-process-payment/use-process-payment";

export const usePayment = () => {
  const form = usePaymentForm();
  const {
    processPayment,
    paymentReceipt,
    errorMessage,
    isPending,
    isSuccess,
    isError,
  } = useProcessPayment();

  const onSubmit = form.handleSubmit((values) => {
    processPayment(values);
  });

  return {
    form,
    onSubmit,
    paymentReceipt,
    errorMessage,
    isPending,
    isSuccess,
    isError,
  };
};
```

### `components/payment-form/payment-form.tsx`

```tsx
import type { FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

interface PaymentFormValues {
  paymentId: string;
  amountInMinorUnits: number;
}

interface PaymentFormProps {
  form: UseFormReturn<PaymentFormValues>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  errorMessage?: string;
  isPending: boolean;
}

export const PaymentForm = ({
  form,
  onSubmit,
  errorMessage,
  isPending,
}: PaymentFormProps) => {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit}>
      <label>
        {t("payments.fields.paymentId")}
        <input {...form.register("paymentId")} />
      </label>

      <label>
        {t("payments.fields.amount")}
        <input
          type="number"
          {...form.register("amountInMinorUnits", { valueAsNumber: true })}
        />
      </label>

      {errorMessage ? <p role="alert">{errorMessage}</p> : null}

      <button type="submit" disabled={isPending}>
        {t("payments.actions.pay")}
      </button>
    </form>
  );
};
```

### `containers/payment/payment.tsx`

```tsx
import { PaymentForm } from
  "@/modules/payments/infrastructure/ui/components/payment-form/payment-form";
import { usePayment } from
  "@/modules/payments/infrastructure/ui/hooks/use-payment/use-payment";

export const Payment = () => {
  const { form, onSubmit, errorMessage, isPending } = usePayment();

  return (
    <PaymentForm
      form={form}
      onSubmit={onSubmit}
      errorMessage={errorMessage}
      isPending={isPending}
    />
  );
};
```

## Pagination Orchestration

### `query-keys/payment-history-query-key.ts`

```ts
import type { FetchPaymentHistoryArgs } from
  "@/modules/payments/application/use-cases/fetch-payment-history";

export const paymentHistoryQueryKey = (
  request: FetchPaymentHistoryArgs,
) => ["payments", "history", request] as const;
```

### `hooks/use-fetch-payment-history/use-fetch-payment-history.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  FetchPaymentHistoryError,
  FetchPaymentHistoryArgs,
} from "@/modules/payments/application/use-cases/fetch-payment-history";
import { paymentHistoryQueryKey } from
  "@/modules/payments/infrastructure/ui/query-keys/payment-history-query-key";

const fetchPaymentHistoryErrorMessageKeys: Record<
  FetchPaymentHistoryError["type"],
  string
> = {
  NetworkError: "payments.errors.network",
  PaymentHistoryUnavailable: "payments.errors.historyUnavailable",
};

export const useFetchPaymentHistory = (
  request: FetchPaymentHistoryArgs,
) => {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: paymentHistoryQueryKey(request),
    queryFn: fetchPaymentHistory(request),
  });

  const result = query.data;
  const expectedError = result?.ok === false ? result.error : undefined;

  return {
    payments: result?.ok
      ? result.value.items.map(({ id, merchantName, amount }) => ({
          id,
          merchantName,
          amountInMinorUnits: amount.minorUnits,
          currency: amount.currency,
        }))
      : [],
    totalPages: result?.ok ? result.value.totalPages : 0,
    errorMessage: expectedError
      ? t(fetchPaymentHistoryErrorMessageKeys[expectedError.type])
      : query.isError
        ? t("payments.errors.unexpected")
        : undefined,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isSuccess: query.isSuccess && result?.ok === true,
    isError: query.isError || expectedError !== undefined,
    refetch: query.refetch,
  };
};
```

### `hooks/use-payment-history/use-payment-history.ts`

```ts
import { useState } from "react";
import type { FetchPaymentHistoryArgs } from
  "@/modules/payments/application/use-cases/fetch-payment-history";
import { useFetchPaymentHistory } from
  "@/modules/payments/infrastructure/ui/hooks/use-fetch-payment-history/use-fetch-payment-history";

interface UsePaymentHistory {
  readonly accountId: FetchPaymentHistoryArgs["accountId"];
  readonly pageSize: number;
}

export const usePaymentHistory = (args: UsePaymentHistory) => {
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
      setPage((current) => Math.min(current + 1, history.totalPages));
    },
    previousPage: () => {
      setPage((current) => Math.max(current - 1, 1));
    },
  };
};
```

For an infinite-loading operation, keep the base `useFetch...` name and expose
generic capabilities such as `fetchNextPage`, `hasNextPage`, and
`isFetchingNextPage`.

## Optimistic Update

### `hooks/use-update-payment-note/use-update-payment-note.ts`

The hook owns cache cancellation, snapshotting, optimistic replacement,
rollback, and invalidation. Expected error results require explicit rollback
because they do not reach TanStack Query's `onError`.

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  UpdatePaymentNoteArgs,
  UpdatePaymentNoteError,
} from "@/modules/payments/application/use-cases/update-payment-note";
import type { FetchPaymentDetailsUseCase } from
  "@/modules/payments/application/use-cases/fetch-payment-details";
import { paymentDetailsQueryKey } from
  "@/modules/payments/infrastructure/ui/query-keys/payment-details-query-key";

const updatePaymentNoteErrorMessageKeys: Record<
  UpdatePaymentNoteError["type"],
  string
> = {
  NetworkError: "payments.errors.network",
  PaymentNotFound: "payments.errors.notFound",
};

type FetchPaymentDetailsResult = Awaited<
  ReturnType<ReturnType<FetchPaymentDetailsUseCase>>
>;

export const useUpdatePaymentNote = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (args: UpdatePaymentNoteArgs) => updatePaymentNote(args),
    onMutate: async (args) => {
      const queryKey = paymentDetailsQueryKey({
        paymentId: args.paymentId,
      });

      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<FetchPaymentDetailsResult>(
        queryKey,
      );

      queryClient.setQueryData<FetchPaymentDetailsResult>(
        queryKey,
        (current) => {
          if (!current?.ok) return current;

          return {
            ...current,
            value: {
              ...current.value,
              note: args.note,
            },
          };
        },
      );

      return { previous, queryKey };
    },
    onSuccess: (result, _args, context) => {
      if (result.ok || !context) return;
      queryClient.setQueryData(context.queryKey, context.previous);
    },
    onError: (_error, _args, context) => {
      if (!context) return;
      queryClient.setQueryData(context.queryKey, context.previous);
    },
    onSettled: (_result, _error, _args, context) => {
      if (!context) return;
      void queryClient.invalidateQueries({ queryKey: context.queryKey });
    },
  });

  const expectedError =
    mutation.data?.ok === false ? mutation.data.error : undefined;

  return {
    updatePaymentNote: mutation.mutate,
    errorMessage: expectedError
      ? t(updatePaymentNoteErrorMessageKeys[expectedError.type])
      : mutation.isError
        ? t("payments.errors.unexpected")
        : undefined,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess && mutation.data?.ok === true,
    isError: mutation.isError || expectedError !== undefined,
  };
};
```

## Context And Provider

### `contexts/checkout-context/checkout-context.ts`

```ts
import { createContext } from "react";

export interface CheckoutContextValue {
  readonly selectedPaymentId?: string;
  readonly selectPayment: (args: {
    readonly paymentId: string;
  }) => void;
}

export const CheckoutContext =
  createContext<CheckoutContextValue | undefined>(undefined);
```

### `providers/checkout-provider/checkout-provider.tsx`

```tsx
import { useState, type ReactNode } from "react";
import {
  CheckoutContext,
  type CheckoutContextValue,
} from "@/modules/payments/infrastructure/ui/contexts/checkout-context/checkout-context";

interface CheckoutProviderProps {
  children: ReactNode;
}

export const CheckoutProvider = ({
  children,
}: CheckoutProviderProps) => {
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>();

  const value: CheckoutContextValue = {
    selectedPaymentId,
    selectPayment: ({ paymentId }) => {
      setSelectedPaymentId(paymentId);
    },
  };

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
};
```

### `hooks/use-checkout/use-checkout.ts`

Only the dedicated access hook imports the context.

```ts
import { useContext } from "react";
import { CheckoutContext } from
  "@/modules/payments/infrastructure/ui/contexts/checkout-context/checkout-context";

export const useCheckout = () => {
  const checkout = useContext(CheckoutContext);

  if (!checkout) {
    throw new Error("CheckoutProvider is missing");
  }

  return checkout;
};
```

Components and containers consume `useCheckout`; they do not import
`CheckoutContext`.

## Router, Layout, Page, And Suspense

### `components/payment-loading/payment-loading.tsx`

```tsx
import { useTranslation } from "react-i18next";

export const PaymentLoading = () => {
  const { t } = useTranslation();
  return <p role="status">{t("payments.loading")}</p>;
};
```

### `containers/payment-details/payment-details.tsx`

Use React's `Suspense` directly. The nested content container calls the
suspending hook shown earlier.

```tsx
import { Suspense } from "react";
import type { FetchPaymentDetailsArgs } from
  "@/modules/payments/application/use-cases/fetch-payment-details";
import { PaymentLoading } from
  "@/modules/payments/infrastructure/ui/components/payment-loading/payment-loading";
import { PaymentDetailsContent } from
  "@/modules/payments/infrastructure/ui/containers/payment-details-content/payment-details-content";

interface PaymentDetailsProps {
  request: FetchPaymentDetailsArgs;
}

export const PaymentDetails = ({ request }: PaymentDetailsProps) => {
  return (
    <Suspense fallback={<PaymentLoading />}>
      <PaymentDetailsContent request={request} />
    </Suspense>
  );
};
```

Place the application's selected error-boundary mechanism at this same
feature-container level when the subtree needs protection. Keep expected
`Result` failures in `PaymentDetailsContent`; reserve the boundary for
unexpected render/runtime failures.

### `hooks/use-checkout-payment-details/use-checkout-payment-details.ts`

Route-aware hooks adapt router state into UI-ready request objects. Keep the
base request hook route-agnostic so it remains reusable outside this route.

```ts
import { useParams } from "react-router";
import type { FetchPaymentDetailsArgs } from
  "@/modules/payments/application/use-cases/fetch-payment-details";

export const useCheckoutPaymentDetails = () => {
  const { paymentId } = useParams<"paymentId">();

  if (!paymentId) {
    return {
      paymentDetailsRequest: undefined,
    } as const;
  }

  const paymentDetailsRequest = {
    paymentId,
  } satisfies FetchPaymentDetailsArgs;

  return {
    paymentDetailsRequest,
  } as const;
};
```

### `containers/checkout-payment-details/checkout-payment-details.tsx`

```tsx
import { PaymentDetails } from
  "@/modules/payments/infrastructure/ui/containers/payment-details/payment-details";
import { useCheckoutPaymentDetails } from
  "@/modules/payments/infrastructure/ui/hooks/use-checkout-payment-details/use-checkout-payment-details";

export const CheckoutPaymentDetails = () => {
  const { paymentDetailsRequest } = useCheckoutPaymentDetails();

  if (!paymentDetailsRequest) {
    return null;
  }

  return <PaymentDetails request={paymentDetailsRequest} />;
};
```

### `layouts/checkout-layout/checkout-layout.tsx`

The layout imports no feature UI. It receives rendered slots.

```tsx
import type { ReactNode } from "react";

interface CheckoutLayoutProps {
  summary: ReactNode;
  payment: ReactNode;
}

export const CheckoutLayout = ({
  summary,
  payment,
}: CheckoutLayoutProps) => {
  return (
    <main className="checkout-layout">
      <aside>{summary}</aside>
      <section>{payment}</section>
    </main>
  );
};
```

### `pages/checkout-page/checkout-page.tsx`

```tsx
import { Payment } from
  "@/modules/payments/infrastructure/ui/containers/payment/payment";
import { CheckoutPaymentDetails } from
  "@/modules/payments/infrastructure/ui/containers/checkout-payment-details/checkout-payment-details";
import { CheckoutLayout } from
  "@/modules/payments/infrastructure/ui/layouts/checkout-layout/checkout-layout";

export const CheckoutPage = () => {
  return (
    <CheckoutLayout
      summary={<CheckoutPaymentDetails />}
      payment={<Payment />}
    />
  );
};
```

### `layouts/payments-layout/payments-layout.tsx`

This route-tree layout is structural and receives the router outlet as a slot.

```tsx
import type { ReactNode } from "react";

interface PaymentsLayoutProps {
  content: ReactNode;
}

export const PaymentsLayout = ({ content }: PaymentsLayoutProps) => {
  return <div className="payments-shell">{content}</div>;
};
```

### `routers/payments-router/payments-router.tsx`

```tsx
import { Navigate, Outlet } from "react-router";
import type { RouteObject } from "react-router";
import { CheckoutPage } from
  "@/modules/payments/infrastructure/ui/pages/checkout-page/checkout-page";
import { PaymentHistoryPage } from
  "@/modules/payments/infrastructure/ui/pages/payment-history-page/payment-history-page";
import { PaymentsLayout } from
  "@/modules/payments/infrastructure/ui/layouts/payments-layout/payments-layout";

export const paymentsRouter: RouteObject = {
  path: "payments",
  element: <PaymentsLayout content={<Outlet />} />,
  children: [
    {
      path: "checkout/:paymentId",
      element: <CheckoutPage />,
    },
    {
      path: "checkout",
      element: <Navigate to="/payments/history" replace />,
    },
    {
      path: "history",
      element: <PaymentHistoryPage />,
    },
    {
      index: true,
      element: <Navigate to="history" replace />,
    },
  ],
};
```

Route objects configure URL structure, redirects, and route-tree shells. Hooks
read route params and route state, and containers consume those hooks.

### Application entry point

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from
  "@/modules/app/infrastructure/ui/providers/app-provider/app-provider";
import { AppRouter } from
  "@/modules/app/infrastructure/ui/routers/app-router/app-router";
import "@/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <AppRouter />
    </AppProvider>
  </StrictMode>,
);
```

## Synchronous Use Case

Call a synchronous application use case directly. Do not wrap it in TanStack
Query.

### `hooks/use-calculate-payment-total/use-calculate-payment-total.ts`

```ts
import type { CalculatePaymentTotalArgs } from
  "@/modules/payments/application/use-cases/calculate-payment-total";
import {
  calculatePaymentTotalUseCase,
  type CalculatePaymentTotalError,
} from
  "@/modules/payments/application/use-cases/calculate-payment-total";
import { useTranslation } from "react-i18next";

const calculatePaymentTotalErrorMessageKeys: Record<
  CalculatePaymentTotalError["type"],
  string
> = {
  EmptyPayment: "payments.errors.emptyPayment",
  InvalidAmount: "payments.errors.invalidTotal",
};

export const useCalculatePaymentTotal = () => {
  const { t } = useTranslation();

  const calculatePaymentTotal = (args: CalculatePaymentTotalArgs) => {
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
