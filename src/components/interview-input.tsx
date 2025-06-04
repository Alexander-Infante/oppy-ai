
"use client";

import type { ParseResumeOutput } from '@/ai/flows/parse-resume';
import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Mic, StopCircle, Sparkles, User, Bot, ChevronRight, AlertTriangle, Keyboard, Zap, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface UIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  audioUrl?: string;
  isPlaying?: boolean;
}

const USER_AGENT_ID = 'agent_01jwwh679kegrbsv4mmgy96tfe'; // User's provided agent ID

export interface InterviewInputHandle {
  // Methods exposed via ref, if any, can be defined here.
  // For now, most interaction will be internal or via props.
}

interface InterviewInputProps {
  parsedData: ParseResumeOutput;
  onFinishInterview: (chatHistory: UIChatMessage[]) => void;
  disabled?: boolean; // General disable flag
}

const BOS_MESSAGE = JSON.stringify({ type: "user_input_start" });
const EOS_MESSAGE = JSON.stringify({ type: "user_input_end" });

export const InterviewInput = forwardRef<InterviewInputHandle, InterviewInputProps>(({
  parsedData,
  onFinishInterview,
  disabled,
}, ref) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { toast } = useToast();
  const isMountedRef = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<UIChatMessage[]>([]);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [textInput, setTextInput] = useState<string>('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [currentAssistantMessageId, setCurrentAssistantMessageId] = useState<string | null>(null);
  const [currentPlayingAudioId, setCurrentPlayingAudioId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const elevenLabsApiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (socket) {
        socket.close();
      }
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
      }
    };
  }, [socket, mediaRecorder]);

  const addMessageToHistory = useCallback((message: Omit<UIChatMessage, 'id' | 'timestamp'>) => {
    if (!isMountedRef.current) return;
    const newMessage = { ...message, id: crypto.randomUUID(), timestamp: new Date() } as UIChatMessage;
    setChatHistory(prev => [...prev, newMessage]);
    if (message.role === 'assistant' && !message.audioUrl) { // If AI text comes without immediate audio
      setCurrentAssistantMessageId(newMessage.id);
    }
    return newMessage.id;
  }, []);
  
  const updateAssistantMessageContent = useCallback((id: string, contentChunk: string) => {
    if (!isMountedRef.current) return;
    setChatHistory(prev => prev.map(msg => 
      msg.id === id && msg.role === 'assistant' 
        ? { ...msg, content: msg.content + contentChunk } 
        : msg
    ));
  }, []);

  const playAudio = useCallback((audioBase64: string, messageIdToPlay?: string) => {
    if (!isMountedRef.current || !audioBase64) return;
    
    try {
      const byteCharacters = atob(audioBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const audioBlob = new Blob([byteArray], { type: 'audio/mpeg' }); // Assuming MP3 from ElevenLabs WebSocket
      const audioUrl = URL.createObjectURL(audioBlob);

      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio();
      }
      
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = audioUrl;
      
      const activeMessageId = messageIdToPlay || currentAssistantMessageId;

      if(activeMessageId) {
        setChatHistory(prev => prev.map(msg => msg.id === activeMessageId ? { ...msg, audioUrl, isPlaying: true } : {...msg, isPlaying: false}));
        setCurrentPlayingAudioId(activeMessageId);
      }
      
      audioPlayerRef.current.play().catch(e => {
        console.error("Error playing audio:", e);
        toast({ title: "Audio Playback Error", description: "Could not play AI response.", variant: "destructive" });
        if(activeMessageId) {
          setChatHistory(prev => prev.map(msg => msg.id === activeMessageId ? { ...msg, isPlaying: false } : msg));
          setCurrentPlayingAudioId(null);
        }
      });

      audioPlayerRef.current.onended = () => {
        if (!isMountedRef.current) return;
        if(activeMessageId) {
          setChatHistory(prev => prev.map(msg => msg.id === activeMessageId ? { ...msg, isPlaying: false } : msg));
        }
        setCurrentPlayingAudioId(null);
        URL.revokeObjectURL(audioUrl); // Clean up blob URL
      };
      audioPlayerRef.current.onerror = () => {
        if (!isMountedRef.current) return;
         toast({ title: "Audio Playback Error", description: "Error during audio playback.", variant: "destructive" });
        if(activeMessageId) {
          setChatHistory(prev => prev.map(msg => msg.id === activeMessageId ? { ...msg, isPlaying: false } : msg));
        }
        setCurrentPlayingAudioId(null);
        URL.revokeObjectURL(audioUrl);
      };

    } catch (error) {
        console.error("Error processing audio for playback:", error);
        toast({ title: "Audio Processing Error", description: "Could not process AI audio.", variant: "destructive" });
    }
  }, [toast, currentAssistantMessageId]);


  const connectWebSocket = useCallback(() => {
    if (!elevenLabsApiKey) {
      setApiError("ElevenLabs API Key is not configured.");
      toast({ title: "API Key Missing", description: "ElevenLabs API Key is not configured.", variant: "destructive" });
      return;
    }
    if (socket && socket.readyState === WebSocket.OPEN) return;

    setIsConnecting(true);
    setApiError(null);
    addMessageToHistory({role: 'system', content: "Connecting to AI Interviewer..."});

    const wsUrl = `wss://api.elevenlabs.io/v1/ws-connect?agent_id=${USER_AGENT_ID}&authorization=${elevenLabsApiKey}`;
    const newSocket = new WebSocket(wsUrl);

    newSocket.onopen = () => {
      if (!isMountedRef.current) return;
      setIsConnecting(false);
      setIsConnected(true);
      toast({ title: "Connected!", description: "AI Interviewer is ready." });
      addMessageToHistory({role: 'system', content: "Connected to AI Interviewer. You can start by speaking or typing."});
      
      const resumeContext = `
        Here is the candidate's resume information:
        Skills: ${parsedData.skills?.join(', ') || 'Not specified'}
        Work Experience:
        ${parsedData.experience?.map(exp => `- Title: ${exp.title} at ${exp.company} (${exp.dates}). Description: ${exp.description}`).join('\n') || 'Not specified'}
        Education:
        ${parsedData.education?.map(edu => `- Degree: ${edu.degree} from ${edu.institution} (${edu.dates}`).join('\n') || 'Not specified'}
        Please start the interview by asking an opening question based on this resume.
      `;
      newSocket.send(JSON.stringify({ type: "text_input", text: resumeContext }));
      setCurrentAssistantMessageId(addMessageToHistory({role: 'assistant', content: ""})); // Prepare for AI's first response
    };

    newSocket.onmessage = (event) => {
      if (!isMountedRef.current) return;
      const data = JSON.parse(event.data as string);

      switch (data.type) {
        case 'user_audio_transcribed':
          addMessageToHistory({ role: 'user', content: data.text });
          break;
        case 'ai_response':
          if(data.text_delta) { // streaming text
            if(currentAssistantMessageId) {
              updateAssistantMessageContent(currentAssistantMessageId, data.text_delta)
            } else { // If no current message ID, start a new one
              setCurrentAssistantMessageId(addMessageToHistory({role: 'assistant', content: data.text_delta}));
            }
          }
          if (data.audio_delta) { // streaming audio
             playAudio(data.audio_delta, currentAssistantMessageId);
          }
          if(data.is_finished) {
             setCurrentAssistantMessageId(null); // Reset for next AI turn
          }
          break;
        case 'error':
          console.error("WebSocket API Error:", data.message);
          setApiError(`WebSocket Error: ${data.message}`);
          addMessageToHistory({role: 'system', content: `Error: ${data.message}`});
          toast({ title: "AI Error", description: data.message, variant: "destructive" });
          break;
        default:
          console.log("WebSocket message:", data);
      }
    };

    newSocket.onerror = (error) => {
      if (!isMountedRef.current) return;
      console.error("WebSocket Error:", error);
      setIsConnecting(false);
      setIsConnected(false);
      setApiError("WebSocket connection error. Please try again.");
      addMessageToHistory({role: 'system', content: "WebSocket connection error."});
      toast({ title: "Connection Error", description: "Failed to connect to AI Interviewer.", variant: "destructive" });
    };

    newSocket.onclose = (event) => {
      if (!isMountedRef.current) return;
      setIsConnecting(false);
      setIsConnected(false);
      if (event.wasClean) {
        addMessageToHistory({role: 'system', content: "Disconnected from AI Interviewer."});
      } else {
        setApiError("Connection lost. Please check your internet or try reconnecting.");
        addMessageToHistory({role: 'system', content: "Connection lost unexpectedly."});
        toast({ title: "Disconnected", description: "Connection to AI Interviewer lost.", variant: "warning" });
      }
    };
    setSocket(newSocket);
  }, [elevenLabsApiKey, parsedData, socket, toast, addMessageToHistory, playAudio, updateAssistantMessageContent, currentAssistantMessageId]);

  useEffect(() => {
    if (elevenLabsApiKey && parsedData && !socket && !isConnected && !isConnecting) {
      connectWebSocket();
    }
  }, [elevenLabsApiKey, parsedData, socket, isConnected, isConnecting, connectWebSocket]);


  const handleMicClick = async () => {
    if (!isConnected || !socket) {
      toast({ variant: 'destructive', title: 'Not Connected', description: 'Please connect to the AI interviewer first.' });
      return;
    }
    if (showTextInput) setShowTextInput(false);

    if (isRecording && mediaRecorder) {
      mediaRecorder.stop();
      // EOS_MESSAGE will be sent in mediaRecorder.onstop
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
        setMediaRecorder(newMediaRecorder);
        
        socket.send(BOS_MESSAGE); // Signal start of user audio input

        newMediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket && socket.readyState === WebSocket.OPEN) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64Audio = (reader.result as string).split(',')[1];
              socket.send(JSON.stringify({ type: "audio_chunk", data: base64Audio }));
            };
            reader.readAsDataURL(event.data);
          }
        };

        newMediaRecorder.onstop = () => {
          if (isMountedRef.current) setIsRecording(false);
          stream.getTracks().forEach(track => track.stop()); // Release microphone
          if (socket && socket.readyState === WebSocket.OPEN) {
             socket.send(EOS_MESSAGE); // Signal end of user audio input
          }
          setCurrentAssistantMessageId(addMessageToHistory({role: 'assistant', content: ""})); // Prepare for AI response
        };
        
        newMediaRecorder.start(500); // Collect audio in 500ms chunks
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        toast({ title: "Microphone Error", description: "Could not access microphone.", variant: "destructive" });
      }
    }
  };

  const handleSendText = () => {
    if (!isConnected || !socket || !textInput.trim()) return;
    socket.send(JSON.stringify({ type: "text_input", text: textInput }));
    addMessageToHistory({ role: 'user', content: textInput });
    setCurrentAssistantMessageId(addMessageToHistory({role: 'assistant', content: ""})); // Prepare for AI response
    if (isMountedRef.current) setTextInput('');
  };
  
  const handleToggleTextInput = () => {
    setShowTextInput(prev => !prev);
    if (isRecording && mediaRecorder && !showTextInput) { // if switching to text while recording
      mediaRecorder.stop();
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

  const getCardDescription = () => {
    if (!elevenLabsApiKey) return "ElevenLabs API Key missing. Voice Chat unavailable.";
    if (isConnecting) return "Connecting to AI Interviewer...";
    if (!isConnected) return "Disconnected. Attempting to reconnect or check API key.";
    if (isRecording) return "Listening...";
    if (currentPlayingAudioId) return "AI is speaking...";
    if (showTextInput) return "Type your response or switch to voice chat.";
    return "Click the mic for voice chat or keyboard to type.";
  };

  const handleFinish = () => {
    if (socket) {
      socket.close();
      setSocket(null);
    }
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    setIsConnected(false);
    onFinishInterview(chatHistory);
  };

  return (
    <Card className="w-full max-w-2xl shadow-xl flex flex-col h-[70vh] sm:h-[600px]">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <Sparkles className="mr-2 h-6 w-6 text-primary" />
          AI Interview Chat (WebSocket)
        </CardTitle>
        <CardDescription>
         {getCardDescription()}
        </CardDescription>
        {apiError && (
             <Alert variant="destructive" className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{apiError}</AlertDescription>
            </Alert>
        )}
        {!isConnected && !isConnecting && elevenLabsApiKey && (
          <Button onClick={connectWebSocket} variant="outline" className="mt-2">
            <Zap className="mr-2 h-4 w-4" /> Reconnect
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden p-0">
        <ScrollArea className="h-full p-4 sm:p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {chatHistory.map((chatMsg) => (
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
                    <WifiOff size={18} />
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
                  <p className="text-sm whitespace-pre-wrap">{chatMsg.content || (chatMsg.role === 'assistant' ? '...' : '')}</p>
                   {chatMsg.role !== 'system' && (
                    <p className="text-xs text-muted-foreground/70 mt-1 text-right">
                        {chatMsg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
             {isConnecting && (
                <div className="flex items-center justify-center space-x-2 mt-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="text-muted-foreground">Connecting...</p>
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
            disabled={disabled || !isConnected || isConnecting || !!currentPlayingAudioId}
            onClick={handleMicClick}
            aria-label={isRecording ? "Stop Voice Chat" : "Start Voice Chat"}
            className="self-end mb-[1px]"
          >
            {isRecording ? <StopCircle className="h-5 w-5 text-destructive" /> : <Mic className="h-5 w-5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={disabled || !isConnected || isConnecting || isRecording || !!currentPlayingAudioId}
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
                placeholder={!isConnected ? "Connect to type..." : "Type your message here..."}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={disabled || !isConnected || isConnecting || isRecording || !!currentPlayingAudioId}
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
                disabled={!textInput.trim() || disabled || !isConnected || isConnecting || isRecording || !!currentPlayingAudioId}
                size="icon"
                aria-label="Send message"
                className="self-end mb-[1px]"
              >
                {isConnecting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </>
          ) : (
             <div className={cn(
                "flex-grow p-2 border rounded-md bg-muted/50 text-muted-foreground text-sm min-h-[40px] max-h-[150px] overflow-y-auto self-end mb-[1px] whitespace-pre-wrap flex items-center justify-center",
                (isRecording || !!currentPlayingAudioId) ? "italic" : ""
             )}>
                {isRecording ? "Listening..." : (!!currentPlayingAudioId ? "AI Speaking..." : (isConnected ? "Mic muted. Click mic or keyboard." : "Connect to use mic."))}
             </div>
            )
           }
        </div>
        <Button
          onClick={handleFinish}
          disabled={disabled || isConnecting}
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
