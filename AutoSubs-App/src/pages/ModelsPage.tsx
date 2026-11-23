import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useModels } from "@/contexts/ModelsContext";
import { sttApi } from "@/stt/api";
import type { HardwareInfo } from "@/stt/types";
import { Download, Trash2, XCircle, HardDrive, Cpu, MemoryStick } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface DownloadDetail {
  repoId: string;
  filename: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  bytesPerSec: number;
  etaSeconds?: number | null;
  label: string;
}

function fmtBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
function fmtEta(s?: number | null) { if (!s || !isFinite(s)) return "-"; const m = Math.floor(s / 60); const sec = Math.round(s % 60); return m > 0 ? `${m}m ${sec}s` : `${sec}s`; }

export default function ModelsPage() {
  const { t } = useTranslation();
  const { modelsState, checkDownloadedModels, handleDeleteModel } = useModels();
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [detail, setDetail] = useState<DownloadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { sttApi.getHardwareInfo().then(setHw).catch(() => {}); }, []);
  useEffect(() => {
    const u = listen<DownloadDetail>("model-download-progress", (e) => setDetail(e.payload));
    return () => { u.then((f) => f()); };
  }, []);

  const whisperModels = useMemo(() => modelsState.filter((m) => m.engine === "whisper" || m.value.includes("whisper") || ["tiny","base","small","medium","large-v3","large-v3-turbo","tiny.en","base.en","small.en","medium.en"].includes(m.value)), [modelsState]);
  const shown = whisperModels.length ? whisperModels : modelsState.slice(0, 12);

  async function downloadModel(modelValue: string) {
    setError(null); setDownloading(modelValue); setDetail(null);
    try {
      await invoke("ensure_models", { request: { model: modelValue, enableVad: true, enableDiarize: false, enableForcedAlignment: false, maxSpeakers: null, diarizeBackend: "sortformer" } });
      await checkDownloadedModels();
      toast.success(`Model ready: ${modelValue}`);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      if (!msg.toLowerCase().includes("cancel")) toast.error(msg);
    } finally {
      setDownloading(null);
    }
  }

  async function cancel() {
    try { await invoke("cancel_model_download"); } catch {}
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">AI Model Manager</h1>
        <p className="text-sm text-muted-foreground">Download, manage, and delete offline speech recognition models.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3"><Cpu className="h-5 w-5 text-muted-foreground" /><div><div className="text-xs text-muted-foreground">CPU</div><div className="text-sm font-medium truncate">{hw?.cpu || "Detecting..."}</div></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><MemoryStick className="h-5 w-5 text-muted-foreground" /><div><div className="text-xs text-muted-foreground">RAM</div><div className="text-sm font-medium">{hw ? `${fmtBytes(hw.ramAvailableMb * 1024 * 1024)} available / ${fmtBytes(hw.ramTotalMb * 1024 * 1024)}` : "Detecting..."}</div></div></CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3"><HardDrive className="h-5 w-5 text-muted-foreground" /><div><div className="text-xs text-muted-foreground">GPU</div><div className="text-sm font-medium truncate">{hw?.gpuName || "No NVIDIA GPU detected"}{hw?.gpuVramMb ? ` (${hw.gpuVramMb} MB)` : ""}</div></div></CardContent></Card>
      </div>

      {downloading && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Downloading {downloading}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Progress value={detail?.percent ?? 0} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Progress: {(detail?.percent ?? 0).toFixed(1)}%</span>
              <span>Downloaded: {fmtBytes(detail?.downloadedBytes ?? 0)} / {fmtBytes(detail?.totalBytes ?? 0)}</span>
              <span>Speed: {fmtBytes(detail?.bytesPerSec ?? 0)}/s</span>
              <span>ETA: {fmtEta(detail?.etaSeconds)}</span>
              <span className="truncate">{detail?.filename || detail?.label || ""}</span>
            </div>
            <Button variant="outline" size="sm" onClick={cancel}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>
            {error && <div className="text-xs text-destructive">{error}</div>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Available Models</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {shown.map((m) => (
            <div key={m.value} className="flex items-center justify-between gap-4 p-3 border rounded-lg">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{t(m.label, { defaultValue: m.value })}</span>
                  <Badge variant="secondary">{m.size}</Badge>
                  {m.isDownloaded ? <Badge>Installed</Badge> : <Badge variant="outline">Not installed</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{t(m.description, { defaultValue: m.details || "" })}</div>
                <div className="text-xs text-muted-foreground mt-1">RAM: ~{m.ramMb} MB • Engine: {m.engine} • Languages: {m.languageSupport.kind === "multilingual" ? "Multilingual" : m.languageSupport.kind === "single_language" ? m.languageSupport.language : m.languageSupport.languages.join(", ")}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                {!m.isDownloaded ? (
                  <Button size="sm" onClick={() => downloadModel(m.value)} disabled={!!downloading}><Download className="h-4 w-4 mr-1" />Download</Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteModel(m.value)} disabled={!!downloading || downloading === m.value}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
