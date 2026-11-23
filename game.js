import * as THREE from 'three';

// ══════════════════════════════════════════════════════════════
// 1. CONFIG + STATE
// ══════════════════════════════════════════════════════════════
const CONFIG = {
  worldSize: 1200,
  blocksN: 10,
  blockSize: 120,
  sidewalkSize: 100,
  npcCount: 30,
  buildingMinH: 15,
  buildingMaxH: 40,
  accel: 16,
  reverseForce: 8,
};

const UPGRADES = {
  engine:   { name: 'Двигатель',     maxLevel: 5, cost: [100, 250, 500, 1000, 2000], effect: [60, 75, 90, 110, 130, 160] },
  handling: { name: 'Управляемость', maxLevel: 5, cost: [80, 200, 450, 900, 1800],  effect: [2.0, 2.3, 2.6, 2.9, 3.3, 3.8] },
  brakes:   { name: 'Тормоза',       maxLevel: 5, cost: [60, 150, 350, 700, 1500],  effect: [25, 30, 35, 42, 50, 60] },
};

const state = {
  score: 0,
  upgrades: { engine: 0, handling: 0, brakes: 0 },
  settings: { volume: 50, quality: 'med' },
  screen: 'menu',
  paused: true,
};

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem('kopeika_save') || '{}');
    Object.assign(state.upgrades, s.upgrades || {});
    Object.assign(state.settings, s.settings || {});
    state.score = s.score || 0;
  } catch (e) {}
}
function saveProgress() {
  localStorage.setItem('kopeika_save', JSON.stringify({
    upgrades: state.upgrades, settings: state.settings, score: state.score,
  }));
}
loadSave();

// ══════════════════════════════════════════════════════════════
// 2. THREE SETUP
// ══════════════════════════════════════════════════════════════
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9a9a94);
scene.fog = new THREE.FogExp2(0x9a9a94, 0.0055);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(12, 6, 8);
camera.lookAt(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xc8c8c0, 0x4a4a44, 0.9));

const sun = new THREE.DirectionalLight(0xffe8c0, 1.3);
sun.position.set(60, 120, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);

const colliders = [];
const keys = {};

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ══════════════════════════════════════════════════════════════
// 3. ASSETS — процедурные текстуры
// ══════════════════════════════════════════════════════════════
function makeWorldTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 2048;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3a38'; ctx.fillRect(0, 0, 2048, 2048);
  for (let i = 0; i < 40000; i++) {
    const v = 30 + Math.random() * 30;
    ctx.fillStyle = `rgba(${v},${v},${v - 3},0.2)`;
    ctx.fillRect(Math.random() * 2048, Math.random() * 2048, 1.5, 1.5);
  }
  const step = 2048 / 10;
  ctx.fillStyle = '#4a4a46';
  for (let i = 1; i < 10; i++) {
    ctx.fillRect(i * step - step * 0.17, 0, step * 0.34, 2048);
    ctx.fillRect(0, i * step - step * 0.17, 2048, step * 0.34);
  }
  ctx.strokeStyle = '#c8a838'; ctx.lineWidth = 3;
  ctx.setLineDash([16, 20]);
  for (let i = 1; i < 10; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, 2048); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(2048, i * step); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(Math.random() * 2048, Math.random() * 2048, Math.random() * 8 + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

function makeBuildingTexture(w = 8, h = 10) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a8a82'; ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 3000; i++) {
    const v = 100 + Math.random() * 60;
    ctx.fillStyle = `rgba(${v},${v},${v - 5},0.2)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 512, 3, 3);
  }
  ctx.strokeStyle = 'rgba(40,40,40,0.6)'; ctx.lineWidth = 2;
  for (let y = 0; y < h; y++) {
    const py = y * (512 / h);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(256, py); ctx.stroke();
  }
  for (let x = 0; x < w; x++) {
    const px = x * (256 / w);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, 512); ctx.stroke();
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x * (256 / w) + (256 / w) * 0.2;
      const py = y * (512 / h) + (512 / h) * 0.25;
      const pw = (256 / w) * 0.6, ph = (512 / h) * 0.5;
      ctx.fillStyle = Math.random() > 0.75 ? '#e0c890' : '#2a2a30';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
      ctx.strokeRect(px, py, pw, ph);
    }
  }
  return new THREE.CanvasTexture(c);
}

function makeSidewalkTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a7a72'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2000; i++) {
    const v = 100 + Math.random() * 30;
    ctx.fillStyle = `rgba(${v},${v},${v - 5},0.3)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  return t;
}

// ══════════════════════════════════════════════════════════════
// 4. CITY BUILDER
// ══════════════════════════════════════════════════════════════
function buildCity() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize),
    new THREE.MeshStandardMaterial({ map: makeWorldTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sidewalkMat = new THREE.MeshStandardMaterial({ map: makeSidewalkTexture(), roughness: 1 });
  const buildingMats = [];
  for (let i = 0; i < 6; i++) {
    buildingMats.push(new THREE.MeshStandardMaterial({
      map: makeBuildingTexture(5 + (i % 4), 8 + (i % 5)),
      color: new THREE.Color().setHSL(0.08, 0.06, 0.55 + Math.random() * 0.15),
      roughness: 0.9,
    }));
  }

  for (let i = 0; i < CONFIG.blocksN; i++) {
    for (let j = 0; j < CONFIG.blocksN; j++) {
      const cx = (i - (CONFIG.blocksN - 1) / 2) * CONFIG.blockSize;
      const cz = (j - (CONFIG.blocksN - 1) / 2) * CONFIG.blockSize;

      const sw = new THREE.Mesh(
        new THREE.BoxGeometry(CONFIG.sidewalkSize, 0.3, CONFIG.sidewalkSize), sidewalkMat);
      sw.position.set(cx, 0.15, cz);
      sw.receiveShadow = true;
      scene.add(sw);

      const nB = Math.random() < 0.6 ? 1 : 2;
      for (let k = 0; k < nB; k++) {
        const bw = 25 + Math.random() * 30;
        const bd = 25 + Math.random() * 30;
        const bh = CONFIG.buildingMinH + Math.random() * (CONFIG.buildingMaxH - CONFIG.buildingMinH);
        const px = cx + (Math.random() - 0.5) * (CONFIG.sidewalkSize - bw - 5);
        const pz = cz + (Math.random() - 0.5) * (CONFIG.sidewalkSize - bd - 5);

        const b = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, bd),
          buildingMats[Math.floor(Math.random() * buildingMats.length)]
        );
        b.position.set(px, bh / 2 + 0.3, pz);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        colliders.push({ x: px, z: pz, w: bw, d: bd });
      }
    }
  }

  for (let i = 0; i < 40; i++) addStreetLight(
    (Math.random() - 0.5) * (CONFIG.worldSize - 100),
    (Math.random() - 0.5) * (CONFIG.worldSize - 100));
  for (let i = 0; i < 60; i++) addTree(
    (Math.random() - 0.5) * (CONFIG.worldSize - 100),
    (Math.random() - 0.5) * (CONFIG.worldSize - 100));
}

function addStreetLight(x, z) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x333330 })
  );
  pole.position.set(x, 3.5, z);
  pole.castShadow = true;
  scene.add(pole);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffeebb, emissive: 0xffaa44, emissiveIntensity: 1.6 })
  );
  lamp.position.set(x, 7, z);
  scene.add(lamp);
}

function addTree(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a3520 })
  );
  trunk.position.set(x, 1.5, z);
  trunk.castShadow = true;
  scene.add(trunk);
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(2, 6, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a4a1a, roughness: 1 })
  );
  crown.position.set(x, 4, z);
  crown.castShadow = true;
  scene.add(crown);
}

// ══════════════════════════════════════════════════════════════
// 5. CAR BUILDER — ВАЗ-2101
// ══════════════════════════════════════════════════════════════
function buildCar() {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a3d6b, metalness: 0.65, roughness: 0.35 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 1, roughness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, transparent: true, opacity: 0.55, metalness: 0.3, roughness: 0.1 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.9 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffcc44, emissiveIntensity: 1.4 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0x550000 });
  const interiorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 4.1), bodyMat);
  lower.position.y = 0.6; lower.castShadow = true; car.add(lower);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 1.3), bodyMat);
  hood.position.set(0, 0.9, 1.35); hood.castShadow = true; car.add(hood);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 1.1), bodyMat);
  trunk.position.set(0, 0.9, -1.45); trunk.castShadow = true; car.add(trunk);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.0), bodyMat);
  cabin.position.set(0, 1.12, -0.05); cabin.castShadow = true; car.add(cabin);

  const ws = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.04), glassMat);
  ws.position.set(0, 1.1, 0.98); ws.rotation.x = -0.35; car.add(ws);

  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.04), glassMat);
  rw.position.set(0, 1.1, -1.05); rw.rotation.x = 0.35; car.add(rw);

  const swL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 1.7), glassMat);
  swL.position.set(0.76, 1.15, -0.05); car.add(swL);
  const swR = swL.clone(); swR.position.x = -0.76; car.add(swR);

  // белая диагональная полоса на капоте
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 2.2), stripeMat);
  stripe.position.set(0, 0.945, 1.35); stripe.rotation.y = Math.PI / 5; car.add(stripe);

  for (const side of [-1, 1]) {
    const hlRing = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), chromeMat);
    hlRing.rotation.x = Math.PI / 2;
    hlRing.position.set(side * 0.55, 0.78, 2.02); car.add(hlRing);
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.07, 16), lightMat);
    hl.rotation.x = Math.PI / 2;
    hl.position.set(side * 0.55, 0.78, 2.04); car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), tailMat);
    tl.position.set(side * 0.55, 0.78, -2.06); car.add(tl);
  }

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.04), chromeMat);
  grille.position.set(0, 0.62, 2.06); car.add(grille);

  for (const z of [2.1, -2.1]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.1), chromeMat);
    bumper.position.set(0, 0.45, z); car.add(bumper);
  }

  for (const side of [-1, 1]) {
    const mold = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 3.2), chromeMat);
    mold.position.set(side * 0.81, 0.7, 0); car.add(mold);
  }

  const wheels = [];
  const makeWheel = () => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 18), tireMat);
    tire.rotation.z = Math.PI / 2; w.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.24, 8), chromeMat);
    rim.rotation.z = Math.PI / 2; w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 8), chromeMat);
    hub.rotation.z = Math.PI / 2; w.add(hub);
    return w;
  };
  for (const [x, y, z] of [[0.85, 0.34, 1.35], [-0.85, 0.34, 1.35], [0.85, 0.34, -1.35], [-0.85, 0.34, -1.35]]) {
    const w = makeWheel();
    w.position.set(x, y, z); w.castShadow = true; car.add(w); wheels.push(w);
  }

  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 6, 12), interiorMat);
  steering.position.set(-0.4, 1.05, 0.5); steering.rotation.x = Math.PI / 3; car.add(steering);

  car.userData.wheels = wheels;
  return car;
}

// ══════════════════════════════════════════════════════════════
// 6. NPC — БАБУШКИ
// ══════════════════════════════════════════════════════════════
const npcs = [];

class Babushka {
  constructor(x, z) {
    this.group = new THREE.Group();
    const colors = [0x553333, 0x334455, 0x443355, 0x555533, 0x663333, 0x445544];
    const col = colors[Math.floor(Math.random() * colors.length)];

    const dress = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.45, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 })
    );
    dress.position.y = 0.55; dress.castShadow = true; this.group.add(dress);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xddb090 })
    );
    head.position.y = 1.3; this.group.add(head);

    const scarf = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xaa3333, roughness: 0.9 })
    );
    scarf.position.y = 1.32; this.group.add(scarf);

    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4),
      new THREE.MeshStandardMaterial({ color: 0x5a3a20 })
    );
    stick.position.set(0.32, 0.5, 0.1); this.group.add(stick);

    this.pos = new THREE.Vector3(x, 0, z);
    this.target = this.pickTarget(x, z);
    this.alive = true;
    this.respawnTimer = 0;
    this.speed = 1.0 + Math.random() * 0.5;
    this.bobPhase = Math.random() * Math.PI * 2;

    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  pickTarget(x, z) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 15 + Math.random() * 30;
    return new THREE.Vector3(x + Math.cos(angle) * dist, 0, z + Math.sin(angle) * dist);
  }

  update(dt) {
    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }
    const dir = this.target.clone().sub(this.pos); dir.y = 0;
    if (dir.length() < 1) {
      this.target = this.pickTarget(this.pos.x, this.pos.z);
    } else {
      dir.normalize();
      this.pos.addScaledVector(dir, this.speed * dt);
      this.group.rotation.y = Math.atan2(dir.x, dir.z);
    }
    this.bobPhase += dt * 8;
    this.group.position.set(this.pos.x, Math.abs(Math.sin(this.bobPhase)) * 0.06, this.pos.z);
    this.group.rotation.z = Math.sin(this.bobPhase) * 0.05;
  }

  respawn() {
    this.alive = true;
    this.pos.set((Math.random() - 0.5) * 400, 0, (Math.random() - 0.5) * 400);
    this.target = this.pickTarget(this.pos.x, this.pos.z);
    this.group.visible = true;
    this.group.rotation.set(0, 0, 0);
    this.group.position.copy(this.pos);
  }

  hit() {
    if (!this.alive) return false;
    this.alive = false;
    this.respawnTimer = 10;
    this.group.visible = false;
    return true;
  }
}

function buildNPCs() {
  for (let i = 0; i < CONFIG.npcCount; i++) {
    npcs.push(new Babushka((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400));
  }
}

// ══════════════════════════════════════════════════════════════
// 7. CAR PHYSICS
// ══════════════════════════════════════════════════════════════
const car = {
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(0, 0, 0),
  heading: 0,
  wheelSpin: 0,
};

let carMesh = null;
let camMode = 0;

const getMaxSpeed   = () => UPGRADES.engine.effect[state.upgrades.engine] / 3.6;
const getSteerRate  = () => UPGRADES.handling.effect[state.upgrades.handling];
const getBrakeForce = () => UPGRADES.brakes.effect[state.upgrades.brakes];

function updateCar(dt) {
  const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const right = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));

  let vFwd = car.vel.dot(fwd);
  let vRight = car.vel.dot(right);

  const accelInput = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const steerInput = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const handbrake = !!keys.Space;
  const nitro = (keys.ShiftLeft || keys.ShiftRight) && vFwd > 0;

  if (accelInput > 0 && !handbrake) {
    vFwd += CONFIG.accel * (nitro ? 1.8 : 1) * dt;
  } else if (accelInput < 0) {
    if (vFwd > 0.5) vFwd -= getBrakeForce() * dt;
    else vFwd -= CONFIG.reverseForce * dt;
  }

  vFwd *= Math.pow(0.995, dt * 60);
  if (Math.abs(vFwd) < 0.05 && accelInput === 0) vFwd = 0;
  vRight *= Math.pow(handbrake ? 0.97 : 0.82, dt * 60);

  if (Math.abs(vFwd) > 0.5) {
    const speedFactor = Math.min(Math.abs(vFwd) / 8, 1);
    car.heading += steerInput * getSteerRate() * speedFactor * Math.sign(vFwd) * dt;
  }

  const maxSpd = getMaxSpeed() * (nitro ? 1.3 : 1);
  const total = Math.hypot(vFwd, vRight);
  if (total > maxSpd) { const k = maxSpd / total; vFwd *= k; vRight *= k; }

  const newFwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  const newRight = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  car.vel.copy(newFwd).multiplyScalar(vFwd).addScaledVector(newRight, vRight);
  car.pos.addScaledVector(car.vel, dt);

  const b = CONFIG.worldSize / 2 - 10;
  car.pos.x = Math.max(-b, Math.min(b, car.pos.x));
  car.pos.z = Math.max(-b, Math.min(b, car.pos.z));

  for (const c of colliders) {
    const dx = car.pos.x - c.x, dz = car.pos.z - c.z;
    const ovX = (c.w / 2 + 1.2) - Math.abs(dx);
    const ovZ = (c.d / 2 + 1.2) - Math.abs(dz);
    if (ovX > 0 && ovZ > 0) {
      if (ovX < ovZ) {
        car.pos.x = c.x + Math.sign(dx) * (c.w / 2 + 1.2);
        car.vel.x *= -0.3; car.vel.z *= 0.7;
      } else {
        car.pos.z = c.z + Math.sign(dz) * (c.d / 2 + 1.2);
        car.vel.z *= -0.3; car.vel.x *= 0.7;
      }
    }
  }

  for (const npc of npcs) {
    if (!npc.alive) continue;
    if (npc.pos.distanceTo(car.pos) < 1.8 && car.vel.length() > 4) {
      if (npc.hit()) { state.score += 50; playHitSound(); }
    }
  }

  if (Math.abs(vRight) > 3 && Math.abs(vFwd) > 5) state.score += 1 * dt;

  if (carMesh) {
    carMesh.position.copy(car.pos);
    carMesh.rotation.y = car.heading;
    carMesh.rotation.z = -vRight * 0.005;
    carMesh.rotation.x = -vFwd * 0.002;
    car.wheelSpin += vFwd * dt * 2;
    const w = carMesh.userData.wheels;
    w[0].rotation.x = w[1].rotation.x = w[2].rotation.x = w[3].rotation.x = car.wheelSpin;
    const steerVis = steerInput * 0.4;
    w[0].rotation.y = w[1].rotation.y = steerVis;
  }

  updateAudio(vFwd);
}

function updateCamera(dt) {
  const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  let targetPos, lookAt;
  if (camMode === 0) {
    targetPos = car.pos.clone().sub(fwd.clone().multiplyScalar(11)).add(new THREE.Vector3(0, 6, 0));
    lookAt = car.pos.clone().add(fwd.clone().multiplyScalar(5)).add(new THREE.Vector3(0, 1.5, 0));
  } else if (camMode === 1) {
    targetPos = car.pos.clone().add(fwd.clone().multiplyScalar(1)).add(new THREE.Vector3(0, 1.8, 0));
    lookAt = car.pos.clone().add(fwd.clone().multiplyScalar(20)).add(new THREE.Vector3(0, 1.5, 0));
  } else {
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    targetPos = car.pos.clone().add(side.clone().multiplyScalar(9)).add(new THREE.Vector3(0, 4, 0));
    lookAt = car.pos.clone();
  }
  camera.position.lerp(targetPos, 1 - Math.pow(0.001, dt));
  camera.lookAt(lookAt);
}

// ══════════════════════════════════════════════════════════════
// 8. AUDIO
// ══════════════════════════════════════════════════════════════
let audioCtx = null, engineOsc = null, engineGain = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  engineOsc = audioCtx.createOscillator();
  engineOsc.type = 'sawtooth';
  engineOsc.frequency.value = 50;
  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 400;
  engineOsc.connect(filter).connect(engineGain).connect(audioCtx.destination);
  engineOsc.start();
}

function updateAudio(speed) {
  if (!audioCtx) return;
  const vol = state.settings.volume / 100;
  engineOsc.frequency.setTargetAtTime(45 + Math.abs(speed) * 6, audioCtx.currentTime, 0.1);
  engineGain.gain.setTargetAtTime(Math.min(Math.abs(speed) / 30, 0.12) * vol, audioCtx.currentTime, 0.1);
}

function playHitSound() {
  if (!audioCtx) return;
  const vol = state.settings.volume / 100;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square';
  o.frequency.value = 400;
  o.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.2);
  g.gain.value = 0.2 * vol;
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.25);
}

// ══════════════════════════════════════════════════════════════
// 9. UI
// ══════════════════════════════════════════════════════════════
const ui = {
  menu: document.getElementById('menu'),
  upgradeScreen: document.getElementById('upgradeScreen'),
  settingsScreen: document.getElementById('settingsScreen'),
  hud: document.getElementById('hud'),
  scoreVal: document.getElementById('scoreVal'),
  speedVal: document.getElementById('speedVal'),
  upgScore: document.getElementById('upgScore'),
  upgradeList: document.getElementById('upgradeList'),
};

function showScreen(name) {
  ui.menu.classList.add('hidden');
  ui.upgradeScreen.classList.add('hidden');
  ui.settingsScreen.classList.add('hidden');
  ui.hud.style.display = 'none';

  if (name === 'menu') { ui.menu.classList.remove('hidden'); state.paused = true; }
  else if (name === 'upgrade') { ui.upgradeScreen.classList.remove('hidden'); renderUpgrades(); state.paused = true; }
  else if (name === 'settings') { ui.settingsScreen.classList.remove('hidden'); state.paused = true; }
  else if (name === 'game') { ui.hud.style.display = 'block'; state.paused = false; }
  state.screen = name;
}

function updateHUD() {
  ui.scoreVal.textContent = Math.floor(state.score);
  ui.speedVal.textContent = Math.round(car.vel.length() * 3.6);
}

function renderUpgrades() {
  ui.upgScore.textContent = Math.floor(state.score);
  ui.upgradeList.innerHTML = '';
  for (const key in UPGRADES) {
    const up = UPGRADES[key];
    const lvl = state.upgrades[key];
    const row = document.createElement('div');
    row.className = 'upgrade-row';
    let btn;
    if (lvl >= up.maxLevel) btn = `<button disabled>MAX</button>`;
    else {
      const cost = up.cost[lvl];
      btn = `<button data-key="${key}" ${state.score >= cost ? '' : 'disabled'}>Купить (${cost})</button>`;
    }
    row.innerHTML = `<div><b>${up.name}</b><br><small>Уровень ${lvl}/${up.maxLevel} · Значение: ${up.effect[lvl]}</small></div>${btn}`;
    ui.upgradeList.appendChild(row);
  }
  ui.upgradeList.querySelectorAll('button[data-key]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.key, up = UPGRADES[key], lvl = state.upgrades[key];
      if (lvl >= up.maxLevel || state.score < up.cost[lvl]) return;
      state.score -= up.cost[lvl];
      state.upgrades[key] = lvl + 1;
      saveProgress();
      renderUpgrades();
      updateHUD();
    };
  });
}

function applyQuality() {
  const q = state.settings.quality;
  const shadows = q !== 'low';
  renderer.shadowMap.enabled = shadows;
  sun.castShadow = shadows;
  renderer.setPixelRatio(q === 'low' ? 1 : q === 'med' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 2));
}

function initUI() {
  document.getElementById('btn-play').onclick = () => { initAudio(); showScreen('game'); };
  document.getElementById('btn-upgrade').onclick = () => showScreen('upgrade');
  document.getElementById('btn-settings').onclick = () => showScreen('settings');
  document.getElementById('btn-upgrade-back').onclick = () => showScreen('menu');
  document.getElementById('btn-settings-back').onclick = () => showScreen('menu');

  document.getElementById('setVolume').value = state.settings.volume;
  document.getElementById('setVolume').oninput = e => { state.settings.volume = +e.target.value; saveProgress(); };
  document.getElementById('setQuality').value = state.settings.quality;
  document.getElementById('setQuality').onchange = e => { state.settings.quality = e.target.value; applyQuality(); saveProgress(); };
}

// ══════════════════════════════════════════════════════════════
// 10. INPUT
// ══════════════════════════════════════════════════════════════
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') {
    if (state.screen === 'game') showScreen('menu');
    else if (state.screen === 'upgrade' || state.screen === 'settings') showScreen('menu');
  }
  if (e.code === 'KeyC' && state.screen === 'game') camMode = (camMode + 1) % 3;
});
addEventListener('keyup', e => { keys[e.code] = false; });

// ══════════════════════════════════════════════════════════════
// 11. INIT WORLD
// ══════════════════════════════════════════════════════════════
buildCity();
buildNPCs();
carMesh = buildCar();
scene.add(carMesh);
carMesh.position.copy(car.pos);
initUI();
applyQuality();

// ══════════════════════════════════════════════════════════════
// 12. GAME LOOP
// ══════════════════════════════════════════════════════════════
let lastTime = performance.now();
let hudTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  sun.position.copy(car.pos).add(new THREE.Vector3(60, 120, 30));
  sun.target.position.copy(car.pos);

  if (state.screen === 'game') {
    updateCar(dt);
    for (const n of npcs) n.update(dt);
    updateCamera(dt);

    hudTimer += dt;
    if (hudTimer > 0.2) { updateHUD(); hudTimer = 0; }
  } else if (state.screen === 'menu') {
    const t = now * 0.00025;
    camera.position.set(Math.cos(t) * 13, 4.5, Math.sin(t) * 13);
    camera.lookAt(0, 1, 0);
  }

  renderer.render(scene, camera);
}

showScreen('menu');
animate();

console.log('%c🚗 Симулятор Копейки загружен!', 'color:#d88b4a;font-size:16px;font-weight:bold');