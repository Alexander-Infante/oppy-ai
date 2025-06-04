
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

const ELEVENLABS_STT_MODEL_ID = "eleven_multilingual_v2";
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
  const [showTextInput, setShowTextInput] = useState(false);
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
      console.warn("ElevenLabs API Key (NEXT_PUBLIC_ELEVENLABS_API_KEY) is missing or empty. ElevenLabs STT will be unavailable. Ensure the key is set in your .env file and RESTART your development server if changes were made.");
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
        console.info("ElevenLabs STT: Inactivity timeout reached. Stopping recording.");
        stopRecordingInternal(false, true);
      }
    }, ELEVENLABS_STT_TIMEOUT_MS);
  }, [isRecording]); // Add stopRecordingInternal to dependencies if it uses state/props that change

  const stopRecordingInternal = useCallback((calledByToggleMode = false, dueToTimeout = false) => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); // This will trigger onstop, which sends EOS
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // If MediaRecorder already stopped or wasn't started but WS is open, send EOS
      console.log("ElevenLabs STT: Sending EOS (MediaRecorder likely already stopped or not started but WS open)");
      wsRef.current.send(JSON.stringify({})); // EOS signal
    }
    // Note: wsRef.current.close() is usually handled in socket.onclose or after EOS confirmation from server if needed.
    // Forcing close here might be too abrupt if server expects EOS then closes.

    if (calledByToggleMode && !isRecording && isMountedRef.current) {
      setIsRecording(false); // Ensure state consistency if called by mode toggle
    }
    // Let onclose handle setIsRecording(false) in other scenarios
  }, [isRecording, onTranscriptionComplete, currentMessage]);


  const startRecording = useCallback(async () => {
    if (!isMountedRef.current || !sttAvailable || !hasMicPermission) {
      if (!sttAvailable) {
        toast({ variant: 'destructive', title: 'ElevenLabs STT Unavailable', description: 'API key missing. Cannot start voice input. Ensure NEXT_PUBLIC_ELEVENLABS_API_KEY is set and restart your server.' });
      } else if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Permission Denied' });
      }
      return;
    }
    if (isRecording) return;

    if (isMountedRef.current) {
      setShowTextInput(false);
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
        const sttConfig = {
          xi_api_key: elevenLabsApiKey,
          model_id: ELEVENLABS_STT_MODEL_ID,
        };
        console.log("ElevenLabs STT: Sending configuration:", sttConfig);
        socket.send(JSON.stringify(sttConfig));

        if(isMountedRef.current) setCurrentMessage('Listening via ElevenLabs...');
        toast({ title: "Listening (ElevenLabs STT)", description: `Speak now. Stops after ${ELEVENLABS_STT_TIMEOUT_MS / 1000}s of silence or manual stop.` });

        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // Consider checking MediaRecorder.isTypeSupported('audio/webm')

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
            audioChunksRef.current.push(event.data);
            resetInactivityTimer();
          }
        };

        mediaRecorderRef.current.onstop = () => {
          // This is called when mediaRecorder.stop() is invoked
          if (isMountedRef.current && socket.readyState === WebSocket.OPEN) {
            console.log("ElevenLabs STT: MediaRecorder stopped. Sending EOS.");
            socket.send(JSON.stringify({})); // End of Stream signal
          }
          stream.getTracks().forEach(track => track.stop()); // Stop mic access
        };

        mediaRecorderRef.current.start(500); // Send data every 500ms
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
             // Don't auto-stop/send here, wait for is_final or timeout
             if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); // A final transcript arrived, clear timer
          } else if (data.is_final === true) { // This usually marks the end from server after EOS
            const fullTranscript = data.transcript || finalTranscriptFromElevenLabs.current;
             if (isMountedRef.current) {
                setCurrentMessage(fullTranscript); // Display final
                if (onTranscriptionComplete && fullTranscript.trim()) {
                    onTranscriptionComplete(fullTranscript.trim());
                }
                setCurrentMessage(''); // Clear for next input
             }
             if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
             // Consider closing WS here if server doesn't auto-close after final message
             // wsRef.current?.close();
          } else if (data.error) {
            console.error("ElevenLabs STT Error from WebSocket:", data.error);
            toast({ variant: "destructive", title: "ElevenLabs STT Error", description: data.error });
            if (isMountedRef.current) setCurrentMessage(`Error: ${data.error}`);
            stopRecordingInternal(false); // Stop recording on error
          }
        } catch (e) {
          console.error("ElevenLabs STT: Error parsing WebSocket message", e);
        }
      };

      socket.onerror = (errorEvent: Event) => {
        if (!isMountedRef.current) return;
        const eventType = errorEvent.type || 'N/A';
        const bubbles = errorEvent.bubbles;
        const cancelable = errorEvent.cancelable;

        console.error(
            `ElevenLabs STT: WebSocket onerror event. Type: ${eventType}, Bubbles: ${bubbles}, Cancelable: ${cancelable}. Inspect the full event object logged below for more details. Also check the WebSocket 'onclose' event (code/reason) and your browser's network tab for handshake issues.`,
            errorEvent
        );

        toast({ variant: 'destructive', title: 'ElevenLabs STT Connection Error', description: 'Could not connect for voice input.' });
        if(isMountedRef.current) setCurrentMessage('Connection error.');
        if (isMountedRef.current) setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };

      socket.onclose = (event) => {
        if (!isMountedRef.current) return;
        console.log("ElevenLabs STT: WebSocket Closed. Code:", event.code, "Reason:", event.reason || "No reason provided.");
        // If closed unexpectedly, and there's a pending transcript, try to use it
        if (event.code !== 1000 && finalTranscriptFromElevenLabs.current.trim() && onTranscriptionComplete) {
             if (isMountedRef.current && (currentMessage.startsWith("Listening") || currentMessage.startsWith("Connecting") || currentMessage === finalTranscriptFromElevenLabs.current) ) {
                // Heuristic: If current message IS the final transcript, it was likely a timeout or unexpected close
                // and we should send what we have.
                onTranscriptionComplete(finalTranscriptFromElevenLabs.current.trim());
             }
        }
        if(isMountedRef.current) {
            setIsRecording(false);
            if (currentMessage.startsWith("Listening") || currentMessage.startsWith("Connecting")) {
                 setCurrentMessage(''); // Clear "Listening..."
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
  }, [sttAvailable, elevenLabsApiKey, toast, onTranscriptionComplete, hasMicPermission, isRecording, resetInactivityTimer, stopRecordingInternal, currentMessage]); // Added dependencies


  useImperativeHandle(ref, () => ({
    startRecording: () => {
        if (sttAvailable && hasMicPermission) {
            startRecording();
        } else if (!sttAvailable) {
             toast({ variant: 'destructive', title: 'ElevenLabs STT Unavailable', description: 'API key missing. Cannot start voice input automatically. Ensure NEXT_PUBLIC_ELEVENLABS_API_KEY is set and restart your server.' });
        } else if (hasMicPermission === false) {
             toast({ variant: 'destructive', title: 'Microphone Permission Denied', description: 'Cannot start voice input automatically.' });
        }
    },
    stopRecording: () => stopRecordingInternal(false), // Expose internal stop
  }));

  useEffect(() => {
    const getMicPermission = async () => {
      try {
        // Just to check permission, then stop the track immediately.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (isMountedRef.current) setHasMicPermission(true);
        stream.getTracks().forEach(track => track.stop()); // Important to release the mic
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

    if (hasMicPermission === null) { // Only check if permission status is unknown
        getMicPermission();
    }
    // No cleanup needed here as tracks are stopped immediately after permission check
  }, [toast, hasMicPermission]);


  const handleMicClick = () => {
    if (!sttAvailable) {
      toast({ variant: 'destructive', title: 'ElevenLabs STT Unavailable', description: 'API key missing. Cannot use voice input. Ensure NEXT_PUBLIC_ELEVENLABS_API_KEY is set and restart your server.' });
      return;
    }
    if (hasMicPermission === false) {
        toast({ variant: 'destructive', title: 'Microphone Permission Denied', description: 'Please enable microphone permissions.' });
        return;
    }
     if (hasMicPermission === null) { // If still null, try to get it now
        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                if (isMountedRef.current) setHasMicPermission(true);
                stream.getTracks().forEach(track => track.stop());
                if (isMountedRef.current) handleMicClick(); // Retry click after permission granted
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
      if (isMountedRef.current && showTextInput) setShowTextInput(false); // Switch to voice UI
      startRecording(); // Now start the actual recording
    }
  };

  const handleToggleTextInput = () => {
    if (isMountedRef.current) {
        const newShowTextInputState = !showTextInput;
        setShowTextInput(newShowTextInputState);
        if (isRecording && newShowTextInputState) { // If switching to text while recording
            stopRecordingInternal(true); // Stop recording, indicating it's due to mode toggle
        }
    }
  };

  const handleSendText = async () => { // For manual text input
    if (!currentMessage.trim() || disabled || isSendingMessage || isRecording || !showTextInput) return;

    await onSendMessage(currentMessage.trim()); // Use the existing onSendMessage prop
    if (isMountedRef.current) setCurrentMessage('');
  };

  // Scroll to bottom of chat history
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
         {hasMicPermission === false && sttAvailable && ( // Show if mic denied but STT could be available
            <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Microphone Access Denied</AlertTitle>
                <AlertDescription>
                Voice input is disabled. Please enable microphone permissions in your browser settings to use ElevenLabs STT. You can still type your responses.
                </AlertDescription>
            </Alert>
        )}
        {!sttAvailable && ( // Show if API key is missing
             <Alert variant="warning" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>ElevenLabs STT Unavailable</AlertTitle>
                <AlertDescription>
                `NEXT_PUBLIC_ELEVENLABS_API_KEY` is not set or is empty in your environment. Voice input will not use ElevenLabs.
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
            disabled={disabled || isSendingMessage || !sttAvailable || hasMicPermission === false || hasMicPermission === null} // Disable if mic perm unknown
            onClick={handleMicClick}
            aria-label={isRecording ? "Stop ElevenLabs STT recording" : "Start ElevenLabs STT voice input"}
            className="self-end mb-[1px]"
          >
            {isRecording ? <StopCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={disabled || isSendingMessage || isRecording} // Disable if recording
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
                disabled={disabled || isSendingMessage || isRecording} // Also disable if recording
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
                {isSendingMessage && !isRecording ? ( // Check not recording for loader on send button
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </>
          )}
           {!showTextInput && ( // Display area for voice transcript
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
            if(isRecording) stopRecordingInternal(); // Ensure recording stops
            onFinishInterview();
          }}
          disabled={disabled || isSendingMessage} // Can finish even if recording (it will be stopped)
          variant="default"
          className={`ml-4 self-end mb-[1px] ${!showTextInput && !currentMessage ? 'flex-grow sm:flex-grow-0' : ''}`} // Adjust width if voice input is active and empty
        >
          Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
        </Button>
      </CardFooter>
    </Card>
  );
});

InterviewInput.displayName = "InterviewInput";
    