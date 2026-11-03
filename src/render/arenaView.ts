import * as THREE from 'three';
import type { ArenaMap, Obstacle } from '../core/battle3d/arena';

/**
 * マップの見た目(2026-11-03 ロストテンプル)。当たりは core/battle3d/arena.ts のデータと同じ場所・大きさで作る。
 * アメリカのアニメ風: あざやかな色・太めの形・黒いふち(うしろ向きの面で作る、軽い やり方)。
 * iPhone の負担をへらすため、同じ形・同じ色は使い回す。絵(テクスチャ)は小さい(256〜512)。遠くの建物に当たりは付けない
 */

const SAND = 0xe2cf9e;
const SAND_DARK = 0xbfa676;
const MOSS = 0x6fbf4a;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

/** 石だたみ(大きな石を並べた床。少しずつ色がちがう) */
function flagstoneTex(): THREE.CanvasTexture {
  return canvasTex(512, (g, s) => {
    g.fillStyle = '#8a7a5e';
    g.fillRect(0, 0, s, s);
    const n = 4;
    const w = s / n;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const off = y % 2 ? w / 2 : 0;
        const tone = 205 + Math.floor(rnd() * 30);
        g.fillStyle = `rgb(${tone},${tone - 18},${tone - 52})`;
        g.beginPath();
        g.roundRect(x * w + off + 5, y * w + 5, w - 10, w - 10, 14);
        g.fill();
        if (x === n - 1 && off) {
          g.beginPath();
          g.roundRect(off - w + 5, y * w + 5, w - 10, w - 10, 14);
          g.fill();
        }
        // ひび・小さな点
        g.strokeStyle = 'rgba(90,70,40,0.35)';
        g.lineWidth = 3;
        if (rnd() < 0.4) {
          g.beginPath();
          const cx = x * w + off + w * (0.3 + rnd() * 0.4);
          const cy = y * w + w * (0.3 + rnd() * 0.4);
          g.moveTo(cx, cy);
          g.lineTo(cx + 20, cy + 14);
          g.lineTo(cx + 34, cy + 6);
          g.stroke();
        }
      }
  }, 7);
}

/** 苔・草のかたまり(ふちが ふわっと消える) */
function mossTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    for (let i = 0; i < 26; i++) {
      const x = s / 2 + (Math.random() - 0.5) * s * 0.55;
      const y = s / 2 + (Math.random() - 0.5) * s * 0.55;
      const r = 20 + Math.random() * 34;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const c = Math.random() < 0.5 ? '111,191,74' : '86,160,60';
      gr.addColorStop(0, `rgba(${c},0.95)`);
      gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** れんがの石壁 */
function brickTex(): THREE.CanvasTexture {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#9a8460';
    g.fillRect(0, 0, s, s);
    const rows = 4;
    const h = s / rows;
    for (let r = 0; r < rows; r++)
      for (let c = -1; c < 3; c++) {
        const w = s / 2;
        const x = c * w + (r % 2 ? w / 2 : 0);
        const tone = 200 + ((r * 7 + c * 13) % 30);
        g.fillStyle = `rgb(${tone},${tone - 22},${tone - 60})`;
        g.beginPath();
        g.roundRect(x + 4, r * h + 4, w - 8, h - 8, 8);
        g.fill();
      }
  });
}

export interface ArenaView {
  group: THREE.Group;
  /** 体の当たりと同じ物(カメラが埋まらないように使う) */
  obstacles: Obstacle[];
}

/** マップを作る(シーンに足す物を group にまとめて返す) */
export function buildArena(map: ArenaMap, gradient: THREE.Texture): ArenaView {
  const g = new THREE.Group();
  const toon = (color: number, map2?: THREE.Texture) => new THREE.MeshToonMaterial({ color, gradientMap: gradient, map: map2 ?? null });
  const outline = new THREE.MeshBasicMaterial({ color: 0x2a1e14, side: THREE.BackSide });
  const add = (m: THREE.Mesh, ol = true, olScale = 1.06) => {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    if (ol) {
      // ふち取りは子にする(あとで場所を決めても いっしょに動く)
      const o = new THREE.Mesh(m.geometry, outline);
      o.scale.setScalar(olScale);
      m.add(o);
    }
    return m;
  };
  const R = map.radius;

  // 床: 石だたみの円・外側に一段下がった石のふち
  const floorTex = flagstoneTex();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 1.2, 64), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.005;
  floor.receiveShadow = true;
  g.add(floor);
  // まん中の丸いもよう(古い祭壇のあと)
  const ringMat = new THREE.MeshLambertMaterial({ color: 0xcdb27a });
  for (const [r0, r1] of [[3.2, 3.6], [6.6, 6.9]] as const) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64), ringMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.012;
    m.receiveShadow = true;
    g.add(m);
  }
  // 苔・草(すきまに生える)
  const moss = new THREE.MeshLambertMaterial({ map: mossTex(), transparent: true, depthWrite: false });
  const mossGeo = new THREE.PlaneGeometry(1, 1);
  const mossSpots: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.sin(i * 7) * 0.3;
    const r = 9 + ((i * 37) % 70) / 10;
    mossSpots.push([Math.cos(a) * r, Math.sin(a) * r, 2.2 + ((i * 13) % 20) / 10]);
  }
  for (const o of map.obstacles) mossSpots.push([o.x, o.z, (o.kind === 'circle' ? o.r : Math.max(o.hw, o.hd)) * 2.6 + 0.8]);
  for (const [x, z, s] of mossSpots) {
    const m = new THREE.Mesh(mossGeo, moss);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = x * 3.1;
    m.position.set(x, 0.02, z);
    m.scale.setScalar(s);
    g.add(m);
  }

  // 柱(使い回す形)
  const stone = toon(SAND);
  const stoneDark = toon(SAND_DARK);
  const mossMat = toon(MOSS);
  const shaft = new THREE.CylinderGeometry(1, 1, 1, 10);
  const slab = new THREE.BoxGeometry(1, 1, 1);
  const brick = toon(0xe8d2a0, brickTex());
  for (const o of map.obstacles) {
    if (o.kind === 'circle') {
      const h = o.h;
      const r = o.r;
      // 台(四角)・柱の胴・上の飾り
      const base = add(new THREE.Mesh(slab, stoneDark));
      base.scale.set(r * 2.5, 0.35, r * 2.5);
      base.position.set(o.x, 0.175, o.z);
      if (o.look === 'stump') {
        const s = add(new THREE.Mesh(shaft, stone));
        s.scale.set(r, h - 0.35, r);
        s.position.set(o.x, 0.35 + (h - 0.35) / 2, o.z);
        const top = add(new THREE.Mesh(shaft, mossMat), false);
        top.scale.set(r * 1.02, 0.12, r * 1.02);
        top.position.set(o.x, h + 0.02, o.z);
        continue;
      }
      const bodyH = o.look === 'broken' ? h - 0.35 : h - 0.95;
      const s = add(new THREE.Mesh(shaft, stone));
      s.scale.set(r * 0.92, bodyH, r * 0.92);
      s.position.set(o.x, 0.35 + bodyH / 2, o.z);
      // 柱の みぞ(たての線)は、色ちがいの細い柱を重ねて見せる(軽い)
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        const f = add(new THREE.Mesh(slab, stoneDark), false);
        f.scale.set(0.08, bodyH * 0.9, 0.08);
        f.position.set(o.x + Math.cos(a) * r * 0.9, 0.35 + bodyH / 2, o.z + Math.sin(a) * r * 0.9);
      }
      if (o.look === 'pillar') {
        const cap = add(new THREE.Mesh(slab, stoneDark));
        cap.scale.set(r * 2.4, 0.5, r * 2.4);
        cap.position.set(o.x, h - 0.25, o.z);
        const neck = add(new THREE.Mesh(shaft, stone), false);
        neck.scale.set(r * 1.05, 0.12, r * 1.05);
        neck.position.set(o.x, h - 0.56, o.z);
      } else {
        // くずれた上(ななめの切り口・苔)
        const chip = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.5, 10), stone));
        chip.position.set(o.x, h + 0.05, o.z);
        chip.rotation.set(0.35, 0, 0.2);
        const top = add(new THREE.Mesh(shaft, mossMat), false);
        top.scale.set(r * 0.7, 0.1, r * 0.7);
        top.position.set(o.x, h + 0.3, o.z);
        top.rotation.set(0.35, 0, 0.2);
        // 足もとに落ちた かけら
        const rub = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), stoneDark));
        rub.position.set(o.x + r * 1.6, 0.25, o.z + r * 0.6);
      }
    } else {
      const m = add(new THREE.Mesh(slab, o.look === 'wall' ? brick : stoneDark));
      m.scale.set(o.hw * 2, o.h, o.hd * 2);
      m.position.set(o.x, o.h / 2, o.z);
      m.rotation.y = -o.rot;
      if (o.look === 'wall') {
        // 上の石と苔
        const top = add(new THREE.Mesh(slab, stone));
        top.scale.set(o.hw * 2 + 0.2, 0.3, o.hd * 2 + 0.2);
        top.position.set(o.x, o.h + 0.15, o.z);
        top.rotation.y = -o.rot;
        const mo = add(new THREE.Mesh(slab, mossMat), false);
        mo.scale.set(o.hw * 1.2, 0.08, o.hd * 2.1);
        mo.position.set(o.x, o.h + 0.33, o.z);
        mo.rotation.y = -o.rot;
      }
    }
  }

  // 外の壁(ここから外へは出られない。体の当たりは丸い場所の半径)
  const seg = 28;
  for (let i = 0; i < seg; i++) {
    const a = ((i + 0.5) / seg) * Math.PI * 2;
    const h = 1.4 + ((i * 7) % 5) * 0.35;
    const w = add(new THREE.Mesh(slab, brick));
    w.scale.set(((2 * Math.PI * (R + 0.9)) / seg) * 0.98, h, 1.1);
    w.position.set(Math.cos(a) * (R + 0.9), h / 2, Math.sin(a) * (R + 0.9));
    w.rotation.y = -a + Math.PI / 2;
    if (i % 4 === 0) {
      // ところどころ 高い柱
      const p = add(new THREE.Mesh(shaft, stone));
      p.scale.set(0.6, 3.4, 0.6);
      p.position.set(Math.cos(a) * (R + 1.1), 1.7, Math.sin(a) * (R + 1.1));
    }
  }

  // 遠くの遺跡(当たりなし): 段のある神殿・アーチ
  const temple = (x: number, z: number, s: number, rot: number) => {
    const t = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(slab, k % 2 ? stone : stoneDark);
      m.scale.set((8 - k * 1.6) * s, 1.6 * s, (8 - k * 1.6) * s);
      m.position.y = (0.8 + k * 1.6) * s;
      t.add(m);
    }
    const top = new THREE.Mesh(slab, brick);
    top.scale.set(2 * s, 2 * s, 2 * s);
    top.position.y = 7.4 * s;
    t.add(top);
    t.position.set(x, 0, z);
    t.rotation.y = rot;
    g.add(t);
  };
  temple(0, -34, 1.4, 0);
  temple(30, 22, 1.0, 0.6);
  temple(-32, 18, 1.1, -0.5);
  const arch = (x: number, z: number, rot: number) => {
    const t = new THREE.Group();
    for (const sx of [-2.2, 2.2]) {
      const p = new THREE.Mesh(shaft, stone);
      p.scale.set(0.7, 6, 0.7);
      p.position.set(sx, 3, 0);
      t.add(p);
    }
    const l = new THREE.Mesh(slab, stoneDark);
    l.scale.set(6, 0.9, 1.2);
    l.position.y = 6.3;
    t.add(l);
    t.position.set(x, 0, z);
    t.rotation.y = rot;
    g.add(t);
  };
  arch(24, -14, 1.1);
  arch(-22, -20, -0.9);
  arch(-14, 27, 0.3);
  arch(14, 28, -0.3);
  return { group: g, obstacles: map.obstacles };
}
