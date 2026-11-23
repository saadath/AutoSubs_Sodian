import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div><h1 className="text-2xl font-semibold">About</h1><p className="text-sm text-muted-foreground">Professional offline speech-to-text desktop application.</p></div>
      <Card>
        <CardHeader><CardTitle className="text-base">Offline STT</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Offline STT is a Windows desktop application for recording audio and converting speech to text using local AI models. All transcription runs locally on your machine.</p>
          <p><strong className="text-foreground">Core capabilities:</strong> live/recorded transcription, Persian and English support, automatic/manual language selection, local model management, transcript export, and transcription history.</p>
          <p><strong className="text-foreground">Privacy:</strong> no cloud transcription, no automatic uploads, and no API keys required for local inference.</p>
          <p><strong className="text-foreground">Stack:</strong> Tauri 2, React, TypeScript, Tailwind CSS, Rust, Whisper/transcribe-rs, FFmpeg, SQLite.</p>
        </CardContent>
      </Card>
    </div>
  );
}
