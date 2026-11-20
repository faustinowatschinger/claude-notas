export type Vista = {
  archivo?: string
  editando?: boolean
  plantilla?: string
  indiceAbierto?: boolean
  creandoEn?: { carpeta: string; tipo: 'archivo' | 'carpeta' }
  abiertas: string[]
  confirmar?: string
  filtro: string
}

export type Edicion = { archivo: string; texto: string; version: number; inicio?: number; pegado?: { n: number; texto: string } }

export type Rutas = { notas: string; versiones: string; papelera: string; plantillas: string; so: 'macos' | 'windows' | 'linux'; home: string }
export type Hallazgo = { ruta: string; linea: number; texto: string }
export type Contenido = { q: string; hits: Hallazgo[] }
export type Vinculos = { archivo: string; salientes: string[]; entrantes: string[] }

declare module 'claude-code' {
  interface PluginState {
    notas: { vista: Shaped<Vista>; aviso: Shaped<string>; raiz: Shaped<string>; rutas: Shaped<Rutas>; contenido: Shaped<Contenido>; vinculos: Shaped<Vinculos>; edicion: Shaped<Edicion>; respaldo: Shaped<number>; indice: Shaped<string[]> }
  }
}
