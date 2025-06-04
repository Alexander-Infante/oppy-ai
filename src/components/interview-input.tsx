
"use client";

import type { ParseResumeOutput } from '@/ai/flows/parse-resume';
import React, { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Mic, StopCircle, Sparkles, User, Bot, ChevronRight, AlertTriangle, Keyboard, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useConversation, type ChatMessage as SDKChatMessage } from '@elevenlabs/react';

const USER_AGENT_ID = 'agent_01jwwh679kegrbsv4mmgy96tfe';

export interface InterviewInputHandle {
  // Methods exposed via ref, if any
}

interface InterviewInputProps {
  parsedData: ParseResumeOutput;
  onFinishInterview: (chatHistory: ChatMessage[]) => void;
  disabled?: boolean;
}

// Local ChatMessage type for UI display, includes id and timestamp
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
}

export const InterviewInput = forwardRef<InterviewInputHandle, InterviewInputProps>(({
  parsedData,
  onFinishInterview,
  disabled,
}, ref) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { toast } = useToast();
  const isMountedRef = useRef(false);
  const initialContextSentRef = useRef(false);

  const elevenLabsApiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

  const [localChatHistory, setLocalChatHistory] = useState<ChatMessage[]>([]);
  const [textInput, setTextInput] = useState<string>('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  // isConnected and isLoading are now derived from SDK's status where possible
  // but we might still need an isLoading for the initial connection attempt.
  const [isConnecting, setIsConnecting] = useState(false);


  const {
    startSession,
    endSession,
    status, // e.g., 'idle', 'connecting', 'connected', 'speaking', 'listening'
    isSpeaking, // boolean, true if AI is currently speaking
    sendUserInput, // Function to send text from user to agent
    chatHistory: sdkChatHistory, // The chat history from the SDK
    // ... other properties like isRecording, stopRecording, startRecording if needed for manual mic control
  } = useConversation({
    agentId: USER_AGENT_ID, // Pass agentId here
    elevenLabsApiKey: elevenLabsApiKey, // Pass apiKey here
    onConnect: () => {
      if (!isMountedRef.current) return;
      console.log("InterviewInput: Connected to ElevenLabs");
      setIsConnecting(false);
      // Initial context sending will be handled by a useEffect dependent on status === 'connected'
    },
    onDisconnect: () => {
      if (!isMountedRef.current) return;
      console.log("InterviewInput: Disconnected from ElevenLabs");
      setIsConnecting(false);
      initialContextSentRef.current = false; // Reset for potential reconnection
    },
    onMessage: (message: SDKChatMessage) => {
      if (!isMountedRef.current) return;
      console.log("InterviewInput: Message received from SDK:", message);
      // Add to local history for UI rendering with IDs and timestamps
      const newUiMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: message.source === 'ai' ? 'assistant' : 'user',
        text: message.message,
        timestamp: new Date(),
      };
      setLocalChatHistory(prev => [...prev, newUiMessage]);
    },
    onError: (errorMsg: string) => {
      if (!isMountedRef.current) return;
      console.error("InterviewInput: SDK Error:", errorMsg);
      setLocalError(errorMsg);
      setIsConnecting(false);
      toast({
        title: "Conversation Error",
        description: errorMsg,
        variant: "destructive"
      });
    },
  });

  useEffect(() => {
    isMountedRef.current = true;
    // Reset initialContextSentRef if parsedData changes, to allow sending new context if a new interview starts with new data.
    // This assumes InterviewInput might persist, if it unmounts/remounts, ref is auto-reset.
    initialContextSentRef.current = false;
    return () => {
      isMountedRef.current = false;
      // Attempt to end session on unmount if connected
      if (status === 'connected' || status === 'speaking' || status === 'listening') {
        console.log("InterviewInput: Ending session on unmount");
        endSession();
      }
    };
  }, [parsedData]); // Reset context flag if resume data changes.

  const requestMicPermissionAndStart = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') return;
    let micGranted = hasMicPermission;
    if (!micGranted) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMountedRef.current) return;
        setHasMicPermission(true);
        micGranted = true;
        console.log("InterviewInput: Microphone permission granted.");
      } catch (err) {
        console.error("InterviewInput: Error requesting microphone permission:", err);
        if (!isMountedRef.current) return;
        setLocalError("Microphone permission denied. Please enable it in your browser settings.");
        toast({
          title: "Microphone Access Denied",
          description: "Please enable microphone permissions to use voice chat.",
          variant: "destructive"
        });
        setHasMicPermission(false);
        return;
      }
    }

    if (micGranted && elevenLabsApiKey && (status === 'idle' || status === 'disconnected')) {
      console.log("InterviewInput: Attempting to start session.");
      setIsConnecting(true);
      setLocalError(null);
      setLocalChatHistory([]); // Clear previous chat for new session
      initialContextSentRef.current = false;
      try {
        await startSession(); // SDK uses agentId and apiKey from hook config
      } catch (error: any) {
        if (!isMountedRef.current) return;
        console.error("InterviewInput: Failed to start session:", error);
        setLocalError(error.message || "Failed to start conversation session.");
        setIsConnecting(false);
        toast({
          title: "Connection Failed",
          description: error.message || "Unable to connect to the interview agent",
          variant: "destructive"
        });
      }
    }
  }, [hasMicPermission, elevenLabsApiKey, status, startSession, toast]);

  // Effect to auto-start conversation when component mounts and dependencies are ready
  useEffect(() => {
    if (elevenLabsApiKey && !hasMicPermission) { // Request mic permission first
        requestMicPermissionAndStart();
    } else if (elevenLabsApiKey && hasMicPermission && (status === 'idle' || status === 'disconnected')) { // Then start session
        requestMicPermissionAndStart();
    }
  }, [elevenLabsApiKey, hasMicPermission, status, requestMicPermissionAndStart]);


  // Effect to send initial resume context
  useEffect(() => {
    if (status === 'connected' && parsedData && sendUserInput && !initialContextSentRef.current) {
      console.log("InterviewInput: Attempting to send initial resume context to agent.");
      let contextString = "Candidate Resume Summary (for interview context):\n";

      if (parsedData.skills && parsedData.skills.length > 0) {
        contextString += "\nSkills:\n";
        parsedData.skills.forEach(skill => {
          contextString += `- ${skill}\n`;
        });
      } else {
        contextString += "\nSkills: Not specified\n";
      }

      if (parsedData.experience && parsedData.experience.length > 0) {
        contextString += "\nWork Experience:\n";
        parsedData.experience.forEach(exp => {
          contextString += `- Title: ${exp.title || 'N/A'}\n  Company: ${exp.company || 'N/A'}\n  Dates: ${exp.dates || 'N/A'}\n`;
          if (exp.description) {
            contextString += `  Description: ${exp.description.substring(0, 250)}${exp.description.length > 250 ? '...' : ''}\n`;
          }
        });
      } else {
        contextString += "\nWork Experience: Not specified\n";
      }

      if (parsedData.education && parsedData.education.length > 0) {
        contextString += "\nEducation:\n";
        parsedData.education.forEach(edu => {
          contextString += `- Degree: ${edu.degree || 'N/A'}\n  Institution: ${edu.institution || 'N/A'}\n  Dates: ${edu.dates || 'N/A'}\n`;
        });
      } else {
        contextString += "\nEducation: Not specified\n";
      }
      
      contextString += "\nPlease begin the interview based on this information, starting with a friendly greeting and your first question."

      try {
        sendUserInput(contextString);
        initialContextSentRef.current = true;
        console.log("InterviewInput: Initial resume context sent to agent.");
        // Add a system message to local UI history for clarity
        const systemContextUiMessage: ChatMessage = {
            id: `system-ctx-${Date.now()}`,
            role: 'system',
            text: "Resume context has been sent to the AI interviewer.",
            timestamp: new Date(),
        };
        setLocalChatHistory(prev => [...prev, systemContextUiMessage]);

        toast({ title: "Context Sent", description: "Resume details provided to the AI interviewer.", variant: "default" });
      } catch (e: any) {
        console.error("InterviewInput: Error sending initial context:", e);
        toast({ title: "Context Error", description: "Failed to send resume context to AI.", variant: "destructive" });
      }
    }
  }, [status, parsedData, sendUserInput, toast]);


  const handleSendText = async () => {
    if (disabled || isConnecting || status !== 'connected' || !textInput.trim() || !sendUserInput) return;

    const textToSend = textInput;
    if (isMountedRef.current) setTextInput(''); // Clear input immediately

    // Add to local UI history
    const userUiMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date(),
    };
    setLocalChatHistory(prev => [...prev, userUiMessage]);
    
    try {
      console.log("InterviewInput: Sending text input via SDK:", textToSend);
      sendUserInput(textToSend);
    } catch (e:any) {
        console.error("InterviewInput: Error sending text message via SDK:", e);
        setLocalError(e.message || "Failed to send message.");
        toast({ title: "Send Error", description: e.message || "Could not send message.", variant: "destructive" });
        // Optionally re-add text to input or a retry mechanism
        // setTextInput(textToSend); // Re-populate if send fails
    }
  };

  const handleToggleTextInput = async () => {
    if (disabled || isConnecting) return;
    const newShowTextInput = !showTextInput;
    if (isMountedRef.current) setShowTextInput(newShowTextInput);

    if (!newShowTextInput && !hasMicPermission && status !== 'connected' && status !== 'listening') {
      // If switching to voice and not connected/permitted, try to connect
      requestMicPermissionAndStart();
    }
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollableViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [localChatHistory]); // Scroll on local UI history updates

  useEffect(() => {
    if (textareaRef.current && showTextInput) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [textInput, showTextInput]);

  const getCardDescription = () => {
    if (!elevenLabsApiKey) return "Interview disabled: ElevenLabs API Key missing.";
    if (isConnecting) return "Connecting to AI Interviewer...";
    if (localError) return `Error: ${localError.substring(0,100)}...`;
    
    switch (status) {
        case 'idle': return "Ready to start interview. Click mic or keyboard.";
        case 'connecting': return "Connecting...";
        case 'connected': return isSpeaking ? "AI is speaking..." : (showTextInput ? "Type your response." : "Voice chat active. Speak now.");
        case 'speaking': return "AI is speaking...";
        case 'listening': return "Listening for your response...";
        case 'disconnected': return "Disconnected. Attempt to reconnect?";
        default: return "Standby...";
    }
  };

  const handleFinish = async () => {
    console.log("InterviewInput: Finish Interview clicked.");
    if (status === 'connected' || status === 'speaking' || status === 'listening') {
      await endSession();
    }
    // Pass the locally maintained UI chat history
    onFinishInterview(localChatHistory);
  };

  if (!elevenLabsApiKey) {
    return (
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader>
          <CardTitle>AI Interview Chat</CardTitle>
          <CardDescription>Configuration Error</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>API Key Missing</AlertTitle>
            <AlertDescription>
              The <code>NEXT_PUBLIC_ELEVENLABS_API_KEY</code> environment variable is not set.
              The AI Interview feature cannot function without it.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const isLoadingOverall = disabled || isConnecting || status === 'connecting';


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
        {localError && !isConnecting && ( // Show error only if not actively trying to connect
             <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{localError}</AlertDescription>
            </Alert>
        )}
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden p-0">
        <ScrollArea className="h-full p-4 sm:p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {localChatHistory.map((chatMsg) => (
              <div
                key={chatMsg.id}
                className={cn(
                  "flex items-start space-x-3",
                  chatMsg.role === 'user' ? 'justify-end' : ''
                )}
              >
                {chatMsg.role === 'assistant' && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground">
                    <Bot size={18} />
                  </span>
                )}
                 {chatMsg.role === 'system' && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground">
                    <Zap size={18} />
                  </span>
                )}
                <div
                  className={cn(
                    "p-3 rounded-lg max-w-[75%]",
                    chatMsg.role === 'user'
                      ? 'bg-secondary text-secondary-foreground rounded-br-none'
                      : chatMsg.role === 'assistant'
                        ? 'bg-muted text-muted-foreground rounded-bl-none'
                        : 'bg-transparent text-muted-foreground text-xs italic text-center w-full'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{chatMsg.text}</p>
                   {chatMsg.role !== 'system' && chatMsg.timestamp && (
                    <p className="text-xs text-muted-foreground/70 mt-1 text-right">
                        {new Date(chatMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                   )}
                </div>
                 {chatMsg.role === 'user' && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-muted text-muted-foreground">
                    <User size={18} />
                  </span>
                )}
              </div>
            ))}
             {isLoadingOverall && localChatHistory.length === 0 && (
                <div className="flex items-center justify-center space-x-2 mt-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="text-muted-foreground">Preparing interview...</p>
                </div>
            )}
             {status === 'listening' && !showTextInput && (
                 <div className="flex items-center justify-center space-x-2 mt-4">
                    <Mic className="h-5 w-5 text-green-500 animate-pulse" />
                    <p className="text-muted-foreground">Listening...</p>
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
            disabled={isLoadingOverall || !hasMicPermission || showTextInput}
            onClick={requestMicPermissionAndStart} // This button can try to (re)start listening/session
            aria-label={status === 'listening' ? "Listening..." : "Start/Enable Voice Chat"}
            className="self-end mb-[1px]"
          >
            <Mic className={cn("h-5 w-5", status === 'listening' && "text-green-500", isSpeaking && "text-blue-500")} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={isLoadingOverall}
            onClick={handleToggleTextInput}
            aria-label={showTextInput ? "Switch to voice input" : "Switch to text input"}
            className="self-end mb-[1px]"
          >
            <Keyboard className="h-5 w-5" />
          </Button>

          {showTextInput ? (
            <>
              <Textarea
                ref={textareaRef}
                id="interview-message"
                placeholder={
                    !elevenLabsApiKey ? "API Key missing..." : 
                    isConnecting ? "Connecting..." : 
                    status !== 'connected' ? "Not connected to agent." : 
                    "Type your message here..."
                }
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={isLoadingOverall || status !== 'connected'}
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
                disabled={!textInput.trim() || isLoadingOverall || status !== 'connected'}
                size="icon"
                aria-label="Send message"
                className="self-end mb-[1px]"
              >
                { status === 'connected' && localChatHistory.length > 0 && localChatHistory[localChatHistory.length-1].role === 'user' && !isSpeaking ? 
                  <Loader2 className="h-5 w-5 animate-spin"/> : <Send className="h-5 w-5" />
                }
              </Button>
            </>
          ) : (
             <div className={cn(
                "flex-grow p-2 border rounded-md bg-muted/50 text-muted-foreground text-sm min-h-[40px] max-h-[150px] overflow-y-auto self-end mb-[1px] whitespace-pre-wrap flex items-center justify-center",
                (isSpeaking || status === 'listening' || isConnecting) ? "italic" : ""
             )}>
                {getCardDescription()}
             </div>
            )
           }
        </div>
        <Button
          onClick={handleFinish}
          disabled={disabled || isConnecting} // isConnecting includes initial connection attempt
          variant="default"
          className={`ml-4 self-end mb-[1px] ${!showTextInput ? 'flex-grow sm:flex-grow-0' : ''}`}
        >
          Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
        </Button>
      </CardFooter>
    </Card>
  );
});

InterviewInput.displayName = "InterviewInput";


    