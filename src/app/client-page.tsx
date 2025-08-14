"use client";

import type {
  ParseResumeInput,
  ParseResumeOutput,
} from "@/ai/flows/parse-resume";
import { parseResume } from "@/ai/flows/parse-resume";
import type {
  RewriteResumeInput,
  RewriteResumeOutput,
} from "@/ai/flows/rewrite-resume";
import { rewriteResume } from "@/ai/flows/rewrite-resume";
import {
  InterviewInput,
  type InterviewInputHandle,
} from "@/components/interview-input";
import { ResumeUploader } from "@/components/resume-uploader";
import { ResumeEditor } from "@/components/resume-editor";
import { Button } from "@/components/ui/button";
import type {
  ScoreResumeInput,
  ScoreResumeOutput,
} from "@/ai/flows/score-resume";
import { scoreResume } from "@/ai/flows/score-resume";
import { ResumeScoreDisplay } from "@/components/resume-score-display";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Rocket,
  Loader2,
  FileWarning,
  MessageSquare,
  Target,
  Shield,
  Chrome,
  Star,
  Lock,
} from "lucide-react";
import React, { useState, useEffect, useCallback, useRef } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
};

type Step =
  | "upload"
  | "auth"
  | "parse"
  | "score"
  | "interview"
  | "rewrite"
  | "review";

export default function OppyAIClientPage() {
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextContent, setResumeTextContent] = useState<string>("");
  const [resumeDataUri, setResumeDataUri] = useState<string>("");

  const [parsedData, setParsedData] = useState<ParseResumeOutput | null>(null);
  const [finalInterviewChatHistory, setFinalInterviewChatHistory] = useState<
    ChatMessage[]
  >([]);
  const [rewrittenResume, setRewrittenResume] =
    useState<RewriteResumeOutput | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const interviewInputRef = useRef<InterviewInputHandle | null>(null);
  const isMountedRef = useRef(false);

  const [scoreData, setScoreData] = useState<ScoreResumeOutput | null>(null);

  const elevenLabsApiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check if user is authenticated and move to parse step
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

    // Show success message and move to auth step
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
        setCurrentStep("auth"); // Go back to auth step since resume is uploaded
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

  const handleContinueToInterview = () => {
    if (!isMountedRef.current) return;
    setCurrentStep("interview");
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

  const renderStepContent = () => {
    // Show loading state for parse, score, auth, and rewrite steps
    if (
      isLoading &&
      (currentStep === "parse" ||
        currentStep === "score" ||
        currentStep === "auth" ||
        currentStep === "rewrite" ||
        (currentStep === "interview" && !parsedData))
    ) {
      return (
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center justify-center text-2xl">
              <Loader2 className="mr-2 h-8 w-8 animate-spin text-primary" />
              Processing...
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">{loadingMessage}</p>
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
          </CardContent>
        </Card>
      );
    }

    if (error && currentStep !== "interview") {
      return (
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center justify-center text-2xl text-destructive">
              <FileWarning className="mr-2 h-8 w-8" />
              An Error Occurred
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={handleStartOver} variant="outline">
              Start Over
            </Button>
          </CardContent>
        </Card>
      );
    }

    switch (currentStep) {
      case "upload":
        return (
          <ResumeUploader onUpload={handleResumeUpload} disabled={isLoading} />
        );

      case "auth":
        return (
          <Card className="w-full max-w-md shadow-xl border-2 border-blue-200">
            <CardHeader className="text-center pb-4">
              <div className="flex items-center justify-center mb-4">
                <div className="relative">
                  <Shield className="h-10 w-10 text-blue-600" />
                  <Lock className="h-4 w-4 text-blue-800 absolute -top-1 -right-1" />
                </div>
              </div>
              <CardTitle className="text-2xl text-blue-900">
                Create Your Account
              </CardTitle>
              <CardDescription className="text-base text-gray-700">
                Sign up to unlock AI resume analysis, personalized interview,
                and professional rewriting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm text-green-800 text-center">
                  ✅ Resume uploaded successfully! Sign in to continue.
                </p>
              </div>

              <Button
                onClick={handleGoogleSignIn}
                disabled={isLoading || authLoading}
                size="lg"
                className="w-full bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50 hover:border-blue-300 shadow-lg transition-all duration-200"
              >
                <Chrome className="mr-3 h-5 w-5" />
                Sign Up with Google
              </Button>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-center">
                    <Star className="h-6 w-6 text-green-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-green-800">
                      Premium AI Analysis
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Deep interview insights
                    </p>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-center">
                    <Rocket className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-blue-800">
                      Professional Rewrite
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      ATS-optimized format
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                <div className="text-sm text-gray-800 space-y-2">
                  <p className="font-medium text-center text-purple-900">
                    🚀 What You'll Get:
                  </p>
                  <div className="space-y-1 text-xs">
                    <p>✅ AI resume parsing and scoring</p>
                    <p>
                      ✅ Personalized AI interview tailored to your experience
                    </p>
                    <p>✅ Professional resume rewrite with industry keywords</p>
                    <p>✅ ATS optimization to pass automated screening</p>
                    <p>✅ Save and access your resumes anytime</p>
                  </div>
                </div>
              </div>

              <div className="text-center mt-6">
                <p className="text-xs text-muted-foreground">
                  🔒 Secure sign-up • No spam • Cancel anytime
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  By continuing, you agree to our Terms of Service and Privacy
                  Policy.
                </p>
              </div>
            </CardContent>
          </Card>
        );

      case "parse":
        return <p>Preparing to parse...</p>;

      case "score":
        if (!scoreData && !isLoading) {
          return <p>Preparing to analyze resume...</p>;
        }
        if (!scoreData) {
          return null;
        }
        return (
          <ResumeScoreDisplay
            scoreData={scoreData}
            onContinue={handleContinueToInterview}
            onStartOver={handleStartOver}
            disabled={isLoading}
          />
        );

      case "interview":
        if (!parsedData)
          return (
            <p>
              Error: Parsed data not available. Please{" "}
              <Button variant="link" onClick={handleStartOver}>
                start over
              </Button>
              .
            </p>
          );
        if (!user) return <p>Please sign in to continue with the interview.</p>;
        if (!elevenLabsApiKey) {
          return (
            <Card className="w-full max-w-2xl shadow-xl">
              <CardHeader>
                <CardTitle>AI Interview Chat</CardTitle>
                <CardDescription>Configuration Error</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-destructive">
                  ElevenLabs API Key is not configured. Please set the
                  NEXT_PUBLIC_ELEVENLABS_API_KEY environment variable. The AI
                  Interview feature cannot function without it.
                </p>
              </CardContent>
            </Card>
          );
        }
        return (
          <div className="w-full max-w-3xl space-y-6">
            <InterviewInput
              ref={interviewInputRef}
              parsedData={parsedData}
              onFinishInterview={handleFinishInterview}
              disabled={isLoading}
            />
          </div>
        );

      case "rewrite":
        return <p>Preparing to rewrite...</p>;

      case "review":
        if (!rewrittenResume)
          return (
            <p>
              Error: Rewritten data not available. Please{" "}
              <Button variant="link" onClick={handleStartOver}>
                start over
              </Button>
              .
            </p>
          );
        return (
          <ResumeEditor
            originalResumeText={resumeTextContent}
            rewrittenResumeOutput={rewrittenResume}
            onStartOver={handleStartOver}
          />
        );

      default:
        return (
          <p>
            Unknown step. Please{" "}
            <Button variant="link" onClick={handleStartOver}>
              start over
            </Button>
            .
          </p>
        );
    }
  };

  const stepTitles: Record<Step, string> = {
    upload: "Upload Your Resume",
    auth: "Create Account to Continue",
    parse: "Parsing Resume",
    score: "Resume Analysis",
    interview: "AI Interview Chat",
    rewrite: "Rewriting Your Resume",
    review: "Review Your New Resume",
  };

  const stepIcons: Record<Step, React.ElementType> = {
    upload: Rocket,
    auth: Shield,
    parse: Loader2,
    score: Target,
    interview: MessageSquare,
    rewrite: Loader2,
    review: Rocket,
  };

  const CurrentStepIcon = stepIcons[currentStep] || Rocket;

  const showStepTitleCard =
    !(
      currentStep === "interview" &&
      parsedData &&
      !error &&
      elevenLabsApiKey &&
      !isLoading &&
      user
    ) &&
    !(currentStep === "score" && scoreData && !isLoading && !error) &&
    !(currentStep === "auth" && !isLoading && !error) &&
    !(
      isLoading &&
      (currentStep === "parse" ||
        currentStep === "score" ||
        currentStep === "auth" ||
        currentStep === "rewrite")
    );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-background to-muted/30">
      <header className="mb-8 text-center">
        <div className="flex items-center justify-center mb-2">
          <Rocket className="h-12 w-12 text-primary mr-3" />
          <h1 className="text-4xl font-bold tracking-tight">Oppy AI</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          AI-powered resume rewriting to help you land your dream job.
        </p>
      </header>

      <main className="w-full flex flex-col items-center">
        {showStepTitleCard && (
          <Card className="w-full max-w-md mb-6 shadow-md">
            <CardHeader>
              <CardTitle className="text-xl text-center flex items-center justify-center">
                <CurrentStepIcon
                  className={`mr-2 h-6 w-6 ${
                    (currentStep === "parse" || currentStep === "rewrite") &&
                    isLoading
                      ? "animate-spin"
                      : ""
                  }`}
                />
                {stepTitles[currentStep]}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
        {renderStepContent()}
      </main>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Oppy AI. All rights reserved.</p>
        <p>Powered by Genkit and Next.js</p>
      </footer>
    </div>
  );
}
