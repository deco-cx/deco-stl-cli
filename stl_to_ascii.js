#!/usr/bin/env node
/**
 * STL to ASCII Terminal Renderer
 * Based on principles from AndrewSink/STL-to-ASCII-Generator
 * Renders 3D STL models as rotating ASCII art in the terminal
 */

const fs = require('fs');
const readline = require('readline');

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  add(v) {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  subtract(v) {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  multiply(scalar) {
    return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v) {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  normalize() {
    const length = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    if (length === 0) return new Vector3();
    return new Vector3(this.x / length, this.y / length, this.z / length);
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
}

class Triangle {
  constructor(v1, v2, v3, normal = null) {
    this.v1 = v1;
    this.v2 = v2;
    this.v3 = v3;
    this.normal = normal || this.calculateNormal();
    // Per-vertex normals (filled later from adjacency averaging)
    this.vn1 = null;
    this.vn2 = null;
    this.vn3 = null;
  }

  calculateNormal() {
    const edge1 = this.v2.subtract(this.v1);
    const edge2 = this.v3.subtract(this.v1);
    return edge1.cross(edge2).normalize();
  }
}

class STLParser {
  static parseSTL(filePath) {
    const data = fs.readFileSync(filePath);
    
    // Check if it's binary STL (first 80 bytes are header, then 4 bytes for triangle count)
    if (data.length > 84) {
      const triangleCount = data.readUInt32LE(80);
      const expectedSize = 80 + 4 + (triangleCount * 50); // 50 bytes per triangle
      
      if (data.length === expectedSize) {
        return this.parseBinarySTL(data);
      }
    }
    
    // Try ASCII STL
    return this.parseAsciiSTL(data.toString());
  }

  static parseBinarySTL(data) {
    const triangleCount = data.readUInt32LE(80);
    const triangles = [];
    
    let offset = 84; // Skip header and triangle count
    
    for (let i = 0; i < triangleCount; i++) {
      // Read normal vector (3 floats)
      const nx = data.readFloatLE(offset);
      const ny = data.readFloatLE(offset + 4);
      const nz = data.readFloatLE(offset + 8);
      const normal = new Vector3(nx, ny, nz);
      
      // Read 3 vertices (9 floats total)
      const v1 = new Vector3(
        data.readFloatLE(offset + 12),
        data.readFloatLE(offset + 16),
        data.readFloatLE(offset + 20)
      );
      const v2 = new Vector3(
        data.readFloatLE(offset + 24),
        data.readFloatLE(offset + 28),
        data.readFloatLE(offset + 32)
      );
      const v3 = new Vector3(
        data.readFloatLE(offset + 36),
        data.readFloatLE(offset + 40),
        data.readFloatLE(offset + 44)
      );
      
      triangles.push(new Triangle(v1, v2, v3, normal));
      
      offset += 50; // Move to next triangle (50 bytes per triangle)
    }
    
    return triangles;
  }

  static parseAsciiSTL(text) {
    const triangles = [];
    const lines = text.split('\n').map(line => line.trim());
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      if (line.startsWith('facet normal')) {
        // Parse normal
        const normalParts = line.split(/\s+/);
        const normal = new Vector3(
          parseFloat(normalParts[2]),
          parseFloat(normalParts[3]),
          parseFloat(normalParts[4])
        );
        
        i++; // Skip "outer loop"
        i++;
        
        // Parse 3 vertices
        const vertices = [];
        for (let j = 0; j < 3; j++) {
          const vertexLine = lines[i];
          const vertexParts = vertexLine.split(/\s+/);
          vertices.push(new Vector3(
            parseFloat(vertexParts[1]),
            parseFloat(vertexParts[2]),
            parseFloat(vertexParts[3])
          ));
          i++;
        }
        
        triangles.push(new Triangle(vertices[0], vertices[1], vertices[2], normal));
        
        i++; // Skip "endloop"
        i++; // Skip "endfacet"
      } else {
        i++;
      }
    }
    
    return triangles;
  }
}

class TerminalRenderer {
  constructor(width = null, height = null, options = {}) {
    // Auto-detect terminal size if not provided
    this.width = width || process.stdout.columns || 120;
    this.height = height || process.stdout.rows || 40;
    
    // Ensure we use the full terminal width and height
    console.log(`Terminal size: ${this.width}x${this.height}`);
    
    // Options
    this.usePerPixelLighting = !!options.perPixelLighting;
    this.frameIntervalMs = typeof options.frameIntervalMs === 'number' ? options.frameIntervalMs : 50;

    // Character buffers
    this.buffer = Array(this.height).fill().map(() => Array(this.width).fill(' '));
    // Stores numeric brightness index for this frame
    this.indexBuffer = Array(this.height).fill().map(() => Array(this.width).fill(-1));
    // Stores numeric brightness index from previous frame (for temporal smoothing)
    this.prevIndexBuffer = Array(this.height).fill().map(() => Array(this.width).fill(-1));
    // Depth buffer
    this.depthBuffer = Array(this.height).fill().map(() => Array(this.width).fill(Infinity));
    
    // Back to the original character set that looked better
    this.asciiChars = ' .:-+*=%@#';
  }

  clear() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = ' ';
        this.indexBuffer[y][x] = -1; // reset only current frame buffer; keep prevIndexBuffer for smoothing
        this.depthBuffer[y][x] = Infinity;
      }
    }
  }

  projectToScreen(point, cameraDistance = 5) {
    // Perspective projection - match the original camera setup
    // Original: camera.position.z = ((bbox.max.z * 3))
    const z = point.z + cameraDistance;
    if (z <= 0.1) return { x: -1, y: -1, z: point.z }; // Behind camera
    
    // More accurate perspective projection
    const fov = 45 * Math.PI / 180; // Match original camera FOV
    
    // Terminal characters are typically 2:1 ratio (twice as tall as wide)
    // So we need to stretch the Y axis to compensate
    const charAspectRatio = 2.0; // Terminal character height/width ratio
    const screenAspect = (this.width / this.height) * charAspectRatio;
    
    // Adjust scale for proper size
    const scale = Math.tan(fov / 2) * z; // Normal scale factor
    
    // Center the projection with good screen usage for visibility
    // Apply aspect ratio correction to Y coordinate
    const screenX = (point.x / scale) * (this.width * 0.3) + this.width / 2;  // Increased to 0.3 for better visibility
    const screenY = (-point.y / scale) * (this.height * 0.3) * charAspectRatio + this.height / 2; // Flip Y and stretch
    
    // Better stabilization to prevent up-down flickering
    // Use more stable rounding for both coordinates
    return { 
      x: Math.floor(screenX + 0.5), 
      y: Math.floor(screenY + 0.25), // Floor with smaller offset for stable Y
      z: point.z 
    };
  }

  drawTriangle(triangle, rotationMatrix, lightDirection, cameraDistance = 5) {
    // Transform vertices - rotation should happen around the model's center (0,0,0)
    // Since we already centered the model, rotation should be around origin
    const v1 = this.applyMatrix(triangle.v1, rotationMatrix);
    const v2 = this.applyMatrix(triangle.v2, rotationMatrix);
    const v3 = this.applyMatrix(triangle.v3, rotationMatrix);
    // Use smoothed per-vertex normals and interpolate for a Gouraud-like effect
    const n1 = this.applyMatrix(triangle.vn1 || triangle.normal, rotationMatrix);
    const n2 = this.applyMatrix(triangle.vn2 || triangle.normal, rotationMatrix);
    const n3 = this.applyMatrix(triangle.vn3 || triangle.normal, rotationMatrix);
    const normal = this.applyMatrix(triangle.normal, rotationMatrix);

    // Backface culling – make mesh opaque by discarding triangles facing away
    const centerView = new Vector3(
      (v1.x + v2.x + v3.x) / 3,
      (v1.y + v2.y + v3.y) / 3,
      (v1.z + v2.z + v3.z) / 3
    );
    const cameraPos = new Vector3(0, 0, -cameraDistance);
    const viewVector = cameraPos.subtract(centerView).normalize();
    if (normal.dot(viewVector) <= 0) {
      return; // Back-facing: skip to avoid see-through
    }

    // Project to screen coordinates using calculated camera distance
    const p1 = this.projectToScreen(v1, cameraDistance);
    const p2 = this.projectToScreen(v2, cameraDistance);
    const p3 = this.projectToScreen(v3, cameraDistance);

    // Calculate dramatic lighting from top-right
    const dotProduct = normal.dot(lightDirection);
    const directionalLight = Math.max(0, dotProduct);
    
    // Softer, smoother lighting for fewer banding patterns
    const ambientLight = 0.35; // moderate ambient to fill gaps
    const smoothLight = Math.pow(directionalLight, 1.2) * 0.7; // slightly softer response
    
    // Combine with a gentle minimum to avoid dark banding
    let lightIntensity = Math.max(0.25, smoothLight + ambientLight);
    lightIntensity = Math.min(1.0, lightIntensity);
    
    const charIndex = Math.floor(lightIntensity * (this.asciiChars.length - 1));

    // Simple triangle rasterization
    this.rasterizeTriangle(p1, p2, p3, charIndex, [n1, n2, n3], lightDirection);
  }

  rasterizeTriangle(p1, p2, p3, charIndex, vertexNormals = null, lightDirection = null) {
    // Skip if any points are behind camera
    if (p1.x < 0 || p1.y < 0 || p2.x < 0 || p2.y < 0 || p3.x < 0 || p3.y < 0) {
      return;
    }
    
    // Find bounding box
    const minX = Math.max(0, Math.min(p1.x, p2.x, p3.x));
    const maxX = Math.min(this.width - 1, Math.max(p1.x, p2.x, p3.x));
    const minY = Math.max(0, Math.min(p1.y, p2.y, p3.y));
    const maxY = Math.min(this.height - 1, Math.max(p1.y, p2.y, p3.y));

    // Skip degenerate triangles
    if (minX >= maxX || minY >= maxY) return;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (this.isPointInTriangle(x, y, p1, p2, p3)) {
          // Calculate depth (simple average for now)
          const depth = (p1.z + p2.z + p3.z) / 3;
          
          // Simple depth testing with smaller bias to reduce fighting
          const depthBias = 0.005; // Much smaller bias to reduce artifacts
          if (depth < this.depthBuffer[y][x] - depthBias) {
            // If we have per-vertex normals, recompute brightness per-pixel via barycentric interpolation
            let effectiveIndex = charIndex;
            if (this.usePerPixelLighting && vertexNormals && lightDirection) {
              // Barycentric weights for pixel
              const denom = (p2.y - p3.y) * (p1.x - p3.x) + (p3.x - p2.x) * (p1.y - p3.y);
              const a = ((p2.y - p3.y) * (x - p3.x) + (p3.x - p2.x) * (y - p3.y)) / denom;
              const b = ((p3.y - p1.y) * (x - p3.x) + (p1.x - p3.x) * (y - p3.y)) / denom;
              const c = 1 - a - b;
              const nx = vertexNormals[0].x * a + vertexNormals[1].x * b + vertexNormals[2].x * c;
              const ny = vertexNormals[0].y * a + vertexNormals[1].y * b + vertexNormals[2].y * c;
              const nz = vertexNormals[0].z * a + vertexNormals[1].z * b + vertexNormals[2].z * c;
              const nInterp = new Vector3(nx, ny, nz).normalize();
              const dLight = Math.max(0, nInterp.dot(lightDirection));
              const ambient = 0.35;
              const smooth = Math.pow(dLight, 1.2) * 0.7;
              const intensity = Math.min(1, Math.max(0.25, ambient + smooth));
              effectiveIndex = Math.floor(intensity * (this.asciiChars.length - 1));
            }

            // Temporal smoothing to reduce mid-shape flicker:
            const prevIdx = this.prevIndexBuffer[y][x];
            let blendedIdx = effectiveIndex;
            if (prevIdx !== -1) {
              // Lighter temporal smoothing to avoid perceived lag
              blendedIdx = Math.round(prevIdx * 0.3 + effectiveIndex * 0.7);
            }
            this.indexBuffer[y][x] = blendedIdx;
            this.depthBuffer[y][x] = depth;
          }
        }
      }
    }
  }

  // Helper function to get character brightness level
  getCharBrightness(char) {
    const index = this.asciiChars.indexOf(char);
    return index >= 0 ? index : 0;
  }

  isPointInTriangle(px, py, p1, p2, p3) {
    // Barycentric coordinate method
    const denom = (p2.y - p3.y) * (p1.x - p3.x) + (p3.x - p2.x) * (p1.y - p3.y);
    if (Math.abs(denom) < 0.001) return false; // Degenerate triangle
    
    const a = ((p2.y - p3.y) * (px - p3.x) + (p3.x - p2.x) * (py - p3.y)) / denom;
    const b = ((p3.y - p1.y) * (px - p3.x) + (p1.x - p3.x) * (py - p3.y)) / denom;
    const c = 1 - a - b;
    
    return a >= 0 && b >= 0 && c >= 0;
  }

  applyMatrix(vector, matrix) {
    return new Vector3(
      vector.x * matrix[0][0] + vector.y * matrix[0][1] + vector.z * matrix[0][2],
      vector.x * matrix[1][0] + vector.y * matrix[1][1] + vector.z * matrix[1][2],
      vector.x * matrix[2][0] + vector.y * matrix[2][1] + vector.z * matrix[2][2]
    );
  }

  render() {
    // Use cursor positioning instead of console.clear() to reduce flickering
    process.stdout.write('\x1b[H'); // Move cursor to home position
    
    let output = '';
    for (let y = 0; y < this.height; y++) {
      // Build line from indexBuffer; fall back to space when empty
      const line = new Array(this.width);
      for (let x = 0; x < this.width; x++) {
        const idx = this.indexBuffer[y][x];
        line[x] = idx >= 0 ? this.asciiChars[idx] : ' ';
        // Prepare for next frame: carry over the chosen index
        this.prevIndexBuffer[y][x] = idx;
      }
      output += line.join('') + '\n';
    }
    process.stdout.write(output);
  }
}

function createRotationMatrix(angleX, angleY, angleZ) {
  // Normalize angles to prevent precision issues
  angleX = angleX % (2 * Math.PI);
  angleY = angleY % (2 * Math.PI);
  angleZ = angleZ % (2 * Math.PI);
  
  const cosX = Math.cos(angleX), sinX = Math.sin(angleX);
  const cosY = Math.cos(angleY), sinY = Math.sin(angleY);
  const cosZ = Math.cos(angleZ), sinZ = Math.sin(angleZ);

  // Combined rotation matrix (Z * Y * X)
  return [
    [cosY * cosZ, -cosY * sinZ, sinY],
    [sinX * sinY * cosZ + cosX * sinZ, -sinX * sinY * sinZ + cosX * cosZ, -sinX * cosY],
    [-cosX * sinY * cosZ + sinX * sinZ, cosX * sinY * sinZ + sinX * cosZ, cosX * cosY]
  ];
}

function setupTerminal() {
  process.stdout.write('\x1b[?25l'); // Hide cursor
  process.stdout.write('\x1b[2J'); // Clear screen
  process.stdout.write('\x1b[H'); // Move cursor to home
  process.stdout.write('\x1b[?1049h'); // Use alternate screen buffer to avoid scrolling
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    process.stdout.write('\x1b[?1049l'); // Restore screen
    process.stdout.write('\x1b[?25h'); // Show cursor
    process.stdout.write('\x1b[2J\x1b[H'); // Clear and reset
    process.exit(0);
  });
}

async function main() {
  const stlFile = process.argv[2];
  
  if (!stlFile) {
    console.log('Usage: node stl_to_ascii.js <path-to-stl-file>');
    console.log('Please provide the path to your deco logo STL file');
    process.exit(1);
  }

  if (!fs.existsSync(stlFile)) {
    console.error('STL file not found:', stlFile);
    process.exit(1);
  }

  console.log('Loading STL file:', stlFile);
  
  try {
    const triangles = STLParser.parseSTL(stlFile);
    console.log(`Loaded ${triangles.length} triangles from STL file`);
    
    // Build per-vertex smoothed normals to reduce faceted shading
    const vertexMap = new Map(); // key: "x,y,z" -> { normalSum: Vector3, count: number }
    function keyOf(v) { return `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`; }
    // First pass: accumulate normals for shared vertices
    triangles.forEach(t => {
      const n = t.normal;
      [t.v1, t.v2, t.v3].forEach(v => {
        const k = keyOf(v);
        const entry = vertexMap.get(k) || { normalSum: new Vector3(0,0,0), count: 0 };
        entry.normalSum = entry.normalSum.add(n);
        entry.count += 1;
        vertexMap.set(k, entry);
      });
    });
    // Second pass: assign averaged normals to triangle vertices
    triangles.forEach(t => {
      const k1 = keyOf(t.v1); const k2 = keyOf(t.v2); const k3 = keyOf(t.v3);
      t.vn1 = vertexMap.get(k1).normalSum.multiply(1 / vertexMap.get(k1).count).normalize();
      t.vn2 = vertexMap.get(k2).normalSum.multiply(1 / vertexMap.get(k2).count).normalize();
      t.vn3 = vertexMap.get(k3).normalSum.multiply(1 / vertexMap.get(k3).count).normalize();
    });

    // Center the model like the original: myMesh.geometry.center()
    const vertices = triangles.flatMap(t => [t.v1, t.v2, t.v3]);
    const center = vertices.reduce((sum, v) => sum.add(v), new Vector3()).multiply(1 / vertices.length);
    
    // Center all triangles
    triangles.forEach(t => {
      t.v1 = t.v1.subtract(center);
      t.v2 = t.v2.subtract(center);
      t.v3 = t.v3.subtract(center);
    });

    // Compute bounding box like the original
    const centeredVertices = triangles.flatMap(t => [t.v1, t.v2, t.v3]);
    const minX = Math.min(...centeredVertices.map(v => v.x));
    const maxX = Math.max(...centeredVertices.map(v => v.x));
    const minY = Math.min(...centeredVertices.map(v => v.y));
    const maxY = Math.max(...centeredVertices.map(v => v.y));
    const minZ = Math.min(...centeredVertices.map(v => v.z));
    const maxZ = Math.max(...centeredVertices.map(v => v.z));
    
    console.log(`Bounding box: X(${minX.toFixed(2)}, ${maxX.toFixed(2)}) Y(${minY.toFixed(2)}, ${maxY.toFixed(2)}) Z(${minZ.toFixed(2)}, ${maxZ.toFixed(2)})`);

    // Scale the model 50% larger
    const maxDimension = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const scale = 1.5 / maxDimension; // 50% larger than before
    triangles.forEach(t => {
      t.v1 = t.v1.multiply(scale);
      t.v2 = t.v2.multiply(scale);
      t.v3 = t.v3.multiply(scale);
    });

    // Recompute bounding box after scaling
    const scaledVertices = triangles.flatMap(t => [t.v1, t.v2, t.v3]);
    const scaledMinZ = Math.min(...scaledVertices.map(v => v.z));
    const scaledMaxZ = Math.max(...scaledVertices.map(v => v.z));
    
    // Keep model perfectly centered for proper rotation
    // Don't add Y offset - let it rotate around its true center
    // const modelOffsetY = (scaledMaxZ - scaledMinZ) / 5;
    // triangles.forEach(t => {
    //   t.v1.y += modelOffsetY;
    //   t.v2.y += modelOffsetY;
    //   t.v3.y += modelOffsetY;
    // });

    setupTerminal();
    
    const renderer = new TerminalRenderer(null, null, { perPixelLighting: true, frameIntervalMs: 60 });
    // Light control via keyboard – all rows act as ring keys (horizontal ring)
    const row1 = 'qwertyuiop';
    const row2 = 'asdfghjkl;';
    const row3 = 'zxcvbnm,./';
    function angleForRowKey(row, ch) {
      const idx = row.indexOf(ch);
      if (idx === -1) return null;
      const n = row.length; // map evenly around 360
      return (idx / n) * Math.PI * 2;
    }
    let currentAngle = 0; // preset 1 (first of 8 evenly spaced positions)
    let tiltY = 0; // horizontal ring by default
    let currentLightDir = new Vector3(Math.cos(currentAngle), tiltY, Math.sin(currentAngle)).normalize();
    let autoOrbit = false; // no default auto-orbit

    function updateLightFromKeys(keyChar) {
      const c = (keyChar || '').toLowerCase();
      let ang = angleForRowKey(row1, c);
      if (ang == null) ang = angleForRowKey(row2, c);
      if (ang == null) ang = angleForRowKey(row3, c);
      if (ang != null) {
        currentAngle = ang;
        currentLightDir = new Vector3(Math.cos(currentAngle), 0, Math.sin(currentAngle)).normalize();
      }
    }

    // Keypress handling to switch light presets dynamically
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('keypress', (str, key) => {
      if (key?.ctrl && key?.name === 'c') {
        process.kill(process.pid, 'SIGINT');
        return;
      }
      if (key?.name === 'escape') {
        process.kill(process.pid, 'SIGINT');
        return;
      }
      // any other key disables auto-orbit and lets the user steer
      autoOrbit = false;
      // Numeric 1-8 set 8 evenly spaced ring presets (diagonals/cardinals)
      const num = parseInt(key?.sequence, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= 8) {
        const step = (num - 1) / 8 * Math.PI * 2;
        currentAngle = step;
        currentLightDir = new Vector3(Math.cos(currentAngle), tiltY, Math.sin(currentAngle)).normalize();
        return;
      }
      if (typeof str === 'string' && str.length === 1) {
        updateLightFromKeys(str);
      }
    });
    
    // Calculate camera distance based on bounding box like the original
    // Original: camera.position.z = ((bbox.max.z * 3))
    // Keep camera at a fixed distance for stable rotation
    const cameraDistance = 3.0; // Fixed distance to prevent depth shifting during rotation
    
    let rotationZ = 0;
    const rotationSpeed = 0.04; // Twice as fast again (4x original speed)
    
    console.log('Rendering... Press Ctrl+C to stop');
    
    function tick() {
      renderer.clear();
      
      // Slow rotation like the original - mainly around Z axis
      // Keep rotation angle bounded to prevent precision accumulation
      rotationZ += rotationSpeed;
      rotationZ = rotationZ % (2 * Math.PI); // Keep angle between 0 and 2π to prevent accumulation
      
      // Create rotation matrix - adjust for proper logo viewing angle
      const rotationMatrix = createRotationMatrix(
        0,               // No X rotation - view from front
        rotationZ,       // Y rotation for spinning
        0                // No Z rotation
      );
      
      // Auto orbit light counter to model rotation for stability until first user input
      if (autoOrbit) {
        // Light rotates slower, opposite the logo rotation
        currentAngle = Math.PI / 4 - rotationZ * 0.5; // half speed, counter-rotating
        currentLightDir = new Vector3(Math.cos(currentAngle), tiltY, Math.sin(currentAngle)).normalize();
      }

      // Render all triangles
      triangles.forEach(triangle => {
        renderer.drawTriangle(triangle, rotationMatrix, currentLightDir, cameraDistance);
      });
      
      renderer.render();
      
      // Use CPU-friendly frame rate
      setTimeout(tick, renderer.frameIntervalMs);
    }
    
    tick();
    
  } catch (error) {
    console.error('Error processing STL file:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { STLParser, TerminalRenderer, Vector3, Triangle };
