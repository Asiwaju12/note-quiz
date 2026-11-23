import { useEffect, useState } from "react";
import { Download, FileImage, FileText, Loader2 } from "lucide-react";
import type { StudyDocument } from "@/data/models";
import { getDocumentFile, getDocumentText } from "@/data/repos";
import { Button } from "@/components/ui/Button";

const IMAGE = /\.(png|jpe?g|webp|bmp|tiff?)$/i;
const LABEL: Record<string,string> = {
  docx:"Word document", pptx:"PowerPoint presentation", xlsx:"Excel spreadsheet",
  txt:"Text file", md:"Markdown file", csv:"CSV spreadsheet", rtf:"Rich text document",
  json:"JSON file", html:"HTML document", htm:"HTML document",
};

export function StudyFileViewer({ doc }: { doc: StudyDocument }) {
  const [fileUrl,setFileUrl]=useState("");
  const [text,setText]=useState<string[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    let objectUrl="";
    void (async()=>{
      try {
        const file=await getDocumentFile(doc.id);
        if(!file) throw new Error("The original file isn't available in this browser. It may have been uploaded on another device.");
        if(IMAGE.test(doc.fileName)) {
          objectUrl=URL.createObjectURL(file);
          if(active) setFileUrl(objectUrl);
        }
        const extracted=await getDocumentText(doc.id);
        if(active) setText(extracted?.pages??[]);
      } catch(e) { if(active) setError(e instanceof Error?e.message:"Unable to open this file."); }
    })();
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[doc.id,doc.fileName]);
  const extension=doc.fileName.split(".").pop()?.toLowerCase()??"";
  const title=LABEL[extension]??"Study document";
  const plain=text.join("\n\n");
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3 min-w-0">
        {IMAGE.test(doc.fileName)?<FileImage className="h-5 w-5 shrink-0 text-accent-text"/>:<FileText className="h-5 w-5 shrink-0 text-accent-text"/>}
        <div className="min-w-0"><p className="text-sm font-semibold">{title}</p><p className="truncate text-xs text-subtle">{doc.fileName}</p></div>
      </div>
      <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4"/>} onClick={()=>void getDocumentFile(doc.id).then(file=>{if(!file)return;const url=URL.createObjectURL(file);const a=document.createElement("a");a.href=url;a.download=doc.fileName;a.click();URL.revokeObjectURL(url);})}>Download original</Button>
    </div>
    {error?<p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>:IMAGE.test(doc.fileName)?(
      fileUrl?<div className="rounded-2xl border border-border bg-surface-2 p-3 text-center"><img src={fileUrl} alt={doc.title} className="mx-auto max-h-[75vh] max-w-full rounded-lg object-contain"/></div>:<div className="grid min-h-48 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-accent"/></div>
    ):plain?(
      <article className="rounded-2xl border border-border bg-surface p-5 sm:p-7"><div className="mb-4 text-xs text-subtle">Extracted text · {text.length} sections</div><div className="space-y-6">{text.map((page,i)=><section key={i} className="space-y-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{extension==="pptx"?"Slide":"Section"} {i+1}</p><p className="whitespace-pre-wrap text-sm leading-7 text-text">{page}</p></section>)}</div></article>
    ):<div className="rounded-2xl border border-border p-8 text-center text-sm text-muted">No text preview is available for this file.</div>}
  </div>;
}
