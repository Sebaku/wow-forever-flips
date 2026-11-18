import type { Metadata } from "next";

import { Dashboard } from "@/components/dashboard";

export const metadata: Metadata = {
  title: "Best path — Forever Flips",
  description:
    "Rank WoW: Forever recipes by their best achievable vendor profit per hour, choosing between buying reagents and self-crafting the intermediates.",
};

export default function BestPathPage() {
  return <Dashboard mode="best" />;
}
