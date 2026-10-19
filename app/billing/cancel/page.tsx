export default function BillingCancelPage() {
  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 24 }}>Checkout canceled</h1>
      <p style={{ color: "#9b9bb0", lineHeight: 1.6 }}>
        No payment was taken and no credits were added. You can start a new checkout from the
        Amethyst app at any time.
      </p>
    </main>
  );
}
