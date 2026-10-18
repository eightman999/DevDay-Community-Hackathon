import * as THREE from '../vendor/three.module.js';

// A small orthographic software renderer for devices with WebGL disabled.
// It projects the live Three scene, including morphs and instances. The fixed
// plaza is cached as a layer; animated characters remain actual 3D geometry.
export class SoftwareRenderer {
  constructor({ canvas }) {
    this.kind = 'software';
    this.domElement = canvas;
    this.context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!this.context) throw new Error('この端末では軽量 3D 表示も開始できませんでした。別のブラウザで開いてください。');
    this.shadowMap = { enabled: false, type: null };
    this.info = { render: { calls: 0, triangles: 0 } };
    this.capabilities = { isWebGL2: false };
    this._background = document.createElement('canvas');
    this._backgroundContext = this._background.getContext('2d', { alpha: false });
    this._ratio = 1;
    this._width = 1;
    this._height = 1;
    this._staticDirty = true;
    this._lastRender = -Infinity;
    this._geometryCache = new WeakMap();
    this._objectCache = new WeakMap();
    this._styles = new Map();
    this._facePool = [];
    this._faces = [];
    this._faceCount = 0;
    this._viewProjection = new THREE.Matrix4();
    this._matrix = new THREE.Matrix4();
    this._mvp = new THREE.Matrix4();
    this._normalMatrix = new THREE.Matrix3();
    this._instance = new THREE.Matrix4();
    this._disposed = false;
  }

  setPixelRatio(ratio) {
    // The same CSS framing, at a conservative software raster resolution.
    this._ratio = Math.min(1, ratio || 1);
  }

  setSize(width, height, updateStyle = true) {
    this._width = Math.max(1, Math.round(width * this._ratio));
    this._height = Math.max(1, Math.round(height * this._ratio));
    this.domElement.width = this._background.width = this._width;
    this.domElement.height = this._background.height = this._height;
    if (updateStyle) {
      this.domElement.style.width = `${width}px`;
      this.domElement.style.height = `${height}px`;
    }
    this._staticDirty = true;
  }

  getContext() { return this.context; }

  _face() {
    const index = this._faceCount++;
    const face = this._facePool[index] || (this._facePool[index] = {});
    this._faces[index] = face;
    face.kind = 'triangle';
    return face;
  }

  _isStatic(object) {
    let cursor = object;
    while (cursor) {
      if (cursor.userData?.softwareDynamic) return false;
      if (cursor.userData?.softwareStatic) return true;
      cursor = cursor.parent;
    }
    return false;
  }

  _indices(geometry, pixels) {
    let cache = this._geometryCache.get(geometry);
    if (!cache) { cache = new Map(); this._geometryCache.set(geometry, cache); }
    const p = geometry.parameters || {};
    let columns, rows, stepX = 1, stepY = 1;
    if (geometry.type === 'SphereGeometry') {
      columns = p.widthSegments; rows = p.heightSegments;
      const desired = pixels > 45 ? 20 : pixels > 24 ? 16 : pixels > 12 ? 12 : 8;
      stepX = Math.max(1, Math.ceil(columns / desired));
      stepY = Math.max(1, Math.ceil(rows / (desired * 0.68)));
    } else if (geometry.type === 'TorusGeometry') {
      columns = p.tubularSegments; rows = p.radialSegments;
      stepX = Math.max(1, Math.ceil(columns / (pixels > 15 ? 16 : 7)));
      stepY = Math.max(1, Math.ceil(rows / 4));
    } else if (geometry.type === 'TubeGeometry') {
      columns = p.radialSegments; rows = p.tubularSegments;
      stepX = Math.max(1, Math.ceil(columns / 5));
      stepY = Math.max(1, Math.ceil(rows / (pixels > 40 ? 28 : 12)));
    } else if (geometry.userData?.softwareGrid) {
      columns = geometry.userData.softwareGrid.columns;
      rows = geometry.userData.softwareGrid.rows;
      stepX = 2; stepY = 2;
    }
    if (!columns || !rows) return geometry.index?.array || null;
    const key = `${stepX}:${stepY}`;
    if (cache.has(key)) return cache.get(key);
    const indices = [];
    for (let y = 0; y < rows; y += stepY) {
      for (let x = 0; x < columns; x += stepX) {
        const nx = Math.min(columns, x + stepX), ny = Math.min(rows, y + stepY);
        const a = y * (columns + 1) + x, b = y * (columns + 1) + nx;
        const c = ny * (columns + 1) + x, d = ny * (columns + 1) + nx;
        // Sphere/Torus grids run the opposite way to Three's Tube grids.
        if (geometry.type === 'TubeGeometry' || geometry.userData?.softwareGrid) indices.push(a, c, b, b, c, d);
        else indices.push(a, c, b, b, c, d);
      }
    }
    const result = new Uint32Array(indices);
    cache.set(key, result);
    return result;
  }

  _style(material, nx, ny, nz, uv, depth) {
    let r = material.color?.r ?? 1, g = material.color?.g ?? 1, b = material.color?.b ?? 1;
    const image = material.map?.image;
    if (image?.data && image.width && uv !== null) {
      const x = Math.min(image.width - 1, Math.max(0, Math.floor(uv * image.width)));
      const offset = x * 4;
      r *= (image.data[offset] / 255) ** 2.2;
      g *= (image.data[offset + 1] / 255) ** 2.2;
      b *= (image.data[offset + 2] / 255) ** 2.2;
    }
    if (!material.isMeshBasicMaterial && !material.isLineBasicMaterial) {
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length; ny /= length; nz /= length;
      let illumination = 0.65 + (ny * 0.5 + 0.5) * 0.17;
      illumination += Math.max(0, nx * -0.35 + ny * 0.85 + nz * 0.4) * 0.59;
      illumination += Math.max(0, nx * 0.45 + ny * 0.5 - nz * 0.65) * 0.2;
      illumination = Math.round(illumination * 18) / 18;
      r *= illumination; g *= illumination; b *= illumination;
      const emissive = material.emissive, strength = (material.emissiveIntensity || 0) * 0.4;
      if (emissive) { r += emissive.r * strength; g += emissive.g * strength; b += emissive.b * strength; }
    }
    const gamma = (value) => Math.round(Math.min(1, Math.max(0, value)) ** (1 / 2.2) * 255);
    r = gamma(r); g = gamma(g); b = gamma(b);
    const distance = this._near + (depth + 1) * 0.5 * (this._far - this._near);
    const fog = Math.max(0, Math.min(0.8, (distance - 13) / 19));
    r = Math.round(r + (216 - r) * fog); g = Math.round(g + (232 - g) * fog); b = Math.round(b + (242 - b) * fog);
    const key = (r << 16) | (g << 8) | b;
    let style = this._styles.get(key);
    if (!style) { style = `rgb(${r},${g},${b})`; this._styles.set(key, style); }
    return style;
  }

  _vertices(object, matrix) {
    const geometry = object.geometry, positions = geometry.attributes.position;
    if (!positions) return null;
    let cache = this._objectCache.get(object);
    if (!cache || cache.count !== positions.count) {
      cache = { count: positions.count, values: new Float32Array(positions.count * 6) };
      this._objectCache.set(object, cache);
    }
    const output = cache.values, input = positions.array, normal = geometry.attributes.normal?.array;
    const weights = object.morphTargetInfluences;
    const morph0 = geometry.morphAttributes.position?.[0]?.array, morph1 = geometry.morphAttributes.position?.[1]?.array;
    const normals0 = geometry.morphAttributes.normal?.[0]?.array, normals1 = geometry.morphAttributes.normal?.[1]?.array;
    const w0 = weights?.[0] || 0, w1 = weights?.[1] || 0;
    this._mvp.multiplyMatrices(this._viewProjection, matrix);
    this._normalMatrix.getNormalMatrix(matrix);
    const e = this._mvp.elements, ne = this._normalMatrix.elements;
    for (let i = 0; i < positions.count; i += 1) {
      const v = i * 3, o = i * 6;
      let x = input[v], y = input[v + 1], z = input[v + 2];
      if (morph0 && w0) { x += (morph0[v] - input[v]) * w0; y += (morph0[v + 1] - input[v + 1]) * w0; z += (morph0[v + 2] - input[v + 2]) * w0; }
      if (morph1 && w1) { x += (morph1[v] - input[v]) * w1; y += (morph1[v + 1] - input[v + 1]) * w1; z += (morph1[v + 2] - input[v + 2]) * w1; }
      const divide = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      output[o] = ((e[0] * x + e[4] * y + e[8] * z + e[12]) * divide + 1) * this._width * 0.5;
      output[o + 1] = (1 - (e[1] * x + e[5] * y + e[9] * z + e[13]) * divide) * this._height * 0.5;
      output[o + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * divide;
      let nx = normal?.[v] || 0, ny = normal?.[v + 1] || 0, nz = normal?.[v + 2] || 0;
      if (normals0 && w0) { nx += (normals0[v] - nx) * w0; ny += (normals0[v + 1] - ny) * w0; nz += (normals0[v + 2] - nz) * w0; }
      if (normals1 && w1) { nx += (normals1[v] - (normal?.[v] || 0)) * w1; ny += (normals1[v + 1] - (normal?.[v + 1] || 0)) * w1; nz += (normals1[v + 2] - (normal?.[v + 2] || 0)) * w1; }
      output[o + 3] = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      output[o + 4] = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      output[o + 5] = ne[2] * nx + ne[5] * ny + ne[8] * nz;
    }
    return output;
  }

  _ring(object, matrix) {
    const radius = object.geometry.parameters.radius;
    this._mvp.multiplyMatrices(this._viewProjection, matrix);
    const e = this._mvp.elements;
    const face = this._face(); face.kind = 'ring';
    const points = face.points || (face.points = new Float32Array(66));
    let depth = 0;
    for (let i = 0; i <= 32; i += 1) {
      const angle = i / 32 * Math.PI * 2, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      points[i * 2] = (e[0] * x + e[4] * y + e[12] + 1) * this._width * 0.5;
      points[i * 2 + 1] = (1 - e[1] * x - e[5] * y - e[13]) * this._height * 0.5;
      depth += e[2] * x + e[6] * y + e[14];
    }
    face.depth = depth / 33; face.alpha = object.material.opacity;
    face.style = this._style(object.material, 0, 1, 0, null, face.depth);
    const scale = Math.hypot(matrix.elements[0], matrix.elements[1], matrix.elements[2]);
    face.width = Math.max(0.85, object.geometry.parameters.tube * 2 * scale * this._pixelsPerUnit);
  }

  _mesh(object, matrix, instanceColor = null) {
    const geometry = object.geometry;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials[0] || materials.every((material) => !material.visible || material.opacity <= 0.002)) return;
    if (geometry.type === 'TorusGeometry' && materials[0].isMeshBasicMaterial && geometry.parameters.tube < 0.08) {
      this._ring(object, matrix); return;
    }
    const values = this._vertices(object, matrix); if (!values) return;
    if (materials[0].map?.isCanvasTexture && geometry.type === 'PlaneGeometry') {
      const face = this._face(); face.kind = 'image'; face.image = materials[0].map.image;
      face.x0 = values[0]; face.y0 = values[1]; face.x1 = values[6]; face.y1 = values[7]; face.x2 = values[12]; face.y2 = values[13];
      face.depth = (values[2] + values[8] + values[14]) / 3; face.alpha = materials[0].opacity; return;
    }
    const e = matrix.elements;
    const scale = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
    const radius = geometry.boundingSphere?.radius || geometry.parameters?.radius || 1;
    const indices = this._indices(geometry, radius * scale * this._pixelsPerUnit);
    const count = indices?.length || geometry.attributes.position.count;
    const uv = geometry.attributes.uv?.array;
    const groups = geometry.groups || [];
    for (let i = 0; i < count; i += 3) {
      const a = indices ? indices[i] : i, b = indices ? indices[i + 1] : i + 1, c = indices ? indices[i + 2] : i + 2;
      const aa = a * 6, bb = b * 6, cc = c * 6;
      const x0 = values[aa], y0 = values[aa + 1], x1 = values[bb], y1 = values[bb + 1], x2 = values[cc], y2 = values[cc + 1];
      if (Math.max(x0, x1, x2) < -2 || Math.min(x0, x1, x2) > this._width + 2 || Math.max(y0, y1, y2) < -2 || Math.min(y0, y1, y2) > this._height + 2) continue;
      const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
      if (Math.abs(area) < 0.08) continue;
      let material = materials[0];
      if (materials.length > 1) {
        for (const group of groups) if (i >= group.start && i < group.start + group.count) { material = materials[group.materialIndex] || material; break; }
      }
      // Parametric LOD grids retain geometry, but using normal-facing culling
      // also handles differing sphere/tube grid index conventions correctly.
      const nx = values[aa + 3] + values[bb + 3] + values[cc + 3];
      const ny = values[aa + 4] + values[bb + 4] + values[cc + 4];
      const nz = values[aa + 5] + values[bb + 5] + values[cc + 5];
      const facing = nx * this._cameraDirection.x + ny * this._cameraDirection.y + nz * this._cameraDirection.z;
      if (material.side !== THREE.DoubleSide && facing < -0.0001) continue;
      const depth = (values[aa + 2] + values[bb + 2] + values[cc + 2]) / 3;
      const face = this._face();
      face.x0 = x0; face.y0 = y0; face.x1 = x1; face.y1 = y1; face.x2 = x2; face.y2 = y2;
      face.depth = depth; face.alpha = material.opacity;
      face.style = this._style(material, nx, ny, nz, uv ? (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3 : null, depth);
      if (instanceColor) face.style = this._style({ ...material, color: { r: material.color.r * instanceColor[0], g: material.color.g * instanceColor[1], b: material.color.b * instanceColor[2] } }, nx, ny, nz, null, depth);
    }
  }

  _line(object) {
    const material = object.material;
    if (!material.visible || material.opacity <= 0.002) return;
    const values = this._vertices(object, object.matrixWorld); if (!values) return;
    const count = object.geometry.attributes.position.count;
    for (let i = 0; i < count - 1; i += object.isLineSegments ? 2 : 1) {
      const a = i * 6, b = (i + 1) * 6;
      const face = this._face(); face.kind = 'line';
      face.x0 = values[a]; face.y0 = values[a + 1]; face.x1 = values[b]; face.y1 = values[b + 1];
      face.depth = (values[a + 2] + values[b + 2]) / 2;
      face.style = this._style(material, 0, 1, 0, null, face.depth); face.alpha = material.opacity; face.width = 1.1;
    }
  }

  _collect(scene, staticLayer) {
    this._faceCount = 0;
    scene.traverseVisible((object) => {
      if (this._isStatic(object) !== staticLayer) return;
      if (object.isInstancedMesh) {
        for (let i = 0; i < object.count; i += 1) {
          object.getMatrixAt(i, this._instance);
          this._matrix.multiplyMatrices(object.matrixWorld, this._instance);
          const colors = object.instanceColor?.array;
          this._mesh(object, this._matrix, colors ? [colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]] : null);
        }
      } else if (object.isMesh) this._mesh(object, object.matrixWorld);
      else if (object.isLine) this._line(object);
    });
    this._faces.length = this._faceCount;
    this._faces.sort((a, b) => b.depth - a.depth);
  }

  _draw(context) {
    context.lineJoin = 'round';
    for (const face of this._faces) {
      context.globalAlpha = face.alpha;
      if (face.kind === 'image') {
        const image = face.image;
        context.save();
        context.transform((face.x1 - face.x0) / image.width, (face.y1 - face.y0) / image.width, (face.x2 - face.x0) / image.height, (face.y2 - face.y0) / image.height, face.x0, face.y0);
        context.drawImage(image, 0, 0); context.restore(); continue;
      }
      context.beginPath();
      if (face.kind === 'ring') {
        context.moveTo(face.points[0], face.points[1]);
        for (let i = 1; i <= 32; i += 1) context.lineTo(face.points[i * 2], face.points[i * 2 + 1]);
        context.strokeStyle = face.style; context.lineWidth = face.width; context.stroke(); continue;
      }
      context.moveTo(face.x0, face.y0); context.lineTo(face.x1, face.y1);
      if (face.kind === 'line') { context.strokeStyle = face.style; context.lineWidth = face.width; context.stroke(); continue; }
      context.lineTo(face.x2, face.y2); context.closePath();
      context.fillStyle = face.style; context.fill();
      // Cover antialias seams on opaque adjacent faces without enlarging
      // translucent scan/wave polygons.
      if (face.alpha > 0.99) { context.strokeStyle = face.style; context.lineWidth = 0.42; context.stroke(); }
    }
    context.globalAlpha = 1;
  }

  render(scene, camera) {
    if (this._disposed) return;
    const now = performance.now();
    if (!this._staticDirty && now - this._lastRender < 38) return;
    this._lastRender = now;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    this._viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._near = camera.near; this._far = camera.far;
    this._pixelsPerUnit = this._width / (camera.right - camera.left);
    if (!this._cameraDirection) this._cameraDirection = new THREE.Vector3();
    this._cameraDirection.setFromMatrixColumn(camera.matrixWorld, 2).normalize();
    if (this._staticDirty) {
      this._backgroundContext.fillStyle = '#d8e8f2';
      this._backgroundContext.fillRect(0, 0, this._width, this._height);
      this._collect(scene, true); this._draw(this._backgroundContext);
      this._staticDirty = false;
    }
    this.context.drawImage(this._background, 0, 0);
    this._collect(scene, false); this._draw(this.context);
    this.info.render.calls = this._faceCount;
    this.info.render.triangles = this._faces.reduce((sum, face) => sum + (face.kind === 'triangle' ? 1 : 0), 0);
  }

  dispose() {
    this._disposed = true;
    this._faces.length = this._facePool.length = 0;
    this._styles.clear();
    this._background.width = this._background.height = 1;
  }
}
