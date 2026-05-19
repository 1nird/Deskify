import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, Send, Loader2, Plus, MessageSquare, Trash2, User, PanelLeftClose, PanelLeftOpen, Lock, Sparkles, Paperclip, ExternalLink, X } from "lucide-react";
import { safeLocalStorage } from "@/lib";
import { fetchAIResponse } from "@/lib/functions/ai-response.function";
import { saveConversation } from "@/lib";
import { cn } from "@/lib/utils";
import { Logo, Markdown } from "@/components";
import { usePremium } from "@/components/PremiumGate";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  attachments?: string[];
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

// ─── Models ──────────────────────────────────────────────────────────────────

interface AIModel {
  id: string;
  name: string;
  plan: "free" | "student" | "developer";
  icon: string;
}

const MODELS: AIModel[] = [
  { id: "gemini-3-flash",       name: "Gemini 3 Flash",       plan: "free",      icon: "G" },
  { id: "gemini-31-medium",     name: "Gemini 3.1 Medium",    plan: "student",   icon: "G" },
  { id: "gpt-54-low",           name: "GPT 5.4 Low",          plan: "student",   icon: "⊕" },
  { id: "claude-35-haiku",      name: "Claude 3.5 Haiku",     plan: "student",   icon: "C" },
  { id: "claude-sonnet-46",     name: "Claude Sonnet 4.6",    plan: "developer", icon: "C" },
  { id: "gpt-54-high",          name: "GPT 5.4 High",         plan: "developer", icon: "⊕" },
  { id: "kimi-k26",             name: "Kimi K2.6",            plan: "developer", icon: "K" },
  { id: "claude-opus-46-fast",  name: "Claude Opus 4.6 Fast", plan: "developer", icon: "C" },
];

const MODEL_KEY = "selected_ai_model";
const CHAT_STORAGE_KEY = "deskify_chat_sessions";
const ACTIVE_CHAT_KEY  = "deskify_active_chat";

function canAccess(modelPlan: string, userPlan: string) {
  if (modelPlan === "free") return true;
  if (modelPlan === "student") return userPlan === "student" || userPlan === "developer";
  if (modelPlan === "developer") return userPlan === "developer";
  return false;
}

// ─── Chat Storage Helpers ────────────────────────────────────────────────────

function loadSessions(): ChatSession[] {
  try {
    const raw = safeLocalStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSessions(sessions: ChatSession[]) {
  safeLocalStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(sessions));
}

function deriveTitle(messages: Message[]): string {
  const first = messages.find(m => m.role === "user");
  if (!first) return "New chat";
  return first.content.slice(0, 40) + (first.content.length > 40 ? "…" : "");
}

// ─── Model Selector Dropdown ─────────────────────────────────────────────────

function ModelDropdown({ selected, onSelect, userPlan }: {
  selected: AIModel;
  onSelect: (m: AIModel) => void;
  userPlan: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const groups = [
    { label: "Free Plan",      plan: "free",      models: MODELS.filter(m => m.plan === "free") },
    { label: "Student Plan",   plan: "student",   models: MODELS.filter(m => m.plan === "student") },
    { label: "Developer Plan", plan: "developer", models: MODELS.filter(m => m.plan === "developer") },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 hover:border-emerald-500/50 text-xs font-medium text-emerald-300 active:scale-95 transition-all duration-200 group"
      >
        <span className="size-4 rounded-md bg-emerald-500/20 flex items-center justify-center text-[9px] font-bold text-emerald-400">
          {selected.icon}
        </span>
        <span className="max-w-[110px] truncate">{selected.name}</span>
        <ChevronDown className={cn("size-3 transition-transform duration-200 text-emerald-400/70", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-2xl border border-white/10 bg-[#0d1117]/95 backdrop-blur-2xl shadow-2xl shadow-black/60 overflow-hidden z-[100] animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-[240px] overflow-y-auto">
          {groups.map(group => (
            <div key={group.plan}>
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{group.label}</span>
              </div>
              {group.models.map(model => {
                const accessible = canAccess(model.plan, userPlan);
                const isSelected = selected.id === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={() => { if (accessible) { onSelect(model); setOpen(false); } }}
                    disabled={!accessible}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-all duration-150",
                      accessible
                        ? "hover:bg-emerald-500/10 cursor-pointer"
                        : "opacity-40 cursor-not-allowed",
                      isSelected && "bg-emerald-500/15 text-emerald-300"
                    )}
                  >
                    <span className="size-6 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-white/60 shrink-0">
                      {model.icon}
                    </span>
                    <span className={cn("flex-1 text-left text-xs font-medium", isSelected ? "text-emerald-300" : "text-white/70")}>
                      {model.name}
                    </span>
                    {isSelected && <span className="text-emerald-400 text-xs">✓</span>}
                    {!accessible && <Lock className="size-3 text-white/30" />}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="h-2" />
        </div>
      )}
    </div>
  );
}

// ─── Chat Sidebar ─────────────────────────────────────────────────────────────

function ChatSidebar({ sessions, activeChatId, onSelectChat, onNewChat, onDeleteChat, collapsed, width, onWidthChange }: {
  sessions: ChatSession[];
  activeChatId: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  collapsed: boolean;
  width: number;
  onWidthChange: (w: number) => void;
}) {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  const isDragging = useRef(false);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.min(Math.max(160, e.clientX), 400);
    onWidthChange(newWidth);
  }, [onWidthChange]);

  const stopDrag = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", stopDrag);
  }, [handleDrag]);

  return (
    <div 
      className={cn(
        "relative flex flex-col h-full bg-[#0a0f14]/60 backdrop-blur-sm transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] overflow-hidden shrink-0",
        collapsed ? "opacity-0 pointer-events-none border-transparent" : "opacity-100 border-r border-white/8"
      )}
      style={{ width: collapsed ? 0 : width, minWidth: collapsed ? 0 : width }}
    >
      <div 
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-emerald-500/50 z-10 transition-colors"
        onMouseDown={startDrag}
      />
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-white/30 pl-1">Chats</span>
        <button
          onClick={onNewChat}
          title="New chat"
          className="size-7 rounded-lg flex items-center justify-center bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 hover:border-emerald-500/50 text-emerald-400 transition-all duration-200"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5 min-w-0">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-12 gap-2 opacity-40">
            <MessageSquare className="size-6 text-white/30" />
            <p className="text-[10px] text-white/30 text-center px-4">No chats yet. Start one below.</p>
          </div>
        )}
        {sorted.map(session => {
          const isActive = session.id === activeChatId;
          return (
            <div
              key={session.id}
              className={cn(
                "group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150 min-w-0",
                isActive
                  ? "bg-emerald-500/15 border border-emerald-500/25"
                  : "hover:bg-white/5 border border-transparent"
              )}
              onClick={() => onSelectChat(session.id)}
            >
              <MessageSquare className={cn("size-3.5 shrink-0 transition-colors", isActive ? "text-emerald-400" : "text-white/30 group-hover:text-white/50")} />
              <span className={cn("flex-1 text-xs truncate font-medium transition-colors", isActive ? "text-emerald-200" : "text-white/50 group-hover:text-white/70")}>
                {session.title}
              </span>
              <button
                onClick={e => { e.stopPropagation(); onDeleteChat(session.id); }}
                className="opacity-0 group-hover:opacity-100 size-5 flex items-center justify-center rounded-md hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all duration-150 shrink-0"
                title="Delete chat"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ChatInterface ───────────────────────────────────────────────────────

export const ChatInterface = () => {
  const { userPlan } = usePremium();

  // Model state
  const [selectedModel, setSelectedModel] = useState<AIModel>(() => {
    try {
      const stored = safeLocalStorage.getItem(MODEL_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const model = MODELS.find(m => m.id === parsed.id);
        if (model && canAccess(model.plan, userPlan)) return model;
      }
    } catch { /* ignore */ }
    return MODELS[0];
  });

  const handleSelectModel = (model: AIModel) => {
    setSelectedModel(model);
    safeLocalStorage.setItem(MODEL_KEY, JSON.stringify(model));
  };

  // Chat sessions state
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeChatId, setActiveChatId] = useState<string>(() => safeLocalStorage.getItem(ACTIVE_CHAT_KEY) || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);

  // Load active session messages on mount / when activeChatId changes
  useEffect(() => {
    const all = loadSessions();
    setSessions(all);
    if (activeChatId) {
      const found = all.find(s => s.id === activeChatId);
      if (found) { setMessages(found.messages); return; }
    }
    // No valid active chat – create one
    createNewChat(all);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Input & loading
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Session helpers ──────────────────────────────────────────────────────

  const createNewChat = useCallback((existingSessions?: ChatSession[]) => {
    const all = Array.isArray(existingSessions) ? existingSessions : loadSessions();
    const cleanedAll = all.filter((s) => s.messages.length > 0);

    const chatId = `chat-${Date.now()}`;
    const newSession: ChatSession = {
      id: chatId,
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [newSession, ...cleanedAll];
    persistSessions(updated);
    setSessions(updated);
    setActiveChatId(chatId);
    setMessages([]);
    setAttachments([]);
    setInputValue("");
    safeLocalStorage.setItem(ACTIVE_CHAT_KEY, chatId);
    setTimeout(() => inputRef.current?.focus(), 100);
    return chatId;
  }, []);

  const selectChat = useCallback((id: string) => {
    const all = loadSessions();
    const session = all.find(s => s.id === id);
    if (!session) return;
    setActiveChatId(id);
    setMessages(session.messages);
    setAttachments([]);
    safeLocalStorage.setItem(ACTIVE_CHAT_KEY, id);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const deleteChat = useCallback((id: string) => {
    const all = loadSessions().filter(s => s.id !== id);
    persistSessions(all);
    setSessions(all);
    if (id === activeChatId) {
      if (all.length > 0) {
        const next = all[0];
        setActiveChatId(next.id);
        setMessages(next.messages);
        safeLocalStorage.setItem(ACTIVE_CHAT_KEY, next.id);
      } else {
        createNewChat([]);
      }
    }
  }, [activeChatId, createNewChat]);

  const saveSession = useCallback((chatId: string, updatedMessages: Message[]) => {
    const all = loadSessions();
    const idx = all.findIndex(s => s.id === chatId);
    const title = deriveTitle(updatedMessages);
    if (idx > -1) {
      all[idx] = { ...all[idx], messages: updatedMessages, title, updatedAt: Date.now() };
    } else {
      all.unshift({ id: chatId, title, messages: updatedMessages, createdAt: Date.now(), updatedAt: Date.now() });
    }
    persistSessions(all);
    setSessions([...all]);
    
    // Sync to SQLite for overlay compatibility
    saveConversation({
      id: chatId,
      title,
      messages: updatedMessages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        attachedFiles: m.attachments?.map((a: string, i: number) => ({
          id: `${m.id}-${i}`,
          name: `attachment-${i}.png`,
          type: "image/png",
          base64: a.includes(",") ? a.split(",")[1] : a,
          size: a.length
        }))
      })),
      createdAt: idx > -1 ? all[idx].createdAt : Date.now(),
      updatedAt: Date.now()
    }).catch(console.error);
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || isLoading) return;

    const userMsg: Message = { id: `msg-${Date.now()}`, role: "user", content, timestamp: Date.now(), attachments: [...attachments] };
    // Capture current messages for history before state update
    const prevMessages = messages;
    const nextMessages = [...prevMessages, userMsg];
    setMessages(nextMessages);
    setInputValue("");
    setAttachments([]);
    setIsLoading(true);

    // Optimistically update sessions list title
    const currentId = activeChatId;

    try {
      const history = prevMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      let creator = "OpenAI";
      const modelLower = selectedModel.name.toLowerCase();
      if (modelLower.includes("claude") || modelLower.includes("opus") || modelLower.includes("sonnet")) {
        creator = "Anthropic";
      } else if (modelLower.includes("gemini")) {
        creator = "Google";
      } else if (modelLower.includes("kimi")) {
        creator = "Moonshot AI";
      }

      const systemPrompt = `[CRITICAL SYSTEM OVERRIDE: IDENTITY INSTRUCTION]
You are Deskify, an intelligent, helpful AI workspace companion. 
You are currently providing the capabilities of ${selectedModel.name}, which was created by ${creator}. 
Under no circumstances should you claim to be Gemini, ChatGPT, Claude 3.5 Haiku, or any other model. 
If asked who you are, what model you are, or who created you, you must ONLY reply that you are ${selectedModel.name} created by ${creator}. 
Adopt the standard persona, tone, and capabilities expected of ${selectedModel.name}. 
Answer naturally, be helpful, and pay close attention to the chat history.`;

      let fullResponse = "";
      for await (const chunk of fetchAIResponse({ systemPrompt, userMessage: content, history })) {
        fullResponse += chunk;
      }

      const assistantMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: fullResponse || "Sorry, I couldn't generate a response.",
        timestamp: Date.now(),
      };

      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      saveSession(currentId, finalMessages);
    } catch {
      const errMsg: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "Sorry, there was an error processing your message. Please try again.",
        timestamp: Date.now(),
      };
      const finalMessages = [...nextMessages, errMsg];
      setMessages(finalMessages);
      saveSession(currentId, finalMessages);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setAttachments(prev => [...prev, event.target?.result as string]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments(prev => [...prev, event.target?.result as string]);
        };
        reader.readAsDataURL(file);
      }
    });
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full overflow-hidden bg-transparent">
      {/* ── Chat history sidebar ── */}
      <ChatSidebar
        sessions={sessions}
        activeChatId={activeChatId}
        onSelectChat={selectChat}
        onNewChat={() => createNewChat()}
        onDeleteChat={deleteChat}
        collapsed={sidebarCollapsed}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
      />

      {/* ── Main chat area ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

        {/* Top bar */}
        <div className="shrink-0 flex items-center gap-2 px-4 h-12 border-b border-white/8 bg-[#0a0f14]/40 backdrop-blur-sm">
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            className="size-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-all duration-200"
          >
            {sidebarCollapsed
              ? <PanelLeftOpen className="size-4" />
              : <PanelLeftClose className="size-4" />}
          </button>
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-emerald-400" />
            <span className="text-sm font-semibold text-white/80">Deskify Chat</span>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center select-none animate-in fade-in duration-500">
              <div className="size-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner mb-2">
                <Logo size={40} className="text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-white/70">How can I help you today?</p>
                <p className="text-xs text-white/30">Using <span className="text-emerald-400">{selectedModel.name}</span></p>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="size-8 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Logo size={16} className="text-emerald-400" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed overflow-x-auto",
                  msg.role === "user"
                    ? "bg-emerald-500/20 border border-emerald-500/30 text-white/90 rounded-tr-sm"
                    : "bg-white/5 border border-white/10 text-white/80 rounded-tl-sm"
                )}>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {msg.attachments.map((src, i) => (
                        <img key={i} src={src} alt="attachment" className="max-w-full h-auto max-h-48 rounded-lg border border-white/10" />
                      ))}
                    </div>
                  )}
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  ) : (
                    <Markdown>{msg.content}</Markdown>
                  )}
                  <p className="text-[10px] mt-1.5 opacity-40">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {msg.role === "user" && (
                  <div className="size-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="size-3.5 text-white/60" />
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-3 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="size-8 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <Logo size={16} className="text-emerald-400" />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin text-emerald-400" />
                <span className="text-xs text-white/40">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input area ── */}
        <div className="shrink-0 border-t border-white/8 bg-[#0a0f14]/40 backdrop-blur-sm px-4 pt-3 pb-4">
          <div className="rounded-2xl border border-white/10 bg-white/4 hover:border-white/15 focus-within:border-emerald-500/40 transition-all duration-300">
            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto">
                {attachments.map((src, i) => (
                  <div key={i} className="relative shrink-0">
                    <img src={src} alt="preview" className="size-16 object-cover rounded-lg border border-white/10" />
                    <button 
                      onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 size-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* Textarea */}
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Ask anything…"
              disabled={isLoading}
              rows={1}
              className="w-full bg-transparent resize-none px-4 pt-3.5 pb-1 text-sm text-white/80 placeholder-white/25 outline-none disabled:opacity-50 max-h-40 overflow-y-auto"
              style={{ minHeight: "44px" }}
            />

            {/* Hidden file input */}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              multiple 
              accept="image/*"
              onChange={handleFileSelect}
            />

            {/* Bottom toolbar */}
            <div className="flex items-center justify-between px-3 pb-2.5 pt-1 gap-2">
              <div className="flex items-center gap-2">
                <ModelDropdown
                  selected={selectedModel}
                  onSelect={handleSelectModel}
                  userPlan={userPlan}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="size-8 rounded-xl flex items-center justify-center hover:bg-white/10 text-white/40 hover:text-white/80 transition-all duration-200"
                  title="Attach file/image"
                >
                  <Paperclip className="size-4" />
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem("deskify-conversation-selected", JSON.stringify({ id: activeChatId, timestamp: Date.now() }));
                    import("@tauri-apps/api/core").then(({ invoke }) => invoke("toggle_main_window"));
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-emerald-500/10 text-white/40 hover:text-emerald-400 transition-all duration-200 text-xs font-medium"
                  title="Open in overlay"
                >
                  <ExternalLink className="size-3.5" />
                  <span className="hidden sm:inline">Open in Overlay</span>
                </button>
              </div>

              <button
                onClick={handleSend}
                disabled={isLoading || !inputValue.trim()}
                className={cn(
                  "size-8 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0",
                  inputValue.trim() && !isLoading
                    ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95"
                    : "bg-white/8 text-white/25 cursor-not-allowed"
                )}
                title="Send message (Enter)"
              >
                {isLoading
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Send className="size-4" />}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-white/20 text-center mt-2">
            {selectedModel.name} · Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
};
