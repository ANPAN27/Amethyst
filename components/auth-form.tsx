"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Mode = "signin" | "signup";

export function AuthForm({ supabaseUrl, supabaseAnonKey }: { supabaseUrl: string; supabaseAnonKey: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      const supabase = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        window.location.assign("/projects");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      if (data.session) {
        window.location.assign("/projects");
        return;
      }
      setNotice("Account created. Check your email to confirm the address, then sign in.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="tabs">
        <button
          className={mode === "signin" ? "active" : ""}
          type="button"
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          className={mode === "signup" ? "active" : ""}
          type="button"
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert notice">{notice}</div> : null}

      <label className="field">
        <span>Email</span>
        <input
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      <button disabled={busy} type="submit">
        {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
      </button>

      <p className="small muted" style={{ margin: 0 }}>
        Identity and sessions are managed by Supabase. Server routes verify the session on every
        request.
      </p>
    </form>
  );
}
