import { invoke } from "@tauri-apps/api/core";
import type { AudioDevice, HardwareInfo, HistoryItem, HistoryRecord, RecordingStatus, TranscriptSegment } from "./types";

export const sttApi = {
  listAudioDevices: () => invoke<AudioDevice[]>("list_audio_input_devices"),
  startRecording: (deviceName?: string, filePath?: string) =>
    invoke<RecordingStatus>("start_recording", { deviceName, filePath }),
  pauseRecording: () => invoke<void>("pause_recording"),
  resumeRecording: () => invoke<void>("resume_recording"),
  stopRecording: () => invoke<RecordingStatus>("stop_recording"),
  getRecordingStatus: () => invoke<RecordingStatus>("get_recording_status"),

  historyList: () => invoke<HistoryItem[]>("history_list"),
  historyGet: (id: string) => invoke<HistoryRecord | null>("history_get", { id }),
  historySave: (record: HistoryRecord) => invoke<void>("history_save", { record }),
  historyDelete: (id: string, deleteAudio: boolean) => invoke<void>("history_delete", { id, deleteAudio }),
  historyRename: (id: string, name: string) => invoke<void>("history_rename", { id, name }),

  getHardwareInfo: () => invoke<HardwareInfo>("get_hardware_info"),
  exportTranscript: (req: { path: string; format: string; segments: TranscriptSegment[]; includeTimestamps: boolean }) =>
    invoke<string>("export_transcript", { req }),
};
