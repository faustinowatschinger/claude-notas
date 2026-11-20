import { expect, test } from 'claude-code/testing'

const TEXTO = [
  '# Día',
  '- [ ] **08:15–09:45** Revisar guiones — _sin esto no se graba_',
  '  - [x] Aprobar números',
  '- [ ] **18:00+** Saltar la soga',
].join('\n')

const PANE = {
  plugin: 'agenda', component: 'Pane', requestId: 'dia',
  props: { title: 'Día', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('lista las casillas y tilda escribiendo el archivo', async ($, on) => {
  let archivo = TEXTO
  let mtime = 1
  on('command.register', () => ({ value: { command: 'agenda' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 20, 12) }))
  on('clock.every', () => ({ value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: archivo.length, mtimeMs: mtime, isLink: false } }))
  on('fs.read', () => ({ value: archivo }))
  on('fs.write', (_, e) => { archivo = e.text; mtime++; return { value: undefined } })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /1 de 3 hechas/ }))?.text).toBe('1 de 3 hechas')
  await ui.press({ key: 'c1' })
  expect(archivo.split('\n')[1]).toBe('- [x] **08:15–09:45** Revisar guiones — _sin esto no se graba_')
  expect(archivo.split('\n')[2]).toBe('  - [x] Aprobar números')
  await ui.unmount()
})

import { partes, enCurso, titular, grillaMes, moverMes } from './register'

test('separa hora, título y por qué', () => {
  expect(partes('**08:15–09:45** Revisar guiones — _sin esto no se graba_')).toEqual({ hora: '08:15–09:45', titulo: 'Revisar guiones', porque: 'sin esto no se graba' })
  expect(partes('**10:00–12:30** **Llamar en frío** — _trae reuniones_').titulo).toBe('Llamar en frío')
  expect(partes('**Noche** Cerrar el día').hora).toBe('Noche')
  expect(enCurso('08:15–09:45', 9 * 60)).toBe(true)
  expect(enCurso('18:00+', 19 * 60)).toBe(true)
  expect(enCurso('Noche', 22 * 60)).toBe(false)
  expect(titular('2026-11-20')).toBe('Viernes 20 de noviembre')
  const g = grillaMes('2026-11')
  expect(g[0]).toEqual(['', '', '', '', '', '', '2026-11-01'])
  expect(g.flat().filter(Boolean).length).toBe(30)
  expect(moverMes('2026-12', 1)).toBe('2027-01')
  expect(moverMes('2026-01', -1)).toBe('2025-12')
})

test('en un panel angosto se dibuja y se tilda igual', async ($, on) => {
  let archivo = TEXTO
  let mtime = 1
  on('command.register', () => ({ value: { command: 'agenda' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 20, 12) }))
  on('clock.every', () => ({ value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: archivo.length, mtimeMs: mtime, isLink: false } }))
  on('fs.read', () => ({ value: archivo }))
  on('fs.write', (_, e) => { archivo = e.text; mtime++; return { value: undefined } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 28 }, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: '08:15–09:45' })).toBeTruthy()
  await ui.press({ key: 'c3' })
  expect(archivo.split('\n')[3]).toBe('- [x] **18:00+** Saltar la soga')
  await ui.unmount()
})

test('el calendario abre otro día', async ($, on) => {
  const archivos = new Map<string, string>([['/dias/2026-11-20.md', TEXTO], ['/dias/2026-11-19.md', '- [ ] **10:00** Ayer']])
  on('command.register', () => ({ value: { command: 'agenda' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 20, 12) }))
  on('clock.every', () => ({ value: undefined }))
  on('fs.exists', (_, e) => ({ value: e.path === '/dias' || archivos.has(e.path) }))
  on('fs.list', () => ({ value: [...archivos.keys()].map(k => ({ name: k.split('/').pop(), kind: 'file', size: 1, mtimeMs: 1, isLink: false })) }))
  on('fs.stat', (_, e) => (archivos.has(e.path) ? { value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } } : { error: 'ENOENT' }))
  on('fs.read', (_, e) => ({ value: archivos.get(e.path) ?? '' }))
  on('fs.write', (_, e) => { archivos.set(e.path, e.text); return { value: undefined } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'd-2026-11-19' })
  expect(await ui.find({ type: 'Text', text: 'Jueves 19 de noviembre' })).toBeTruthy()
  await ui.press({ key: 'c0' })
  expect(archivos.get('/dias/2026-11-19.md')).toBe('- [x] **10:00** Ayer')
  await ui.press({ key: 'ir-hoy' })
  expect(await ui.find({ type: 'Text', text: 'Viernes 20 de noviembre' })).toBeTruthy()
  await ui.unmount()
})
