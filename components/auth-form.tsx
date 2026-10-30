"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { resolveSignUpOutcome } from "@/lib/auth-flow";
import { safeNextPath } from "@/lib/ui";
import { Button, Field, Input, Notice } from "@/components/ui/primitives";

type AuthFormProps = {
  mode: "signin" | "signup";
  supabaseUrl: string;
  supabaseAnonKey: string;
  nextPath?: string;
};

export function AuthForm({ mode, supabaseUrl, supabaseAnonKey, nextPath }: AuthFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const destination = useMemo(() => safeNextPath(nextPath), [nextPath]);
  const isSignup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);

      if (!isSignup) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        window.location.assign(destination);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(destination)}`,
        },
      });
      if (signUpError) throw signUpError;

      const outcome = resolveSignUpOutcome({
        session: data.session,
        destination,
      });

      if (outcome.kind === "redirect") {
        // Confirm the browser client persisted the session before leaving the
        // auth page. Never redirect as authenticated without a session.
        const { data: current, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !current.session) {
          throw new Error(
            "Your account was created, but the session could not be established. Sign in to continue.",
          );
        }
        window.location.replace(outcome.destination);
        return;
      }

      setNotice(outcome.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="auth-form" onSubmit={submit}>
        {error ? (
          <Notice tone="danger" title="Authentication failed">
            {error}
          </Notice>
        ) : null}
        {notice ? <Notice tone="success">{notice}</Notice> : null}

        {isSignup ? (
          <Field htmlFor="full-name" label="Name" hint="Optional. Used only for your workspace profile.">
            <Input
              autoComplete="name"
              id="full-name"
              maxLength={120}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Ada Lovelace"
              value={fullName}
            />
          </Field>
        ) : null}

        <Field htmlFor="email" label="Email">
          <Input
            autoComplete="email"
            id="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@domain.com"
            required
            type="email"
            value={email}
          />
        </Field>

        <Field
          htmlFor="password"
          label="Password"
          hint={isSignup ? "At least 8 characters." : undefined}
        >
          <Input
            autoComplete={isSignup ? "new-password" : "current-password"}
            id="password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </Field>

        <Button disabled={busy} type="submit">
          {busy ? "Working…" : isSignup ? "Create account" : "Sign in"}
        </Button>

        <div className="auth-links">
          {isSignup ? (
            <span className="muted small">
              Already have an account? <Link href="/login">Sign in</Link>
            </span>
          ) : (
            <>
              <Link href="/forgot-password">Forgot password?</Link>
              <span className="muted small">
                No account? <Link href="/signup">Create one</Link>
              </span>
            </>
          )}
        </div>
      </form>
      <div className="auth-meta">
        Sessions are managed by Supabase. Server routes verify identity on every request, and data
        access is constrained by owner-scoped policies.
      </div>
    </>
  );
}

export function ForgotPasswordForm({
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(
          "/auth/reset-password",
        )}`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send the reset email.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="stack">
        <Notice tone="success" title="Recovery email sent">
          If an account exists for {email}, a password recovery link is on its way. Follow it to
          choose a new password.
        </Notice>
        <Link className="btn btn-secondary" href="/login">
          Return to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {error ? (
        <Notice tone="danger" title="Could not send recovery email">
          {error}
        </Notice>
      ) : null}
      <Field
        htmlFor="recovery-email"
        label="Account email"
        hint="We will send a short-lived Supabase recovery link."
      >
        <Input
          autoComplete="email"
          id="recovery-email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@domain.com"
          required
          type="email"
          value={email}
        />
      </Field>
      <Button disabled={busy} type="submit">
        {busy ? "Sending…" : "Send recovery link"}
      </Button>
      <div className="auth-links">
        <Link href="/login">Back to sign in</Link>
      </div>
    </form>
  );
}

export function ResetPasswordForm({
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setNotice("Password updated. Redirecting to your workspace…");
      window.setTimeout(() => window.location.assign("/overview"), 900);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {error ? (
        <Notice tone="danger" title="Password not updated">
          {error}
        </Notice>
      ) : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <Field htmlFor="new-password" label="New password" hint="At least 8 characters.">
        <Input
          autoComplete="new-password"
          id="new-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </Field>
      <Field htmlFor="confirm-password" label="Confirm password">
        <Input
          autoComplete="new-password"
          id="confirm-password"
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </Field>
      <Button disabled={busy} type="submit">
        {busy ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
