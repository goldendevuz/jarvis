/** Open and close Windows apps through the host helper (scripts/pc-helper.mjs). */
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const ok = (text) => ({ content: [{ type: 'text', text }] })
const APPS = 'chrome, edge, notepad/bloknot, calculator/kalkulyator, explorer, word, excel, powerpoint, telegram, spotify, vscode, paint'

export function pcServer(helperUrl, secret) {
  const call = async (path, body) => {
    try {
      const res = await fetch(`${helperUrl}${path}`, {
        method: 'POST',
        headers: { 'x-jarvis-secret': secret, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      })
      const data = await res.json().catch(() => ({}))
      return res.ok ? ok('Done.') : ok(`Failed: ${data.error ?? res.status}`)
    } catch (e) {
      return ok(`The computer helper is not reachable (${e.cause?.code ?? e.message}).`)
    }
  }
  return createSdkMcpServer({
    name: 'jarvis_pc',
    version: '1.0.0',
    instructions: `Control of the user's Windows computer: open and close apps, open links. Apps: ${APPS}.`,
    alwaysLoad: true,
    tools: [
      tool('pc_open_app', `Open an app on the user's computer. One of: ${APPS}.`,
        { app: z.string() }, async ({ app }) => call('/open_app', { app })),
      tool('pc_close_app', 'Close an app on the user\'s computer.',
        { app: z.string() }, async ({ app }) => call('/close_app', { app })),
      tool('pc_open_url', "Open a web link (http/https) in the user's default browser.",
        { url: z.string() }, async ({ url }) => call('/open_url', { url })),
    ],
  })
}
