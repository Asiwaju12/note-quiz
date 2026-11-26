import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Copy, MessageCircle, Plus, Users, Zap } from "lucide-react";
import { useAccount } from "@/app/account";
import { useCollection } from "@/data/db";
import type { SavedDeck } from "@/data/models";
import { supabaseAuth } from "@/services/supabase";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toast";

type RoomState = {
  id: string; room_code: string; host_id: string; status: "lobby" | "playing" | "finished" | "cancelled";
  question_index: number; question_started_at: string | null; question_duration_seconds: number;
  question_count: number; question: { id: string; prompt: string; options: string[]; explanation: string; category: string; type: string; index: number } | null;
  standings: Array<{ user_id: string; display_name: string; score: number }>;
};
let realtimeClient: SupabaseClient | null = null;
async function client() {
  const session = await supabaseAuth.getSession();
  if (!session) throw new Error("Please sign in to play multiplayer.");
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  if (!realtimeClient) realtimeClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await realtimeClient.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  return realtimeClient;
}
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await client();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
export default function Multiplayer() {
  const { roomId } = useParams();\n  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { account, openAuth } = useAccount();
  const decks = useCollection<SavedDeck>("decks");
  const playable = useMemo(() => decks.filter(d => d.questions.length > 0), [decks]);
  const [selectedDeck, setSelectedDeck] = useState(() => searchParams.get("deck") ?? "");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<{correct:boolean;points:number;answer:unknown;explanation:string}|null>(null);\n  const [clock, setClock] = useState(Date.now());\n  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 400); return () => window.clearInterval(timer); }, []);
  const isHost = Boolean(account && room && account.id === room.host_id);
  const myScore = room?.standings.find(s => s.user_id === account?.id)?.score ?? 0;
  const meAnswered = Boolean(result);\n  const remaining = room?.question_started_at ? Math.max(0, room.question_duration_seconds - Math.floor((clock - new Date(room.question_started_at).getTime()) / 1000)) : room?.question_duration_seconds ?? 0;

  const refresh = async (id = roomId) => {
    if (!id) return;
    const next = await rpc<RoomState>("get_study_room_state", { p_room_id: id });
    setRoom(next);
  };
  useEffect(() => {
    if (!account) return;
    if (!roomId) return;
    let alive = true;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    void (async () => {
      try {
        await refresh(roomId);
        const supabase = await client();
        channel = supabase.channel(`study-room:${roomId}`, { config: { private: true, broadcast: { self: false }, presence: { key: account.id } } });
        channel.on("postgres_changes", { event: "*", schema: "public", table: "study_rooms", filter: `id=eq.${roomId}` }, () => { if (alive) void refresh(roomId); });
        channel.on("postgres_changes", { event: "*", schema: "public", table: "study_room_members", filter: `room_id=eq.${roomId}` }, () => { if (alive) void refresh(roomId); });
        channel.subscribe();
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "Could not load room."); }
    })();
    return () => { alive = false; if (channel && realtimeClient) void realtimeClient.removeChannel(channel); };
  }, [account?.id, roomId]);

  useEffect(() => {
    setChosen(null); setResult(null);
  }, [room?.question_index, room?.status]);

  const createRoom = async () => {
    if (!account) { openAuth("signin"); return; }
    const deck = playable.find(d => d.id === selectedDeck);
    if (!deck) { setError("Choose a saved deck first."); return; }
    if (deck.questions.length > 60) { setError("Multiplayer rooms support up to 60 questions. Choose a shorter deck."); return; }
    setLoading(true); setError("");
    try {
      const id = await rpc<string>("create_study_room", { p_room_code: roomCode(), p_deck_title: deck.title, p_display_name: account.name, p_question_duration: 20 });
      await rpc("start_study_room", { p_room_id: id, p_questions: deck.questions });
      navigate(`/multiplayer/${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Room could not be created."); }
    finally { setLoading(false); }
  };
  const joinRoom = async () => {
    if (!account) { openAuth("signin"); return; }
    setLoading(true); setError("");
    try {
      const id = await rpc<string>("join_study_room_by_code", { p_room_code: code.trim().toUpperCase(), p_display_name: account.name });
      navigate(`/multiplayer/${id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join room."); }
    finally { setLoading(false); }
  };
  const answer = async (index: number) => {
    if (!room || meAnswered || room.status !== "playing") return;
    setChosen(index); setLoading(true); setError("");
    try {
      const next = await rpc<typeof result>("submit_study_room_answer", { p_room_id: room.id, p_question_index: room.question_index, p_answer: { answer: index } });
      setResult(next); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Answer could not be submitted."); }
    finally { setLoading(false); }
  };
  const nextQuestion = async () => {
    if (!room) return;
    setLoading(true);
    try { const state = await rpc<RoomState>("advance_study_room", { p_room_id: room.id }); setRoom(state); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not advance."); }
    finally { setLoading(false); }
  };

  if (!account) return <EmptyState icon={<Users className="h-6 w-6" />} title="Play and chat together" description="Sign in to create a room, join friends, and send messages." action={<Button onClick={() => openAuth("signin")}>Sign in</Button>} />;
  if (!roomId) return (
    <div className="space-y-6">
      <PageHeader title="Multiplayer study" description="Race through the same study questions together." />
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4"/> Create a live room</div>
        <label className="block text-sm text-muted">Choose a saved deck</label>
        <select className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm" value={selectedDeck} onChange={e => setSelectedDeck(e.target.value)}>
          <option value="">Select deck…</option>
          {playable.map(d => <option key={d.id} value={d.id}>{d.title} · {d.questions.length} questions</option>)}
        </select>
        <p className="text-xs text-muted">Everyone gets each question at the same time. Correct answers earn points, with a speed bonus.</p>
        <Button onClick={() => void createRoom()} disabled={loading || !selectedDeck} className="w-full">{loading ? "Creating room…" : "Create room"}</Button>
      </Card>
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4"/> Join a room</div>
        <input className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-center font-mono uppercase tracking-[0.25em]" maxLength={6} placeholder="6-DIGIT CODE" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}/>
        <Button variant="secondary" onClick={() => void joinRoom()} disabled={loading || code.length !== 6} className="w-full">{loading ? "Joining…" : "Join room"}</Button>
      </Card>
      <Link className="inline-flex items-center gap-2 text-sm text-accent-text" to="/messages"><MessageCircle className="h-4 w-4"/> Open messages</Link>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
  if (!room) return <div className="py-10 text-sm text-muted">{error || "Connecting to room…"}</div>;
  return (
    <div className="space-y-5">
      <PageHeader title={room.status === "finished" ? "Match complete" : room.status === "lobby" ? "Room lobby" : "Live match"} description={room.status === "playing" ? `Question ${room.question_index + 1} of ${room.question_count}` : "Invite friends with this room code."} />
      <Card className="flex items-center justify-between p-4">
        <div><p className="text-xs text-muted">Room code</p><p className="font-mono text-2xl font-bold tracking-[0.2em]">{room.room_code}</p></div>
        <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard.writeText(room.room_code); toast("Room code copied"); }}><Copy className="mr-2 h-4 w-4"/> Copy</Button>
      </Card>
      {room.status === "playing" && room.question && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between text-xs text-muted"><span>Question {room.question_index + 1}</span><span className={remaining <= 5 ? "font-semibold text-danger" : ""}>{remaining}s left</span></div>
          <h2 className="text-lg font-semibold leading-snug">{room.question.prompt}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {room.question.options.map((option,i) => <Button key={i} variant={chosen===i ? "primary" : "secondary"} disabled={loading || meAnswered || remaining <= 0} onClick={() => void answer(i)} className="min-h-12 justify-start whitespace-normal text-left">{String.fromCharCode(65+i)}. {option}</Button>)}
          </div>
          {result && <div className="rounded-xl bg-surface-2 p-3 text-sm"><p className={result.correct ? "text-success font-semibold" : "text-danger font-semibold"}>{result.correct ? `Correct! +${result.points} points` : "Not quite."}</p><p className="mt-1 text-muted">{result.explanation}</p></div>}
          {isHost && <Button onClick={() => void nextQuestion()} disabled={loading || remaining > 0} className="w-full">{room.question_index+1===room.question_count ? "Finish match" : "Next question"}</Button>}
        {!isHost && <p className="text-xs text-muted">Waiting for the host to move to the next question.</p>}
      </Card>
      )}
      {room.status === "finished" && <Card className="p-5 text-center"><Zap className="mx-auto mb-2 h-8 w-8 text-accent-text"/><h2 className="text-xl font-semibold">Final scores</h2><p className="mt-1 text-sm text-muted">You scored {myScore} points.</p></Card>}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Leaderboard</h2>
        {room.standings.map((player,i)=><div key={player.user_id} className="flex items-center justify-between text-sm"><span>{i+1}. {player.display_name}{player.user_id===room.host_id?" · Host":""}</span><strong className="tabular-nums">{player.score}</strong></div>)}
      </Card>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button variant="ghost" onClick={() => navigate("/multiplayer")}>Leave room</Button>
    </div>
  );
}
