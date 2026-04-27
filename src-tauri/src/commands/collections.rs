use tauri::State;

use crate::commands::skills::SymlinkLock;
use crate::models::InstallResult;

#[tauri::command]
pub async fn batch_install_collection(
    skill_ids: Vec<String>,
    platform_paths: Vec<String>,
    overwrite: bool,
    central_dir: Option<String>,
    lock: State<'_, SymlinkLock>,
) -> Result<Vec<InstallResult>, String> {
    let mut results = Vec::new();

    for skill_id in &skill_ids {
        for platform_path in &platform_paths {
            let result = crate::commands::skills::install_skill_to_platform(
                skill_id.clone(),
                platform_path.clone(),
                overwrite,
                central_dir.clone(),
                lock.clone(),
            )
            .await;

            match result {
                Ok(r) => results.push(r),
                Err(e) => results.push(InstallResult {
                    skill_id: skill_id.clone(),
                    platform_id: platform_path.clone(),
                    success: false,
                    error: Some(e),
                }),
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_platform_paths() -> Result<Vec<serde_json::Value>, String> {
    let home = dirs::home_dir().unwrap_or_default();

    macro_rules! platform {
        ($id:expr, $name:expr, $rel:expr) => {
            serde_json::json!({
                "id": $id,
                "name": $name,
                "path": home.join($rel).to_string_lossy().to_string()
            })
        };
    }

    Ok(vec![
        // AI 编辑器
        platform!("cursor",      "Cursor",     ".cursor/skills"),
        platform!("trae",        "Trae",       ".trae/skills"),
        platform!("trae-cn",     "Trae CN",    ".trae-cn/skills"),
        platform!("windsurf",    "Windsurf",   ".windsurf/skills"),
        platform!("qoder",       "Qoder",      ".qoder/skills"),
        platform!("codebuddy",   "CodeBuddy",  ".codebuddy/skills"),
        platform!("kiro",        "Kiro",         ".kiro/skills"),
        // AI 助手（CLI / Agent）
        platform!("claude-code", "Claude Code",  ".claude/skills"),
        platform!("codex-cli",   "Codex CLI",    ".agents/skills"),
        platform!("gemini-cli",  "Gemini CLI",   ".gemini/skills"),
        platform!("qwen",        "Qwen",         ".qwen/skills"),
        platform!("opencode",    "OpenCode",     ".opencode/skills"),
        platform!("hermes",      "Hermes",       ".hermes/skills"),
    ])
}
