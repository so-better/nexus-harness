# Changelog

All notable changes to Nexus are documented here. Versions follow SemVer.

## [Unreleased]

### Added

- Command palette and global keyboard shortcuts.
- `Ctrl/Cmd+L` toggles the theme.
- Changelog entry and modal.
- Backup import/export in settings.
- On-demand tool loading with relevance recall, conditional model re-rank, and `search_tools` fallback.
- `read_artifact` to page through compacted tool output; `offset`/`limit` pagination for `read_file`, `grep`, `glob` and `list_dir`.
- Cache read/write token usage is recorded and exposed to the usage API.

### Changed

- Global memory moved into the dynamic environment block so the system prompt prefix stays cacheable.
- Tool re-rank only runs when the candidate margin is meaningful, with a shorter timeout and safe fallback.
- File and search tool outputs are passed through in full; outputs above a budget-aware threshold are saved as artifacts at execution time, with the full text kept for the UI and an artifact reference for read-back.

### Fixed

- The skin selector stayed on its previous value on the first selection.
- Sessions could open without the message list pinned to the bottom.
- System prompts and test coverage for small context windows.
- Context estimation now counts pass-back reasoning and calibrates against real provider usage.
- Compaction keeps the most recent tool output and previews include a `read_artifact` read-back hint.
- Known tools that were not injected are auto-loaded instead of failing with `TOOL_NOT_FOUND`.
- Anthropic prompt-cache fallback only retries when the error is cache-related.
