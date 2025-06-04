
"use client";

import type { ParseResumeInput, ParseResumeOutput } from '@/ai/flows/parse-resume';
import { parseResume } from '@/ai/flows/parse-resume';
import type { RewriteResumeInput, RewriteResumeOutput } from '@/ai/flows/rewrite-resume';
import { rewriteResume } from '@/ai/flows/rewrite-resume';
// Types from conduct-interview-flow are no longer directly needed here if InterviewInput manages its own flow.
// We will use UIChatMessage from InterviewInput for chat history.
import { InterviewInput, type UIChatMessage, type InterviewInputHandle } from '@/components/interview-input';
import { ResumeUploader } from '@/components/resume-uploader';
import { ResumeEditor } from '@/components/resume-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Rocket, Loader2, FileWarning, MessageSquare } from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';

type Step = 'upload' | 'parse' | 'interview' | 'rewrite' | 'review';

// ELEVENLABS_VOICE_ID is not needed here if WebSocket agent handles voice.
// The speakText function might be simplified or removed if not used elsewhere.

export default function ResumeBoostClientPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextContent, setResumeTextContent] = useState<string>('');
  const [resumeDataUri, setResumeDataUri] = useState<string>('');
  
  const [parsedData, setParsedData] = useState<ParseResumeOutput | null>(null);
  // chatHistory from client-page is no longer the source of truth during the interview.
  // InterviewInput will manage its own history and provide it upon completion.
  const [finalInterviewChatHistory, setFinalInterviewChatHistory] = useState<UIChatMessage[]>([]);
  const [rewrittenResume, setRewrittenResume] = useState<RewriteResumeOutput | null>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // isSendingMessage might be managed within InterviewInput for WebSocket.
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const interviewInputRef = useRef<InterviewInputHandle | null>(null); // May not be needed as much
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // speakText might be used for generic TTS outside the interview, keeping it for now.
  const speakText = useCallback((text: string): Promise<void> => {
    // This function remains for potential other uses, but InterviewInput will handle its own audio.
    // (Original speakText implementation is kept but not directly called by interview flow)
    return new Promise((resolve, reject) => {
      // Fallback or simplified TTS logic if needed elsewhere
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Cancel any ongoing speech
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        utterance.onerror = (event) => {
            console.warn("Browser SpeechSynthesis error:", event.error);
            reject(new Error(`Browser TTS error: ${event.error}`));
        };
        window.speechSynthesis.speak(utterance);
      } else {
        console.warn("Browser does not support speech synthesis. No audio will be played by speakText.");
        resolve(); // Resolve if TTS not critical for this specific call
      }
    });
  }, []); // Removed toast dependency if not used within


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
  
  // The old handleSendMessageToInterviewAI and related useEffect for initial AI message are removed.
  // InterviewInput now manages its own WebSocket communication lifecycle.

  const handleFinishInterview = (interviewChatHistory: UIChatMessage[]) => {
    // This function is called by InterviewInput when the user finishes.
    // It receives the complete chat history from the WebSocket interaction.
    if (!isMountedRef.current) return;

    setFinalInterviewChatHistory(interviewChatHistory); // Store the history
    setCurrentStep('rewrite');
    
    const interviewInsights = interviewChatHistory
      .filter(msg => msg.role === 'user' || msg.role === 'assistant') // Filter out system messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`)
      .join('\n\n'); // Use double newline for better separation if needed by the rewrite prompt
      
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
    // Stop any ongoing WebSocket connection or recording in InterviewInput if needed,
    // though InterviewInput's own cleanup on unmount or finish should handle it.
    if (isMountedRef.current) {
        // If speakText was using window.speechSynthesis, cancel it.
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
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
    if (isLoading) {
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

    if (error) { // Simplified error display, InterviewInput shows its own errors during chat
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
        return <p>Preparing to parse...</p>; 
      case 'interview':
        if (!parsedData) return <p>Error: Parsed data not available. Please <Button variant="link" onClick={handleStartOver}>start over</Button>.</p>;
        return (
          <div className="w-full max-w-3xl space-y-6">
            <InterviewInput
              ref={interviewInputRef} // ref might be less critical now
              parsedData={parsedData}
              onFinishInterview={handleFinishInterview}
              disabled={isLoading} 
            />
            {/* Error display specific to this step can be added if needed, but InterviewInput handles its own API errors */}
          </div>
        );
      case 'rewrite': 
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
    parse: Loader2,
    interview: MessageSquare,
    rewrite: Loader2,
    review: Rocket,
  };

  const CurrentStepIcon = stepIcons[currentStep] || Rocket;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-gradient-to-br from-background to-muted/30">
      <header className="mb-8 text-center">
        <div className="flex items-center justify-center mb-2">
          <Rocket className="h-12 w-12 text-primary mr-3" />
          <h1 className="text-4xl font-bold tracking-tight">ResumeBoost</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          AI-powered resume rewriting to help you land your dream job.
        </p>
      </header>

      <main className="w-full flex flex-col items-center">
        {!isLoading && (currentStep !== 'interview' || !parsedData) && (
            <Card className="w-full max-w-md mb-6 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl text-center flex items-center justify-center">
                        <CurrentStepIcon className={`mr-2 h-6 w-6 ${isLoading || currentStep === 'parse' || currentStep === 'rewrite' ? 'animate-spin' : ''}`} />
                        {stepTitles[currentStep]}
                    </CardTitle>
                </CardHeader>
            </Card>
        )}
        {renderStepContent()}
      </main>
      
      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} ResumeBoost. All rights reserved.</p>
        <p>Powered by Genkit and Next.js</p>
      </footer>
    </div>
  );
}
