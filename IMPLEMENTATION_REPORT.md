# Offline STT - Implementation Report

## Repository Audit (Phase 1)

Starting point: https://github.com/tmoroney/auto-subs (AutoSubs v3.11.0)

### Key findings
- **Stack**: Tauri 2, React 18 + TypeScript, Tailwind/shadcn UI, Rust backend, Tokio async runtime.
- **Transcription**: `transcription-engine` crate wraps `whisper-rs` (GGML Whisper) and `transcribe-rs` (ONNX: Moonshine/Parakeet/SenseVoice/Canary/Cohere/GigaAM/OmniASR). File-based transcription with VAD, diarization, forced alignment, translation, formatting.
- **Audio**: FFmpeg sidecar/system fallback for normalization to 16kHz mono PCM16 WAV; waveform peak extraction; no microphone recording.
- **Models**: Manifest-driven model catalog (`AutoSubs-App/models.json`), hf-hub download in Rust `ModelManager`, cache management, delete/list commands. Progress reported as percent/label only.
- **Frontend**: Subtitle editor UI (Resolve/Adobe integration focused), settings store (Zustand persist), model manager dialog, transcript viewer, export flows.
- **Persistence**: No SQLite history DB; subtitle documents stored as files.
- **Packaging**: Tauri bundler (NSIS/app/deb/rpm), Windows signing config, updater pointed at AutoSubs releases.

### Reused components
- `transcription-engine` crate (Whisper/transcribe-rs, VAD, formatting, model manager).
- FFmpeg normalization (`audio_preprocess.rs`).
- Tauri command/event architecture, logging, plugin setup.
- shadcn/Tailwind UI component library.
- Existing model catalog/manifest structure.

## Implemented in this pass

### Backend (Rust / Tauri)
- **SQLite history DB**: `AutoSubs-App/src-tauri/src/db.rs`
  - Tables/commands: `history_list`, `history_get`, `history_save`, `history_delete`, `history_rename`.
  - Stores id, name, created_at, duration, language, model, mode, transcript text/json, audio path, status.
- **Audio recording**: `AutoSubs-App/src-tauri/src/recording.rs`
  - Microphone enumeration (`list_audio_input_devices`).
  - Start/pause/resume/stop recording (`cpal` + `hound` WAV writer).
  - Real-time input level events (`recording-level`).
  - WAV PCM16 recording; preserves input sample rate/channels at capture.
- **Hardware detection**: `AutoSubs-App/src-tauri/src/hardware.rs`
  - CPU/RAM via `sysinfo`, NVIDIA detection via `nvidia-smi` best-effort.
- **Exports**: `AutoSubs-App/src-tauri/src/stt_export.rs`
  - TXT, SRT, VTT, DOCX export command (`export_transcript`).
- **Model download progress enhancements**: `transcription-engine` model manager
  - Added detailed download progress struct/callback (`DownloadProgressDetail`) with bytes, total, percent, speed, ETA.
  - Emits `model-download-progress` Tauri event during `ensure_models`.
  - Added `cancel_model_download` command.
- **App wiring**: registered new commands and states in `main.rs`; initialized DB and recording states.
- **Branding/config**: product renamed to "Offline STT", version 1.0.0, window size/title updated, AutoSubs updater auto-check disabled.

### Frontend (React/TS)
- **New STT shell**: `src/App.tsx` with sidebar navigation.
- **Pages**:
  - `RecorderPage`: mic selection, record/pause/resume/stop, input level, file transcription, basic live chunked mode, transcript editor, TXT/DOCX/SRT/VTT export, saves history.
  - `HistoryPage`: SQLite-backed list/search/open/edit/rename/delete/export.
  - `ModelsPage`: hardware info, model catalog/status, download with real byte/speed/ETA progress, cancel, delete.
  - `AudioLibraryPage`: audio-linked history records, delete with audio option.
  - `SettingsPage`: basic AI/audio/storage settings persisted in localStorage; hardware display.
  - `AboutPage`: product/privacy/stack summary.
- **STT API/types**: `src/stt/api.ts`, `src/stt/types.ts`.

## Partial / Known Limitations

- **Live transcription**: implemented as basic chunked record-transcribe-append loop (5s chunks). Not a true low-latency streaming ASR; no overlap dedup/merge correction yet.
- **Model downloads**: real byte/speed/ETA progress added, cancel added. Pause/resume is not fully exposed as a dedicated model-manager workflow; hf-hub/resume behavior depends on underlying download path. Catalog metadata should be expanded to fully match the requested fields (verified checksums per file, explicit VRAM recommendations, exact source URLs in UI).
- **Model manager spec**: does not yet implement full pause/resume UI controls for every download, per-model checksum display from a dedicated manifest, or storage relocation.
- **Audio retention setting**: UI toggle exists but is not fully wired into recording/transcription flow.
- **Persian/English UX**: English UI delivered per user request; Persian/RTL support and default-Persian behavior from original spec not fully implemented.
- **History/Audio library**: basic; no pagination, no advanced sorting/filtering, no audio playback preview.
- **Settings**: localStorage-based MVP; not fully integrated with Rust settings/storage management.
- **Resolve/Adobe legacy**: backend code remains in repo; UI de-emphasized. Packaging scripts/config still contain AutoSubs-specific hooks in some places.
- **Security/privacy hardening**: no cloud transcription path added; download verification should be strengthened with explicit checksum enforcement in manifest-driven UI flow.
- **Tests**: existing AutoSubs tests not updated; new STT tests not added.
- **Build verification**: Rust toolchain and Node/npm were not available in PATH in this environment during this pass, so compile/build was not executed here. Code was added carefully but requires local build validation.

## Files added/changed (high level)

### Added
- `AutoSubs-App/src-tauri/src/db.rs`
- `AutoSubs-App/src-tauri/src/recording.rs`
- `AutoSubs-App/src-tauri/src/hardware.rs`
- `AutoSubs-App/src-tauri/src/stt_export.rs`
- `AutoSubs-App/src/stt/api.ts`
- `AutoSubs-App/src/stt/types.ts`
- `AutoSubs-App/src/pages/RecorderPage.tsx`
- `AutoSubs-App/src/pages/HistoryPage.tsx`
- `AutoSubs-App/src/pages/ModelsPage.tsx`
- `AutoSubs-App/src/pages/AudioLibraryPage.tsx`
- `AutoSubs-App/src/pages/SettingsPage.tsx`
- `AutoSubs-App/src/pages/AboutPage.tsx`
- `IMPLEMENTATION_REPORT.md`

### Modified
- `AutoSubs-App/src-tauri/Cargo.toml`
- `AutoSubs-App/src-tauri/src/main.rs`
- `AutoSubs-App/src-tauri/src/transcription_api.rs`
- `AutoSubs-App/src-tauri/crates/transcription-engine/src/model_manager.rs`
- `AutoSubs-App/src-tauri/tauri.conf.json`
- `AutoSubs-App/src/App.tsx`
- `AutoSubs-App/index.html`

## Recommended next steps
1. Run `cargo check` / `cargo test` in `AutoSubs-App/src-tauri` and fix compile issues.
2. Run `npm install` and `npm run build:web` in `AutoSubs-App`.
3. Implement robust live transcription: VAD-based chunking, overlap, dedup merge, partial/final states.
4. Complete model manager spec: per-model checksum validation, explicit pause/resume/cancel download jobs, storage relocation, catalog metadata display.
5. Add Persian locale + RTL layout, make language configurable per spec/user preference.
6. Wire settings to backend config and enforce audio retention/storage behavior.
7. Add playback for audio library, better history metadata, and safe file operations.
8. Add tests for recording, WAV validity, exports, DB, model download/cancel, transcription flows.
9. Clean Windows packaging/branding and remove AutoSubs updater/Resolve installer hooks from STT distribution.
