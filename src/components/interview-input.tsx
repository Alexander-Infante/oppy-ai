"use client";

import type { ParseResumeOutput } from "@/ai/flows/parse-resume";
import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useMemo,
  useCallback,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Mic,
  Sparkles,
  User,
  Bot,
  ChevronRight,
  AlertTriangle,
  MicOff,
  Play,
  Pause,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useConversation } from "@elevenlabs/react";

const AGENT_ID =
  process.env.NEXT_PUBLIC_AGENT_ID || "agent_01jwwh679kegrbsv4mmgy96tfe";

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
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
}

export const InterviewInput = forwardRef<
  InterviewInputHandle,
  InterviewInputProps
>(({ parsedData, onFinishInterview, disabled }, ref) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const isMountedRef = useRef(false);
  const welcomeMessageAddedRef = useRef(false);
  const isStartingRef = useRef(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [localChatHistory, setLocalChatHistory] = useState<LocalChatMessage[]>(
    []
  );
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<
    "new" | "paused" | "resumed" | "completed"
  >("new");
  const [showInactivityPrompt, setShowInactivityPrompt] = useState(false);
  const [showFinishButton, setShowFinishButton] = useState(false);
  const [lastActivity, setLastActivity] = useState<Date>(new Date());

  // Function to get signed URL from server
  const getSignedUrl = useCallback(async (): Promise<string> => {
    console.log("📡 Requesting signed URL from server...");

    const response = await fetch(`/api/get-signed-url?agent_id=${AGENT_ID}`);

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown server error" }));
      console.error("❌ Failed to get signed URL:", errorData);
      throw new Error(
        `Failed to get signed URL: ${errorData.error || response.statusText}`
      );
    }

    const data = await response.json();
    console.log("✅ Received signed URL from server");
    return data.signedUrl;
  }, []);

  // Generate conversation context from chat history
  const generateConversationContext = () => {
    const relevantMessages = localChatHistory
      .filter((msg) => msg.role !== "system")
      .slice(-8); // Last 8 messages for context

    if (relevantMessages.length === 0) {
      return "This is the beginning of our conversation.";
    }

    const contextSummary = relevantMessages
      .map(
        (msg) =>
          `${msg.role === "user" ? "User" : "Oppy"}: ${msg.text.substring(
            0,
            150
          )}${msg.text.length > 150 ? "..." : ""}`
      )
      .join("\n");

    return `Previous conversation context:\n${contextSummary}\n\nPlease continue naturally from where we left off.`;
  };

  // Generate conversation summary for resume rewrite
  const generateConversationSummary = () => {
    const userMessages = localChatHistory.filter((msg) => msg.role === "user");
    const assistantMessages = localChatHistory.filter(
      (msg) => msg.role === "assistant"
    );

    const keyTopics: string[] = [];
    const recommendations = [];
    const userResponses: string[] = [];

    // Extract key topics and recommendations from assistant messages
    assistantMessages.forEach((msg) => {
      const text = msg.text.toLowerCase();

      // Look for recommendations
      if (
        text.includes("recommend") ||
        text.includes("suggest") ||
        text.includes("should")
      ) {
        recommendations.push(msg.text.substring(0, 200));
      }

      // Look for key topics discussed
      if (
        text.includes("strength") ||
        text.includes("opportunity") ||
        text.includes("improve")
      ) {
        keyTopics.push(msg.text.substring(0, 200));
      }
    });

    // Extract user responses and goals
    userMessages.forEach((msg) => {
      userResponses.push(msg.text.substring(0, 200));
    });

    return {
      totalMessages: localChatHistory.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      keyTopics: keyTopics.slice(0, 3),
      recommendations: recommendations.slice(0, 3),
      userResponses: userResponses.slice(0, 3),
      conversationDuration:
        localChatHistory.length > 0
          ? Math.round(
              (new Date().getTime() -
                new Date(localChatHistory[0].timestamp).getTime()) /
                60000
            )
          : 0,
    };
  };

  // Reset inactivity timer
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    setLastActivity(new Date());
    setShowInactivityPrompt(false);

    // Set 120 second inactivity timer
    inactivityTimerRef.current = setTimeout(() => {
      if (sessionStarted && conversationState !== "completed") {
        console.log("Inactivity detected, suggesting to finish interview");
        setShowInactivityPrompt(true);
      }
    }, 120000); // 2 minutes of inactivity
  };

  // Memoize the context variables to prevent excessive re-calculation
  const contextVariables = useMemo(() => {
    console.log("=== PREPARING CONTEXT VARIABLES (MEMOIZED) ===");

    if (!parsedData) {
      console.log("No parsedData available, using fallbacks");
      return {
        candidate_skills: "various professional skills",
        candidate_experience_count: "0",
        candidate_experience_summary: "professional experience to be discussed",
        candidate_education_summary: "educational background to be discussed",
        conversation_context: "This is the beginning of our conversation.",
        conversation_state: conversationState,
        conversation_summary: JSON.stringify({ totalMessages: 0 }),
      };
    }

    // Extract skills
    const candidateSkills = (() => {
      if (Array.isArray(parsedData.skills) && parsedData.skills.length > 0) {
        return parsedData.skills.slice(0, 10).join(", ");
      } else if (
        typeof parsedData.skills === "string" &&
        parsedData.skills.length > 0
      ) {
        return parsedData.skills;
      } else {
        return "various professional skills";
      }
    })();

    // Extract experience
    const experienceArray = Array.isArray(parsedData.experience)
      ? parsedData.experience
      : [];
    const experienceCount = experienceArray.length;

    const experienceSummary =
      experienceArray.length > 0
        ? experienceArray
            .slice(0, 3)
            .map((exp) => {
              const title =
                exp?.title ||
                exp?.position ||
                exp?.jobTitle ||
                "Professional Role";
              const company =
                exp?.company ||
                exp?.employer ||
                exp?.organization ||
                "Previous Company";
              const duration = exp?.duration || exp?.period || exp?.years || "";

              return `${title} at ${company}${
                duration ? ` (${duration})` : ""
              }`;
            })
            .join("; ")
        : "professional experience to be discussed";

    // Extract education
    const educationArray = Array.isArray(parsedData.education)
      ? parsedData.education
      : [];

    const educationSummary =
      educationArray.length > 0
        ? educationArray
            .map((edu) => {
              const degree =
                edu?.degree || edu?.qualification || edu?.title || "Degree";
              const school =
                edu?.school || edu?.institution || edu?.university || "";
              const year =
                edu?.graduationYear || edu?.year || edu?.endDate || "";

              return `${degree}${school ? ` from ${school}` : ""}${
                year ? ` (${year})` : ""
              }`;
            })
            .join("; ")
        : "educational background to be discussed";

    // Generate conversation context and summary
    const conversationContext = generateConversationContext();
    const conversationSummary = generateConversationSummary();

    const variables = {
      candidate_skills: candidateSkills,
      candidate_experience_count: experienceCount.toString(),
      candidate_experience_summary: experienceSummary,
      candidate_education_summary: educationSummary,
      conversation_context: conversationContext,
      conversation_state: conversationState,
      conversation_summary: JSON.stringify(conversationSummary),
      session_number: (
        localChatHistory.filter(
          (msg) => msg.role === "system" && msg.text.includes("Starting")
        ).length + 1
      ).toString(),
      total_messages: localChatHistory.length.toString(),
      is_resuming:
        conversationState === "paused" || conversationState === "resumed"
          ? "true"
          : "false",
    };

    console.log("=== FINAL CONTEXT VARIABLES (MEMOIZED) ===");
    console.log(JSON.stringify(variables, null, 2));

    return variables;
  }, [parsedData, localChatHistory, conversationState]);

  // Auto-finish interview when inactivity is detected
  const handleAutoFinish = () => {
    setShowInactivityPrompt(false);
    handleFinish();

    toast({
      title: "Interview Completed",
      description: "Moving to resume rewrite based on our conversation.",
      duration: 3000,
    });
  };

  // Dismiss inactivity prompt
  const dismissInactivityPrompt = () => {
    setShowInactivityPrompt(false);
    resetInactivityTimer();
  };

  // Always call useConversation - no conditional hooks
  const conversation = useConversation({
    onConnect: () => {
      console.log("✅ Connected to ElevenLabs");
      if (!isMountedRef.current) return;

      setSessionStarted(true);
      setIsConnecting(false);
      isStartingRef.current = false;
      resetInactivityTimer();

      const connectMessage =
        conversationState === "new"
          ? "🎤 Connected to AI Interviewer. Please speak clearly into your microphone."
          : "🎤 Reconnected to AI Interviewer. Continuing from where we left off.";

      setLocalChatHistory((prev) => [
        ...prev,
        {
          id: `sys-connected-${Date.now()}`,
          role: "system",
          text: connectMessage,
          timestamp: new Date(),
        },
      ]);

      toast({
        title: conversationState === "new" ? "Connected!" : "Reconnected!",
        description:
          conversationState === "new"
            ? "AI Interviewer is ready. Start speaking!"
            : "Continuing your interview session.",
        duration: 3000,
      });
    },

    onDisconnect: () => {
      console.log("🔌 Disconnected from ElevenLabs");
      if (!isMountedRef.current) return;

      setSessionStarted(false);
      setIsConnecting(false);
      isStartingRef.current = false;
      setConversationId(null);

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      // Always show the finish button on disconnection
      setShowFinishButton(true);

      // Set conversation state based on whether it was completed or just disconnected
      if (conversationState !== "completed") {
        setConversationState("paused");
      }

      const disconnectMessage =
        conversationState === "completed"
          ? "Interview completed successfully."
          : "Interview disconnected. You can resume the conversation or finish to proceed with resume rewrite.";

      setLocalChatHistory((prev) => [
        ...prev,
        {
          id: `sys-disconnected-${Date.now()}`,
          role: "system",
          text: disconnectMessage,
          timestamp: new Date(),
        },
      ]);
    },

    onMessage: (message: any) => {
      console.log("📨 Message received:", message);
      if (!isMountedRef.current) return;

      resetInactivityTimer();

      // Handle different message formats from ElevenLabs
      let messageText = "";
      let messageSource = "unknown";

      if (typeof message === "string") {
        messageText = message;
        messageSource = "ai";
      } else if (message && typeof message === "object") {
        messageText = message.message || message.text || message.content || "";
        messageSource = message.source || message.type || "ai";
      }

      if (messageText && messageText.trim()) {
        const newMessage: LocalChatMessage = {
          id: `msg-${messageSource}-${Date.now()}-${Math.random()}`,
          role:
            messageSource === "user" || messageSource === "user_transcript"
              ? "user"
              : "assistant",
          text: messageText.trim(),
          timestamp: new Date(),
        };

        setLocalChatHistory((prev) => [...prev, newMessage]);
      }
    },

    onError: (error: any) => {
      console.error("❌ ElevenLabs error:", error);
      if (!isMountedRef.current) return;

      setIsConnecting(false);
      setSessionStarted(false);
      isStartingRef.current = false;

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      const errorMessage =
        typeof error === "string" ? error : error?.message || "Unknown error";

      setLocalChatHistory((prev) => [
        ...prev,
        {
          id: `sys-error-${Date.now()}`,
          role: "system",
          text: `❌ Error: ${errorMessage}`,
          timestamp: new Date(),
        },
      ]);

      toast({
        title: "Connection Error",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  // Mount effect - only runs once
  useEffect(() => {
    isMountedRef.current = true;

    // Add initial welcome message only once
    if (parsedData && !welcomeMessageAddedRef.current) {
      welcomeMessageAddedRef.current = true;
      setLocalChatHistory([
        {
          id: `sys-welcome-${Date.now()}`,
          role: "system",
          text: "Welcome! I'll be conducting your interview based on your resume. Click 'Start Interview' when you're ready to begin.",
          timestamp: new Date(),
        },
      ]);
    }

    return () => {
      console.log("🧹 Component unmounting, cleaning up...");
      isMountedRef.current = false;

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      // Cleanup on unmount - end session if active
      if (sessionStarted || conversation.status === "connected") {
        try {
          conversation.endSession();
        } catch (error) {
          console.error("Error ending session on unmount:", error);
        }
      }
    };
  }, []);

  const startSession = async () => {
    // Prevent multiple simultaneous starts
    if (isStartingRef.current || isConnecting || sessionStarted) {
      console.log("Already starting/connected, ignoring start request");
      return;
    }

    isStartingRef.current = true;

    try {
      setIsConnecting(true);
      setShowFinishButton(false); // Hide finish button when starting

      // Request microphone permission
      console.log("🎤 Requesting microphone permission...");
      await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      const startMessage =
        conversationState === "paused"
          ? "🔄 Resuming interview session..."
          : "🔄 Starting interview session...";

      setLocalChatHistory((prev) => [
        ...prev,
        {
          id: `sys-starting-${Date.now()}`,
          role: "system",
          text: startMessage,
          timestamp: new Date(),
        },
      ]);

      // Update conversation state
      if (conversationState === "paused") {
        setConversationState("resumed");
      }

      // Reset prompts
      setShowInactivityPrompt(false);

      // Get signed URL from server
      const signedUrl = await getSignedUrl();

      console.log("🚀 Starting session with signed URL and agent context");
      console.log("Context variables:", contextVariables);

      // Pass signed URL and dynamic variables
      const sessionConfig = {
        signedUrl,
        dynamicVariables: contextVariables,
      };

      console.log("Session config:", JSON.stringify(sessionConfig, null, 2));

      const convId = await conversation.startSession(sessionConfig as any);

      console.log("✅ Session started successfully with ID:", convId);
      setConversationId(convId);
    } catch (error: any) {
      console.error("❌ Failed to start session:", error);
      isStartingRef.current = false;
      setIsConnecting(false);

      let errorMessage = "Unknown error occurred";
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        errorMessage =
          "Microphone access denied. Please allow microphone access and try again.";
      } else if (error.name === "NotFoundError") {
        errorMessage =
          "No microphone found. Please ensure you have a microphone connected.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setLocalChatHistory((prev) => [
        ...prev,
        {
          id: `sys-error-start-${Date.now()}`,
          role: "system",
          text: `❌ Failed to start: ${errorMessage}`,
          timestamp: new Date(),
        },
      ]);

      toast({
        title: "Failed to start session",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const pauseSession = async () => {
    if (!sessionStarted && conversation.status !== "connected") {
      console.log("No active session to pause");
      return;
    }

    try {
      console.log("⏸️ Pausing session...");
      await conversation.endSession();

      setSessionStarted(false);
      setIsConnecting(false);
      isStartingRef.current = false;
      setConversationId(null);
      setConversationState("paused");

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      setLocalChatHistory((prev) => [
        ...prev,
        {
          id: `sys-pausing-${Date.now()}`,
          role: "system",
          text: "⏸️ Interview paused. Click 'Resume Interview' to continue.",
          timestamp: new Date(),
        },
      ]);

      toast({
        title: "Interview Paused",
        description: "You can resume anytime to continue where you left off.",
        duration: 3000,
      });
    } catch (error: any) {
      console.error("Failed to pause session:", error);
      // Force cleanup even if endSession fails
      setSessionStarted(false);
      setIsConnecting(false);
      isStartingRef.current = false;
      setConversationId(null);
      setConversationState("paused");
    }
  };

  const endSession = async () => {
    if (!sessionStarted && conversation.status !== "connected") {
      console.log("No active session to end");
      return;
    }

    try {
      console.log("🔚 Ending session...");
      setConversationState("completed");
      await conversation.endSession();

      setSessionStarted(false);
      setIsConnecting(false);
      isStartingRef.current = false;
      setConversationId(null);

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      setLocalChatHistory((prev) => [
        ...prev,
        {
          id: `sys-ending-${Date.now()}`,
          role: "system",
          text: "🔚 Interview session completed. Preparing resume rewrite...",
          timestamp: new Date(),
        },
      ]);
    } catch (error: any) {
      console.error("Failed to end session:", error);
      // Force cleanup even if endSession fails
      setSessionStarted(false);
      setIsConnecting(false);
      isStartingRef.current = false;
      setConversationId(null);
      setConversationState("completed");
    }
  };

  const handleFinish = () => {
    // End active session if still connected
    if (sessionStarted || conversation.status === "connected") {
      endSession();
    }

    // Mark as completed and hide finish button
    setConversationState("completed");
    setShowFinishButton(false);

    // Pass enhanced chat history with conversation summary
    const enhancedChatHistory = [
      ...localChatHistory,
      {
        id: `summary-${Date.now()}`,
        role: "system" as const,
        text: `Conversation Summary: ${JSON.stringify(
          generateConversationSummary(),
          null,
          2
        )}`,
        timestamp: new Date(),
      },
    ];

    onFinishInterview(enhancedChatHistory);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollableViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollableViewport) {
        scrollableViewport.scrollTop = scrollableViewport.scrollHeight;
      }
    }
  }, [localChatHistory]);

  const getStatusMessage = () => {
    if (isConnecting) {
      return conversationState === "paused"
        ? "🔄 Reconnecting to AI Interviewer..."
        : "🔄 Connecting to AI Interviewer...";
    }
    if (conversation.status === "connected" && sessionStarted) {
      if (conversation.isSpeaking) return "🎤 AI is speaking - please listen";
      return "👂 AI is listening - please speak";
    }
    if (conversationState === "paused") {
      return "⏸️ Interview paused - Click 'Resume Interview' to continue";
    }
    return "Click 'Start Interview' to begin your voice conversation";
  };

  const getButtonText = () => {
    if (conversationState === "paused") {
      return "Resume Interview";
    }
    return "Start Interview";
  };

  const getButtonIcon = () => {
    if (conversationState === "paused") {
      return <Play className="mr-2 h-5 w-5" />;
    }
    return <Mic className="mr-2 h-5 w-5" />;
  };

  // Simplified resume preview that doesn't trigger re-renders
  const renderResumePreview = () => {
    if (!parsedData) return null;

    const summary = generateConversationSummary();

    return (
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-3">
          📄 Resume Context for AI Interview:
        </h4>
        <div className="text-sm text-blue-800 space-y-2">
          <div>
            <strong>Skills:</strong> {contextVariables.candidate_skills}
          </div>
          <div>
            <strong>Experience:</strong>{" "}
            {contextVariables.candidate_experience_count} position(s)
          </div>
          <div>
            <strong>Recent roles:</strong>{" "}
            {contextVariables.candidate_experience_summary}
          </div>
          <div>
            <strong>Education:</strong>{" "}
            {contextVariables.candidate_education_summary}
          </div>
          {conversationState !== "new" && (
            <div className="pt-2 border-t border-blue-300">
              <strong>Status:</strong>{" "}
              {conversationState === "paused"
                ? "Paused - Ready to resume"
                : conversationState === "completed"
                ? "Interview completed"
                : "Active conversation"}
              {summary.totalMessages > 0 && (
                <span className="ml-2 text-xs">
                  ({summary.totalMessages} messages,{" "}
                  {summary.conversationDuration}min)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Debug section - remove in production */}
        <details className="mt-3">
          <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-800">
            Debug: Context variables being sent
          </summary>
          <pre className="text-xs bg-white p-3 mt-2 rounded overflow-auto max-h-32 border">
            {JSON.stringify(contextVariables, null, 2)}
          </pre>
        </details>
      </div>
    );
  };

  return (
    <div className="w-full max-w-5xl mx-auto relative">
      <Card className="shadow-xl flex flex-col h-[85vh] min-h-[700px]">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl flex items-center">
            <Sparkles className="mr-2 h-6 w-6 text-primary" />
            AI Interview Chat
            {conversationState === "paused" && (
              <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                Paused
              </span>
            )}
            {conversationState === "completed" && (
              <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                Completed
              </span>
            )}
          </CardTitle>
          <CardDescription className="text-base">
            {getStatusMessage()}
          </CardDescription>
          {renderResumePreview()}
        </CardHeader>

        <CardContent className="flex-grow overflow-hidden p-0">
          <ScrollArea className="h-full px-6 py-4" ref={scrollAreaRef}>
            <div className="space-y-6">
              {localChatHistory.map((chatMsg) => (
                <div
                  key={chatMsg.id}
                  className={cn(
                    "flex items-start space-x-4",
                    chatMsg.role === "user" ? "justify-end" : ""
                  )}
                >
                  {chatMsg.role === "assistant" && (
                    <span className="flex-shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary text-primary-foreground">
                      <Bot size={20} />
                    </span>
                  )}

                  <div
                    className={cn(
                      "px-4 py-3 rounded-lg max-w-[80%]",
                      chatMsg.role === "user"
                        ? "bg-blue-500 text-white rounded-br-none"
                        : chatMsg.role === "assistant"
                        ? "bg-gray-100 text-gray-900 rounded-bl-none"
                        : "bg-amber-50 text-amber-800 border border-amber-200 rounded text-center w-full max-w-none"
                    )}
                  >
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {chatMsg.text}
                    </p>
                    {chatMsg.role !== "system" && (
                      <p className="text-xs opacity-70 mt-2 text-right">
                        {new Date(chatMsg.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>

                  {chatMsg.role === "user" && (
                    <span className="flex-shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-full bg-blue-500 text-white">
                      <User size={20} />
                    </span>
                  )}
                </div>
              ))}

              {isConnecting && (
                <div className="flex items-center justify-center space-x-3 mt-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    {conversationState === "paused"
                      ? "Reconnecting..."
                      : "Connecting to AI Interviewer..."}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>

        <CardFooter className="p-6 border-t bg-gray-50/50">
          <div className="flex w-full items-center space-x-4">
            {!sessionStarted && !showFinishButton ? (
              // Initial start button
              <Button
                onClick={startSession}
                disabled={disabled || isConnecting}
                className="w-full"
                size="lg"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {conversationState === "paused"
                      ? "Reconnecting..."
                      : "Connecting..."}
                  </>
                ) : (
                  <>
                    {getButtonIcon()}
                    {getButtonText()}
                  </>
                )}
              </Button>
            ) : showFinishButton ? (
              // Show finish and resume options when disconnected
              <div className="flex w-full space-x-3">
                <Button
                  onClick={startSession}
                  disabled={disabled || isConnecting}
                  variant="outline"
                  size="lg"
                  className="flex-1"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reconnecting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Resume Interview
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleFinish}
                  disabled={disabled}
                  variant="default"
                  size="lg"
                  className="flex-1"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Finish & Rewrite Resume
                </Button>
              </div>
            ) : (
              // Active conversation controls
              <>
                <div className="flex-grow flex items-center justify-center space-x-3 p-4 bg-muted/50 rounded-lg border">
                  {conversation.isSpeaking ? (
                    <>
                      <Bot className="h-5 w-5 text-green-500 animate-pulse" />
                      <span className="text-sm font-medium">
                        AI is speaking...
                      </span>
                    </>
                  ) : (
                    <>
                      <Mic
                        className={cn(
                          "h-5 w-5 animate-pulse",
                          conversation.status === "connected"
                            ? "text-blue-500"
                            : "text-gray-400"
                        )}
                      />
                      <span className="text-sm font-medium">
                        {conversation.status === "connected"
                          ? "Listening for your voice..."
                          : "Microphone inactive"}
                      </span>
                    </>
                  )}
                </div>

                <Button
                  onClick={handleFinish}
                  disabled={disabled}
                  variant="default"
                  size="lg"
                  className="px-6"
                >
                  Finish Interview <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </CardFooter>
      </Card>

      {/* Inactivity prompt overlay - only shows after 2 minutes of inactivity */}
      {showInactivityPrompt && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md mx-4 shadow-2xl">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <FileText className="mr-2 h-5 w-5" />
                Still there?
              </CardTitle>
              <CardDescription>
                You've been inactive for a while. Would you like to continue the
                interview or finish and proceed with the resume rewrite?
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex space-x-3">
              <Button
                onClick={dismissInactivityPrompt}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                Continue Interview
              </Button>
              <Button onClick={handleAutoFinish} size="sm" className="flex-1">
                <FileText className="mr-2 h-4 w-4" />
                Finish & Rewrite Resume
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
});

InterviewInput.displayName = "InterviewInput";
