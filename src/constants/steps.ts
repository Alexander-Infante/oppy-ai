import { Rocket, Shield, Loader2, Target, MessageSquare, CreditCard } from "lucide-react";
import type { Step } from "@/types";

export const stepTitles: Record<Step, string> = {
  upload: "Upload Your Resume",
  auth: "Create Account to Continue",
  parse: "Parsing Resume",
  score: "Resume Analysis",
  payment: "Complete Payment",
  interview: "AI Interview Chat",
  rewrite: "Rewriting Your Resume",
  review: "Review Your New Resume",
};

export const stepIcons: Record<Step, React.ElementType> = {
  upload: Rocket,
  auth: Shield,
  parse: Loader2,
  score: Target,
  payment: CreditCard,
  interview: MessageSquare,
  rewrite: Loader2,
  review: Rocket,
};