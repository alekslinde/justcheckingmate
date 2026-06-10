import type { Metadata } from "next";
import LearnContent from "@/components/LearnContent";

export const metadata: Metadata = {
  title: "Learn — Just Checking, Mate 🦘",
  description: "Understand how scammers work, where scams come from, how to handle one, and what to do if you've already clicked or shared details.",
};

export default function LearnPage() {
  return <LearnContent />;
}
