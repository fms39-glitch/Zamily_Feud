import type { Metadata } from "next";
import { anton, bebasNeue } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zamily Feud",
  description: "A real-time multiplayer party game inspired by Family Feud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${anton.variable}`}>
      <body>{children}</body>
    </html>
  );
}
