import type { Metadata } from "next";
import WFDMode from "@/components/whats-for-dinner/WFDMode";

export const metadata: Metadata = {
  title: "What's for Dinner? — Recipe Viewer",
};

export default function WFDPage() {
  return <WFDMode />;
}
