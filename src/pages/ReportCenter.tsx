import { useEffect, useState } from "react";
import { Flag, ShieldAlert, Search, MessageSquareText, Users, Activity, Ban, RefreshCw } from "lucide-react";
import { useAccount } from "@/app/account";
import { supabaseRest } from "@/services/supabase";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toast";

type Report = { id:string; reporter_id:string; reported_user_id:string; message_id:string|null; reason:string; created_at:string; status:"new"|"under_review"|"resolved"|"dismissed"; review_notes:string|null };
type Profile = { id:string; display_name:string; handle:string; created_at?:string; onboarded?:boolean };
type UserBlock = { blocker_id:string; blocked_id:string; created_at:string };
type AdminTab = "overview" | "ai" | "reports" | "users" | "safety";
type AiActivity = { id:string; user_id:string; conversation_id:string; user_message:string; assistant_message:string; document_title:string|null; created_at:string };
const statusLabel: Record<Report["status"],string> = { new:"New", under_review:"Under review", resolved:"Resolved", dismissed:"Dismissed" };

export default function ReportCenter() {
  const { account, openAuth } = useAccount();
  const [admin,setAdmin]=useState(false);
  const [reports,setReports]=useState<Report[]>([]);
  const [aiActivity,setAiActivity]=useState<AiActivity[]>([]);
  const [users,setUsers]=useState<Profile[]>([]);
  const [blocks,setBlocks]=useState<UserBlock[]>([]);
  const [tab,setTab]=useState<AdminTab>("overview");
  const [userSearch,setUserSearch]=useState("");
  const [studentSearch,setStudentSearch]=useState("");
  const [activityDate,setActivityDate]=useState("");
  const [profiles,setProfiles]=useState<Record<string,Profile>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [filter,setFilter]=useState<"all"|Report["status"]>("new");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const load=async()=>{
    if(!account)return;
    setLoading(true);setError("");
    try{
      const membership=await supabaseRest<{user_id:string}[]>("moderation_admins","select=user_id&user_id=eq."+account.id);
      if(!membership.length){setAdmin(false);setReports([]);return;}
      setAdmin(true);
      const [data,activity,people,blockRows]=await Promise.all([
        supabaseRest<Report[]>("message_reports","select=id,reporter_id,reported_user_id,message_id,reason,created_at,status,review_notes&order=created_at.desc&limit=300"),
        supabaseRest<AiActivity[]>("ai_activity_events","select=id,user_id,conversation_id,user_message,assistant_message,document_title,created_at&order=created_at.desc&limit=500"),
        supabaseRest<Profile[]>("profiles","select=id,display_name,handle,created_at,onboarded&order=created_at.desc&limit=250"),
        supabaseRest<UserBlock[]>("user_blocks","select=blocker_id,blocked_id,created_at&order=created_at.desc&limit=300")
      ]);
      setReports(data);setAiActivity(activity);setUsers(people);setBlocks(blockRows);
      setProfiles(Object.fromEntries(people.map(p=>[p.id,p])));
    }catch(e){setError(e instanceof Error?e.message:"Could not load moderation reports.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{if(account)void load();else setLoading(false);},[account?.id]);
  const update=async(r:Report,status:Report["status"])=>{
    if(!account||!admin)return;
    setBusy(r.id);setError("");
    try{
      await supabaseRest("message_reports","id=eq."+r.id,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status,review_notes:notes[r.id]??r.review_notes,reviewed_by:account.id,reviewed_at:new Date().toISOString()})});
      setReports(current=>current.map(x=>x.id===r.id?{...x,status,review_notes:notes[r.id]??x.review_notes}:x));
      toast("Report updated");
    }catch(e){setError(e instanceof Error?e.message:"Could not update report.");}
    finally{setBusy(null);}
  };
  if(!account)return <EmptyState icon={<ShieldAlert className="h-6 w-6"/>} title="Report center" description="Sign in with an authorized moderator account." action={<Button onClick={()=>openAuth("signin")}>Sign in</Button>}/>;
  return <div className="space-y-5"><PageHeader title="Report center" description="Private moderation queue. Only accounts explicitly listed as moderators can review reports."/>
    {error&&<p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    {loading?<Card className="p-4"><p className="text-sm text-muted">Checking moderator access…</p></Card>:!admin?<Card className="p-5"><EmptyState icon={<ShieldAlert className="h-6 w-6"/>} title="Moderator access required" description="This page is restricted. Reports remain private to the reporter and authorized moderators."/></Card>:<>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><div className="flex items-center gap-2 text-muted"><Users className="h-4 w-4"/><span className="text-xs">Registered profiles</span></div><p className="mt-2 text-2xl font-semibold tabular-nums">{users.length}</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-muted"><Flag className="h-4 w-4"/><span className="text-xs">Open reports</span></div><p className="mt-2 text-2xl font-semibold tabular-nums">{reports.filter(r=>r.status==="new"||r.status==="under_review").length}</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-muted"><Activity className="h-4 w-4"/><span className="text-xs">AI interactions</span></div><p className="mt-2 text-2xl font-semibold tabular-nums">{aiActivity.length}</p></Card>
        <Card className="p-4"><div className="flex items-center gap-2 text-muted"><Ban className="h-4 w-4"/><span className="text-xs">User blocks</span></div><p className="mt-2 text-2xl font-semibold tabular-nums">{blocks.length}</p></Card>
      </div>
      <div className="flex flex-wrap gap-2">
        {([{id:"overview",label:"Overview"},{id:"ai",label:"AI activity"},{id:"reports",label:"Reports"},{id:"users",label:"Users"},{id:"safety",label:"Safety & blocks"}] as const).map(item=><Button key={item.id} size="sm" variant={tab===item.id?"primary":"secondary"} onClick={()=>setTab(item.id)}>{item.label}</Button>)}
        <Button size="sm" variant="ghost" icon={<RefreshCw className="h-4 w-4"/>} onClick={()=>void load()}>Refresh data</Button>
      </div>
      {tab==="overview"&&<div className="grid gap-3 md:grid-cols-2"><Card className="p-4"><h2 className="font-semibold">Moderation queue</h2><p className="mt-1 text-sm text-muted">{reports.filter(r=>r.status==="new"||r.status==="under_review").length} reports need attention.</p><Button className="mt-3" size="sm" onClick={()=>setTab("reports")}>Review reports</Button></Card><Card className="p-4"><h2 className="font-semibold">Student AI activity</h2><p className="mt-1 text-sm text-muted">{aiActivity.length} recorded questions and replies are available.</p><Button className="mt-3" size="sm" onClick={()=>setTab("ai")}>Open AI activity</Button></Card><Card className="p-4"><h2 className="font-semibold">User directory</h2><p className="mt-1 text-sm text-muted">Browse {users.length} registered student profiles and onboarding status.</p><Button className="mt-3" size="sm" onClick={()=>setTab("users")}>Browse users</Button></Card><Card className="p-4"><h2 className="font-semibold">Safety activity</h2><p className="mt-1 text-sm text-muted">{blocks.length} user block records are visible to moderators.</p><Button className="mt-3" size="sm" onClick={()=>setTab("safety")}>Review safety</Button></Card></div>}
      {tab==="users"&&<section className="space-y-3"><div><h2 className="text-lg font-semibold">Student directory</h2><p className="text-sm text-muted">Profile details and onboarding status. Account credentials are never shown here.</p></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"/><input value={userSearch} onChange={e=>setUserSearch(e.target.value)} placeholder="Search by student name or handle" className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm"/></div><div className="space-y-2">{users.filter(u=>`${u.display_name} ${u.handle}`.toLowerCase().includes(userSearch.trim().toLowerCase())).map(u=><Card key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><div><p className="text-sm font-semibold">{u.display_name} <span className="font-normal text-muted">@{u.handle}</span></p><p className="text-xs text-muted">Joined {u.created_at?new Date(u.created_at).toLocaleDateString():"—"} · {u.onboarded?"Onboarding complete":"Onboarding incomplete"}</p></div><Button size="sm" variant="secondary" onClick={()=>{setStudentSearch(u.display_name);setTab("ai");}}>View AI activity</Button></Card>)}</div></section>}
      {tab==="safety"&&<section className="space-y-3"><h2 className="text-lg font-semibold">Safety & block activity</h2><p className="text-sm text-muted">Review block relationships across the platform. This view is read-only; personal block controls remain with each account.</p>{blocks.length===0?<Card className="p-4"><EmptyState icon={<Ban className="h-5 w-5"/>} title="No block records" description="There are no user blocks to review."/></Card>:blocks.map((b,i)=><Card key={b.blocker_id+"-"+b.blocked_id+"-"+i} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm"><b>{profiles[b.blocker_id]?.display_name||"User"}</b> blocked <b>{profiles[b.blocked_id]?.display_name||"User"}</b></p><p className="text-xs text-muted">{new Date(b.created_at).toLocaleString()}</p></div><span className="text-xs text-muted">@{profiles[b.blocker_id]?.handle||"—"} → @{profiles[b.blocked_id]?.handle||"—"}</span></Card>)}</section>}
      {tab==="ai"&&<section className="space-y-3"><div><h2 className="text-lg font-semibold">AI activity</h2><p className="text-sm text-muted">Recent student questions and Recall AI replies. Only authorised moderators can see this section.</p></div><div className="flex flex-wrap gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"/><input value={studentSearch} onChange={e=>setStudentSearch(e.target.value)} placeholder="Search student name or @handle" className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm"/></div><input aria-label="Filter AI activity by date" type="date" value={activityDate} onChange={e=>setActivityDate(e.target.value)} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"/></div>{aiActivity.filter(x=>{const p=profiles[x.user_id];const term=studentSearch.trim().toLowerCase();const matches=!term||`${p?.display_name??""} ${p?.handle??""}`.toLowerCase().includes(term);return matches&&(!activityDate||x.created_at.slice(0,10)===activityDate);}).length===0?<Card className="p-4"><EmptyState icon={<MessageSquareText className="h-6 w-6"/>} title="No AI activity found" description="New authenticated Recall AI conversations will appear here after students use the assistant."/></Card>:<div className="space-y-3">{aiActivity.filter(x=>{const p=profiles[x.user_id];const term=studentSearch.trim().toLowerCase();return (!term||`${p?.display_name??""} ${p?.handle??""}`.toLowerCase().includes(term))&&(!activityDate||x.created_at.slice(0,10)===activityDate);}).map(x=><Card key={x.id} className="space-y-2 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{profiles[x.user_id]?.display_name||"Student"} <span className="font-normal text-muted">@{profiles[x.user_id]?.handle||"unknown"}</span></p>{x.document_title&&<p className="text-xs text-muted">Study document: {x.document_title}</p>}</div><time className="text-xs text-muted">{new Date(x.created_at).toLocaleString()}</time></div><div className="rounded-xl bg-surface-2 p-3"><p className="mb-1 text-xs font-semibold text-muted">STUDENT ASKED</p><p className="whitespace-pre-wrap break-words text-sm">{x.user_message}</p></div><div className="rounded-xl border border-border p-3"><p className="mb-1 text-xs font-semibold text-muted">RECALL AI REPLIED</p><p className="whitespace-pre-wrap break-words text-sm">{x.assistant_message}</p></div><p className="text-[11px] text-muted">Conversation {x.conversation_id}</p></Card>)}</div>}</section>{tab==="reports"&&<><div className="flex flex-wrap gap-2">{(["new","under_review","resolved","dismissed","all"] as const).map(s=><Button key={s} size="sm" variant={filter===s?"primary":"secondary"} onClick={()=>setFilter(s)}>{s==="all"?"All":s==="under_review"?"Under review":statusLabel[s]}{s!=="all"?" · "+reports.filter(r=>r.status===s).length:" · "+reports.length}</Button>)}</div>
      {reports.filter(r=>filter==="all"||r.status===filter).length===0?<Card className="p-4"><EmptyState icon={<Flag className="h-6 w-6"/>} title="No reports in this view" description="New reports submitted by users will appear here."/></Card>:reports.filter(r=>filter==="all"||r.status===filter).map(r=><Card key={r.id} className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{statusLabel[r.status]} · {new Date(r.created_at).toLocaleString()}</p><p className="mt-1 text-xs text-muted">Reported: {profiles[r.reported_user_id]?.display_name||"User"} (@{profiles[r.reported_user_id]?.handle||"unknown"})</p><p className="text-xs text-muted">Reporter: {profiles[r.reporter_id]?.display_name||"User"} (@{profiles[r.reporter_id]?.handle||"unknown"})</p></div>{r.message_id&&<span className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted">Message ID attached</span>}</div><p className="whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 text-sm">{r.reason}</p><textarea value={notes[r.id]??r.review_notes??""} onChange={e=>setNotes(v=>({...v,[r.id]:e.target.value}))} maxLength={2000} placeholder="Private moderator notes…" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"/><div className="flex flex-wrap gap-2">{(["under_review","resolved","dismissed"] as const).map(s=><Button key={s} size="sm" variant={r.status===s?"primary":"secondary"} disabled={!!busy} loading={busy===r.id&&r.status===s} onClick={()=>void update(r,s)}>{statusLabel[s]}</Button>)}</div></Card>)}
      </>}
    </>}
  </div>;
}
