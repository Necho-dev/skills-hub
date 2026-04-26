use std::fs;
use std::path::{Path, PathBuf};

use rayon::prelude::*;
use walkdir::WalkDir;

use crate::models::{ProjectGroup, ProjectSkill};

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", ".build", "target", "dist", ".next",
    "__pycache__", ".venv", "venv", ".tox", "build", ".cache",
    ".idea", ".vscode",
];

fn should_skip(dir_name: &str) -> bool {
    SKIP_DIRS.contains(&dir_name)
}

fn find_project_root(skill_path: &Path, scan_root: &Path) -> PathBuf {
    let mut current = skill_path.parent().unwrap_or(skill_path);
    while current != scan_root && current.starts_with(scan_root) {
        if current.join(".git").exists() {
            return current.to_path_buf();
        }
        if let Some(parent) = current.parent() {
            current = parent;
        } else {
            break;
        }
    }
    skill_path.parent().unwrap_or(scan_root).to_path_buf()
}

fn infer_platform_hint(path: &Path) -> Option<String> {
    let path_str = path.to_string_lossy().to_lowercase();
    if path_str.contains(".cursor/skills-cursor") {
        Some("Cursor".to_string())
    } else if path_str.contains(".cursor/skills") {
        Some("Cursor".to_string())
    } else if path_str.contains(".claude/skills") {
        Some("Claude Code".to_string())
    } else if path_str.contains(".agent/skills") {
        Some("Central".to_string())
    } else {
        None
    }
}

fn parse_skill_name(path: &Path) -> (String, Option<String>) {
    let skill_md = path.join("SKILL.md");
    if let Ok(content) = fs::read_to_string(&skill_md) {
        if content.starts_with("---") {
            if let Some(end) = content[3..].find("\n---") {
                let yaml = &content[3..end + 3];
                let mut name = None;
                let mut desc = None;
                for line in yaml.lines() {
                    if let Some((k, v)) = line.split_once(':') {
                        let k = k.trim();
                        let v = v.trim().trim_matches('"').trim_matches('\'').to_string();
                        if k == "name" { name = Some(v.clone()); }
                        if k == "description" && !v.is_empty() { desc = Some(v); }
                    }
                }
                if let Some(n) = name {
                    return (n, desc);
                }
            }
        }
    }
    let fallback = path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    (fallback, None)
}

fn scan_single_root(scan_root: &Path) -> Vec<(PathBuf, PathBuf)> {
    if !scan_root.exists() {
        return vec![];
    }

    let mut skill_dirs = Vec::new();
    let walker = WalkDir::new(scan_root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy();
                !should_skip(&name)
            } else {
                true
            }
        });

    for entry in walker.flatten() {
        if entry.file_name() == "SKILL.md" && entry.file_type().is_file() {
            if let Some(skill_dir) = entry.path().parent() {
                let project_root = find_project_root(skill_dir, scan_root);
                skill_dirs.push((skill_dir.to_path_buf(), project_root));
            }
        }
    }
    skill_dirs
}

#[tauri::command]
pub async fn scan_project_dirs(paths: Vec<String>) -> Result<Vec<ProjectGroup>, String> {
    let scan_roots: Vec<PathBuf> = paths
        .iter()
        .map(|p| {
            let expanded = if p.starts_with("$HOME") {
                if let Some(home) = dirs::home_dir() {
                    PathBuf::from(p.replacen("$HOME", &home.to_string_lossy(), 1))
                } else {
                    PathBuf::from(p)
                }
            } else {
                PathBuf::from(p)
            };
            expanded
        })
        .collect();

    let all_skills: Vec<(PathBuf, PathBuf)> = scan_roots
        .par_iter()
        .flat_map(|root| scan_single_root(root))
        .collect();

    let mut groups: std::collections::HashMap<String, ProjectGroup> =
        std::collections::HashMap::new();

    for (skill_path, project_root) in all_skills {
        let project_name = project_root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let project_path_str = project_root.to_string_lossy().to_string();
        let skill_id = skill_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let (name, description) = parse_skill_name(&skill_path);
        let platform_hint = infer_platform_hint(&skill_path);

        let skill = ProjectSkill {
            id: skill_id,
            name,
            description,
            path: skill_path.to_string_lossy().to_string(),
            project_name: project_name.clone(),
            project_path: project_path_str.clone(),
            platform_hint,
        };

        groups
            .entry(project_path_str.clone())
            .or_insert_with(|| ProjectGroup {
                project_name,
                project_path: project_path_str,
                skills: vec![],
            })
            .skills
            .push(skill);
    }

    let mut result: Vec<ProjectGroup> = groups.into_values().collect();
    result.sort_by(|a, b| a.project_name.cmp(&b.project_name));
    for group in &mut result {
        group.skills.sort_by(|a, b| a.name.cmp(&b.name));
    }
    Ok(result)
}
