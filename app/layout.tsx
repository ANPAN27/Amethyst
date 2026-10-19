import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Amethyst API",
  description: "Backend for evidence-grounded reverse-engineering workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          background: "#0b0b12",
          color: "#e6e6f0",
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
