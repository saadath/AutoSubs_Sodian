use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};

pub struct DbState(pub Mutex<Connection>);

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub duration_seconds: f64,
    pub language: String,
    pub model: String,
    pub mode: String,
    pub transcript_text: String,
    pub transcript_json: String,
    pub audio_path: Option<String>,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryListItem {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub duration_seconds: f64,
    pub language: String,
    pub model: String,
    pub mode: String,
    pub status: String,
    pub has_audio: bool,
    pub preview: String,
}

pub fn db_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    Ok(dir.join("stt_history.db"))
}

pub fn init_db<R: Runtime>(app: &AppHandle<R>) -> Result<Connection, String> {
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| format!("Failed to open database: {e}"))?;
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            duration_seconds REAL NOT NULL DEFAULT 0,
            language TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT 'file',
            transcript_text TEXT NOT NULL DEFAULT '',
            transcript_json TEXT NOT NULL DEFAULT '[]',
            audio_path TEXT,
            status TEXT NOT NULL DEFAULT 'completed'
        );
        CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);
        ",
    )
    .map_err(|e| format!("Failed to initialize database: {e}"))?;
    Ok(conn)
}

#[tauri::command]
pub fn history_list(state: tauri::State<'_, DbState>) -> Result<Vec<HistoryListItem>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, created_at, duration_seconds, language, model, mode, status, audio_path, transcript_text
             FROM history ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let text: String = row.get(9)?;
            let preview: String = text.chars().take(160).collect();
            Ok(HistoryListItem {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                duration_seconds: row.get(3)?,
                language: row.get(4)?,
                model: row.get(5)?,
                mode: row.get(6)?,
                status: row.get(7)?,
                has_audio: row.get::<_, Option<String>>(8)?.is_some(),
                preview,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for r in rows {
        items.push(r.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
pub fn history_get(id: String, state: tauri::State<'_, DbState>) -> Result<Option<HistoryRecord>, String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let rec = conn
        .query_row(
            "SELECT id, name, created_at, duration_seconds, language, model, mode, transcript_text, transcript_json, audio_path, status
             FROM history WHERE id = ?1",
            params![id],
            |row| {
                Ok(HistoryRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    duration_seconds: row.get(3)?,
                    language: row.get(4)?,
                    model: row.get(5)?,
                    mode: row.get(6)?,
                    transcript_text: row.get(7)?,
                    transcript_json: row.get(8)?,
                    audio_path: row.get(9)?,
                    status: row.get(10)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(rec)
}

#[tauri::command]
pub fn history_save(record: HistoryRecord, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO history (id, name, created_at, duration_seconds, language, model, mode, transcript_text, transcript_json, audio_path, status)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           created_at=excluded.created_at,
           duration_seconds=excluded.duration_seconds,
           language=excluded.language,
           model=excluded.model,
           mode=excluded.mode,
           transcript_text=excluded.transcript_text,
           transcript_json=excluded.transcript_json,
           audio_path=excluded.audio_path,
           status=excluded.status",
        params![
            record.id,
            record.name,
            record.created_at,
            record.duration_seconds,
            record.language,
            record.model,
            record.mode,
            record.transcript_text,
            record.transcript_json,
            record.audio_path,
            record.status,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn history_delete(id: String, delete_audio: bool, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let audio_path: Option<String> = conn
        .query_row("SELECT audio_path FROM history WHERE id = ?1", params![id], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    conn.execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if delete_audio {
        if let Some(p) = audio_path {
            let _ = std::fs::remove_file(p);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn history_rename(id: String, name: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute("UPDATE history SET name = ?1 WHERE id = ?2", params![name, id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
