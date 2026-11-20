import type { ClientModule } from 'claude-code'

// Editor propio: el texto y el cursor viven acá, en el estado local del componente.
// Cada cambio se manda al módulo de hooks con post(), que guarda el archivo.

type Props = { texto: string; version: number; inicio?: number; estado?: string; pegado?: { n: number; texto: string }; sugerencias?: { q: string; items: string[] } }
type Menu = { fila: number; inicio: number; consulta: string; sel: number; tabla?: true; enlace?: true }
type Estado = { version: number; lineas: string[]; fila: number; col: number; /** primera línea que se muestra */ arriba: number; menu?: Menu; sucio: boolean; pegadoN?: number; ancla?: { fila: number; col: number }; arrastrando?: boolean; hover?: { fila: number; col: number } }

export const BLOQUES = [
  { id: 'h1', nombre: 'Título', texto: '# ' },
  { id: 'h2', nombre: 'Subtítulo', texto: '## ' },
  { id: 'h3', nombre: 'Título chico', texto: '### ' },
  { id: 'lista', nombre: 'Lista', texto: '- ' },
  { id: 'numerada', nombre: 'Lista numerada', texto: '1. ' },
  { id: 'casilla', nombre: 'Casilla', texto: '- [ ] ' },
  { id: 'cita', nombre: 'Cita', texto: '> ' },
  { id: 'tabla', nombre: 'Tabla', texto: '|  |  |\n|---|---|\n|  |  |' },
  { id: 'tabla3', nombre: 'Tabla de 3 columnas', texto: '|  |  |  |\n|---|---|---|\n|  |  |  |' },
  { id: 'codigo', nombre: 'Código', texto: '```\n\n```' },
  { id: 'separador', nombre: 'Separador', texto: '---' },
  { id: 'negrita', nombre: 'Negrita', texto: '**texto**' },
  { id: 'link', nombre: 'Link', texto: '[texto](https://)' },
]

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const COMANDOS_TABLA = [
  { id: 'col-der', nombre: 'Columna a la derecha', texto: '' },
  { id: 'col-izq', nombre: 'Columna a la izquierda', texto: '' },
  { id: 'col-quitar', nombre: 'Quitar columna', texto: '' },
  { id: 'fila-abajo', nombre: 'Fila abajo', texto: '' },
  { id: 'fila-quitar', nombre: 'Quitar fila', texto: '' },
  { id: 'eliminar', nombre: 'Eliminar tabla', texto: '' },
]
// Las notas que propone «[[»: llegan del módulo por props y se guardan acá.
export const sugerencias = { q: '', items: [] as string[] }

export const opcionesDe = (m: Menu) => {
  if (m.enlace) return sugerencias.q === m.consulta ? sugerencias.items.map(n => ({ id: n, nombre: n, texto: n })) : []
  if (!m.tabla) return opciones(m.consulta)
  const q = m.consulta.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return COMANDOS_TABLA.filter(b => b.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q))
}
export const opciones = (consulta: string) => {
  const q = normal(consulta)
  return BLOQUES.filter(b => normal(b.nombre).includes(q) || b.id.startsWith(q))
}

// El menú «/» muestra VISIBLES opciones y se desplaza con la selección.
export const VISIBLES = 6
export const ventanaMenu = (sel: number, total: number) => Math.max(0, Math.min(sel - VISIBLES + 1 < 0 ? 0 : sel - VISIBLES + 1, Math.max(0, total - VISIBLES)))
const altoDelMenu = (m: Menu) => {
  const n = opcionesDe(m).length
  return (n === 0 ? 1 : Math.min(VISIBLES, n) + 1) + 2
}

// ---------- Tablas ----------
export const esTabla = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const esSeparador = (l: string) => /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(l)
const celdas = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

// Las filas contiguas de tabla alrededor de `fila`.
export function bloqueTabla(lineas: string[], fila: number) {
  let a = fila
  let b = fila
  while (a > 0 && esTabla(lineas[a - 1])) a--
  while (b < lineas.length - 1 && esTabla(lineas[b + 1])) b++
  return { desde: a, hasta: b }
}

// Empareja el ancho de cada columna (una letra = una celda en el editor).
export function alinear(filas: string[]) {
  const datos = filas.map(l => (esSeparador(l) ? null : celdas(l)))
  const n = Math.max(...filas.map(l => celdas(l).length))
  const anchos = Array.from({ length: n }, (_, i) => Math.max(3, ...datos.map(d => (d ? (d[i] ?? '').length : 0))))
  return datos.map(d => (d === null
    ? '|' + anchos.map(w => '-'.repeat(w + 2)).join('|') + '|'
    : '|' + anchos.map((w, i) => ' ' + (d[i] ?? '').padEnd(w) + ' ').join('|') + '|'))
}

// En qué celda está la columna `col` de una fila de tabla.
export function celdaEn(l: string, col: number) {
  let n = -1
  for (let i = 0; i < Math.min(col, l.length); i++) if (l[i] === '|') n++
  return Math.max(0, n)
}

// Columna donde empieza a escribirse la celda `i` de una fila ya alineada.
export function colDeCelda(l: string, i: number) {
  let n = -1
  for (let j = 0; j < l.length; j++) {
    if (l[j] === '|') {
      n++
      if (n === i) return Math.min(l.length, j + 2)
    }
  }
  return l.length
}

// Alinea la tabla de `fila` y deja el cursor en la celda (filaDestino, celda).
function irACelda(L: string[], fila: number, filaDestino: number, celda: number) {
  const { desde, hasta } = bloqueTabla(L, fila)
  const alineadas = alinear(L.slice(desde, hasta + 1))
  L.splice(desde, hasta - desde + 1, ...alineadas)
  const l = L[filaDestino]
  return { lineas: L, fila: filaDestino, col: colDeCelda(l, celda) }
}

export function teclaTabla(s: Estado, k: { key: string; shift?: true }) {
  const L = [...s.lineas]
  const fila = s.fila
  const linea = L[fila]
  if (!esTabla(linea)) return undefined
  const { desde, hasta } = bloqueTabla(L, fila)
  const n = celdas(L[desde]).length
  const vacia = '|' + Array.from({ length: n }, () => '  ').join('|') + '|'
  const c = celdaEn(linea, s.col)
  if (k.key === 'tab' && k.shift) {
    let f = fila
    let i = c - 1
    if (i < 0) {
      f = fila - 1
      if (f >= desde && esSeparador(L[f])) f--
      if (f < desde) return { s, cambio: false }
      i = n - 1
    }
    return { s: { ...s, ...irACelda(L, fila, f, i), menu: undefined }, cambio: true }
  }
  if (k.key === 'tab') {
    let f = fila
    let i = c + 1
    if (i >= n) {
      f = fila + 1
      if (f <= hasta && esSeparador(L[f])) f++
      if (f > hasta) { L.splice(hasta + 1, 0, vacia) }
      i = 0
    }
    return { s: { ...s, ...irACelda(L, fila, f, i), menu: undefined }, cambio: true }
  }
  if (k.key === 'return' && !esSeparador(linea)) {
    let f = fila + 1
    if (f <= hasta && esSeparador(L[f])) f++
    L.splice(f, 0, vacia)
    return { s: { ...s, ...irACelda(L, fila, f, 0), menu: undefined }, cambio: true }
  }
  return undefined
}

// Comandos del menú «/» dentro de una tabla.
export function comandoTabla(s: Estado, id: string): { s: Estado; cambio: boolean } {
  const L = [...s.lineas]
  const { desde, hasta } = bloqueTabla(L, s.fila)
  const c = celdaEn(L[s.fila], s.col)
  const filas = L.slice(desde, hasta + 1).map(l => ({ sep: esSeparador(l), cel: celdas(l) }))
  const n = filas[0].cel.length
  const armar = () => alinear(filas.map(f => '| ' + f.cel.map(x => (f.sep ? '---' : x)).join(' | ') + ' |'))
  let filaDest = s.fila
  let celDest = c
  if (id === 'eliminar' || (id === 'col-quitar' && n === 1)) {
    L.splice(desde, hasta - desde + 1, '')
    return { s: { ...s, lineas: L, fila: desde, col: 0 }, cambio: true }
  }
  if (id === 'col-der' || id === 'col-izq') {
    const i = id === 'col-der' ? c + 1 : c
    filas.forEach(f => f.cel.splice(i, 0, f.sep ? '---' : ''))
    celDest = i
  } else if (id === 'col-quitar') {
    filas.forEach(f => f.cel.splice(c, 1))
    celDest = Math.min(c, n - 2)
  } else if (id === 'fila-abajo') {
    let i = s.fila - desde + 1
    if (filas[i]?.sep) i++
    filas.splice(i, 0, { sep: false, cel: Array.from({ length: n }, () => '') })
    filaDest = desde + i
    celDest = 0
  } else if (id === 'fila-quitar') {
    const i = s.fila - desde
    if (i === 0 || filas[i].sep) return { s, cambio: false }
    filas.splice(i, 1)
    filaDest = Math.max(desde, s.fila - 1)
    if (esSeparador(L[filaDest] ?? '') ) filaDest = desde
  }
  const nuevas = armar()
  L.splice(desde, hasta - desde + 1, ...nuevas)
  return { s: { ...s, lineas: L, fila: filaDest, col: colDeCelda(L[filaDest], Math.max(0, celDest)) }, cambio: true }
}

// Inserta un bloque en lugar de «/consulta» y deja el cursor al final de lo insertado.
export function aplicarBloque(lineas: string[], m: Menu, texto: string) {
  const linea = lineas[m.fila]
  const antes = linea.slice(0, m.inicio)
  const despues = linea.slice(m.inicio + 1 + m.consulta.length)
  if (texto.startsWith('|')) {
    const tabla = alinear(texto.split('\n'))
    const nuevas = [...lineas]
    const previas = antes.trim() === '' ? [] : [antes.trimEnd()]
    const siguientes = despues.trim() === '' ? [] : [despues.trimStart()]
    nuevas.splice(m.fila, 1, ...previas, ...tabla, ...siguientes)
    const fila = m.fila + previas.length
    return { lineas: nuevas, fila, col: colDeCelda(tabla[0], 0) }
  }
  const partes = texto.split('\n')
  const nuevas = [...lineas]
  if (partes.length === 1) {
    nuevas[m.fila] = antes + partes[0] + despues
    return { lineas: nuevas, fila: m.fila, col: antes.length + partes[0].length }
  }
  const bloque = partes.map((p, i) => (i === 0 ? antes + p : i === partes.length - 1 ? p + despues : p))
  nuevas.splice(m.fila, 1, ...bloque)
  return { lineas: nuevas, fila: m.fila + partes.length - 1, col: partes[partes.length - 1].length }
}

// Aplica una tecla al estado. Devuelve el estado nuevo y si cambió el texto.
export function tecla(s: Estado, k: { key: string; ctrl?: true; meta?: true; shift?: true }): { s: Estado; cambio: boolean; guardar?: boolean; pegar?: boolean } {
  const L = [...s.lineas]
  let { fila, col } = s
  const linea = L[fila] ?? ''
  const m = s.menu

  if ((k.meta || k.ctrl) && k.key === 's') return { s, cambio: false, guardar: true }
  if ((k.meta || k.ctrl) && k.key === 'v') return { s, cambio: false, pegar: true }
  if (k.meta || k.ctrl) return { s, cambio: false }

  // «[[»: se escribe normal y el menú sigue lo escrito entre «[[» y el cursor.
  if (m && m.enlace) {
    const ops = opcionesDe(m)
    if (k.key === 'down') return { s: { ...s, menu: { ...m, sel: Math.min(Math.max(0, ops.length - 1), m.sel + 1) } }, cambio: false }
    if (k.key === 'up') return { s: { ...s, menu: { ...m, sel: Math.max(0, m.sel - 1) } }, cambio: false }
    if ((k.key === 'return' || k.key === 'tab') && ops.length > 0) {
      const nombre = ops[Math.min(m.sel, ops.length - 1)].texto
      L[fila] = linea.slice(0, m.inicio) + `[[${nombre}]]` + linea.slice(col).replace(/^\]\]/, '')
      return { s: { ...s, lineas: L, col: m.inicio + nombre.length + 4, menu: undefined }, cambio: true }
    }
    const r = tecla({ ...s, menu: undefined }, k)
    const l2 = r.s.lineas[r.s.fila] ?? ''
    const sigue = r.s.fila === m.fila && r.s.col >= m.inicio + 2 && l2.slice(m.inicio, m.inicio + 2) === '[[' && !l2.slice(m.inicio + 2, r.s.col).includes(']')
    return { ...r, s: { ...r.s, menu: sigue ? { ...m, consulta: l2.slice(m.inicio + 2, r.s.col), sel: 0 } : r.s.menu } }
  }

  if (m && m.tabla) {
    // Menú de tabla: lo que se escribe filtra y no entra al texto.
    const ops = opcionesDe(m)
    if (k.key === 'down') return { s: { ...s, menu: { ...m, sel: Math.min(ops.length - 1, m.sel + 1) } }, cambio: false }
    if (k.key === 'up') return { s: { ...s, menu: { ...m, sel: Math.max(0, m.sel - 1) } }, cambio: false }
    if (k.key === 'return' || k.key === 'tab') {
      if (ops.length === 0) return { s: { ...s, menu: undefined }, cambio: false }
      return comandoTabla({ ...s, menu: undefined }, ops[Math.min(m.sel, ops.length - 1)].id)
    }
    if (k.key === 'backspace') return { s: { ...s, menu: m.consulta ? { ...m, consulta: m.consulta.slice(0, -1), sel: 0 } : undefined }, cambio: false }
    if ([...k.key].length === 1 && k.key !== ' ') return { s: { ...s, menu: { ...m, consulta: m.consulta + k.key, sel: 0 } }, cambio: false }
    return tecla({ ...s, menu: undefined }, k)
  }

  if (m) {
    const ops = opciones(m.consulta)
    if (k.key === 'down') return { s: { ...s, menu: { ...m, sel: Math.min(ops.length - 1, m.sel + 1) } }, cambio: false }
    if (k.key === 'up') return { s: { ...s, menu: { ...m, sel: Math.max(0, m.sel - 1) } }, cambio: false }
    if ((k.key === 'return' || k.key === 'tab') && ops.length > 0) {
      const r = aplicarBloque(L, m, ops[Math.min(m.sel, ops.length - 1)].texto)
      return { s: { ...s, ...r, menu: undefined }, cambio: true }
    }
  }

  if (k.key === 'tab' || k.key === 'return') {
    const t = teclaTabla(s, k)
    if (t) return t
  }
  // Escribir o borrar dentro de una celda re-alinea la tabla sin perder el lugar.
  if (esTabla(linea) && !m && k.key === '/') {
    return { s: { ...s, menu: { fila, inicio: col, consulta: '', sel: 0, tabla: true } }, cambio: false }
  }
  if (esTabla(linea) && !esSeparador(linea) && !m && k.key === 'backspace' && celdas(linea).every(x => x === '')) {
    const { desde } = bloqueTabla(L, fila)
    if (fila > desde + 1) {
      L.splice(fila, 1)
      const f = fila - 1 === desde + 1 && esSeparador(L[desde + 1]) ? desde : fila - 1
      return { s: { ...s, lineas: L, fila: f, col: L[f].length - 2 }, cambio: true }
    }
  }
  if (esTabla(linea) && !esSeparador(linea) && !m && ((([...k.key].length === 1 && k.key !== '|') || k.key === 'space') || (k.key === 'backspace' && col > 0 && linea[col - 1] !== '|'))) {
    const c = celdaEn(linea, col)
    const inicio = colDeCelda(linea, c)
    const contenido = celdas(linea)[c] ?? ''
    // El cursor puede estar en el relleno de la celda: lo escrito ahí respeta los espacios.
    const off = Math.max(0, col - inicio)
    const base = contenido.padEnd(off)
    const ch = k.key === 'space' ? ' ' : k.key
    const nuevo = k.key === 'backspace'
      ? (off === 0 ? contenido : (base.slice(0, off - 1) + base.slice(off)).trimEnd())
      : base.slice(0, off) + ch + base.slice(off)
    if (k.key === 'backspace' && off === 0) return { s, cambio: false }
    const partes = celdas(linea)
    partes[c] = nuevo
    L[fila] = '| ' + partes.join(' | ') + ' |'
    const { desde, hasta } = bloqueTabla(L, fila)
    L.splice(desde, hasta - desde + 1, ...alinear(L.slice(desde, hasta + 1)))
    const nOff = k.key === 'backspace' ? off - 1 : off + 1
    return { s: { ...s, lineas: L, col: colDeCelda(L[fila], c) + nOff }, cambio: true }
  }

  switch (k.key) {
    case 'left':
      if (col > 0) col--
      else if (fila > 0) { fila--; col = L[fila].length }
      return { s: { ...s, fila, col, menu: undefined }, cambio: false }
    case 'right':
      if (col < linea.length) col++
      else if (fila < L.length - 1) { fila++; col = 0 }
      return { s: { ...s, fila, col, menu: undefined }, cambio: false }
    case 'up':
      if (fila > 0) { fila--; col = Math.min(col, L[fila].length) } else col = 0
      return { s: { ...s, fila, col }, cambio: false }
    case 'down':
      if (fila < L.length - 1) { fila++; col = Math.min(col, L[fila].length) } else col = linea.length
      return { s: { ...s, fila, col }, cambio: false }
    case 'home':
      return { s: { ...s, col: 0, menu: undefined }, cambio: false }
    case 'end':
      return { s: { ...s, col: linea.length, menu: undefined }, cambio: false }
    case 'pageup':
      fila = Math.max(0, fila - 15); col = Math.min(col, L[fila].length)
      return { s: { ...s, fila, col }, cambio: false }
    case 'pagedown':
      fila = Math.min(L.length - 1, fila + 15); col = Math.min(col, L[fila].length)
      return { s: { ...s, fila, col }, cambio: false }
    case 'return': {
      // Enter sigue la lista: «- », «- [ ] », «1. » y «> » se repiten en la línea nueva.
      const izq = linea.slice(0, col)
      const der = linea.slice(col)
      const pre = /^(\s*)(- \[[ xX]\] |- |\* |> |(\d+)\. )/.exec(linea)
      let sigue = ''
      if (pre && col >= pre[0].length) {
        if (linea.trim() === pre[0].trim()) {
          L[fila] = ''
          return { s: { ...s, lineas: L, col: 0, menu: undefined }, cambio: true }
        }
        sigue = pre[1] + (pre[3] ? `${Number(pre[3]) + 1}. ` : pre[2].replace(/\[[xX]\]/, '[ ]'))
      }
      L.splice(fila, 1, izq, sigue + der)
      return { s: { ...s, lineas: L, fila: fila + 1, col: sigue.length, menu: undefined }, cambio: true }
    }
    case 'backspace': {
      if (col > 0) {
        L[fila] = linea.slice(0, col - 1) + linea.slice(col)
        col--
        let menu = m
        if (m && m.fila === fila) menu = col <= m.inicio ? undefined : { ...m, consulta: m.consulta.slice(0, -1), sel: 0 }
        return { s: { ...s, lineas: L, col, menu }, cambio: true }
      }
      if (fila > 0) {
        const prev = L[fila - 1]
        L.splice(fila - 1, 2, prev + linea)
        return { s: { ...s, lineas: L, fila: fila - 1, col: prev.length, menu: undefined }, cambio: true }
      }
      return { s, cambio: false }
    }
    case 'delete': {
      if (col < linea.length) L[fila] = linea.slice(0, col) + linea.slice(col + 1)
      else if (fila < L.length - 1) L.splice(fila, 2, linea + L[fila + 1])
      else return { s, cambio: false }
      return { s: { ...s, lineas: L, menu: undefined }, cambio: true }
    }
    case 'tab':
      L[fila] = linea.slice(0, col) + '  ' + linea.slice(col)
      return { s: { ...s, lineas: L, col: col + 2 }, cambio: true }
    case 'space':
      return tecla(s, { key: ' ' })
  }

  if ([...k.key].length !== 1) return { s, cambio: false }
  L[fila] = linea.slice(0, col) + k.key + linea.slice(col)
  let menu = m
  if (k.key === '[' && linea[col - 1] === '[') menu = { fila, inicio: col - 1, consulta: '', sel: 0, enlace: true }
  else if (k.key === '/' && (col === 0 || /\s/.test(linea[col - 1]))) menu = { fila, inicio: col, consulta: '', sel: 0 }
  else if (m && m.fila === fila) menu = /\s/.test(k.key) ? undefined : { ...m, consulta: m.consulta + k.key, sel: 0 }
  return { s: { ...s, lineas: L, col: col + k.key.length, menu }, cambio: true }
}

// ---------- Selección ----------
type Pos = { fila: number; col: number }
const antes = (a: Pos, b: Pos) => a.fila < b.fila || (a.fila === b.fila && a.col < b.col)

// El tramo seleccionado, ordenado; undefined si no hay selección o está vacía.
export function rango(s: Estado): [Pos, Pos] | undefined {
  if (!s.ancla) return undefined
  const c = { fila: s.fila, col: s.col }
  if (s.ancla.fila === c.fila && s.ancla.col === c.col) return undefined
  return antes(s.ancla, c) ? [s.ancla, c] : [c, s.ancla]
}

export function textoSeleccionado(s: Estado) {
  const r = rango(s)
  if (!r) return ''
  const [a, b] = r
  if (a.fila === b.fila) return s.lineas[a.fila].slice(a.col, b.col)
  return [s.lineas[a.fila].slice(a.col), ...s.lineas.slice(a.fila + 1, b.fila), s.lineas[b.fila].slice(0, b.col)].join('\n')
}

export function borrarSeleccion(s: Estado): Estado {
  const r = rango(s)
  if (!r) return { ...s, ancla: undefined }
  const [a, b] = r
  const L = [...s.lineas]
  L.splice(a.fila, b.fila - a.fila + 1, L[a.fila].slice(0, a.col) + L[b.fila].slice(b.col))
  return { ...s, lineas: L, fila: a.fila, col: a.col, ancla: undefined, menu: undefined }
}

// Envuelve tecla(): Shift+flechas extiende, Cmd+A todo, Cmd+C/X copia, y escribir reemplaza lo seleccionado.
const MOVER = ['left', 'right', 'up', 'down', 'home', 'end', 'pageup', 'pagedown']
export function teclaConSeleccion(s: Estado, k: { key: string; ctrl?: true; meta?: true; shift?: true }): { s: Estado; cambio: boolean; guardar?: boolean; pegar?: boolean; copiar?: string } {
  const mod = k.meta || k.ctrl
  if (mod && k.key === 'a') {
    const f = s.lineas.length - 1
    return { s: { ...s, ancla: { fila: 0, col: 0 }, fila: f, col: s.lineas[f].length, arriba: 0, menu: undefined }, cambio: false }
  }
  const r = rango(s)
  if (mod && (k.key === 'c' || k.key === 'x')) {
    if (!r) return { s, cambio: false }
    const texto = textoSeleccionado(s)
    return k.key === 'x' ? { s: borrarSeleccion(s), cambio: true, copiar: texto } : { s, cambio: false, copiar: texto }
  }
  if (MOVER.includes(k.key) && !mod) {
    if (k.shift) {
      const ancla = s.ancla ?? { fila: s.fila, col: s.col }
      const m = tecla({ ...s, ancla: undefined }, { key: k.key })
      return { s: { ...m.s, ancla }, cambio: false }
    }
    if (r && (k.key === 'left' || k.key === 'right')) {
      const p = k.key === 'left' ? r[0] : r[1]
      return { s: { ...s, fila: p.fila, col: p.col, ancla: undefined }, cambio: false }
    }
    return tecla({ ...s, ancla: undefined }, k)
  }
  if (r && !mod) {
    const sinSel = borrarSeleccion(s)
    if (k.key === 'backspace' || k.key === 'delete') return { s: sinSel, cambio: true }
    const t = tecla(sinSel, k)
    return { ...t, cambio: true }
  }
  if (mod && k.key === 'v' && r) return { s: borrarSeleccion(s), cambio: true, pegar: true }
  return tecla({ ...s, ancla: undefined }, k)
}

// Inserta texto (con saltos de línea) donde está el cursor.
export function insertarTexto(s: Estado, texto: string): Estado {
  const limpio = texto.replace(/\r\n?/g, '\n').replace(/\t/g, '  ')
  const L = [...s.lineas]
  const linea = L[s.fila] ?? ''
  const antes = linea.slice(0, s.col)
  const despues = linea.slice(s.col)
  const partes = limpio.split('\n')
  if (partes.length === 1) {
    L[s.fila] = antes + partes[0] + despues
    return { ...s, lineas: L, col: s.col + partes[0].length, menu: undefined }
  }
  const nuevas = partes.map((p, i) => (i === 0 ? antes + p : i === partes.length - 1 ? p + despues : p))
  L.splice(s.fila, 1, ...nuevas)
  return { ...s, lineas: L, fila: s.fila + partes.length - 1, col: partes[partes.length - 1].length, menu: undefined }
}

// Corta cada línea en filas visibles del ancho del panel.
// Corta por palabra: la palabra que no entra pasa entera al renglón siguiente; el espacio
// queda al final del renglón de arriba. Solo una palabra más larga que el ancho se corta por letra.
export function filasVisibles(lineas: string[], ancho: number) {
  const out: { fila: number; desde: number; texto: string; ultima: boolean }[] = []
  lineas.forEach((l, fila) => {
    if (l.length === 0) { out.push({ fila, desde: 0, texto: '', ultima: true }); return }
    let d = 0
    while (d < l.length) {
      if (l.length - d <= ancho) { out.push({ fila, desde: d, texto: l.slice(d), ultima: true }); break }
      let corte = l.lastIndexOf(' ', d + ancho - 1)
      corte = corte >= d ? corte + 1 : d + ancho
      out.push({ fila, desde: d, texto: l.slice(d, corte), ultima: false })
      d = corte
    }
  })
  return out
}

// Una columna está en esta fila si cae antes de su fin; el fin de línea, en la última.
const enFila = (v: { desde: number; texto: string; ultima: boolean }, col: number) =>
  col >= v.desde && (col < v.desde + v.texto.length || (v.ultima && col === v.desde + v.texto.length))

function cursorVisible(s: Estado, ancho: number) {
  const vis = filasVisibles(s.lineas, ancho)
  const i = vis.findIndex(v => v.fila === s.fila && enFila(v, s.col))
  return { vis, i: Math.max(0, i) }
}

// Mueve la ventana para que el cursor quede a la vista (se llama desde los manejadores).
export function ajustar(s: Estado, ancho: number, alto: number): Estado {
  const { i } = cursorVisible(s, ancho)
  const altoTexto = alto - (s.menu ? 6 : 1)
  let arriba = s.arriba
  if (i < arriba) arriba = i
  if (i >= arriba + altoTexto) arriba = i - altoTexto + 1
  return arriba === s.arriba ? s : { ...s, arriba }
}

// De una celda del panel a una posición del texto, descontando el menú y la barra del cursor.
// Primera fila visible y si hay aviso de «líneas más arriba» ocupando la fila 0.
export function ventana(actual: Estado, ancho: number) {
  const vis = filasVisibles(actual.lineas, ancho)
  const desde = Math.max(0, Math.min(actual.arriba, actual.fila))
  const inicioVis = Math.max(0, vis.findIndex(v => v.fila >= desde))
  return { vis, inicioVis, aviso: desde > 0 ? 1 : 0, desde }
}

export function posicion(actual: Estado, px: number, py: number, ancho: number) {
  const { vis: todas, inicioVis, aviso } = ventana(actual, ancho)
  if (aviso && py === 0) return { fila: -1, col: 0 }
  const vis = todas.slice(inicioVis)
  py -= aviso
  const conMenu = actual.menu ? vis.findIndex(w => w.fila === actual.menu!.fila && enFila(w, actual.menu!.inicio)) : -1
  const altoMenu = actual.menu ? altoDelMenu(actual.menu) : 0
  if (conMenu >= 0 && py > conMenu && py <= conMenu + altoMenu) return undefined
  const y = conMenu >= 0 && py > conMenu ? py - altoMenu : py
  const v = vis[y]
  if (!v) return undefined
  // Un clic después del final de un renglón cortado deja el cursor al final de ese renglón.
  const tope = v.ultima ? v.desde + v.texto.length : v.desde + v.texto.length - 1
  return { fila: v.fila, col: Math.max(v.desde, Math.min(tope, v.desde + Math.max(0, px))) }
}

// La app de escritorio reporta el mouse una celda a la izquierda de donde dibuja el texto
// (medido en la app de escritorio para Mac). Es una celda, no una medida en píxeles: no cambia con el tamaño de letra.
export const CORRIMIENTO = 1

const Editor: ClientModule<Props, Estado> = (props, surface) => {
  const { Box, Text } = surface.elements
  const ancho = Math.max(8, (surface.columns || 60) - 1)
  const alto = Math.max(5, surface.rows || 40)

  let s = surface.state
  if (!s || s.version !== props.version) {
    const lineas = props.texto.split('\n')
    const fila0 = Math.max(0, Math.min(lineas.length - 1, props.inicio ?? 0))
    s = { version: props.version, lineas, fila: fila0, col: fila0 > 0 ? 0 : lineas[0].length, arriba: fila0, sucio: false, pegadoN: props.pegado?.n }
    const inicial = s
    surface.onKey(k => {
      const actual = surface.state ?? inicial
      const r = teclaConSeleccion(actual, k)
      if (r.s !== actual) surface.setState({ ...r.s, arriba: Math.min(r.s.arriba, r.s.fila), sucio: actual.sucio || r.cambio })
      // Un solo mensaje por tecla: dos en el mismo cuadro se pisan.
      const pedirEnlace = r.s.menu?.enlace && (!actual.menu?.enlace || actual.menu.consulta !== r.s.menu.consulta || r.s.menu.consulta === '')
      if (r.cambio || r.guardar || r.pegar || r.copiar !== undefined || pedirEnlace) {
        surface.post({
          tipo: 'cambio',
          ...(pedirEnlace ? { enlace: r.s.menu!.consulta } : {}),
          ...(r.cambio || r.guardar ? { texto: r.s.lineas.join('\n') } : {}),
          ...(r.copiar !== undefined ? { copiar: r.copiar } : {}),
          ...(r.pegar ? { pegar: true } : {}),
        })
      }
    })
    surface.onPointer(p => {
      const actual = surface.state ?? inicial
      if (p.type === 'leave') {
        if (actual.hover) surface.setState({ ...actual, hover: undefined })
        return
      }
      // El ancho se lee en cada evento: si el panel cambió de tamaño, las líneas ya se cortaron distinto.
      const anchoAhora = Math.max(8, (surface.columns || 60) - 1)
      const pos = posicion(actual, p.x + CORRIMIENTO, p.y, anchoAhora)
      if ((p.type === 'move' && !p.button) || p.type === 'enter') {
        const prev = actual.hover
        if (!pos) { if (prev) surface.setState({ ...actual, hover: undefined }); return }
        if (pos.fila === -1) { if (prev) surface.setState({ ...actual, hover: undefined }); return }
        if (!prev || prev.fila !== pos.fila || prev.col !== pos.col) surface.setState({ ...actual, hover: pos })
        return
      }
      // Arrastrar con el botón apretado selecciona; fuera del texto se pega al borde.
      if ((p.type === 'move' && p.button) || (p.type === 'up' && actual.arrastrando)) {
        if (!actual.arrastrando) return
        const vis = filasVisibles(actual.lineas, anchoAhora)
        const { inicioVis, aviso } = ventana(actual, anchoAhora)
        const ultima = vis.length - inicioVis - 1 + aviso
        const enBorde = pos ?? (p.y < aviso ? { fila: vis[inicioVis].fila, col: 0 } : posicion(actual, p.y > ultima ? 1e6 : Math.max(0, p.x + CORRIMIENTO), Math.min(ultima, Math.max(aviso, p.y)), anchoAhora))
        if (!enBorde || enBorde.fila === -1) return
        const fin = p.type === 'up'
        const igual = actual.ancla && actual.ancla.fila === enBorde.fila && actual.ancla.col === enBorde.col
        surface.setState({ ...actual, fila: enBorde.fila, col: enBorde.col, arrastrando: !fin, ancla: fin && igual ? undefined : actual.ancla, hover: undefined })
        return
      }
      if (p.type !== 'down' || !pos) return
      if (pos.fila === -1) { surface.setState({ ...actual, arriba: 0, hover: undefined }); return }
      // Shift+clic extiende la selección desde donde estaba el cursor.
      const ancla = p.shift ? (actual.ancla ?? { fila: actual.fila, col: actual.col }) : { fila: pos.fila, col: pos.col }
      surface.setState({ ...actual, fila: pos.fila, col: pos.col, menu: undefined, hover: pos, ancla, arrastrando: true })
    })
    surface.setState(s)
  }

  if (props.sugerencias) { sugerencias.q = props.sugerencias.q; sugerencias.items = props.sugerencias.items }

  if (props.pegado && props.pegado.n !== s.pegadoN) {
    const nuevo = { ...insertarTexto(s, props.pegado.texto), pegadoN: props.pegado.n, sucio: true }
    surface.setState(nuevo)
    surface.post({ tipo: 'cambio', texto: nuevo.lineas.join('\n') })
    s = nuevo
  }

  const { vis, i: cursorVis } = cursorVisible(s, ancho)
  const { inicioVis: arriba, aviso, desde } = ventana(s, ancho)
  const filas = vis.slice(arriba)
  const ops = s.menu ? opcionesDe(s.menu) : []
  const menuTras = s.menu ? vis.findIndex(v => v.fila === s!.menu!.fila && enFila(v, s!.menu!.inicio)) : -1

  const menuCaja = s.menu ? (
              <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
                {ops.length === 0 && <Text dimColor>{s!.menu!.enlace ? (s!.menu!.consulta ? `Ninguna nota con «${s!.menu!.consulta}»` : 'Escribí el nombre de la nota') : `Nada coincide con «/${s!.menu!.consulta}»`}</Text>}
                {ops.length > 0 && (() => {
                  const sel = Math.min(s!.menu!.sel, ops.length - 1)
                  const desde = ventanaMenu(sel, ops.length)
                  return [
                    <Text key="cab" dimColor>{`${s!.menu!.tabla ? 'Tabla' : s!.menu!.enlace ? 'Enlazar nota' : 'Bloques'} ${sel + 1}/${ops.length} · ↑↓ y Enter${desde > 0 ? ' · ↑ hay más' : ''}${desde + VISIBLES < ops.length ? ' · ↓ hay más' : ''}`}</Text>,
                    ...ops.slice(desde, desde + VISIBLES).map((o, j) => (
                      <Text key={o.id} inverse={desde + j === sel}>{` ${o.nombre} `}</Text>
                    )),
                  ]
                })()}
              </Box>
  ) : null

  return (
    <Box flexDirection="column" flexGrow={1}>
      {aviso > 0 && <Text dimColor mono wrap="truncate-end">{`↑ ${desde} líneas más arriba · clic acá para verlas`}</Text>}
      {filas.map((v, i) => {
        const idx = arriba + i
        const caret = idx === cursorVis ? s!.col - v.desde : -1
        const hov = s!.hover
        const sobre = hov && hov.fila === v.fila && enFila(v, hov.col) ? hov.col - v.desde : -1
        // Solo la fila del cursor y la del mouse se arman letra por letra; el resto va entero,
        // así cada movimiento del mouse redibuja rápido aunque el archivo sea largo.
        // Columnas seleccionadas en esta fila: [selDesde, selHasta)
        const rg = rango(s!)
        let selDesde = -1
        let selHasta = -1
        if (rg) {
          const [a, b] = rg
          if (v.fila >= a.fila && v.fila <= b.fila) {
            const ini = v.fila === a.fila ? a.col : 0
            const fin = v.fila === b.fila ? b.col : s!.lineas[v.fila].length + 1
            selDesde = Math.max(0, ini - v.desde)
            selHasta = Math.min(v.texto.length + 1, fin - v.desde)
            if (selHasta <= selDesde) { selDesde = -1; selHasta = -1 }
          }
        }
        const conSel = selDesde >= 0
        const caretVisible = conSel || rg ? -1 : caret
        if (caretVisible < 0 && sobre < 0 && !conSel) {
          const filaRapida = <Text mono wrap="truncate-end">{v.texto === '' ? ' ' : v.texto}</Text>
          return (
            <Box key={`v${idx}`} flexDirection="column">
              {filaRapida}
              {idx === menuTras && menuCaja}
            </Box>
          )
        }
        const piezas: unknown[] = []
        let tramo = ''
        const cortar = () => { if (tramo) { piezas.push(tramo); tramo = '' } }
        let sel = ''
        const cortarSel = () => { if (sel) { piezas.push(<Text backgroundColor="claude" color="inverseText">{sel}</Text>); sel = '' } }
        for (let i = 0; i <= v.texto.length; i++) {
          const enSel = conSel && i >= selDesde && i < selHasta
          const c = i < v.texto.length ? v.texto[i] : i === caretVisible || i === sobre || enSel ? ' ' : ''
          if (enSel) { cortar(); sel += c; continue }
          cortarSel()
          if (i === caretVisible) { cortar(); piezas.push(<Text inverse>{c}</Text>) }
          else if (i === sobre) { cortar(); piezas.push(<Text underline color="claude">{c}</Text>) }
          else tramo += c
        }
        cortarSel()
        cortar()
        const filaTxt = <Text mono wrap="truncate-end">{piezas.length ? piezas : ' '}</Text>
        return (
          <Box key={`v${idx}`} flexDirection="column">
            {filaTxt}
            {idx === menuTras && menuCaja}
          </Box>
        )
      })}
      <Text dimColor>{props.estado ?? (s.sucio ? 'Guardando…' : (ancho < 45 ? 'Clic para escribir · «/»: bloques' : 'Clic para escribir · Enter: nueva línea · «/»: bloques · en tablas, Tab: celda siguiente y «/»: columnas, filas o eliminar · Esc: soltar'))}</Text>
    </Box>
  )
}

export default Editor
