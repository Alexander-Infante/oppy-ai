
"use client";

import type { ParseResumeOutput } from '@/ai/flows/parse-resume';
import type { ChatMessage as GenkitChatMessage } from '@/ai/flows/conduct-interview-flow'; // For Genkit flow
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Mic, StopCircle, Sparkles, User, Bot, ChevronRight } from 'lucide-react'; // Added Mic, StopCircle, User, Bot
import { cn } from '@/lib/utils';

// UI-specific chat message type
export interface UIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface InterviewInputProps {
  parsedData: ParseResumeOutput; // Keep this for context if needed, though flow uses it
  chatHistory: UIChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  onFinishInterview: () => void;
  disabled?: boolean; // General disable for the component
  isSendingMessage: boolean; // Specific loading state for sending a message
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

  const handleSend = async () => {
    if (!currentMessage.trim() || disabled || isSendingMessage) return;
    await onSendMessage(currentMessage);
    setCurrentMessage('');
  };

  useEffect(() => {
    // Auto-scroll to bottom of chat messages
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
          Chat with our AI to clarify resume points and gather insights. 
          This conversation will help tailor your resume rewrite.
          {/* TODO: Add actual voice input/output controls here */}
        </CardDescription>
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
          {/* Placeholder for STT button */}
          <Button variant="outline" size="icon" disabled={disabled || isSendingMessage} aria-label="Start voice input (simulated)">
            <Mic className="h-5 w-5" />
          </Button>
          <Textarea
            id="interview-message"
            placeholder="Type your response here..."
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            rows={1}
            disabled={disabled || isSendingMessage}
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
            disabled={!currentMessage.trim() || disabled || isSendingMessage}
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
          disabled={disabled || isSendingMessage} 
          variant="default"
          className="ml-4"
        >
          Finish Interview <ChevronRight className="ml-1 h-4 w-4"/>
        </Button>
      </CardFooter>
    </Card>
  );
}
