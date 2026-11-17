import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forever Flips — WoW Forever vendor crafting",
  description:
    "Every craftable recipe in World of Warcraft: Forever (EU), ranked by vendor profit per hour using live auction house prices.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#070a0f] text-zinc-200 antialiased">{children}</body>
    </html>
  );
}
