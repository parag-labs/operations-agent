import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Operations Agent",
  description: "Multi-agent AI operations assistant with human-in-the-loop approvals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
