import { useState, useEffect, useRef } from "react";
import { Button } from "@/components";
import { ModelSelector } from "@/components";
import { Send, Loader2 } from "lucide-react";
import { safeLocalStorage } from "@/lib";
import { useSelectedModel } from "@/components/ModelSelector";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatSession {
  id: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const CHAT_STORAGE_KEY = "deskify_chat_sessions";
const ACTIVE_CHAT_KEY = "deskify_active_chat";

export const ChatInterface = () => {
  const selectedModel = useSelectedModel();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize or load existing chat
  useEffect(() => {
    const savedChatId = safeLocalStorage.getItem(ACTIVE_CHAT_KEY);
    if (savedChatId) {
      loadChat(savedChatId);
      setActiveChatId(savedChatId);
    } else {
      createNewChat();
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createNewChat = () => {
    const chatId = `chat-${Date.now()}`;
    const newChat: ChatSession = {
      id: chatId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    saveChat(newChat);
    setActiveChatId(chatId);
    setMessages([]);
    safeLocalStorage.setItem(ACTIVE_CHAT_KEY, chatId);
  };

  const loadChat = (chatId: string) => {
    try {
      const sessionsStr = safeLocalStorage.getItem(CHAT_STORAGE_KEY);
      if (sessionsStr) {
        const sessions: ChatSession[] = JSON.parse(sessionsStr);
        const chat = sessions.find(s => s.id === chatId);
        if (chat) {
          setMessages(chat.messages);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load chat:", e);
    }
    createNewChat();
  };

  const saveChat = (chat: ChatSession) => {
    try {
      let sessions: ChatSession[] = [];
      const sessionsStr = safeLocalStorage.getItem(CHAT_STORAGE_KEY);
      if (sessionsStr) {
        sessions = JSON.parse(sessionsStr);
      }
      
      const existingIndex = sessions.findIndex(s => s.id === chat.id);
      if (existingIndex > -1) {
        sessions[existingIndex] = chat;
      } else {
        sessions.push(chat);
      }
      
      safeLocalStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save chat:", e);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: inputValue,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Build enhanced system prompt based on selected model
      const modelName = selectedModel.name;
      const isFreePlan = selectedModel.plan === "free";
      
      let enhancedSystemPrompt = `You are Deskify AI Assistant using ${modelName}. When asked what model you are, respond that you are using "${modelName}".`;
      
      if (!isFreePlan) {
        enhancedSystemPrompt += ` Take your time with thorough reasoning and extended thinking to provide comprehensive, well-thought-out answers.`;
      }

      // Convert messages to the format expected by fetchAIResponse
      const history = messages.map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));

      let fullResponse = "";
      const generator = fetchAIResponse({
        systemPrompt: enhancedSystemPrompt,
        userMessage: inputValue,
        history: history as any,
      });

      for await (const chunk of generator) {
        fullResponse += chunk;
      }

      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: fullResponse || "Sorry, I couldn't generate a response.",
        timestamp: Date.now(),
      };

      const updatedMessages = [...messages, userMessage, assistantMessage];
      setMessages(updatedMessages);

      // Save chat session
      if (activeChatId) {
        const session: ChatSession = {
          id: activeChatId,
          messages: updatedMessages,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        saveChat(session);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: "Sorry, there was an error processing your message.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background via-background to-background/95">
      {/* Header with model selector */}
      <div className="flex items-center justify-between p-4 border-b border-border/30 bg-black/20 backdrop-blur-sm">
        <h1 className="text-lg font-semibold text-foreground">Chat</h1>
        <ModelSelector />
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-3">
              <div className="text-4xl font-bold text-primary">💬</div>
              <p className="text-muted-foreground text-sm">Start a conversation</p>
              <p className="text-xs text-muted-foreground/60">Ask me anything or paste text to analyze</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl ${
                  message.role === "user"
                    ? "bg-emerald-500/20 text-foreground border border-emerald-500/30"
                    : "bg-primary/10 text-foreground border border-primary/20"
                }`}
              >
                <p className="text-sm break-words whitespace-pre-wrap">
                  {message.content}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-primary/10 border border-primary/20 rounded-2xl px-4 py-2.5 flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/30 bg-black/20 backdrop-blur-sm p-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message... (Shift+Enter for new line)"
            disabled={isLoading}
            className="flex-1 bg-background/50 border border-border/50 rounded-full px-4 py-2.5 text-sm placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
            size="icon"
            className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground/60 text-center">
          Powered by {selectedModel.name} • Local storage only
        </p>
      </div>
    </div>
  );
};
