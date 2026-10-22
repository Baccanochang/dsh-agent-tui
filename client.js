/**
 * dsh-agent-tui — browser half.
 *
 * A session-scoped launcher for real terminal (TUI) tools. Picking a tool in
 * the conversation header allocates a Host PTY in the Session's working
 * directory, types the tool's command into it, and opens the official terminal
 * tab in the right sidebar — so Claude Code, CodeBuddy, OpenCode and custom
 * commands run in a real terminal, not in a DSH-rendered imitation.
 *
 * The terminal itself is the shipped sidebar terminal: one attachment owns
 * input, output stays outside the Agent transcript, and the process survives
 * page navigation until its tab is closed.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-agent-tui',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    // ------------------------------------------------------------------ i18n

    const DICT = {
      en: {
        'action.tui': 'TUI',
        'action.title': 'Run a terminal tool in this session',
        'menu.title': 'Terminal tools',
        'menu.custom': 'Custom command',
        'menu.customPlaceholder': 'command to run, e.g. claude',
        'menu.run': 'Run',
        'menu.hint': 'Runs in this session’s working directory',
        'error.unavailable': 'This composition does not provide the terminal service.',
        'error.timeout': 'The shell did not become ready in time.',
        'error.method': 'The terminal could not be opened.',
        'state.starting': 'Starting {name}…',
      },
      zh: {
        'action.tui': 'TUI',
        'action.title': '在当前会话运行终端工具',
        'menu.title': '终端工具',
        'menu.custom': '自定义命令',
        'menu.customPlaceholder': '要运行的命令，例如 claude',
        'menu.run': '运行',
        'menu.hint': '在会话当前工作目录中运行',
        'error.unavailable': '当前组合没有提供终端服务。',
        'error.timeout': 'Shell 未在预期时间内就绪。',
        'error.method': '无法打开终端。',
        'state.starting': '正在启动 {name}…',
      },
    }

    let lang = 'zh'
    const langListeners = new Set()
    function setLang(next) {
      if (!next || next === lang) return
      lang = next
      for (const listener of langListeners) listener()
    }
    function subscribeLang(listener) {
      langListeners.add(listener)
      return () => { langListeners.delete(listener) }
    }
    function useLang() {
      return React.useSyncExternalStore(subscribeLang, () => lang, () => lang)
    }
    function t(key, vars) {
      const dict = lang.toLowerCase().startsWith('en') ? DICT.en : DICT.zh
      let text = dict[key]
      if (text === undefined) text = DICT.zh[key]
      if (text === undefined) return key
      if (vars) {
        text = text.replace(/\{(\w+)\}/g, (match, name) => {
          const value = vars[name]
          return value === undefined || value === null ? match : String(value)
        })
      }
      return text
    }

    // ----------------------------------------------------------------- tools

    const TOOLS = [
      { id: 'claude', name: 'Claude Code', command: 'claude' },
      { id: 'codebuddy', name: 'CodeBuddy', command: 'codebuddy' },
      { id: 'opencode', name: 'OpenCode', command: 'opencode' },
    ]

    function delay(ms) {
      return new Promise(resolve => { setTimeout(resolve, ms) })
    }

    function waitForWritable(view, timeoutMs) {
      return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs
        const check = () => {
          const state = view.state.getSnapshot()
          if (state && state.writable && state.info) {
            resolve()
            return true
          }
          if (state && (state.phase === 'failed' || state.phase === 'closed')) {
            reject(new Error(state.error || state.phase))
            return true
          }
          if (Date.now() > deadline) {
            reject(new Error('timeout'))
            return true
          }
          return false
        }
        if (check()) return
        const timer = setInterval(() => {
          if (!check()) return
          clearInterval(timer)
        }, 100)
      })
    }

    function newContentId() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return 'dsh-agent-tui-' + crypto.randomUUID()
      } catch (_error) { /* fall through */ }
      return 'dsh-agent-tui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
    }

    /**
     * Allocate a PTY in the Session directory, type the command, and hand the
     * same Host terminal identity to an official sidebar terminal tab.
     */
    async function launchTool(ctx, sessionId, name, command) {
      const terminals = ctx.get('webTerminals')
      const sidebar = ctx.get('sidebarRight')
      if (!terminals || !sidebar) throw new Error(t('error.unavailable'))
      const contentId = newContentId()
      const view = terminals.view(sessionId, contentId, contentId, undefined, undefined)
      let opened = false
      try {
        view.mount()
        try {
          await waitForWritable(view, 20000)
        } catch (error) {
          throw new Error(error && error.message === 'timeout' ? t('error.timeout') : String(error && error.message ? error.message : error))
        }
        try {
          await view.rename('TUI · ' + name)
        } catch (_error) { /* the tab title falls back to the shell title */ }
        await delay(400)
        view.write(command + '\r')
        await delay(300)
        const options = { params: { terminalId: view.id } }
        if (typeof sidebar.openTabIn === 'function') sidebar.openTabIn(sessionId, 'terminal', options)
        else if (typeof sidebar.openTab === 'function') sidebar.openTab('terminal', options)
        else throw new Error(t('error.method'))
        opened = true
      } finally {
        // The Host process outlives this client attachment: the tab adopts the
        // same terminal identity, so dropping the launcher's stream never kills it.
        void view.dispose()
        if (!opened && view.id !== undefined) {
          // No tab adopted the process, so nothing would ever show or close it.
          try {
            void terminals.close(view.id)
          } catch (_error) { /* already gone */ }
        }
      }
    }

    // ------------------------------------------------------------------- ui

    const CSS = [
      '.dsh-tui-launcher{position:relative;display:inline-flex;align-items:center;}',
      '.dsh-tui-button{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;}',
      '.dsh-tui-button:hover,.dsh-tui-button.is-open{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);}',
      '.dsh-tui-button:disabled{opacity:.6;cursor:default;}',
      '.dsh-tui-glyph{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:11px;letter-spacing:-.5px;}',
      '.dsh-tui-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:40;width:250px;padding:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 28px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:2px;}',
      '.dsh-tui-menu-title{padding:4px 8px 6px;font-size:11px;color:var(--dsw-alias-label-tertiary);}',
      '.dsh-tui-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:7px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer;}',
      '.dsh-tui-item:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.dsh-tui-item:disabled{opacity:.55;cursor:default;}',
      '.dsh-tui-item-cmd{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);}',
      '.dsh-tui-sep{height:1px;margin:5px 4px;background:var(--dsw-alias-border-l1);}',
      '.dsh-tui-custom{display:flex;gap:6px;padding:2px 4px 4px;}',
      '.dsh-tui-input{flex:1;min-width:0;height:26px;padding:0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;}',
      '.dsh-tui-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);}',
      '.dsh-tui-run{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;}',
      '.dsh-tui-run:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.dsh-tui-run:disabled{opacity:.55;cursor:default;}',
      '.dsh-tui-hint{padding:2px 8px 4px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);}',
      '.dsh-tui-error{padding:4px 8px 2px;font-size:11px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;}',
      '.dsh-tui-busy{padding:6px 8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);}',
    ].join('\n')

    function StyleTag() {
      return h('style', null, CSS)
    }

    function TuiLauncher(props) {
      useLang()
      const sessionId = props.sessionId
      const [open, setOpen] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')
      const [custom, setCustom] = React.useState('')
      const rootRef = React.useRef(null)
      const ctx = props.ctx

      React.useEffect(() => {
        if (!open) return
        const onPointer = (event) => {
          const root = rootRef.current
          if (root && !root.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointer, true)
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('pointerdown', onPointer, true)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [open])

      const start = async (name, command) => {
        if (busy.length > 0) return
        setBusy(name)
        setError('')
        try {
          await launchTool(ctx, sessionId, name, command)
          setOpen(false)
          setCustom('')
        } catch (failure) {
          setError(failure && failure.message ? failure.message : String(failure))
        } finally {
          setBusy('')
        }
      }

      return h('span', { className: 'dsh-tui-launcher', ref: rootRef },
        h(StyleTag),
        h('button', {
          type: 'button',
          className: 'dsh-tui-button' + (open ? ' is-open' : ''),
          onClick: () => { setOpen(value => !value) },
          title: t('action.title'),
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          disabled: busy.length > 0,
        },
          h('span', { className: 'dsh-tui-glyph' }, '>_'),
          h('span', null, t('action.tui'))),
        open
          ? h('div', { className: 'dsh-tui-menu', role: 'menu' },
            h('div', { className: 'dsh-tui-menu-title' }, t('menu.title')),
            busy.length > 0
              ? h('div', { className: 'dsh-tui-busy' }, t('state.starting', { name: busy }))
              : null,
            TOOLS.map(tool => h('button', {
              key: tool.id,
              type: 'button',
              role: 'menuitem',
              className: 'dsh-tui-item',
              disabled: busy.length > 0,
              onClick: () => { void start(tool.name, tool.command) },
            },
              h('span', null, tool.name),
              h('code', { className: 'dsh-tui-item-cmd' }, tool.command))),
            h('div', { className: 'dsh-tui-sep' }),
            h('div', { className: 'dsh-tui-menu-title' }, t('menu.custom')),
            h('div', { className: 'dsh-tui-custom' },
              h('input', {
                className: 'dsh-tui-input',
                value: custom,
                placeholder: t('menu.customPlaceholder'),
                spellCheck: false,
                disabled: busy.length > 0,
                onChange: event => { setCustom(event.target.value) },
                onKeyDown: (event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  const command = custom.trim()
                  if (command.length > 0) void start(command, command)
                },
              }),
              h('button', {
                type: 'button',
                className: 'dsh-tui-run',
                disabled: busy.length > 0 || custom.trim().length === 0,
                onClick: () => {
                  const command = custom.trim()
                  if (command.length > 0) void start(command, command)
                },
              }, t('menu.run'))),
            error.length > 0 ? h('div', { className: 'dsh-tui-error' }, error) : null,
            h('div', { className: 'dsh-tui-hint' }, t('menu.hint')))
          : null)
    }

    // ---------------------------------------------------------------- plugin

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale')
        if (locale && typeof locale.getLocale === 'function') {
          try {
            const snapshot = locale.getLocale()
            setLang(String((snapshot && snapshot.active) || ''))
          } catch (_error) { /* keep the default language */ }
          if (typeof locale.subscribe === 'function') {
            ctx.effect(() => locale.subscribe(() => {
              try {
                const snapshot = locale.getLocale()
                setLang(String((snapshot && snapshot.active) || ''))
              } catch (_error) { /* keep the current language */ }
            }))
          }
        }

        function BoundLauncher(props) {
          return h(TuiLauncher, { ...props, ctx })
        }

        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'tui-launcher',
          order: 30,
          label: () => t('action.tui'),
        }, BoundLauncher))
      },
    }
  },
})
