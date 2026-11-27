import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type Req = IncomingMessage & { body?: any };
function reply(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
export default async function handler(req: Req, res: ServerResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return reply(res, 405, { error: "Method not allowed" }); }
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!token || !url || !serviceKey || !publicKey || !privateKey) return reply(res, 401, { error: "Push service is not configured or you are not signed in." });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return reply(res, 401, { error: "Sign in again to send notifications." });
    const senderId = userData.user.id;
    const { type, eventId } = req.body || {};
    if (!["message", "friend_request"].includes(type) || typeof eventId !== "string" || eventId.length > 100) return reply(res, 400, { error: "Invalid notification event." });
    let receiverId = "";
    let title = "Recall Quiz";
    let body = "You have a new update.";
    let href = "/messages";
    if (type === "message") {
      const { data, error } = await admin.from("direct_messages").select("id,sender_id,receiver_id,body").eq("id", eventId).maybeSingle();
      if (error || !data || data.sender_id !== senderId) return reply(res, 403, { error: "Message event could not be verified." });
      receiverId = data.receiver_id;
      title = "New message";
      body = String(data.body || "You received a message.").slice(0, 140);
    } else {
      const { data, error } = await admin.from("friend_requests").select("id,sender_id,receiver_id,status").eq("id", eventId).maybeSingle();
      if (error || !data || data.sender_id !== senderId || data.status !== "pending") return reply(res, 403, { error: "Friend request event could not be verified." });
      receiverId = data.receiver_id;
      title = "New friend request";
      body = "Someone wants to connect with you on Recall Quiz.";
    }
    const { data: rows, error: subError } = await admin.from("web_push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", receiverId);
    if (subError) return reply(res, 503, { error: "Could not load notification subscriptions." });
    if (!rows?.length) return reply(res, 200, { sent: 0 });
    webpush.setVapidDetails("mailto:support@recall-quiz-study.vercel.app", publicKey, privateKey);
    const payload = JSON.stringify({ title, body, url: href, tag: type + "-" + eventId });
    const results = await Promise.allSettled(rows.map(async sub => {
      try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload); }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("web_push_subscriptions").delete().eq("endpoint", sub.endpoint); else throw e; }
    }));
    return reply(res, 200, { sent: results.filter(r => r.status === "fulfilled").length });
  } catch (error) {
    console.error("push-send", error);
    return reply(res, 500, { error: "Notification delivery failed." });
  }
}
