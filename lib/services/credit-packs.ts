import "server-only";

import { dodoConfigured, getCreditProducts, type CreditProduct } from "@/lib/config";
import { getDodoClient } from "@/lib/services/dodo";

export type CreditPack = {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  price: number | null;
  currency: string | null;
  displayOrder: number;
  recommended: boolean;
  active: boolean;
  checkoutReady: boolean;
  unavailableReason: string | null;
};

type ProductPrice = {
  type?: string;
  price?: number;
  currency?: string;
  discount?: number;
  discount_bps?: number;
};

function discountedAmount(price: ProductPrice): number | null {
  if (typeof price.price !== "number" || !Number.isFinite(price.price)) return null;
  const discountBps =
    typeof price.discount_bps === "number"
      ? price.discount_bps
      : typeof price.discount === "number"
        ? price.discount * 100
        : 0;
  const amount = Math.floor(price.price * (1 - discountBps / 10_000));
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

function configPacks(): Array<{ id: string; product: CreditProduct }> {
  try {
    return Object.entries(getCreditProducts()).map(([id, product]) => ({ id, product }));
  } catch (error) {
    console.error("[credit-packs] invalid DODO_PRODUCT_CREDITS configuration", {
      message: error instanceof Error ? error.message : "Unknown configuration error",
    });
    return [];
  }
}

function recommendBestValue(packs: CreditPack[]): CreditPack[] {
  const explicit = packs.filter((pack) => pack.recommended);
  if (explicit.length > 0) return packs;

  const priced = packs.filter(
    (pack) => pack.checkoutReady && pack.price !== null && pack.credits > 0,
  );
  if (priced.length < 2) return packs;

  const unitPrices = priced.map((pack) => (pack.price as number) / pack.credits);
  const lowest = Math.min(...unitPrices);
  const best = priced.filter((pack, index) => unitPrices[index] === lowest);

  if (best.length !== 1) return packs;
  const bestId = best[0]?.id;
  return packs.map((pack) => (pack.id === bestId ? { ...pack, recommended: true } : pack));
}

/**
 * Combine the server-side product -> credit mapping with the authoritative
 * Dodo product catalog. Price, currency, name and description always come from
 * Dodo; the environment mapping only decides credits, visibility and ordering.
 */
export async function listCreditPacks(options: { includeInactive?: boolean } = {}): Promise<CreditPack[]> {
  const configured = configPacks().sort((left, right) => {
    const leftOrder = left.product.display_order ?? 0;
    const rightOrder = right.product.display_order ?? 0;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.product.credits - right.product.credits;
  });

  const active = options.includeInactive
    ? configured
    : configured.filter((entry) => entry.product.active !== false);

  if (!dodoConfigured()) {
    return active.map(({ id, product }) => ({
      id,
      name: product.name ?? id,
      description: product.description ?? null,
      credits: product.credits,
      price: null,
      currency: null,
      displayOrder: product.display_order ?? 0,
      recommended: product.recommended === true,
      active: product.active !== false,
      checkoutReady: false,
      unavailableReason: "Payments are not configured",
    }));
  }

  const dodo = getDodoClient();
  const packs = await Promise.all(
    active.map(async ({ id, product }): Promise<CreditPack> => {
      const base: CreditPack = {
        id,
        name: product.name ?? id,
        description: product.description ?? null,
        credits: product.credits,
        price: null,
        currency: null,
        displayOrder: product.display_order ?? 0,
        recommended: product.recommended === true,
        active: product.active !== false,
        checkoutReady: false,
        unavailableReason: null,
      };

      try {
        const providerProduct = await dodo.products.retrieve(id);
        const price = providerProduct.price as ProductPrice;
        if (price.type !== "one_time_price") {
          return { ...base, unavailableReason: "Product is not a one-time credit pack" };
        }

        const metadataCredits = providerProduct.metadata?.credits;
        if (
          metadataCredits !== undefined &&
          metadataCredits !== null &&
          Number(metadataCredits) !== product.credits
        ) {
          return { ...base, unavailableReason: "Product credit mapping does not match" };
        }

        const amount = discountedAmount(price);
        const currency =
          typeof price.currency === "string" ? price.currency.toUpperCase() : null;
        if (amount === null || !currency) {
          return { ...base, unavailableReason: "Product price is invalid" };
        }

        return {
          ...base,
          name: providerProduct.name || base.name,
          description: providerProduct.description ?? base.description,
          price: amount,
          currency,
          checkoutReady: true,
        };
      } catch {
        return { ...base, unavailableReason: "Product is unavailable" };
      }
    }),
  );

  return recommendBestValue(packs);
}
