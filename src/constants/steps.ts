import { Rocket, Shield, Loader2, Target, MessageSquare } from "lucide-react";
import type { Step } from "@/types";

export const stepTitles: Record<Step, string> = {
  upload: "Upload Your Resume",
  auth: "Create Account to Continue",
  parse: "Parsing Resume",
  score: "Resume Analysis",
  interview: "AI Interview Chat",
  rewrite: "Rewriting Your Resume",
  review: "Review Your New Resume",
};

export const stepIcons: Record<Step, React.ElementType> = {
  upload: Rocket,
  auth: Shield,
  parse: Loader2,
  score: Target,
  interview: MessageSquare,
  rewrite: Loader2,
  review: Rocket,
};