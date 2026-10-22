/**
 * Host half of dsh-agent-tui.
 *
 * The launcher runs entirely in the browser over the existing terminal
 * services (`ctx.webTerminals`, `ctx.sidebarRight`), so this half registers
 * nothing and owns no Host state. It exists so the bundle has a Loader row and
 * shows up in the plugin inventory.
 */
export function apply() {}
