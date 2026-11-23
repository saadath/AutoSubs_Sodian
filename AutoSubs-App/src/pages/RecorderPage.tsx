import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { sttApi } from "@/stt/api";
import type { AudioDevice, TranscriptSegment } from "@/stt/types";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { Mic, Pause, Play, Square, Upload, Download, Copy, Languages } from "lucide-react";
import { toast } from "sonner";

type Mode = "record" | "file" | "live";

export default function RecorderPage() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [device, setDevice] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "recording" | "paused" | "processing">("idle");
  const [level, setLevel] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [mode, setMode] = useState<Mode>("record");
  const [language, setLanguage] = useState("auto");
  const [model, setModel] = useState("small");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const liveRef = useRef(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const liveTranscriptRef = useRef("");

  useEffect(() => {
    sttApi.listAudioDevices().then((d) => {
      setDevices(d);
      const def = d.find((x) => x.isDefault) ?? d[0];
      if (def) setDevice(def.name);
    }).catch((e) => toast.error(String(e)));

    const unlistenLevel = listen<number>("recording-level", (e) => setLevel(e.payload));
    const unlistenProgress = listen<{ progress: number; label?: string }>("labeled-progress", (e) => {
      setProgress(e.payload.progress ?? 0);
      setProgressLabel(e.payload.label ?? "");
    });
    return () => { unlistenLevel.then((f) => f()); unlistenProgress.then((f) => f()); };
  }, []);

  useEffect(() => {
    if (status === "recording") {
      timerRef.current = window.setInterval(() => setDuration((d) => d + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  const fmtDur = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  async function startRec() {
    try {
      setTranscript(""); setSegments([]); setDuration(0); setProgress(0);
      const res = await sttApi.startRecording(device || undefined);
      setAudioPath(res.path ?? null);
      setStatus("recording");
    } catch (e) { toast.error(String(e)); }
  }
  async function pauseRec() { try { await sttApi.pauseRecording(); setStatus("paused"); } catch (e) { toast.error(String(e)); } }
  async function resumeRec() { try { await sttApi.resumeRecording(); setStatus("recording"); } catch (e) { toast.error(String(e)); } }
  async function stopRec() {
    try {
      const res = await sttApi.stopRecording();
      setStatus("idle");
      setAudioPath(res.path ?? null);
      if (res.path) await transcribePath(res.path, "record");
    } catch (e) { toast.error(String(e)); setStatus("idle"); }
  }

  async function startLive() {
    liveRef.current = true;
    setLiveRunning(true);
    liveTranscriptRef.current = "";
    setTranscript("");
    setSegments([]);
    setDuration(0);
    setStatus("recording");
    while (liveRef.current) {
      try {
        const res = await sttApi.startRecording(device || undefined);
        setAudioPath(res.path ?? null);
        await new Promise((r) => setTimeout(r, 5000));
        if (!liveRef.current) { try { await sttApi.stopRecording(); } catch {} break; }
        const stopped = await sttApi.stopRecording();
        if (stopped.path) {
          setStatus("processing");
          const result = await invoke<any>("transcribe_audio", {
            options: {
              audioPath: stopped.path, offset: 0, model, lang: language === "auto" ? undefined : language,
              translate: false, targetLanguage: "en", enableDtw: false, enableGpu: true, enableDiarize: false,
              enableForcedAlignment: false, enableVad: true, maxSpeakers: null, diarizeBackend: "sortformer",
              density: "standard", maxLines: 2, textCase: "none", removePunctuation: false, censoredWords: [], censorStyle: "middle",
            },
          });
          const segs: TranscriptSegment[] = (result.segments || []).map((s: any) => ({ start: s.start, end: s.end, text: s.text }));
          const chunkText = segs.map((s) => s.text).join(" ").trim();
          if (chunkText) {
            liveTranscriptRef.current = (liveTranscriptRef.current + "\n" + chunkText).trim();
            setTranscript(liveTranscriptRef.current);
            setSegments((prev) => [...prev, ...segs]);
          }
          setStatus("recording");
        }
      } catch (e) {
        if (liveRef.current) toast.error(String(e));
        liveRef.current = false;
        setLiveRunning(false);
        setStatus("idle");
        break;
      }
    }
    setStatus("idle");
  }

  async function stopLive() {
    liveRef.current = false;
    setLiveRunning(false);
    try { await sttApi.stopRecording(); } catch {}
    setStatus("idle");
  }

  async function transcribePath(path: string, runMode: "record" | "file") {
    setStatus("processing"); setProgress(0); setProgressLabel("Preparing...");
    try {
      const result = await invoke<any>("transcribe_audio", {
        options: {
          audioPath: path,
          offset: 0,
          model,
          lang: language === "auto" ? undefined : language,
          translate: false,
          targetLanguage: "en",
          enableDtw: true,
          enableGpu: true,
          enableDiarize: false,
          enableForcedAlignment: false,
          enableVad: true,
          maxSpeakers: null,
          diarizeBackend: "sortformer",
          density: "standard",
          maxLines: 2,
          textCase: "none",
          removePunctuation: false,
          censoredWords: [],
          censorStyle: "middle",
        },
      });
      const segs: TranscriptSegment[] = (result.segments || []).map((s: any) => ({ start: s.start, end: s.end, text: s.text, speaker_id: s.speaker_id, words: s.words }));
      setSegments(segs);
      const text = segs.map((s) => s.text).join("\n").trim();
      setTranscript(text);
      await sttApi.historySave({
        id: crypto.randomUUID(),
        name: `Transcription ${new Date().toLocaleString()}`,
        createdAt: new Date().toISOString(),
        durationSeconds: duration || (segs[segs.length - 1]?.end ?? 0),
        language: result.language || language,
        model,
        mode: runMode,
        transcriptText: text,
        transcriptJson: JSON.stringify(segs),
        audioPath: path,
        status: "completed",
        hasAudio: true,
        preview: text.slice(0, 160),
      } as any);
      toast.success("Transcription completed");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setStatus("idle"); setProgressLabel("");
    }
  }

  async function pickFile() {
    const selected = await open({ multiple: false, filters: [{ name: "Audio/Video", extensions: ["wav", "mp3", "m4a", "mp4", "webm", "ogg", "flac"] }] });
    if (typeof selected === "string") {
      setAudioPath(selected);
      await transcribePath(selected, "file");
    }
  }

  async function exportTxt() {
    const path = await save({ defaultPath: "transcript.txt", filters: [{ name: "Text", extensions: ["txt"] }] });
    if (!path) return;
    await sttApi.exportTranscript({ path, format: "txt", segments, includeTimestamps: false });
    toast.success("Exported TXT");
  }
  async function exportSrt() {
    const path = await save({ defaultPath: "transcript.srt", filters: [{ name: "SRT", extensions: ["srt"] }] });
    if (!path) return;
    await sttApi.exportTranscript({ path, format: "srt", segments, includeTimestamps: true });
    toast.success("Exported SRT");
  }
  async function exportVtt() {
    const path = await save({ defaultPath: "transcript.vtt", filters: [{ name: "VTT", extensions: ["vtt"] }] });
    if (!path) return;
    await sttApi.exportTranscript({ path, format: "vtt", segments, includeTimestamps: true });
    toast.success("Exported VTT");
  }
  async function exportDocx() {
    const path = await save({ defaultPath: "transcript.docx", filters: [{ name: "Word", extensions: ["docx"] }] });
    if (!path) return;
    await sttApi.exportTranscript({ path, format: "docx", segments, includeTimestamps: false });
    toast.success("Exported DOCX");
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Recorder & Transcription</h1>
          <p className="text-sm text-muted-foreground">Record audio or transcribe files offline using local AI models.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={mode === "record" ? "default" : "outline"} onClick={() => setMode("record")}><Mic className="h-4 w-4 mr-2" />Record</Button>
          <Button variant={mode === "live" ? "default" : "outline"} onClick={() => setMode("live")}><Mic className="h-4 w-4 mr-2" />Live</Button>
          <Button variant={mode === "file" ? "default" : "outline"} onClick={() => setMode("file")}><Upload className="h-4 w-4 mr-2" />File</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader><CardTitle className="text-base">Controls</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Microphone</label>
              <Select value={device} onValueChange={setDevice}>
                <SelectTrigger><SelectValue placeholder="Select microphone" /></SelectTrigger>
                <SelectContent>{devices.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}{d.isDefault ? " (Default)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatic Detection</SelectItem>
                  <SelectItem value="fa">Persian (Farsi)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiny">Whisper Tiny</SelectItem>
                  <SelectItem value="base">Whisper Base</SelectItem>
                  <SelectItem value="small">Whisper Small</SelectItem>
                  <SelectItem value="medium">Whisper Medium</SelectItem>
                  <SelectItem value="large-v3-turbo">Whisper Large-v3-Turbo</SelectItem>
                  <SelectItem value="large-v3">Whisper Large-v3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm"><span>Duration</span><span className="font-mono">{fmtDur(duration)}</span></div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground"><span>Input Level</span><span>{Math.round(level * 100)}%</span></div>
                <Progress value={Math.min(100, level * 100)} />
              </div>
              <div className="flex gap-2 pt-2">
                {mode !== "live" && status !== "recording" && status !== "paused" && <Button className="flex-1" onClick={startRec} disabled={status === "processing"}><Mic className="h-4 w-4 mr-2" />Start</Button>}
                {mode !== "live" && status === "recording" && <Button className="flex-1" variant="secondary" onClick={pauseRec}><Pause className="h-4 w-4 mr-2" />Pause</Button>}
                {mode !== "live" && status === "paused" && <Button className="flex-1" variant="secondary" onClick={resumeRec}><Play className="h-4 w-4 mr-2" />Resume</Button>}
                {mode !== "live" && (status === "recording" || status === "paused") && <Button className="flex-1" variant="destructive" onClick={stopRec}><Square className="h-4 w-4 mr-2" />Stop</Button>}
                {mode === "live" && !liveRunning && status !== "processing" && <Button className="flex-1" onClick={startLive}><Mic className="h-4 w-4 mr-2" />Start Live</Button>}
                {mode === "live" && (liveRunning || status === "recording" || status === "processing") && <Button className="flex-1" variant="destructive" onClick={stopLive}><Square className="h-4 w-4 mr-2" />Stop Live</Button>}
              </div>
              {mode === "file" && <Button className="w-full" variant="outline" onClick={pickFile} disabled={status === "processing" || status === "recording"}><Upload className="h-4 w-4 mr-2" />Select Audio/Video File</Button>}
            </div>

            {status === "processing" && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground"><span>{progressLabel || "Processing"}</span><span>{progress}%</span></div>
                <Progress value={progress} />
              </div>
            )}
            {audioPath && <div className="text-xs text-muted-foreground break-all">Audio: {audioPath}</div>}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Transcript</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(transcript); toast.success("Copied"); }} disabled={!transcript}><Copy className="h-4 w-4 mr-1" />Copy</Button>
              <Button size="sm" variant="outline" onClick={exportTxt} disabled={!segments.length}><Download className="h-4 w-4 mr-1" />TXT</Button>
              <Button size="sm" variant="outline" onClick={exportDocx} disabled={!segments.length}>DOCX</Button>
              <Button size="sm" variant="outline" onClick={exportSrt} disabled={!segments.length}>SRT</Button>
              <Button size="sm" variant="outline" onClick={exportVtt} disabled={!segments.length}>VTT</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Transcript will appear here..." className="min-h-[420px] text-base leading-7" />
            <div className="flex gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary"><Languages className="h-3 w-3 mr-1" />{language}</Badge>
              <Badge variant="secondary">Model: {model}</Badge>
              <Badge variant="secondary">Segments: {segments.length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
