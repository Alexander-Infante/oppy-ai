
"use client";

import type { ParseResumeInput, ParseResumeOutput } from '@/ai/flows/parse-resume';
import { parseResume } from '@/ai/flows/parse-resume';
import type { RewriteResumeInput, RewriteResumeOutput } from '@/ai/flows/rewrite-resume';
import { rewriteResume } from '@/ai/flows/rewrite-resume';
import { InterviewInput, type InterviewInputHandle } from '@/components/interview-input';
import type { ChatMessage as SDKChatMessage } from '@elevenlabs/react';
import { ResumeUploader } from '@/components/resume-uploader';
import { ResumeEditor } from '@/components/resume-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Rocket, Loader2, FileWarning, MessageSquare } from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';

type Step = 'upload' | 'parse' | 'interview' | 'rewrite' | 'review';

export default function OppyAIClientPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextContent, setResumeTextContent] = useState<string>('');
  const [resumeDataUri, setResumeDataUri] = useState<string>('');

  const [parsedData, setParsedData] = useState<ParseResumeOutput | null>(null);
  const [finalInterviewChatHistory, setFinalInterviewChatHistory] = useState<SDKChatMessage[]>([]);
  const [rewrittenResume, setRewrittenResume] = useState<RewriteResumeOutput | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const interviewInputRef = useRef<InterviewInputHandle | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      setProgress(0);
      let currentProgressVal = 0;
      timer = setInterval(() => {
        currentProgressVal += 10;
        if (currentProgressVal > 100) currentProgressVal = 100;
        setProgress(currentProgressVal);
      }, 200);
    } else {
      setProgress(100);
    }
    return () => clearInterval(timer);
  }, [isLoading]);

  const handleResumeUpload = (file: File, textContent: string, dataUri: string) => {
    setResumeFile(file);
    setResumeTextContent(textContent);
    setResumeDataUri(dataUri);
    setError(null);
    setCurrentStep('parse');
    handleParseResume(dataUri);
  };

  const handleParseResume = async (dataUri: string) => {
    setIsLoading(true);
    setLoadingMessage('Parsing your resume with AI...');
    setError(null);
    try {
      const input: ParseResumeInput = { resumeDataUri: dataUri };
      const result = await parseResume(input);
      if (!isMountedRef.current) return;
      setParsedData(result);
      setCurrentStep('interview');
      toast({ title: "Resume Parsed!", description: "Key information extracted. Let's start the AI interview.", variant: "default" });
    } catch (e: any) {
      console.error("Error parsing resume:", e);
      if (isMountedRef.current) {
        setError("Failed to parse resume. Please try again. " + e.message);
        toast({ title: "Parsing Failed", description: e.message || "An unknown error occurred.", variant: "destructive" });
        setCurrentStep('upload');
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleFinishInterview = (interviewChatHistory: SDKChatMessage[]) => {
    if (!isMountedRef.current) return;

    setFinalInterviewChatHistory(interviewChatHistory);
    setCurrentStep('rewrite');

    const interviewInsights = interviewChatHistory
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.text}`)
      .join('\n\n');

    handleRewriteResume(interviewInsights);
  };

  const handleRewriteResume = async (interviewSummary: string) => {
    if (!resumeDataUri) {
      if (isMountedRef.current) {
        setError("Original resume data not found. Please re-upload.");
        toast({ title: "Error", description: "Original resume data not found. Please re-upload.", variant: "destructive" });
        setCurrentStep('upload');
      }
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Rewriting your resume based on insights...');
    setError(null);
    try {
      const input: RewriteResumeInput = {
        resumeDataUri: resumeDataUri,
        interviewData: interviewSummary,
      };
      const result = await rewriteResume(input);
      if (!isMountedRef.current) return;
      setRewrittenResume(result);
      setCurrentStep('review');
      toast({ title: "Resume Rewritten!", description: "Your new resume is ready for review.", variant: "default" });
    } catch (e: any) {
      console.error("Error rewriting resume:", e);
      if (isMountedRef.current) {
        setError("Failed to rewrite resume. Please try again. " + e.message);
        toast({ title: "Rewrite Failed", description: e.message || "An unknown error occurred.", variant: "destructive" });
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    if (isMountedRef.current) {
      // SDK in InterviewInput should handle its own cleanup
    }

    setCurrentStep('upload');
    setResumeFile(null);
    setResumeTextContent('');
    setResumeDataUri('');
    setParsedData(null);
    setFinalInterviewChatHistory([]);
    setRewrittenResume(null);
    setError(null);
    setIsLoading(false);
    setProgress(0);
  };

  const renderStepContent = () => {
    if (isLoading && (currentStep === 'parse' || currentStep === 'rewrite' || (currentStep === 'interview' && !parsedData))) {
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

    if (error && currentStep !== 'interview') { // Keep interview UI even on some errors if parsedData exists
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
            <Button onClick={handleStartOver} variant="outline">Start Over</Button>
          </CardContent>
        </Card>
      );
    }

    switch (currentStep) {
      case 'upload':
        return <ResumeUploader onUpload={handleResumeUpload} disabled={isLoading} />;
      case 'parse':
        // This state is usually very brief, covered by the main isLoading block
        return <p>Preparing to parse...</p>;
      case 'interview':
        if (!parsedData) return <p>Error: Parsed data not available for interview. Please <Button variant="link" onClick={handleStartOver}>start over</Button>.</p>;
        return (
          <div className="w-full max-w-3xl space-y-6">
            <InterviewInput
              ref={interviewInputRef}
              parsedData={parsedData}
              onFinishInterview={handleFinishInterview}
              disabled={isLoading} // isLoading here refers to parse/rewrite, InterviewInput has its own internal loading
            />
          </div>
        );
      case 'rewrite':
         // This state is usually very brief, covered by the main isLoading block
         return <p>Preparing to rewrite...</p>;
      case 'review':
        if (!rewrittenResume) return <p>Error: Rewritten data not available. Please <Button variant="link" onClick={handleStartOver}>start over</Button>.</p>;
        return (
          <ResumeEditor
            originalResumeText={resumeTextContent}
            rewrittenResumeOutput={rewrittenResume}
            onStartOver={handleStartOver}
          />
        );
      default:
        return <p>Unknown step. Please <Button variant="link" onClick={handleStartOver}>start over</Button>.</p>;
    }
  };

  const stepTitles: Record<Step, string> = {
    upload: 'Upload Your Resume',
    parse: 'Parsing Resume',
    interview: 'AI Interview Chat',
    rewrite: 'Rewriting Your Resume',
    review: 'Review Your New Resume',
  };

  const stepIcons: Record<Step, React.ElementType> = {
    upload: Rocket,
    parse: Loader2, // Represents processing
    interview: MessageSquare,
    rewrite: Loader2, // Represents processing
    review: Rocket, // Represents completion/next action
  };

  const CurrentStepIcon = stepIcons[currentStep] || Rocket;
  // Show step title card unless it's the interview step AND there's no critical error AND parsedData is available (interview card has its own title)
  // OR if it's a loading state for parse/rewrite.
  const showStepTitleCard =
    !(currentStep === 'interview' && parsedData && !error) ||
    (isLoading && (currentStep === 'parse' || currentStep === 'rewrite'));


  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-background to-muted/30">
      <header className="mb-8 text-center">
        <div className="flex items-center justify-center mb-2">
          <Rocket className="h-12 w-12 text-primary mr-3" />
          <h1 className="text-4xl font-bold tracking-tight">OppyAI</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          AI-powered resume rewriting to help you land your dream job.
        </p>
      </header>

      <main className="w-full flex flex-col items-center">
        {showStepTitleCard && ! (isLoading && (currentStep === 'parse' || currentStep === 'rewrite')) && (
            <Card className="w-full max-w-md mb-6 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl text-center flex items-center justify-center">
                        <CurrentStepIcon className={`mr-2 h-6 w-6 ${currentStep === 'parse' || currentStep === 'rewrite' ? (isLoading ? 'animate-spin' : '') : ''}`} />
                        {stepTitles[currentStep]}
                    </CardTitle>
                </CardHeader>
            </Card>
        )}
        {renderStepContent()}
      </main>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} OppyAI. All rights reserved.</p>
        <p>Powered by Genkit and Next.js</p>
      </footer>
    </div>
  );
}
