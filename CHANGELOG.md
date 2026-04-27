# Changelog

本文件记录 SkillsHub 各版本的变更内容，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 规范，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [0.1.1] - 2026-04-28

### 新增

- **在线更新**：集成 `tauri-plugin-updater`，设置页「关于」Tab 新增「版本更新」区块，支持一键检查更新、展示 Changelog、下载进度条及自动重启安装
- **多文件 Skill 支持**：技能详情面板新增文件树侧边栏（`SkillFileTree`），可浏览 Skill 目录下的所有文件；代码文件通过内置 Monaco 编辑器（只读）高亮预览（`CodeFilePreview`）
- **Frontmatter 面板**：技能详情面板新增 `FrontmatterPanel`，自动解析并展示 Skill 的元数据（标题、描述、标签等）
- **中央目录迁移**：基础设置新增中央目录迁移功能，更改目录后可一键将已有技能和 Symlink 迁移至新路径，迁移结果实时展示
- **中央目录设置弹窗**：新增 `CentralDirSetupModal` 组件，引导首次配置中央技能库目录
- **项目技能预览**：项目库技能预览面板与中央库对齐，支持文件树侧边栏和代码文件预览
- **更多平台图标**：新增 OpenCode、Qwen、Hermes、Codex CLI 等 AI 平台图标支持
- **设置持久化**：新增 `settingsStore`，统一管理中央目录等全局配置的本地持久化

### 优化

- 技能详情面板快速分发区块 UI 优化，改为更紧凑的「快速分发到平台」标注
- 项目库扫描性能优化，二进制文件自动跳过预览
- Marketplace 来源数据结构优化
- CI 构建矩阵移除 macOS Intel（`macos-13`）条目，解决长期等待构建资源导致发布阻塞的问题

### 修复

- GitHub 导入命令优化，减少重复请求
- Collections 批量安装命令修复

---

## [0.1.0] - 2026-04-27

### 新增

- **中央库（Central Library）**：统一存储所有 Skills，支持搜索、平台筛选、标签管理与 Markdown 预览
- **项目库（Project Library）**：按项目目录维度管理 Skills，支持扫描本地目录自动发现
- **一键分发**：通过符号链接（Symlink）将 Skill 零拷贝安装到 Cursor、Trae、Claude Code、Windsurf 等 AI 平台配置目录
- **收藏夹（Collections）**：创建收藏分组，支持 @dnd-kit 拖拽排序，支持导入/导出 `.skillcol` 格式
- **Marketplace**：内置 SkillHub、ClawHub、SkillsMP 三个技能源，支持搜索浏览和一键安装；支持添加兼容 SkillHub API 的自建源
- **GitHub 导入**：支持直接从 GitHub 仓库路径导入 Skills
- **Markdown 预览**：内置 react-markdown + highlight.js 代码高亮渲染
- **深色 / 浅色主题**：跟随系统主题，支持手动切换
- **离线优先**：本地 SQLite 数据库（tauri-plugin-sql），无需联网可使用全部核心功能
- **跨平台支持**：macOS (Apple Silicon / Intel)、Windows (x64)、Linux (x64)
- **CI/CD**：GitHub Actions 自动化构建与多平台发布（release.yml）

[0.1.1]: https://github.com/Necho-dev/skills-hub/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Necho-dev/skills-hub/releases/tag/v0.1.0
