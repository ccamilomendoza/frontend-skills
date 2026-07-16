# Hexagonal Frontend (Strict) — Worked Examples

Three examples: (1) a self-contained `payments` feature, end to end; (2) a
cross-module case where `checkout` needs `user` data without importing `user`;
(3) the non-port `shared` channels — a multi-entity domain service and a
design-system UI primitive.

## Example 1 — a `payments` feature, end to end

```
src/modules/payments/
  domain/
    entities/receipt.ts
    ports/payment-gateway.ts
    services/                       # (none needed here)
  application/
    use-cases/process-payment.ts
  infrastructure/
    server/
      dtos/receipt-dto.ts
      schemas/receipt-schema.ts
      mappers/to-receipt.ts
      adapters/stripe-payment-gateway.ts
    ui/                             # framework-specific UI
```

### domain/entities/receipt.ts

```ts
import type { Money } from "../../../shared/domain/value-objects/money";

export interface Receipt {
  readonly id: ReceiptId;
  readonly orderId: OrderId;
  readonly charged: Money;
}
```

### domain/ports/payment-gateway.ts

```ts
import type { Result } from "../../../shared/domain/results/result";
import type { NetworkError, ParseError } from "../../../shared/domain/errors/transport";

export type ChargeError =
  | NetworkError
  | ParseError
  | { type: "InsufficientFunds"; balance: Money }
  | { type: "CardDeclined"; reason: string };

export interface PaymentGateway {
  charge(orderId: OrderId, amount: Money): Promise<Result<Receipt, ChargeError>>;
}
```

### application/use-cases/process-payment.ts

```ts
import type { Result } from "../../../shared/domain/results/result";
import { err } from "../../../shared/domain/results/result";
import type { PaymentGateway, ChargeError } from "../../domain/ports/payment-gateway";

export interface ProcessPaymentDeps {
  readonly payments: PaymentGateway;
}
export interface ProcessPaymentInput {
  readonly orderId: OrderId;
  readonly amount: Money;
}
export type ProcessPaymentError =
  | ChargeError
  | { type: "OrderAlreadyProcessed"; orderId: OrderId };

export const makeProcessPayment =
  (deps: ProcessPaymentDeps) =>
  async (input: ProcessPaymentInput): Promise<Result<Receipt, ProcessPaymentError>> => {
    if (await alreadyProcessed(input.orderId))
      return err({ type: "OrderAlreadyProcessed", orderId: input.orderId });
    return deps.payments.charge(input.orderId, input.amount);
  };
```

### infrastructure/server/adapters/stripe-payment-gateway.ts (fat adapter)

```ts
import { ok, err } from "../../../../shared/domain/results/result";
import type { PaymentGateway } from "../../../domain/ports/payment-gateway";
import { receiptSchema } from "../schemas/receipt-schema";
import { toReceipt } from "../mappers/to-receipt";

export const makeStripePaymentGateway =
  (deps: { http: HttpClient }): PaymentGateway => ({
    async charge(orderId, amount) {
      const res = await deps.http.post("/charges", { orderId, amount });
      if (!res.ok) return err({ type: "NetworkError", status: res.status });

      const parsed = receiptSchema.safeParse(res.body);   // unknown -> DTO
      if (!parsed.success)
        return err({ type: "ParseError", issues: parsed.error.issues.map(String) });

      return ok(toReceipt(parsed.data));                   // total pure mapper -> entity
    },
  });
```

Note how the use case and domain only ever see `Receipt` and `ChargeError` —
never the DTO or Zod. Composition (binding `makeStripePaymentGateway` into
`makeProcessPayment`) happens in the UI layer (`infrastructure/ui/`).

## Example 2 — cross-module: `checkout` needs the current user

`checkout` must NOT import `user`. Invert through a shared port.

### modules/shared/domain/ports/current-user-gateway.ts

```ts
import type { Result } from "../results/result";
import type { NetworkError } from "../errors/transport";

// A minimal, checkout-shaped view of "current user" — NOT user's full entity.
export interface CurrentUser {
  readonly id: string;
  readonly isVerified: boolean;
}
export type CurrentUserError = NetworkError | { type: "NotAuthenticated" };

export interface CurrentUserGateway {
  current(): Promise<Result<CurrentUser, CurrentUserError>>;
}
```

### checkout depends ONLY on the shared port

```ts
// modules/checkout/application/use-cases/start-checkout.ts
import type { CurrentUserGateway } from "../../../shared/domain/ports/current-user-gateway";

export const makeStartCheckout =
  (deps: { currentUser: CurrentUserGateway }) =>
  async (input: StartCheckoutInput): Promise<Result<Checkout, StartCheckoutError>> => {
    const user = await deps.currentUser.current();
    if (!user.ok) return err(user.error);
    if (!user.value.isVerified) return err({ type: "UserNotVerified" });
    /* … build the checkout … */
  };
```

### `user` provides the adapter (in its OWN infra)

```ts
// modules/user/infrastructure/server/adapters/current-user-gateway.ts
import type { CurrentUserGateway } from "../../../../shared/domain/ports/current-user-gateway";

export const makeUserCurrentUserGateway =
  (deps: { session: SessionStore }): CurrentUserGateway => ({
    async current() { /* map user's internal model -> CurrentUser */ },
  });
```

### the root UI shell binds them (composition)

The outermost infra shell (in `infrastructure/ui/`) — the only place allowed to
see multiple modules — fills a `shared`-defined DI seam with
`makeUserCurrentUserGateway(...)`, and `checkout` reads the port from that seam.
`checkout` therefore depends only on `shared`, never on `user`. The concrete
framework mechanism for this binding is out of scope for this skill.

## Example 3 — the non-port `shared` channels

Port inversion (Example 2) is for *runtime behavior* owned by another feature.
Pure shared logic and UI primitives need no port — they live directly in
`shared`, the one module everyone may import at any layer.

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
