
"use client";

import type { ParseResumeInput, ParseResumeOutput } from '@/ai/flows/parse-resume';
import { parseResume } from '@/ai/flows/parse-resume';
import type { RewriteResumeInput, RewriteResumeOutput } from '@/ai/flows/rewrite-resume';
import { rewriteResume } from '@/ai/flows/rewrite-resume';
import type { ConductInterviewInput, ConductInterviewOutput, ChatMessage as GenkitChatMessage, ParsedResumeData } from '@/ai/flows/conduct-interview-flow';
import { conductInterview } from '@/ai/flows/conduct-interview-flow';

import { ResumeUploader } from '@/components/resume-uploader';
// import { ParsedResumeDisplay } from '@/components/parsed-resume-display'; // Not directly used if interview is main focus post-parse
import { InterviewInput, UIChatMessage, type InterviewInputHandle } from '@/components/interview-input';
import { ResumeEditor } from '@/components/resume-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Rocket, Loader2, FileWarning, MessageSquare } from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';

type Step = 'upload' | 'parse' | 'interview' | 'rewrite' | 'review';

const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Example Voice ID (Rachel)

export default function OppyAiClientPage() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeTextContent, setResumeTextContent] = useState<string>('');
  const [resumeDataUri, setResumeDataUri] = useState<string>('');
  
  const [parsedData, setParsedData] = useState<ParseResumeOutput | null>(null);
  const [chatHistory, setChatHistory] = useState<UIChatMessage[]>([]);
  const [rewrittenResume, setRewrittenResume] = useState<RewriteResumeOutput | null>(null);
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const interviewInputRef = useRef<InterviewInputHandle | null>(null);
  const isMountedRef = useRef(false); // To track mount status for async operations

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (audioPlayerRef.current && !audioPlayerRef.current.paused) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

      if (apiKey && apiKey.trim() !== "") {
        console.info("Attempting to use ElevenLabs for Text-to-Speech.");
        fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text: text,
            model_id: 'eleven_multilingual_v2', // or your preferred model
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        })
        .then(async response => {
          let errorDetail = `ElevenLabs API Error: ${response.statusText}`; // Default error message
          if (!response.ok) {
            try {
              const errorData = await response.json(); // Try to parse JSON first

              if (errorData && typeof errorData === 'object' && errorData.detail && typeof errorData.detail.message === 'string' && errorData.detail.message.trim() !== '') {
                console.error("ElevenLabs API detailed error message:", errorData.detail.message, "Full error object:", errorData);
                errorDetail = `Failed to generate speech: ${errorData.detail.message}.`;
              } else if (errorData && typeof errorData === 'object' && Object.keys(errorData).length > 0) {
                console.warn("ElevenLabs API error (JSON, unexpected structure or empty message):", errorData, "Status:", response.statusText);
                errorDetail = `Failed to generate speech. API returned: ${JSON.stringify(errorData)}. Status: ${response.statusText}`;
              } else { // This covers errorData being {} or not an object with keys
                console.warn(`ElevenLabs API returned non-standard JSON error (or empty JSON object {}). Status: ${response.statusText}`, response.statusText);
                errorDetail = `Failed to generate speech: ${response.statusText}.`; // Fallback to statusText
              }
            } catch (jsonError) { // This catch block is for when response.json() itself fails
              console.warn("ElevenLabs API error response was not JSON. Attempting to read as text.");
              try {
                const errorText = await response.text();
                console.error("ElevenLabs API error (Text):", errorText);
                errorDetail = `Failed to generate speech: ${response.statusText} - ${errorText.substring(0, 100)}`;
              } catch (textError) {
                console.error("ElevenLabs API error: Could not parse error response as JSON or Text.");
                // errorDetail remains the default from before this try-catch: `ElevenLabs API Error: ${response.statusText}`
              }
            }
            toast({
              title: "ElevenLabs TTS Error",
              description: `${errorDetail} Check API key & credits. Restart dev server if .env changed.`,
              variant: "destructive",
            });
            reject(new Error(errorDetail));
            return null; // Indicate that further processing should stop
          }
          return response.blob();
        })
        .then(audioBlob => {
          if (!audioBlob) return; // Error already handled in previous .then
          const audioUrl = URL.createObjectURL(audioBlob);
          
          if (!audioPlayerRef.current) {
            audioPlayerRef.current = new Audio();
          }
          audioPlayerRef.current.src = audioUrl;
          audioPlayerRef.current.onended = () => resolve();
          audioPlayerRef.current.onerror = () => {
            console.error("Error playing audio from ElevenLabs during playback.");
            toast({ title: "Audio Playback Error", description: "Could not play audio from ElevenLabs.", variant: "destructive"});
            reject(new Error("Audio playback error"));
          };
          audioPlayerRef.current.play().catch(e => {
              console.error("Error playing audio from ElevenLabs:", e);
              toast({ title: "Audio Playback Error", description: "Could not play audio from ElevenLabs.", variant: "destructive"});
              reject(e);
          });
        })
        .catch(e => {
          console.error("Failed to fetch TTS from ElevenLabs:", e);
          toast({
            title: "ElevenLabs TTS Request Failed",
            description: e.message || "Could not connect to ElevenLabs. Check network/API key. Restart dev server if .env changed.",
            variant: "destructive",
          });
          reject(e);
        });
      } else {
        console.warn(
            "ElevenLabs API key (NEXT_PUBLIC_ELEVENLABS_API_KEY) is not set or is empty in your .env file. " +
            "Ensure it's correctly set and RESTART your development server if it was recently changed. " +
            "Attempting to use browser's built-in Text-to-Speech as a fallback."
        );
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.onend = () => resolve();
          utterance.onerror = (event) => {
            console.warn("Browser SpeechSynthesis error:", event.error);
            reject(new Error(`Browser TTS error: ${event.error}`));
          };
          window.speechSynthesis.speak(utterance);
        } else {
          console.warn("Browser does not support speech synthesis, and ElevenLabs API key is not configured. No audio will be played.");
          resolve(); // Resolve so the flow can continue if TTS is not critical
        }
      }
    });
  }, [toast]);


  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = ""; 
      }
      if ('speechSynthesis' in window) { 
        window.speechSynthesis.cancel();
      }
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
      setParsedData(result);
      setCurrentStep('interview');
      toast({ title: "Resume Parsed!", description: "Key information extracted. Let's chat about it.", variant: "default" });
    } catch (e: any) {
      console.error("Error parsing resume:", e);
      setError("Failed to parse resume. Please try again. " + e.message);
      toast({ title: "Parsing Failed", description: e.message || "An unknown error occurred.", variant: "destructive" });
      setCurrentStep('upload'); 
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const startConversationCycle = async (aiMessage: string) => {
    if (!isMountedRef.current) return;
    try {
      await speakText(aiMessage);
    } catch (ttsError) {
      console.warn("TTS failed, but continuing to listen for user input.", ttsError);
    }
    if (isMountedRef.current && currentStep === 'interview') { // Ensure still in interview step
        interviewInputRef.current?.startRecording();
    }
  };

  // Fetch initial AI message for interview
  useEffect(() => {
    if (currentStep === 'interview' && parsedData && chatHistory.length === 0 && !isLoading) {
      const fetchInitialAIMessage = async () => {
        if (!isMountedRef.current) return;
        setIsSendingMessage(true);
        setError(null);
        try {
          const genkitHistory: GenkitChatMessage[] = []; 
          const input: ConductInterviewInput = {
            parsedResume: parsedData as ParsedResumeData,
            chatHistory: genkitHistory,
          };
          const result = await conductInterview(input);
          if (!isMountedRef.current) return;
          setChatHistory(prev => [
            ...prev, 
            { id: crypto.randomUUID(), role: 'assistant', content: result.aiMessage, timestamp: new Date() }
          ]);
          await startConversationCycle(result.aiMessage);
        } catch (e: any) {
          console.error("Error fetching initial AI message:", e);
          if (isMountedRef.current) {
            setError("Failed to start interview chat. " + e.message);
            toast({ title: "Chat Error", description: e.message || "Could not start chat.", variant: "destructive" });
          }
        } finally {
          if (isMountedRef.current) setIsSendingMessage(false);
        }
      };
      fetchInitialAIMessage();
    }
  }, [currentStep, parsedData, isLoading, toast, chatHistory.length, speakText]);


  const handleSendMessageToInterviewAI = async (message: string) => {
    if (!parsedData || !isMountedRef.current) {
      if (isMountedRef.current) {
        setError("Parsed resume data is missing or component unmounted.");
        toast({ title: "Error", description: "Cannot send message, parsed data missing or component unmounted.", variant: "destructive" });
      }
      return;
    }
    setIsSendingMessage(true);
    setError(null);

    const newUserMessage: UIChatMessage = { id: crypto.randomUUID(), role: 'user', content: message, timestamp: new Date() };
    // Update chat history immediately with user message
    setChatHistory(prev => [...prev, newUserMessage]);

    try {
      // Use the most up-to-date chatHistory for the prompt
      const genkitHistoryForPrompt: GenkitChatMessage[] = [...chatHistory, newUserMessage].map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        isUser: msg.role === 'user',
        isModel: msg.role !== 'user',
        parts: [{ text: msg.content }],
      }));
      
      const input: ConductInterviewInput = {
        parsedResume: parsedData as ParsedResumeData,
        chatHistory: genkitHistoryForPrompt, 
        userMessage: message, 
      };
      
      const result = await conductInterview(input);
      if (!isMountedRef.current) return;

      setChatHistory(prev => [
        ...prev, 
        { id: crypto.randomUUID(), role: 'assistant', content: result.aiMessage, timestamp: new Date() }
      ]);
      await startConversationCycle(result.aiMessage);

    } catch (e: any) {
      console.error("Error in AI interview chat:", e);
      if (isMountedRef.current) {
        const errorMessage = "AI chat error: " + e.message;
        setError(errorMessage);
        const aiErrorResponse = `Sorry, I encountered an error. Let's try again or you can finish the interview.`;
        setChatHistory(prev => [
          ...prev, 
          { id: crypto.randomUUID(), role: 'assistant', content: aiErrorResponse, timestamp: new Date() }
        ]);
        await startConversationCycle(aiErrorResponse); // Speak the error message
        toast({ title: "Chat Error", description: e.message || "An unknown error occurred.", variant: "destructive" });
      }
    } finally {
      if (isMountedRef.current) setIsSendingMessage(false);
    }
  };
  
  const handleFinishInterview = () => {
    if (interviewInputRef.current) {
      interviewInputRef.current.stopRecording(); // Ensure recording is stopped
    }
    if (audioPlayerRef.current && !audioPlayerRef.current.paused) {
      audioPlayerRef.current.pause();
    }
     if ('speechSynthesis' in window) { 
        window.speechSynthesis.cancel();
      }
    setCurrentStep('rewrite');
    const interviewInsights = chatHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`)
      .join('\n');
    handleRewriteResume(interviewInsights);
  };

  const handleRewriteResume = async (interviewSummary: string) => {
    if (!resumeDataUri) {
      setError("Original resume data not found. Please re-upload.");
      toast({ title: "Error", description: "Original resume data not found. Please re-upload.", variant: "destructive" });
      setCurrentStep('upload');
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
      setRewrittenResume(result);
      setCurrentStep('review');
      toast({ title: "Resume Rewritten!", description: "Your new resume is ready for review.", variant: "default" });
    } catch (e: any) {
      console.error("Error rewriting resume:", e);
      setError("Failed to rewrite resume. Please try again. " + e.message);
      toast({ title: "Rewrite Failed", description: e.message || "An unknown error occurred.", variant: "destructive" });
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };
  
  const handleStartOver = () => {
    if (interviewInputRef.current) {
      interviewInputRef.current.stopRecording();
    }
    if (audioPlayerRef.current && !audioPlayerRef.current.paused) {
      audioPlayerRef.current.pause();
    }
     if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
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

    if (error && currentStep !== 'interview') { 
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
              ref={interviewInputRef}
              parsedData={parsedData}
              chatHistory={chatHistory}
              onSendMessage={handleSendMessageToInterviewAI} 
              onTranscriptionComplete={(transcript) => {
                if (transcript.trim() && !isSendingMessage) { 
                  handleSendMessageToInterviewAI(transcript.trim());
                }
              }}
              onFinishInterview={handleFinishInterview}
              disabled={isLoading} 
              isSendingMessage={isSendingMessage} 
            />
            {error && <p className="text-destructive text-center mt-2">{error}</p>}
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
          <h1 className="text-4xl font-bold tracking-tight">Oppy AI</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          AI-powered resume rewriting to help you land your dream job.
        </p>
      </header>

      <main className="w-full flex flex-col items-center">
        {!isLoading && !(currentStep === 'interview' && error) && (currentStep !== 'interview' || !parsedData) && (
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

    

    