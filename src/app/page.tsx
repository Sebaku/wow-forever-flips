import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Forever Flips — WoW Forever vendor crafting",
  description:
    "Every craftable recipe in World of Warcraft: Forever (EU), ranked by vendor profit per hour using live auction house prices.",
};

export default function Home() {
  return <Dashboard mode="buy" />;
}
