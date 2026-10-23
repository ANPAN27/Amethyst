"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Notice } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AccountSecurity({
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmPassword("");
      toast.push({ title: "Password updated", tone: "success" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the password.");
    } finally {
      setBusy(false);
    }
  }

  async function signOutAll() {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
      const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
      if (signOutError) throw signOutError;
      window.location.assign("/login");
    } catch (caught) {
      toast.push({
        title: "Could not sign out all sessions",
        description: caught instanceof Error ? caught.message : "Try again.",
        tone: "danger",
      });
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Account security</h2>
          <p>Update the password or end authenticated sessions.</p>
        </div>
      </div>
      <div className="panel-body">
        <form className="stack" onSubmit={submit}>
          {error ? <Notice tone="danger" title="Password not updated">{error}</Notice> : null}
          <div className="form-grid">
            <Field htmlFor="settings-password" label="New password">
              <Input
                autoComplete="new-password"
                id="settings-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </Field>
            <Field htmlFor="settings-confirm-password" label="Confirm password">
              <Input
                autoComplete="new-password"
                id="settings-confirm-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </Field>
          </div>
          <div className="form-actions" style={{ justifyContent: "space-between" }}>
            <Button disabled={busy} onClick={signOutAll} type="button" variant="danger">
              Sign out all sessions
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
