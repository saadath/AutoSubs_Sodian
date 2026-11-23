use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub os: String,
    pub cpu: String,
    pub ram_total_mb: u64,
    pub ram_available_mb: u64,
    pub gpu_name: Option<String>,
    pub gpu_vram_mb: Option<u64>,
    pub has_nvidia: bool,
    pub cuda_available: bool,
}

#[tauri::command]
pub async fn get_hardware_info() -> Result<HardwareInfo, String> {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();

    let cpu = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    let ram_total_mb = sys.total_memory() / 1024 / 1024;
    let ram_available_mb = sys.available_memory() / 1024 / 1024;

    let (gpu_name, gpu_vram_mb, has_nvidia, cuda_available) = detect_nvidia_gpu().await;

    Ok(HardwareInfo {
        os: std::env::consts::OS.to_string(),
        cpu,
        ram_total_mb,
        ram_available_mb,
        gpu_name,
        gpu_vram_mb,
        has_nvidia,
        cuda_available,
    })
}

async fn detect_nvidia_gpu() -> (Option<String>, Option<u64>, bool, bool) {
    // Best-effort NVIDIA detection via nvidia-smi.
    let output = tokio::process::Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
        .await;
    let Ok(out) = output else {
        return (None, None, false, false);
    };
    if !out.status.success() {
        return (None, None, false, false);
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let line = stdout.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        return (None, None, false, false);
    }
    let mut parts = line.split(',').map(|s| s.trim());
    let name = parts.next().unwrap_or("NVIDIA GPU").to_string();
    let vram = parts.next().and_then(|s| s.parse::<u64>().ok());
    // CUDA availability heuristic: nvidia-smi exists and works; actual CUDA runtime depends on build.
    (Some(name), vram, true, true)
}
