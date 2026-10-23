import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Amethyst — Reverse-engineering intelligence",
    template: "%s · Amethyst",
  },
  description:
    "Reverse-engineer applications, map their architecture, inspect evidence, and turn complex codebases into actionable intelligence with AI.",
  applicationName: "Amethyst",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
