
"use client";

import type { ParseResumeOutput } from '@/ai/flows/parse-resume';
import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Mic, StopCircle, Sparkles, User, Bot, ChevronRight, AlertTriangle, Keyboard } from 'lucide-react';
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
  onSendMessage: (message: string) => Promise<void>;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(false); 

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current && showTextInput) {
      textareaRef.current.style.height = 'auto'; 
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [currentMessage, showTextInput]);

  const stopRecordingInternal = useCallback((calledByToggleMode = false) => {
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    if (speechRecognitionRef.current && isRecording) { 
      speechRecognitionRef.current.stop(); 
      // onend will handle setIsRecording(false) and onTranscriptionComplete if called by toggle mode
      // otherwise, onend will handle it normally
    } else if (isRecording) { 
      if(isMountedRef.current) setIsRecording(false);
    }
    // If called by mode toggle and not actually recording, ensure recording state is false
    if (calledByToggleMode && !isRecording && isMountedRef.current) {
        setIsRecording(false);
    }
  }, [isRecording]);

  const startRecording = useCallback(() => {
    if (!isMountedRef.current) return;
    if (hasMicPermission === false) {
      toast({ variant: 'destructive', title: 'Microphone permission denied or feature not supported.' });
      return;
    }
     if (hasMicPermission === null) { 
      toast({ variant: 'default', title: 'Checking microphone permission...' });
      (async () => {
          const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (!SpeechRecognitionAPI) {
              if(isMountedRef.current) setHasMicPermission(false); return;
          }
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
              if(isMountedRef.current) setHasMicPermission(true);
              stream.getTracks().forEach(track => track.stop());
              // Brief delay before actually starting, gives UI time to react to permission grant
              if (isMountedRef.current) setTimeout(startRecording, 100); 
          } catch (error) {
              if(isMountedRef.current) setHasMicPermission(false);
          }
      })();
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) { 
      toast({ variant: 'destructive', title: 'Speech recognition not supported.' });
      return;
    }
    
    if (speechRecognitionRef.current && isRecording) { 
        stopRecordingInternal(); // Stop existing recording if any
    }

    if (isMountedRef.current) {
      setShowTextInput(false); // Ensure voice focus
      setIsRecording(true);
      setCurrentMessage(''); 
    }

    speechRecognitionRef.current = new SpeechRecognitionAPI();
    const recognition = speechRecognitionRef.current;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      if (!isMountedRef.current) return;
      // setIsRecording(true) and setCurrentMessage('') already set
      toast({ title: "Listening...", description: "Speak now. Stops after 4s of silence or manual stop." });
    };

    recognition.onresult = (event) => {
      if (!isMountedRef.current) return;
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

      let fullTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
         fullTranscript += event.results[i][0].transcript;
      }
      if (isMountedRef.current) setCurrentMessage(fullTranscript); 

      silenceTimeoutRef.current = setTimeout(() => {
        if (speechRecognitionRef.current && isRecording && isMountedRef.current) { // check isRecording again
            stopRecordingInternal();
        }
      }, 4000); 
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
        if(isMountedRef.current) setHasMicPermission(false);
      }
      toast({ variant: 'destructive', title: 'Speech Recognition Error', description: errorMessage });
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if(isMountedRef.current) setIsRecording(false); 
    };

    recognition.onend = () => {
      if (!isMountedRef.current) return;
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      
      const finalTranscript = currentMessage.trim(); // Use state `currentMessage` which holds the transcript
      if (isMountedRef.current) setIsRecording(false); // Set recording to false *before* calling onTranscriptionComplete
      
      if (finalTranscript && onTranscriptionComplete) {
          onTranscriptionComplete(finalTranscript);
          if (isMountedRef.current) setCurrentMessage(''); // Clear message after sending
      } else if (!finalTranscript && isMountedRef.current) { // ensure isMounted
        // Only toast if it wasn't a deliberate stop with no speech for text input mode switch
        if (!showTextInput) { // if we are not in text input mode
             toast({ title: "Recording Stopped", description: "No speech was captured to transcribe.", variant: "default" });
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Error starting speech recognition:", e);
      toast({ variant: 'destructive', title: 'Could not start recording', description: String(e) });
      if (isMountedRef.current) setIsRecording(false);
    }
  }, [hasMicPermission, toast, onTranscriptionComplete, isRecording, stopRecordingInternal, currentMessage, showTextInput]);


  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording: () => stopRecordingInternal(false), // Pass false or no arg for explicit stop
  }));

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI && isMountedRef.current) {
      setHasMicPermission(false); // Mark as not supported
      toast({
        variant: 'destructive',
        title: 'Speech Recognition Not Supported',
        description: 'Your browser does not support speech recognition. Try Chrome, Edge, or Safari.',
      });
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

    if (hasMicPermission === null) { // Only check if status is unknown
        getMicPermission();
    }
    
    return () => { // Cleanup function
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.onstart = null;
        speechRecognitionRef.current.onresult = null;
        speechRecognitionRef.current.onerror = null;
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.abort(); // Use abort for immediate stop
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
      startRecording(); // This will also set showTextInput to false
    }
  };

  const handleToggleTextInput = () => {
    if (isMountedRef.current) {
        const newShowTextInputState = !showTextInput;
        setShowTextInput(newShowTextInputState);
        if (isRecording && newShowTextInputState) { // If switching to text input and currently recording
            stopRecordingInternal(true); // Stop recording, pass true to indicate it's due to mode toggle
        }
         if (!newShowTextInputState && !isRecording) { // If switching to voice and not recording
            startRecording(); // Start recording
        }
    }
  };

  const handleSendText = async () => { 
    if (!currentMessage.trim() || disabled || isSendingMessage || isRecording || !showTextInput) return;
    
    // onTranscriptionComplete is for voice, onSendMessage for text to align with parent expectations
    await onSendMessage(currentMessage.trim()); 
    if (isMountedRef.current) setCurrentMessage('');
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
          {isRecording ? "Listening... (Stops after 4s silence or manual stop)" : 
           showTextInput ? "Type your response or switch to voice." : 
           "Click the mic to speak or keyboard to type."}
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
                  <p className="text-sm whitespace-pre-wrap">{chat.content}</p>
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
        <div className="flex w-full items-end space-x-2">
          <Button 
            variant="outline" 
            size="icon" 
            disabled={disabled || isSendingMessage || hasMicPermission === false || hasMicPermission === null} 
            onClick={handleMicClick}
            aria-label={isRecording ? "Stop recording" : "Start voice input"}
            className="self-end mb-[1px]"
          >
            {isRecording ? <StopCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            disabled={disabled || isSendingMessage || isRecording} 
            onClick={handleToggleTextInput}
            aria-label={showTextInput ? "Switch to voice input" : "Switch to text input"}
            className="self-end mb-[1px]"
          >
            <Keyboard className="h-5 w-5" />
          </Button>

          {showTextInput && (
            <>
              <Textarea
                ref={textareaRef}
                id="interview-message"
                placeholder={isRecording ? "Listening..." : "Type your message..."}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                disabled={disabled || isSendingMessage || isRecording} 
                className="text-base flex-grow resize-none min-h-[40px] max-h-[150px] overflow-y-auto"
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
                className="self-end mb-[1px]"
              >
                {isSendingMessage && !isRecording ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </>
          )}
        </div>
        <Button 
          onClick={() => {
            if(isRecording) stopRecordingInternal(); 
            onFinishInterview();
          }} 
          disabled={disabled || isSendingMessage} 
          variant="default"
          className={`ml-4 self-end mb-[1px] ${!showTextInput ? 'flex-grow sm:flex-grow-0' : ''}`} // Allow Finish button to take more space if text input is hidden
        >
          Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
        </Button>
      </CardFooter>
    </Card>
  );
});

InterviewInput.displayName = "InterviewInput";
    

    