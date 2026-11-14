/**
 * d20-roller.js — Issue #25: 3D Physics d20 Dice Tray (Three.js + cannon-es)
 * Mounts on Performance Check modal open, rolls a real 20-sided gold icosahedron
 * inside a dark green tavern felt & walnut tray, reads the actual top face on settle,
 * and disposes cleanly on modal close.
 */
const THREE = require('three');
const CANNON = require('cannon-es');

/**
 * Create a 5x4 texture atlas containing numbered gold equilateral-triangle faces (1..20).
 */
function createD20AtlasTexture() {
  const cols = 5;
  const rows = 4;
  const cellSize = 200;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < 20; i++) {
    const num = i + 1;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = col * cellSize + cellSize / 2;
    const cy = row * cellSize + cellSize / 2;

    // Gold metallic gradient per cell
    const grad = ctx.createRadialGradient(cx, cy - 12, 8, cx, cy, cellSize * 0.55);
    grad.addColorStop(0, '#ffe875');
    grad.addColorStop(0.55, '#d4af37');
    grad.addColorStop(1, '#8a6412');
    ctx.fillStyle = grad;
    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);

    // Subtle inner bevel ring
    ctx.strokeStyle = 'rgba(255, 245, 200, 0.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy + 8, cellSize * 0.28, 0, Math.PI * 2);
    ctx.stroke();

    // Engraved dark obsidian number
    ctx.fillStyle = num === 20 ? '#1b0f00' : num === 1 ? '#5c0a0a' : '#1c1208';
    ctx.font = 'bold 56px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), cx, cy + 8);

    // Underline 6 and 9 for readability
    if (num === 6 || num === 9) {
      ctx.fillRect(cx - 16, cy + 36, 32, 4);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Build Three.js IcosahedronGeometry with custom 5x4 atlas UVs and paired opposite face numbers (sum = 21),
 * plus matching Cannon-es ConvexPolyhedron shape and local face normals.
 */
function buildD20GeometryAndPhysics(radius = 0.85) {
  const geom = new THREE.IcosahedronGeometry(radius, 0); // non-indexed: 60 vertices, 20 faces
  const posAttr = geom.getAttribute('position');
  const uvArray = new Float32Array(posAttr.count * 2);

  const faceNormals = [];
  const faceCentroids = [];
  for (let f = 0; f < 20; f++) {
    const i0 = f * 3;
    const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0);
    const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 1);
    const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 2);
    const n = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize();
    const c = new THREE.Vector3().add(v0).add(v1).add(v2).divideScalar(3);
    if (n.dot(c) < 0) n.negate();
    faceNormals.push(n);
    faceCentroids.push(c);
  }

  // Pair opposite faces so opposite numbers sum to 21
  const faceValues = new Array(20).fill(0);
  let lowVal = 1;
  for (let f = 0; f < 20; f++) {
    if (faceValues[f] !== 0) continue;
    let opp = -1;
    let minDot = 1;
    for (let j = 0; j < 20; j++) {
      if (j === f || faceValues[j] !== 0) continue;
      const d = faceNormals[f].dot(faceNormals[j]);
      if (d < minDot) {
        minDot = d;
        opp = j;
      }
    }
    faceValues[f] = lowVal;
    if (opp !== -1) {
      faceValues[opp] = 21 - lowVal;
    }
    lowVal++;
  }

  // Map each triangle into its corresponding 5x4 atlas cell
  const cols = 5;
  const rows = 4;
  for (let f = 0; f < 20; f++) {
    const valIdx = faceValues[f] - 1; // 0..19
    const col = valIdx % cols;
    const row = Math.floor(valIdx / cols);
    const u0 = col / cols;
    const vTop = 1 - row / rows;
    const cellU = 1 / cols;
    const cellV = 1 / rows;

    const i0 = f * 3;
    const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0);
    const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 1);
    const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 2);
    const n = faceNormals[f];
    const c = faceCentroids[f];

    // Local 2D orthonormal basis on the face plane
    const refUp = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(refUp, n).normalize();
    const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize();

    const verts = [v0, v1, v2];
    const scale = 0.34 / radius;
    for (let k = 0; k < 3; k++) {
      const rel = new THREE.Vector3().subVectors(verts[k], c);
      const lx = rel.dot(tangent) * scale;
      const ly = rel.dot(bitangent) * scale;
      const u = u0 + (0.5 + lx) * cellU;
      const v = vTop - (0.54 - ly) * cellV;
      uvArray[(i0 + k) * 2] = u;
      uvArray[(i0 + k) * 2 + 1] = v;
    }
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));

  // Build deduplicated vertices & faces for CANNON.ConvexPolyhedron
  const uniqueVerts = [];
  const cannonVerts = [];
  const cannonFaces = [];

  function findOrAddVert(vec) {
    for (let i = 0; i < uniqueVerts.length; i++) {
      if (uniqueVerts[i].distanceToSquared(vec) < 1e-6) {
        return i;
      }
    }
    uniqueVerts.push(vec.clone());
    cannonVerts.push(new CANNON.Vec3(vec.x, vec.y, vec.z));
    return uniqueVerts.length - 1;
  }

  for (let f = 0; f < 20; f++) {
    const i0 = f * 3;
    const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0);
    const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 1);
    const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i0 + 2);
    const idx0 = findOrAddVert(v0);
    const idx1 = findOrAddVert(v1);
    const idx2 = findOrAddVert(v2);

    const e1 = new THREE.Vector3().subVectors(v1, v0);
    const e2 = new THREE.Vector3().subVectors(v2, v0);
    const triNormal = new THREE.Vector3().crossVectors(e1, e2);
    if (triNormal.dot(faceCentroids[f]) < 0) {
      cannonFaces.push([idx0, idx2, idx1]);
    } else {
      cannonFaces.push([idx0, idx1, idx2]);
    }
  }

  const shape = new CANNON.ConvexPolyhedron({
    vertices: cannonVerts,
    faces: cannonFaces
  });

  const cannonNormals = faceNormals.map((n) => new CANNON.Vec3(n.x, n.y, n.z));

  return { geom, shape, cannonNormals, faceValues };
}

function createD20TrayRoller(containerEl, { onBounce, onSettled, reducedMotion = false } = {}) {
  const triggerCpuFallback = () => {
    const face = Math.floor(Math.random() * 20) + 1;
    if (typeof onSettled === 'function') {
      onSettled(face);
    }
    return {
      fastSettle: () => face,
      dispose: () => {},
      isSettled: () => true,
      isFallback: true
    };
  };

  if (reducedMotion || !containerEl) {
    return triggerCpuFallback();
  }

  const width = Math.max(320, containerEl.clientWidth || 520);
  const height = Math.max(240, containerEl.clientHeight || 380);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return triggerCpuFallback();
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
  camera.position.set(0, 10.8, 3.8);
  camera.lookAt(0, 0.3, 0);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  containerEl.appendChild(renderer.domElement);

  // Warm tavern lighting
  const ambientLight = new THREE.AmbientLight(0xfff1d0, 0.85);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffdf8e, 1.55);
  keyLight.position.set(4, 11, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 512;
  keyLight.shadow.mapSize.height = 512;
  keyLight.shadow.camera.near = 2;
  keyLight.shadow.camera.far = 22;
  keyLight.shadow.camera.left = -5;
  keyLight.shadow.camera.right = 5;
  keyLight.shadow.camera.top = 5;
  keyLight.shadow.camera.bottom = -5;
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(0x36d399, 0.45, 18);
  rimLight.position.set(-4, 4, -3);
  scene.add(rimLight);

  // Dark green felt floor + walnut wood walls
  const trayHalfW = 3.4;
  const trayHalfD = 2.15;
  const feltGeo = new THREE.PlaneGeometry(trayHalfW * 2, trayHalfD * 2);
  const feltMat = new THREE.MeshStandardMaterial({
    color: 0x0f2419,
    roughness: 0.92,
    metalness: 0.05
  });
  const feltMesh = new THREE.Mesh(feltGeo, feltMat);
  feltMesh.rotation.x = -Math.PI / 2;
  feltMesh.receiveShadow = true;
  scene.add(feltMesh);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2b1a10,
    roughness: 0.72,
    metalness: 0.15
  });
  const wallHeight = 1.2;
  const wallThick = 0.25;
  const wallSpecs = [
    [0, wallHeight / 2, -trayHalfD - wallThick / 2, trayHalfW * 2 + wallThick * 2, wallHeight, wallThick],
    [0, wallHeight / 2, trayHalfD + wallThick / 2, trayHalfW * 2 + wallThick * 2, wallHeight, wallThick],
    [-trayHalfW - wallThick / 2, wallHeight / 2, 0, wallThick, wallHeight, trayHalfD * 2],
    [trayHalfW + wallThick / 2, wallHeight / 2, 0, wallThick, wallHeight, trayHalfD * 2]
  ];
  const wallMeshes = [];
  for (const [wx, wy, wz, ww, wh, wd] of wallSpecs) {
    const wGeo = new THREE.BoxGeometry(ww, wh, wd);
    const wMesh = new THREE.Mesh(wGeo, wallMat);
    wMesh.position.set(wx, wy, wz);
    wMesh.receiveShadow = true;
    scene.add(wMesh);
    wallMeshes.push(wMesh);
  }

  // d20 Mesh
  const { geom: dieGeo, shape: dieShape, cannonNormals, faceValues } = buildD20GeometryAndPhysics(0.82);
  const atlasTex = createD20AtlasTexture();
  const dieMat = new THREE.MeshStandardMaterial({
    map: atlasTex,
    roughness: 0.28,
    metalness: 0.65
  });
  const dieMesh = new THREE.Mesh(dieGeo, dieMat);
  dieMesh.castShadow = true;
  scene.add(dieMesh);

  // Cannon-es Physics World
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -28, 0)
  });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;

  const trayPhysMat = new CANNON.Material('tray');
  const diePhysMat = new CANNON.Material('die');
  world.addContactMaterial(
    new CANNON.ContactMaterial(trayPhysMat, diePhysMat, {
      friction: 0.36,
      restitution: 0.44
    })
  );

  // Floor body
  const floorBody = new CANNON.Body({ mass: 0, material: trayPhysMat });
  floorBody.addShape(new CANNON.Plane());
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floorBody);

  // 4 Invisible/Wood wall bodies + ceiling so die never escapes
  for (const [wx, wy, wz, ww, wh, wd] of wallSpecs) {
    const wallBody = new CANNON.Body({ mass: 0, material: trayPhysMat });
    wallBody.addShape(new CANNON.Box(new CANNON.Vec3(ww / 2, 4, wd / 2)));
    wallBody.position.set(wx, 4, wz);
    world.addBody(wallBody);
  }

  // Die body with random toss velocity & spin
  const dieBody = new CANNON.Body({
    mass: 1,
    material: diePhysMat,
    linearDamping: 0.14,
    angularDamping: 0.16,
    sleepSpeedLimit: 0.15,
    sleepTimeLimit: 0.4
  });
  dieBody.addShape(dieShape);

  const startSide = Math.random() < 0.5 ? -1 : 1;
  dieBody.position.set(startSide * (1.8 + Math.random() * 0.7), 3.6 + Math.random() * 0.7, (Math.random() - 0.5) * 1.4);
  dieBody.velocity.set(-startSide * (4.2 + Math.random() * 2.5), -1.5 - Math.random() * 1.5, (Math.random() - 0.5) * 3.6);
  dieBody.angularVelocity.set(
    (Math.random() - 0.5) * 26,
    (Math.random() - 0.5) * 26,
    (Math.random() - 0.5) * 26
  );
  dieBody.quaternion.setFromEuler(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  );
  world.addBody(dieBody);

  let lastBounceAtMs = 0;
  let settled = false;
  let disposed = false;
  let rafId = null;
  let quietFrames = 0;
  let elapsedSec = 0;
  let lastFrameMs = performance.now();

  dieBody.addEventListener('collide', (event) => {
    if (disposed || settled || reducedMotion) return;
    const now = performance.now();
    if (now - lastBounceAtMs < 55) return;
    const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
    if (impact > 1.1) {
      lastBounceAtMs = now;
      if (typeof onBounce === 'function') {
        onBounce(impact);
      }
    }
  });

  function readTopFaceValue() {
    let bestFace = 0;
    let bestY = -Infinity;
    const worldN = new CANNON.Vec3();
    for (let f = 0; f < 20; f++) {
      dieBody.quaternion.vmult(cannonNormals[f], worldN);
      if (worldN.y > bestY) {
        bestY = worldN.y;
        bestFace = f;
      }
    }
    return faceValues[bestFace];
  }

  function syncMeshToBody() {
    dieMesh.position.set(dieBody.position.x, dieBody.position.y, dieBody.position.z);
    dieMesh.quaternion.set(
      dieBody.quaternion.x,
      dieBody.quaternion.y,
      dieBody.quaternion.z,
      dieBody.quaternion.w
    );
  }

  function finishSettle() {
    if (settled || disposed) return;
    settled = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    syncMeshToBody();
    renderer.render(scene, camera);
    const rolledValue = readTopFaceValue();
    if (typeof onSettled === 'function') {
      onSettled(rolledValue);
    }
  }

  function fastSettle() {
    if (settled || disposed) return;
    let steps = 0;
    let stillCount = 0;
    while (steps < 360) {
      world.step(1 / 60);
      steps++;
      const lin = dieBody.velocity.length();
      const ang = dieBody.angularVelocity.length();
      if (lin < 0.08 && ang < 0.12) {
        stillCount++;
        if (stillCount >= 10) break;
      } else {
        stillCount = 0;
      }
    }
    finishSettle();
  }

  function tick(nowMs) {
    if (disposed || settled) return;
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;
    elapsedSec += dt;

    world.step(1 / 60, dt, 3);
    syncMeshToBody();
    renderer.render(scene, camera);

    const lin = dieBody.velocity.length();
    const ang = dieBody.angularVelocity.length();
    if (dieBody.sleepState === CANNON.Body.SLEEPING || (lin < 0.08 && ang < 0.12)) {
      quietFrames++;
    } else {
      quietFrames = 0;
    }

    if (quietFrames >= 12 || elapsedSec >= 3.8) {
      finishSettle();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  if (reducedMotion) {
    fastSettle();
  } else {
    syncMeshToBody();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    dieGeo.dispose();
    dieMat.dispose();
    atlasTex.dispose();
    feltGeo.dispose();
    feltMat.dispose();
    wallMat.dispose();
    for (const wm of wallMeshes) {
      wm.geometry.dispose();
    }
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode === containerEl) {
      containerEl.removeChild(renderer.domElement);
    }
  }

  return {
    fastSettle,
    dispose,
    isSettled: () => settled
  };
}

module.exports = { createD20TrayRoller };
