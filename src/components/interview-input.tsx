"use client";

import type { ParseResumeOutput } from '@/ai/flows/parse-resume';
import React, { useState, useRef, useEffect, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Mic, Sparkles, User, Bot, ChevronRight, AlertTriangle, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useConversation } from '@elevenlabs/react';

const USER_AGENT_ID = 'agent_01jwwh679kegrbsv4mmgy96tfe';

export interface InterviewInputHandle {
  // Methods exposed via ref, if any
}

interface InterviewInputProps {
  parsedData: ParseResumeOutput;
  onFinishInterview: (chatHistory: LocalChatMessage[]) => void;
  disabled?: boolean;
}

interface LocalChatMessage {
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
  const { toast } = useToast();
  const isMountedRef = useRef(false);
  
  const elevenLabsApiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

  const [localChatHistory, setLocalChatHistory] = useState<LocalChatMessage[]>([]);
  const [sessionStarted, setSessionStarted] = useState(false);

  // Always call useConversation - no conditional hooks
  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to ElevenLabs");
      setSessionStarted(true);
      setLocalChatHistory(prev => [...prev, {
        id: `sys-connected-${Date.now()}`,
        role: 'system',
        text: "🎤 Connected to AI Interviewer. Please speak clearly into your microphone.",
        timestamp: new Date()
      }]);
      toast({ title: "Connected!", description: "AI Interviewer is ready. Start speaking!" });
    },
    onDisconnect: () => {
      console.log("Disconnected from ElevenLabs");
      setSessionStarted(false);
      setLocalChatHistory(prev => [...prev, {
        id: `sys-disconnected-${Date.now()}`,
        role: 'system',
        text: "Disconnected from AI Interviewer.",
        timestamp: new Date()
      }]);
    },
    onMessage: (message: any) => {
      console.log("Message received:", message);
      
      // Handle the message format from ElevenLabs
      const messageText = message.message || message.text || '';
      const messageSource = message.source || 'unknown';
      
      if (messageText) {
        const newMessage: LocalChatMessage = {
          id: `msg-${messageSource}-${Date.now()}-${Math.random()}`,
          role: messageSource === 'ai' ? 'assistant' : 'user',
          text: messageText,
          timestamp: new Date()
        };
        setLocalChatHistory(prev => [...prev, newMessage]);
      }
    },
    onError: (error: string) => {
      console.error("ElevenLabs error:", error);
      setLocalChatHistory(prev => [...prev, {
        id: `sys-error-${Date.now()}`,
        role: 'system',
        text: `❌ Error: ${error}`,
        timestamp: new Date()
      }]);
      toast({ 
        title: "Connection Error", 
        description: error, 
        variant: "destructive" 
      });
    }
  });

  useEffect(() => {
    isMountedRef.current = true;
    
    // Add initial resume context message
    if (parsedData) {
      setLocalChatHistory([{
        id: `sys-welcome-${Date.now()}`,
        role: 'system',
        text: "Welcome! I'll be conducting your interview based on your resume. Click 'Start Interview' when you're ready to begin.",
        timestamp: new Date()
      }]);
    }

    return () => {
      isMountedRef.current = false;
      if (sessionStarted) {
        conversation.endSession();
      }
    };
  }, [parsedData]); // Only depend on parsedData for the initial setup

  const startSession = async () => {
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setLocalChatHistory(prev => [...prev, {
        id: `sys-starting-${Date.now()}`,
        role: 'system',
        text: "🔄 Starting interview session...",
        timestamp: new Date()
      }]);

      await conversation.startSession({
        agentId: USER_AGENT_ID
      });
    } catch (error: any) {
      console.error("Failed to start session:", error);
      setLocalChatHistory(prev => [...prev, {
        id: `sys-error-start-${Date.now()}`,
        role: 'system',
        text: `❌ Failed to start: ${error.message}. Please ensure microphone access is granted.`,
        timestamp: new Date()
      }]);
      toast({
        title: "Failed to start session",
        description: error.message || "Please check microphone permissions",
        variant: "destructive"
      });
    }
  };

  const endSession = async () => {
    try {
      await conversation.endSession();
      setLocalChatHistory(prev => [...prev, {
        id: `sys-ending-${Date.now()}`,
        role: 'system',
        text: "🔚 Interview session ended.",
        timestamp: new Date()
      }]);
    } catch (error: any) {
      console.error("Failed to end session:", error);
    }
  };

  const handleFinish = () => {
    if (sessionStarted) {
      endSession();
    }
    onFinishInterview(localChatHistory);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollableViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [localChatHistory]);

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
              Please add it to your .env.local file.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const getStatusMessage = () => {
    if (conversation.status === 'connecting') return "🔄 Connecting to AI Interviewer...";
    if (conversation.status === 'connected') {
      if (conversation.isSpeaking) return "🎤 AI is speaking - please listen";
      return "👂 AI is listening - please speak";
    }
    return "Click 'Start Interview' to begin your voice conversation";
  };

  return (
    <Card className="w-full max-w-2xl shadow-xl flex flex-col h-[70vh] sm:h-[600px]">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <Sparkles className="mr-2 h-6 w-6 text-primary" />
          AI Interview Chat
        </CardTitle>
        <CardDescription>
          {getStatusMessage()}
        </CardDescription>
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
                
                <div
                  className={cn(
                    "p-3 rounded-lg max-w-[75%]",
                    chatMsg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-none'
                      : chatMsg.role === 'assistant'
                        ? 'bg-gray-100 text-gray-900 rounded-bl-none' 
                        : 'bg-amber-50 text-amber-800 text-sm border border-amber-200 rounded text-center w-full'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{chatMsg.text}</p>
                  {chatMsg.role !== 'system' && (
                    <p className="text-xs opacity-70 mt-1 text-right">
                      {new Date(chatMsg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                
                {chatMsg.role === 'user' && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white">
                    <User size={18} />
                  </span>
                )}
              </div>
            ))}
            
            {conversation.status === 'connecting' && (
              <div className="flex items-center justify-center space-x-2 mt-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-muted-foreground">Connecting to AI Interviewer...</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      
      <CardFooter className="p-4 sm:p-6 border-t">
        <div className="flex w-full items-center space-x-4">
          {!sessionStarted ? (
            <Button 
              onClick={startSession} 
              disabled={disabled || conversation.status === 'connecting'}
              className="w-full"
              size="lg"
            >
              {conversation.status === 'connecting' ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-5 w-5" />
                  Start Interview
                </>
              )}
            </Button>
          ) : (
            <>
              <div className="flex-grow flex items-center justify-center space-x-3 p-4 bg-muted/30 rounded-lg">
                {conversation.isSpeaking ? (
                  <>
                    <Bot className="h-5 w-5 text-green-500 animate-pulse" />
                    <span className="text-sm font-medium">AI is speaking...</span>
                  </>
                ) : (
                  <>
                    <Mic className={cn(
                      "h-5 w-5 animate-pulse",
                      conversation.status === 'connected' ? "text-blue-500" : "text-gray-400"
                    )} />
                    <span className="text-sm font-medium">
                      {conversation.status === 'connected' ? "Listening for your voice..." : "Microphone inactive"}
                    </span>
                  </>
                )}
              </div>

              <Button
                onClick={endSession}
                disabled={disabled}
                variant="outline"
                size="lg"
              >
                <MicOff className="mr-2 h-4 w-4" />
                Stop
              </Button>

              <Button
                onClick={handleFinish}
                disabled={disabled}
                variant="default"
                size="lg"
              >
                Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
              </Button>
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  );
});

InterviewInput.displayName = "InterviewInput";