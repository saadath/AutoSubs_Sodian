use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{SampleFormat, WavSpec, WavWriter};
use serde::Serialize;
use std::{
    fs::File,
    io::BufWriter,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Clone)]
struct RecordingInner {
    writer: Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>,
    is_paused: Arc<Mutex<bool>>,
    level: Arc<Mutex<f32>>,
    sample_rate: u32,
    channels: u16,
    path: PathBuf,
}

pub struct RecordingState {
    inner: Mutex<Option<RecordingInner>>,
    // Keep stream alive. cpal::Stream is not Send on all platforms, so store as trait object in Mutex guarded by main-thread usage patterns carefully.
    // We store it as Option<Box<dyn Any + Send>> is not possible; instead keep in a dedicated slot managed on commands.
}

struct StreamHolder(Mutex<Option<cpal::Stream>>);
unsafe impl Send for StreamHolder {}
unsafe impl Sync for StreamHolder {}

pub struct RecordingStream(pub StreamHolder);

impl Default for RecordingStream {
    fn default() -> Self {
        Self(StreamHolder(Mutex::new(None)))
    }
}

impl Default for RecordingState {
    fn default() -> Self {
        Self { inner: Mutex::new(None) }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStatus {
    pub is_recording: bool,
    pub is_paused: bool,
    pub path: Option<String>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub level: f32,
}

#[tauri::command]
pub fn list_audio_input_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for (idx, dev) in devices.enumerate() {
        let name = dev.name().unwrap_or_else(|_| format!("Device {}", idx + 1));
        let is_default = default_name.as_ref().map(|d| d == &name).unwrap_or(false);
        out.push(AudioDeviceInfo {
            id: name.clone(),
            name: name.clone(),
            is_default,
        });
    }
    Ok(out)
}

fn find_input_device(name: Option<&str>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(name) = name {
        let devices = host.input_devices().map_err(|e| e.to_string())?;
        for d in devices {
            if d.name().ok().as_deref() == Some(name) {
                return Ok(d);
            }
        }
    }
    host.default_input_device().ok_or_else(|| "No input device available".to_string())
}

#[tauri::command]
pub fn start_recording<R: Runtime>(
    app: AppHandle<R>,
    device_name: Option<String>,
    file_path: Option<String>,
    state: tauri::State<'_, RecordingState>,
    stream_state: tauri::State<'_, RecordingStream>,
) -> Result<RecordingStatus, String> {
    {
        let inner = state.inner.lock().map_err(|_| "Recording state poisoned")?;
        if inner.is_some() {
            return Err("Recording already in progress".to_string());
        }
    }

    let device = find_input_device(device_name.as_deref())?;
    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get input config: {e}"))?;
    let sample_rate = config.sample_rate().0;
    let channels = config.channels();

    let out_path = if let Some(p) = file_path {
        PathBuf::from(p)
    } else {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("recordings");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        dir.join(format!("recording-{}.wav", chrono::Utc::now().format("%Y%m%d-%H%M%S")))
    };
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let writer = WavWriter::create(&out_path, spec).map_err(|e| format!("Failed to create WAV: {e}"))?;
    let writer = Arc::new(Mutex::new(Some(writer)));
    let is_paused = Arc::new(Mutex::new(false));
    let level = Arc::new(Mutex::new(0.0f32));

    let writer_cb = writer.clone();
    let paused_cb = is_paused.clone();
    let level_cb = level.clone();
    let app_cb = app.clone();
    let err_app = app.clone();

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.into(),
            move |data: &[f32], _| handle_input_f32(data, &writer_cb, &paused_cb, &level_cb, &app_cb),
            move |err| { let _ = err_app.emit("recording-error", err.to_string()); },
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.into(),
            move |data: &[i16], _| handle_input_i16(data, &writer_cb, &paused_cb, &level_cb, &app_cb),
            move |err| { let _ = err_app.emit("recording-error", err.to_string()); },
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config.into(),
            move |data: &[u16], _| handle_input_u16(data, &writer_cb, &paused_cb, &level_cb, &app_cb),
            move |err| { let _ = err_app.emit("recording-error", err.to_string()); },
            None,
        ),
        _ => return Err("Unsupported sample format".to_string()),
    }
    .map_err(|e| format!("Failed to build input stream: {e}"))?;

    stream.play().map_err(|e| format!("Failed to start stream: {e}"))?;

    {
        let mut holder = stream_state.0 .0.lock().map_err(|_| "Stream state poisoned")?;
        *holder = Some(stream);
    }
    let inner = RecordingInner {
        writer,
        is_paused,
        level: level.clone(),
        sample_rate,
        channels,
        path: out_path.clone(),
    };
    {
        let mut st = state.inner.lock().map_err(|_| "Recording state poisoned")?;
        *st = Some(inner);
    }

    Ok(RecordingStatus {
        is_recording: true,
        is_paused: false,
        path: Some(out_path.to_string_lossy().to_string()),
        sample_rate: Some(sample_rate),
        channels: Some(channels),
        level: 0.0,
    })
}

fn emit_level<R: Runtime>(app: &AppHandle<R>, level: f32) {
    let _ = app.emit("recording-level", level);
}

fn handle_input_f32<R: Runtime>(data: &[f32], writer: &Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>, paused: &Arc<Mutex<bool>>, level: &Arc<Mutex<f32>>, app: &AppHandle<R>) {
    if *paused.lock().unwrap_or_else(|e| e.into_inner()) { return; }
    let mut peak = 0.0f32;
    if let Ok(mut w) = writer.lock() {
        if let Some(writer) = w.as_mut() {
            for &s in data {
                peak = peak.max(s.abs());
                let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                let _ = writer.write_sample(v);
            }
        }
    }
    if let Ok(mut l) = level.lock() { *l = peak; }
    emit_level(app, peak);
}

fn handle_input_i16<R: Runtime>(data: &[i16], writer: &Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>, paused: &Arc<Mutex<bool>>, level: &Arc<Mutex<f32>>, app: &AppHandle<R>) {
    if *paused.lock().unwrap_or_else(|e| e.into_inner()) { return; }
    let mut peak = 0.0f32;
    if let Ok(mut w) = writer.lock() {
        if let Some(writer) = w.as_mut() {
            for &s in data {
                peak = peak.max((s as f32 / i16::MAX as f32).abs());
                let _ = writer.write_sample(s);
            }
        }
    }
    if let Ok(mut l) = level.lock() { *l = peak; }
    emit_level(app, peak);
}

fn handle_input_u16<R: Runtime>(data: &[u16], writer: &Arc<Mutex<Option<WavWriter<BufWriter<File>>>>>, paused: &Arc<Mutex<bool>>, level: &Arc<Mutex<f32>>, app: &AppHandle<R>) {
    if *paused.lock().unwrap_or_else(|e| e.into_inner()) { return; }
    let mut peak = 0.0f32;
    if let Ok(mut w) = writer.lock() {
        if let Some(writer) = w.as_mut() {
            for &s in data {
                let v = (s as i32 - 32768) as i16;
                peak = peak.max((v as f32 / i16::MAX as f32).abs());
                let _ = writer.write_sample(v);
            }
        }
    }
    if let Ok(mut l) = level.lock() { *l = peak; }
    emit_level(app, peak);
}

#[tauri::command]
pub fn pause_recording(state: tauri::State<'_, RecordingState>) -> Result<(), String> {
    let inner = state.inner.lock().map_err(|_| "Recording state poisoned")?;
    let Some(rec) = inner.as_ref() else { return Err("No active recording".to_string()) };
    *rec.is_paused.lock().map_err(|_| "Pause state poisoned")? = true;
    Ok(())
}

#[tauri::command]
pub fn resume_recording(state: tauri::State<'_, RecordingState>) -> Result<(), String> {
    let inner = state.inner.lock().map_err(|_| "Recording state poisoned")?;
    let Some(rec) = inner.as_ref() else { return Err("No active recording".to_string()) };
    *rec.is_paused.lock().map_err(|_| "Pause state poisoned")? = false;
    Ok(())
}

#[tauri::command]
pub fn stop_recording(
    state: tauri::State<'_, RecordingState>,
    stream_state: tauri::State<'_, RecordingStream>,
) -> Result<RecordingStatus, String> {
    // Drop stream first
    {
        let mut holder = stream_state.0 .0.lock().map_err(|_| "Stream state poisoned")?;
        *holder = None;
    }
    let rec = {
        let mut inner = state.inner.lock().map_err(|_| "Recording state poisoned")?;
        inner.take()
    };
    let Some(rec) = rec else { return Err("No active recording".to_string()) };
    if let Ok(mut w) = rec.writer.lock() {
        if let Some(writer) = w.take() {
            writer.finalize().map_err(|e| format!("Failed to finalize WAV: {e}"))?;
        }
    }
    Ok(RecordingStatus {
        is_recording: false,
        is_paused: false,
        path: Some(rec.path.to_string_lossy().to_string()),
        sample_rate: Some(rec.sample_rate),
        channels: Some(rec.channels),
        level: 0.0,
    })
}

#[tauri::command]
pub fn get_recording_status(state: tauri::State<'_, RecordingState>) -> Result<RecordingStatus, String> {
    let inner = state.inner.lock().map_err(|_| "Recording state poisoned")?;
    if let Some(rec) = inner.as_ref() {
        let is_paused = *rec.is_paused.lock().map_err(|_| "Pause state poisoned")?;
        let level = *rec.level.lock().map_err(|_| "Level state poisoned")?;
        Ok(RecordingStatus {
            is_recording: true,
            is_paused,
            path: Some(rec.path.to_string_lossy().to_string()),
            sample_rate: Some(rec.sample_rate),
            channels: Some(rec.channels),
            level,
        })
    } else {
        Ok(RecordingStatus {
            is_recording: false,
            is_paused: false,
            path: None,
            sample_rate: None,
            channels: None,
            level: 0.0,
        })
    }
}
