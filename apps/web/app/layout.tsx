import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zamily Feud",
  description: "A real-time multiplayer party game inspired by Family Feud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
