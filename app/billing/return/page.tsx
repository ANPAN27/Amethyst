export default function BillingReturnPage() {
  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 24 }}>Payment return</h1>
      <p style={{ color: "#9b9bb0", lineHeight: 1.6 }}>
        Checkout returned. Credits are granted only after the signed Dodo Payments webhook is
        verified, so the balance may take a moment to update.
      </p>
      <p style={{ color: "#9b9bb0", lineHeight: 1.6 }}>
        A redirect or success message is never treated as proof of payment.
      </p>
    </main>
  );
}
