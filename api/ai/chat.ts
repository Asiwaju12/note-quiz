import { friendlyAiError, hasGemini, isAiConfigured } from "../../server/ai/provider.js";
import { streamGeminiText } from "../../server/ai/gemini.js";
import { TUTOR_SYSTEM, buildChatUserContent } from "../../server/ai/prompts.js";
import { authorize, clientKey, errorResponse, HttpError, ndjsonStream, rateLimit, readJson } from "../../server/http.js";
import { MAX_CHAT_CONTEXT_CHARS, TUTOR_MODES, type ChatRequest } from "../../src/lib/ai/contract.js";
const MAX_TURNS=30, MAX_MESSAGE_CHARS=12_000;

function validate(body:ChatRequest):ChatRequest {
 if(!body||!Array.isArray(body.messages)||!body.messages.length) throw new HttpError(400,"No messages provided.");
 const messages=body.messages.slice(-MAX_TURNS).filter(turn=>(turn.role==="user"||turn.role==="assistant")&&typeof turn.content==="string"&&turn.content.trim()).map(turn=>({role:turn.role,content:turn.content.slice(0,MAX_MESSAGE_CHARS)}));
 while(messages.length&&messages[0].role!=="user") messages.shift();
 if(!messages.length||messages[messages.length-1].role!=="user") throw new HttpError(400,"The last message must be from the student.");
 const mode=TUTOR_MODES.some(item=>item.id===body.mode)?body.mode:undefined;
 let budget=MAX_CHAT_CONTEXT_CHARS;
 const passages=(body.document?.passages??[]).filter(p=>typeof p.text==="string"&&Number.isFinite(p.page)).filter(p=>{budget-=p.text.length;return budget>=0;}).slice(0,12);
 return {messages,conversationId:typeof body.conversationId==="string"?body.conversationId.slice(0,120):undefined,mode,document:body.document?{title:String(body.document.title??"Document").slice(0,200),passages}:undefined,mistakes:Array.isArray(body.mistakes)?body.mistakes.slice(0,10):undefined};
}

/** Store only completed authenticated student/assistant turns; failures never block the AI reply. */
async function saveAiActivity(request:Request,userId:string,body:ChatRequest,answer:string):Promise<void> {
 const url=process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
 const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
 const question=[...body.messages].reverse().find(m=>m.role==="user")?.content;
 if(!url||!key||!token||!question||!answer.trim()) return;
 const response=await fetch(`${url.replace(/\/$/,"")}/rest/v1/ai_activity_events`,{
  method:"POST",
  headers:{apikey:key,Authorization:`Bearer ${token}`,"Content-Type":"application/json",Prefer:"return=minimal"},
  body:JSON.stringify({user_id:userId,conversation_id:body.conversationId||"general",user_message:question.slice(0,12000),assistant_message:answer.slice(0,30000),document_title:body.document?.title?.slice(0,200)||null}),
  cache:"no-store"
 });
 if(!response.ok) throw new Error(`AI activity log failed (${response.status})`);
}

/** Gemini primary; stream only the generated text and record it for authenticated moderation. */
export async function POST(request:Request):Promise<Response> {
 if(!isAiConfigured()) return errorResponse(503,"Recall AI isn't connected yet. Add GEMINI_API_KEY to the server environment.","not_configured");
 let body:ChatRequest;
 let userId:string|null=null;
 try {
  const auth=await authorize(request);
  userId=auth.userId;
  rateLimit(clientKey(request,userId),30);
  body=validate(await readJson<ChatRequest>(request));
 } catch(error) {
  if(error instanceof HttpError) return errorResponse(error.status,error.message);
  return errorResponse(400,"Invalid request.");
 }
 const contents=body.messages.slice(0,-1).map(turn=>({role:turn.role==="assistant"?"model" as const:"user" as const,parts:[{text:turn.content}]}));
 contents.push({role:"user",parts:[{text:buildChatUserContent(body)}]});
 return ndjsonStream(async(send,signal)=>{
  let generated="";
  try {
   if(!hasGemini()) throw new Error("Gemini is not configured.");
   await streamGeminiText({system:TUTOR_SYSTEM,contents,maxOutputTokens:8192,signal,onText:value=>{generated+=value;send({t:"delta",text:value});}});
   if(userId) {
    try { await saveAiActivity(request,userId,body,generated); }
    catch(logError) { console.error("[api/ai/chat] activity logging failed",logError); }
   }
   send({t:"done",stop:"STOP"});
  } catch(error) {
   if(signal.aborted) return;
   console.error("[api/ai/chat]",error);
   const friendly=friendlyAiError(error);
   send({t:"error",message:friendly.message,code:friendly.code});
  }
 },request.signal);
}
import type {IncomingMessage,ServerResponse} from "node:http";
import {invokeVercelHandler} from "../../server/vercel-adapter.js";
export default async function handler(request:IncomingMessage,response:ServerResponse):Promise<void>{await invokeVercelHandler(request,response,POST);}
