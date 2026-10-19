const endpoints = [
  "GET  /api/v1/health",
  "GET  /api/v1/me",
  "GET|POST /api/v1/projects",
  "GET|PATCH|DELETE /api/v1/projects/:id",
  "GET|POST /api/v1/projects/:id/targets",
  "GET|POST /api/v1/projects/:id/jobs",
  "GET  /api/v1/projects/:id/findings",
  "POST /api/v1/projects/:id/graph/query",
  "POST /api/v1/projects/:id/ai/chat",
  "POST /api/v1/projects/:id/ai/codegen",
  "GET  /api/v1/jobs/:id",
  "GET  /api/v1/jobs/:id/artifact",
  "POST /api/v1/jobs/:id/graph-sync",
  "POST /api/v1/companions/pairing",
  "GET  /api/v1/companions",
  "DELETE /api/v1/companions/:id",
  "POST /api/v1/companion/pair",
  "GET  /api/v1/companion/me",
  "POST /api/v1/companion/jobs/next",
  "POST /api/v1/companion/jobs/:id/artifact",
  "POST /api/v1/companion/jobs/:id/progress",
  "POST /api/v1/companion/jobs/:id/result",
  "GET  /api/v1/credits/balance",
  "GET  /api/v1/credits/transactions",
  "POST /api/v1/credits/checkout",
  "POST /api/v1/webhooks/dodo",
];

export default function Home() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 28 }}>Amethyst backend</h1>
      <p style={{ color: "#9b9bb0", lineHeight: 1.6 }}>
        Evidence-grounded reverse-engineering workflows. Authentication is handled by Supabase.
        Protected routes accept a Supabase access token as <code>Authorization: Bearer &lt;token&gt;</code>.
      </p>
      <h2 style={{ fontSize: 18, marginTop: 32 }}>API surface</h2>
      <pre
        style={{
          background: "#14141f",
          border: "1px solid #26263a",
          borderRadius: 8,
          padding: 16,
          overflowX: "auto",
          lineHeight: 1.7,
          fontSize: 13,
        }}
      >
        {endpoints.join("\n")}
      </pre>
      <p style={{ color: "#9b9bb0", fontSize: 13 }}>
        See <code>docs/API.md</code> for request and response contracts.
      </p>
    </main>
  );
}
