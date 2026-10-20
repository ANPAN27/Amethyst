const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

export function ConfigNotice() {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());

  return (
    <main className="container narrow">
      <h1>Amethyst setup</h1>
      <p className="muted">
        The web dashboard uses Supabase Auth. Copy <code>.env.example</code> to{" "}
        <code>.env.local</code>, fill in the values below, and restart the dev server.
      </p>
      <div className="card">
        <h2>Missing configuration</h2>
        <ul className="list">
          {missing.map((name) => (
            <li className="list-item" key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <p className="small muted" style={{ marginTop: 12 }}>
          Server-only keys are also required for API routes. See{" "}
          <code>docs/DEPLOYMENT.md</code> for the full list.
        </p>
      </div>
    </main>
  );
}
