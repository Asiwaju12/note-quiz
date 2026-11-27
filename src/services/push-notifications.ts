import { supabaseAuth, supabaseRest } from "@/services/supabase";
const publicKey = import.meta.env.VITE_PUSH_PUBLIC_KEY as string | undefined;
function decodeKey(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export async function enablePushNotifications(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Push notifications are not supported in this browser.");
  if (!publicKey) throw new Error("Push notifications are not configured yet.");
  if (Notification.permission === "denied") throw new Error("Notifications are blocked in browser settings. Allow them for Recall Quiz first.");
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Please allow notifications to enable message alerts.");
  const session = await supabaseAuth.getSession();
  if (!session) throw new Error("Sign in to enable notifications.");
  const registration = await navigator.serviceWorker.register("/recall-push-sw.js");
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Your browser did not provide a valid push subscription.");
  await supabaseRest("web_push_subscriptions", "", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: session.user.id, endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, expiration_time: subscription.expirationTime }) });
}
export async function disablePushNotifications(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration("/recall-push-sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await supabaseRest("web_push_subscriptions", "endpoint=eq." + encodeURIComponent(subscription.endpoint), { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await subscription.unsubscribe();
}
export async function pushEnabled(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration("/recall-push-sw.js");
  return Boolean(await registration?.pushManager.getSubscription());
}
export async function sendPushEvent(type: "message" | "friend_request", eventId: string): Promise<void> {
  const session = await supabaseAuth.getSession();
  if (!session) return;
  await fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token }, body: JSON.stringify({ type, eventId }) });
}
