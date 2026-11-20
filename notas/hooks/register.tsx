import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Contenido, Edicion, Hallazgo, Rutas, Vinculos, Vista } from '../types'

const PANE = 'notas'
const PODAR = ['node_modules', '.git', '.venv', '.next', 'dist', 'build', 'out', 'vendor', 'Pods', '__pycache__', '.pytest_cache', 'coverage', 'crudos', 'Videos', 'imagenes-temporales', 'public', '.obsidian']

const vista = atom({ plugin: 'notas', key: 'vista' } as const, { abiertas: [], filtro: '' } as Vista, { shape: 'vista-4' })
const edicion = atom({ plugin: 'notas', key: 'edicion' } as const, { archivo: '', texto: '', version: 0 } as Edicion, { shape: 'edicion-1' })
const respaldo = atom({ plugin: 'notas', key: 'respaldo' } as const, 0, { shape: 'respaldo-1' })
const aviso = atom({ plugin: 'notas', key: 'aviso' } as const, '', { shape: 'aviso-1' })
// Dónde van las notas, las copias previas y la Papelera: se arman al abrir la sesión.
const rutasA = atom({ plugin: 'notas', key: 'rutas' } as const, { notas: '', versiones: '', papelera: '', plantillas: '' } as Rutas, { shape: 'rutas-2' })
const raiz = atom({ plugin: 'notas', key: 'raiz' } as const, '', { shape: 'raiz-1' })
const contenidoA = atom({ plugin: 'notas', key: 'contenido' } as const, { q: '', hits: [] } as Contenido, { shape: 'contenido-1' })
const vinculosA = atom({ plugin: 'notas', key: 'vinculos' } as const, { archivo: '', salientes: [], entrantes: [] } as Vinculos, { shape: 'vinculos-1' })
const indiceA = atom({ plugin: 'notas', key: 'indice' } as const, [] as string[], { shape: 'indice-2' })

// Corta un .md en secciones: cada título abre una, y un tramo sin títulos se corta cada 25 líneas.
export function secciones(texto: string) {
  const lineas = texto.split('\n')
  const out: { inicio: number; texto: string }[] = []
  let inicio = 0
  let enCodigo = false
  for (let i = 0; i < lineas.length; i++) {
    if (/^\s*```/.test(lineas[i])) enCodigo = !enCodigo
    const corta = i > inicio && !enCodigo && (/^#{1,6}\s/.test(lineas[i]) || (i - inicio >= 25 && lineas[i].trim() === ''))
    if (corta) {
      out.push({ inicio, texto: lineas.slice(inicio, i).join('\n') })
      inicio = i
    }
  }
  out.push({ inicio, texto: lineas.slice(inicio).join('\n') })
  return out.filter(x => x.texto.trim() !== '')
}

// ---------- Estilo Obsidian: enlaces, propiedades, índice, tags, plantillas ----------

// [[nota]], [[nota|alias]] y [[nota#sección]]: devuelve el nombre de la nota de cada uno.
export function enlaces(texto: string) {
  const out: string[] = []
  for (const m of texto.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const n = m[1].trim()
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

// Busca en el índice la nota que corresponde a un nombre de enlace.
export function resolverEnlace(indice: string[], nombre: string) {
  const n = nombre.toLowerCase().replace(/\.md$/, '')
  return indice.find(p => p.toLowerCase().replace(/\.md$/, '') === n)
    ?? indice.find(p => (p.split('/').pop() ?? '').toLowerCase().replace(/\.md$/, '') === n)
}

// El encabezado YAML entre --- arriba de todo: clave: valor por línea.
export function propiedades(texto: string) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(texto)
  if (!m) return { props: [] as [string, string][], cuerpo: texto, salto: 0 }
  const props: [string, string][] = []
  let clave = ''
  for (const l of m[1].split('\n')) {
    const kv = /^([\w\-áéíóúñ]+):\s*(.*)$/i.exec(l)
    if (kv) { clave = kv[1]; props.push([clave, kv[2].replace(/^["']|["']$/g, '')]) }
    else if (clave && /^\s+-\s*/.test(l)) {
      const ult = props[props.length - 1]
      ult[1] = (ult[1] ? ult[1] + ', ' : '') + l.replace(/^\s+-\s*/, '').replace(/^["']|["']$/g, '')
    }
  }
  return { props, cuerpo: texto.slice(m[0].length), salto: m[0].split('\n').length - 1 }
}

// Los títulos de la nota con su línea (fuera de bloques de código).
export function indiceDe(texto: string) {
  const out: { nivel: number; texto: string; linea: number }[] = []
  let codigo = false
  texto.split('\n').forEach((l, i) => {
    if (/^\s*```/.test(l)) codigo = !codigo
    const m = !codigo && /^(#{1,6})\s+(.*)$/.exec(l)
    if (m) out.push({ nivel: m[1].length, texto: m[2].replace(/[*_`]/g, ''), linea: i })
  })
  return out
}

// #etiquetas del texto (no los títulos, no los anclas de links).
export function etiquetas(texto: string) {
  const out: string[] = []
  let codigo = false
  for (const l of texto.split('\n')) {
    if (/^\s*```/.test(l)) codigo = !codigo
    if (codigo || /^#{1,6}\s/.test(l)) continue
    for (const m of l.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]*\p{L}[\p{L}\p{N}_\-/]*)/gu)) {
      const t = '#' + m[1]
      if (!out.includes(t)) out.push(t)
    }
  }
  return out
}

// Reemplaza {{fecha}}, {{hora}} y {{titulo}} en una plantilla.
export function aplicarPlantilla(t: string, ms: number, titulo: string) {
  const d = new Date(ms - 3 * 3600 * 1000).toISOString()
  return t.replace(/\{\{\s*(fecha|date)\s*\}\}/gi, d.slice(0, 10)).replace(/\{\{\s*(hora|time)\s*\}\}/gi, d.slice(11, 16)).replace(/\{\{\s*(titulo|título|title)\s*\}\}/gi, titulo)
}

// Nombres de nota para «[[»: los que contienen lo escrito, sin repetir, los más cortos primero.
export function sugerirNotas(indice: string[], q: string, max = 8) {
  const t = normal(q)
  const nombres = [...new Set(indice.map(p => (p.split('/').pop() ?? '').replace(/\.md$/, '')))]
  return nombres.filter(n => normal(n).includes(t)).sort((a, b) => a.length - b.length || a.localeCompare(b, 'es')).slice(0, max)
}

// Resalta los [[enlaces]] en la lectura: el panel de escritorio abre los links por su cuenta.
const resaltarEnlaces = (t: string) => t.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, n, alias) => `**⟦${(alias || n).trim()}⟧**`)

const normal = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function buscar(lista: string[], filtro: string, max = 60) {
  const terminos = normal(filtro).split(/\s+/).filter(Boolean)
  if (terminos.length === 0) return []
  return lista.filter(p => !p.endsWith('/') && terminos.every(t => normal(p).includes(t))).slice(0, max)
}

export function hijos(lista: string[], carpeta: string) {
  const pre = carpeta ? `${carpeta}/` : ''
  const carpetas = new Map<string, number>()
  const archivos: string[] = []
  for (const p of lista) {
    if (!p.startsWith(pre)) continue
    const resto = p.slice(pre.length)
    if (resto === '') continue
    const i = resto.indexOf('/')
    if (i < 0) archivos.push(p)
    else {
      const c = pre + resto.slice(0, i)
      const esArchivo = !p.endsWith('/')
      carpetas.set(c, (carpetas.get(c) ?? 0) + (esArchivo ? 1 : 0))
    }
  }
  return {
    carpetas: [...carpetas.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')),
    archivos: archivos.sort((a, b) => a.localeCompare(b, 'es')),
  }
}

export const rutaValida = (n: string) => {
  const limpio = n.trim().replace(/\.md$/i, '').replace(/^\/+/, '')
  if (!limpio || limpio.split('/').some(s => s === '' || s === '.' || s === '..' || s.startsWith('.'))) return undefined
  return `${limpio}.md`
}

const sello = (ms: number) => {
  const d = new Date(ms - 3 * 3600 * 1000).toISOString()
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) }
}

export const nombreNota = (ms: number, texto: string) => {
  const { fecha, hora } = sello(ms)
  const palabras = texto.trim().split('\n')[0].replace(/[\\/:*?"<>|#]/g, '').split(/\s+/).slice(0, 6).join(' ')
  return `${fecha} ${hora.replace(':', '')} ${palabras}`.trim().slice(0, 80) + '.md'
}

async function indexar($: EngineInterface) {
  const r = await read($, raiz)
  const argv = ['find', '.', '(']
  PODAR.forEach((n, i) => argv.push(...(i ? ['-o'] : []), '-name', n))
  argv.push(')', '-prune', '-o', '-type', 'f', '-name', '*.md', '-print', '-o', '-type', 'd', '-empty', '-print')
  try {
    const { stdout } = await $.process.run(argv, { cwd: r, timeoutMs: 20000 })
    // Los .md, y las carpetas vacías con «/» al final (las recién creadas se ven aunque no tengan nada).
    const lista = stdout.split('\n').filter(l => l && l !== '.').map(p => p.replace(/^\.\//, '')).map(p => (p.endsWith('.md') ? p : `${p}/`)).sort((a, b) => a.localeCompare(b, 'es'))
    await update($, indiceA, () => lista)
  } catch {
    // sin índice: la lista queda como estaba
  }
}

// grep del sistema sobre los .md del proyecto, salteando lo pesado.
async function grep($: EngineInterface, args: string[]) {
  const r = await $.process.run(['/usr/bin/grep', '-rIn', '--include=*.md', ...PODAR.map(d => `--exclude-dir=${d}`), ...args, '.'], { cwd: await read($, raiz), timeoutMs: 20000, env: UTF8 }).catch(() => undefined)
  if (!r) return [] as Hallazgo[]
  return r.stdout.split('\n').filter(Boolean).flatMap(l => {
    const m = /^\.\/(.+?):(\d+):(.*)$/.exec(l)
    if (m) return [{ ruta: m[1], linea: Number(m[2]) - 1, texto: m[3] }]
    return l.startsWith('./') ? [{ ruta: l.slice(2), linea: 0, texto: '' }] : []
  })
}

async function buscarContenido($: EngineInterface, q: string) {
  const t = q.trim()
  if (t.length < 2) { await update($, contenidoA, () => ({ q: t, hits: [] })); return }
  const hits = (await grep($, ['-i', '-F', '-m', '3', '-e', t])).slice(0, 60)
  await update($, contenidoA, () => ({ q: t, hits }))
}

async function cargarVinculos($: EngineInterface, archivo: string) {
  const abs = await absoluto($, archivo)
  const texto = (await $.fs.exists(abs)) ? await $.fs.read(abs) : ''
  const indice = await read($, indiceA)
  const salientes = enlaces(texto).map(n => resolverEnlace(indice, n) ?? `?${n}`)
  const base = (archivo.split('/').pop() ?? '').replace(/\.md$/, '')
  const rel = archivo.startsWith('/') ? archivo.replace(`${await read($, raiz)}/`, '') : archivo
  const entrantes = base ? [...new Set((await grep($, ['-l', '-i', '-F', '-e', `[[${base}`])).map(h => h.ruta))].filter(r => r !== rel) : []
  await update($, vinculosA, () => ({ archivo, salientes, entrantes }))
}

async function absoluto($: EngineInterface, rel: string) {
  return rel.startsWith('/') ? rel : `${await read($, raiz)}/${rel}`
}

async function anotar($: EngineInterface, texto: string) {
  if (!texto.trim()) return
  const ruta = `${(await read($, rutasA)).notas}/${nombreNota(await $.clock.now(), texto)}`
  await $.fs.write(ruta, texto.trim() + '\n')
  await update($, aviso, () => 'Nota guardada.')
  await indexar($)
}

async function abrir($: EngineInterface, archivo: string) {
  void cargarVinculos($, archivo)
  await update($, vista, v => ({ ...v, archivo, confirmar: undefined }))
}

const MAXIMO = 90000

async function editar($: EngineInterface, linea = 0) {
  const v = await read($, vista)
  if (!v.archivo) return
  const texto = await $.fs.read(await absoluto($, v.archivo))
  if (texto.length > MAXIMO) {
    await update($, aviso, () => `El archivo tiene ${texto.length} caracteres; el editor del panel llega a ${MAXIMO}. Pedile el cambio a Claude.`)
    return
  }
  const version = await $.clock.now()
  await update($, edicion, () => ({ archivo: v.archivo!, texto, version, inicio: linea }))
  await update($, vista, x => ({ ...x, editando: true }))
}

// Cada cambio del editor llega acá. Nunca vacía un archivo con contenido,
// y antes de la primera escritura de cada apertura copia el original a VERSIONES.
// Pegar: macOS da el portapapeles con pbpaste; el editor lo inserta donde está el cursor.
// pbpaste y pbcopy sin idioma configurado usan la codificación vieja de Mac y rompen los acentos.
const UTF8 = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', LC_CTYPE: 'UTF-8' }

// Lo que Google Docs y otras apps meten al copiar: salto de línea propio, espacios duros,
// marcas de ancho cero y caracteres de control.
export function limpiarPegado(t: string) {
  return t
    .replace(/\r\n?/g, '\n')
    .replace(/[\u000b\u2028\u2029]/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '')
    .replace(/\t/g, '  ')
    .replace(/[\u0000-\u0008\u000c\u000e-\u001f\u007f]/g, '')
}

async function pegar($: EngineInterface) {
  const r = await $.process.run(['/usr/bin/pbpaste'], { timeoutMs: 5000, env: UTF8 }).catch(() => undefined)
  if (!r || r.exitCode !== 0) {
    await update($, aviso, () => 'No pude leer el portapapeles.')
    return undefined
  }
  const texto = limpiarPegado(r.stdout).slice(0, MAXIMO)
  if (texto === '') return undefined
  // Un número que sube en cada pegado: el editor aplica cada uno una sola vez.
  let n = 0
  await update($, edicion, x => {
    n = (x.pegado?.n ?? 0) + 1
    return { ...x, pegado: { n, texto } }
  })
  return { n, texto }
}

export async function guardarCambio($: EngineInterface, nuevo: string) {
  const ed = await read($, edicion)
  if (!ed.archivo) return 'Sin archivo abierto'
  const original = ed.texto
  // Un archivo con contenido nunca se guarda vacío; lo demás vale (el original ya tiene copia).
  if (original.trim() !== '' && nuevo.trim() === '') return 'Sin guardar: el archivo quedaría vacío'
  const abs = await absoluto($, ed.archivo)
  if ((await read($, respaldo)) !== ed.version && original !== '') {
    await $.fs.write(`${(await read($, rutasA)).versiones}/${ed.archivo.replace(/^\//, '').replace(/\//g, '__')}.${ed.version}.md`, original)
    await update($, respaldo, () => ed.version)
  }
  await $.fs.write(abs, nuevo)
  return `Guardado ${sello(await $.clock.now()).hora}`
}

// Crear como en el explorador de VS Code: en la carpeta elegida ('' = la raíz del proyecto).
async function crear($: EngineInterface, nombre: string, carpeta: string, tipo: 'archivo' | 'carpeta') {
  const limpio = nombre.trim().replace(/\.md$/i, '')
  if (!limpio || /[\\/]/.test(limpio) || limpio.startsWith('.')) {
    await update($, aviso, () => 'Nombre inválido: sin barras ni punto al principio.')
    return
  }
  const rel = (carpeta ? `${carpeta}/` : '') + (tipo === 'archivo' ? `${limpio}.md` : limpio)
  const abs = await absoluto($, rel)
  if (tipo === 'carpeta') {
    const r = await $.process.run(['/bin/mkdir', '-p', abs]).catch(() => undefined)
    if (!r || r.exitCode !== 0) { await update($, aviso, () => `No pude crear la carpeta ${rel}.`); return }
    await update($, vista, x => ({ ...x, creandoEn: undefined, abiertas: [...new Set([...x.abiertas, ...(carpeta ? [carpeta] : []), rel])] }))
    await update($, aviso, () => `Carpeta creada: ${rel}`)
    await indexar($)
    return
  }
  if (await $.fs.exists(abs)) await update($, aviso, () => `Ya existía ${rel}: lo abrí.`)
  else {
    const v = await read($, vista)
    const pl = v.plantilla ? `${(await read($, rutasA)).plantillas}/${v.plantilla}` : ''
    const base = pl && (await $.fs.exists(pl)) ? await $.fs.read(pl) : `# {{titulo}}\n\n`
    await $.fs.write(abs, aplicarPlantilla(base, await $.clock.now(), limpio))
    await update($, aviso, () => '')
  }
  await update($, vista, x => ({ ...x, creandoEn: undefined, abiertas: carpeta ? [...new Set([...x.abiertas, carpeta])] : x.abiertas }))
  await indexar($)
  await abrir($, rel)
  // El archivo nuevo se abre en el editor, con el cursor al final, listo para escribir.
  const texto = await $.fs.read(abs)
  await editar($, Math.max(0, texto.split('\n').length - 1))
}

// Eliminar = mover a la Papelera de macOS: se recupera desde el Finder.
async function eliminar($: EngineInterface, rel: string) {
  const abs = await absoluto($, rel)
  const nombre = rel.split('/').pop()!
  const ms = await $.clock.now()
  const destino = `${(await read($, rutasA)).papelera}/${nombre.replace(/\.md$/, '')} ${ms}.md`
  const r = await $.process.run(['mv', '-n', abs, destino])
  if (r.exitCode !== 0) {
    await update($, aviso, () => `No se pudo eliminar: ${r.stderr.trim()}`)
    return
  }
  await update($, aviso, () => `«${nombre}» está en la Papelera.`)
  await update($, vista, x => ({ ...x, archivo: x.archivo === rel ? undefined : x.archivo, confirmar: undefined }))
  await indexar($)
}

async function porEtiqueta($: EngineInterface, tag: string) {
  await update($, vista, x => ({ ...x, archivo: undefined, filtro: tag }))
  await buscarContenido($, tag)
}

async function alternarCarpeta($: EngineInterface, c: string) {
  await update($, vista, v => ({ ...v, abiertas: v.abiertas.includes(c) ? v.abiertas.filter(x => x !== c) : [...v.abiertas, c] }))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await update($, raiz, () => e.cwd)
    const home = (await $.process.run(['/usr/bin/printenv', 'HOME']).catch(() => undefined))?.stdout.trim() || ''
    const carpeta = String(options.carpetaNotas ?? 'notas').replace(/\/+$/, '')
    await update($, rutasA, () => ({
      notas: carpeta.startsWith('/') ? carpeta : `${e.cwd}/${carpeta}`,
      versiones: home ? `${home}/.claude/notas-versiones` : `${e.cwd}/.notas-versiones`,
      papelera: home ? `${home}/.Trash` : `${e.cwd}/.papelera`,
      plantillas: (() => { const c = String(options.carpetaPlantillas ?? 'plantillas').replace(/\/+$/, ''); return c.startsWith('/') ? c : `${e.cwd}/${c}` })(),
    }))
    await $.command.register({ name: 'notas', description: 'Abrir el panel de notas y archivos .md del proyecto' })
    void indexar($)
    $.clock.every(60000, () => indexar($))
    void $.ui.open({ id: PANE, title: 'Notas' })
    return next(e)
  })

  on('command.run', { command: 'notas' }, async $ => {
    await indexar($)
    await $.ui.open({ id: PANE, title: 'Notas' })
    return { text: 'Panel de notas abierto.' }
  })

  on('ui.message', async ($, e, next) => {
    if (e.element !== 'editor') return next(e)
    const d = e.data as { tipo?: string; texto?: string; copiar?: string; pegar?: boolean; enlace?: string }
    const legacyCopiar = d?.tipo === 'copiar' ? d.texto : undefined
    const copiar = typeof d?.copiar === 'string' ? d.copiar : legacyCopiar
    if (typeof copiar === 'string') await $.process.run(['/usr/bin/pbcopy'], { stdin: copiar, timeoutMs: 5000, env: UTF8 }).catch(() => undefined)
    let estado: string | undefined
    if (d?.tipo !== 'copiar' && typeof d?.texto === 'string') estado = await guardarCambio($, d.texto)
    if (d?.pegar || d?.tipo === 'pegar') await pegar($)
    const ed = await read($, edicion)
    const sug = typeof d?.enlace === 'string' ? { q: d.enlace, items: sugerirNotas(await read($, indiceA), d.enlace) } : undefined
    return { props: { texto: ed.texto, version: ed.version, inicio: ed.inicio ?? 0, ...(ed.pegado ? { pegado: ed.pegado } : {}), ...(estado ? { estado } : {}), ...(sug ? { sugerencias: sug } : {}) } }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const tabla = $.ui.resolve(e)
    const { Box, Text, Button, Input, Markdown } = tabla
    const Select = 'Select' in tabla ? tabla.Select : undefined
    const Client = 'Client' in tabla ? tabla.Client : undefined
    const v = await read($, vista)
    const msg = await read($, aviso)
    const pie = msg !== '' ? <Text dimColor size="caption">{msg}</Text> : null
    const nombre = (p: string) => p.split('/').pop()!.replace(/\.md$/, '')

    // Panel angosto: los botones van en una fila y el título debajo, en vez de apretarse en una sola.
    const columnas = (e.props as { bodyColumns?: number }).bodyColumns ?? 80
    const angosto = columnas < 46
    const barra = (izq: unknown, titulo: string, der: unknown) => angosto ? (
      <Box flexDirection="column" gap="xs" paddingBottom="xs">
        <Box flexDirection="row" alignItems="center" gap="sm">{izq}{der}</Box>
        <Text weight="semibold" wrap="truncate-middle">{titulo}</Text>
      </Box>
    ) : (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm" paddingBottom="xs">
        {izq}
        <Box flexGrow={1} flexShrink={1}><Text weight="semibold" wrap="truncate-middle">{titulo}</Text></Box>
        {der}
      </Box>
    )

    const confirmacion = (rel: string) => v.confirmar === rel && (
      <Box flexDirection="row" alignItems="center" gap="sm" padding="xs" borderStyle="round" borderColor="error">
        <Box flexGrow={1}><Text size="footnote">¿Mandar «{nombre(rel)}» a la Papelera?</Text></Box>
        <Button key="no-borrar" onPress={() => update($, vista, x => ({ ...x, confirmar: undefined }))}>No</Button>
        <Button key="si-borrar" variant="primary" onPress={() => eliminar($, rel)}>🗑 Eliminar</Button>
      </Box>
    )

    // Edición en el lugar, con el componente propio
    if (v.archivo && v.editando && !Client) {
      return <Box padding="sm"><Text>Esta superficie no dibuja el editor. Pedile el cambio a Claude.</Text></Box>
    }
    if (v.archivo && v.editando && Client) {
      const ed = await read($, edicion)
      return (
        <Box flexDirection="column" gap="xs" height="100%" flexGrow={1}>
          <Box paddingX="sm" paddingTop="sm">
            {barra(
              <Text dimColor size="caption">Se guarda solo</Text>,
              nombre(v.archivo),
              <Button key="listo" variant="primary" onPress={() => update($, vista, x => ({ ...x, editando: false }))}>Listo</Button>,
            )}
          </Box>
          <Client key="editor" module="./editor.tsx" props={{ texto: ed.texto, version: ed.version, inicio: ed.inicio ?? 0, ...(ed.pegado ? { pegado: ed.pegado } : {}) }} />
        </Box>
      )
    }

    // Lectura
    if (v.archivo) {
      const abs = await absoluto($, v.archivo)
      const texto = (await $.fs.exists(abs)) ? await $.fs.read(abs) : '_El archivo ya no existe._'
      const { props, cuerpo, salto } = propiedades(texto)
      const titulos = indiceDe(texto)
      const tags = etiquetas(cuerpo)
      const vinc = await read($, vinculosA)
      return (
        <Box flexDirection="column" padding="sm" gap="sm">
          {barra(
            <Button key="volver" onPress={() => update($, vista, x => ({ ...x, archivo: undefined, confirmar: undefined }))}>{angosto ? '←' : '← Volver'}</Button>,
            nombre(v.archivo),
            <Box marginRight={angosto ? 0 : 5}>
              <Button key="borrar" plain onPress={() => update($, vista, x => ({ ...x, confirmar: x.archivo }))}><Text>🗑</Text></Button>
            </Box>,
          )}
          <Text dimColor size="caption" wrap="truncate-middle">{v.archivo}</Text>
          {confirmacion(v.archivo)}
          {pie}
          {props.length > 0 && (
            <Box flexDirection="column" paddingX="sm" paddingY="xs" borderStyle="round" borderDimColor>
              {props.map(([k, val]) => (
                <Box key={`p-${k}`} flexDirection="row" gap="sm">
                  <Box width={14} flexShrink={0}><Text dimColor size="caption" wrap="truncate-end">{k}</Text></Box>
                  <Box flexShrink={1}><Text size="caption">{val}</Text></Box>
                </Box>
              ))}
            </Box>
          )}
          {tags.length > 0 && (
            <Box flexDirection="row" flexWrap="wrap" gap="xs">
              {tags.map(t => (
                <Button key={`tag-${t}`} plain onPress={() => porEtiqueta($, t)}><Text color="claude" size="caption">{t}</Text></Button>
              ))}
            </Box>
          )}
          {titulos.length >= 3 && (
            <Box flexDirection="column">
              <Button key="indice" plain onPress={() => update($, vista, x => ({ ...x, indiceAbierto: !x.indiceAbierto }))}>
                <Text dimColor size="caption">{v.indiceAbierto ? '▾' : '▸'} Índice · {titulos.length} títulos</Text>
              </Button>
              {v.indiceAbierto && titulos.map(t => (
                <Box key={`ix-${t.linea}`} paddingLeft={(t.nivel - 1) * 2}>
                  <Button key={`ixb-${t.linea}`} plain onPress={() => editar($, t.linea)}><Text size="footnote">{t.texto}</Text></Button>
                </Box>
              ))}
            </Box>
          )}
          <Box flexDirection="column" paddingX="xs">
            {secciones(cuerpo.slice(0, 90000)).map(sec => ({ ...sec, inicio: sec.inicio + salto })).map(sec => (
              <Box key={`sec${sec.inicio}`} flexDirection="column" paddingRight={4}>
                <Markdown text={resaltarEnlaces(sec.texto)} />
                <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }}>
                  <Button key={`lapiz${sec.inicio}`} plain onPress={() => editar($, sec.inicio)}><Text color="claude">✎</Text></Button>
                </Box>
              </Box>
            ))}
          </Box>
          {vinc.archivo === v.archivo && (vinc.salientes.length > 0 || vinc.entrantes.length > 0) && (
            <Box flexDirection="column" gap="xs" paddingTop="sm">
              {vinc.salientes.length > 0 && <Text dimColor size="caption">ENLACES DE ESTA NOTA</Text>}
              {vinc.salientes.map(p => p.startsWith('?')
                ? <Text key={`sal-${p}`} dimColor size="footnote">⟦{p.slice(1)}⟧ · no existe</Text>
                : <Button key={`sal-${p}`} plain onPress={() => abrir($, p)}><Text color="claude" size="footnote">→ {nombre(p)}</Text></Button>)}
              {vinc.entrantes.length > 0 && <Text dimColor size="caption">LA ENLAZAN</Text>}
              {vinc.entrantes.map(p => (
                <Button key={`ent-${p}`} plain onPress={() => abrir($, p)}><Text color="claude" size="footnote">← {nombre(p)}</Text></Button>
              ))}
            </Box>
          )}
          <Box position="absolute" top={0} right={0} padding="sm">
            <Button key="editar" plain onPress={() => editar($)}><Text color="claude">✎</Text></Button>
          </Box>
        </Box>
      )
    }

    // Lista: nota rápida, notas recientes, buscador y árbol
    const indice = await read($, indiceA)
    const NOTAS = (await read($, rutasA)).notas
    const recientes = NOTAS && (await $.fs.exists(NOTAS)) ? (await $.fs.list(NOTAS)).filter(f => f.kind === 'file' && f.name.endsWith('.md')).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 5) : []
    const fila = (rel: string, nivel: number, etiqueta?: string) => (
      <Box key={`r-${rel}`} flexDirection="column">
        <Box key={`rh-${rel}`} flexDirection="row" alignItems="center" paddingLeft={nivel * 2 + 2} paddingRight={3}>
          <Box flexShrink={1} flexGrow={1}>
            <Button key={`f-${rel}`} plain onPress={() => abrir($, rel)}>
              <Text dimColor>· </Text><Text wrap="truncate-end">{etiqueta ?? nombre(rel)}</Text>
            </Button>
          </Box>
          <Box position="absolute" right={0} top={0} display="none" hover={{ display: 'flex' }}>
            <Button key={`x-${rel}`} plain onPress={() => update($, vista, x => ({ ...x, confirmar: rel }))}><Text>🗑</Text></Button>
          </Box>
        </Box>
        {confirmacion(rel)}
      </Box>
    )

    // El campo para nombrar lo nuevo, debajo de la carpeta donde se crea.
    const campoNuevo = (carpeta: string, nivel: number) => v.creandoEn && v.creandoEn.carpeta === carpeta && (
      <Box key={`nv-${carpeta}`} flexDirection="column" gap="xs" paddingLeft={nivel * 2 + 2}>
        <Box flexDirection="row" alignItems="center" gap="xs">
          <Text>{v.creandoEn.tipo === 'archivo' ? '📄' : '📁'}</Text>
          <Box flexGrow={1}>
            <Input key="nuevo" placeholder={v.creandoEn.tipo === 'archivo' ? 'nombre del archivo' : 'nombre de la carpeta'} submitLabel="crear" value="" autoFocus
              onSubmit={n => crear($, n, carpeta, v.creandoEn!.tipo)} />
          </Box>
          <Button key="cerrar-nuevo" plain onPress={() => update($, vista, x => ({ ...x, creandoEn: undefined }))}><Text dimColor>✕</Text></Button>
        </Box>
        {v.creandoEn.tipo === 'archivo' && plantillas.length > 0 && Select && (
          <Select key="plantilla" label="Plantilla" value={v.plantilla ?? ''} options={[{ value: '', label: 'Ninguna' }, ...plantillas.map(p => ({ value: p, label: p.replace(/\.md$/, '') }))]}
            onSelect={x => update($, vista, y => ({ ...y, plantilla: x || undefined }))} />
        )}
      </Box>
    )

    const nuevoEn = (carpeta: string, tipo: 'archivo' | 'carpeta') =>
      update($, vista, x => ({ ...x, creandoEn: { carpeta, tipo }, abiertas: carpeta ? [...new Set([...x.abiertas, carpeta])] : x.abiertas }))

    const arbol = (carpeta: string, nivel: number): unknown[] => {
      const { carpetas, archivos } = hijos(indice, carpeta)
      return [
        ...carpetas.flatMap(([c, n]) => {
          const abierta = v.abiertas.includes(c)
          return [
            <Box key={`d-${c}`} flexDirection="row" alignItems="center" paddingLeft={nivel * 2} paddingRight={8}>
              <Box flexGrow={1} flexShrink={1}>
                <Button key={`dir-${c}`} plain onPress={() => alternarCarpeta($, c)}>
                  <Text dimColor>{abierta ? '▾' : '▸'}</Text> <Text weight="medium">{c.split('/').pop()}</Text> <Text dimColor size="caption">{n > 0 ? String(n) : ''}</Text>
                </Button>
              </Box>
              <Box position="absolute" right={0} top={0} display="none" hover={{ display: 'flex' }} flexDirection="row" gap="xs">
                <Button key={`na-${c}`} plain onPress={() => nuevoEn(c, 'archivo')}><Text color="claude">＋📄</Text></Button>
                <Button key={`nc-${c}`} plain onPress={() => nuevoEn(c, 'carpeta')}><Text color="claude">＋📁</Text></Button>
              </Box>
            </Box>,
            ...(abierta ? [campoNuevo(c, nivel + 1), ...arbol(c, nivel + 1)] : []),
          ]
        }),
        ...archivos.map(a => fila(a, nivel)),
      ]
    }

    const resultados = buscar(indice, v.filtro)
    const cont = await read($, contenidoA)
    const rutas = await read($, rutasA)
    const plantillas = v.creandoEn?.tipo === 'archivo' && rutas.plantillas && (await $.fs.exists(rutas.plantillas))
      ? (await $.fs.list(rutas.plantillas)).filter(f => f.kind === 'file' && f.name.endsWith('.md')).map(f => f.name).sort()
      : []
    return (
      <Box flexDirection="column" padding="sm" gap="md">
        <Box flexDirection="column" gap="xs" padding="sm" borderStyle="round" borderColor="claude">
          <Text size="caption" weight="semibold" color="claude">NOTA RÁPIDA</Text>
          <Input key="rapida" placeholder={angosto ? 'Nota rápida' : 'Lo que se te ocurra. Enter y queda guardada.'} rows={3} submitLabel="Guardar" value="" onSubmit={t => anotar($, t)} />
          {pie}
          {recientes.length > 0 && (
            <Box flexDirection="column" paddingTop="xs">
              <Text size="caption" dimColor>Recientes</Text>
              {recientes.map(f => fila(`${NOTAS}/${f.name}`, 0, f.name.replace(/\.md$/, '')))}
            </Box>
          )}
        </Box>

        <Box flexDirection="column" gap="xs">
          <Box flexDirection={angosto ? 'column' : 'row'} alignItems={angosto ? 'stretch' : 'center'} gap="sm">
            <Box flexGrow={1}>
              <Input key="buscar" placeholder={angosto ? 'Buscar' : `Buscar entre ${indice.length} archivos por nombre o ruta`} value={v.filtro} submitLabel="🔍"
                onInput={t => update($, vista, x => ({ ...x, filtro: t }))} onSubmit={t => update($, vista, x => ({ ...x, filtro: t })).then(() => buscarContenido($, t))} />
            </Box>
          </Box>
        </Box>

        <Box flexDirection="column">
          {v.filtro.trim() !== '' ? (
            <Box flexDirection="column" gap="xs">
              {resultados.length === 0 && <Text dimColor>Ningún nombre con «{v.filtro}».</Text>}
              {resultados.map(p => (
                <Box key={`s-${p}`} flexDirection="column">
                  <Button key={`b-${p}`} plain onPress={() => abrir($, p)}><Text>{nombre(p)}</Text></Button>
                  <Text dimColor size="caption" wrap="truncate-middle">{p}</Text>
                </Box>
              ))}
              {cont.q !== v.filtro.trim()
                ? <Text dimColor size="caption">Enter: buscar también dentro de los archivos</Text>
                : (
                  <Box flexDirection="column" gap="xs" paddingTop="xs">
                    <Text dimColor size="caption">EN EL TEXTO · {cont.hits.length}{cont.hits.length === 60 ? '+' : ''}</Text>
                    {cont.hits.map(hit => (
                      <Box key={`c-${hit.ruta}-${hit.linea}`} flexDirection="column">
                        <Button key={`cb-${hit.ruta}-${hit.linea}`} plain onPress={() => abrir($, hit.ruta).then(() => editar($, hit.linea))}>
                          <Text>{nombre(hit.ruta)}</Text> <Text dimColor size="caption">línea {hit.linea + 1}</Text>
                        </Button>
                        <Text dimColor size="caption" wrap="truncate-end">{hit.texto.trim()}</Text>
                      </Box>
                    ))}
                  </Box>
                )}
            </Box>
          ) : indice.length === 0 ? <Text dimColor>Indexando…</Text> : (
            <Box flexDirection="column">
              <Box flexDirection="row" alignItems="center" gap="xs" paddingBottom="xs">
                <Box flexGrow={1}><Text dimColor size="caption" weight="semibold">EXPLORADOR</Text></Box>
                <Button key="nuevo-archivo-raiz" plain onPress={() => nuevoEn('', 'archivo')}><Text color="claude">＋📄</Text></Button>
                <Button key="nueva-carpeta-raiz" plain onPress={() => nuevoEn('', 'carpeta')}><Text color="claude">＋📁</Text></Button>
              </Box>
              {campoNuevo('', 0)}
              {arbol('', 0)}
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
