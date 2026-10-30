import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());
const getSupabaseAdminMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

import { getCreditTotals } from "@/lib/services/credits";

beforeEach(() => {
  vi.clearAllMocks();
  getSupabaseAdminMock.mockReturnValue({ rpc: rpcMock });
});

describe("getCreditTotals", () => {
  it("returns normalized totals from the credit_totals RPC", async () => {
    rpcMock.mockResolvedValue({
      data: { purchased: 600, consumed: 25, entries: 4 },
      error: null,
    });

    await expect(getCreditTotals("user-1")).resolves.toEqual({
      purchased: 600,
      consumed: 25,
      entries: 4,
    });
    expect(rpcMock).toHaveBeenCalledWith("credit_totals", { p_user_id: "user-1" });
  });

  it("throws a contextual error when the Supabase RPC fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.credit_totals(p_user_id)",
      },
    });

    await expect(getCreditTotals("user-1")).rejects.toThrow("Unable to load credit totals");
    expect(consoleError).toHaveBeenCalledWith(
      "[credits] credit_totals failed",
      expect.objectContaining({ code: "PGRST202" }),
    );
    consoleError.mockRestore();
  });
});
