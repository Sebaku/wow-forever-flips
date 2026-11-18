import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Self-craft mats — Forever Flips",
  description:
    "Rank WoW: Forever recipes by vendor profit per hour when intermediate reagents are crafted yourself; includes every sub-craft's time.",
};

export default function SelfCraftPage() {
  return <Dashboard mode="craft" />;
}
