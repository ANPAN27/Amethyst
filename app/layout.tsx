import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amethyst",
  description: "Evidence-grounded reverse-engineering workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
