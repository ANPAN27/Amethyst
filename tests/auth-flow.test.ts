import { describe, expect, it } from "vitest";
import {
  EMAIL_CONFIRMATION_NOTICE,
  resolveSignUpOutcome,
} from "@/lib/auth-flow";

describe("signup outcome", () => {
  it("redirects straight to the workspace when Supabase returns a session", () => {
    const outcome = resolveSignUpOutcome({
      session: { access_token: "token", refresh_token: "refresh" },
      destination: "/overview",
    });

    expect(outcome).toEqual({ kind: "redirect", destination: "/overview" });
  });

  it("never redirects or claims authentication without a session", () => {
    for (const session of [null, undefined]) {
      const outcome = resolveSignUpOutcome({ session, destination: "/overview" });

      expect(outcome.kind).toBe("confirmation_required");
      if (outcome.kind === "confirmation_required") {
        expect(outcome.message).toBe(EMAIL_CONFIRMATION_NOTICE);
      }
    }
  });
});
