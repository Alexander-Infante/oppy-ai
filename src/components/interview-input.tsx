
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

// NOTE: This is an assumed endpoint for ElevenLabs Conversational API.
// Please verify with official ElevenLabs documentation.
const ELEVENLABS_CONVERSATIONAL_API_ENDPOINT = "wss://api.elevenlabs.io/v1/voice-chat"; 
const AI_VOICE_ID_FOR_CONVERSATION = "21m00Tcm4TlvDq8ikWAM"; // Example: Rachel's voice for the AI
const CONVERSATIONAL_MODEL_ID = "eleven_turbo_v2"; // Or your preferred model for conversation
const INACTIVITY_TIMEOUT_MS = 4000; // 4 seconds of silence

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const isMountedRef = useRef(false);

  const elevenLabsApiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
  const [sttAvailable, setSttAvailable] = useState(false); 

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]); 
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTranscript = useRef<string>('');


  useEffect(() => {
    isMountedRef.current = true;
    if (elevenLabsApiKey && elevenLabsApiKey.trim() !== "") {
      setSttAvailable(true);
    } else {
      setSttAvailable(false);
      console.warn("ElevenLabs API Key (NEXT_PUBLIC_ELEVENLABS_API_KEY) is missing or empty. ElevenLabs Conversational Voice Chat will be unavailable. Ensure the key is set in your .env file and RESTART your development server if changes were made.");
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
      if (isRecording) {
        console.info("ElevenLabs Conversational: Inactivity timeout. Attempting to finalize turn.");
        stopRecordingInternal(false, true); // dueToTimeout = true
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [isRecording]); 

  const stopRecordingInternal = useCallback((calledByToggleMode = false, dueToTimeout = false) => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); 
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log("ElevenLabs Conversational: MediaRecorder stopped or stopping. Sending EOS-like signal (empty JSON).");
      wsRef.current.send(JSON.stringify({ "text": " " })); 
    }
    
    if (calledByToggleMode && !isRecording && isMountedRef.current) {
      setIsRecording(false); 
    }
  }, [isRecording]);


  const startRecording = useCallback(async () => {
    if (!isMountedRef.current || !sttAvailable || hasMicPermission === false) {
      if (!sttAvailable) {
        toast({ variant: 'destructive', title: 'ElevenLabs API Unavailable', description: 'API key missing. Cannot start voice chat. Ensure NEXT_PUBLIC_ELEVENLABS_API_KEY is set and restart your server.' });
      } else if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Permission Denied' });
      }
      return;
    }
    if (isRecording) return; 

    if (isMountedRef.current) {
      setShowTextInput(false);
      setIsRecording(true);
      setCurrentMessage('Connecting to ElevenLabs Voice Chat...');
      accumulatedTranscript.current = '';
      audioChunksRef.current = [];
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }

      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
      wsRef.current = new WebSocket(ELEVENLABS_CONVERSATIONAL_API_ENDPOINT);
      const socket = wsRef.current;

      socket.onopen = () => {
        if (!isMountedRef.current) { socket.close(); return; }
        console.log("ElevenLabs Conversational: WebSocket Connected");
        
        // IMPORTANT: Consult ElevenLabs official documentation for the correct Conversational API endpoint
        // and the *exact* required structure for this initial configuration message.
        // The fields 'voice_id', 'model_id', and any audio format specifications are critical.
        const initialConfig = {
          xi_api_key: elevenLabsApiKey, // This MUST be your valid ElevenLabs API key.
          voice_id: AI_VOICE_ID_FOR_CONVERSATION, // For the AI's voice, ensure this ID is valid.
          model_id: CONVERSATIONAL_MODEL_ID, // Specifies the model for conversation/STT.
          // audio_format was removed as a test - the API might not need it, or might need it specified differently.
          enable_automatic_punctuation: true,
          optimize_streaming_latency: 4, // 0-4, higher means more optimization
        };
        console.log("ElevenLabs Conversational: Sending initial configuration:", initialConfig);
        socket.send(JSON.stringify(initialConfig));

        if(isMountedRef.current) setCurrentMessage('Listening (ElevenLabs Voice Chat)...');
        toast({ title: "Listening (ElevenLabs Voice Chat)", description: `Speak now. Stops after ${INACTIVITY_TIMEOUT_MS / 1000}s of silence or manual stop.` });

        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' }); 

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data); 
            resetInactivityTimer();
          }
        };

        mediaRecorderRef.current.onstop = () => {
          if (isMountedRef.current && socket.readyState === WebSocket.OPEN) {
            console.log("ElevenLabs Conversational: MediaRecorder stopped. User audio stream ended from client side.");
          }
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start(250); 
        resetInactivityTimer();
      };

      socket.onmessage = (event) => {
        if (!isMountedRef.current) { socket.close(); return; }
        try {
          const data = JSON.parse(event.data as string);
          console.log("ElevenLabs Conversational: Received message:", data);

          // IMPORTANT: The message structure from Conversational API needs to be handled according to its documentation.
          // This is a placeholder for handling user's transcript.
          // Common fields might be 'type', 'transcript', 'is_final', 'text', 'payload.text'.
          if (data.type === "user_transcript" || data.transcript || (data.payload && data.payload.text) ) { 
            const transcriptText = data.transcript || (data.payload && data.payload.text) || data.text;
            if (transcriptText) {
              if (data.is_final || data.final || data.type === "final_transcript") { 
                accumulatedTranscript.current += transcriptText + " ";
                if(isMountedRef.current) setCurrentMessage(accumulatedTranscript.current.trim());
                if (onTranscriptionComplete && accumulatedTranscript.current.trim()) {
                    onTranscriptionComplete(accumulatedTranscript.current.trim());
                    accumulatedTranscript.current = ''; 
                }
                if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
                 if(isMountedRef.current) setCurrentMessage(''); 
              } else { 
                if(isMountedRef.current) setCurrentMessage(accumulatedTranscript.current + transcriptText);
                resetInactivityTimer();
              }
            }
          } else if (data.type === "ai_audio_chunk") {
            // TODO: Handle AI audio playback (deferred to a future step)
             console.log("ElevenLabs Conversational: Received AI audio chunk (playback not implemented).");
          } else if (data.type === "error" || data.error) {
            const errorMsg = data.error || (data.message || "Unknown error from Voice Chat API");
            console.warn("ElevenLabs Conversational: Error from WebSocket:", errorMsg);
            toast({ variant: "destructive", title: "ElevenLabs Voice Chat Error", description: String(errorMsg) });
            if (isMountedRef.current) setCurrentMessage(`Error: ${errorMsg}`);
            stopRecordingInternal(false);
          } else {
             console.log("ElevenLabs Conversational: Received unhandled message type:", data.type || "N/A", data);
          }
        } catch (e) {
          console.warn("ElevenLabs Conversational: Error parsing WebSocket message or unexpected message format", event.data, e);
        }
      };

      socket.onerror = (errorEvent: Event) => {
        if (!isMountedRef.current) return;
        const eventType = errorEvent.type || 'N/A';
        const bubbles = errorEvent.bubbles;
        const cancelable = errorEvent.cancelable;

        console.warn(
            `ElevenLabs Conversational: WebSocket onerror event. Type: ${eventType}, Bubbles: ${bubbles}, Cancelable: ${cancelable}. Inspect the full event object (logged separately) for more details. Also check the WebSocket 'onclose' event (code/reason) and your browser's network tab for handshake issues.`
        );
        console.warn("ElevenLabs Conversational: Full WebSocket error event object:", errorEvent);
        
        toast({ variant: 'destructive', title: 'ElevenLabs Voice Chat Error', description: 'Connection failed. Check API key, network, and console.' });
        if(isMountedRef.current) setCurrentMessage('Connection error.');
        if (isMountedRef.current) setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };

      socket.onclose = (event) => {
        if (!isMountedRef.current) return;
        console.log("ElevenLabs Conversational: WebSocket Closed. Code:", event.code, "Reason:", event.reason || "No reason provided.");
        
        if (event.code !== 1000 && accumulatedTranscript.current.trim() && onTranscriptionComplete) {
             if (isMountedRef.current) {
                onTranscriptionComplete(accumulatedTranscript.current.trim());
                accumulatedTranscript.current = '';
             }
        }
        if (event.code !== 1000 && event.code !== 1005 ) { 
            toast({
                variant: "warning",
                title: "ElevenLabs Voice Chat Disconnected",
                description: `Code: ${event.code}. ${event.reason || "Check API key, network, or console."}`,
            });
        }
        if(isMountedRef.current) {
            setIsRecording(false);
            if (currentMessage.startsWith("Listening") || currentMessage.startsWith("Connecting")) {
                 setCurrentMessage('');
            }
        }
        stream.getTracks().forEach(track => track.stop()); 
      };

    } catch (error) {
      console.warn("Error starting ElevenLabs Conversational recording:", error);
      toast({ variant: 'destructive', title: 'Voice Chat Start Failed', description: String(error) });
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
             toast({ variant: 'destructive', title: 'ElevenLabs API Unavailable', description: 'API key missing. Cannot start voice chat automatically.' });
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
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('Error accessing microphone:', error);
        if (isMountedRef.current) {
            setHasMicPermission(false);
            toast({
            variant: 'destructive',
            title: 'Microphone Access Denied',
            description: 'Please enable microphone permissions in your browser settings for voice chat.',
            });
        }
      }
    };

    if (hasMicPermission === null) {
        getMicPermission();
    }
  }, [toast, hasMicPermission]);


  const handleMicClick = () => {
    if (!sttAvailable) {
      toast({ variant: 'destructive', title: 'ElevenLabs API Unavailable', description: 'API key missing. Cannot use voice chat.' });
      return;
    }
    if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Permission Denied', description: 'Please enable microphone permissions.' });
        return;
    }
     if (hasMicPermission === null) { 
        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                if (isMountedRef.current) setHasMicPermission(true);
                stream.getTracks().forEach(track => track.stop());
                if (isMountedRef.current) handleMicClick(); 
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
    if (!sttAvailable) return "ElevenLabs Voice Chat unavailable (API key missing). Text input only.";
    if (hasMicPermission === false) return "Mic permission denied. Enable to use voice. Text input available.";
    if (isRecording) return `Listening (ElevenLabs Voice Chat)... (Stops after ${INACTIVITY_TIMEOUT_MS / 1000}s silence or manual stop)`;
    if (showTextInput) return "Type your response or switch to ElevenLabs Voice Chat.";
    return "Click the mic for ElevenLabs Voice Chat or keyboard to type.";
  };

  const getTextareaPlaceholder = () => {
    if (!sttAvailable || hasMicPermission === false) return "Voice chat unavailable. Type here.";
    if (isRecording) return "Listening (ElevenLabs Voice Chat)... your speech will appear here...";
    if (showTextInput) return "Type your message here...";
    return "Click mic to start speaking with ElevenLabs Voice Chat.";
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
         {hasMicPermission === false && sttAvailable && (
            <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Microphone Access Denied</AlertTitle>
                <AlertDescription>
                Voice chat is disabled. Please enable microphone permissions in your browser settings to use ElevenLabs. You can still type your responses.
                </AlertDescription>
            </Alert>
        )}
        {!sttAvailable && ( 
             <Alert variant="warning" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>ElevenLabs API Unavailable</AlertTitle>
                <AlertDescription>
                `NEXT_PUBLIC_ELEVENLABS_API_KEY` is not set or is empty in your environment. ElevenLabs Voice Chat will not be available.
                Please configure the API key in your `.env` file and **restart your development server**. You can use text input.
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
            aria-label={isRecording ? "Stop ElevenLabs Voice Chat" : "Start ElevenLabs Voice Chat"}
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
                placeholder={getTextareaPlaceholder()}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                disabled={disabled || isSendingMessage || isRecording}
                className="text-base flex-grow resize-none min-h-[40px] max-h-[150px] overflow-y-auto whitespace-pre-wrap"
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
           {!showTextInput && ( 
             <div className={cn(
                "flex-grow p-2 border rounded-md bg-muted text-muted-foreground text-sm min-h-[40px] max-h-[150px] overflow-y-auto self-end mb-[1px] whitespace-pre-wrap",
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
    
