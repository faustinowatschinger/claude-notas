import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Doc } from '../types'

const PANE = 'dia'
const CASILLA = /^(\s*)- \[( |x|X)\] (.*)$/

// La carpeta de los días: la opción carpetaDias, relativa al proyecto donde se abrió la sesión.
const dir = atom({ plugin: 'agenda', key: 'dir' } as const, '', { shape: 'dir-1' })
// El día que se mira ('' = hoy) y el mes que muestra el calendario ('' = el del día).
const elegida = atom({ plugin: 'agenda', key: 'elegida' } as const, '', { shape: 'elegida-1' })
const mes = atom({ plugin: 'agenda', key: 'mes' } as const, '', { shape: 'mes-1' })
const doc = atom({ plugin: 'agenda', key: 'doc' } as const, { fecha: '', texto: '', mtimeMs: 0 }, {
  shape: 'doc-1',
})

// Argentina no tiene horario de verano: UTC-3 todo el año.
export const hoy = (ms: number) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10)

export type Casilla = { linea: number; nivel: number; hecha: boolean; texto: string }

export const casillas = (texto: string): Casilla[] =>
  texto.split('\n').flatMap((l, linea) => {
    const m = CASILLA.exec(l)
    if (!m) return []
    return [{ linea, nivel: m[1].length >= 2 ? 1 : 0, hecha: m[2] !== ' ', texto: m[3] }]
  })

export const alternar = (texto: string, linea: number, esperado: string): string | undefined => {
  const lineas = texto.split('\n')
  const m = CASILLA.exec(lineas[linea] ?? '')
  if (!m || m[3] !== esperado) return undefined
  lineas[linea] = `${m[1]}- [${m[2] === ' ' ? 'x' : ' '}] ${m[3]}`
  return lineas.join('\n')
}

const limpio = (t: string) => t.replace(/\*\*/g, '').replace(/(^|\s)_([^_]+)_/g, '$1$2').replace(/`/g, '')

async function cargar($: EngineInterface) {
  const fecha = (await read($, elegida)) || hoy(await $.clock.now())
  const ruta = `${await read($, dir)}/${fecha}.md`
  const previo = await read($, doc)
  try {
    const { mtimeMs } = await $.fs.stat(ruta)
    if (previo.fecha === fecha && previo.mtimeMs === mtimeMs && !previo.error) return
    const texto = await $.fs.read(ruta)
    await update($, doc, () => ({ fecha, texto, mtimeMs }))
  } catch {
    if (previo.fecha === fecha && previo.error) return
    const carpeta = await read($, dir)
    await update($, doc, () => ({ fecha, texto: '', mtimeMs: 0, error: `No existe ${fecha}.md en ${carpeta}` }))
  }
}

async function tildar($: EngineInterface, fecha: string, c: Casilla) {
  const ruta = `${await read($, dir)}/${fecha}.md`
  const actual = await $.fs.read(ruta)
  const nuevo = alternar(actual, c.linea, c.texto)
  if (nuevo === undefined) {
    $.ui.toast('El archivo cambió por fuera; recargué la lista.')
  } else {
    await $.fs.write(ruta, nuevo)
  }
  await update($, doc, x => ({ ...x, mtimeMs: 0 }))
  await cargar($)
}

// Cambia el día que se mira ('' vuelve a hoy) y recarga.
async function irA($: EngineInterface, f: string) {
  await update($, elegida, () => f)
  await update($, mes, () => '')
  await update($, doc, x => ({ ...x, mtimeMs: -1, fecha: '' }))
  await cargar($)
}

// Semanas del mes (lunes primero), con '' en los huecos.
export function grillaMes(am: string) {
  const [y, m] = am.split('-').map(Number)
  const primero = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const celdas = [...Array(primero).fill(''), ...Array.from({ length: dias }, (_, i) => `${am}-${String(i + 1).padStart(2, '0')}`)]
  while (celdas.length % 7) celdas.push('')
  return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7))
}

export function moverMes(am: string, d: number) {
  const [y, m] = am.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + d, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

export const nombreMes = (am: string) => `${MESES[Number(am.slice(5)) - 1]} ${am.slice(0, 4)}`

// La carpeta del chat. La app de escritorio arranca cada chat nuevo en una carpeta temporal
// y después lo pasa a la del proyecto, así que no alcanza con la de session.start.
async function carpetaSesion($: EngineInterface) {
  for (const pedir of [() => $.session.root(), () => $.session.cwd()]) {
    try {
      const c = await pedir()
      if (c) return c
    } catch {
      // sigue con la siguiente
    }
  }
  return ''
}

// Si el chat pasó a otra carpeta, la carpeta de los días relativa la sigue.
async function seguirCarpeta($: EngineInterface, carpeta: string, absoluta: boolean) {
  if (absoluta) return
  const cwd = (await carpetaSesion($)).replace(/\\/g, '/').replace(/\/+$/, '')
  const nuevo = `${cwd}/${carpeta}`
  if (!cwd || nuevo === (await read($, dir))) return
  await update($, dir, () => nuevo)
  await update($, doc, () => ({ fecha: '', texto: '', mtimeMs: 0 }))
}

export const register: Register = (on, options) => {
  // Rutas con «/» en todos los sistemas; «C:\…» o «/…» son absolutas.
  const normal = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const carpeta = normal(String(options.carpetaDias ?? 'dias'))
  const absoluta = /^([A-Za-z]:\/|\/)/.test(carpeta)

  on('session.start', async ($, e, next) => {
    await update($, dir, () => (absoluta ? carpeta : `${normal(e.cwd)}/${carpeta}`))
    await seguirCarpeta($, carpeta, absoluta)
    await $.command.register({ name: 'agenda', description: 'Abrir el panel con la agenda del día' })
    await cargar($)
    $.clock.every(3000, async () => { await seguirCarpeta($, carpeta, absoluta); await cargar($) })
    void $.ui.open({ id: PANE, title: 'Día' })
    return next(e)
  })

  on('command.run', { command: 'agenda' }, async $ => {
    await seguirCarpeta($, carpeta, absoluta)
    await cargar($)
    await $.ui.open({ id: PANE, title: 'Día' })
    return { text: 'Panel del día abierto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const tabla = $.ui.resolve(e)
    const { Box, Text, Button } = tabla
    const Progress = 'Progress' in tabla ? tabla.Progress : undefined
    const d = await read($, doc)
    // Calendario del mes: los días con archivo en color, el elegido marcado.
    const hoyStr = hoy(await $.clock.now())
    const fechaVista = (await read($, elegida)) || hoyStr
    const mesVisto = (await read($, mes)) || fechaVista.slice(0, 7)
    const carpeta = await read($, dir)
    const archivos = carpeta ? await $.fs.list(carpeta).catch(() => []) : []
    const conArchivo = new Set(archivos.map(f => f.name.replace(/\.md$/, '')))
    const semanas = grillaMes(mesVisto)
    const calendario = (
      <Box flexDirection="column" gap="xs">
        <Box flexDirection="row" alignItems="center" gap="sm">
          <Button key="mes-ant" plain onPress={() => update($, mes, () => moverMes(mesVisto, -1))}><Text color="claude">‹</Text></Button>
          <Box flexGrow={1}><Text weight="medium" size="footnote">{nombreMes(mesVisto)}</Text></Box>
          <Button key="mes-sig" plain onPress={() => update($, mes, () => moverMes(mesVisto, 1))}><Text color="claude">›</Text></Button>
          {fechaVista !== hoyStr && <Button key="ir-hoy" plain onPress={() => irA($, '')}><Text color="claude" size="footnote">Hoy</Text></Button>}
        </Box>
        <Box flexDirection="row">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x, i) => <Box key={`dw${i}`} width={4}><Text dimColor size="caption">{x}</Text></Box>)}
        </Box>
        {semanas.map((sem, i) => (
          <Box key={`sem${i}`} flexDirection="row">
            {sem.map((f, j) => (
              <Box key={`c${i}-${j}`} width={4}>
                {f === '' ? <Text> </Text> : (
                  <Button key={`d-${f}`} plain onPress={() => irA($, f === hoyStr ? '' : f)}>
                    <Text inverse={f === fechaVista} bold={f === hoyStr} color={conArchivo.has(f) ? 'claude' : undefined} dimColor={!conArchivo.has(f) && f !== fechaVista} size="footnote">{String(Number(f.slice(8)))}</Text>
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )

    if (d.error) {
      return (
        <Box flexDirection="column" padding="md" gap="sm">
          {calendario}
          <Text size="heading" weight="semibold">{titular(fechaVista)}</Text>
          <Text dimColor>{d.error}. Pedile a Claude «organizame el día».</Text>
        </Box>
      )
    }
    const lista = casillas(d.texto)
    const bloques = agrupar(lista)
    const hechas = lista.filter(c => c.hecha).length
    const min = minutos(await $.clock.now())
    const ahora = bloques.find(b => !b.casilla.hecha && enCurso(b.hora, min))

    // Panel angosto: la hora va arriba de la tarea en vez de en una columna fija.
    const angosto = ((e.props as { bodyColumns?: number }).bodyColumns ?? 80) < 44
    const fila = (c: Casilla, hora: string, sub: Casilla[], destacada: boolean) => {
      const p = partes(c.texto)
      const k = destacada ? 'a' : ''
      const laHora = hora || p.hora
      return (
        <Box key={`${k}b${c.linea}`} flexDirection={angosto ? 'column' : 'row'} gap={angosto ? 0 : 'sm'} paddingY="xs"
          borderStyle={destacada ? 'round' : undefined} borderColor={destacada ? 'claude' : undefined} paddingX={destacada ? 'sm' : 0}>
          {angosto
            ? (laHora !== '' && <Text mono tabular dimColor size="caption">{laHora}</Text>)
            : <Box width={12} flexShrink={0}><Text mono tabular dimColor size="footnote">{laHora}</Text></Box>}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Button key={`${k}c${c.linea}`} plain onPress={() => void tildar($, d.fecha, c)}>
              <Text color={c.hecha ? 'success' : undefined}>{c.hecha ? '☑' : '☐'}</Text> <Text dimColor={c.hecha} strikethrough={c.hecha} weight={destacada ? 'semibold' : 'regular'}>{p.titulo}</Text>
            </Button>
            {p.porque !== '' && <Text dimColor size="caption">{p.porque}</Text>}
            {sub.map(s => (
              <Box key={`${k}s${s.linea}`} paddingLeft={2}>
                <Button key={`${k}c${s.linea}`} plain onPress={() => void tildar($, d.fecha, s)}>
                  <Text color={s.hecha ? 'success' : undefined}>{s.hecha ? '☑' : '☐'}</Text> <Text size="footnote" dimColor={s.hecha} strikethrough={s.hecha}>{limpio(s.texto)}</Text>
                </Button>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" padding="sm" gap="md">
        <Box flexDirection="column" gap="xs">
          {calendario}
          <Text size="heading" weight="semibold">{titular(d.fecha)}</Text>
          {Progress && <Progress label={`${hechas} de ${lista.length} hechas`} value={hechas} max={Math.max(1, lista.length)} valueText={`${hechas}/${lista.length}`} color="success" />}
          <Text dimColor size="caption">{hechas} de {lista.length} hechas</Text>
        </Box>
        {ahora && (
          <Box flexDirection="column" gap="xs">
            <Text size="caption" weight="semibold" color="claude">AHORA</Text>
            {fila(ahora.casilla, partes(ahora.casilla.texto).hora, ahora.sub, true)}
          </Box>
        )}
        <Box flexDirection="column" gap="xs">
          <Text size="caption" weight="semibold" dimColor>EL DÍA</Text>
          {bloques.length === 0 && <Text dimColor>El archivo no tiene casillas.</Text>}
          {bloques.map(b => fila(b.casilla, partes(b.casilla.texto).hora, b.sub, false))}
        </Box>
      </Box>
    )
  })
}

type Bloque = { casilla: Casilla; sub: Casilla[]; hora: string }

export function agrupar(lista: Casilla[]): Bloque[] {
  const out: Bloque[] = []
  for (const c of lista) {
    if (c.nivel === 0 || out.length === 0) out.push({ casilla: c, sub: [], hora: partes(c.texto).hora })
    else out[out.length - 1].sub.push(c)
  }
  return out
}

export function partes(texto: string) {
  let hora = ''
  let resto = texto
  const m = /^\*\*([^*]+)\*\*\s*(.*)$/.exec(texto)
  if (m && /^(\d{1,2}:\d{2}|noche|mañana|tarde)/i.test(m[1].trim())) {
    hora = m[1].trim()
    resto = m[2]
  }
  let porque = ''
  const q = /\s+—\s+_(.+)_\s*$/.exec(resto)
  if (q) {
    porque = q[1]
    resto = resto.slice(0, q.index)
  }
  return { hora, titulo: limpio(resto), porque: limpio(porque) }
}

export function minutos(ms: number) {
  const d = new Date(ms - 3 * 3600 * 1000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

const aMin = (h: string) => {
  const m = /(\d{1,2}):(\d{2})/.exec(h)
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

export function enCurso(hora: string, ahora: number) {
  const [a, b] = hora.split(/[–-]/)
  const ini = aMin(a ?? '')
  if (ini === undefined) return false
  const fin = b !== undefined ? aMin(b) : hora.includes('+') ? 24 * 60 : ini + 60
  return ahora >= ini && ahora < (fin ?? ini + 60)
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function titular(fecha: string) {
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${DIAS[dia]} ${d} de ${MESES[m - 1]}`
}
