"use client";

import type { InterviewInputHandle } from "@/components/interview-input";
import { InterviewInput } from "@/components/interview-input";
import { ResumeUploader } from "@/components/resume-uploader";
import { ResumeEditor } from "@/components/resume-editor";
import { ResumeScoreDisplay } from "@/components/resume-score-display";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { LoadingCard } from "@/components/loading-card";
import { ErrorCard } from "@/components/error-card";
import { AuthCard } from "@/components/auth-card";
import { StepTitleCard } from "@/components/step-title-card";
import { useResumeWorkflow } from "@/hooks/use-resume-workflow";
import { PaymentCard } from "@/components/payment-card";
import React, { useEffect, useRef } from "react";

export default function OppyAIClientPage() {
  const workflow = useResumeWorkflow();
  const interviewInputRef = useRef<InterviewInputHandle | null>(null);
  const isMountedRef = useRef(false);
  const elevenLabsApiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const renderStepContent = () => {
    const {
      currentStep,
      isLoading,
      error,
      loadingMessage,
      progress,
      parsedData,
      scoreData,
      user,
      resumeTextContent,
      rewrittenResume,
      authLoading,
      handleResumeUpload,
      handleGoogleSignIn,
      handleContinueToInterview,
      handleFinishInterview,
      handleStartOver,
      handlePaymentSuccess,
    } = workflow;

    // Show loading state for parse, score, auth, and rewrite steps
    if (
      isLoading &&
      (currentStep === "parse" ||
        currentStep === "score" ||
        currentStep === "auth" ||
        currentStep === "payment" ||
        currentStep === "rewrite" ||
        (currentStep === "interview" && !parsedData))
    ) {
      return <LoadingCard message={loadingMessage} progress={progress} />;
    }

    if (error && currentStep !== "interview") {
      return <ErrorCard error={error} onStartOver={handleStartOver} />;
    }

    switch (currentStep) {
      case "upload":
        return (
          <ResumeUploader onUpload={handleResumeUpload} disabled={isLoading} />
        );

      case "auth":
        return (
          <AuthCard
            onSignIn={handleGoogleSignIn}
            isLoading={isLoading}
            authLoading={authLoading}
          />
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

      case "payment":
        return (
          <PaymentCard
            onPaymentSuccess={handlePaymentSuccess}
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

  const shouldShowStepTitle = () => {
    const { currentStep, parsedData, scoreData, error, isLoading, user } =
      workflow;

    return !(
      (currentStep === "interview" &&
        parsedData &&
        !error &&
        elevenLabsApiKey &&
        !isLoading &&
        user) ||
      (currentStep === "score" && scoreData && !isLoading && !error) ||
      (currentStep === "auth" && !isLoading && !error) ||
      (isLoading && ["parse", "score", "auth", "rewrite"].includes(currentStep))
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-background to-muted/30">
      <AppHeader />

      <main className="w-full flex flex-col items-center">
        {shouldShowStepTitle() && (
          <StepTitleCard
            currentStep={workflow.currentStep}
            isLoading={workflow.isLoading}
          />
        )}
        {renderStepContent()}
      </main>

      <AppFooter />
    </div>
  );
}
