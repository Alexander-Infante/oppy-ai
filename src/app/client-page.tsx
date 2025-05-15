
"use client";

import type { ParseResumeInput, ParseResumeOutput } from '@/ai/flows/parse-resume';
import { parseResume } from '@/ai/flows/parse-resume';
import type { RewriteResumeInput, RewriteResumeOutput } from '@/ai/flows/rewrite-resume';
import { rewriteResume } from '@/ai/flows/rewrite-resume';
import { ResumeUploader } from '@/components/resume-uploader';
import { ParsedResumeDisplay } from '@/components/parsed-resume-display';
import { InterviewInput } from '@/components/interview-input';
import { ResumeEditor } from '@/components/resume-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Rocket, Loader2, FileWarning } from 'lucide-react';
import React, { useState, useEffect } from 'react';

type Step = 'upload' | 'parse' | 'interview' | 'rewrite' | 'review';

export default function ResumeBoostClientPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextContent, setResumeTextContent] = useState<string>('');
  const [resumeDataUri, setResumeDataUri] = useState<string>('');
  
  const [parsedData, setParsedData] = useState<ParseResumeOutput | null>(null);
  const [interviewData, setInterviewData] = useState<string>('');
  const [rewrittenResume, setRewrittenResume] = useState<RewriteResumeOutput | null>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();

  // For progress bar simulation
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      setProgress(0); // Reset progress
      let currentProgress = 0;
      timer = setInterval(() => {
        currentProgress += 10;
        if (currentProgress > 100) currentProgress = 100; // Cap at 100 during loading
        setProgress(currentProgress);
      }, 200);
    } else {
      setProgress(100); // Set to 100 when loading finishes
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
      // Store original text if parseResume doesn't return it (which it doesn't)
      // We already have it in resumeTextContent
      setCurrentStep('interview');
      toast({ title: "Resume Parsed!", description: "Key information extracted successfully.", variant: "default" });
    } catch (e: any) {
      console.error("Error parsing resume:", e);
      setError("Failed to parse resume. Please try again. " + e.message);
      toast({ title: "Parsing Failed", description: e.message || "An unknown error occurred.", variant: "destructive" });
      setCurrentStep('upload'); // Go back to upload
    } finally {
      setIsLoading(false);
    }
  };

  const handleInterviewDataSubmit = (data: string) => {
    setInterviewData(data);
    setError(null);
    setCurrentStep('rewrite');
    handleRewriteResume(data);
  };

  const handleRewriteResume = async (currentInterviewData: string) => {
    if (!resumeTextContent) {
      setError("Original resume text not found. Please re-upload.");
      toast({ title: "Error", description: "Original resume text not found.", variant: "destructive" });
      setCurrentStep('upload');
      return;
    }
    setIsLoading(true);
    setLoadingMessage('Rewriting your resume based on insights...');
    setError(null);
    try {
      const input: RewriteResumeInput = {
        resumeText: resumeTextContent,
        interviewData: currentInterviewData,
      };
      const result = await rewriteResume(input);
      setRewrittenResume(result);
      setCurrentStep('review');
      toast({ title: "Resume Rewritten!", description: "Your new resume is ready for review.", variant: "default" });
    } catch (e: any) {
      console.error("Error rewriting resume:", e);
      setError("Failed to rewrite resume. Please try again. " + e.message);
      toast({ title: "Rewrite Failed", description: e.message || "An unknown error occurred.", variant: "destructive" });
      // Optionally go back to interview step or allow retry
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
    setInterviewData('');
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

    if (error) {
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
      case 'parse': // This step is mostly handled by isLoading state after upload
        return <p>Preparing to parse...</p>; // Should not stay here long
      case 'interview':
        if (!parsedData) return <p>Error: Parsed data not available. Please <Button variant="link" onClick={handleStartOver}>start over</Button>.</p>;
        return (
          <div className="w-full max-w-3xl space-y-6">
            <ParsedResumeDisplay parsedData={parsedData} />
            <InterviewInput onSubmit={handleInterviewDataSubmit} disabled={isLoading} />
          </div>
        );
      case 'rewrite': // Mostly handled by isLoading state after interview input
         return <p>Preparing to rewrite...</p>; // Should not stay here long
      case 'review':
        if (!rewrittenResume || !resumeTextContent) return <p>Error: Rewritten data not available. Please <Button variant="link" onClick={handleStartOver}>start over</Button>.</p>;
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
    interview: 'Provide Interview Insights',
    rewrite: 'Rewriting Your Resume',
    review: 'Review Your New Resume',
  };

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
        {!isLoading && !error && (
            <Card className="w-full max-w-md mb-6 shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl text-center">{stepTitles[currentStep]}</CardTitle>
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

