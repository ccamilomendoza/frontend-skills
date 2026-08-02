# Request Examples

Use these examples for concrete query, mutation, composition, and error-mapping
patterns. TanStack Query is illustrative; preserve the same boundaries with
another request library.

## Contents

1. [Composition](#composition)
2. [Query key](#query-key)
3. [Query hook](#query-hook)
4. [Query container and component](#query-container-and-component)
5. [Mutation hook](#mutation-hook)
6. [Synchronous operation](#synchronous-operation)

## Composition

Bind adapters to application factories once:

```ts
// modules/payments/infrastructure/ui/compositions/payments-composition.ts
import { makeFetchPaymentDetailsUseCase } from
  "@/modules/payments/application/use-cases/fetch-payment-details";
import { makeProcessPaymentUseCase } from
  "@/modules/payments/application/use-cases/process-payment";
import { makeHttpFetchPaymentDetailsAdapter } from
  "@/modules/payments/infrastructure/server/adapters/http-fetch-payment-details-adapter";
import { makeHttpProcessPaymentAdapter } from
  "@/modules/payments/infrastructure/server/adapters/http-process-payment-adapter";
import { http } from
  "@/modules/shared/infrastructure/server/http/http-client";

export const fetchPaymentDetails =
  makeFetchPaymentDetailsUseCase({
    fetchPaymentDetails:
      makeHttpFetchPaymentDetailsAdapter({ http }),
  });

export const processPayment =
  makeProcessPaymentUseCase({
    processPayment:
      makeHttpProcessPaymentAdapter({ http }),
  });
```

Only composition imports adapters. Hooks import the bound callables.

## Query Key

```ts
// query-keys/payment-details-query-key.ts
import type { FetchPaymentDetailsArgs } from
  "@/modules/payments/application/use-cases/fetch-payment-details";

export const paymentDetailsQueryKey = (
  request: FetchPaymentDetailsArgs,
) => ["payments", "details", request] as const;
```

## Query Hook

```ts
// hooks/use-fetch-payment-details/use-fetch-payment-details.ts
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  FetchPaymentDetailsArgs,
  FetchPaymentDetailsError,
} from "@/modules/payments/application/use-cases/fetch-payment-details";
import { fetchPaymentDetails } from
  "@/modules/payments/infrastructure/ui/compositions/payments-composition";
import { paymentDetailsQueryKey } from
  "@/modules/payments/infrastructure/ui/query-keys/payment-details-query-key";

const fetchPaymentDetailsErrorMessageKeys: Record<
  FetchPaymentDetailsError["type"],
  string
> = {
  NetworkError: "payments.errors.network",
  ParseError: "payments.errors.invalidResponse",
  PaymentNotFound: "payments.errors.notFound",
};

export const useFetchPaymentDetails = (
  request: FetchPaymentDetailsArgs,
) => {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: paymentDetailsQueryKey(request),
    queryFn: () => fetchPaymentDetails(request),
  });

  const result = query.data;
  const expectedError = result?.ok === false
    ? result.error
    : undefined;

  return {
    paymentDetails: result?.ok
      ? {
          paymentId: result.value.id.value,
          merchantName: result.value.merchantName,
          amount: new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: result.value.amount.currency,
          }).format(result.value.amount.minorUnits / 100),
        }
      : undefined,
    errorMessage: expectedError
      ? t(
          fetchPaymentDetailsErrorMessageKeys[
            expectedError.type
          ],
        )
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

The hook converts domain values and architecture-shaped failures into a
presentation contract.

## Query Container and Component

```tsx
// components/payment-details/payment-details.tsx
interface PaymentDetailsProps {
  readonly merchantName: string;
  readonly amount: string;
}

export const PaymentDetails = ({
  merchantName,
  amount,
}: PaymentDetailsProps) => (
  <section>
    <h2>{merchantName}</h2>
    <p>{amount}</p>
  </section>
);
```

```tsx
// containers/payment-details-content/payment-details-content.tsx
interface PaymentDetailsContentProps {
  readonly request: FetchPaymentDetailsArgs;
}

export const PaymentDetailsContent = ({
  request,
}: PaymentDetailsContentProps) => {
  const {
    paymentDetails,
    errorMessage,
    isPending,
    refetch,
  } = useFetchPaymentDetails(request);

  if (isPending) return <PaymentLoading />;

  if (errorMessage) {
    return (
      <PaymentError
        message={errorMessage}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!paymentDetails) return <PaymentDetailsEmpty />;

  return <PaymentDetails {...paymentDetails} />;
};
```

The container branches mechanically on UI-ready values. It does not inspect
`Result`, translate errors, or map entities.

## Mutation Hook

```ts
// hooks/use-process-payment/use-process-payment.ts
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  ProcessPaymentArgs,
  ProcessPaymentError,
} from "@/modules/payments/application/use-cases/process-payment";
import { processPayment } from
  "@/modules/payments/infrastructure/ui/compositions/payments-composition";

const processPaymentErrorMessageKeys: Record<
  ProcessPaymentError["type"],
  string
> = {
  CardDeclined: "payments.errors.cardDeclined",
  NetworkError: "payments.errors.network",
  ParseError: "payments.errors.invalidResponse",
  OrderAlreadyProcessed:
    "payments.errors.orderAlreadyProcessed",
};

export const useProcessPayment = () => {
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (args: ProcessPaymentArgs) =>
      processPayment(args),
    onSuccess: (result) => {
      if (!result.ok) return;
      // Optional UI reaction: notification or navigation.
    },
  });

  const result = mutation.data;
  const expectedError = result?.ok === false
    ? result.error
    : undefined;

  return {
    processPayment: mutation.mutate,
    paymentReceipt: result?.ok
      ? {
          receiptId: result.value.id.value,
          paymentId: result.value.paymentId.value,
        }
      : undefined,
    errorMessage: expectedError
      ? t(
          processPaymentErrorMessageKeys[
            expectedError.type
          ],
        )
      : mutation.isError
        ? t("payments.errors.unexpected")
        : undefined,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess && result?.ok === true,
    isError:
      mutation.isError || expectedError !== undefined,
  };
};
```

## Synchronous Operation

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
          calculatePaymentTotalErrorMessageKeys[
            result.error.type
          ],
        ),
      };
    }

    return {
      total: {
        amountInMinorUnits:
          result.value.amount.minorUnits,
        currency: result.value.amount.currency,
      },
      errorMessage: undefined,
    };
  };

  return { calculatePaymentTotal };
};
```

No server-state abstraction is involved because the use case is synchronous.
