# 发布流程（RELEASE）

本文件说明 Nexus 桌面应用的打包与发布步骤。**严格遵守顺序**：先改版本号 → 更新 CHANGELOG → 打包 → 归档产物 → 提交推送。

- 产物输出目录：`apps/desktop/release/`（`electron-builder` 的 `directories.output`）。
- 归档目录：仓库根目录 `archive/release/`（已通过 `.gitignore` 例外开白名单，产物入库）。
- 应用名 / 版本来源：`apps/desktop/package.json` 的 `productName`（`Nexus`）与 `version`；产物命名为
  `Nexus-<version>-<os>-<arch>.<ext>`。

前置检查（建议在每次发布前执行）：

```bash
pnpm install          # 首次或依赖变化时；postinstall 会为 Electron 重建 node-pty
pnpm typecheck
pnpm lint
pnpm test
```

---

## 一、macOS 发布（在 macOS 机器上执行）

### 第 1 步：修改版本号

编辑 `apps/desktop/package.json` 的 `version`（打包版本以它为准）；同时把根目录 `package.json` 的 `version` 改为一致，便于仓库整体对齐。

```jsonc
// apps/desktop/package.json
{ "name": "@nexus/desktop", "productName": "Nexus", "version": "0.0.2" }

// package.json（根）
{ "version": "0.0.2" }
```

版本遵循 SemVer：`MAJOR.MINOR.PATCH`。

### 第 2 步：更新 CHANGELOG（两个文件）

把 `[Unreleased]` 下的条目归档到新版本小节，中英各一份，内容对应：

- `CHANGELOG.md`（英文）
- `CHANGELOG.zh-CN.md`（中文）

```markdown
## [0.0.2] - 2026-01-20

### Added

- ...

### Fixed

- ...
```

新版本号必须与第 1 步一致。

### 第 3 步：打 macOS 包

进入 `apps/desktop` 目录后执行（脚本会先 `electron-vite build` 再 `electron-builder --mac`）：

```bash
cd apps/desktop
pnpm dist:mac           # 按当前机器架构打包（Apple Silicon → mac-arm64）
```

需要指定架构时：

```bash
pnpm dist:mac:arm64
pnpm dist:mac:x64
```

产物位于 `apps/desktop/release/`，主要文件：

```text
Nexus-<version>-mac-arm64.dmg
Nexus-<version>-mac-arm64.zip
```

### 第 4 步：复制 dmg 与 zip 到 archive/release

回到仓库根目录后执行：

```bash
cp apps/desktop/release/Nexus-<version>-mac-arm64.dmg archive/release/
cp apps/desktop/release/Nexus-<version>-mac-arm64.zip archive/release/
```

（把 `<version>` 换成实际版本号；架构不同时同步替换 `arm64`/`x64`。）

### 第 5 步：提交并推送

先检查工作区，确认本次要提交的内容：

```bash
git status
```

把当前工作区**所有未提交改动**一起提交并推送（版本号、两个 CHANGELOG、`archive/release` 归档产物等）：

```bash
git add -A
git commit -m "chore(release): v<version>"
git push
```

---

## 二、Windows 发布（在 Windows 机器上执行）

> 只打 Windows 包，不重复打 mac。若版本号/CHANGELOG 已在 mac 步骤中改好并推送，直接执行第 3 步即可；否则先做第 1、2 步。

### 第 1 步：修改版本号

同 mac 步骤：`apps/desktop/package.json`（及根 `package.json`）的 `version`。

### 第 2 步：更新 CHANGELOG（两个文件）

同 mac 步骤：`CHANGELOG.md` 与 `CHANGELOG.zh-CN.md`。

### 第 3 步：打 Windows 包

进入 `apps/desktop` 目录后执行：

```bash
cd apps/desktop
pnpm dist:win           # 脚本会先 build 再 electron-builder --win（x64）
```

需要显式指定 x64 时：

```bash
pnpm dist:win:x64
```

产物位于 `apps/desktop/release/`，主要文件：

```text
Nexus-<version>-win-x64.exe   # NSIS 安装包
Nexus-<version>-win-x64.zip   # 免安装压缩包
```

> zip 目标已配置在 `apps/desktop/package.json` 的 `build.win.target`；若缺失，请确认该处同时包含 `nsis` 与 `zip`。

### 第 4 步：复制 zip 与 exe 到 archive/release

回到仓库根目录后执行：

```powershell
copy apps\desktop\release\Nexus-<version>-win-x64.exe archive\release\
copy apps\desktop\release\Nexus-<version>-win-x64.zip archive\release\
```

### 第 5 步：提交并推送

先检查工作区，再把**所有未提交改动**一起提交并推送：

```bash
git status
git add -A
git commit -m "chore(release): v<version> (win)"
git push
```

---

## 产物与目录一览

| 路径                    | 说明                                                         |
| ----------------------- | ------------------------------------------------------------ |
| `apps/desktop/out/`     | `electron-vite build` 的编译产物（打包中间件，已忽略）       |
| `apps/desktop/build/`   | 打包资源（图标等，`buildResources`）                         |
| `apps/desktop/release/` | `electron-builder` 最终产物（已忽略，不入库）                |
| `archive/release/`      | **需要入库**的发布归档：mac `.dmg`/`.zip`，win `.exe`/`.zip` |

## 注意事项

- **产物入库体积大**：dmg/zip 常上百 MB，会明显增大仓库。当前按约定归档到 `archive/release/` 并入库；如需更规范，建议改用 Git LFS，或改为在 Gitee/GitHub Releases 上传产物、仓库只存校验和/说明。
- **`.gitignore` 例外**：根 `.gitignore` 的 `release/` 会连带忽略 `archive/release/`，已通过 `!archive/release/`、`!archive/release/**` 开白名单；调整 `.gitignore` 时勿破坏该例外。
- **macOS 未签名/未公证**：当前配置未做 codesign/notarize，用户首次打开可能被 Gatekeeper 拦截（右键 →“打开”，或 `xattr -dr com.apple.quarantine /Applications/Nexus.app`）。后续可接入签名与公证。
- **架构**：不指定时按当前机器架构打包（Apple Silicon → `mac-arm64`）；Windows 默认 `x64`。
- **发布前自检**：`pnpm typecheck`、`pnpm test`、`pnpm lint` 全绿；安装一次产物并跑通关键流程（启动、会话、工具调用、审批、终端、插件）。
- **版本显示**：应用内“关于”/设置页显示版本取自 `app.getVersion()`（即 `apps/desktop/package.json` 的 `version`），务必与 CHANGELOG 小节一致。
