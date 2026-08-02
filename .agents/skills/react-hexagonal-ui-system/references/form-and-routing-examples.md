# Form and Routing Examples

Use these examples for form-value ownership, submit orchestration, context,
routing, layouts, pages, and Suspense placement.

## Contents

1. [Form schema and hook](#form-schema-and-hook)
2. [Submit orchestration](#submit-orchestration)
3. [Form component and container](#form-component-and-container)
4. [Context and provider](#context-and-provider)
5. [Route adapter](#route-adapter)
6. [Suspense container](#suspense-container)
7. [Layout, page, and router](#layout-page-and-router)

## Form Schema and Hook

Define one UI-owned value type when the form differs from application args:

```ts
// schemas/payment-form-schema.ts
import { z } from "zod";
import { hasPositiveAmount } from
  "@/modules/payments/domain/services/payment-rules";

export const paymentFormSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.string().refine((value) => {
    const amount = Number(value);
    return Number.isFinite(amount) &&
      hasPositiveAmount({ minorUnits: amount });
  }),
});

export type PaymentFormValues =
  z.infer<typeof paymentFormSchema>;
```

```ts
// hooks/use-payment-form/use-payment-form.ts
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  paymentFormSchema,
  type PaymentFormValues,
} from "@/modules/payments/infrastructure/ui/schemas/payment-form-schema";

export const usePaymentForm = () =>
  useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    mode: "onBlur",
    defaultValues: {
      paymentId: "",
      amount: "",
    },
  });
```

## Submit Orchestration

```ts
// hooks/use-payment/use-payment.ts
import { usePaymentForm } from
  "@/modules/payments/infrastructure/ui/hooks/use-payment-form/use-payment-form";
import { useProcessPayment } from
  "@/modules/payments/infrastructure/ui/hooks/use-process-payment/use-process-payment";

export const usePayment = () => {
  const form = usePaymentForm();
  const payment = useProcessPayment();

  const onSubmit = form.handleSubmit((values) => {
    payment.processPayment({
      paymentId: { value: values.paymentId },
      amount: {
        minorUnits: Number(values.amount),
        currency: "USD",
      },
    });
  });

  return {
    form,
    onSubmit,
    errorMessage: payment.errorMessage,
    isPending: payment.isPending,
  };
};
```

The application receives plain `ProcessPaymentArgs`, never a form object or
event.

## Form Component and Container

```tsx
// components/payment-form/payment-form.tsx
import type { FormEventHandler } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { PaymentFormValues } from
  "@/modules/payments/infrastructure/ui/schemas/payment-form-schema";

interface PaymentFormProps {
  readonly form: UseFormReturn<PaymentFormValues>;
  readonly onSubmit: FormEventHandler<HTMLFormElement>;
  readonly errorMessage?: string;
  readonly isPending: boolean;
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
        <input inputMode="decimal" {...form.register("amount")} />
      </label>

      {errorMessage
        ? <p role="alert">{errorMessage}</p>
        : null}

      <button type="submit" disabled={isPending}>
        {t("payments.actions.pay")}
      </button>
    </form>
  );
};
```

```tsx
// containers/payment/payment.tsx
export const Payment = () => {
  const {
    form,
    onSubmit,
    errorMessage,
    isPending,
  } = usePayment();

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

This component is private because its contract exposes a private schema type and
React Hook Form. Build a field-level component if another module must reuse it.

## Context and Provider

```ts
// contexts/checkout-context/checkout-context.ts
export interface CheckoutContextValue {
  readonly selectedPaymentId?: string;
  readonly selectPayment: (args: {
    readonly paymentId: string;
  }) => void;
}

export const CheckoutContext =
  createContext<CheckoutContextValue | undefined>(undefined);
```

```tsx
// providers/checkout-provider/checkout-provider.tsx
export const CheckoutProvider = ({
  children,
}: CheckoutProviderProps) => {
  const [selectedPaymentId, setSelectedPaymentId] =
    useState<string>();

  const value: CheckoutContextValue = {
    selectedPaymentId,
    selectPayment: ({ paymentId }) =>
      setSelectedPaymentId(paymentId),
  };

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
};
```

```ts
// hooks/use-checkout/use-checkout.ts
export const useCheckout = () => {
  const checkout = useContext(CheckoutContext);

  if (!checkout) {
    throw new Error("CheckoutProvider is missing");
  }

  return checkout;
};
```

## Route Adapter

Keep the request hook independent of routing:

```ts
// hooks/use-checkout-payment-details/use-checkout-payment-details.ts
export const useCheckoutPaymentDetails = () => {
  const { paymentId } = useParams<"paymentId">();

  return {
    request: paymentId
      ? ({ paymentId } satisfies FetchPaymentDetailsArgs)
      : undefined,
  };
};
```

```tsx
// containers/checkout-payment-details/checkout-payment-details.tsx
export const CheckoutPaymentDetails = () => {
  const { request } = useCheckoutPaymentDetails();
  if (!request) return null;

  return <PaymentDetails request={request} />;
};
```

## Suspense Container

```tsx
// components/payment-loading/payment-loading.tsx
export const PaymentLoading = () => (
  <p role="status">Loading payment…</p>
);
```

```tsx
// containers/payment-details/payment-details.tsx
interface PaymentDetailsProps {
  readonly request: FetchPaymentDetailsArgs;
}

export const PaymentDetails = ({
  request,
}: PaymentDetailsProps) => (
  <PaymentErrorBoundary>
    <Suspense fallback={<PaymentLoading />}>
      <PaymentDetailsContent request={request} />
    </Suspense>
  </PaymentErrorBoundary>
);
```

`PaymentDetailsContent` uses a suspending query hook. Expected `Result.err`
values render within the content. Unexpected thrown defects reach
`PaymentErrorBoundary`.

## Layout, Page, and Router

```tsx
// layouts/checkout-layout/checkout-layout.tsx
interface CheckoutLayoutProps {
  readonly summary: ReactNode;
  readonly payment: ReactNode;
}

export const CheckoutLayout = ({
  summary,
  payment,
}: CheckoutLayoutProps) => (
  <main className="checkout-layout">
    <aside>{summary}</aside>
    <section>{payment}</section>
  </main>
);
```

```tsx
// pages/checkout-page/checkout-page.tsx
export const CheckoutPage = () => (
  <CheckoutLayout
    summary={<CheckoutPaymentDetails />}
    payment={<Payment />}
  />
);
```

```tsx
// routers/payments-router/payments-router.tsx
export const paymentsRouter: RouteObject = {
  path: "payments",
  element: <PaymentsLayout content={<Outlet />} />,
  children: [
    {
      path: "checkout/:paymentId",
      element: <CheckoutPage />,
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

The layout receives slots, the page chooses feature content, and the router owns
URL structure.
