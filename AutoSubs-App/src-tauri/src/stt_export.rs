use crate::transcript_types::Segment;
use docx_rs::*;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub path: String,
    pub format: String, // txt, srt, vtt, docx
    pub segments: Vec<Segment>,
    pub include_timestamps: bool,
}

#[tauri::command]
pub async fn export_transcript(req: ExportRequest) -> Result<String, String> {
    let path = PathBuf::from(&req.path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    match req.format.to_lowercase().as_str() {
        "txt" => export_txt(&path, &req.segments, req.include_timestamps)?,
        "srt" => export_srt(&path, &req.segments)?,
        "vtt" => export_vtt(&path, &req.segments)?,
        "docx" => export_docx(&path, &req.segments, req.include_timestamps)?,
        other => return Err(format!("Unsupported format: {other}")),
    }
    Ok(path.to_string_lossy().to_string())
}

fn export_txt(path: &PathBuf, segments: &[Segment], include_timestamps: bool) -> Result<(), String> {
    let mut out = String::new();
    for s in segments {
        if include_timestamps {
            out.push_str(&format!("[{} - {}] ", fmt_ts(s.start), fmt_ts(s.end)));
        }
        out.push_str(s.text.trim());
        out.push_str("\n\n");
    }
    std::fs::write(path, out).map_err(|e| e.to_string())
}

fn export_srt(path: &PathBuf, segments: &[Segment]) -> Result<(), String> {
    let mut out = String::new();
    for (i, s) in segments.iter().enumerate() {
        out.push_str(&format!("{}\n", i + 1));
        out.push_str(&format!("{} --> {}\n", fmt_srt(s.start), fmt_srt(s.end)));
        out.push_str(s.text.trim());
        out.push_str("\n\n");
    }
    std::fs::write(path, out).map_err(|e| e.to_string())
}

fn export_vtt(path: &PathBuf, segments: &[Segment]) -> Result<(), String> {
    let mut out = String::from("WEBVTT\n\n");
    for s in segments {
        out.push_str(&format!("{} --> {}\n", fmt_vtt(s.start), fmt_vtt(s.end)));
        out.push_str(s.text.trim());
        out.push_str("\n\n");
    }
    std::fs::write(path, out).map_err(|e| e.to_string())
}

fn export_docx(path: &PathBuf, segments: &[Segment], include_timestamps: bool) -> Result<(), String> {
    let mut doc = Docx::new();
    for s in segments {
        let mut text = String::new();
        if include_timestamps {
            text.push_str(&format!("[{} - {}] ", fmt_ts(s.start), fmt_ts(s.end)));
        }
        text.push_str(s.text.trim());
        doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text(text)));
    }
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    doc.build().pack(file).map_err(|e| e.to_string())
}

fn fmt_ts(sec: f64) -> String {
    let total = sec.max(0.0) as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

fn fmt_srt(sec: f64) -> String {
    let ms = (sec.max(0.0) * 1000.0).round() as u64;
    let h = ms / 3_600_000;
    let m = (ms % 3_600_000) / 60_000;
    let s = (ms % 60_000) / 1000;
    let mil = ms % 1000;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, mil)
}

fn fmt_vtt(sec: f64) -> String {
    let ms = (sec.max(0.0) * 1000.0).round() as u64;
    let h = ms / 3_600_000;
    let m = (ms % 3_600_000) / 60_000;
    let s = (ms % 60_000) / 1000;
    let mil = ms % 1000;
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, mil)
}
