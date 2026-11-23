import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sttApi } from "@/stt/api";
import type { HardwareInfo } from "@/stt/types";

export default function SettingsPage() {
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [defaultModel, setDefaultModel] = useState(localStorage.getItem("stt.defaultModel") || "small");
  const [defaultLang, setDefaultLang] = useState(localStorage.getItem("stt.defaultLang") || "auto");
  const [saveAudio, setSaveAudio] = useState(localStorage.getItem("stt.saveAudio") !== "false");
  const [gpu, setGpu] = useState(localStorage.getItem("stt.gpu") !== "false");

  useEffect(() => { sttApi.getHardwareInfo().then(setHw).catch(() => {}); }, []);
  function persist() {
    localStorage.setItem("stt.defaultModel", defaultModel);
    localStorage.setItem("stt.defaultLang", defaultLang);
    localStorage.setItem("stt.saveAudio", String(saveAudio));
    localStorage.setItem("stt.gpu", String(gpu));
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div><h1 className="text-2xl font-semibold">Settings</h1><p className="text-sm text-muted-foreground">Configure transcription, audio, and storage preferences.</p></div>
      <Card>
        <CardHeader><CardTitle className="text-base">AI & Transcription</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Default Model</Label><Select value={defaultModel} onValueChange={setDefaultModel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tiny">Whisper Tiny</SelectItem><SelectItem value="base">Whisper Base</SelectItem><SelectItem value="small">Whisper Small</SelectItem><SelectItem value="medium">Whisper Medium</SelectItem><SelectItem value="large-v3-turbo">Whisper Large-v3-Turbo</SelectItem><SelectItem value="large-v3">Whisper Large-v3</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Default Language</Label><Select value={defaultLang} onValueChange={setDefaultLang}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Automatic Detection</SelectItem><SelectItem value="fa">Persian (Farsi)</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></div>
          </div>
          <div className="flex items-center justify-between"><div><Label>GPU Acceleration</Label><p className="text-xs text-muted-foreground">Use NVIDIA GPU when available and supported by the backend.</p></div><Switch checked={gpu} onCheckedChange={setGpu} /></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Audio & Storage</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between"><div><Label>Automatically save original audio</Label><p className="text-xs text-muted-foreground">Keep recorded audio files with transcriptions.</p></div><Switch checked={saveAudio} onCheckedChange={setSaveAudio} /></div>
          <div className="space-y-2"><Label>Storage location</Label><Input value="Managed by app data directory" readOnly /></div>
          <Button onClick={persist}>Save Settings</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Hardware</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <div>OS: {hw?.os || "-"}</div>
          <div>CPU: {hw?.cpu || "-"}</div>
          <div>RAM: {hw ? `${hw.ramAvailableMb} MB available / ${hw.ramTotalMb} MB total` : "-"}</div>
          <div>GPU: {hw?.gpuName || "Not detected"}{hw?.gpuVramMb ? ` (${hw.gpuVramMb} MB VRAM)` : ""}</div>
          <div>CUDA detected: {hw?.cudaAvailable ? "Yes" : "No"}</div>
        </CardContent>
      </Card>
    </div>
  );
}
