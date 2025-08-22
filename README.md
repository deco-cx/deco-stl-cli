## STL to ASCII Terminal Renderer (deco-stl-cli)

Render 3D STL models as animated ASCII art directly in your terminal. This CLI parses binary or ASCII STL files, centers and scales the mesh, applies smoothed lighting, and continuously renders a rotating view with interactive light controls.

### Features
- **Binary and ASCII STL support**: Automatically detects and parses both formats.
- **Clean terminal animation**: Uses an alternate screen buffer and hidden cursor for flicker-minimized output.
- **Lighting and shading**: Backface culling, per-vertex normal smoothing, optional per-pixel lighting, ambient + directional light.
- **Interactive lighting**: Use number keys `1-8` or letters (rows `qwertyuiop`, `asdfghjkl;`, `zxcvbnm,./`) to steer the light around a ring.
- **Auto sizing**: Adapts to your terminal width/height; sensible defaults if not available.
- **Simple CLI**: Just point it at an `.stl` file.

### Requirements
- **Node.js**: v16+ recommended (works on macOS, Linux; Windows via compatible terminal/TTY).

### Getting Started
1. Clone or download this repository.
2. From the project directory, run the CLI against an STL file.

You can try the included sample model:

```bash
node deco-stl-cli/stl_to_ascii.js deco-stl-cli/deco_logo_120mm_x_12mm.stl
```

Alternatively, make the script executable and run it directly:

```bash
chmod +x deco-stl-cli/stl_to_ascii.js
./deco-stl-cli/stl_to_ascii.js deco-stl-cli/deco_logo_120mm_x_12mm.stl
```

### Usage
```bash
node stl_to_ascii.js <path-to-stl-file>
```

- **Argument**: `path-to-stl-file` — path to a binary or ASCII `.stl` file.
- On start, the tool prints terminal size, STL load status, triangle count, and the computed bounding box. It then begins rendering.

### Keyboard Controls
- **1–8**: Jump the light to one of eight evenly spaced ring presets (cardinals/diagonals).
- **Letter keys**: Any single key from rows `qwertyuiop`, `asdfghjkl;`, `zxcvbnm,./` also moves the light around the ring.
- **Any key**: Disables auto-orbit (if enabled) and lets you steer lighting manually.
- **Esc or Ctrl+C**: Exit and restore the terminal.

Notes:
- The model spins continuously around the vertical axis.
- Lighting defaults to manual control; use keys above to reposition.

### Tips
- **Terminal size**: Wider terminals yield better results. Around 120×40 or larger is ideal.
- **Monospace font**: Use a standard monospace font; avoid line-spacing tweaks that distort cell aspect ratio.
- **Remote sessions**: If rendering appears choppy, reduce other terminal activity or try a local shell.
- **After exit**: If your cursor remains hidden or the screen looks odd (e.g., after a forced kill), run `reset` in your terminal.

### Example
Render the provided Deco logo STL:

```bash
node deco-stl-cli/stl_to_ascii.js deco-stl-cli/deco_logo_120mm_x_12mm.stl
```

### Library/API (optional)
You can also import the core classes for custom rendering pipelines:

```js
const { STLParser, TerminalRenderer, Vector3, Triangle } = require('./stl_to_ascii');

const triangles = STLParser.parseSTL('path/to/model.stl');
const renderer = new TerminalRenderer();
// Apply your own transforms/lighting and call renderer.drawTriangle(...) per frame, then renderer.render().
```

### Acknowledgements
- Based on ideas from `AndrewSink/STL-to-ASCII-Generator`.

### License
Choose and add a license file suitable for your project (e.g., MIT).


