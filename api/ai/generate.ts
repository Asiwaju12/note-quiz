import { friendlyAiError, hasGemini, isAiConfigured } from "../../server/ai/provider.js";
import { generateGeminiJson } from "../../server/ai/gemini.js";
import { GENERATE_SYSTEM, SCHEMAS, buildGenerateUserContent } from "../../server/ai/prompts.js";
import { authorize, clientKey, errorResponse, HttpError, ndjsonStream, rateLimit, readJson } from "../../server/http.js";
import { MAX_GENERATE_CHARS, type GenerateRequest, type GenerateTask } from "../../src/lib/ai/contract.js";
const TASKS:GenerateTask[]=["summary","notes","keyTerms","guide","flashcards","questions","plan"];
function validate(body:GenerateRequest):GenerateRequest{
 if(!body||!TASKS.includes(body.task))throw new HttpError(400,"Unknown generation task.");
 if(body.task!=="plan"){if(!body.document||typeof body.document.text!=="string"||body.document.text.trim().length<40)throw new HttpError(400,"There isn't enough document text to work with.");if(body.document.text.length>MAX_GENERATE_CHARS)throw new HttpError(413,"This document section is too long to process in one request.");}
 else if(!body.options?.plan)throw new HttpError(400,"Plan details are missing.");return body;
}
/** Gemini-only generation endpoint. Basic Mode remains available in the client when AI is unavailable. */
export async function POST(request:Request):Promise<Response>{
 if(!isAiConfigured())return errorResponse(503,"Recall AI isn't connected yet. Add GEMINI_API_KEY to the server environment.","not_configured");
 let body:GenerateRequest;
 try{const {userId}=await authorize(request);rateLimit(clientKey(request,userId),12);body=validate(await readJson<GenerateRequest>(request,1_200_000));}
 catch(error){if(error instanceof HttpError)return errorResponse(error.status,error.message);return errorResponse(400,"Invalid request.");}
 return ndjsonStream(async(send,signal)=>{
  const keepAlive=setInterval(()=>send({t:"ping"}),5000);
  try{
   const args={system:GENERATE_SYSTEM,prompt:buildGenerateUserContent(body),schema:SCHEMAS[body.task],maxOutputTokens:16000,signal};
   const parseResult=(value:string):unknown=>{const cleaned=value.trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");return JSON.parse(cleaned);};
   if(!hasGemini())throw new Error("Gemini is not configured.");
   const result=await generateGeminiJson(args);
   const data=parseResult(result.text);
   if(result.finishReason==="MAX_TOKENS"||result.finishReason==="max_tokens"){send({t:"error",code:"too_long",message:"The output was too long. Try a smaller section or fewer items."});return;}
   send({t:"result",data});send({t:"done",stop:result.finishReason??undefined});
  }catch(error){if(signal.aborted)return;console.error("[api/ai/generate]",error);const friendly=friendlyAiError(error);send({t:"error",message:friendly.message,code:friendly.code});}
  finally{clearInterval(keepAlive);}
 },request.signal);
}
import type {IncomingMessage,ServerResponse} from "node:http";
import {invokeVercelHandler} from "../../server/vercel-adapter.js";
export default async function handler(request:IncomingMessage,response:ServerResponse):Promise<void>{await invokeVercelHandler(request,response,POST);}
