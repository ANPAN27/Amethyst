import { IconCredits } from "@/components/icons";
import { CheckoutButton } from "@/components/usage/checkout-button";
import { Badge } from "@/components/ui/primitives";
import type { CreditPack } from "@/lib/types";
import { formatMoney, pluralize } from "@/lib/ui";

export function CreditPackCard({ pack }: { pack: CreditPack }) {
  return (
    <article className={`payment-pack${pack.recommended ? " payment-pack-recommended" : ""}`}>
      <div className="payment-pack-head">
        <span className="payment-pack-icon">
          <IconCredits size={16} />
        </span>
        {pack.recommended ? <Badge tone="solid">Best value</Badge> : null}
      </div>

      <div>
        <h3 className="payment-pack-name">{pack.name}</h3>
        <div className="payment-pack-credits">{pack.credits.toLocaleString()}</div>
        <span className="payment-pack-unit">{pluralize(pack.credits, "credit")}</span>
      </div>

      {pack.description ? <p className="payment-pack-description">{pack.description}</p> : null}

      <div className="payment-pack-footer">
        <div>
          <span className="payment-pack-price">
            {pack.price !== null ? formatMoney(pack.price, pack.currency) : "Price unavailable"}
          </span>
          <span className="payment-pack-price-note">
            {pack.currency ? `Billed in ${pack.currency}` : "Test-mode product"}
          </span>
        </div>
        {pack.checkoutReady ? (
          <CheckoutButton
            credits={pack.credits}
            label="Purchase"
            productId={pack.id}
            variant={pack.recommended ? "primary" : "secondary"}
          />
        ) : (
          <Badge tone="warning">{pack.unavailableReason ?? "Unavailable"}</Badge>
        )}
      </div>
    </article>
  );
}
