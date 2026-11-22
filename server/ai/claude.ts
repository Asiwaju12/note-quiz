/** Server-only Anthropic Claude REST client. */
import { AI_CONFIG } from "./provider.js";
type Msg = { role: "user" | "assistant"; content: string };
type Event = { type?: string; delta?: { type?: string; text?: string }; content?: Array<{type?:string;text?:string}>; error?: {message?:string} };
function key(): string { const value=process.env.ANTHROPIC_API_KEY?.trim(); if(!value) throw new Error("ANTHROPIC_API_KEY is not configured."); return value; }
async function call(body: Record<string,unknown>, signal?:AbortSignal):Promise<Response>{
 const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key(),"anthropic-version":"2026-10-21"},body:JSON.stringify({model:AI_CONFIG.claudeModel,...body}),signal});
 if(!r.ok){const detail=await r.text().catch(()=>"");throw new Error(`Claude HTTP ${r.status}: ${detail.slice(0,1000)}`);} return r;
}
export async function streamClaudeText(a:{system:string;contents:Array<{role:"user"|"model";parts:Array<{text:string}>}>;maxOutputTokens:number;signal:AbortSignal;onText:(s:string)=>void}):Promise<string>{
 const messages:Msg[]=a.contents.map(x=>({role:x.role==="model"?"assistant":"user",content:x.parts.map(p=>p.text).join("\n")}));
 const r=await call({system:a.system,messages,max_tokens:a.maxOutputTokens,stream:true},a.signal); if(!r.body)throw new Error("Claude returned an empty stream.");
 const reader=r.body.getReader(),decoder=new TextDecoder();let buffer="",all="";
 try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const blocks=buffer.split("\n\n");buffer=blocks.pop()??"";for(const block of blocks){const line=block.split("\n").find(x=>x.startsWith("data:"));if(!line)continue;const data=line.slice(5).trim();if(!data||data==="[DONE]")continue;const e=JSON.parse(data) as Event;if(e.type==="error")throw new Error(e.error?.message??"Claude stream failed.");if(e.type==="content_block_delta"&&e.delta?.type==="text_delta"&&e.delta.text){all+=e.delta.text;a.onText(e.delta.text);}}}}finally{reader.releaseLock();}
 if(!all)throw new Error("Claude returned no text.");return all;
}
export async function generateClaudeJson(a:{system:string;prompt:string;schema:Record<string,unknown>;maxOutputTokens:number;signal:AbortSignal}):Promise<{text:string;finishReason?:string}>{
 const prompt=[a.prompt,"Return only valid JSON, without markdown fences or commentary. It must conform to this JSON schema:",JSON.stringify(a.schema)].join("\n\n");
 const r=await call({system:a.system,messages:[{role:"user",content:prompt}],max_tokens:a.maxOutputTokens},a.signal);
 const data=await r.json() as {content?:Array<{type?:string;text?:string}>;stop_reason?:string};
 const text=data.content?.filter(x=>x.type==="text").map(x=>x.text??"").join("")??"";if(!text)throw new Error("Claude returned no structured content.");return {text,finishReason:data.stop_reason};
}
