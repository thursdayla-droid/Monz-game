import * as THREE from 'three';
import type { ArenaMap } from '../core/battle3d/arena';

/**
 * STREET KING の バトルステージ(2026-11-05 企画者「ステージはクロードに作ってほしい」)。
 * - ストリート: 落書き・倉庫・工業地帯・ネオン(夜)
 * - チャンピオン: 巨大な大会会場・照明・観客席(黒・紫・金)
 * 決まり(企画者): MONZ・人物は 描かない。まん中の 戦う所は 広く 空ける(直径36m・さえぎる物なし)。
 * 当たりは 草原と 同じ(丸い場所の 半径だけ)。飾りは 全部 外側。
 * iPhone の負担を へらすため: 同じ形は 使い回す(InstancedMesh)・絵は プログラムで 小さく 描く・光は 少なく
 */

export interface StageEnv {
  /** 空(上 → 地平線 → 下) */
  sky: [string, string, string, string];
  fog: number;
  fogNear: number;
  fogFar: number;
  hemi: [number, number, number];
  sun: { color: number; power: number; x: number; y: number; z: number };
  /** 晴れた空の 山と 雲(草原だけ) */
  outdoor: boolean;
  /** 遠くの 地面の色 */
  ground: number;
}

/** ステージごとの 空・光・霧【仮】 */
export const STAGE_ENV: Record<'grass' | 'temple' | 'street' | 'champion', StageEnv> = {
  grass: { sky: ['#2a7ae0', '#6ab8f5', '#cfe9ff', '#9ad07a'], fog: 0xbfe0f5, fogNear: 40, fogFar: 110, hemi: [0xdff0ff, 0x6a9a50, 1.5], sun: { color: 0xfff6e0, power: 2.6, x: -8, y: 20, z: 10 }, outdoor: true, ground: 0x6aa84a },
  temple: { sky: ['#2a7ae0', '#6ab8f5', '#cfe9ff', '#9ad07a'], fog: 0xbfe0f5, fogNear: 40, fogFar: 110, hemi: [0xdff0ff, 0x6a9a50, 1.5], sun: { color: 0xfff6e0, power: 2.6, x: -8, y: 20, z: 10 }, outdoor: true, ground: 0x6aa84a },
  // 夜の 町はずれ: むらさきの 空・地平線は ネオンの ピンク
  street: { sky: ['#0a0618', '#2a1250', '#ff5aa8', '#1a1020'], fog: 0x2a1640, fogNear: 30, fogFar: 120, hemi: [0x9a8ad8, 0x2a1a30, 1.25], sun: { color: 0xc8d0ff, power: 1.9, x: 10, y: 22, z: -6 }, outdoor: false, ground: 0x2a2630 },
  // 屋内の 大会場: 暗い 天井・照明は 上から
  champion: { sky: ['#030206', '#0c0618', '#1a0c2a', '#05030a'], fog: 0x0c0614, fogNear: 45, fogFar: 140, hemi: [0x8a70c8, 0x1a1020, 1.0], sun: { color: 0xfff0d8, power: 2.4, x: 0, y: 28, z: 4 }, outdoor: false, ground: 0x0e0a14 },
};

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rx = 1, ry = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------------- ストリート ----------------

/** アスファルト(こまかい つぶ・ひび・油の しみ) */
function asphaltTex(): THREE.CanvasTexture {
  const r = rng(3);
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#3a3640';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5000; i++) {
      const v = 40 + Math.floor(r() * 40);
      g.fillStyle = `rgba(${v},${v - 4},${v + 6},0.6)`;
      g.fillRect(r() * 512, r() * 512, 2, 2);
    }
    // 油の しみ
    for (let i = 0; i < 6; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const gr = g.createRadialGradient(x, y, 0, x, y, 30 + r() * 40);
      gr.addColorStop(0, 'rgba(10,8,16,0.55)');
      gr.addColorStop(1, 'rgba(10,8,16,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 512, 512);
    }
    // ひび
    g.strokeStyle = 'rgba(16,12,20,0.8)';
    g.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      let x = r() * 512;
      let y = r() * 512;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (r() - 0.5) * 60;
        y += (r() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, 14, 14);
}

/** 戦う所の 床の もよう(黄色い 線の 円・まん中に 王冠の 落書き) */
function streetFloorTex(): THREE.CanvasTexture {
  return canvasTex(1024, 1024, (g) => {
    g.clearRect(0, 0, 1024, 1024);
    const c = 512;
    // 外の 黄色い 線(すこし かすれた ペンキ)
    g.strokeStyle = 'rgba(255,210,58,0.85)';
    g.lineWidth = 14;
    g.setLineDash([60, 18]);
    g.beginPath();
    g.arc(c, c, 498, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(c, c, 160, 0, Math.PI * 2);
    g.stroke();
    // まん中: スプレーの 王冠(ピンクと 水色)
    const crown = (col: string, off: number, w: number) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(c - 110 + off, c + 50 + off);
      g.lineTo(c - 120 + off, c - 50 + off);
      g.lineTo(c - 55 + off, c + 5 + off);
      g.lineTo(c + off, c - 80 + off);
      g.lineTo(c + 55 + off, c + 5 + off);
      g.lineTo(c + 120 + off, c - 50 + off);
      g.lineTo(c + 110 + off, c + 50 + off);
      g.closePath();
      g.stroke();
    };
    // 小さめ・うすめ(戦う MONZ の じゃまに ならないように)
    g.save();
    g.translate(c, c);
    g.scale(0.55, 0.55);
    g.translate(-c, -c);
    crown('rgba(60,230,255,0.35)', 8, 22);
    crown('rgba(255,70,170,0.55)', 0, 16);
    g.fillStyle = 'rgba(255,70,170,0.45)';
    for (const dx of [-120, 0, 120]) {
      g.beginPath();
      g.arc(c + dx, c + (dx ? -62 : -94), 14, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // 駐車場の 白い 線(外がわ)
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 8;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 420, c + Math.sin(a) * 420);
      g.lineTo(c + Math.cos(a) * 470, c + Math.sin(a) * 470);
      g.stroke();
    }
  });
}

/** 落書きの 色 */
const SPRAY = ['#ff3aa0', '#3ae0ff', '#ffd23a', '#7aff5a', '#a05aff', '#ff7a2a'];

/** 倉庫の 壁(波板の すじ・シャッター・落書き)。seed で 落書きが ちがう */
function wallTex(seed: number, base: string): THREE.CanvasTexture {
  const r = rng(seed);
  return canvasTex(512, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 256);
    // 波板の すじ
    for (let x = 0; x < 512; x += 10) {
      g.fillStyle = x % 20 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.06)';
      g.fillRect(x, 0, 5, 256);
    }
    // シャッター
    const sx = 60 + r() * 260;
    g.fillStyle = '#4a4650';
    g.fillRect(sx, 90, 150, 166);
    for (let y = 94; y < 256; y += 9) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(sx, y, 150, 3);
    }
    // 落書き: ふくらんだ 文字の かたまり・しずく・星・矢印(字は 読めない かたち)
    for (let k = 0; k < 4; k++) {
      const cx = r() * 512;
      const cy = 120 + r() * 110;
      const col = SPRAY[Math.floor(r() * SPRAY.length)];
      const col2 = SPRAY[Math.floor(r() * SPRAY.length)];
      const w = 70 + r() * 90;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.strokeStyle = '#120a18';
      g.lineWidth = 16;
      const blob = () => {
        g.beginPath();
        for (let i = 0; i <= 5; i++) {
          const x = cx - w / 2 + (i / 5) * w;
          const y = cy + Math.sin(i * 1.7 + k) * 14;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
      };
      blob();
      g.stroke();
      g.strokeStyle = col;
      g.lineWidth = 10;
      blob();
      g.stroke();
      g.strokeStyle = col2;
      g.lineWidth = 3;
      blob();
      g.stroke();
      // しずく
      g.fillStyle = col;
      for (let i = 0; i < 4; i++) g.fillRect(cx - w / 2 + r() * w, cy + 8, 3, 10 + r() * 26);
      // 星
      if (r() < 0.6) {
        g.fillStyle = col2;
        g.beginPath();
        const sx2 = cx + w / 2 + 20;
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 ? 7 : 16;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(sx2 + Math.cos(a) * rr, cy - 20 + Math.sin(a) * rr);
        }
        g.fill();
      }
    }
    // 上の よごれ
    const gr = g.createLinearGradient(0, 0, 0, 80);
    gr.addColorStop(0, 'rgba(0,0,0,0.4)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 80);
  });
}

/** 遠くの ビルの 窓(ところどころ 明かり) */
function windowsTex(seed: number): THREE.CanvasTexture {
  const r = rng(seed);
  return canvasTex(128, 256, (g) => {
    g.fillStyle = '#16121e';
    g.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 256; y += 16)
      for (let x = 8; x < 128; x += 14) {
        const on = r() < 0.32;
        g.fillStyle = on ? (r() < 0.7 ? '#ffd88a' : '#8ae0ff') : '#221c2c';
        g.fillRect(x, y, 8, 9);
      }
  });
}

/** 金網(すきまは 透明) */
function fenceTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(200,200,215,0.75)';
    g.lineWidth = 2.5;
    for (let i = -128; i < 256; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 128, 128);
      g.stroke();
      g.beginPath();
      g.moveTo(i + 128, 0);
      g.lineTo(i, 128);
      g.stroke();
    }
  }, 6, 1);
}

/** 光の もや(ネオン・街灯の まわり。まん中が 明るい まる) */
function glowTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

export interface StageView {
  group: THREE.Group;
  /** 毎フレーム(ネオンの ちらつき・照明の 首ふり) */
  tick?: (t: number) => void;
}

const toonOf = (gradient: THREE.Texture) => (color: number, map?: THREE.Texture) => new THREE.MeshToonMaterial({ color, gradientMap: gradient, map: map ?? null });
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a0610, side: THREE.BackSide });

/** ネオン管(形の 点を つなぐ 光る 管 + まわりの もや) */
function neon(points: [number, number][], color: number, scale: number, glow: THREE.Texture): { obj: THREE.Group; mats: THREE.Material[] } {
  const g = new THREE.Group();
  const pts = points.map(([x, y]) => new THREE.Vector3(x * scale, y * scale, 0));
  const core = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tint = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 6, 0.06 * scale, 6, false), core));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 6, 0.16 * scale, 6, false), tint));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  const bb = new THREE.Box3().setFromPoints(pts);
  bb.getCenter(halo.position);
  const sz = bb.getSize(new THREE.Vector3());
  halo.scale.set(sz.x * 1.8 + 2, sz.y * 1.8 + 2, 1);
  g.add(halo);
  return { obj: g, mats: [tint, halo.material] };
}

const NEON_SHAPES: [number, number][][] = [
  // 王冠
  [[-1, -0.6], [-1.1, 0.6], [-0.5, 0.05], [0, 0.9], [0.5, 0.05], [1.1, 0.6], [1, -0.6], [-1, -0.6]],
  // 星
  Array.from({ length: 11 }, (_, i) => { const rr = i % 2 ? 0.45 : 1; const a = (i / 10) * Math.PI * 2 + Math.PI / 2; return [Math.cos(a) * rr, Math.sin(a) * rr] as [number, number]; }),
  // 稲妻
  [[-0.3, 1], [0.35, 0.15], [-0.1, 0.1], [0.4, -1], [-0.4, -0.05], [0.05, 0], [-0.3, 1]],
  // 矢印
  [[-1.2, 0], [0.6, 0], [0.6, 0.45], [1.3, -0.15], [0.6, -0.75], [0.6, -0.3], [-1.2, -0.3], [-1.2, 0]],
  // ハート
  Array.from({ length: 25 }, (_, i) => { const t = (i / 24) * Math.PI * 2; return [0.06 * 16 * Math.pow(Math.sin(t), 3), 0.06 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))] as [number, number]; }),
];
const NEON_COLS = [0xff3aa0, 0x3ae0ff, 0xffd23a, 0xa05aff, 0x5aff8a];

export function buildStreet(map: ArenaMap, gradient: THREE.Texture): StageView {
  const g = new THREE.Group();
  const toon = toonOf(gradient);
  const R = map.radius;
  const r = rng(29);
  const glow = glowTex();
  const flick: { mats: THREE.Material[]; base: number[]; ph: number; bad: boolean }[] = [];
  const dummy = new THREE.Object3D();

  // 地面: アスファルト・戦う所の もよう
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 70, 64), new THREE.MeshLambertMaterial({ map: asphaltTex() }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.006;
  ground.receiveShadow = true;
  g.add(ground);
  const deco = new THREE.Mesh(new THREE.CircleGeometry(R + 0.4, 64), new THREE.MeshLambertMaterial({ map: streetFloorTex(), transparent: true, depthWrite: false }));
  deco.rotation.x = -Math.PI / 2;
  deco.position.y = 0.014;
  deco.receiveShadow = true;
  g.add(deco);
  // 水たまり(ネオンが うつる)
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0x6a4ab0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const rr = 5 + r() * (R - 6);
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.8 + r() * 1.2, 20), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(1.6, 1, 1);
    p.rotation.z = r() * 3;
    p.position.set(Math.cos(a) * rr, 0.018, Math.sin(a) * rr);
    g.add(p);
  }

  // すぐ外: コンクリートの ブロック・タイヤの 山・ドラム缶・木箱(当たりなし。戦う所の 外)
  const barrierGeo = new THREE.BoxGeometry(2.4, 0.9, 0.6);
  const barriers = new THREE.InstancedMesh(barrierGeo, toon(0xb8b0a8), 26);
  const barrierLine = new THREE.InstancedMesh(barrierGeo, outlineMat, 26);
  let bi = 0;
  for (let i = 0; i < 32 && bi < 26; i++) {
    if (i % 5 === 2) continue; // すきま
    const a = (i / 32) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * (R + 1.2), 0.45, Math.sin(a) * (R + 1.2));
    dummy.rotation.set(0, -a + Math.PI / 2, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    barriers.setMatrixAt(bi, dummy.matrix);
    dummy.scale.set(1.04, 1.08, 1.12);
    dummy.updateMatrix();
    barrierLine.setMatrixAt(bi, dummy.matrix);
    bi++;
  }
  barriers.count = barrierLine.count = bi;
  barriers.castShadow = true;
  g.add(barriers, barrierLine);
  // 黄色と 黒の しま(ブロックの 上)
  const stripe = new THREE.InstancedMesh(new THREE.BoxGeometry(2.42, 0.16, 0.62), toon(0xffc83a), bi);
  for (let i = 0; i < bi; i++) {
    barriers.getMatrixAt(i, dummy.matrix);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
    dummy.position.y = 0.78;
    dummy.updateMatrix();
    stripe.setMatrixAt(i, dummy.matrix);
  }
  g.add(stripe);
  // ドラム缶・タイヤ・木箱の かたまり
  const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12);
  const tireGeo = new THREE.TorusGeometry(0.45, 0.2, 8, 16);
  const crateGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const drums = new THREE.InstancedMesh(drumGeo, toon(0xc0402a), 30);
  const drums2 = new THREE.InstancedMesh(drumGeo, toon(0x2a70b0), 30);
  const tires = new THREE.InstancedMesh(tireGeo, toon(0x24202a), 60);
  const crates = new THREE.InstancedMesh(crateGeo, toon(0xa87a44), 40);
  const counts = { d: 0, d2: 0, t: 0, c: 0 };
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + r() * 0.2;
    const rr = R + 3 + r() * 2.5;
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr;
    const kind = k % 3;
    for (let j = 0; j < 4; j++) {
      const ox = (r() - 0.5) * 2.2;
      const oz = (r() - 0.5) * 2.2;
      dummy.rotation.set(0, r() * 3, 0);
      dummy.scale.set(1, 1, 1);
      if (kind === 0) {
        dummy.position.set(cx + ox, 0.55, cz + oz);
        dummy.updateMatrix();
        if (j % 2) drums.setMatrixAt(counts.d++, dummy.matrix);
        else drums2.setMatrixAt(counts.d2++, dummy.matrix);
      } else if (kind === 1) {
        for (let h = 0; h < 3; h++) {
          dummy.position.set(cx + ox * 0.3, 0.2 + h * 0.4, cz + oz * 0.3);
          dummy.rotation.set(Math.PI / 2, 0, r() * 3);
          dummy.updateMatrix();
          tires.setMatrixAt(counts.t++, dummy.matrix);
        }
      } else {
        dummy.position.set(cx + ox, 0.55 + (j === 3 ? 1.1 : 0), cz + oz);
        dummy.updateMatrix();
        crates.setMatrixAt(counts.c++, dummy.matrix);
      }
    }
  }
  drums.count = counts.d;
  drums2.count = counts.d2;
  tires.count = counts.t;
  crates.count = counts.c;
  for (const m of [drums, drums2, tires, crates]) m.castShadow = true;
  g.add(drums, drums2, tires, crates);

  // 金網の さく(ところどころ)
  const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const postMat = toon(0x7a7a88);
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2 + 0.12;
    const a1 = a0 + 0.42;
    const rr = R + 6.5;
    const x0 = Math.cos(a0) * rr, z0 = Math.sin(a0) * rr, x1 = Math.cos(a1) * rr, z1 = Math.sin(a1) * rr;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), fenceMat);
    f.position.set((x0 + x1) / 2, 1.5, (z0 + z1) / 2);
    f.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    g.add(f);
    for (const [px, pz] of [[x0, z0], [x1, z1]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), postMat);
      p.position.set(px, 1.6, pz);
      g.add(p);
    }
  }

  // 倉庫(まわりを ぐるっと。落書きの 壁・屋根・ネオンの 看板)
  const roofMat = toon(0x3a3444);
  const wallBases = ['#5a5a6a', '#6a5448', '#4a5a6a', '#5a4a62'];
  const nW = 9;
  for (let i = 0; i < nW; i++) {
    const a = (i / nW) * Math.PI * 2 + 0.2;
    const rr = R + 13 + r() * 4;
    const w = 11 + r() * 5;
    const h = 6 + r() * 4;
    const d = 8;
    const tex = wallTex(100 + i, wallBases[i % wallBases.length]);
    const wallM = toon(0xffffff, tex);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wallM, wallM, roofMat, roofMat, wallM, wallM]);
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr;
    box.position.set(cx, h / 2, cz);
    box.rotation.y = -a + Math.PI / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    const ol = new THREE.Mesh(box.geometry, outlineMat);
    ol.scale.setScalar(1.015);
    box.add(ol);
    g.add(box);
    // ななめの 屋根
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, d * 0.62, w, 3, 1), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(1, 1, 0.35);
    roof.position.set(0, h / 2 + 0.9, 0);
    box.add(roof);
    // ネオンの 看板(戦う所の 方を 向く 面)
    const shape = NEON_SHAPES[i % NEON_SHAPES.length];
    const col = NEON_COLS[i % NEON_COLS.length];
    const n = neon(shape, col, 1.1 + r() * 0.5, glow);
    n.obj.position.set((r() - 0.5) * w * 0.4, h * 0.25 + 1.2, -d / 2 - 0.15);
    n.obj.rotation.y = Math.PI;
    box.add(n.obj);
    flick.push({ mats: n.mats, base: n.mats.map((m) => (m as THREE.MeshBasicMaterial).opacity), ph: r() * 10, bad: i % 4 === 1 });
    // 壁の ライト
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc070, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    lamp.scale.set(3, 3, 1);
    lamp.position.set(w * 0.35, h - 0.8, -d / 2 - 0.3);
    box.add(lamp);
  }

  // 街灯(オレンジの 明かりと 地面の 光の まる)
  const poleMat = toon(0x2a2a36);
  const lightPool = new THREE.MeshBasicMaterial({ map: glow, color: 0xffa040, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.38;
    const rr = R + 2.4;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6), poleMat);
    pole.position.set(x, 3.25, z);
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), poleMat);
    const ix = -Math.cos(a), iz = -Math.sin(a);
    arm.position.set(x + ix * 0.6, 6.4, z + iz * 0.6);
    arm.rotation.y = -a;
    g.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd8a0 }));
    head.position.set(x + ix * 1.2, 6.3, z + iz * 1.2);
    head.rotation.y = -a;
    g.add(head);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffb060, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.copy(head.position);
    halo.scale.set(2.6, 2.6, 1);
    g.add(halo);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), lightPool);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x + ix * 2.2, 0.02, z + iz * 2.2);
    g.add(pool);
  }

  // 遠く: 工場(えんとつ・けむり)と ビルの 明かり
  const factoryMat = toon(0x2a2434);
  const smokeMat = new THREE.SpriteMaterial({ map: glow, color: 0x6a5a7a, transparent: true, opacity: 0.35, depthWrite: false, fog: true });
  const smokes: THREE.Sprite[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.5;
    const rr = R + 40 + r() * 10;
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr;
    const w = 14 + r() * 10;
    const h = 8 + r() * 6;
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 10), factoryMat);
    f.position.set(cx, h / 2, cz);
    f.rotation.y = -a;
    g.add(f);
    for (let k = 0; k < 2; k++) {
      const ch = 10 + r() * 10;
      const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, ch, 8), factoryMat);
      const off = (k - 0.5) * w * 0.5;
      const px = cx + Math.cos(a + Math.PI / 2) * off;
      const pz = cz + Math.sin(a + Math.PI / 2) * off;
      chim.position.set(px, h + ch / 2 - 1, pz);
      g.add(chim);
      // てっぺんの 赤い ランプ
      const red = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff3030, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      red.position.set(px, h + ch, pz);
      red.scale.set(1.6, 1.6, 1);
      g.add(red);
      for (let s = 0; s < 3; s++) {
        const sm = new THREE.Sprite(smokeMat);
        sm.position.set(px, h + ch + 2 + s * 3, pz);
        sm.scale.set(5 + s * 2, 5 + s * 2, 1);
        sm.userData = { y0: sm.position.y, ph: r() * 6 };
        smokes.push(sm);
        g.add(sm);
      }
    }
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + r() * 0.15;
    const rr = R + 62 + r() * 18;
    const w = 6 + r() * 8;
    const h = 14 + r() * 26;
    const tex = windowsTex(300 + i);
    tex.repeat.set(Math.round(w / 4), Math.round(h / 8));
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ map: tex, fog: true }));
    b.position.set(Math.cos(a) * rr, h / 2, Math.sin(a) * rr);
    b.rotation.y = -a;
    g.add(b);
  }

  return {
    group: g,
    tick: (t) => {
      // ネオン: ゆらぐ。こわれかけの 看板は ときどき 消える
      for (const n of flick) {
        let k = 0.85 + Math.sin(t * 6 + n.ph) * 0.15;
        if (n.bad && Math.sin(t * 13 + n.ph * 3) > 0.93) k = 0.15;
        n.mats.forEach((m, i) => ((m as THREE.MeshBasicMaterial).opacity = n.base[i] * k));
      }
      for (const s of smokes) {
        s.position.y = s.userData.y0 + ((t * 0.8 + s.userData.ph) % 4);
      }
    },
  };
}

// ---------------- チャンピオン ----------------

/** 会場の 床(黒・むらさき・金。まん中に 王冠) */
function championFloorTex(): THREE.CanvasTexture {
  return canvasTex(1024, 1024, (g) => {
    const c = 512;
    const gr = g.createRadialGradient(c, c, 0, c, c, 512);
    gr.addColorStop(0, '#2a1048');
    gr.addColorStop(0.55, '#160826');
    gr.addColorStop(1, '#08040e');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 1024);
    // 放射の すじ
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      g.strokeStyle = k % 2 ? 'rgba(160,90,255,0.14)' : 'rgba(255,210,90,0.08)';
      g.lineWidth = 18;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 180, c + Math.sin(a) * 180);
      g.lineTo(c + Math.cos(a) * 500, c + Math.sin(a) * 500);
      g.stroke();
    }
    // 金の 輪
    for (const [rr, w, col] of [[500, 14, '#e8b84a'], [470, 4, '#ffe08a'], [200, 10, '#e8b84a'], [176, 3, '#a05aff']] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.arc(c, c, rr, 0, Math.PI * 2);
      g.stroke();
    }
    // 王冠(小さめ)
    g.save();
    g.translate(c, c);
    g.scale(0.6, 0.6);
    g.translate(-c, -c);
    g.globalAlpha = 0.8;
    g.fillStyle = '#e8b84a';
    g.strokeStyle = '#ffe9a8';
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(c - 100, c + 60);
    g.lineTo(c - 115, c - 45);
    g.lineTo(c - 50, c + 5);
    g.lineTo(c, c - 80);
    g.lineTo(c + 50, c + 5);
    g.lineTo(c + 115, c - 45);
    g.lineTo(c + 100, c + 60);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#a05aff';
    for (const dx of [-60, 0, 60]) {
      g.beginPath();
      g.arc(c + dx, c + 35, 12, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    // 外がわの 文字(STREET KING)
    g.fillStyle = 'rgba(232,184,74,0.75)';
    g.font = '900 54px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const text = 'STREET KING ★ STREET KING ★ ';
    for (let i = 0; i < text.length; i++) {
      const a = (i / text.length) * Math.PI * 2 - Math.PI / 2;
      g.save();
      g.translate(c + Math.cos(a) * 425, c + Math.sin(a) * 425);
      g.rotate(a + Math.PI / 2);
      g.fillText(text[i], 0, 0);
      g.restore();
    }
  });
}

/** 大きな 画面(むらさきの 光・王冠) */
function screenTex(): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 512, 256);
    gr.addColorStop(0, '#3a0a6a');
    gr.addColorStop(0.5, '#a03aff');
    gr.addColorStop(1, '#2a0a4a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffd25a';
    g.font = '900 64px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('STREET KING', 256, 150);
    g.beginPath();
    g.moveTo(206, 90);
    g.lineTo(196, 40);
    g.lineTo(231, 66);
    g.lineTo(256, 28);
    g.lineTo(281, 66);
    g.lineTo(316, 40);
    g.lineTo(306, 90);
    g.closePath();
    g.fill();
    for (let y = 0; y < 256; y += 4) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y, 512, 2);
    }
  });
}

/** 光の すじ(上が 明るく 下へ 消える。照明の 光) */
function beamTex(): THREE.CanvasTexture {
  return canvasTex(64, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 256);
  });
}

export function buildChampion(map: ArenaMap, gradient: THREE.Texture): StageView {
  const g = new THREE.Group();
  const toon = toonOf(gradient);
  const R = map.radius;
  const r = rng(47);
  const glow = glowTex();
  const dummy = new THREE.Object3D();

  // 外の 床(暗い)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 70, 64), new THREE.MeshLambertMaterial({ color: 0x0c0812 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.004;
  ground.receiveShadow = true;
  g.add(ground);
  // 戦う ステージ(少し 高い 丸い 台・金の ふち)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.6, 72), new THREE.MeshLambertMaterial({ map: championFloorTex() }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.012;
  floor.receiveShadow = true;
  g.add(floor);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.7, 0.18, 8, 96), toon(0xe8b84a));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.1;
  g.add(rim);
  // ふちの 光(むらさきの 帯)
  const rimGlow = new THREE.Mesh(new THREE.RingGeometry(R + 0.9, R + 2.2, 96), new THREE.MeshBasicMaterial({ color: 0x8a3aff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  rimGlow.rotation.x = -Math.PI / 2;
  rimGlow.position.y = 0.02;
  g.add(rimGlow);

  // 観客席(だれも いない。だんだんに 上がる 席・通路の すきま)
  const rows = 14;
  const seatGeo = new THREE.BoxGeometry(0.7, 0.5, 0.6);
  const perRow = (k: number) => Math.floor(90 + k * 9);
  let total = 0;
  for (let k = 0; k < rows; k++) total += perRow(k);
  const seats = new THREE.InstancedMesh(seatGeo, toon(0x4a1a7a), total);
  const seats2 = new THREE.InstancedMesh(seatGeo, toon(0x1a1024), total);
  let n1 = 0, n2 = 0;
  const stepMat = toon(0x1c1426);
  const stepGold = new THREE.MeshBasicMaterial({ color: 0x8a6a2a });
  for (let k = 0; k < rows; k++) {
    const rr = R + 7 + k * 1.6;
    const y = 0.8 + k * 1.1;
    // 段(輪)
    const step = new THREE.Mesh(new THREE.CylinderGeometry(rr + 0.8, rr + 0.8, 1.1, 72, 1, true), stepMat);
    step.position.y = y - 0.55;
    g.add(step);
    const top = new THREE.Mesh(new THREE.RingGeometry(rr - 0.8, rr + 0.8, 72), stepMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = y;
    g.add(top);
    if (k % 4 === 0) {
      const edge = new THREE.Mesh(new THREE.TorusGeometry(rr - 0.8, 0.05, 4, 72), stepGold);
      edge.rotation.x = Math.PI / 2;
      edge.position.y = y + 0.02;
      g.add(edge);
    }
    const n = perRow(k);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // 通路(8か所)
      if (((a / (Math.PI * 2)) * 8) % 1 < 0.06) continue;
      dummy.position.set(Math.cos(a) * rr, y + 0.25, Math.sin(a) * rr);
      dummy.rotation.set(0, -a + Math.PI / 2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      // むらさきの 席で 王冠の もようを 作る(ところどころ 金)
      if ((i + k) % 3) seats.setMatrixAt(n1++, dummy.matrix);
      else seats2.setMatrixAt(n2++, dummy.matrix);
    }
  }
  seats.count = n1;
  seats2.count = n2;
  g.add(seats, seats2);
  // 観客席の 下の 壁(金の 線)
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(R + 6.2, R + 6.2, 0.9, 96, 1, true), toon(0x120a1a));
  pit.position.y = 0.45;
  g.add(pit);
  const pitLine = new THREE.Mesh(new THREE.TorusGeometry(R + 6.15, 0.06, 4, 96), new THREE.MeshBasicMaterial({ color: 0xffd25a }));
  pitLine.rotation.x = Math.PI / 2;
  pitLine.position.y = 0.92;
  g.add(pitLine);

  // 金の 柱と むらさきの 旗
  const pillarMat = toon(0xd8a840);
  const bannerTex = canvasTex(128, 256, (c) => {
    c.fillStyle = '#3a0a6a';
    c.fillRect(0, 0, 128, 256);
    c.fillStyle = '#e8b84a';
    c.fillRect(0, 0, 128, 10);
    c.fillRect(0, 246, 128, 10);
    c.beginPath();
    c.moveTo(30, 150);
    c.lineTo(24, 90);
    c.lineTo(48, 115);
    c.lineTo(64, 80);
    c.lineTo(80, 115);
    c.lineTo(104, 90);
    c.lineTo(98, 150);
    c.closePath();
    c.fill();
  });
  const bannerMat = new THREE.MeshLambertMaterial({ map: bannerTex, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const rr = R + 5;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 12, 10), pillarMat);
    p.position.set(Math.cos(a) * rr, 6, Math.sin(a) * rr);
    p.castShadow = true;
    const ol = new THREE.Mesh(p.geometry, outlineMat);
    ol.scale.setScalar(1.06);
    p.add(ol);
    g.add(p);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
    cap.position.set(p.position.x, 12.3, p.position.z);
    g.add(cap);
    const capGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffc040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    capGlow.position.copy(cap.position);
    capGlow.scale.set(4, 4, 1);
    g.add(capGlow);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(2, 5), bannerMat);
    ban.position.set(Math.cos(a) * (rr - 0.6), 8, Math.sin(a) * (rr - 0.6));
    ban.rotation.y = -a - Math.PI / 2;
    g.add(ban);
  }

  // 大きな 画面(観客席の 上・4つ)
  const scrMat = new THREE.MeshBasicMaterial({ map: screenTex() });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const rr = R + 30;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), scrMat);
    s.position.set(Math.cos(a) * rr, 22, Math.sin(a) * rr);
    s.lookAt(0, 18, 0);
    g.add(s);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(19, 10, 0.6), toon(0x16101c));
    frame.position.copy(s.position);
    frame.lookAt(0, 18, 0);
    frame.translateZ(-0.35);
    g.add(frame);
  }

  // 天井: 暗い ドーム・小さな 明かり・照明の わく(トラス)
  const roof = new THREE.Mesh(new THREE.SphereGeometry(R + 48, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x07040c, side: THREE.BackSide, fog: false }));
  roof.position.y = 0;
  g.add(roof);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.25, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false }), 160);
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2;
    const el = 0.35 + r() * 1.1;
    const rr = R + 46;
    dummy.position.set(Math.cos(a) * Math.cos(el) * rr, Math.sin(el) * rr, Math.sin(a) * Math.cos(el) * rr);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.6 + r());
    dummy.updateMatrix();
    dots.setMatrixAt(i, dummy.matrix);
  }
  g.add(dots);
  const truss = new THREE.Mesh(new THREE.TorusGeometry(R - 2, 0.35, 6, 64), toon(0x2a2236));
  truss.rotation.x = Math.PI / 2;
  truss.position.y = 20;
  g.add(truss);
  const truss2 = new THREE.Mesh(new THREE.TorusGeometry(R - 2, 0.35, 6, 64), toon(0x2a2236));
  truss2.rotation.x = Math.PI / 2;
  truss2.position.y = 21.2;
  g.add(truss2);

  // 照明: 上から 首を ふる 光の すじ(金・むらさき・白)
  const bt = beamTex();
  const beams: { m: THREE.Mesh; a: number; ph: number }[] = [];
  const beamCols = [0xffd25a, 0xa05aff, 0xffffff, 0xff5ad8];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 20, 18, 1, true), new THREE.MeshBasicMaterial({ map: bt, color: beamCols[i % beamCols.length], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    // とがった方を 上(照明の 器具)に
    cone.geometry.translate(0, -10, 0);
    const holder = new THREE.Group();
    holder.position.set(Math.cos(a) * (R - 2), 20, Math.sin(a) * (R - 2));
    holder.add(cone);
    const lampHead = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: beamCols[i % beamCols.length], transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    lampHead.scale.set(2.2, 2.2, 1);
    holder.add(lampHead);
    g.add(holder);
    beams.push({ m: holder as unknown as THREE.Mesh, a, ph: r() * 6 });
  }
  // 床の 光の まる(照明が 当たった 所)
  const spots: THREE.Mesh[] = [];
  const spotMat = new THREE.MeshBasicMaterial({ map: glow, color: 0xffe8b0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(4, 24), spotMat);
    s.rotation.x = -Math.PI / 2;
    s.position.y = 0.03;
    g.add(s);
    spots.push(s);
  }

  return {
    group: g,
    tick: (t) => {
      for (const b of beams) {
        // 内がわへ かたむいて ゆっくり 首ふり
        const sw = Math.sin(t * 0.6 + b.ph) * 0.35;
        b.m.rotation.set(0, 0, 0);
        b.m.rotateY(-b.a + Math.PI / 2);
        b.m.rotateX(-0.45 + sw * 0.4);
        b.m.rotateZ(sw);
      }
      spots.forEach((s, i) => {
        const a = t * 0.25 + (i * Math.PI) / 2;
        const rr = 6 + Math.sin(t * 0.4 + i) * 4;
        s.position.x = Math.cos(a) * rr;
        s.position.z = Math.sin(a) * rr;
      });
    },
  };
}
