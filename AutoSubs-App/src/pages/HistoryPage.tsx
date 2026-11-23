import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sttApi } from "@/stt/api";
import type { HistoryItem, HistoryRecord } from "@/stt/types";
import { Trash2, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { save } from "@tauri-apps/plugin-dialog";

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    try { setItems(await sttApi.historyList()); } catch (e) { toast.error(String(e)); }
  }
  useEffect(() => { load(); }, []);

  async function openItem(id: string) {
    const rec = await sttApi.historyGet(id);
    if (rec) { setSelected(rec); setName(rec.name); setText(rec.transcriptText); }
  }

  async function saveItem() {
    if (!selected) return;
    const updated: HistoryRecord = { ...selected, name, transcriptText: text, preview: text.slice(0, 160) } as any;
    await sttApi.historySave(updated);
    setSelected(updated);
    toast.success("Saved");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this transcription?")) return;
    await sttApi.historyDelete(id, false);
    if (selected?.id === id) setSelected(null);
    load();
  }

  async function exportFmt(format: "txt" | "srt" | "vtt" | "docx") {
    if (!selected) return;
    const path = await save({ defaultPath: `${selected.name}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
    if (!path) return;
    const segments = JSON.parse(selected.transcriptJson || "[]");
    await sttApi.exportTranscript({ path, format, segments, includeTimestamps: format !== "txt" && format !== "docx" });
    toast.success(`Exported ${format.toUpperCase()}`);
  }

  const filtered = items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.preview.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Transcription History</h1><p className="text-sm text-muted-foreground">Search, open, edit, and export previous transcriptions.</p></div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-base">Records</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="space-y-2 max-h-[600px] overflow-auto">
              {filtered.map((i) => (
                <div key={i.id} className={`p-3 border rounded-md cursor-pointer ${selected?.id === i.id ? "border-primary bg-muted/40" : ""}`} onClick={() => openItem(i.id)}>
                  <div className="flex items-center justify-between gap-2"><div className="font-medium text-sm truncate">{i.name}</div><Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(i.id); }}><Trash2 className="h-4 w-4" /></Button></div>
                  <div className="text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleString()} • {i.language} • {i.model}</div>
                  <div className="text-xs text-muted-foreground truncate mt-1">{i.preview}</div>
                </div>
              ))}
              {filtered.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">No history yet.</div>}
            </div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base">Transcript Editor</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={saveItem} disabled={!selected}><Save className="h-4 w-4 mr-1" />Save</Button>
              <Button size="sm" variant="outline" onClick={() => exportFmt("txt")} disabled={!selected}>TXT</Button>
              <Button size="sm" variant="outline" onClick={() => exportFmt("docx")} disabled={!selected}>DOCX</Button>
              <Button size="sm" variant="outline" onClick={() => exportFmt("srt")} disabled={!selected}>SRT</Button>
              <Button size="sm" variant="outline" onClick={() => exportFmt("vtt")} disabled={!selected}>VTT</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" disabled={!selected} />
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[520px] text-base leading-7" placeholder="Select a transcription from history..." disabled={!selected} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
