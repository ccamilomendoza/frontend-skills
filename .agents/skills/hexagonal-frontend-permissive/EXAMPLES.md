# Hexagonal Frontend (Permissive) — Worked Examples

Three examples: (1) a self-contained `payments` feature, end to end; (2) a
cross-module case where `checkout` imports `user`'s public use case directly;
(3) the two `shared` channels — a multi-entity domain service and a design-system
UI primitive.

## Example 1 — a `payments` feature, end to end

```
src/modules/payments/
  domain/
    entities/receipt.ts
    ports/charge-payment-port.ts
    ports/has-processed-payment-port.ts
    services/receipt-creation.ts
  application/
    use-cases/process-payment.ts
  infrastructure/
    server/
      dtos/receipt-dto.ts
      schemas/receipt-dto-schema.ts
      mappers/receipt-dto-to-make-receipt-args.ts
      adapters/stripe-charge-payment-adapter.ts
    ui/                             # framework-specific UI
```

### domain/entities/receipt.ts

```ts
import type { OrderId, ReceiptId } from "../../../shared/domain/entities/ids";
import type { Money } from "../../../shared/domain/entities/money";

export interface Receipt {
  readonly id: ReceiptId;
  readonly orderId: OrderId;
  readonly charged: Money;
}
```

### domain/services/receipt-creation.ts

```ts
import { err, ok, type Result } from "../../../shared/domain/results/result";
import type { OrderId, ReceiptId } from "../../../shared/domain/entities/ids";
import type { Money } from "../../../shared/domain/entities/money";
import type { Receipt } from "../entities/receipt";

export interface MakeReceiptArgs {
  readonly id: ReceiptId;
  readonly orderId: OrderId;
  readonly charged: Money;
}
export type ReceiptDomainError =
  | { readonly type: "MissingReceiptId" }
  | { readonly type: "InvalidReceiptAmount"; readonly amount: Money };

export const hasPositiveAmount = (amount: Money): boolean => amount.cents > 0;

export const makeReceipt = (
  args: MakeReceiptArgs,
): Result<Receipt, ReceiptDomainError> => {
  if (args.id.value.length === 0) return err({ type: "MissingReceiptId" });
  if (!hasPositiveAmount(args.charged))
    return err({ type: "InvalidReceiptAmount", amount: args.charged });
  return ok(args);
};
```

### domain/ports/charge-payment-port.ts

```ts
import type { Result } from "../../../shared/domain/results/result";
import type { NetworkError, ParseError } from "../../../shared/domain/errors/transport";
import type { OrderId } from "../../../shared/domain/entities/ids";
import type { Money } from "../../../shared/domain/entities/money";
import type { Receipt } from "../entities/receipt";
import type { ReceiptDomainError } from "../services/receipt-creation";

export interface ChargePaymentPortRequest {
  readonly orderId: OrderId;
  readonly amount: Money;
}

export type ChargePaymentPortError =
  | NetworkError
  | ParseError
  | ReceiptDomainError
  | { readonly type: "InsufficientFunds"; readonly balance: Money }
  | { readonly type: "CardDeclined"; readonly reason: string };

export type ChargePaymentPort = (
  request: ChargePaymentPortRequest,
) => Promise<Result<Receipt, ChargePaymentPortError>>;
```

### domain/ports/has-processed-payment-port.ts

```ts
import type { Result } from "../../../shared/domain/results/result";
import type { NetworkError, ParseError } from "../../../shared/domain/errors/transport";
import type { OrderId } from "../../../shared/domain/entities/ids";

export interface HasProcessedPaymentPortRequest {
  readonly orderId: OrderId;
}

export type HasProcessedPaymentPortError = NetworkError | ParseError;

export type HasProcessedPaymentPort = (
  request: HasProcessedPaymentPortRequest,
) => Promise<Result<boolean, HasProcessedPaymentPortError>>;
```

### application/use-cases/process-payment.ts

```ts
import type { Result } from "../../../shared/domain/results/result";
import { err } from "../../../shared/domain/results/result";
import type { OrderId } from "../../../shared/domain/entities/ids";
import type { Money } from "../../../shared/domain/entities/money";
import type { Receipt } from "../../domain/entities/receipt";
import type {
  ChargePaymentPort,
  ChargePaymentPortError,
} from "../../domain/ports/charge-payment-port";
import type {
  HasProcessedPaymentPort,
  HasProcessedPaymentPortError,
} from "../../domain/ports/has-processed-payment-port";

export interface ProcessPaymentDependencies {
  readonly chargePayment: ChargePaymentPort;
  readonly hasProcessedPayment: HasProcessedPaymentPort;
}
export interface ProcessPaymentArgs {
  readonly orderId: OrderId;
  readonly amount: Money;
}
export type ProcessPaymentError =
  | ChargePaymentPortError
  | HasProcessedPaymentPortError
  | { readonly type: "OrderAlreadyProcessed"; readonly orderId: OrderId };

export type ProcessPaymentUseCase = (
  dependencies: ProcessPaymentDependencies,
) => (
  args: ProcessPaymentArgs,
) => Promise<Result<Receipt, ProcessPaymentError>>;

export const makeProcessPaymentUseCase: ProcessPaymentUseCase =
  (dependencies) =>
  async (args) => {
    const processed = await dependencies.hasProcessedPayment({
      orderId: args.orderId,
    });

    if (!processed.ok) return err(processed.error);
    if (processed.value)
      return err({ type: "OrderAlreadyProcessed", orderId: args.orderId });

    return dependencies.chargePayment({
      orderId: args.orderId,
      amount: args.amount,
    });
  };
```

### infrastructure/server/dtos/receipt-dto.ts

```ts
export interface ReceiptDto {
  readonly id: string;
  readonly order_id: string;
  readonly charged_cents: number;
  readonly currency: string;
}
```

### infrastructure/server/schemas/receipt-dto-schema.ts

```ts
import { z } from "zod";
import type { ReceiptDto } from "../dtos/receipt-dto";

export const receiptDtoSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  charged_cents: z.number(),
  currency: z.string(),
}) satisfies z.ZodType<ReceiptDto>;
```

### infrastructure/server/mappers/receipt-dto-to-make-receipt-args.ts

```ts
import type { MakeReceiptArgs } from "../../../domain/services/receipt-creation";
import type { ReceiptDto } from "../dtos/receipt-dto";

export const transformReceiptDtoToMakeReceiptArgs = (
  dto: ReceiptDto,
): MakeReceiptArgs => ({
  id: { value: dto.id },
  orderId: { value: dto.order_id },
  charged: { cents: dto.charged_cents, currency: dto.currency },
});
```

### infrastructure/server/adapters/stripe-charge-payment-adapter.ts (fat adapter)

```ts
import { err } from "../../../../shared/domain/results/result";
import type { ChargePaymentPort } from "../../../domain/ports/charge-payment-port";
import { makeReceipt } from "../../../domain/services/receipt-creation";
import { receiptDtoSchema } from "../schemas/receipt-dto-schema";
import { transformReceiptDtoToMakeReceiptArgs } from "../mappers/receipt-dto-to-make-receipt-args";

export interface StripeChargePaymentAdapterDependencies {
  readonly http: HttpClient;
}

export const makeStripeChargePaymentAdapter =
  (dependencies: StripeChargePaymentAdapterDependencies): ChargePaymentPort =>
  async (request) => {
    const res = await dependencies.http.post("/charges", request);
    if (!res.ok) return err({ type: "NetworkError", status: res.status });

    const parsed = receiptDtoSchema.safeParse(res.body);   // unknown -> ReceiptDto
    if (!parsed.success)
      return err({ type: "ParseError", issues: parsed.error.issues.map(String) });

    return makeReceipt(transformReceiptDtoToMakeReceiptArgs(parsed.data));
  };
```

The use case and domain only ever see `Receipt` and `ChargePaymentPortError` — never the
DTO or Zod. Composition (binding `makeStripeChargePaymentAdapter` into
`makeProcessPaymentUseCase`) happens in the UI layer (`infrastructure/ui/`).

## Example 2 — cross-module: `checkout` imports `user` directly

Here `checkout` may import `user`'s PUBLIC use case
(`modules/user/application/use-cases/`) — but never `user`'s `domain/` or
`infrastructure/`. Keep the graph acyclic (`user` must not import `checkout`).

### user exposes a public use case

```ts
// modules/user/application/use-cases/fetch-current-user.ts
export interface FetchCurrentUserArgs {
  readonly sessionId: SessionId;
}
export interface CurrentUser {
  readonly id: string;
  readonly isVerified: boolean;
}
export type FetchCurrentUserError =
  | NetworkError
  | { readonly type: "NotAuthenticated" };

export interface FetchCurrentUserDependencies {
  readonly fetchUser: FetchUserPort;
  readonly fetchSession: FetchSessionPort;
  readonly args: FetchCurrentUserArgs;
}

export type FetchCurrentUserUseCase = (
  dependencies: FetchCurrentUserDependencies,
) => () => Promise<Result<CurrentUser, FetchCurrentUserError>>;

export const makeFetchCurrentUserUseCase: FetchCurrentUserUseCase =
  (dependencies) =>
  async () => {
    /* … reads user's own domain + ports, returns the public CurrentUser view … */
  };
```

### checkout imports and injects it directly

```ts
// modules/checkout/application/use-cases/start-checkout.ts
import type {
  FetchCurrentUserUseCase,
  FetchCurrentUserError,
} from "../../../user/application/use-cases/fetch-current-user";

// checkout depends on user's already-bound query function, injected as a dep.
export interface StartCheckoutDependencies {
  readonly fetchCurrentUser: ReturnType<FetchCurrentUserUseCase>;
}
export interface StartCheckoutArgs {
  readonly cartId: CartId;
}
export type StartCheckoutError =
  | FetchCurrentUserError
  | { readonly type: "UserNotVerified" };

export type StartCheckoutUseCase = (
  dependencies: StartCheckoutDependencies,
) => (
  args: StartCheckoutArgs,
) => Promise<Result<Checkout, StartCheckoutError>>;

export const makeStartCheckoutUseCase: StartCheckoutUseCase =
  (dependencies) =>
  async (args) => {
    const user = await dependencies.fetchCurrentUser();
    if (!user.ok) return err(user.error);
    if (!user.value.isVerified) return err({ type: "UserNotVerified" });
    /* … build the checkout for args.cartId … */
  };
```

### composition

`checkout`'s UI composition point (or the root shell), inside
`infrastructure/ui/`, builds `makeFetchCurrentUserUseCase(...)` with `user`'s
adapters and query args, then injects the returned no-arg function into
`makeStartCheckoutUseCase`. No `shared` port and no DI indirection is needed — the
dependency is explicit and direct. Just keep the module graph acyclic; if `user`
ever needed `checkout`, extract the shared piece to `shared` or invert one
direction. The concrete framework mechanism for this is out of scope here.

## Example 3 — the two `shared` channels

The use-cases surface (Examples 1–2) carries cross-feature *behavior*. It can't
carry pure shared logic or UI primitives — those go through `shared`, importable
by any module at any layer.

### 3a. A multi-entity domain service → `shared/domain/services/`

`canCheckout(cart, wallet)` is pure (no port, no I/O) and spans entities owned by
two contexts, so it can't be a use case and shouldn't live in either feature's
private domain. When a second consumer appears (rule of two), it lives in
`shared`:

```ts
// modules/shared/domain/services/can-checkout.ts
import type { Cart } from "../entities/cart";
import type { Wallet } from "../entities/wallet";

export const canCheckout = (cart: Cart, wallet: Wallet): boolean =>
  wallet.balance >= cart.total;
```

Any feature imports it directly: `import { canCheckout } from
"../../../shared/domain/services/can-checkout"`. No sibling-domain import, no
use-case wrapper for what is plain pure logic.

### 3b. A design-system primitive → `shared/infrastructure/ui/`

A `Button` is cross-cutting presentation, not feature UI — it is BORN in `shared`
directly (design-system carve-out), and every feature's `infrastructure/ui/`
imports it:

```
modules/shared/infrastructure/ui/
  buttons/button.tsx          # generic primitive, born here
  inputs/text-input.tsx
  dialogs/dialog.tsx
```

A feature's own UI (`modules/payments/infrastructure/ui/`) composes these shared
primitives; it never imports another *feature's* `infrastructure/ui/`. The
concrete framework is out of scope here — only the location and the import
direction are prescribed.
