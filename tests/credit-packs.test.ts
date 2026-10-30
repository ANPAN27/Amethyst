import { beforeEach, describe, expect, it, vi } from "vitest";

const configMock = vi.hoisted(() => ({
  dodoConfigured: vi.fn(),
  getCreditProducts: vi.fn(),
}));
const dodoMock = vi.hoisted(() => ({
  getDodoClient: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  dodoConfigured: configMock.dodoConfigured,
  getCreditProducts: configMock.getCreditProducts,
}));

vi.mock("@/lib/services/dodo", () => ({
  getDodoClient: dodoMock.getDodoClient,
}));

import { listCreditPacks } from "@/lib/services/credit-packs";

const products = {
  pdt_100: { credits: 100, display_order: 1 },
  pdt_500: { credits: 500, display_order: 2 },
  pdt_1000: { credits: 1000, display_order: 3 },
};

function installDodoProducts() {
  dodoMock.getDodoClient.mockReturnValue({
    products: {
      retrieve: vi.fn(async (productId: string) => {
        const credits = products[productId as keyof typeof products]?.credits ?? 0;
        return {
          name: `Credits ${credits}`,
          description: null,
          metadata: { credits },
          price: {
            type: "one_time_price",
            price: credits === 100 ? 500 : credits === 500 ? 2000 : 3500,
            currency: "usd",
          },
        };
      }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  configMock.dodoConfigured.mockReturnValue(true);
  configMock.getCreditProducts.mockReturnValue(products);
  installDodoProducts();
});

describe("listCreditPacks", () => {
  it("returns unavailable configured packs when Dodo is not configured", async () => {
    configMock.dodoConfigured.mockReturnValue(false);

    const packs = await listCreditPacks();

    expect(packs).toHaveLength(3);
    expect(packs[0]).toMatchObject({
      id: "pdt_100",
      credits: 100,
      checkoutReady: false,
      unavailableReason: "Payments are not configured",
    });
    expect(dodoMock.getDodoClient).not.toHaveBeenCalled();
  });

  it("uses Dodo prices and recommends the best unit price", async () => {
    const packs = await listCreditPacks();

    expect(packs.map((pack) => pack.id)).toEqual(["pdt_100", "pdt_500", "pdt_1000"]);
    expect(packs.map((pack) => pack.price)).toEqual([500, 2000, 3500]);
    expect(packs.every((pack) => pack.currency === "USD")).toBe(true);
    expect(packs.filter((pack) => pack.recommended).map((pack) => pack.id)).toEqual(["pdt_1000"]);
  });

  it("keeps the remaining packs usable when one Dodo product fails", async () => {
    dodoMock.getDodoClient.mockReturnValue({
      products: {
        retrieve: vi.fn(async (productId: string) => {
          if (productId === "pdt_500") throw new Error("Dodo unavailable");
          return {
            name: productId,
            description: null,
            metadata: { credits: products[productId as keyof typeof products].credits },
            price: { type: "one_time_price", price: 500, currency: "USD" },
          };
        }),
      },
    });

    const packs = await listCreditPacks();

    expect(packs.find((pack) => pack.id === "pdt_500")).toMatchObject({
      checkoutReady: false,
      unavailableReason: "Product is unavailable",
    });
    expect(packs.filter((pack) => pack.checkoutReady)).toHaveLength(2);
  });

  it("rejects products whose Dodo metadata credits differ from the mapping", async () => {
    dodoMock.getDodoClient.mockReturnValue({
      products: {
        retrieve: vi.fn(async () => ({
          name: "Wrong mapping",
          description: null,
          metadata: { credits: 999 },
          price: { type: "one_time_price", price: 500, currency: "USD" },
        })),
      },
    });

    const packs = await listCreditPacks();

    expect(packs[0]).toMatchObject({
      checkoutReady: false,
      unavailableReason: "Product credit mapping does not match",
    });
  });

  it("rejects recurring Dodo products", async () => {
    dodoMock.getDodoClient.mockReturnValue({
      products: {
        retrieve: vi.fn(async () => ({
          name: "Recurring",
          description: null,
          metadata: { credits: 100 },
          price: { type: "recurring_price", price: 500, currency: "USD" },
        })),
      },
    });

    const packs = await listCreditPacks();

    expect(packs[0]).toMatchObject({
      checkoutReady: false,
      unavailableReason: "Product is not a one-time credit pack",
    });
  });
});
