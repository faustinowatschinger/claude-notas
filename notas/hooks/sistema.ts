import type { EngineInterface } from 'claude-code'

// Todo lo que depende del sistema operativo vive acá: rutas, carpeta del usuario,
// portapapeles, Papelera, listar y buscar en los .md. macOS y Linux usan los comandos
// de siempre; Windows usa PowerShell. Las rutas se manejan siempre con «/».

export type SO = 'macos' | 'windows' | 'linux'
export type Hallazgo = { ruta: string; linea: number; texto: string }

const UTF8 = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', LC_CTYPE: 'UTF-8' }

export async function plataforma($: EngineInterface): Promise<SO> {
  let p: string | undefined
  try {
    p = (await $.session.info()).platform
  } catch {
    p = undefined
  }
  if (!p || p === 'unknown') {
    // Respaldo: Windows define OS=Windows_NT; Linux, OSTYPE o la falta de Mac.
    let os: string | undefined
    try { os = await $.env.get('OS') } catch { os = undefined }
    if (os === 'Windows_NT') return 'windows'
    let ostype: string | undefined
    try { ostype = await $.env.get('OSTYPE') } catch { ostype = undefined }
    if (ostype && ostype.startsWith('linux')) return 'linux'
    return 'macos'
  }
  if (p === 'windows') return 'windows'
  if (p === 'linux' || p === 'wsl') return 'linux'
  return 'macos'
}

export const normalizar = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
export const esAbsoluta = (p: string) => /^([A-Za-z]:[\\/]|\/|\\\\)/.test(p)

export async function carpetaUsuario($: EngineInterface) {
  const leer = async (f: () => Promise<string | undefined>) => { try { return await f() } catch { return undefined } }
  const home = (await leer(() => $.env.get('HOME'))) || (await leer(() => $.env.get('USERPROFILE'))) || ''
  return normalizar(home)
}

// Comillas simples de PowerShell: se duplican.
const ps = (t: string) => `'${t.replace(/'/g, "''")}'`

async function powershell($: EngineInterface, script: string, stdin?: string) {
  const pre = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;[Console]::InputEncoding=[Text.Encoding]::UTF8;'
  return $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', pre + script], { timeoutMs: 30000, ...(stdin !== undefined ? { stdin } : {}) })
}

// Nota: con `env` se pasa la ruta completa del comando, por si el entorno nuevo no trae PATH.

// Los .md del proyecto, y las carpetas vacías con «/» al final, salteando las carpetas pesadas.
// null si no se pudo listar (el comando no arrancó o tardó más de la cuenta).
export async function listarMd($: EngineInterface, so: SO, raiz: string, podar: string[]): Promise<string[] | null> {
  let salida = ''
  if (so === 'windows') {
    const lista = podar.map(ps).join(',')
    const script = `$raiz=${ps(raiz)};$podar=@(${lista});function W($d){Get-ChildItem -LiteralPath $d -Force -ErrorAction SilentlyContinue | ForEach-Object { if($_.PSIsContainer){ if($podar -notcontains $_.Name){ if(-not (Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue | Select-Object -First 1)){ $_.FullName } else { W $_.FullName } } } elseif($_.Extension -eq '.md'){ $_.FullName } } };W $raiz`
    const r = await powershell($, script).catch(() => undefined)
    if (!r) return null
    salida = r.stdout
    const base = normalizar(raiz) + '/'
    return salida.split(/\r?\n/).filter(Boolean).map(normalizar).map(p => p.startsWith(base) ? p.slice(base.length) : p)
      .map(p => (p.toLowerCase().endsWith('.md') ? p : `${p}/`)).sort((a, b) => a.localeCompare(b, 'es'))
  }
  const argv = ['find', '.', '(']
  podar.forEach((n, i) => argv.push(...(i ? ['-o'] : []), '-name', n))
  argv.push(')', '-prune', '-o', '-type', 'f', '-name', '*.md', '-print', '-o', '-type', 'd', '-empty', '-print')
  const r = await $.process.run(argv, { cwd: raiz, timeoutMs: 20000 }).catch(() => undefined)
  if (!r) return null
  return r.stdout.split('\n').filter(l => l && l !== '.').map(p => p.replace(/^\.\//, ''))
    .map(p => (p.endsWith('.md') ? p : `${p}/`)).sort((a, b) => a.localeCompare(b, 'es'))
}

// Busca un texto (sin distinguir mayúsculas) en los .md. Con soloArchivos, devuelve un hallazgo por archivo.
export async function buscarTexto($: EngineInterface, so: SO, raiz: string, archivos: string[], podar: string[], q: string, soloArchivos: boolean, porArchivo = 3): Promise<Hallazgo[]> {
  if (so === 'windows') {
    const lista = archivos.filter(a => !a.endsWith('/'))
    if (lista.length === 0) return []
    const sel = soloArchivos ? '-List ' : ''
    const script = `$q=${ps(q)};Set-Location -LiteralPath ${ps(raiz)};$input | ForEach-Object { Select-String -LiteralPath $_ -SimpleMatch -Pattern $q ${sel}-ErrorAction SilentlyContinue | Select-Object -First ${soloArchivos ? 1 : porArchivo} | ForEach-Object { '{0}:{1}:{2}' -f ($_.Path), $_.LineNumber, $_.Line } }`
    const r = await powershell($, script, lista.join('\n')).catch(() => undefined)
    if (!r) return []
    const base = normalizar(raiz) + '/'
    return r.stdout.split(/\r?\n/).filter(Boolean).flatMap(l => {
      const m = /^(.*?\.md):(\d+):(.*)$/i.exec(normalizar(l))
      if (!m) return []
      const ruta = m[1].startsWith(base) ? m[1].slice(base.length) : m[1]
      return [{ ruta, linea: Number(m[2]) - 1, texto: m[3] }]
    })
  }
  const args = ['-rIn', '--include=*.md', ...podar.map(d => `--exclude-dir=${d}`), ...(soloArchivos ? ['-l'] : ['-m', String(porArchivo)]), '-i', '-F', '-e', q, '.']
  const r = await $.process.run(['/usr/bin/grep', ...args], { cwd: raiz, timeoutMs: 20000, env: UTF8 }).catch(() => undefined)
  if (!r) return []
  return r.stdout.split('\n').filter(Boolean).flatMap(l => {
    const m = /^\.\/(.+?):(\d+):(.*)$/.exec(l)
    if (m) return [{ ruta: m[1], linea: Number(m[2]) - 1, texto: m[3] }]
    return l.startsWith('./') ? [{ ruta: l.slice(2), linea: 0, texto: '' }] : []
  })
}

export async function crearCarpeta($: EngineInterface, so: SO, abs: string) {
  const r = so === 'windows'
    ? await powershell($, `New-Item -ItemType Directory -Force -Path ${ps(abs)} | Out-Null`).catch(() => undefined)
    : await $.process.run(['mkdir', '-p', abs]).catch(() => undefined)
  return !!r && r.exitCode === 0
}

// Manda a la Papelera del sistema; nunca borra en el acto.
export async function aLaPapelera($: EngineInterface, so: SO, abs: string, home: string, ms: number) {
  if (so === 'windows') {
    const r = await powershell($, `Add-Type -AssemblyName Microsoft.VisualBasic;[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(${ps(abs)},'OnlyErrorDialogs','SendToRecycleBin')`).catch(() => undefined)
    return r && r.exitCode === 0 ? '' : (r?.stderr.trim() || 'PowerShell no respondió')
  }
  if (so === 'linux') {
    const g = await $.process.run(['gio', 'trash', abs]).catch(() => undefined)
    if (g && g.exitCode === 0) return ''
    const destino = `${home}/.local/share/Trash/files`
    await $.process.run(['mkdir', '-p', destino]).catch(() => undefined)
    const nombre = abs.split('/').pop()!.replace(/\.md$/, '')
    const r = await $.process.run(['mv', '-n', abs, `${destino}/${nombre} ${ms}.md`]).catch(() => undefined)
    return r && r.exitCode === 0 ? '' : (r?.stderr.trim() || 'no se pudo mover')
  }
  const nombre = abs.split('/').pop()!.replace(/\.md$/, '')
  const r = await $.process.run(['mv', '-n', abs, `${home}/.Trash/${nombre} ${ms}.md`]).catch(() => undefined)
  return r && r.exitCode === 0 ? '' : (r?.stderr.trim() || 'no se pudo mover')
}

export async function leerPortapapeles($: EngineInterface, so: SO) {
  if (so === 'windows') {
    const r = await powershell($, 'Get-Clipboard -Raw').catch(() => undefined)
    return r && r.exitCode === 0 ? r.stdout.replace(/\r?\n$/, '') : undefined
  }
  if (so === 'linux') {
    for (const argv of [['wl-paste', '--no-newline'], ['xclip', '-selection', 'clipboard', '-o'], ['xsel', '--clipboard', '--output']]) {
      const r = await $.process.run(argv, { timeoutMs: 5000 }).catch(() => undefined)
      if (r && r.exitCode === 0) return r.stdout
    }
    return undefined
  }
  const r = await $.process.run(['/usr/bin/pbpaste'], { timeoutMs: 5000, env: UTF8 }).catch(() => undefined)
  return r && r.exitCode === 0 ? r.stdout : undefined
}

export async function escribirPortapapeles($: EngineInterface, so: SO, texto: string) {
  if (so === 'windows') {
    await powershell($, 'Set-Clipboard -Value ([Console]::In.ReadToEnd())', texto).catch(() => undefined)
    return
  }
  if (so === 'linux') {
    for (const argv of [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '--clipboard', '--input']]) {
      const r = await $.process.run(argv, { stdin: texto, timeoutMs: 5000 }).catch(() => undefined)
      if (r && r.exitCode === 0) return
    }
    return
  }
  await $.process.run(['/usr/bin/pbcopy'], { stdin: texto, timeoutMs: 5000, env: UTF8 }).catch(() => undefined)
}
