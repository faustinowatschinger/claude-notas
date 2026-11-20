export type Doc = { fecha: string; texto: string; mtimeMs: number; error?: string }

declare module 'claude-code' {
  interface PluginState {
    agenda: { doc: Shaped<Doc>; dir: Shaped<string>; elegida: Shaped<string>; mes: Shaped<string> }
  }
}
