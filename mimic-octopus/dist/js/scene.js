import * as THREE from '../vendor/three.module.js';
import { SoftwareRenderer } from './software-renderer.js';

// All scene animation is a projection of the game snapshot. Nothing in this
// module writes to the simulation or owns gameplay timing.
const PALETTE = {
  gold: '#ffd365', yellow: '#ffd365', cyan: '#58cfee', blue: '#58cfee',
  violet: '#b09bf3', purple: '#b09bf3', coral: '#ff99b4', pink: '#ff99b4',
};
const CREAM = '#fff0d5';
const COCOA = '#72503e';
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

function targetHex(value) {
  return PALETTE[typeof value === 'object' ? value?.id : value] || '#ffd365';
}

function shapeName(value) {
  return typeof value === 'object' ? value?.id : value;
}

function standard(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02, ...options });
}

function luminous(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
}

function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(x, y, z);
  if (parent) parent.add(result);
  return result;
}

function roundedRectGeometry(width, height, depth, radius = 0.13) {
  const x = -width / 2, y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const outline = new THREE.Shape();
  outline.moveTo(x + r, y);
  outline.lineTo(x + width - r, y);
  outline.quadraticCurveTo(x + width, y, x + width, y + r);
  outline.lineTo(x + width, y + height - r);
  outline.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  outline.lineTo(x + r, y + height);
  outline.quadraticCurveTo(x, y + height, x, y + height - r);
  outline.lineTo(x, y + r);
  outline.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: Math.max(0.01, depth - r * 0.7), bevelEnabled: true,
    bevelSegments: 3, steps: 1, bevelSize: r * 0.35, bevelThickness: r * 0.35, curveSegments: 5,
  });
  geometry.center();
  return geometry;
}

function shadowTexture() {
  const surface = document.createElement('canvas');
  surface.width = surface.height = 64;
  const context = surface.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(53,75,92,.26)');
  gradient.addColorStop(0.55, 'rgba(53,75,92,.13)');
  gradient.addColorStop(1, 'rgba(53,75,92,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function tentacleTexture() {
  const width = 256;
  const data = new Uint8Array(width * 4);
  const cream = [251, 232, 202], cocoa = [126, 84, 59];
  for (let x = 0; x < width; x += 1) {
    const wave = Math.sin((x / width) * TAU * 4.25 + 0.5);
    const amount = clamp((wave - 0.04) * 12 + 0.5, 0, 1);
    for (let c = 0; c < 3; c += 1) data[x * 4 + c] = mix(cream[c], cocoa[c], amount);
    data[x * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Shared sphere topology with GPU position and normal morphs. */
function mantleGeometry() {
  const geometry = new THREE.SphereGeometry(1, 40, 26);
  const round = geometry.attributes.position.clone();
  const square = round.clone();
  const capsule = round.clone();
  const signedPower = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
  for (let i = 0; i < round.count; i += 1) {
    const x = round.getX(i), y = round.getY(i), z = round.getZ(i);
    // A smooth round mantle, a soft folder-like box, and a wide capsule.
    round.setXYZ(i, x * 0.84, y * 0.89, z * 0.75);
    square.setXYZ(i, signedPower(x, 0.43) * 0.86, signedPower(y, 0.43) * 0.75, signedPower(z, 0.43) * 0.62);
    capsule.setXYZ(i, x * 0.73 + Math.sign(x) * Math.pow(Math.abs(x), 0.16) * 0.39, y * 0.64, z * 0.67);
  }
  geometry.setAttribute('position', round);
  geometry.computeVertexNormals();
  const normals = [];
  for (const positions of [square, capsule]) {
    const temporary = new THREE.BufferGeometry();
    temporary.setIndex(geometry.index.clone());
    temporary.setAttribute('position', positions.clone());
    temporary.computeVertexNormals();
    normals.push(temporary.attributes.normal.clone());
    temporary.dispose();
  }
  geometry.morphAttributes.position = [square, capsule];
  geometry.morphAttributes.normal = normals;
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius = 1.4;
  return geometry;
}

function addContact(parent, texture, radius, opacity = 0.55) {
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, depthWrite: false });
  const contact = mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), material, parent, 0, 0.014, 0);
  contact.rotation.x = -Math.PI / 2;
  return contact;
}

function makeRing(parent, radius, color, opacity = 0.75, thickness = 0.014) {
  const material = luminous(color, opacity);
  const result = mesh(new THREE.TorusGeometry(radius, thickness, 6, 64), material, parent, 0, 0.03, 0);
  result.rotation.x = -Math.PI / 2;
  return result;
}

function createArm(index, material, parent) {
  const segments = 28, sides = 10;
  const positions = new Float32Array((segments + 1) * (sides + 1) * 3);
  const normals = new Float32Array(positions.length);
  const uv = new Float32Array((segments + 1) * (sides + 1) * 2);
  const indices = [];
  const circle = [];
  for (let side = 0; side <= sides; side += 1) circle.push([Math.cos(side / sides * TAU), Math.sin(side / sides * TAU)]);
  for (let segment = 0; segment <= segments; segment += 1) {
    for (let side = 0; side <= sides; side += 1) {
      const vertex = segment * (sides + 1) + side;
      uv[vertex * 2] = segment / segments;
      uv[vertex * 2 + 1] = side / sides;
      if (segment < segments && side < sides) {
        const next = vertex + sides + 1;
        indices.push(vertex, next, vertex + 1, vertex + 1, next, next + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.userData.softwareGrid = { columns: sides, rows: segments };
  const body = mesh(geometry, material, parent);
  body.castShadow = true;
  body.frustumCulled = false;
  return {
    index, segments, sides, positions, normals, circle, geometry,
    centers: new Float32Array((segments + 1) * 3),
    surfaceNormals: new Float32Array((segments + 1) * 3),
    radii: new Float32Array(segments + 1),
  };
}

function updateArm(arm, time, agitation, tuck, reducedMotion) {
  const { centers, surfaceNormals, radii, segments, sides, positions, normals, circle, index } = arm;
  const baseAngle = index / 8 * TAU + 0.1;
  const animation = reducedMotion ? 0 : 1;
  const front = Math.cos(baseAngle);
  const reach = 0.93 + agitation * 0.34 - tuck * 0.25 + (index % 2) * 0.08;
  const tipLift = 0.21 + Math.max(0, front) * 0.12 + agitation * (0.25 + 0.3 * Math.sin(time * 5.6 + index * 1.7)) * animation;
  for (let segment = 0; segment <= segments; segment += 1) {
    const s = segment / segments;
    const angle = baseAngle + (Math.sin(time * 2.5 + index) * 0.07 * agitation * animation + Math.sin(index * 2) * s * s * 0.18);
    const r = 0.42 + reach * Math.sin(s * 2.07);
    const y = 0.135 + 0.43 * Math.exp(-s * 6.7) + tipLift * s ** 4 + Math.sin(s * Math.PI) * Math.sin(time * 4 + index) * agitation * 0.06 * animation;
    centers[segment * 3] = Math.sin(angle) * r;
    centers[segment * 3 + 1] = y;
    centers[segment * 3 + 2] = Math.cos(angle) * r;
    radii[segment] = 0.177 * (1 - s) ** 0.65 + 0.013;
  }
  for (let segment = 0; segment <= segments; segment += 1) {
    const previous = Math.max(0, segment - 1) * 3, next = Math.min(segments, segment + 1) * 3;
    let tx = centers[next] - centers[previous], ty = centers[next + 1] - centers[previous + 1], tz = centers[next + 2] - centers[previous + 2];
    const length = Math.hypot(tx, ty, tz) || 1;
    tx /= length; ty /= length; tz /= length;
    const angle = Math.atan2(centers[segment * 3], centers[segment * 3 + 2]);
    const sx = Math.cos(angle), sz = -Math.sin(angle);
    let nx = ty * sz, ny = tz * sx - tx * sz, nz = -ty * sx;
    const nLength = Math.hypot(nx, ny, nz) || 1;
    nx /= nLength; ny /= nLength; nz /= nLength;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    surfaceNormals[segment * 3] = nx;
    surfaceNormals[segment * 3 + 1] = ny;
    surfaceNormals[segment * 3 + 2] = nz;
    for (let side = 0; side <= sides; side += 1) {
      const [cosine, sine] = circle[side];
      const vx = nx * cosine + bx * sine, vy = ny * cosine + by * sine, vz = nz * cosine + bz * sine;
      const offset = (segment * (sides + 1) + side) * 3;
      positions[offset] = centers[segment * 3] + vx * radii[segment];
      positions[offset + 1] = centers[segment * 3 + 1] + vy * radii[segment];
      positions[offset + 2] = centers[segment * 3 + 2] + vz * radii[segment];
      normals[offset] = vx; normals[offset + 1] = vy; normals[offset + 2] = vz;
    }
  }
  arm.geometry.attributes.position.needsUpdate = true;
  arm.geometry.attributes.normal.needsUpdate = true;
}

function createOctopus(parent, geometry, contactMap) {
  const root = new THREE.Group();
  root.position.set(0, 0, 1.22);
  parent.add(root);
  addContact(root, contactMap, 1.7, 0.8);
  const ring = makeRing(root, 1.38, '#ffdc86', 0.95, 0.019);
  const outerRing = makeRing(root, 1.5, '#fff8e7', 0.75, 0.012);
  const pulse = makeRing(root, 1.38, '#ffdd7e', 0.65, 0.02);
  const character = new THREE.Group();
  character.rotation.y = 0.17;
  root.add(character);
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: PALETTE.gold, roughness: 0.38, metalness: 0, clearcoat: 0.24, clearcoatRoughness: 0.45 });
  const body = mesh(geometry, bodyMaterial, character, 0, 1.09, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  const tab = mesh(roundedRectGeometry(0.66, 0.25, 0.35, 0.1), bodyMaterial, character, -0.32, 1.9, -0.04);
  tab.castShadow = true;
  const armsMaterial = standard(CREAM, { map: tentacleTexture(), roughness: 0.44 });
  const arms = Array.from({ length: 8 }, (_, i) => createArm(i, armsMaterial, character));
  const suckerRims = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.32, 7, 12), standard('#ffd7d2', { roughness: 0.65 }), 40);
  const suckerCenters = new THREE.InstancedMesh(new THREE.CircleGeometry(0.78, 12), standard('#bd7f80', { side: THREE.DoubleSide }), 40);
  suckerRims.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  suckerCenters.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  suckerRims.frustumCulled = suckerCenters.frustumCulled = false;
  character.add(suckerRims, suckerCenters);

  const whiteMaterial = standard('#fffaf0', { roughness: 0.25 });
  const cocoaMaterial = standard('#432e2b', { roughness: 0.4 });
  const irisMaterial = standard('#995c2d', { roughness: 0.28 });
  const shineMaterial = luminous('#ffffff');
  const sphere = new THREE.SphereGeometry(1, 24, 18);
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.325, 1.32, 0.655);
    character.add(eye);
    const socket = mesh(sphere, bodyMaterial, eye, 0, 0, -0.047);
    socket.scale.set(0.337, 0.388, 0.21);
    const white = mesh(sphere, whiteMaterial, eye);
    white.scale.set(0.276, 0.326, 0.178);
    const iris = new THREE.Group();
    iris.position.set(side * 0.025, 0.004, 0.151);
    eye.add(iris);
    const irisOuter = mesh(sphere, irisMaterial, iris);
    irisOuter.scale.set(0.119, 0.155, 0.073);
    const pupil = mesh(sphere, cocoaMaterial, iris, 0.007, -0.005, 0.05);
    pupil.scale.set(0.07, 0.112, 0.035);
    const highlight = mesh(sphere, shineMaterial, iris, -0.032, 0.053, 0.08);
    highlight.scale.set(0.031, 0.041, 0.012);
    const smallHighlight = mesh(sphere, shineMaterial, iris, 0.039, -0.052, 0.08);
    smallHighlight.scale.set(0.012, 0.016, 0.007);
    const browCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, -0.025, 0), new THREE.Vector3(0, 0.066, 0.01), new THREE.Vector3(0.21, 0, 0),
    ]);
    const brow = mesh(new THREE.TubeGeometry(browCurve, 12, 0.037, 7, false), standard(COCOA), character, side * 0.34, 1.73, 0.69);
    eyes.push({ eye, white, iris, brow, side });
  }
  const cheekMaterial = standard('#ffb8a5', { roughness: 0.8 });
  const cheeks = [];
  for (const side of [-1, 1]) {
    const cheek = mesh(sphere, cheekMaterial, character, side * 0.59, 1.045, 0.645);
    cheek.scale.set(0.13, 0.062, 0.028);
    cheeks.push(cheek);
  }
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.09, 0.035, 0), new THREE.Vector3(0, -0.025, 0.025), new THREE.Vector3(0.09, 0.035, 0),
  ]);
  const smile = mesh(new THREE.TubeGeometry(smileCurve, 12, 0.018, 6, false), cocoaMaterial, character, 0, 0.99, 0.75);
  const gasp = mesh(new THREE.TorusGeometry(0.058, 0.019, 8, 18), cocoaMaterial, character, 0.025, 0.985, 0.765);
  gasp.scale.y = 1.25;
  const sweat = new THREE.Group();
  sweat.position.set(0.755, 1.47, 0.52);
  sweat.rotation.z = -0.15;
  character.add(sweat);
  const sweatMaterial = new THREE.MeshPhysicalMaterial({ color: '#b6f6ff', roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.9, clearcoat: 1 });
  const dropBottom = mesh(sphere, sweatMaterial, sweat, 0, -0.045, 0);
  dropBottom.scale.set(0.048, 0.076, 0.03);
  mesh(new THREE.ConeGeometry(0.047, 0.16, 14), sweatMaterial, sweat, 0, 0.045, 0);
  const dropShine = mesh(sphere, shineMaterial, sweat, -0.014, -0.04, 0.026);
  dropShine.scale.set(0.009, 0.032, 0.007);

  return { root, character, body, bodyMaterial, tab, arms, suckerRims, suckerCenters, eyes, cheeks, smile, gasp, sweat, ring, outerRing, pulse, weights: [1, 0], agitation: 0.2 };
}

function createNeighbor(parent, geometry, contactMap, position, scale = 0.55) {
  const root = new THREE.Group();
  root.position.set(...position);
  root.scale.setScalar(scale);
  parent.add(root);
  addContact(root, contactMap, 1.05, 0.64);
  const ring = makeRing(root, 0.97, '#8ceeff', 0.6, 0.018);
  const pulse = makeRing(root, 1.05, '#d8ffff', 0.75, 0.025);
  const person = new THREE.Group();
  person.rotation.y = 0.2;
  root.add(person);
  const material = new THREE.MeshPhysicalMaterial({ color: PALETTE.gold, roughness: 0.35, clearcoat: 0.2, metalness: 0 });
  const body = mesh(geometry, material, person, 0, 1.02, 0);
  body.castShadow = true;
  const tab = mesh(roundedRectGeometry(0.6, 0.24, 0.3, 0.09), material, person, -0.3, 1.83, -0.04);
  const emblemMaterial = standard('#fff8dd', { transparent: true, opacity: 0.74, roughness: 0.48 });
  const emblem = new THREE.Group();
  emblem.position.set(0, 1.08, 0.748);
  person.add(emblem);
  mesh(roundedRectGeometry(0.49, 0.32, 0.034, 0.04), emblemMaterial, emblem);
  mesh(roundedRectGeometry(0.22, 0.10, 0.032, 0.025), emblemMaterial, emblem, -0.12, 0.185, 0);
  const feet = [];
  const footMaterial = standard('#686379');
  for (const side of [-1, 1]) {
    const foot = mesh(new THREE.SphereGeometry(0.2, 16, 10), footMaterial, person, side * 0.35, 0.2, 0.08);
    foot.scale.set(0.68, 0.6, 1.14);
    foot.castShadow = true;
    feet.push(foot);
  }
  return { root, person, material, body, tab, emblem, feet, ring, pulse, weights: [1, 0], phaseOffset: position[0] * 0.13 };
}

function addPlaza(scene, contactMap) {
  const world = new THREE.Group();
  world.userData.softwareStatic = true;
  scene.add(world);
  const cream = standard('#f9ead9');
  const edgeMaterial = standard('#9cc4d4');
  const platform = mesh(new THREE.CylinderGeometry(5.25, 5.5, 0.5, 64), [edgeMaterial, cream, edgeMaterial], world, 0, -0.33, -0.58);
  platform.scale.z = 0.84;
  platform.receiveShadow = true;
  const edge = mesh(new THREE.TorusGeometry(5.25, 0.035, 8, 100), luminous('#b0fbff'), world, 0, -0.12, -0.58);
  edge.rotation.x = -Math.PI / 2;
  edge.scale.y = 0.84;
  const base = mesh(new THREE.CylinderGeometry(5.48, 5.3, 0.18, 64), standard('#648ea6'), world, 0, -0.65, -0.58);
  base.scale.z = 0.84;
  const floorMaterial = standard('#bed6e5', { roughness: 0.92 });
  const floor = mesh(new THREE.PlaneGeometry(200, 200), floorMaterial, world, 0, -0.79, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;

  const tileGeometry = new THREE.BoxGeometry(0.69, 0.07, 0.69);
  const tileMaterial = standard('#fff3df', { roughness: 0.72 });
  const tilePositions = [];
  for (let ix = -7; ix <= 7; ix += 1) {
    for (let iz = -5; iz <= 5; iz += 1) {
      const x = ix * 0.73, z = iz * 0.73 - 0.58;
      if ((x / 5.03) ** 2 + ((z + 0.58) / 4.12) ** 2 < 1) tilePositions.push([x, z, ix, iz]);
    }
  }
  const tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, tilePositions.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  tilePositions.forEach(([x, z, ix, iz], i) => {
    dummy.position.set(x, -0.032, z); dummy.updateMatrix(); tiles.setMatrixAt(i, dummy.matrix);
    color.set((ix + iz * 3) % 7 === 0 ? '#cfe7ed' : (ix - iz) % 4 === 0 ? '#f6dfc4' : '#fff0d9');
    tiles.setColorAt(i, color);
  });
  tiles.receiveShadow = true;
  world.add(tiles);

  // Small inlaid directional chevrons make the floor feel like a data street.
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(-0.12, -0.09); arrowShape.lineTo(0.05, -0.09); arrowShape.lineTo(0.05, -0.19);
  arrowShape.lineTo(0.24, 0); arrowShape.lineTo(0.05, 0.19); arrowShape.lineTo(0.05, 0.09);
  arrowShape.lineTo(-0.12, 0.09); arrowShape.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(arrowShape);
  const arrowMaterial = luminous('#8ebfd9', 0.55);
  for (let i = -3; i <= 3; i += 1) {
    const arrow = mesh(arrowGeometry, arrowMaterial, world, i * 1.2, 0.008, 2.97);
    arrow.rotation.x = -Math.PI / 2;
  }
  const laneCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.7, 0.025, -1.6), new THREE.Vector3(-2.5, 0.025, -2.45),
    new THREE.Vector3(0, 0.025, -2.8), new THREE.Vector3(2.8, 0.025, -2.5), new THREE.Vector3(4.6, 0.025, -1.4),
  ]);
  mesh(new THREE.TubeGeometry(laneCurve, 60, 0.015, 5, false), luminous('#8be6ef', 0.75), world);

  const buildingGeometry = roundedRectGeometry(1.3, 1, 1, 0.16);
  const blue = standard('#a5c5e8');
  const blueDark = standard('#7098c1');
  const warm = standard('#f7dec4');
  const windowMaterial = standard('#ffecb4', { emissive: '#ffe6a0', emissiveIntensity: 0.65, roughness: 0.5 });
  for (let i = 0; i < 11; i += 1) {
    const x = (i - 5) * 1.62;
    const height = 2.2 + ((i * 7) % 5) * 0.72;
    const z = -7.4 - Math.abs(i - 5) * 0.2;
    const tower = mesh(buildingGeometry, i % 3 === 0 ? warm : i % 3 === 1 ? blue : blueDark, world, x, height / 2 - 0.2, z);
    tower.scale.set(1, height, 1.18);
    for (let level = 0; level < Math.floor(height / 0.55); level += 1) {
      const window = mesh(new THREE.BoxGeometry(0.82, 0.10, 0.03), windowMaterial, world, x, 0.3 + level * 0.59, z + 0.62);
      window.rotation.z = (i % 2) * 0.01;
    }
    const cap = mesh(roundedRectGeometry(1.44, 0.14, 1.25, 0.08), warm, world, x, height - 0.13, z);
    cap.castShadow = true;
  }

  function gate(x, z, rotation) {
    const gateRoot = new THREE.Group();
    gateRoot.position.set(x, 0.08, z); gateRoot.rotation.y = rotation; world.add(gateRoot);
    const pillar = roundedRectGeometry(0.42, 2.45, 0.68, 0.16);
    mesh(pillar, cream, gateRoot, -0.92, 1.18, 0).castShadow = true;
    mesh(pillar, cream, gateRoot, 0.92, 1.18, 0).castShadow = true;
    mesh(roundedRectGeometry(2.25, 0.5, 0.7, 0.17), cream, gateRoot, 0, 2.45, 0).castShadow = true;
    mesh(roundedRectGeometry(1.46, 1.81, 0.1, 0.16), standard('#81aed1', { metalness: 0.1 }), gateRoot, 0, 1.28, -0.04);
    mesh(roundedRectGeometry(1.56, 0.05, 0.1, 0.016), luminous('#86f1ff'), gateRoot, 0, 2.19, 0.08);
    const symbol = new THREE.Group(); symbol.position.set(0, 1.4, 0.08); gateRoot.add(symbol);
    mesh(roundedRectGeometry(0.69, 0.48, 0.06, 0.08), windowMaterial, symbol);
    mesh(roundedRectGeometry(0.29, 0.13, 0.06, 0.035), windowMaterial, symbol, -0.18, 0.26, 0);
    for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(0.052, 1.7, 0.04), luminous('#b2fbff'), gateRoot, side * 0.72, 1.28, 0.11);
  }
  gate(-3.5, -3.55, 0.09);
  gate(3.55, -3.9, -0.1);

  const bridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6.2, 1.55, -5.5), new THREE.Vector3(-3.5, 2.04, -5.35),
    new THREE.Vector3(0, 2.3, -5.55), new THREE.Vector3(3.2, 1.9, -5.4), new THREE.Vector3(6.3, 1.4, -5.8),
  ]);
  const bridge = mesh(new THREE.TubeGeometry(bridgeCurve, 70, 0.16, 8, false), standard('#d9e7ec'), world);
  bridge.scale.z = 1.015;
  mesh(new THREE.TubeGeometry(bridgeCurve, 70, 0.027, 6, false), luminous('#85efff'), world, 0, 0.2, 0.16);
  const travelers = [];
  const travelerGeometry = roundedRectGeometry(0.21, 0.26, 0.1, 0.045);
  for (let i = 0; i < 18; i += 1) {
    const traveler = mesh(travelerGeometry, standard(i % 3 === 0 ? '#ffd87a' : '#87dcef'), world);
    traveler.userData.softwareDynamic = true;
    travelers.push(traveler);
  }

  const foliageGeometry = new THREE.SphereGeometry(1, 9, 7);
  const foliageMaterials = [standard('#6fba9c'), standard('#9ccb8a'), standard('#4b9d8c')];
  for (const [x, z, scale] of [[-4.1, 1.3, 0.65], [4.2, 1.1, 0.7], [-2.6, -4.0, 0.6], [2.65, -4.2, 0.57]]) {
    const pot = mesh(new THREE.CylinderGeometry(0.34 * scale, 0.25 * scale, 0.52 * scale, 12), standard('#f4d9ba'), world, x, 0.2 * scale, z);
    pot.castShadow = true;
    for (let i = 0; i < 7; i += 1) {
      const a = i / 7 * TAU;
      const leaf = mesh(foliageGeometry, foliageMaterials[i % 3], world, x + Math.sin(a) * 0.19 * scale, (0.61 + (i % 2) * 0.17) * scale, z + Math.cos(a) * 0.19 * scale);
      leaf.scale.set(0.16 * scale, 0.48 * scale, 0.18 * scale); leaf.rotation.z = Math.sin(a) * 0.6; leaf.rotation.x = Math.cos(a) * 0.45;
      leaf.castShadow = true;
    }
  }
  return { world, bridgeCurve, travelers };
}

function createDrone(parent) {
  const root = new THREE.Group(); parent.add(root);
  const shellMaterial = new THREE.MeshPhysicalMaterial({ color: '#fff3e7', roughness: 0.38, metalness: 0.07, clearcoat: 0.2 });
  const shell = mesh(new THREE.SphereGeometry(0.41, 30, 20), shellMaterial, root);
  shell.scale.set(1, 0.94, 1); shell.castShadow = true;
  const lensHousing = mesh(new THREE.CylinderGeometry(0.245, 0.29, 0.13, 32), standard('#4a5669', { metalness: 0.25 }), root, 0, 0, 0.33);
  lensHousing.rotation.x = Math.PI / 2;
  const lensRing = mesh(new THREE.TorusGeometry(0.195, 0.024, 8, 32), standard('#ffc38e', { emissive: '#ff8f6e', emissiveIntensity: 0.65 }), root, 0, 0, 0.417);
  const lensMaterial = new THREE.MeshStandardMaterial({ color: '#f8ba77', emissive: '#ffc578', emissiveIntensity: 1.1, roughness: 0.2 });
  const lens = mesh(new THREE.SphereGeometry(0.125, 24, 16), lensMaterial, root, 0, 0, 0.42);
  lens.scale.z = 0.5;
  const band = mesh(new THREE.TorusGeometry(0.408, 0.013, 5, 48), standard('#a1afc0'), root);
  band.rotation.y = Math.PI / 2;
  const pods = [];
  for (const side of [-1, 1]) {
    const pod = mesh(new THREE.SphereGeometry(0.16, 18, 12), shellMaterial, root, side * 0.43, -0.02, 0);
    pod.scale.set(0.7, 1, 1);
    const glow = mesh(new THREE.CircleGeometry(0.085, 20), luminous('#a5f0ff'), root, side * 0.546, -0.025, 0);
    glow.rotation.y = side * Math.PI / 2;
    pods.push(glow);
  }
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 8), standard('#6a7084'), root, 0, 0.445, 0);
  const antenna = mesh(new THREE.SphereGeometry(0.055, 14, 10), luminous('#81eaff'), root, 0, 0.55, 0);
  const alert = new THREE.Group(); alert.position.set(0, 0.92, 0); root.add(alert);
  mesh(roundedRectGeometry(0.09, 0.3, 0.06, 0.035), luminous('#ff846c'), alert, 0, 0.08, 0);
  mesh(new THREE.SphereGeometry(0.048, 12, 8), luminous('#ff846c'), alert, 0, -0.15, 0);

  const beamMaterial = new THREE.MeshBasicMaterial({ color: '#ff8b9d', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = mesh(new THREE.ConeGeometry(1, 1, 36, 1, true), beamMaterial, parent);
  beam.renderOrder = 3;
  const linePositions = new Float32Array(6);
  const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
  const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: '#ffaf9f', transparent: true, opacity: 0 }));
  line.frustumCulled = false; parent.add(line);
  const footprint = mesh(new THREE.RingGeometry(0.78, 0.82, 64), luminous('#ffa096', 0), parent, 0, 0.065, 1.2);
  footprint.rotation.x = -Math.PI / 2;
  return { root, lensRing, lensMaterial, antenna, alert, beam, line, linePositions, footprint, pods };
}

function createWave(parent) {
  const root = new THREE.Group(); parent.add(root);
  const material = new THREE.MeshBasicMaterial({ color: '#8defff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const curtain = mesh(new THREE.PlaneGeometry(6.8, 4.5, 1, 1), material, root, 0, 2.1, -0.45);
  curtain.rotation.y = Math.PI / 2;
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#caffff', transparent: true, opacity: 0 });
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(curtain.geometry), lineMaterial);
  outline.position.copy(curtain.position); outline.rotation.copy(curtain.rotation); root.add(outline);
  const particlesMaterial = luminous('#a7faff', 0.6);
  const particles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 0.055, 0.055), particlesMaterial, 36);
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); particles.frustumCulled = false; root.add(particles);
  const ring = makeRing(parent, 0.7, '#b7faff', 0, 0.028);
  ring.position.z = 1.22;
  return { root, material, outline, particles, ring };
}

function beatPhase(clockMs, rhythm) {
  if (!rhythm?.periodMs || !Number.isFinite(rhythm.periodMs)) return null;
  return ((((clockMs - (rhythm.anchorMs || 0)) / rhythm.periodMs) % 1) + 1) % 1;
}

function beatHeight(phase) {
  if (phase === null) return 0;
  // The hop apex, brightest ring, UI pulse and engine beat all occur at phase 0.
  // Start the hop before the boundary so following its visible apex is accurate.
  const distanceFromBeat = Math.min(phase, 1 - phase);
  if (distanceFromBeat >= 0.22) return 0;
  return (1 + Math.cos(distanceFromBeat / 0.22 * Math.PI)) * 0.5;
}

export function createScene({ canvas, quality = 'auto' } = {}) {
  if (!canvas) throw new Error('3D rendering needs a canvas element.');
  let renderer;
  try {
    const contextOptions = { antialias: true, alpha: false, powerPreference: 'high-performance' };
    let context = null;
    try { context = canvas.getContext('webgl2', contextOptions); } catch { /* Software path below. */ }
    if (context) {
      renderer = new THREE.WebGLRenderer({ canvas, context, ...contextOptions });
      renderer.kind = 'webgl';
    } else {
      renderer = new SoftwareRenderer({ canvas });
    }
  } catch (error) {
    throw new Error(`この端末では 3D 表示を開始できませんでした。WebGL を利用できるブラウザで開いてください。 (${error.message})`);
  }
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'low' ? 1 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d8e8f2');
  scene.fog = new THREE.Fog('#d8e8f2', 13, 32);
  const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 70);
  camera.position.set(5.1, 6.5, 11.6);
  camera.lookAt(0, 1.05, -0.35);
  const hemisphere = new THREE.HemisphereLight('#fff8ef', '#90adc9', 2.35); scene.add(hemisphere);
  const key = new THREE.DirectionalLight('#fff0d7', 3.8);
  key.position.set(-3.5, 8.5, 4); key.castShadow = quality !== 'low';
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -7;
  key.shadow.camera.right = key.shadow.camera.top = 7;
  key.shadow.camera.near = 0.1; key.shadow.camera.far = 25;
  key.shadow.normalBias = 0.035; key.shadow.bias = -0.00015;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#b2efff', 2.1); rim.position.set(4, 5, -6); scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffe3d7', 0.65); fill.position.set(1, 3, 8); scene.add(fill);

  const contactMap = shadowTexture();
  const plaza = addPlaza(scene, contactMap);
  const geometry = mantleGeometry();
  const octopus = createOctopus(scene, geometry, contactMap);
  const neighbors = [
    createNeighbor(scene, geometry, contactMap, [-2.3, 0, 0.85], 0.56),
    createNeighbor(scene, geometry, contactMap, [2.35, 0, 0.55], 0.56),
    createNeighbor(scene, geometry, contactMap, [-2.3, 0, -1.3], 0.54),
    createNeighbor(scene, geometry, contactMap, [-0.22, 0, -1.55], 0.55),
    createNeighbor(scene, geometry, contactMap, [1.9, 0, -1.7], 0.52),
    createNeighbor(scene, geometry, contactMap, [0.25, 0, -3.35], 0.48),
  ];
  const drone = createDrone(scene);
  const wave = createWave(scene);
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const source = new THREE.Vector3();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const targetColor = new THREE.Color();
  const safeRingColor = new THREE.Color('#91e8c9');
  const anxiousRingColor = new THREE.Color('#ffcb7a');
  const dangerRingColor = new THREE.Color('#ff927e');
  const traveledPoint = new THREE.Vector3();
  let ambientTime = 0, disposed = false;

  function applyMorph(object, shape, factor) {
    const square = shapeName(shape) === 'square' ? 1 : 0;
    const capsule = shapeName(shape) === 'capsule' ? 1 : 0;
    object.weights[0] = mix(object.weights[0], square, factor);
    object.weights[1] = mix(object.weights[1], capsule, factor);
    object.body.morphTargetInfluences[0] = object.weights[0];
    object.body.morphTargetInfluences[1] = object.weights[1];
    const tabAmount = Math.max(0.002, object.weights[0]);
    object.tab.scale.set(1, tabAmount, tabAmount);
    object.tab.visible = tabAmount > 0.025;
  }

  function resize(width, height) {
    if (disposed) return;
    const w = Math.max(1, width), h = Math.max(1, height), aspect = w / h;
    // Keep the entire play cluster on portrait screens; landscape reveals more city.
    const visibleHeight = aspect < 1.1 ? 7.6 / aspect : h < 260 ? 5.9 : 7.45;
    camera.left = -visibleHeight * aspect / 2; camera.right = visibleHeight * aspect / 2;
    camera.top = visibleHeight / 2; camera.bottom = -visibleHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function render(state, deltaSeconds = 1 / 60, { reducedMotion = false } = {}) {
    if (disposed || !state) return;
    const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 1 / 60, 0, 0.1);
    if (state.phase !== 'paused') ambientTime += dt;
    const clockMs = state.phase === 'ready' ? ambientTime * 1000 : state.elapsedMs || 0;
    const time = clockMs / 1000;
    const factor = reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
    const matching = Boolean(state.match?.color && state.match?.shape && state.match?.rhythm);
    const suspicion = clamp((state.suspicion || 0) / 100, 0, 1);
    const lost = state.phase === 'lost', won = state.phase === 'won';
    const mismatchWeight = (state.match?.color ? 0 : 0.38) + (state.match?.shape ? 0 : 0.37) + (state.match?.rhythm ? 0 : 0.25);
    octopus.agitation = mix(octopus.agitation, lost ? 0.1 : mismatchWeight * 0.75 + suspicion * 0.28, factor);
    const beat = beatPhase(clockMs, state.player);
    const beatBounce = reducedMotion ? 0 : beatHeight(beat);
    targetColor.set(targetHex(state.player?.color));
    octopus.bodyMaterial.color.lerp(targetColor, factor);
    applyMorph(octopus, state.player?.shape, factor);
    octopus.character.position.y = lost ? -0.07 : beatBounce * 0.13 + (won && !reducedMotion ? Math.sin(ambientTime * 3) * 0.03 : 0);
    octopus.character.rotation.z = reducedMotion ? 0 : Math.sin(time * 5.4) * octopus.agitation * 0.025;
    octopus.character.scale.y = lost ? 0.91 : 1 + beatBounce * 0.025;
    octopus.ring.material.color.copy(matching ? safeRingColor : anxiousRingColor).lerp(dangerRingColor, suspicion * 0.7);
    octopus.pulse.material.color.copy(octopus.ring.material.color);
    octopus.pulse.scale.setScalar(beat === null ? 1 : 1 + beat * 0.22);
    octopus.pulse.material.opacity = beat === null ? 0 : (1 - beat) * 0.6;
    octopus.outerRing.material.opacity = matching ? 0.9 : 0.4;
    octopus.ring.material.opacity = lost ? 0.35 : 0.85;
    octopus.smile.visible = matching || won;
    octopus.gasp.visible = !octopus.smile.visible;
    octopus.gasp.scale.y = 0.9 + suspicion * 1.1;
    octopus.gasp.position.z = 0.765 - octopus.weights[0] * 0.1 - octopus.weights[1] * 0.07;
    octopus.smile.position.z = 0.75 - octopus.weights[0] * 0.1 - octopus.weights[1] * 0.07;
    octopus.sweat.visible = !matching && !won;
    octopus.sweat.position.y = 1.48 - (!reducedMotion ? ((time * 0.7) % 1) * 0.1 : 0);
    const blinkPhase = (ambientTime + 0.4) % 4.6;
    const blink = !reducedMotion && blinkPhase < 0.15 ? 0.12 + Math.abs(blinkPhase - 0.075) / 0.075 * 0.88 : 1;
    for (const eye of octopus.eyes) {
      eye.eye.position.x = eye.side * (0.325 + octopus.weights[1] * 0.065);
      eye.eye.position.y = 1.3 - octopus.weights[1] * 0.025;
      eye.eye.position.z = 0.67 - octopus.weights[0] * 0.055 - octopus.weights[1] * 0.028;
      eye.eye.scale.y = blink * (lost ? 0.7 : 1 + suspicion * 0.08);
      eye.iris.position.x = eye.side * 0.012 + (state.scan?.active ? 0.056 : Math.sin(time * 0.65) * 0.025);
      eye.iris.position.y = state.scan?.active ? 0.04 : lost ? -0.065 : 0.015;
      eye.brow.rotation.z = eye.side * (matching || won ? -0.09 : 0.24 + suspicion * 0.15);
      eye.brow.position.y = 1.72 - octopus.weights[1] * 0.08;
    }
    let suckerIndex = 0;
    for (const arm of octopus.arms) {
      updateArm(arm, time, octopus.agitation, matching || won ? 1 : 0, reducedMotion);
      for (let s = 0; s < 5; s += 1) {
        const segment = Math.round((0.37 + s * 0.135) * arm.segments);
        const offset = segment * 3;
        normal.set(arm.surfaceNormals[offset], arm.surfaceNormals[offset + 1], arm.surfaceNormals[offset + 2]);
        const radius = arm.radii[segment];
        dummy.position.set(arm.centers[offset], arm.centers[offset + 1], arm.centers[offset + 2]).addScaledVector(normal, radius * 0.98);
        dummy.quaternion.setFromUnitVectors(FORWARD, normal);
        dummy.scale.setScalar(0.057 - s * 0.007);
        dummy.updateMatrix(); octopus.suckerRims.setMatrixAt(suckerIndex, dummy.matrix);
        dummy.position.addScaledVector(normal, 0.002); dummy.updateMatrix(); octopus.suckerCenters.setMatrixAt(suckerIndex, dummy.matrix);
        suckerIndex += 1;
      }
    }
    octopus.suckerRims.instanceMatrix.needsUpdate = true;
    octopus.suckerCenters.instanceMatrix.needsUpdate = true;

    const targetBeat = beatPhase(clockMs, state.target);
    const neighborBounce = reducedMotion ? 0 : beatHeight(targetBeat);
    const changeAge = (state.elapsedMs || 0) - (state.environment?.changedAtMs || 0);
    const changeActive = (state.environment?.index || 0) > 0 && changeAge >= 0 && changeAge < 1250;
    const changeProgress = clamp(changeAge / 1250, 0, 1);
    for (const neighbor of neighbors) {
      const usePrevious = changeActive && changeAge < 480 && neighbor.root.position.x > -4 + (changeAge / 480) * 8;
      const desired = usePrevious ? state.previousTarget : state.target;
      targetColor.set(targetHex(desired?.color));
      neighbor.material.color.lerp(targetColor, factor);
      applyMorph(neighbor, desired?.shape, factor);
      neighbor.person.position.y = neighborBounce * 0.28;
      neighbor.person.rotation.z = reducedMotion ? 0 : Math.sin(time * 2.4 + neighbor.phaseOffset) * 0.035;
      neighbor.emblem.position.z = 0.75 - neighbor.weights[0] * 0.1 - neighbor.weights[1] * 0.07;
      neighbor.emblem.scale.setScalar(1 - neighbor.weights[0] * 0.1);
      neighbor.pulse.scale.setScalar(1 + (targetBeat || 0) * 0.3);
      neighbor.pulse.material.opacity = (1 - (targetBeat || 0)) * 0.85;
      neighbor.ring.material.opacity = 0.45 + neighborBounce * 0.5;
      for (let i = 0; i < neighbor.feet.length; i += 1) {
        neighbor.feet[i].rotation.x = reducedMotion ? 0 : Math.sin(time * 6 + i * Math.PI) * 0.16;
      }
    }
    for (let i = 0; i < plaza.travelers.length; i += 1) {
      const u = (i / plaza.travelers.length + (reducedMotion ? 0 : time * 0.022)) % 1;
      plaza.bridgeCurve.getPointAt(u, traveledPoint);
      plaza.travelers[i].position.copy(traveledPoint); plaza.travelers[i].position.y += 0.3;
      plaza.travelers[i].rotation.y = 0.25;
    }

    const scan = Boolean(state.scan?.active);
    const nearScan = !scan && state.phase === 'playing' && (state.scan?.nextInMs || 9999) < 2000;
    drone.root.position.set(2.75 + (reducedMotion ? 0 : Math.sin(time * 0.65) * 0.15), 3.25 + (reducedMotion ? 0 : Math.sin(time * 1.8) * 0.11), -0.75);
    drone.root.rotation.y = -0.88;
    drone.root.rotation.x = scan ? 0.26 : 0.12;
    drone.alert.visible = scan || nearScan;
    drone.alert.scale.setScalar(reducedMotion ? 1 : 0.95 + Math.sin(time * 9) * 0.06);
    drone.lensMaterial.emissive.set(scan ? '#ff6d71' : '#ffc578');
    drone.lensMaterial.emissiveIntensity = scan ? 1.7 : 0.8;
    drone.antenna.material.color.set(scan || nearScan ? '#ff8f79' : '#81eaff');
    drone.beam.visible = scan;
    drone.line.visible = scan;
    drone.footprint.visible = scan;
    if (scan) {
      source.set(drone.root.position.x - 0.32, drone.root.position.y - 0.09, drone.root.position.z + 0.24);
      target.set(mix(-1.1, 1.1, clamp(state.scan.progress || 0, 0, 1)), 0.07, 1.22);
      direction.copy(source).sub(target);
      const beamLength = direction.length();
      drone.beam.position.copy(source).add(target).multiplyScalar(0.5);
      drone.beam.quaternion.setFromUnitVectors(UP, direction.normalize());
      drone.beam.scale.set(0.8, beamLength, 0.8);
      drone.beam.material.opacity = 0.105 + suspicion * 0.04;
      drone.linePositions.set([source.x, source.y, source.z, target.x, target.y, target.z]);
      drone.line.geometry.attributes.position.needsUpdate = true;
      drone.line.material.opacity = 0.58;
      drone.footprint.position.copy(target); drone.footprint.material.opacity = 0.74;
    }
    wave.root.visible = changeActive && !reducedMotion;
    wave.ring.visible = changeActive;
    if (changeActive) {
      wave.root.position.x = mix(-4.6, 4.6, changeProgress);
      const opacity = Math.sin(changeProgress * Math.PI);
      wave.material.opacity = opacity * 0.15;
      wave.outline.material.opacity = opacity * 0.7;
      wave.particles.material.opacity = opacity * 0.75;
      wave.ring.scale.setScalar(1 + changeProgress * 6.5); wave.ring.material.opacity = (1 - changeProgress) * 0.65;
      for (let i = 0; i < 36; i += 1) {
        dummy.position.set(Math.sin(i * 7.13) * 0.14, 0.15 + ((i * 0.371 + changeProgress * 0.6) % 1) * 3.8, -3.6 + ((i * 0.618) % 1) * 6.2);
        dummy.quaternion.identity(); dummy.scale.setScalar(0.6 + (i % 4) * 0.45); dummy.updateMatrix();
        wave.particles.setMatrixAt(i, dummy.matrix);
      }
      wave.particles.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    for (const texture of textures) texture.dispose();
    for (const geometryItem of geometries) geometryItem.dispose();
    for (const material of materials) material.dispose();
    renderer.dispose();
  }

  resize(canvas.clientWidth || 800, canvas.clientHeight || 650);
  return { render, resize, dispose, renderer };
}
