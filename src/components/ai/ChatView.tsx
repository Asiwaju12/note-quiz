import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, BookOpen, Check, Copy, FileText, Globe, Plus, RefreshCw, Sparkles, Square, Trash2, TriangleAlert } from "lucide-react";
import { useCollection } from "@/data/db";
import type { ChatMessage, ChatThread, StudyDocument } from "@/data/models";
import { addMessage, bumpToday, chatMessages, createChat, db, deleteChat, getDocumentText, updateMessage } from "@/data/repos";
import { TUTOR_MODES, type ChatRequest, type TutorMode } from "@/lib/ai/contract";
import { retrieve } from "@/lib/study/retrieval";
import { AiError, streamChat, useAiStatus } from "@/services/ai";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import { Menu } from "@/components/ui/Menu";
import { confirmAction } from "@/components/ui/Confirm";
import { takePendingMistakes } from "./handoff";
import { AiNotConnected } from "./AiNotConnected";

const FOLLOW_UPS = ["Give me an example", "Explain that more simply", "Test me on this"];

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-2" aria-label="Recall AI is typing">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-subtle" animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </span>
  );
}

function SourceLine({ message, onPage }: { message: ChatMessage; onPage?: (page: number) => void }) {
  if (message.grounded === undefined) return null;
  if (!message.grounded) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-subtle">
        <Globe className="h-3.5 w-3.5" /> No matching passages in your document — answer may use general knowledge
      </p>
    );
  }
  const pages = [...new Set((message.sources ?? []).map((s) => s.page))].sort((a, b) => a - b);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
      <FileText className="h-3.5 w-3.5" /> Searched your document:
      {pages.map((page) =>
        onPage ? (
          <button key={page} type="button" onClick={() => onPage(page)} className="rounded-md bg-accent-soft px-1.5 py-px font-mono text-[11px] text-accent-text hover:underline">
            p. {page}
          </button>
        ) : (
          <span key={page} className="rounded-md bg-surface-3 px-1.5 py-px font-mono text-[11px]">
            p. {page}
          </span>
        ),
      )}
    </div>
  );
}

function MessageBubble({ message, streaming, onCopy, copied, onRegenerate, onPage, last }: { message: ChatMessage; streaming: boolean; onCopy: () => void; copied: boolean; onRegenerate?: () => void; onPage?: (page: number) => void; last: boolean }) {
  if (message.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-accent-fg">{message.content}</div>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {message.error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="h-4 w-4" /> {message.error}
            </p>
            {onRegenerate && (
              <button type="button" onClick={onRegenerate} className="mt-2 text-[13px] font-semibold underline">
                Try again
              </button>
            )}
          </div>
        ) : message.content ? (
          <Markdown text={message.content} onPage={onPage} />
        ) : (
          <TypingDots />
        )}
        {!streaming && !message.error && message.content && (
          <>
            <SourceLine message={message} onPage={onPage} />
            <div className={cn("mt-1.5 flex items-center gap-0.5 transition-opacity", last ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100")}>
              <button type="button" onClick={onCopy} className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-text" aria-label="Copy response">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
              {onRegenerate && (
                <button type="button" onClick={onRegenerate} className="grid h-8 w-8 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-text" aria-label="Regenerate response">
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Recall AI conversation. With `docId`, questions are answered from the document:
 * relevant passages are retrieved (BM25) and sent as context with page numbers.
 */
export function ChatView({
  docId,
  chatId: controlledChatId,
  onChatChange,
  onPage,
  currentPage,
  className,
}: {
  docId?: string;
  chatId?: string | null;
  onChatChange?: (id: string | null) => void;
  onPage?: (page: number) => void;
  currentPage?: number;
  className?: string;
}) {
  const ai = useAiStatus();
  const allChats = useCollection<ChatThread>("chats");
  const allMessages = useCollection<ChatMessage>("messages");
  const documents = useCollection<StudyDocument>("documents");
  const doc = docId ? documents.find((d) => d.id === docId) : undefined;
  const docChats = useMemo(() => allChats.filter((chat) => (docId ? chat.docId === docId : true)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [allChats, docId]);
  const [internalChatId, setInternalChatId] = useState<string | null>(() => (docId ? (docChats[0]?.id ?? null) : null));
  const chatId = controlledChatId !== undefined ? controlledChatId : internalChatId;
  const setChatId = useCallback(
    (id: string | null) => {
      setInternalChatId(id);
      onChatChange?.(id);
    },
    [onChatChange],
  );
  const messages = useMemo(() => (chatId ? allMessages.filter((m) => m.chatId === chatId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []), [allMessages, chatId]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<TutorMode | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handoffDone = useRef(false);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => scrollToBottom(false), [chatId, scrollToBottom]);

  const runAssistant = useCallback(
    async (thread: string, history: ChatMessage[], sendMode: TutorMode | null, mistakes?: ChatRequest["mistakes"]) => {
      const question = history[history.length - 1]?.content ?? "";
      let documentContext: ChatRequest["document"];
      let sources: ChatMessage["sources"];
      if (doc) {
        const text = await getDocumentText(doc.id);
        const previousQuery = [...history].reverse().filter((m) => m.role === "user")[1]?.content;
        const passages = text ? retrieve(doc.id, text.pages, question, { previousQuery, currentPage }) : [];
        documentContext = { title: doc.title, passages };
        sources = passages.map((p) => ({ page: p.page, excerpt: p.text.slice(0, 160) }));
      }
      const assistant = addMessage({ chatId: thread, role: "assistant", content: "", mode: sendMode ?? undefined, sources, grounded: doc ? Boolean(sources?.length) : undefined });
      setStreamingId(assistant.id);
      const controller = new AbortController();
      abortRef.current = controller;
      let text = "";
      let pending = "";
      let frame = 0;
      const flush = () => {
        frame = 0;
        text += pending;
        pending = "";
        updateMessage(assistant.id, { content: text });
        scrollToBottom();
      };
      try {
        await streamChat(
          { conversationId: thread, messages: history.map((m) => ({ role: m.role, content: m.content })), mode: sendMode ?? undefined, document: documentContext, mistakes },
          (delta) => {
            pending += delta;
            if (!frame) frame = requestAnimationFrame(flush);
          },
          controller.signal,
        );
        if (frame) cancelAnimationFrame(frame);
        flush();
      } catch (error) {
        if (frame) cancelAnimationFrame(frame);
        if ((error as Error).name === "AbortError") {
          flush();
          if (!text.trim()) updateMessage(assistant.id, { content: "_Stopped._" });
        } else {
          updateMessage(assistant.id, { content: text, error: error instanceof AiError ? error.message : "Something went wrong. Please try again." });
        }
      } finally {
        setStreamingId(null);
        abortRef.current = null;
      }
    },
    [doc, currentPage, scrollToBottom],
  );

  const send = useCallback(
    async (rawText: string, sendMode: TutorMode | null = mode, mistakes?: ChatRequest["mistakes"]) => {
      const text = rawText.trim();
      if (!text || streamingId) return;
      let thread = chatId;
      if (!thread || !db.chats.get(thread)) {
        thread = createChat(text.slice(0, 60), docId).id;
        setChatId(thread);
      }
      addMessage({ chatId: thread, role: "user", content: text, mode: sendMode ?? undefined });
      bumpToday({ aiMessages: 1 });
      setInput("");
      setMode(null);
      requestAnimationFrame(() => scrollToBottom());
      await runAssistant(thread, chatMessages(thread), sendMode, mistakes);
    },
    [chatId, docId, mode, runAssistant, scrollToBottom, setChatId, streamingId],
  );

  // "Explain my mistakes" hand-off from a finished quiz.
  useEffect(() => {
    if (handoffDone.current || !ai?.configured) return;
    const pending = takePendingMistakes(docId);
    if (!pending) return;
    handoffDone.current = true;
    const thread = createChat(`Mistakes · ${pending.title}`, docId).id;
    setChatId(thread);
    window.setTimeout(() => {
      addMessage({ chatId: thread, role: "user", content: `Explain my mistakes from “${pending.title}”.`, mode: "mistakes" });
      bumpToday({ aiMessages: 1 });
      void runAssistant(thread, chatMessages(thread), "mistakes", pending.mistakes);
    }, 50);
  }, [ai?.configured, docId, runAssistant, setChatId]);

  const regenerate = async () => {
    if (!chatId || streamingId) return;
    const list = chatMessages(chatId);
    const lastAssistant = [...list].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) db.messages.remove(lastAssistant.id);
    const history = chatMessages(chatId);
    if (history[history.length - 1]?.role !== "user") return;
    await runAssistant(chatId, history, (lastAssistant?.mode as TutorMode) ?? null);
  };

  const copy = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const applyMode = (id: TutorMode) => {
    const def = TUTOR_MODES.find((m) => m.id === id)!;
    if (input.trim()) {
      void send(input, id);
      return;
    }
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser || doc) {
      const topic = lastUser ? "" : ` the key ideas in “${doc?.title}”`;
      void send(`${def.prompt}${topic}`, id);
    } else {
      setMode(id);
      textareaRef.current?.focus();
    }
  };

  const suggestions = doc
    ? [`Summarise the main ideas of “${doc.title}”`, "What are the most important definitions?", "Quiz me on this document", "What topics will likely be examined?"]
    : ["Explain photosynthesis simply", "Help me understand recursion", "Quiz me on the French Revolution", "How should I revise for a maths exam?"];

  const lastMessage = messages[messages.length - 1];
  const showFollowUps = lastMessage?.role === "assistant" && !lastMessage.error && !streamingId && lastMessage.content;

  if (ai && !ai.configured) return <AiNotConnected className={className} doc={Boolean(doc)} />;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <div className="min-w-0 flex-1">
          {docChats.length > 0 && docId ? (
            <select
              value={chatId ?? ""}
              onChange={(e) => setChatId(e.target.value || null)}
              className="max-w-full truncate rounded-lg bg-transparent py-1 pr-2 text-sm font-medium focus:outline-none"
              aria-label="Conversation"
            >
              <option value="">New conversation</option>
              {docChats.map((chat) => (
                <option key={chat.id} value={chat.id}>
                  {chat.title} · {formatRelative(chat.updatedAt)}
                </option>
              ))}
            </select>
          ) : (
            <p className="truncate text-sm font-medium">{chatId ? (db.chats.get(chatId)?.title ?? "Conversation") : "New conversation"}</p>
          )}
          {doc && (
            <p className="flex items-center gap-1 truncate text-xs text-subtle">
              <BookOpen className="h-3 w-3" /> Answers from “{doc.title}”
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setChatId(null)} icon={<Plus className="h-4 w-4" />} disabled={!chatId}>
          New
        </Button>
        {chatId && (
          <Menu
            label="Conversation actions"
            items={[
              {
                label: "Clear conversation",
                icon: <Trash2 className="h-4 w-4" />,
                danger: true,
                onSelect: async () => {
                  if (await confirmAction({ title: "Delete this conversation?", confirmLabel: "Delete", danger: true })) {
                    abortRef.current?.abort();
                    deleteChat(chatId);
                    setChatId(null);
                  }
                },
              },
            ]}
          />
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-lg flex-col items-center py-6 text-center">
            <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
              <Sparkles className="h-7 w-7" />
            </motion.span>
            <h3 className="mt-4 text-lg font-semibold">{doc ? "Ask about this document" : "What are you studying?"}</h3>
            <p className="mt-1.5 text-sm text-muted">{doc ? "Recall AI searches your PDF and cites the pages it used." : "Ask a question, paste something confusing, or pick a learning mode below."}</p>
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => void send(suggestion, null)} className="rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm text-text transition-colors hover:border-accent hover:bg-accent-softer">
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                streaming={streamingId === message.id}
                copied={copiedId === message.id}
                onCopy={() => void copy(message)}
                onRegenerate={message.role === "assistant" && index === messages.length - 1 ? () => void regenerate() : undefined}
                onPage={onPage}
                last={index === messages.length - 1}
              />
            ))}
            <AnimatePresence>
              {showFollowUps && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2 pl-11">
                  {FOLLOW_UPS.map((item) => (
                    <button key={item} type="button" onClick={() => void send(item, null)} className="rounded-full border border-border px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-accent hover:text-accent-text">
                      {item}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">Your Recall AI conversations are saved to your account and may be reviewed by authorised Recall Quiz moderators for safety and platform support. Please avoid sharing passwords or highly sensitive personal information.</div>
      <div className="border-t border-border pt-3">
        <div className="no-scrollbar -mx-1 mb-2.5 flex gap-1.5 overflow-x-auto px-1" role="group" aria-label="Learning modes">
          {TUTOR_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => applyMode(item.id)}
              disabled={Boolean(streamingId)}
              aria-pressed={mode === item.id}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-medium transition-colors disabled:opacity-50",
                mode === item.id ? "border-accent bg-accent-soft text-accent-text" : "border-border text-muted hover:border-border-strong hover:text-text",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-xs focus-within:border-accent focus-within:ring-4 focus-within:ring-[var(--ring)]/15"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder={mode ? `${TUTOR_MODES.find((m) => m.id === mode)?.label}: type a topic…` : doc ? "Ask about this document…" : "Ask Recall AI anything…"}
            aria-label="Message Recall AI"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed placeholder:text-subtle focus:outline-none"
          />
          {streamingId ? (
            <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop generating">
              <Square className="h-4 w-4" fill="currentColor" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send message">
              <ArrowUp className="h-5 w-5" />
            </Button>
          )}
        </form>
        <p className="mt-2 text-center text-[11px] text-subtle">Recall AI can make mistakes. Check important facts against your course material.</p>
      </div>
    </div>
  );
}
