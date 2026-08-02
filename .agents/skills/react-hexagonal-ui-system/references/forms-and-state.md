# Forms and State

Use this reference for submitted forms, UI-only schemas, orchestration hooks,
contexts, and providers.

## Contents

1. [Form responsibilities](#form-responsibilities)
2. [Form-value ownership](#form-value-ownership)
3. [Submit orchestration](#submit-orchestration)
4. [Component contracts](#component-contracts)
5. [Context and provider flow](#context-and-provider-flow)

## Form Responsibilities

Separate a submitted form into:

1. A schema that validates UI input and may reuse pure domain predicates.
2. A form hook that creates the form-library object.
3. A mutation hook that executes the application operation.
4. An orchestration hook that coordinates submission.
5. A component that renders fields and visual state.
6. A container that wires orchestration to presentation.

Use the default names:

```text
paymentFormSchema
usePaymentForm
useProcessPayment
usePayment
PaymentForm
Payment
```

Return the complete form-library object from the form hook when a private form
component needs its coherent registration and validation API. This is a narrow
exception to curated request-hook returns.

## Form-Value Ownership

Avoid two handwritten definitions of the same form shape.

If the form fields exactly match application args, use that contract:

```ts
export const paymentFormSchema:
  z.ZodType<ProcessPaymentArgs> = z.object({
    paymentId: z.string().min(1),
    amountInMinorUnits: z.number().int().positive(),
  });

export const usePaymentForm = () =>
  useForm<ProcessPaymentArgs>({
    resolver: zodResolver(paymentFormSchema),
  });
```

If the form shape differs, define one UI-owned type beside its schema:

```ts
export const paymentFormSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.string().min(1),
});

export type PaymentFormValues =
  z.infer<typeof paymentFormSchema>;
```

Import this type into the form hook. Permit a private same-module form component
to import it as a type when receiving `UseFormReturn<PaymentFormValues>`.

Do not expose a public component whose generated prop type refers to the private
schema file. Convert it to field-level props or publish an intentional
framework-independent UI contract.

## Submit Orchestration

Keep every submit handler in the orchestration hook:

```ts
export const usePayment = () => {
  const form = usePaymentForm();
  const payment = useProcessPayment();

  const onSubmit = form.handleSubmit((values) => {
    payment.processPayment(
      transformPaymentFormValuesToProcessPaymentArgs(values),
    );
  });

  return {
    form,
    onSubmit,
    paymentReceipt: payment.paymentReceipt,
    errorMessage: payment.errorMessage,
    isPending: payment.isPending,
    isSuccess: payment.isSuccess,
    isError: payment.isError,
  };
};
```

Keep UI-to-application mapping in UI infrastructure. Do not place business
validation there; invoke exported pure domain predicates from the schema when
immediate feedback must match a domain rule.

Create an orchestration hook because behavior is coupled, not merely to reduce
the number of hook calls in a container. A container may call behaviorally
independent hooks directly.

Do not use `Flow`, `Controller`, `Submit`, or `Orchestrator` suffixes for
orchestration hooks. Name the capability plainly.

## Component Contracts

For a private form component, passing the form object is valid:

```tsx
interface PaymentFormProps {
  readonly form: UseFormReturn<PaymentFormValues>;
  readonly onSubmit: FormEventHandler<HTMLFormElement>;
  readonly errorMessage?: string;
  readonly isPending: boolean;
}
```

For a public component, prefer a presentation contract:

```tsx
interface PaymentFieldsProps {
  readonly paymentId: string;
  readonly amount: string;
  readonly paymentIdError?: string;
  readonly amountError?: string;
  readonly onPaymentIdChange: (value: string) => void;
  readonly onAmountChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly isPending: boolean;
}
```

The public version does not leak React Hook Form, Zod, or a private schema type.

## Context and Provider Flow

Use context only for client UI state that must cross the tree:

```ts
export interface CheckoutContextValue {
  readonly selectedPaymentId?: string;
  readonly selectPayment: (args: {
    readonly paymentId: string;
  }) => void;
}

export const CheckoutContext =
  createContext<CheckoutContextValue | undefined>(undefined);
```

Supply it from a provider:

```tsx
export const CheckoutProvider = ({
  children,
}: CheckoutProviderProps) => {
  const [selectedPaymentId, setSelectedPaymentId] =
    useState<string>();

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

Read it through one dedicated hook:

```ts
export const useCheckout = () => {
  const checkout = useContext(CheckoutContext);

  if (!checkout) {
    throw new Error("CheckoutProvider is missing");
  }

  return checkout;
};
```

The missing provider is a programming/configuration defect and may throw.
Components and containers consume `useCheckout`; they do not import the context.

Do not put server-state data in context when the request library already owns
its lifecycle and cache.
