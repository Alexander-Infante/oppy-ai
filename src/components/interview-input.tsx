
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
import { useConversation, type ChatMessage as SDKChatMessage, ElevenLabsContextProvider } from '@elevenlabs/react';

const USER_AGENT_ID = 'agent_01jwwh679kegrbsv4mmgy96tfe';

export interface InterviewInputHandle {
  // Methods exposed via ref, if any
}

interface InterviewInputProps {
  parsedData: ParseResumeOutput;
  onFinishInterview: (chatHistory: SDKChatMessage[]) => void;
  disabled?: boolean;
}

const InterviewInputContent = forwardRef<InterviewInputHandle, InterviewInputProps>(({
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

  const {
    chatHistory,
    sendUserInput,
    startRecording,
    stopRecording,
    isRecording,
    isLoading, 
    error: sdkError, 
    isSpeaking, 
    isPlaying,  
  } = useConversation({
    agentId: USER_AGENT_ID,
    apiKey: elevenLabsApiKey,
  });

  const [textInput, setTextInput] = useState<string>('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasMicPermission, setHasMicPermission] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const requestMicPermission = useCallback(async () => {
    if (hasMicPermission) return true;
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      if (isMountedRef.current) setHasMicPermission(true);
      console.log("InterviewInput: Microphone permission granted.");
      return true;
    } catch (err) {
      console.error("InterviewInput: Error requesting microphone permission:", err);
      if (isMountedRef.current) {
        setLocalError("Microphone permission denied. Please enable it in your browser settings.");
        toast({ title: "Microphone Access Denied", description: "Please enable microphone permissions to use voice chat.", variant: "destructive" });
        setHasMicPermission(false);
      }
      return false;
    }
  }, [hasMicPermission, toast]);

  useEffect(() => {
    if (!hasMicPermission) {
        requestMicPermission();
    }
  }, [requestMicPermission, hasMicPermission]);

   useEffect(() => {
    if (elevenLabsApiKey && parsedData && chatHistory.length === 0 && !initialContextSentRef.current && !isLoading && hasMicPermission) {
      const resumeContext = `
        System: Initialize conversation with the following resume context. Ask an opening question based on this.
        Skills: ${parsedData.skills?.join(', ') || 'Not specified'}
        Work Experience:
        ${parsedData.experience?.map(exp => `- Title: ${exp.title} at ${exp.company} (${exp.dates}). Description: ${exp.description}`).join('\n') || 'Not specified'}
        Education:
        ${parsedData.education?.map(edu => `- Degree: ${edu.degree} from ${edu.institution} (${edu.dates}`).join('\n') || 'Not specified'}
      `;
      console.log("InterviewInput: Sending initial resume context to agent via useConversation.");
      sendUserInput(resumeContext, true); 
      initialContextSentRef.current = true;
    }
  }, [elevenLabsApiKey, parsedData, chatHistory, sendUserInput, isLoading, hasMicPermission]);


  const handleMicClick = async () => {
    if (disabled || isLoading || isPlaying || isSpeaking) return;
    if (showTextInput) setShowTextInput(false);

    const permissionGranted = await requestMicPermission();
    if (!permissionGranted) return;

    if (isRecording) {
      console.log("InterviewInput: Stopping recording via SDK.");
      stopRecording();
    } else {
      console.log("InterviewInput: Starting recording via SDK.");
      startRecording();
    }
  };

  const handleSendText = () => {
    if (disabled || isLoading || !textInput.trim() || isPlaying || isSpeaking) return;
    console.log("InterviewInput: Sending text input via SDK:", textInput);
    sendUserInput(textInput);
    if (isMountedRef.current) setTextInput('');
  };
  
  const handleToggleTextInput = async () => {
    if (disabled || isLoading || isPlaying || isSpeaking) return;
    const newShowTextInput = !showTextInput;
    setShowTextInput(newShowTextInput);
    if (isRecording && newShowTextInput) { 
      console.log("InterviewInput: Switching to text input, stopping active recording.");
      stopRecording();
    }
    if (!newShowTextInput && !hasMicPermission) { 
        await requestMicPermission();
    }
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollableViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [chatHistory]);

  useEffect(() => {
    if (textareaRef.current && showTextInput) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [textInput, showTextInput]);

  useEffect(() => {
    if (sdkError && isMountedRef.current) {
        const errorMessage = (sdkError as Error)?.message || "An unknown error occurred with the AI SDK.";
        setLocalError(`SDK Error: ${errorMessage}`);
        toast({ title: "AI SDK Error", description: errorMessage, variant: "destructive" });
    } else if (!sdkError && localError?.startsWith("SDK Error:")) {
        setLocalError(null); 
    }
  }, [sdkError, toast, localError]);

  const getCardDescription = () => {
    if (!elevenLabsApiKey) return "Interview disabled: ElevenLabs API Key missing.";
    if (isLoading && chatHistory.length === 0 && !initialContextSentRef.current) return "Initializing AI Interviewer...";
    if (isLoading) return "AI is processing...";
    if (localError) return `Error: ${localError.substring(0,100)}...`;
    if (isRecording) return "Listening...";
    if (isSpeaking || isPlaying) return "AI is speaking...";
    if (showTextInput) return "Type your response or switch to voice chat.";
    return "Click the mic for voice chat or keyboard to type.";
  };

  const handleFinish = () => {
    console.log("InterviewInput: Finish Interview clicked.");
    if (isRecording) {
      stopRecording();
    }
    onFinishInterview(chatHistory); 
  };

  const displayedMessages = chatHistory.map((msg, index) => ({
    id: msg.id || `msg-${index}-${new Date().getTime()}`, 
    role: msg.role,
    text: msg.text, 
    timestamp: msg.timestamp || new Date(), 
    audio: msg.audio, 
    isPlaying: isPlaying && chatHistory[chatHistory.length -1]?.id === msg.id 
  }));

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
        {localError && (
             <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{localError}</AlertDescription>
            </Alert>
        )}
        {!elevenLabsApiKey && (
            <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Configuration Error</AlertTitle>
                <AlertDescription>NEXT_PUBLIC_ELEVENLABS_API_KEY is not set.</AlertDescription>
            </Alert>
        )}
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden p-0">
        <ScrollArea className="h-full p-4 sm:p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {displayedMessages.map((chatMsg) => (
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
                  <p className="text-sm whitespace-pre-wrap">{chatMsg.text || (chatMsg.role === 'assistant' && isLoading ? '...' : '')}</p>
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
             {isLoading && chatHistory.length > 0 && chatHistory[chatHistory.length-1].role !== 'assistant' && ( 
                <div className="flex items-center justify-center space-x-2 mt-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="text-muted-foreground">AI is thinking...</p>
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
            disabled={disabled || isLoading || !hasMicPermission || !elevenLabsApiKey || isPlaying || isSpeaking}
            onClick={handleMicClick}
            aria-label={isRecording ? "Stop Voice Chat" : "Start Voice Chat"}
            className="self-end mb-[1px]"
          >
            {isRecording ? <StopCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={disabled || isLoading || !elevenLabsApiKey || isPlaying || isSpeaking || isRecording}
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
                placeholder={!elevenLabsApiKey ? "API Key missing..." : isLoading ? "AI processing..." : "Type your message here..."}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={disabled || isLoading || !elevenLabsApiKey || isRecording || isPlaying || isSpeaking}
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
                disabled={!textInput.trim() || disabled || isLoading || !elevenLabsApiKey || isRecording || isPlaying || isSpeaking}
                size="icon"
                aria-label="Send message"
                className="self-end mb-[1px]"
              >
                {isLoading && textInput.trim() ? ( 
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </>
          ) : (
             <div className={cn(
                "flex-grow p-2 border rounded-md bg-muted/50 text-muted-foreground text-sm min-h-[40px] max-h-[150px] overflow-y-auto self-end mb-[1px] whitespace-pre-wrap flex items-center justify-center",
                (isRecording || isPlaying || isSpeaking || isLoading) ? "italic" : ""
             )}>
                {!elevenLabsApiKey ? "API Key missing..." : isRecording ? "Listening..." : (isPlaying || isSpeaking) ? "AI Speaking..." : isLoading ? "AI Processing..." : (hasMicPermission ? "Mic ready. Click mic or keyboard." : "Grant mic permission.")}
             </div>
            )
           }
        </div>
        <Button
          onClick={handleFinish}
          disabled={disabled || (isLoading && chatHistory.length === 0)} 
          variant="default"
          className={`ml-4 self-end mb-[1px] ${!showTextInput ? 'flex-grow sm:flex-grow-0' : ''}`}
        >
          Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
        </Button>
      </CardFooter>
    </Card>
  );
});

InterviewInputContent.displayName = "InterviewInputContent";

export const InterviewInput = forwardRef<InterviewInputHandle, InterviewInputProps>((props, ref) => {
  const elevenLabsApiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
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
              Please set it in your <code>.env.local</code> file and restart the development server.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
   return (
     <ElevenLabsContextProvider apiKey={elevenLabsApiKey}>
       <InterviewInputContent {...props} ref={ref} />
     </ElevenLabsContextProvider>
   );
});
InterviewInput.displayName = "InterviewInput";

