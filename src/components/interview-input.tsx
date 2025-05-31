
"use client";

import type { ParseResumeOutput } from '@/ai/flows/parse-resume';
import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
// import { Label } from '@/components/ui/label'; // Not used
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Mic, StopCircle, Sparkles, User, Bot, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


// UI-specific chat message type
export interface UIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface InterviewInputHandle {
  startRecording: () => void;
  stopRecording: () => void;
}

interface InterviewInputProps {
  parsedData: ParseResumeOutput; 
  chatHistory: UIChatMessage[];
  onSendMessage: (message: string) => Promise<void>; // May become less used if auto-send is primary
  onTranscriptionComplete?: (transcript: string) => void;
  onFinishInterview: () => void;
  disabled?: boolean; 
  isSendingMessage: boolean; 
}

export const InterviewInput = forwardRef<InterviewInputHandle, InterviewInputProps>(({ 
  chatHistory, 
  onSendMessage, 
  onTranscriptionComplete,
  onFinishInterview, 
  disabled,
  isSendingMessage 
}, ref) => {
  const [currentMessage, setCurrentMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const interimTranscriptRef = useRef<string>(""); 
  const isMountedRef = useRef(false); // To track mount status for async operations

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!isMountedRef.current) return;
    if (hasMicPermission === false) {
      toast({ variant: 'destructive', title: 'Microphone permission denied or feature not supported.' });
      return;
    }
     if (hasMicPermission === null) { 
      toast({ variant: 'default', title: 'Checking microphone permission...' });
      // Attempt to get permission again if it's null
      (async () => {
          const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (!SpeechRecognitionAPI) {
              setHasMicPermission(false); return;
          }
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              setHasMicPermission(true);
              stream.getTracks().forEach(track => track.stop());
              // Try starting again now that permission might be true
              // Check isMountedRef again before potentially starting
              if (isMountedRef.current) setTimeout(startRecording, 100); 
          } catch (error) {
              setHasMicPermission(false);
          }
      })();
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { 
      toast({ variant: 'destructive', title: 'Speech recognition not supported.' });
      return;
    }
    
    if (speechRecognitionRef.current) { 
        speechRecognitionRef.current.stop();
    }

    speechRecognitionRef.current = new SpeechRecognitionAPI();
    const recognition = speechRecognitionRef.current;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    interimTranscriptRef.current = ""; 

    recognition.onstart = () => {
      if (!isMountedRef.current) return;
      setIsRecording(true);
      setCurrentMessage(''); 
      toast({ title: "Listening...", description: "Speak now. Stops after 10s of silence or manual stop." });
    };

    recognition.onresult = (event) => {
      if (!isMountedRef.current) return;
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

      let fullTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
         fullTranscript += event.results[i][0].transcript;
      }
      setCurrentMessage(fullTranscript); // Update textarea with live transcript

      silenceTimeoutRef.current = setTimeout(() => {
        if (speechRecognitionRef.current && isRecording && isMountedRef.current) {
            console.log("Silence timeout, stopping recognition.");
            stopRecordingInternal();
        }
      }, 10000); 
    };

    recognition.onerror = (event) => {
      if (!isMountedRef.current) return;
      console.error('Speech recognition error:', event.error);
      let errorMessage = `An error occurred: ${event.error}.`;
      if (event.error === 'no-speech') {
        errorMessage = 'No speech was detected. Please try speaking louder or more clearly.';
      } else if (event.error === 'audio-capture') {
        errorMessage = 'Audio capture failed. Please check your microphone.';
      } else if (event.error === 'not-allowed') {
        errorMessage = 'Microphone access was denied. Please enable it in browser settings.';
        setHasMicPermission(false);
      }
      toast({ variant: 'destructive', title: 'Speech Recognition Error', description: errorMessage });
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      setIsRecording(false); 
    };

    recognition.onend = () => {
      if (!isMountedRef.current) return;
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      setIsRecording(false);
      
      const finalTranscript = currentMessage.trim(); // currentMessage should have the complete transcript
      if (finalTranscript) {
        toast({ title: "Voice Input Captured!", description: "Sending your message..." });
        if (onTranscriptionComplete) {
          onTranscriptionComplete(finalTranscript);
        } else { // Fallback if onTranscriptionComplete is not used for some reason
          onSendMessage(finalTranscript);
        }
        setCurrentMessage(''); // Clear after sending
      } else {
        toast({ title: "Recording Stopped", description: "No speech was captured to transcribe.", variant: "default" });
      }
      interimTranscriptRef.current = "";
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Error starting speech recognition:", e);
      toast({ variant: 'destructive', title: 'Could not start recording', description: String(e) });
      if (isMountedRef.current) setIsRecording(false);
    }
  }, [hasMicPermission, toast, onSendMessage, onTranscriptionComplete, isRecording]);


  const stopRecordingInternal = useCallback(() => {
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    if (speechRecognitionRef.current && isRecording) { // isRecording check prevents calling stop multiple times
      speechRecognitionRef.current.stop(); 
      // onend will handle setIsRecording(false) and further logic
    } else if (isRecording) { // Fallback if recognition somehow stopped but state not updated
      if(isMountedRef.current) setIsRecording(false);
    }
  }, [isRecording]);

  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording: stopRecordingInternal,
  }));

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast({
        variant: 'destructive',
        title: 'Speech Recognition Not Supported',
        description: 'Your browser does not support speech recognition. Try Chrome, Edge, or Safari.',
      });
      if (isMountedRef.current) setHasMicPermission(false);
      return;
    }

    const getMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (isMountedRef.current) setHasMicPermission(true);
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('Error accessing microphone:', error);
        if (isMountedRef.current) {
            setHasMicPermission(false);
            toast({
            variant: 'destructive',
            title: 'Microphone Access Denied',
            description: 'Please enable microphone permissions in your browser settings to use voice input.',
            });
        }
      }
    };

    if (hasMicPermission === null) {
        getMicPermission();
    }
    
    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onstart = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, [toast, hasMicPermission]);


  const handleMicClick = () => {
    if (isRecording) {
      stopRecordingInternal();
    } else {
      startRecording();
    }
  };

  const handleSendText = async () => { // Renamed from handleSend to avoid confusion if parent also has handleSend
    if (!currentMessage.trim() || disabled || isSendingMessage || isRecording) return;
    // If sending text manually, we assume transcription is complete or not used.
    if (onTranscriptionComplete) {
      onTranscriptionComplete(currentMessage.trim());
    } else {
      await onSendMessage(currentMessage.trim());
    }
    setCurrentMessage('');
    interimTranscriptRef.current = ""; 
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollableViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [chatHistory]);

  return (
    <Card className="w-full max-w-2xl shadow-xl flex flex-col h-[70vh] sm:h-[600px]">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <Sparkles className="mr-2 h-6 w-6 text-primary" />
          AI Interview Chat
        </CardTitle>
        <CardDescription>
          Chat with our AI. Voice input starts automatically after AI speaks.
          Recording allows pauses and stops after 10s of silence or manual stop.
        </CardDescription>
         {hasMicPermission === false && (
            <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Microphone Access Denied or Not Supported</AlertTitle>
                <AlertDescription>
                Voice input is disabled. Please enable microphone permissions or use a supported browser (e.g., Chrome, Edge, Safari). You can still type your responses.
                </AlertDescription>
            </Alert>
        )}
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden p-0">
        <ScrollArea className="h-full p-4 sm:p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {chatHistory.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  "flex items-start space-x-3",
                  chat.role === 'user' ? 'justify-end' : ''
                )}
              >
                {chat.role === 'assistant' && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground">
                    <Bot size={18} />
                  </span>
                )}
                <div
                  className={cn(
                    "p-3 rounded-lg max-w-[75%]",
                    chat.role === 'user'
                      ? 'bg-secondary text-secondary-foreground rounded-br-none'
                      : 'bg-muted text-muted-foreground rounded-bl-none'
                  )}
                >
                  <p className="text-sm">{chat.content}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 text-right">
                    {chat.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                 {chat.role === 'user' && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground">
                    <User size={18} />
                  </span>
                )}
              </div>
            ))}
             {isSendingMessage && chatHistory.length > 0 && chatHistory[chatHistory.length-1].role === 'user' && (
                <div className="flex items-start space-x-3">
                    <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground">
                        <Bot size={18} />
                    </span>
                    <div className="p-3 rounded-lg bg-muted text-muted-foreground rounded-bl-none animate-pulse">
                        <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 sm:p-6 border-t">
        <div className="flex w-full items-center space-x-2">
          <Button 
            variant="outline" 
            size="icon" 
            disabled={disabled || isSendingMessage || hasMicPermission === false || hasMicPermission === null} // Disable if permission null too
            onClick={handleMicClick}
            aria-label={isRecording ? "Stop recording" : "Start voice input"}
          >
            {isRecording ? <StopCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Textarea
            id="interview-message"
            placeholder={isRecording ? "Listening... (Stops after 10s silence)" : "Type or click mic to speak..."}
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            rows={1}
            disabled={disabled || isSendingMessage || isRecording} // Still disable textarea during recording for clarity
            className="text-base flex-grow resize-none min-h-[40px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
              }
            }}
          />
          <Button 
            onClick={handleSendText} 
            disabled={!currentMessage.trim() || disabled || isSendingMessage || isRecording}
            size="icon"
            aria-label="Send message"
          >
            {isSendingMessage ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
        <Button 
          onClick={() => {
            if(isRecording) stopRecordingInternal(); // Stop recording if active
            onFinishInterview();
          }} 
          disabled={disabled || isSendingMessage} // Recording state doesn't need to disable finish
          variant="default"
          className="ml-4"
        >
          Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
        </Button>
      </CardFooter>
    </Card>
  );
});

InterviewInput.displayName = "InterviewInput";

    