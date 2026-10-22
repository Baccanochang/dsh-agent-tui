# dsh-agent-tui

在会话里一键启动一个**真正的终端窗口**，里面运行 Claude Code、CodeBuddy、OpenCode 或任意自定义命令。

- 入口：会话标题栏右侧的 `>_ TUI` 按钮。
- 选择工具后：在会话的**当前工作目录**创建一个真实 PTY，自动输入命令，并打开右侧栏的官方终端标签（保持侧栏当前的分栏/全屏状态，不强制全屏）。
- 终端是宿主自带的交互式终端：完整 ANSI / 颜色 / 交互、可重连、关闭标签即结束进程。
- 输出不进入 DSH 对话记录，不占用模型上下文。
- 支持自定义命令，输入后回车或点「运行」。
- 需要更大空间时，用终端面板标签栏右端的全屏切换按钮手动切到全屏。

## 使用

1. 打开一个会话（终端会在该会话的工作目录中启动）。
2. 点标题栏的 `>_ TUI`。
3. 选 `Claude Code` / `CodeBuddy` / `OpenCode`，或在输入框输入任意命令（如 `claude --resume`、`codebuddy`）。
4. 右侧栏出现终端标签，CLI 直接可用。

前提：对应 CLI 已安装在 PATH 中，且已各自完成登录/配置。终端里会直接显示命令找不到等错误。

## 结构

| 文件 | 作用 |
|---|---|
| `cordis.patch.yml` | 插入 `dsh-agent-tui` 行 |
| `index.js` | Host 半，仅用于 bundle 形状与插件清单展示 |
| `client.js` | 浏览器模块：`conversation.session.header.actions` 上的 TUI 启动器 |
| `locale/*.json` | 插件管理页的标题与描述 |
| `icon.svg` | 插件图标 |

## 实现要点

- 通过 `ctx.webTerminals` 分配终端视图，`view.write()` 输入命令，再以同一 `terminalId`
  交给官方终端标签（`ctx.sidebarRight.openTabIn('terminal', { params: { terminalId } })`）。
- 打开标签后**不**自动切换全屏：保持用户当前的侧栏布局，由用户自行用全屏按钮切换。
- 终端进程属于会话，启动器丢弃自己的客户端流不会结束进程。
- 不 import 其他 Client 包、不写 DOM、不覆盖宿主样式；颜色全部走 `--dsw-alias-*` 令牌。

## 已知限制

- 每个工具每次点击都会新建一个终端标签；终端数量受宿主 `maxTerminals`（默认 8）限制，关闭标签可释放。
- 终端进程在页面刷新后可由标签重连，但 Host 重启后不会恢复。
- 启动器不会检测 CLI 是否安装；未安装时终端会显示 shell 的报错。
