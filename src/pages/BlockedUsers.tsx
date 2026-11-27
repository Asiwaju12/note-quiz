import { useEffect, useState } from "react";
import { Ban, UserRoundX } from "lucide-react";
import { useAccount } from "@/app/account";
import { supabaseRest } from "@/services/supabase";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toast";

type BlockRow = { blocker_id: string; blocked_id: string; created_at: string };
type Profile = { id: string; display_name: string; handle: string; avatar_color: string };

export default function BlockedUsers() {
  const { account, openAuth } = useAccount();
  const [rows, setRows] = useState<BlockRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    if (!account) return;
    setLoading(true); setError("");
    try {
      const blocks = await supabaseRest<BlockRow[]>("user_blocks", "select=blocker_id,blocked_id,created_at&blocker_id=eq." + account.id + "&order=created_at.desc");
      setRows(blocks);
      const ids = blocks.map(b => b.blocked_id);
      if (ids.length) {
        const people = await supabaseRest<Profile[]>("profiles", "select=id,display_name,handle,avatar_color&id=in.(" + ids.join(",") + ")");
        setProfiles(Object.fromEntries(people.map(p => [p.id, p])));
      } else setProfiles({});
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load your blocked users."); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (account) void load(); else setLoading(false); }, [account?.id]);
  const unblock = async (id: string) => {
    if (!account) return;
    setBusyId(id);
    try {
      await supabaseRest("user_blocks", "blocker_id=eq." + account.id + "&blocked_id=eq." + id, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      setRows(current => current.filter(r => r.blocked_id !== id));
      toast("User unblocked");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not unblock user."); }
    finally { setBusyId(null); }
  };
  if (!account) return <EmptyState icon={<Ban className="h-6 w-6"/>} title="Blocked users" description="Sign in to view and manage people you've blocked." action={<Button onClick={() => openAuth("signin")}>Sign in</Button>} />;
  return <div className="space-y-5"><PageHeader title="Blocked users" description="Manage who you've blocked. Unblocking lets them request to connect again; it does not automatically restore a friendship."/>
    {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    <Card className="space-y-3 p-4">{loading ? <p className="text-sm text-muted">Loading your block list…</p> : rows.length === 0 ? <EmptyState icon={<UserRoundX className="h-6 w-6"/>} title="No blocked users" description="People you block from a conversation will appear here."/> : rows.map(row => { const p=profiles[row.blocked_id]; return <div key={row.blocked_id} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full text-xs font-bold" style={{background:p?.avatar_color||"var(--surface-3)"}}>{p?.handle?.slice(0,2)||"RQ"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p?.display_name||"Recall Quiz user"}</p><p className="truncate text-xs text-muted">{p?.handle ? "@"+p.handle : "Blocked account"}</p></div><Button size="sm" variant="secondary" loading={busyId===row.blocked_id} disabled={!!busyId} onClick={()=>void unblock(row.blocked_id)}>Unblock</Button></div>;})}</Card>
  </div>;
}
