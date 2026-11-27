import { useEffect, useMemo, useState } from "react";
import { Bell, MessageCircle, UserPlus, Check, X, Inbox } from "lucide-react";
import { useAccount } from "@/app/account";
import { supabaseRest } from "@/services/supabase";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toast";

type Profile = { id: string; display_name: string; handle: string; avatar_color: string };
type MessageRow = { id: string; sender_id: string; body: string; created_at: string; read_at: string | null };
type RequestRow = { id: string; sender_id: string; receiver_id: string; status: string; created_at: string };
type Notice = { id: string; kind: "message" | "request"; title: string; description: string; created_at: string; unread: boolean; profile?: Profile; request?: RequestRow };

export default function Notifications() {
  const { account, openAuth } = useAccount();
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [filter, setFilter] = useState<"all" | "messages" | "requests">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!account) return;
    setLoading(true);
    try {
      const [messageRows, requestRows] = await Promise.all([
        supabaseRest<MessageRow[]>("direct_messages", "select=id,sender_id,body,created_at,read_at&receiver_id=eq." + account.id + "&order=created_at.desc&limit=50"),
        supabaseRest<RequestRow[]>("friend_requests", "select=id,sender_id,receiver_id,status,created_at&or=(sender_id.eq." + account.id + ",receiver_id.eq." + account.id + ")&status=in.(pending,accepted,declined)&order=created_at.desc&limit=50"),
      ]);
      setMessages(messageRows);
      setRequests(requestRows);
      const ids = [...new Set([...messageRows.map(m => m.sender_id), ...requestRows.map(r => r.sender_id === account.id ? r.receiver_id : r.sender_id)])].filter(id => id !== account.id);
      if (ids.length) {
        const rows = await supabaseRest<Profile[]>("profiles", "select=id,display_name,handle,avatar_color&id=in.(" + ids.join(",") + ")");
        setProfiles(Object.fromEntries(rows.map(profile => [profile.id, profile])));
      } else setProfiles({});
      const unreadIds = messageRows.filter(m => !m.read_at).map(m => m.id);
      if (unreadIds.length) await supabaseRest("direct_messages", "id=in.(" + unreadIds.join(",") + ")", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ read_at: new Date().toISOString() }) });
    } catch (error) {
      toast("Couldn't load notifications", { tone: "error", description: error instanceof Error ? error.message : "Please try again." });
    } finally { setLoading(false); }
  };

  useEffect(() => { if (account) void load(); else setLoading(false); }, [account?.id]);

  const notices = useMemo<Notice[]>(() => {
    const messageNotices = messages.map(m => ({ id: "message-" + m.id, kind: "message" as const, title: "New message", description: m.body, created_at: m.created_at, unread: !m.read_at, profile: profiles[m.sender_id] }));
    const requestNotices = requests.map(r => {
      const otherId = r.sender_id === account?.id ? r.receiver_id : r.sender_id;
      const profile = profiles[otherId];
      const incoming = r.receiver_id === account?.id;
      const title = r.status === "pending" ? (incoming ? "Friend request received" : "Friend request sent") : r.status === "accepted" ? (incoming ? "Friend request accepted" : "Your request was accepted") : "Friend request declined";
      const description = r.status === "pending" ? (incoming ? (profile?.display_name || "A learner") + " wants to connect with you." : "Waiting for " + (profile?.display_name || "the other learner") + " to respond.") : r.status === "accepted" ? "You and " + (profile?.display_name || "this learner") + " are now connected." : (profile?.display_name || "The other learner") + " declined the friend request.";
      return { id: "request-" + r.id, kind: "request" as const, title, description, created_at: r.created_at, unread: r.status === "pending" && incoming, profile, request: r };
    });
    return [...messageNotices, ...requestNotices].sort((a,b) => b.created_at.localeCompare(a.created_at));
  }, [messages, requests, profiles, account?.id]);

  const respond = async (row: RequestRow, status: "accepted" | "declined") => {
    setBusyId(row.id);
    try {
      await supabaseRest("friend_requests", "id=eq." + row.id, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
      toast(status === "accepted" ? "Friend request accepted" : "Friend request declined");
      await load();
    } catch (error) { toast("Couldn't update request", { tone: "error", description: error instanceof Error ? error.message : "Please try again." }); }
    finally { setBusyId(null); }
  };

  if (!account) return <EmptyState icon={<Bell className="h-6 w-6" />} title="Your notifications" description="Sign in to see messages and friend request updates." action={<Button onClick={() => openAuth("signin")}>Sign in</Button>} />;

  const visible = notices.filter(n => filter === "all" || (filter === "messages" ? n.kind === "message" : n.kind === "request"));
  return <div className="mx-auto max-w-3xl space-y-5">
    <PageHeader title="Notifications" description="Messages, friend requests and updates from your study circle." />
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Notification filters">
      {([{ id: "all", label: "All" }, { id: "messages", label: "Messages" }, { id: "requests", label: "Friend requests" }] as const).map(item =>
        <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)} className={"rounded-xl px-4 py-2 text-sm font-medium " + (filter === item.id ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-text")}>{item.label}</button>
      )}
    </div>
    {loading ? <Card className="p-6 text-sm text-muted">Loading notifications…</Card> : visible.length === 0 ? <EmptyState icon={<Inbox className="h-6 w-6" />} title="You're all caught up" description="New messages and friend request updates will appear here." /> : <div className="space-y-3">
      {visible.map(notice => <Card key={notice.id} className="flex items-start gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">{notice.kind === "message" ? <MessageCircle className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{notice.title}</p>{notice.unread && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">New</span>}</div>
          <p className="mt-1 text-sm text-muted">{notice.profile?.display_name ? notice.profile.display_name + " · " : ""}{notice.description}</p>
          {notice.kind === "message" && <p className="mt-2 line-clamp-3 text-sm">{notice.description}</p>}
          {notice.kind === "request" && notice.request?.status === "pending" && notice.request.receiver_id === account.id && <div className="mt-3 flex gap-2"><Button size="sm" disabled={busyId === notice.request.id} onClick={() => void respond(notice.request!, "accepted")}><Check className="mr-1 h-4 w-4" />Accept</Button><Button size="sm" variant="secondary" disabled={busyId === notice.request.id} onClick={() => void respond(notice.request!, "declined")}><X className="mr-1 h-4 w-4" />Decline</Button></div>}
          <p className="mt-2 text-[11px] text-subtle">{new Date(notice.created_at).toLocaleString()}</p>
        </div>
      </Card>)}
    </div>}
  </div>;
}
