
"use client";

import type { ParseResumeInput, ParseResumeOutput } from '@/ai/flows/parse-resume';
import { parseResume } from '@/ai/flows/parse-resume';
import type { RewriteResumeInput, RewriteResumeOutput } from '@/ai/flows/rewrite-resume';
import { rewriteResume } from '@/ai/flows/rewrite-resume';
import type { ConductInterviewInput, ConductInterviewOutput, ChatMessage as GenkitChatMessage } from '@/ai/flows/conduct-interview-flow';
import { conductInterview } from '@/ai/flows/conduct-interview-flow';

import { ResumeUploader } from '@/components/resume-uploader';
import { ParsedResumeDisplay } from '@/components/parsed-resume-display';
import { InterviewInput, UIChatMessage } from '@/components/interview-input';
import { ResumeEditor } from '@/components/resume-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Rocket, Loader2, FileWarning, MessageSquare } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

type Step = 'upload' | 'parse' | 'interview' | 'rewrite' | 'review';

export default function OppyAiClientPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextContent, setResumeTextContent] = useState<string>('');
  const [resumeDataUri, setResumeDataUri] = useState<string>('');
  
  const [parsedData, setParsedData] = useState<ParseResumeOutput | null>(null);
  const [chatHistory, setChatHistory] = useState<UIChatMessage[]>([]);
  const [rewrittenResume, setRewrittenResume] = useState<RewriteResumeOutput | null>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(false); // For major step transitions
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false); // For chat message sending
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const [progress, setProgress] = useState(0);

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
    handleParseResume(dataUri, textContent);
  };

  const handleParseResume = async (dataUri: string, originalText: string) => {
    setIsLoading(true);
    setLoadingMessage('Parsing your resume with AI...');
    setError(null);
    try {
      const input: ParseResumeInput = { resumeDataUri: dataUri };
      const result = await parseResume(input);
      setParsedData(result);
      setCurrentStep('interview');
      toast({ title: "Resume Parsed!", description: "Key information extracted. Let's chat about it.", variant: "default" });
    } catch (e: any) {
      console.error("Error parsing resume:", e);
      setError("Failed to parse resume. Please try again. " + e.message);
      toast({ title: "Parsing Failed", description: e.message || "An unknown error occurred.", variant: "destructive" });
      setCurrentStep('upload'); 
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch initial AI message for interview
  useEffect(() => {
    if (currentStep === 'interview' && parsedData && chatHistory.length === 0 && !isLoading) {
      const fetchInitialAIMessage = async () => {
        setIsSendingMessage(true);
        setError(null);
        try {
          const genkitHistory: GenkitChatMessage[] = []; // Empty history for first turn
          const input: ConductInterviewInput = {
            parsedResume: parsedData,
            chatHistory: genkitHistory,
            // userMessage is omitted for the AI to start the conversation
          };
          const result = await conductInterview(input);
          setChatHistory(prev => [
            ...prev, 
            { id: crypto.randomUUID(), role: 'assistant', content: result.aiMessage, timestamp: new Date() }
          ]);
        } catch (e: any) {
          console.error("Error fetching initial AI message:", e);
          setError("Failed to start interview chat. " + e.message);
          toast({ title: "Chat Error", description: e.message || "Could not start chat.", variant: "destructive" });
        } finally {
          setIsSendingMessage(false);
        }
      };
      fetchInitialAIMessage();
    }
  }, [currentStep, parsedData, chatHistory.length, isLoading, toast]);


  const handleSendMessageToInterviewAI = async (message: string) => {
    if (!parsedData) {
      setError("Parsed resume data is missing.");
      toast({ title: "Error", description: "Cannot send message, parsed data missing.", variant: "destructive" });
      return;
    }
    setIsSendingMessage(true);
    setError(null);

    const newUserMessage: UIChatMessage = { id: crypto.randomUUID(), role: 'user', content: message, timestamp: new Date() };
    setChatHistory(prev => [...prev, newUserMessage]);

    try {
      // Convert UI chat history to Genkit chat history
      const genkitHistoryForPrompt: GenkitChatMessage[] = chatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        isUser: msg.role === 'user',
        isModel: msg.role !== 'user', // 'assistant' in UI is 'model' for Genkit
        parts: [{ text: msg.content }],
      }));
      // Note: The current user's message (`message`) is passed separately as `userMessage` to the flow.
      // `genkitHistoryForPrompt` should represent the history *before* the current user's message.

      const input: ConductInterviewInput = {
        parsedResume: parsedData,
        chatHistory: genkitHistoryForPrompt, // Send history *before* current user message for the prompt
        userMessage: message, // Current user message
      };
      
      const result = await conductInterview(input);
      setChatHistory(prev => [
        ...prev, 
        { id: crypto.randomUUID(), role: 'assistant', content: result.aiMessage, timestamp: new Date() }
      ]);
    } catch (e: any) {
      console.error("Error in AI interview chat:", e);
      const errorMessage = "AI chat error: " + e.message;
      setError(errorMessage);
      setChatHistory(prev => [
        ...prev, 
        { id: crypto.randomUUID(), role: 'assistant', content: `Sorry, I encountered an error: ${e.message}`, timestamp: new Date() }
      ]);
      toast({ title: "Chat Error", description: e.message || "An unknown error occurred.", variant: "destructive" });
    } finally {
      setIsSendingMessage(false);
    }
  };
  
  const handleFinishInterview = () => {
    setCurrentStep('rewrite');
    // Convert chat history to a string for the rewrite flow
    const interviewInsights = chatHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`)
      .join('\n');
    handleRewriteResume(interviewInsights);
  };

  const handleRewriteResume = async (interviewSummary: string) => {
    if (!resumeDataUri) { // Changed check from resumeTextContent to resumeDataUri
      setError("Original resume data not found. Please re-upload."); // Updated error message
      toast({ title: "Error", description: "Original resume data not found. Please re-upload.", variant: "destructive" });
      setCurrentStep('upload');
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Rewriting your resume based on insights...');
    setError(null);
    try {
      const input: RewriteResumeInput = {
        resumeDataUri: resumeDataUri, // Pass resumeDataUri
        interviewData: interviewSummary, 
      };
      const result = await rewriteResume(input);
      setRewrittenResume(result);
      setCurrentStep('review');
      toast({ title: "Resume Rewritten!", description: "Your new resume is ready for review.", variant: "default" });
    } catch (e: any) {
      console.error("Error rewriting resume:", e);
      setError("Failed to rewrite resume. Please try again. " + e.message);
      toast({ title: "Rewrite Failed", description: e.message || "An unknown error occurred.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleStartOver = () => {
    setCurrentStep('upload');
    setResumeFile(null);
    setResumeTextContent('');
    setResumeDataUri('');
    setParsedData(null);
    setChatHistory([]);
    setRewrittenResume(null);
    setError(null);
    setIsLoading(false);
    setIsSendingMessage(false);
    setProgress(0);
  };

  const renderStepContent = () => {
    if (isLoading) { // This is for major step transitions
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

    if (error && currentStep !== 'interview') { // Show general error card if not in interview (interview handles its own errors inline)
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
            {/* Optional: Display parsed data summary above chat */}
            {/* <ParsedResumeDisplay parsedData={parsedData} /> */}
            <InterviewInput
              parsedData={parsedData}
              chatHistory={chatHistory}
              onSendMessage={handleSendMessageToInterviewAI}
              onFinishInterview={handleFinishInterview}
              disabled={isLoading} // General disable
              isSendingMessage={isSendingMessage} // Specific for chat send
            />
            {error && <p className="text-destructive text-center mt-2">{error}</p>}
          </div>
        );
      case 'rewrite': 
         return <p>Preparing to rewrite...</p>; 
      case 'review':
        if (!rewrittenResume) return <p>Error: Rewritten data not available. Please <Button variant="link" onClick={handleStartOver}>start over</Button>.</p>;
        // originalResumeText will be empty for PDFs, ResumeEditor will handle displaying it or a message
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
    review: Rocket, // Or a different icon for review
  };

  const CurrentStepIcon = stepIcons[currentStep] || Rocket;


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
        {!isLoading && !error && (currentStep !== 'interview' || !parsedData) && ( // Don't show this header during active interview chat
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
        <p>&copy; {new Date().getFullYear()} Oppy AI. All rights reserved.</p>
        <p>Powered by Genkit and Next.js</p>
      </footer>
    </div>
  );
}

