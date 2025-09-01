"use client";

import { useState, useEffect, useRef } from "react";
import type { Step, ChatMessage } from "@/types";
import type {
  ParseResumeInput,
  ParseResumeOutput,
  RewriteResumeInput,
  RewriteResumeOutput,
  ScoreResumeInput,
  ScoreResumeOutput,
} from "@/ai/flows";
import { parseResume } from "@/ai/flows/parse-resume";
import { rewriteResume } from "@/ai/flows/rewrite-resume";
import { scoreResume } from "@/ai/flows/score-resume";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export function useResumeWorkflow() {
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextContent, setResumeTextContent] = useState<string>("");
  const [resumeDataUri, setResumeDataUri] = useState<string>("");
  const [parsedData, setParsedData] = useState<ParseResumeOutput | null>(null);
  const [scoreData, setScoreData] = useState<ScoreResumeOutput | null>(null);
  const [finalInterviewChatHistory, setFinalInterviewChatHistory] = useState<ChatMessage[]>([]);
  const [rewrittenResume, setRewrittenResume] = useState<RewriteResumeOutput | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check if user is authenticated and move to parse step (skip payment for now)
  useEffect(() => {
    if (user && currentStep === "auth" && resumeDataUri) {
      toast({
        title: `Welcome ${user.displayName}!`,
        description: "Now let's analyze your resume with AI.",
        variant: "default",
      });
      setCurrentStep("parse");
      handleParseResume(resumeDataUri);
    }
  }, [user, currentStep, resumeDataUri, toast]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      setProgress(0);
      let currentProgressVal = 0;
      timer = setInterval(() => {
        currentProgressVal += 10;
        if (currentProgressVal > 100) currentProgressVal = 100;
        if (isMountedRef.current) setProgress(currentProgressVal);
      }, 200);
    } else {
      if (isMountedRef.current) setProgress(100);
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  const handleResumeUpload = (
    file: File,
    textContent: string,
    dataUri: string
  ) => {
    if (!isMountedRef.current) return;
    setResumeFile(file);
    setResumeTextContent(textContent);
    setResumeDataUri(dataUri);
    setError(null);

    toast({
      title: "Resume Uploaded Successfully!",
      description: "Please sign in to continue with AI analysis.",
      variant: "default",
    });
    setCurrentStep("auth");
  };

  const handleParseResume = async (dataUri: string) => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    setLoadingMessage("Parsing your resume with AI...");
    setError(null);
    try {
      const input: ParseResumeInput = { resumeDataUri: dataUri };
      const result = await parseResume(input);
      if (!isMountedRef.current) return;
      setParsedData(result);
      setCurrentStep("score");
      toast({
        title: "Resume Parsed!",
        description: "Key information extracted. Now analyzing your resume...",
        variant: "default",
      });
      setTimeout(() => handleScoreResume(dataUri), 100);
    } catch (e: any) {
      console.error("Error parsing resume:", e);
      if (isMountedRef.current) {
        setError("Failed to parse resume. Please try again. " + e.message);
        toast({
          title: "Parsing Failed",
          description: e.message || "An unknown error occurred.",
          variant: "destructive",
        });
        setCurrentStep("auth");
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleScoreResume = async (dataUri: string) => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    setLoadingMessage("Analyzing and scoring your resume with AI...");
    setError(null);
    try {
      const input: ScoreResumeInput = { resumeDataUri: dataUri };
      const result = await scoreResume(input);
      if (!isMountedRef.current) return;
      setScoreData(result);
      toast({
        title: "Resume Analyzed!",
        description: `Your resume scored ${result.overallScore}/100. Review the analysis below.`,
        variant: "default",
      });
    } catch (e: any) {
      console.error("Error scoring resume:", e);
      if (isMountedRef.current) {
        setError("Failed to analyze resume. Please try again. " + e.message);
        toast({
          title: "Analysis Failed",
          description: e.message || "An unknown error occurred.",
          variant: "destructive",
        });
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    setLoadingMessage("Creating your account...");

    try {
      await signInWithGoogle();
      // The useEffect will handle the step transition when user is set
    } catch (e: any) {
      console.error("Error signing in:", e);
      if (isMountedRef.current) {
        setError("Failed to create account. Please try again. " + e.message);
        toast({
          title: "Sign Up Failed",
          description: e.message || "An unknown error occurred.",
          variant: "destructive",
        });
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  // Changed: Now goes to payment instead of interview
  const handleContinueToInterview = () => {
    if (!isMountedRef.current) return;
    setCurrentStep("payment");
  };

  // New: Handle payment success and go to interview
  const handlePaymentSuccess = () => {
    if (!isMountedRef.current) return;
    
    toast({
      title: "Payment Successful!",
      description: "You can now proceed with the AI interview.",
      variant: "default",
    });
    
    setCurrentStep("interview");
  };

  const handleFinishInterview = (interviewChatHistory: ChatMessage[]) => {
    if (!isMountedRef.current) return;

    setFinalInterviewChatHistory(interviewChatHistory);
    setCurrentStep("rewrite");

    const interviewInsights = interviewChatHistory
      .filter((msg) => msg.role === "user" || msg.role === "assistant")
      .map((msg) => `${msg.role === "user" ? "User" : "AI"}: ${msg.text}`)
      .join("\n\n");

    handleRewriteResume(interviewInsights);
  };

  const handleRewriteResume = async (interviewSummary: string) => {
    if (!resumeDataUri) {
      if (isMountedRef.current) {
        setError("Original resume data not found. Please re-upload.");
        toast({
          title: "Error",
          description: "Original resume data not found. Please re-upload.",
          variant: "destructive",
        });
        setCurrentStep("upload");
      }
      return;
    }
    if (!isMountedRef.current) return;
    setIsLoading(true);
    setLoadingMessage("Rewriting your resume based on insights...");
    setError(null);
    try {
      const input: RewriteResumeInput = {
        resumeDataUri: resumeDataUri,
        interviewData: interviewSummary,
      };
      const result = await rewriteResume(input);
      if (!isMountedRef.current) return;
      setRewrittenResume(result);
      setCurrentStep("review");
      toast({
        title: "Resume Rewritten!",
        description: "Your new resume is ready for review.",
        variant: "default",
      });
    } catch (e: any) {
      console.error("Error rewriting resume:", e);
      if (isMountedRef.current) {
        setError("Failed to rewrite resume. Please try again. " + e.message);
        toast({
          title: "Rewrite Failed",
          description: e.message || "An unknown error occurred.",
          variant: "destructive",
        });
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    if (!isMountedRef.current) return;
    setCurrentStep("upload");
    setResumeFile(null);
    setResumeTextContent("");
    setResumeDataUri("");
    setParsedData(null);
    setScoreData(null);
    setFinalInterviewChatHistory([]);
    setRewrittenResume(null);
    setError(null);
    setIsLoading(false);
    setProgress(0);
  };

  return {
    // State
    currentStep,
    resumeFile,
    resumeTextContent,
    resumeDataUri,
    parsedData,
    scoreData,
    finalInterviewChatHistory,
    rewrittenResume,
    isLoading,
    loadingMessage,
    error,
    progress,
    user,
    authLoading,
    
    // Handlers
    handleResumeUpload,
    handleParseResume,
    handleScoreResume,
    handleGoogleSignIn,
    handleContinueToInterview,
    handleFinishInterview,
    handleRewriteResume,
    handleStartOver,
    handlePaymentSuccess,
  };
}