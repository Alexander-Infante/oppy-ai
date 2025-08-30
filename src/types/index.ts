export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
};

export type Step =
  | "upload"
  | "auth"
  | "parse"
  | "score"
  | "interview"
  | "rewrite"
  | "review";

export const stepTitles: Record<Step, string> = {
  upload: "Upload Your Resume",
  auth: "Create Account to Continue",
  parse: "Parsing Resume",
  score: "Resume Analysis",
  interview: "AI Interview Chat",
  rewrite: "Rewriting Your Resume",
  review: "Review Your New Resume",
};