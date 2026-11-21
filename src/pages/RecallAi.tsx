import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FileText, History, MessageSquare, Plus } from "lucide-react";
import { useCollection } from "@/data/db";
import type { ChatThread, StudyDocument } from "@/data/models";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/hooks";
import { ChatView } from "@/components/ai/ChatView";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Overlay";
import { useAiStatus } from "@/services/ai";
import { Badge } from "@/components/ui/primitives";

function ChatList({ chats, documents, activeId, onSelect }: { chats: ChatThread[]; documents: StudyDocument[]; activeId: string | null; onSelect: (id: string | null) => void }) {
  if (!chats.length) return <p className="px-3 py-4 text-sm text-subtle">Your conversations will appear here.</p>;
  return (
    <ul className="space-y-0.5">
      {chats.map((chat) => {
        const doc = chat.docId ? documents.find((d) => d.id === chat.docId) : undefined;
        return (
          <li key={chat.id}>
            <button
              type="button"
              onClick={() => onSelect(chat.id)}
              className={cn("w-full rounded-xl px-3 py-2.5 text-left transition-colors", activeId === chat.id ? "bg-surface shadow-xs ring-1 ring-border" : "hover:bg-surface-3/70")}
            >
              <span className="block truncate text-sm font-medium">{chat.title}</span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-subtle">
                {doc && <FileText className="h-3 w-3 shrink-0" />}
                {doc ? `${doc.title} · ` : ""}
                {formatRelative(chat.updatedAt)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function RecallAi() {
  const chats = useCollection<ChatThread>("chats");
  const documents = useCollection<StudyDocument>("documents");
  const ai = useAiStatus();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [historyOpen, setHistoryOpen] = useState(false);
  const sorted = [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const chatId = params.get("chat");
  const active = chatId ? chats.find((chat) => chat.id === chatId) : undefined;
  const select = (id: string | null) => {
    setParams(id ? { chat: id } : {}, { replace: true });
    setHistoryOpen(false);
  };

  return (
    <div className="flex flex-col md:h-[calc(100dvh-5rem)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Recall AI</h1>
          {ai?.configured ? <Badge tone="success">Connected</Badge> : ai ? <Badge tone="warning">Not connected</Badge> : null}
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          <Button variant="ghost" size="sm" icon={<History className="h-4 w-4" />} onClick={() => setHistoryOpen(true)}>
            History
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-6">
        <aside className="hidden w-64 shrink-0 flex-col lg:flex">
          <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => select(null)} className="mb-3 w-full">
            New conversation
          </Button>
          <p className="eyebrow mb-2 px-3">History</p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatList chats={sorted} documents={documents} activeId={chatId} onSelect={select} />
          </div>
        </aside>

        <section className="card flex min-h-[70dvh] min-w-0 flex-1 flex-col p-4 sm:p-5 md:min-h-0">
          {active?.docId && (
            <Link to={`/study/${active.docId}?tab=tutor`} className="mb-3 inline-flex items-center gap-1.5 self-start rounded-lg bg-accent-softer px-2.5 py-1 text-xs font-medium text-accent-text hover:underline">
              <FileText className="h-3.5 w-3.5" /> Open in document workspace
            </Link>
          )}
          <ChatView
            key={active?.docId ?? "general"}
            docId={active?.docId}
            chatId={chatId}
            onChatChange={(id) => setParams(id ? { chat: id } : {}, { replace: true })}
            onPage={active?.docId ? (page) => navigate(`/study/${active.docId}?tab=pdf&page=${page}`) : undefined}
            className="min-h-0 flex-1"
          />
        </section>
      </div>

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversations">
        <div className="p-3">
          <Button variant="secondary" icon={<MessageSquare className="h-4 w-4" />} onClick={() => select(null)} className="mb-3 w-full">
            New conversation
          </Button>
          <ChatList chats={sorted} documents={documents} activeId={chatId} onSelect={select} />
        </div>
      </Drawer>
    </div>
  );
}
