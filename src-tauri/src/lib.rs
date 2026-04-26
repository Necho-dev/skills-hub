mod commands;
mod models;

use commands::skills::SymlinkLock;
use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init_schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:skillshub.db", migrations)
                .build(),
        )
        .manage(SymlinkLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            // skills
            commands::skills::scan_central_skills,
            commands::skills::get_skill_markdown,
            commands::skills::check_symlink_conflict,
            commands::skills::install_skill_to_platform,
            commands::skills::uninstall_skill_from_platform,
            commands::skills::delete_skill,
            commands::skills::get_installed_platforms,
            commands::skills::init_central_dir,
            commands::skills::reveal_in_finder,
            commands::skills::import_skill_to_central,
            commands::skills::get_project_skill_markdown,
            commands::skills::check_path_exists,
            commands::skills::count_platform_skills,
            commands::skills::pack_skill_to_zip,
            commands::skills::unpack_skill_to_central,
            commands::skills::patch_skill_meta,
            commands::skills::scan_platform_native_skills,
            commands::skills::move_skill_to_central,
            commands::skills::link_project_skill_to_central,
            // projects
            commands::projects::scan_project_dirs,
            // github
            commands::github::fetch_marketplace_publishers,
            commands::github::preview_github_import,
            commands::github::execute_github_import,
            // marketplace sources
            commands::marketplace::fetch_source_skills,
            commands::marketplace::download_source_skill,
            commands::marketplace::fetch_skill_detail,
            // collections
            commands::collections::batch_install_collection,
            commands::collections::get_platform_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
