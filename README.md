# claude-notas

Tus notas y tu agenda adentro de Claude Code, sin salir a Obsidian ni a Notion.

Son dos mods (plugins con panel propio) para la app de escritorio de Claude Code:

| Mod | Comando | Qué hace |
|---|---|---|
| `notas` | `/notas` | Explorador de tus `.md` como el de VS Code, editor dentro del panel, `[[enlaces]]`, búsqueda y nota rápida |
| `agenda` | `/agenda` | Calendario del mes y las casillas del día, que se tildan con un clic |

Guía paso a paso con capturas del flujo: [`guia-instalacion.pdf`](guia-instalacion.pdf).

## Qué necesitás

- **La app de escritorio de Claude Code** (la pestaña Code), versión 2.1.328 o más nueva, en **Mac, Windows o Linux**.
- En **Linux**, para copiar y pegar: `wl-clipboard` (Wayland) o `xclip`. En Mac y Windows no hace falta nada.

Cada sistema usa lo suyo: en Mac, `pbcopy`/`pbpaste` y la Papelera; en Windows, PowerShell y la Papelera de reciclaje; en Linux, `wl-copy`/`xclip` y `gio trash`. **Probado en Mac.** Windows y Linux están cubiertos por tests simulados, todavía sin probar en una computadora real: si algo falla, abrí un issue. Los paneles también se ven en la terminal en pantalla completa, pero el editor se probó en la app de escritorio. En la extensión de VS Code no se ven paneles.

## Instalar

Dentro de Claude Code, escribí:

```
/plugin marketplace add faustinowatschinger/claude-notas
```

```
/plugin install notas@claude-notas
```

```
/plugin install agenda@claude-notas
```

Abrí un chat nuevo: los paneles se abren solos. Si no, escribí `/notas` o `/agenda`.

Desde la terminal es lo mismo con `claude plugin marketplace add …` y `claude plugin install …`.

## Elegir tus carpetas

Por defecto usan carpetas del proyecto donde abrís Claude:

| Mod | Opción | Por defecto | Qué es |
|---|---|---|---|
| notas | `carpetaNotas` | `notas` | Donde se guarda cada nota rápida |
| notas | `carpetaPlantillas` | `plantillas` | Las plantillas que ofrece al crear un archivo |
| agenda | `carpetaDias` | `dias` | Un archivo `AAAA-MM-DD.md` por día |

Se cambian con `/plugin configure notas@claude-notas` y `/plugin configure agenda@claude-notas`. Aceptan rutas relativas al proyecto o absolutas.

## Qué hace `/notas`

- **Explorador:** todos los `.md` del proyecto en árbol. En cada carpeta, al pasar el mouse, ＋📄 crea un archivo y ＋📁 una carpeta. El archivo nuevo abre directo en el editor.
- **Buscador 🔍:** por nombre o ruta mientras escribís; con Enter busca también dentro del texto.
- **Lectura:** el archivo con formato, las propiedades del encabezado YAML, las `#etiquetas`, un índice de títulos y, al pie, los enlaces que salen y las notas que lo enlazan. Al pasar el mouse por una sección aparece ✎ para editar ahí.
- **Editor:** se escribe dentro del panel. Enter hace línea nueva y sigue las listas. «/» abre el menú de bloques (títulos, listas, casillas, tablas, código…). `[[` propone notas para enlazar. En las tablas, Tab pasa de celda y «/» agrega o quita columnas y filas. Selección con el mouse o Shift, Cmd/Ctrl + A/C/X/V. Se guarda solo.
- **Nota rápida:** escribís, «Guardar», y queda como archivo en `carpetaNotas`.
- **🗑 Eliminar:** pide confirmación y manda el archivo a la Papelera del sistema.

## Qué hace `/agenda`

- Un mes arriba: los días con archivo en color. Tocás un día y ves su agenda.
- Las casillas `- [ ]` del día se tildan con un clic y se guardan en el archivo.
- Si las líneas empiezan con una hora en negrita (`- [ ] **10:00–12:00** Llamadas`), la arma como agenda y destaca el bloque que toca ahora.

## Cuidados que tiene

- Nunca guarda un archivo con contenido como vacío.
- Antes de la primera escritura de cada edición copia el original a `~/.claude/notas-versiones/`.
- Eliminar manda a la Papelera, no borra.

## Límites conocidos

- El puntero del mouse no cambia a la barrita de texto adentro del editor: al pasar el mouse se subraya la letra donde va a caer el clic.
- En la app de escritorio el clic en un link dentro del texto con formato lo maneja la app, por eso los `[[enlaces]]` se navegan con los botones del pie.
- No hay deshacer ni doble clic para seleccionar palabra.
- El editor abre archivos de hasta 90.000 caracteres.
- La corrección del clic (`CORRIMIENTO` en `notas/hooks/editor.tsx`) se midió en una Mac. Si en tu computadora el clic cae corrido, ese es el número a tocar.

## Actualizar

```
/plugin marketplace update claude-notas
```

```
/plugin update notas@claude-notas
```

```
/plugin update agenda@claude-notas
```

Y abrí un chat nuevo: los que ya estaban abiertos siguen con la versión anterior.

## Licencia

MIT. Hecho por [@faustinowatschinger](https://github.com/faustinowatschinger) con Claude Code.
