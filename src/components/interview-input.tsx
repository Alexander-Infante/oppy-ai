
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

const ELEVENLABS_STT_MODEL_ID = "eleven_multilingual_v2"; // Or "eleven_english_sts_v2"
const ELEVENLABS_STT_TIMEOUT_MS = 4000; // 4 seconds

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
  const [showTextInput, setShowTextInput] = useState(false); // Default to voice-focused
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const isMountedRef = useRef(false); 
  
  const elevenLabsApiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
  const [sttAvailable, setSttAvailable] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finalTranscriptFromElevenLabs = useRef<string>('');


  useEffect(() => {
    isMountedRef.current = true;
    if (elevenLabsApiKey && elevenLabsApiKey.trim() !== "") {
      setSttAvailable(true);
    } else {
      setSttAvailable(false);
      console.warn("ElevenLabs API Key (NEXT_PUBLIC_ELEVENLABS_API_KEY) is missing. ElevenLabs STT will be unavailable.");
    }
    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [elevenLabsApiKey]);

  useEffect(() => {
    if (textareaRef.current && showTextInput) {
      textareaRef.current.style.height = 'auto'; 
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [currentMessage, showTextInput]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      if (isRecording) { // Check if still recording
        console.info("ElevenLabs STT: Inactivity timeout reached. Stopping recording.");
        stopRecordingInternal(false, true); // Force stop due to timeout
      }
    }, ELEVENLABS_STT_TIMEOUT_MS);
  }, [isRecording]); // Add isRecording as dependency

  const stopRecordingInternal = useCallback((calledByToggleMode = false, dueToTimeout = false) => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); 
      // onstop will handle sending EOS to WebSocket if connected
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // If MediaRecorder already stopped but WS is open, ensure EOS is sent
      console.log("ElevenLabs STT: Sending EOS (MediaRecorder already stopped or not started but WS open)");
      wsRef.current.send(JSON.stringify({})); // Send EOS message
    }


    if (calledByToggleMode && !isRecording && isMountedRef.current) {
      setIsRecording(false); // Ensure state is correct if toggling mode without active recording
    }
    
    // If not due to timeout, means it's a manual stop or mode toggle
    // if (dueToTimeout && currentMessage.trim() && onTranscriptionComplete) {
    //   onTranscriptionComplete(currentMessage.trim()); // Send what we have if timeout
    //   if(isMountedRef.current) setCurrentMessage('');
    // }

    // isRecording state will be set to false in ws.onclose or if ws creation fails.
  }, [isRecording, onTranscriptionComplete, currentMessage]);


  const startRecording = useCallback(async () => {
    if (!isMountedRef.current || !sttAvailable || !hasMicPermission) {
      if (!sttAvailable) {
        toast({ variant: 'destructive', title: 'ElevenLabs STT Unavailable', description: 'API key missing. Cannot start voice input.' });
      } else if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Permission Denied' });
      }
      return;
    }
    if (isRecording) return; // Already recording

    if (isMountedRef.current) {
      setShowTextInput(false); // Ensure voice focus
      setIsRecording(true);
      setCurrentMessage('Connecting to ElevenLabs STT...');
      finalTranscriptFromElevenLabs.current = '';
      audioChunksRef.current = [];
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }

      wsRef.current = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/stream`);
      const socket = wsRef.current;

      socket.onopen = () => {
        if (!isMountedRef.current) { socket.close(); return; }
        console.log("ElevenLabs STT: WebSocket Connected");
        socket.send(JSON.stringify({
          xi_api_key: elevenLabsApiKey,
          model_id: ELEVENLABS_STT_MODEL_ID,
          // Omitting audio_format to let ElevenLabs auto-detect from WebM/Opus
        }));
        
        if(isMountedRef.current) setCurrentMessage('Listening via ElevenLabs...');
        toast({ title: "Listening (ElevenLabs STT)", description: `Speak now. Stops after ${ELEVENLABS_STT_TIMEOUT_MS / 1000}s of silence or manual stop.` });

        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // Opus in WebM is good
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
            audioChunksRef.current.push(event.data);
            resetInactivityTimer(); // Reset timer on new audio data
          }
        };

        mediaRecorderRef.current.onstop = () => {
          if (isMountedRef.current && socket.readyState === WebSocket.OPEN) {
            console.log("ElevenLabs STT: MediaRecorder stopped. Sending EOS.");
            socket.send(JSON.stringify({})); // Send EOS: empty JSON string
          }
          stream.getTracks().forEach(track => track.stop()); // Release microphone
        };
        
        mediaRecorderRef.current.start(500); // Start recording, collect data in 500ms chunks
        resetInactivityTimer();
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) { socket.close(); return; }
        try {
          const data = JSON.parse(event.data as string);
          console.log("ElevenLabs STT message:", data);

          if (data.type === "partial_transcript" && data.transcript) {
            if(isMountedRef.current) setCurrentMessage(finalTranscriptFromElevenLabs.current + data.transcript);
            resetInactivityTimer();
          } else if (data.type === "final_transcript" && data.transcript) {
             finalTranscriptFromElevenLabs.current += data.transcript;
             if(isMountedRef.current) setCurrentMessage(finalTranscriptFromElevenLabs.current);
             
             // A final transcript segment is received. Clear timer. More may come.
             if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
             // The actual end of session is when WS closes or we explicitly call onTranscriptionComplete.
          } else if (data.is_final === true) { // This is the definitive final message for the session
            const fullTranscript = data.transcript || finalTranscriptFromElevenLabs.current; // Prefer explicit final, fallback to accumulated
             if (isMountedRef.current) {
                setCurrentMessage(fullTranscript);
                if (onTranscriptionComplete && fullTranscript.trim()) {
                    onTranscriptionComplete(fullTranscript.trim());
                }
                setCurrentMessage(''); // Clear after sending
             }
             if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
             // No need to call stopRecordingInternal here, EOS already sent or WS will close.
          } else if (data.error) {
            console.error("ElevenLabs STT Error from WebSocket:", data.error);
            toast({ variant: "destructive", title: "ElevenLabs STT Error", description: data.error });
            if (isMountedRef.current) setCurrentMessage(`Error: ${data.error}`);
            stopRecordingInternal(false);
          }
        } catch (e) {
          console.error("ElevenLabs STT: Error parsing WebSocket message", e);
          // stopRecordingInternal(false); // May not be necessary if connection will close
        }
      };

      socket.onerror = (error) => {
        if (!isMountedRef.current) return;
        console.error("ElevenLabs STT: WebSocket Error:", error);
        toast({ variant: 'destructive', title: 'ElevenLabs STT Connection Error', description: 'Could not connect for voice input.' });
        if(isMountedRef.current) setCurrentMessage('Connection error.');
        if (isMountedRef.current) setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };

      socket.onclose = (event) => {
        if (!isMountedRef.current) return;
        console.log("ElevenLabs STT: WebSocket Closed", event.code, event.reason);
        // Check if final transcript has been processed via 'is_final: true'
        // If not, and we have something in finalTranscriptFromElevenLabs, consider it.
        if (onTranscriptionComplete && finalTranscriptFromElevenLabs.current.trim() && !event.reason?.includes("Processed transcript")) {
            // Heuristic: if WS closes and we have a transcript not yet sent by 'is_final'
            // This might be redundant if 'is_final' is reliable
            // onTranscriptionComplete(finalTranscriptFromElevenLabs.current.trim());
        }
        if(isMountedRef.current) {
            setIsRecording(false);
            if (currentMessage.startsWith("Listening") || currentMessage.startsWith("Connecting")) {
                 setCurrentMessage(''); // Clear placeholder if recording didn't really start or capture
            }
        }
        stream.getTracks().forEach(track => track.stop()); // Ensure mic is off
      };

    } catch (error) {
      console.error("Error starting ElevenLabs STT recording:", error);
      toast({ variant: 'destructive', title: 'Recording Start Failed', description: String(error) });
      if (isMountedRef.current) {
        setIsRecording(false);
        setCurrentMessage('');
      }
    }
  }, [sttAvailable, elevenLabsApiKey, toast, onTranscriptionComplete, hasMicPermission, isRecording, resetInactivityTimer, stopRecordingInternal, currentMessage]);


  useImperativeHandle(ref, () => ({
    startRecording: () => {
        if (sttAvailable && hasMicPermission) {
            startRecording();
        } else if (!sttAvailable) {
             toast({ variant: 'destructive', title: 'ElevenLabs STT Unavailable', description: 'API key missing. Cannot start voice input automatically.' });
        } else if (hasMicPermission === false) {
             toast({ variant: 'destructive', title: 'Microphone Permission Denied', description: 'Cannot start voice input automatically.' });
        }
    },
    stopRecording: () => stopRecordingInternal(false), 
  }));

  useEffect(() => {
    const getMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (isMountedRef.current) setHasMicPermission(true);
        stream.getTracks().forEach(track => track.stop()); // Release the mic immediately after permission check
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
    
    // No cleanup for speechRecognitionRef as it's removed
  }, [toast, hasMicPermission]);


  const handleMicClick = () => {
    if (!sttAvailable) {
      toast({ variant: 'destructive', title: 'ElevenLabs STT Unavailable', description: 'API key missing. Cannot use voice input.' });
      return;
    }
    if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Permission Denied', description: 'Please enable microphone permissions.' });
        return;
    }
     if (hasMicPermission === null) { // Prompt for permission if not yet determined
        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                if (isMountedRef.current) setHasMicPermission(true);
                stream.getTracks().forEach(track => track.stop());
                if (isMountedRef.current) handleMicClick(); // Try again now that permission is (likely) granted
            } catch (error) {
                if (isMountedRef.current) setHasMicPermission(false);
                 toast({ variant: 'destructive', title: 'Microphone Access Denied'});
            }
        })();
        return;
    }

    if (isRecording) {
      stopRecordingInternal();
    } else {
      if (isMountedRef.current && showTextInput) setShowTextInput(false); 
      startRecording(); 
    }
  };

  const handleToggleTextInput = () => {
    if (isMountedRef.current) {
        const newShowTextInputState = !showTextInput;
        setShowTextInput(newShowTextInputState);
        if (isRecording && newShowTextInputState) { 
            stopRecordingInternal(true); 
        }
         if (!newShowTextInputState && !isRecording && sttAvailable && hasMicPermission) { 
            // startRecording(); // Don't auto-start, let user click mic
        }
    }
  };

  const handleSendText = async () => { 
    if (!currentMessage.trim() || disabled || isSendingMessage || isRecording || !showTextInput) return;
    
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

  const getCardDescription = () => {
    if (!sttAvailable) return "ElevenLabs STT unavailable (API key missing). Text input only.";
    if (hasMicPermission === false) return "Mic permission denied. Enable to use voice. Text input available.";
    if (isRecording) return `Listening (ElevenLabs STT)... (Stops after ${ELEVENLABS_STT_TIMEOUT_MS / 1000}s silence or manual stop)`;
    if (showTextInput) return "Type your response or switch to voice (ElevenLabs STT).";
    return "Click the mic for ElevenLabs STT or keyboard to type.";
  };

  const getTextareaPlaceholder = () => {
    if (!sttAvailable || hasMicPermission === false) return "Voice input unavailable. Type here.";
    if (isRecording) return "Listening via ElevenLabs... your speech will appear here...";
    if (showTextInput) return "Type your message here...";
    // If not showing text input and not recording, it's voice mode waiting for mic click
    return "Click mic to start speaking with ElevenLabs STT.";
  };


  return (
    <Card className="w-full max-w-2xl shadow-xl flex flex-col h-[70vh] sm:h-[600px]">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <Sparkles className="mr-2 h-6 w-6 text-primary" />
          AI Interview Chat
        </CardTitle>
        <CardDescription>
         {getCardDescription()}
        </CardDescription>
         {hasMicPermission === false && sttAvailable && ( // Only show if STT could be available but mic denied
            <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Microphone Access Denied</AlertTitle>
                <AlertDescription>
                Voice input is disabled. Please enable microphone permissions in your browser settings to use ElevenLabs STT. You can still type your responses.
                </AlertDescription>
            </Alert>
        )}
        {!sttAvailable && (
             <Alert variant="warning" className="mt-2"> {/* ShadCN does not have warning, use destructive or default */}
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>ElevenLabs STT Unavailable</AlertTitle>
                <AlertDescription>
                `NEXT_PUBLIC_ELEVENLABS_API_KEY` is not set in your environment. Voice input will not use ElevenLabs. Please configure the API key and restart your server. You can use text input.
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
            disabled={disabled || isSendingMessage || !sttAvailable || hasMicPermission === false || hasMicPermission === null} 
            onClick={handleMicClick}
            aria-label={isRecording ? "Stop ElevenLabs STT recording" : "Start ElevenLabs STT voice input"}
            className="self-end mb-[1px]"
          >
            {isRecording ? <StopCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            disabled={disabled || isSendingMessage || isRecording} // Disable if actively recording
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
                placeholder={getTextareaPlaceholder()}
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
           {!showTextInput && ( // Display current transcript or placeholder when in voice mode
             <div className={cn(
                "flex-grow p-2 border rounded-md bg-muted text-muted-foreground text-sm min-h-[40px] max-h-[150px] overflow-y-auto self-end mb-[1px]",
                (currentMessage.startsWith("Listening") || currentMessage.startsWith("Connecting")) ? "italic" : ""
             )}>
                {currentMessage || getTextareaPlaceholder()}
             </div>
            )
           }
        </div>
        <Button 
          onClick={() => {
            if(isRecording) stopRecordingInternal(); 
            onFinishInterview();
          }} 
          disabled={disabled || isSendingMessage} 
          variant="default"
          className={`ml-4 self-end mb-[1px] ${!showTextInput && !currentMessage ? 'flex-grow sm:flex-grow-0' : ''}`} 
        >
          Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
        </Button>
      </CardFooter>
    </Card>
  );
});

InterviewInput.displayName = "InterviewInput";
    

    

    

    