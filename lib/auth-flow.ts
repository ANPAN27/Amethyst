export const EMAIL_CONFIRMATION_NOTICE =
  "Account created. This project requires email confirmation. Check your inbox for the confirmation link, then sign in.";

export type SignUpOutcome =
  | { kind: "redirect"; destination: string }
  | { kind: "confirmation_required"; message: string };

/**
 * Supabase controls whether email confirmation is required. When signUp
 * returns a session the user is already authenticated and must go straight to
 * the workspace; only a session-less response needs a confirmation notice.
 */
export function resolveSignUpOutcome(input: {
  session: unknown | null | undefined;
  destination: string;
}): SignUpOutcome {
  if (input.session) {
    return { kind: "redirect", destination: input.destination };
  }
  return { kind: "confirmation_required", message: EMAIL_CONFIRMATION_NOTICE };
}
