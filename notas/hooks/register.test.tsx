import { expect, test } from 'claude-code/testing'

import { buscar, hijos, rutaValida, limpiarPegado, propiedades, indiceDe, etiquetas, enlaces, resolverEnlace, aplicarPlantilla, sugerirNotas } from './register'

const R = '/proy'
const NOTAS = '/proy/notas'
const PANE = {
  plugin: 'notas', component: 'Pane', requestId: 'notas',
  props: { title: 'Notas', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const sistemaSimulado = { os: undefined as string | undefined }
const fallaFind = { activo: false }
const copiados: string[] = []
const mkdirs: string[] = []

function montarFs(on: any, fs: Map<string, string>, movidos: string[][]) {
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 20, 12, 30) }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  on('env.get', (_: any, e: any) => ({ value: e.name === 'HOME' ? '/home/test' : e.name === 'OS' ? sistemaSimulado.os : undefined }))
  on('command.register', () => ({ value: { command: 'notas' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('fs.exists', (_: any, e: any) => ({ value: fs.has(e.path) || [...fs.keys()].some(k => k.startsWith(e.path + '/')) }))
  on('fs.read', (_: any, e: any) => ({ value: fs.get(e.path) ?? '' }))
  on('fs.write', (_: any, e: any) => { fs.set(e.path, e.text); return { value: undefined } })
  on('fs.list', (_: any, e: any) => ({ value: [...fs.keys()].filter(k => k.startsWith(e.path + '/') && !k.slice(e.path.length + 1).includes('/')).map(k => ({ name: k.slice(e.path.length + 1), kind: 'file', size: 1, mtimeMs: 1, isLink: false })) }))
  on('process.run', (_: any, e: any) => {
    if (e.argv[0].endsWith('mkdir')) { mkdirs.push(e.argv[2]); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } }
    if (e.argv[0].endsWith('grep')) {
      // grep mínimo: -l, -i, -F con -e, -E con -e, sobre los .md del proyecto
      const args: string[] = e.argv
      const pat = args[args.indexOf('-e') + 1]
      const soloNombres = args.includes('-l')
      const ign = args.includes('-i')
      const re = args.includes('-E') ? new RegExp(pat.replace('[[:space:]]', '\\s'), ign ? 'i' : '') : null
      const salida: string[] = []
      for (const [k, txt] of fs) {
        if (!k.startsWith(R + '/') || !k.endsWith('.md')) continue
        const rel = k.slice(R.length + 1)
        const ls = txt.split('\n')
        const hits = ls.map((l, i) => [l, i] as const).filter(([l]) => re ? re.test(l) : (ign ? l.toLowerCase().includes(pat.toLowerCase()) : l.includes(pat)))
        if (hits.length === 0) continue
        if (soloNombres) salida.push('./' + rel)
        else for (const [l, i] of hits) salida.push(`./${rel}:${i + 1}:${l}`)
      }
      return { value: { exitCode: 0, stdout: salida.join('\n'), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    if (e.argv[0].endsWith('printenv')) return { value: { exitCode: 0, stdout: '/home/test\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (e.argv[0].endsWith('pbcopy')) { copiados.push(e.init?.stdin); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } }
    if (e.argv[0].endsWith('pbpaste')) return { value: { exitCode: 0, stdout: 'uno\ndos', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (e.argv[0] === 'mv') { movidos.push(e.argv); fs.delete(e.argv[2]); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } }
    if (fallaFind.activo && e.argv[0] === 'find') throw new Error('timeout')
    // find: solo la carpeta del proyecto tiene archivos; cualquier otra está vacía
    if (e.init?.cwd && e.init.cwd !== R) return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    const md = [...[...fs.keys()].filter(k => k.startsWith(R + '/')).map(k => './' + k.slice(R.length + 1)), ...mkdirs.filter(d => d.startsWith(R + '/') && ![...fs.keys()].some(k => k.startsWith(d + '/'))).map(d => './' + d.slice(R.length + 1))].join('\n')
    return { value: { exitCode: 0, stdout: md, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
}

test('funciones puras', () => {
  expect(limpiarPegado('Acción\u00a0uno\u000bdos\u200b “ok”\r\n')).toBe('Acción uno\ndos “ok”\n')
  expect(rutaValida('../hack')).toBeUndefined()
  expect(rutaValida('ventas/ideas')).toBe('ventas/ideas.md')
  expect(buscar(['ventas/guion.md', 'memory/decisiones.md'], 'GUIÓN')).toEqual(['ventas/guion.md'])
  const h = hijos(['a.md', 'ventas/x.md', 'ventas/sub/y.md'], '')
  expect(h.carpetas).toEqual([['ventas', 2]])
  expect(h.archivos).toEqual(['a.md'])
})

test('árbol, búsqueda, nota, menú de bloques y eliminar', async ($, on) => {
  const fs = new Map<string, string>([[`${R}/ventas/guion.md`, '# Guion'], [`${R}/README.md`, '# Raíz']])
  const movidos: string[][] = []
  montarFs(on, fs, movidos)
  const abiertos: string[] = []
  on('tool.call', (_: any, e: any) => { if (e.tool === 'mcp__ccd_view__show_pane') abiertos.push(e.path); return { result: {} } })
  await $.session.start({ cwd: R, surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'dir-ventas' })
  expect(await ui.find({ type: 'Text', text: 'guion' })).toBeTruthy()

  await ui.input({ key: 'buscar', text: 'read', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: 'README.md' })).toBeTruthy()
  await ui.input({ key: 'buscar', text: '', kind: 'change' })

  await ui.input({ key: 'rapida', text: 'llamar a Ana mañana', kind: 'submit' })
  expect(fs.get(`${NOTAS}/2026-11-20 0930 llamar a Ana mañana.md`)).toBe('llamar a Ana mañana\n')

  await ui.press({ key: 'f-ventas/guion.md' })
  await ui.press({ key: 'editar' })
  // el editor arranca con el contenido y escribe en el lugar
  await ui.pointer({ type: 'down', x: 7, y: 0, button: 'left' })
  for (const k of [' ', 'n', 'u', 'e', 'v', 'o']) await ui.key({ key: k })
  expect(fs.get(`${R}/ventas/guion.md`)).toBe('# Guion nuevo')
  // Enter hace salto de línea; «/cas» + Enter inserta una casilla
  await ui.key({ key: 'return' })
  for (const k of ['/', 'c', 'a', 's']) await ui.key({ key: k })
  await ui.key({ key: 'return' })
  for (const k of ['h', 'o', 'y']) await ui.key({ key: k })
  expect(fs.get(`${R}/ventas/guion.md`)).toBe('# Guion nuevo\n- [ ] hoy')
  expect([...fs.keys()].some(k => k.includes('notas-versiones') && fs.get(k) === '# Guion')).toBe(true)
  // no deja vaciar el archivo
  await ui.post({ tipo: 'cambio', texto: '' }, { in: 'editor' })
  expect(fs.get(`${R}/ventas/guion.md`)).toBe('# Guion nuevo\n- [ ] hoy')
  // Cmd+V y el botón Pegar insertan el portapapeles en el cursor
  await ui.key({ key: 'v', meta: true })
  expect(fs.get(`${R}/ventas/guion.md`)).toBe('# Guion nuevo\n- [ ] hoyuno\ndos')
  // seleccionar arrastrando, copiar y escribir encima
  const copiado = copiados
  copiado.length = 0
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left' })
  await ui.pointer({ type: 'move', x: 7, y: 0, button: 'left' })
  await ui.pointer({ type: 'up', x: 7, y: 0, button: 'left' })
  await ui.key({ key: 'c', meta: true })
  expect(copiado).toEqual(['Guion '])
  await ui.key({ key: 'X' })
  expect(fs.get(`${R}/ventas/guion.md`)).toBe('# Xnuevo\n- [ ] hoyuno\ndos')
  // Shift+flechas y Cmd+X
  await ui.key({ key: 'left', shift: true })
  await ui.key({ key: 'x', meta: true })
  expect(copiado).toEqual(['Guion ', 'X'])
  expect(fs.get(`${R}/ventas/guion.md`)).toBe('# nuevo\n- [ ] hoyuno\ndos')
  await ui.press({ key: 'listo' })
  await ui.press({ key: 'borrar' })
  await ui.press({ key: 'si-borrar' })
  expect(movidos[0][2]).toBe(`${R}/ventas/guion.md`)
  expect(movidos[0][3]).toMatch(/^\/home\/test\/\.Trash\/guion \d+\.md$/)
  await ui.unmount()
})

import { tecla, aplicarBloque, alinear, ventanaMenu, comandoTabla, teclaConSeleccion, filasVisibles } from './editor'

test('teclas del editor', () => {
  const base = { version: 1, lineas: ['- uno'], fila: 0, col: 5, arriba: 0, sucio: false }
  const r = tecla(base, { key: 'return' })
  expect(r.s.lineas).toEqual(['- uno', '- '])
  expect(tecla(r.s, { key: 'return' }).s.lineas).toEqual(['- uno', ''])
  const n = tecla({ ...base, lineas: ['1. a'], col: 4 }, { key: 'return' })
  expect(n.s.lineas).toEqual(['1. a', '2. '])
  const b = tecla({ ...base, lineas: ['ab'], col: 0, fila: 0 }, { key: 'backspace' })
  expect(b.cambio).toBe(false)
  expect(tecla(base, { key: 's', meta: true }).guardar).toBe(true)
  // Cmd+A y escribir reemplaza todo; Shift+→ selecciona y → la colapsa
  const todo = teclaConSeleccion({ ...base, lineas: ['uno', 'dos'], fila: 0, col: 0 }, { key: 'a', meta: true }).s
  expect(teclaConSeleccion(todo, { key: 'z' }).s.lineas).toEqual(['z'])
  const sh = teclaConSeleccion({ ...base, lineas: ['abc'], col: 0 }, { key: 'right', shift: true }).s
  expect(teclaConSeleccion(sh, { key: 'c', meta: true }).copiar).toBe('a')
  expect(teclaConSeleccion(sh, { key: 'right' }).s.ancla).toBeUndefined()
  // corte por palabra
  expect(filasVisibles(['hola que tal amigo'], 10).map(v => v.texto)).toEqual(['hola que ', 'tal amigo'])
  expect(filasVisibles(['supercalifragilistico'], 8).map(v => v.texto)).toEqual(['supercal', 'ifragili', 'stico'])
  expect(ventanaMenu(0, 13)).toBe(0)
  expect(ventanaMenu(5, 13)).toBe(0)
  expect(ventanaMenu(6, 13)).toBe(1)
  expect(ventanaMenu(12, 13)).toBe(7)
  expect(alinear(['| a | bb |', '|---|---|', '| ccccc | d |'])).toEqual(['| a     | bb  |', '|-------|-----|', '| ccccc | d   |'])
  // /tabla deja el cursor en la primera celda; Tab avanza, Tab al final agrega fila, Enter agrega fila
  const t = aplicarBloque(['/tab'], { fila: 0, inicio: 0, consulta: 'tab', sel: 0 }, '|  |  |\n|---|---|\n|  |  |')
  expect(t.lineas).toEqual(['|     |     |', '|-----|-----|', '|     |     |'])
  let st = { ...base, lineas: t.lineas, fila: t.fila, col: t.col }
  for (const ch of ['N', 'o']) st = tecla(st, { key: ch }).s
  st = tecla(st, { key: 'tab' }).s
  for (const ch of ['T', 'e', 'l']) st = tecla(st, { key: ch }).s
  expect(st.lineas[0]).toBe('| No  | Tel |')
  { let w = { ...base, lineas: ['| ab | c |', '|---|---|'], fila: 0, col: 4 }
    for (const ch of ['space', 'x']) w = tecla(w, { key: ch }).s
    expect(w.lineas[0]).toBe('| ab x | c   |') }
  st = tecla(st, { key: 'tab' }).s
  expect(st.fila).toBe(2)
  st = tecla(st, { key: 'tab' }).s
  st = tecla(st, { key: 'tab' }).s
  expect(st.lineas.length).toBe(4)
  st = tecla(st, { key: 'return' }).s
  expect(st.lineas.length).toBe(5)
  expect(st.fila).toBe(4)
  // menú «/» de tabla: columnas, filas y eliminar
  let tb = { ...base, lineas: alinear(['| a | b |', '|---|---|', '| 1 | 2 |']), fila: 0, col: 2 }
  tb = tecla(tb, { key: '/' }).s
  expect(tb.menu?.tabla).toBe(true)
  for (const ch of ['d', 'e', 'r']) tb = tecla(tb, { key: ch }).s
  expect(tb.lineas[0]).toBe('| a   | b   |')
  tb = tecla(tb, { key: 'return' }).s
  expect(tb.lineas).toEqual(['| a   |     | b   |', '|-----|-----|-----|', '| 1   |     | 2   |'])
  tb = comandoTabla(tb, 'col-quitar').s
  expect(tb.lineas[0]).toBe('| a   | b   |')
  tb = comandoTabla({ ...tb, fila: 2, col: 2 }, 'fila-quitar').s
  expect(tb.lineas.length).toBe(2)
  tb = comandoTabla(tb, 'eliminar').s
  expect(tb.lineas).toEqual([''])
  // backspace en una fila vacía la borra
  let fv = { ...base, lineas: alinear(['| a |', '|---|', '| x |', '|  |']), fila: 3, col: 2 }
  fv = tecla(fv, { key: 'backspace' }).s
  expect(fv.lineas.length).toBe(3)
  expect(fv.fila).toBe(2)
  // una tabla pedida a mitad de línea va en su propia línea
  const m = aplicarBloque(['Notas /tab'], { fila: 0, inicio: 6, consulta: 'tab', sel: 0 }, '| A |\n|---|')
  expect(m.lineas[0]).toBe('Notas')
  expect(m.lineas[1]).toBe('| A   |')
})

import { secciones } from './register'

test('lápiz por sección abre el editor en esa sección', async ($, on) => {
  const doc = '# Uno\ntexto uno\n\n## Dos\ntexto dos'
  expect(secciones(doc).map(x => x.inicio)).toEqual([0, 3])
  const fs = new Map<string, string>([[`${R}/a.md`, doc]])
  const movidos: string[][] = []
  montarFs(on, fs, movidos)
  await $.session.start({ cwd: R, surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'f-a.md' })
  await ui.press({ key: 'lapiz3' })
  // el cursor arranca al principio de «## Dos»; la fila 0 es el aviso de líneas arriba
  for (const k of ['X', ' ']) await ui.key({ key: k })
  expect(fs.get(`${R}/a.md`)).toBe('# Uno\ntexto uno\n\nX ## Dos\ntexto dos')
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left' })
  await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left' })
  await ui.key({ key: '!' })
  expect(fs.get(`${R}/a.md`)).toBe('# Uno!\ntexto uno\n\nX ## Dos\ntexto dos')
  // el clic en la celda 2 cae en la columna 3 (corrimiento fijo de una celda)
  await ui.pointer({ type: 'down', x: 2, y: 1, button: 'left' })
  await ui.key({ key: '_' })
  expect(fs.get(`${R}/a.md`)).toBe('# Uno!\ntex_to uno\n\nX ## Dos\ntexto dos')
  await ui.unmount()
})

test('después de achicar el panel el clic cae en la letra correcta', async ($, on) => {
  const largo = 'a'.repeat(30) + 'B' + 'c'.repeat(30)
  const fs = new Map<string, string>([[`${R}/l.md`, largo]])
  montarFs(on, fs, [])
  await $.session.start({ cwd: R, surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'f-l.md' })
  await ui.press({ key: 'editar' })
  await ui.resize({ columns: 26, rows: 30 })
  // con 26 columnas se corta cada 25 letras: la «B» (posición 30) queda en la fila 1, celda 5
  await ui.pointer({ type: 'down', x: 5 - 1, y: 1, button: 'left' })
  await ui.key({ key: '_' })
  expect(fs.get(`${R}/l.md`)).toBe('a'.repeat(30) + '_B' + 'c'.repeat(30))
  await ui.unmount()
})

test('en un panel angosto la lista, la lectura y el editor se dibujan', async ($, on) => {
  const fs = new Map<string, string>([[`${R}/a.md`, '# Uno\nhola']])
  montarFs(on, fs, [])
  await $.session.start({ cwd: R, surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 30 }, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'nuevo-archivo-raiz' })).toBeTruthy()
  await ui.press({ key: 'f-a.md' })
  expect(await ui.find({ type: 'Button', key: 'volver' })).toBeTruthy()
  await ui.press({ key: 'editar' })
  await ui.resize({ columns: 30, rows: 30 })
  // celda 2 + la corrección de una celda = columna 3
  await ui.pointer({ type: 'down', x: 2, y: 1, button: 'left' })
  await ui.key({ key: '!' })
  expect(fs.get(`${R}/a.md`)).toBe('# Uno\nhol!a')
  await ui.unmount()
})

test('el clic cae bien en una línea cortada por palabra', async ($, on) => {
  const fs = new Map<string, string>([[`${R}/p.md`, 'hola que tal amigo mio']])
  montarFs(on, fs, [])
  await $.session.start({ cwd: R, surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'f-p.md' })
  await ui.press({ key: 'editar' })
  await ui.resize({ columns: 11, rows: 30 })
  // ancho 10: «hola que » / «tal amigo » / «mio»; celda 2 (+1) de la fila 1 es antes de la «l» de «tal»
  await ui.pointer({ type: 'down', x: 1, y: 1, button: 'left' })
  await ui.key({ key: '_' })
  expect(fs.get(`${R}/p.md`)).toBe('hola que ta_l amigo mio')
  // un clic lejos a la derecha de la fila 0 queda al final de «hola que», no salta a la fila de abajo
  await ui.pointer({ type: 'down', x: 9, y: 0, button: 'left' })
  await ui.key({ key: '!' })
  expect(fs.get(`${R}/p.md`)).toBe('hola que! ta_l amigo mio')
  await ui.unmount()
})

test('funciones de estilo Obsidian', () => {
  const doc = '---\ntipo: guion\ntags:\n  - ventas\n---\n# Título\n## Uno\ntexto #llamadas y [[guia-de-ventas]] y [[Otra|alias]]\n```\n# no\n```'
  const p = propiedades(doc)
  expect(p.props).toEqual([['tipo', 'guion'], ['tags', 'ventas']])
  expect(p.salto).toBe(5)
  expect(indiceDe(doc).map(x => x.texto)).toEqual(['Título', 'Uno'])
  expect(etiquetas(p.cuerpo)).toEqual(['#llamadas'])
  expect(enlaces(doc)).toEqual(['guia-de-ventas', 'Otra'])
  expect(resolverEnlace(['ventas/guia-de-ventas.md', 'x.md'], 'Guia-De-Ventas')).toBe('ventas/guia-de-ventas.md')
  expect(aplicarPlantilla('# {{titulo}} {{fecha}}', Date.UTC(2026, 10, 20, 15), 'Idea')).toBe('# Idea 2026-11-20')
  expect(sugerirNotas(['a/guia-de-ventas.md', 'b/calling-largo.md', 'c/otro.md'], 'guia')).toEqual(['guia-de-ventas'])
})

test('enlaces, búsqueda en el texto, plantillas y [[ en el editor', async ($, on) => {
  const fs = new Map<string, string>([
    [`${R}/a.md`, '# A\nver [[b]] y #tema\n- [ ] llamar a Juan'],
    [`${R}/b.md`, '# B\nnada'],
    [`${R}/plantillas/reunion.md`, '# {{titulo}}\nFecha: {{fecha}}'],
  ])
  montarFs(on, fs, [])
  await $.session.start({ cwd: R, surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // búsqueda dentro del texto
  await ui.input({ key: 'buscar', text: 'juan', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: /llamar a Juan/ })).toBeTruthy()
  await ui.input({ key: 'buscar', text: '', kind: 'change' })
  // enlaces y backlinks
  await ui.press({ key: 'f-b.md' })
  expect(await ui.find({ type: 'Text', text: /← a/ })).toBeTruthy()
  await ui.press({ key: 'volver' })
  await ui.press({ key: 'f-a.md' })
  expect(await ui.find({ type: 'Text', text: /→ b/ })).toBeTruthy()
  await ui.press({ key: 'sal-b.md' })
  expect(await ui.find({ type: 'Text', text: /← a/ })).toBeTruthy()
  await ui.press({ key: 'volver' })
  // plantilla
  // explorador: nueva carpeta en la raíz, archivo con plantilla dentro de ella; se abre en el editor
  await ui.press({ key: 'nueva-carpeta-raiz' })
  await ui.input({ key: 'nuevo', text: 'reuniones', kind: 'submit' })
  expect(mkdirs).toEqual([`${R}/reuniones`])
  await ui.press({ key: 'na-reuniones' })
  await ui.select({ key: 'plantilla', value: 'reunion.md' })
  await ui.input({ key: 'nuevo', text: 'Reunión Juan', kind: 'submit' })
  expect(fs.get(`${R}/reuniones/Reunión Juan.md`)).toBe('# Reunión Juan\nFecha: 2026-11-20')
  // [[ en el editor (ya abierto, con el cursor en la última línea): «[[b» y Enter enlaza la nota b
  await ui.key({ key: 'end' })
  for (const k of ['[', '[', 'b']) await ui.key({ key: k })
  await ui.key({ key: 'return' })
  expect(fs.get(`${R}/reuniones/Reunión Juan.md`)).toContain('[[b]]')
  await ui.unmount()
})

test('en Windows usa PowerShell para listar, buscar, carpetas, portapapeles y Papelera', async ($, on) => {
  const W = 'C:/proy'
  const fs = new Map<string, string>([[`${W}/a.md`, '# A\nhola mundo [[b]]'], [`${W}/sub/b.md`, '# B']])
  const scripts: string[] = []
  const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 20, 12, 30) }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  on('env.get', (_: any, e: any) => ({ value: e.name === 'OS' ? 'Windows_NT' : e.name === 'USERPROFILE' ? 'C:\\Users\\ana' : undefined }))
  on('command.register', () => ({ value: { command: 'notas' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('fs.exists', (_: any, e: any) => ({ value: fs.has(e.path) || [...fs.keys()].some(k => k.startsWith(e.path + '/')) }))
  on('fs.read', (_: any, e: any) => ({ value: fs.get(e.path) ?? '' }))
  on('fs.write', (_: any, e: any) => { fs.delete(e.path); fs.set(e.path, e.text); return { value: undefined } })
  on('fs.list', () => ({ value: [] }))
  on('process.run', (_: any, e: any) => {
    expect(e.argv[0]).toBe('powershell')
    const sc: string = e.argv[e.argv.length - 1]
    scripts.push(sc)
    if (sc.includes('function W(')) return ok([...fs.keys()].map(k => k.replace(/\//g, '\\')).join('\r\n'))
    if (sc.includes('Select-String')) {
      const q = /\$q='([^']*)'/.exec(sc)![1]
      const files: string[] = e.init.stdin.split('\n')
      return ok(files.flatMap(f => (fs.get(`${W}/${f}`) ?? '').split('\n').map((l, i) => [l, i] as const).filter(([l]) => l.toLowerCase().includes(q.toLowerCase())).map(([l, i]) => `${W.replace(/\//g, '\\')}\\${f.replace(/\//g, '\\')}:${i + 1}:${l}`)).join('\r\n'))
    }
    if (sc.includes('Get-Clipboard')) return ok('pegado de Windows\r\n')
    return ok()
  })
  await $.session.start({ cwd: 'C:\\proy', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // lista y buscador
  expect(await ui.find({ type: 'Button', key: 'f-a.md' })).toBeTruthy()
  await ui.input({ key: 'buscar', text: 'mundo', kind: 'submit' })
  expect(await ui.find({ type: 'Text', text: /hola mundo/ })).toBeTruthy()
  await ui.input({ key: 'buscar', text: '', kind: 'change' })
  // carpeta nueva
  await ui.press({ key: 'nueva-carpeta-raiz' })
  await ui.input({ key: 'nuevo', text: 'ideas', kind: 'submit' })
  expect(scripts.some(sc => sc.includes("New-Item -ItemType Directory -Force -Path 'C:/proy/ideas'"))).toBe(true)
  // pegar y copiar en el editor
  await ui.press({ key: 'f-a.md' })
  await ui.press({ key: 'editar' })
  await ui.key({ key: 'v', ctrl: true })
  expect(scripts.filter(sc => sc.includes('Get-Clipboard')).length).toBe(1)
  // en esta Mac el simulador toma «C:/…» como ruta relativa al escribir: se busca por el final
  const escrito = [...fs.entries()].filter(([k]) => k.endsWith('C:/proy/a.md')).pop()![1]
  expect(escrito).toContain('pegado de Windows')
  await ui.key({ key: 'a', ctrl: true })
  await ui.key({ key: 'c', ctrl: true })
  expect(scripts.some(sc => sc.includes('Set-Clipboard'))).toBe(true)
  await ui.press({ key: 'listo' })
  // eliminar va a la Papelera de reciclaje
  await ui.press({ key: 'borrar' })
  await ui.press({ key: 'si-borrar' })
  expect(scripts.some(sc => sc.includes('SendToRecycleBin') && sc.includes("'C:/proy/a.md'"))).toBe(true)
  await ui.unmount()
})

test('chat nuevo: arranca en una carpeta temporal y después pasa al proyecto', async ($, on) => {
  const fs = new Map<string, string>([[`${R}/ventas/guion.md`, '# Guion']])
  montarFs(on, fs, [])
  // La app de escritorio precalienta el chat en una carpeta temporal y después lo pasa al proyecto.
  let carpeta = '/tmp/precalentado'
  on('session.root', () => ({ value: carpeta }))
  await $.session.start({ cwd: '/tmp/precalentado', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // una carpeta sin .md muestra el explorador vacío, no «Indexando…» para siempre
  expect(await ui.find({ type: 'Text', text: 'Indexando…' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: 'Todavía no hay archivos .md en esta carpeta.' })).toBeTruthy()
  await ui.unmount()

  carpeta = R
  await $.command.run({ command: 'notas', args: '' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'dir-ventas' })
  expect(await ui.find({ type: 'Text', text: 'guion' })).toBeTruthy()
  await ui.unmount()
})

test('si no puede listar, avisa y deja reintentar', async ($, on) => {
  const fs = new Map<string, string>([[`${R}/a.md`, '# A']])
  montarFs(on, fs, [])
  fallaFind.activo = true
  await $.session.start({ cwd: R, surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'notas', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: 'No pude listar los archivos de /proy.' })).toBeTruthy()
  fallaFind.activo = false
  await ui.press({ key: 'reindexar' })
  expect(await ui.find({ type: 'Button', key: 'f-a.md' })).toBeTruthy()
  await ui.unmount()
})
