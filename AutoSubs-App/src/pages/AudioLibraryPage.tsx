import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sttApi } from "@/stt/api";
import type { HistoryItem } from "@/stt/types";
import { FolderOpen, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function AudioLibraryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  async function load() { try { setItems((await sttApi.historyList()).filter((i) => i.hasAudio)); } catch (e) { toast.error(String(e)); } }
  useEffect(() => { load(); }, []);
  async function del(id: string) { if (!confirm("Delete this record and its audio file?")) return; await sttApi.historyDelete(id, true); load(); }
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold">Audio Library</h1><p className="text-sm text-muted-foreground">Manage recorded and imported audio files linked to transcriptions.</p></div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Audio Files</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-4 p-3 border rounded-md">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{i.name}</div>
                <div className="text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleString()} • {Math.round(i.durationSeconds)}s • {i.model}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => del(i.id)}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-sm text-muted-foreground py-10 text-center flex flex-col items-center gap-2"><FolderOpen className="h-8 w-8" />No audio files yet.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
