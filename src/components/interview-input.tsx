
"use client";

import type { ParseResumeOutput } from '@/ai/flows/parse-resume';
// import type { ChatMessage as GenkitChatMessage } from '@/ai/flows/conduct-interview-flow'; // For Genkit flow - not directly used in this simplified capture
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

interface InterviewInputProps {
  parsedData: ParseResumeOutput; 
  chatHistory: UIChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  onFinishInterview: () => void;
  disabled?: boolean; 
  isSendingMessage: boolean; 
}

export function InterviewInput({ 
  chatHistory, 
  onSendMessage, 
  onFinishInterview, 
  disabled,
  isSendingMessage 
}: InterviewInputProps) {
  const [currentMessage, setCurrentMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast({
        variant: 'destructive',
        title: 'Speech Recognition Not Supported',
        description: 'Your browser does not support speech recognition. Try Chrome, Edge, or Safari.',
      });
      setHasMicPermission(false); // Disable mic button if API not supported
      return;
    }

    const getMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setHasMicPermission(true);
        stream.getTracks().forEach(track => track.stop()); // Release mic immediately
      } catch (error) {
        console.error('Error accessing microphone:', error);
        setHasMicPermission(false);
        toast({
          variant: 'destructive',
          title: 'Microphone Access Denied',
          description: 'Please enable microphone permissions in your browser settings to use voice input.',
        });
      }
    };

    if (hasMicPermission === null) {
        getMicPermission();
    }
    
    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop();
        speechRecognitionRef.current = null;
      }
    };
  }, [toast, hasMicPermission]);

  const startRecording = () => {
    if (hasMicPermission === false) {
      toast({ variant: 'destructive', title: 'Microphone permission denied or feature not supported.' });
      return;
    }
     if (hasMicPermission === null) { // Should not happen if useEffect ran correctly
      toast({ variant: 'default', title: 'Checking microphone permission...' });
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { // Redundant check, but safe
      toast({ variant: 'destructive', title: 'Speech recognition not supported.' });
      return;
    }
    
    if (speechRecognitionRef.current) { // Stop any existing instance
        speechRecognitionRef.current.stop();
    }

    speechRecognitionRef.current = new SpeechRecognitionAPI();
    const recognition = speechRecognitionRef.current;

    recognition.continuous = false;
    recognition.interimResults = false; 
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
      setCurrentMessage(''); // Clear text area for new voice input
      toast({ title: "Recording Started", description: "Speak now. Recording will stop when you pause." });
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setCurrentMessage(transcript);
      toast({ title: "Voice Input Captured!", description: "Review your message and send." });
    };

    recognition.onerror = (event) => {
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
    };

    recognition.onend = () => {
      setIsRecording(false);
      // speechRecognitionRef.current should be nullified or re-created on next start
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Error starting speech recognition:", e);
      toast({ variant: 'destructive', title: 'Could not start recording', description: String(e) });
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (speechRecognitionRef.current && isRecording) {
      speechRecognitionRef.current.stop();
      // onend will set isRecording to false
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSend = async () => {
    if (!currentMessage.trim() || disabled || isSendingMessage || isRecording) return;
    await onSendMessage(currentMessage);
    setCurrentMessage('');
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
          Chat with our AI to clarify resume points. Use text input, or click the microphone to speak.
        </CardDescription>
         {hasMicPermission === false && (
            <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Microphone Access Denied or Not Supported</AlertTitle>
                <AlertDescription>
                Voice input is disabled. Please enable microphone permissions or use a supported browser (e.g., Chrome, Edge, Safari).
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
            disabled={disabled || isSendingMessage || hasMicPermission === false}
            onClick={handleMicClick}
            aria-label={isRecording ? "Stop recording" : "Start voice input"}
          >
            {isRecording ? <StopCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Textarea
            id="interview-message"
            placeholder={isRecording ? "Listening..." : "Type or click mic to speak..."}
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            rows={1}
            disabled={disabled || isSendingMessage || isRecording}
            className="text-base flex-grow resize-none min-h-[40px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button 
            onClick={handleSend} 
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
          onClick={onFinishInterview} 
          disabled={disabled || isSendingMessage || isRecording} 
          variant="default"
          className="ml-4"
        >
          Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
        </Button>
      </CardFooter>
    </Card>
  );
}

