export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface RecordingStatus {
  isRecording: boolean;
  isPaused: boolean;
  path?: string | null;
  sampleRate?: number | null;
  channels?: number | null;
  level: number;
}

export interface HistoryItem {
  id: string;
  name: string;
  createdAt: string;
  durationSeconds: number;
  language: string;
  model: string;
  mode: string;
  status: string;
  hasAudio: boolean;
  preview: string;
}

export interface HistoryRecord extends HistoryItem {
  transcriptText: string;
  transcriptJson: string;
  audioPath?: string | null;
}

export interface HardwareInfo {
  os: string;
  cpu: string;
  ramTotalMb: number;
  ramAvailableMb: number;
  gpuName?: string | null;
  gpuVramMb?: number | null;
  hasNvidia: boolean;
  cudaAvailable: boolean;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker_id?: string | null;
  words?: { word: string; start: number; end: number; probability?: number }[];
}
