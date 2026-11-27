/**
 * 冒険の 3D 画面(2026-11-07 企画者「3D を ななめ上から」)。ダンジョン・自分の MONZ・モブ を 描く。
 * 自分の MONZ は MONZ RUMBLE の モデルと 動き(MonsterRig)を そのまま 使う。モブは【仮】の 形(企画者が 新しく 作る)。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { assetUrl } from '../assetUrl';
import { newAnimeBattle, type AnimeEntrant, type AnimeMon } from '../core/battle3d/anime';
import { CELL, WALL } from '../core/adventure/dungeon';
import { getTech } from '../core/battle3d/techTable';
import { ADV, isBoss, MOB_KINDS, mobSpec, RANKS, SELF_KINDS, techWindup, type MobKind, type AimShape, type Actor, type AdvEvent, type AdvItem, type AdvState, type Rank } from '../core/adventure/sim';
import type { modelFor } from '../core/roster';
import { MonsterRig } from './monsterRig';

type ModelPick = ReturnType<typeof modelFor>;

function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 星の 形(床に 平らに 置く) */
function starGeometry(r: number, r2: number, n: number): THREE.ShapeGeometry {
  const sh = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r2 : r;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ShapeGeometry(sh);
}

/** 光の 玉の 絵(2D の 弾) */
let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** 斬った あとの 光(三日月。外がわが 明るく、内がわへ 消える。先は 細い) */
let slashTex: THREE.CanvasTexture | null = null;
function slashTexture(): THREE.CanvasTexture {
  if (slashTex) return slashTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  // u = 弧の 向き(0→1)・v = 内(0)→外(1)
  const img = g.createImageData(128, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 128; x++) {
      const u = x / 127;
      const v = 1 - y / 31;
      const tip = Math.pow(Math.sin(Math.PI * u), 0.6);
      // ふちに 鋭い 線・内がわへ すっと 消える
      const edge = Math.pow(v, 3);
      const core = Math.max(0, (v - 0.8) / 0.2);
      const a = Math.min(1, tip * (edge + core * 0.8)) * (0.45 + 0.55 * u);
      const w = Math.round(200 + 55 * core);
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = w;
      img.data[i + 3] = Math.round(a * 255);
    }
  g.putImageData(img, 0, 0);
  slashTex = new THREE.CanvasTexture(c);
  return slashTex;
}

/** 三日月の 形(内がわは 先へ いくほど 外に よる = 先が 細い)。u は 弧の 向き */
function crescentGeometry(r: number, width: number, arc: number, seg = 32): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = -arc / 2 + arc * u;
    const w = width * Math.sin(Math.PI * u) + 0.02;
    const ro = r;
    const ri = Math.max(0.05, r - w);
    pos.push(Math.cos(a) * ri, Math.sin(a) * ri, 0, Math.cos(a) * ro, Math.sin(a) * ro, 0);
    uv.push(u, 0, u, 1);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** ハトの 羽(2026-11-26 企画者「ハトの 攻撃も 球みたいの 羽にしよ」)。右向き */
let featherTex: THREE.CanvasTexture | null = null;
function featherTexture(): THREE.CanvasTexture {
  if (featherTex) return featherTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.translate(64, 24);
  // 羽の 形
  g.beginPath();
  g.moveTo(-54, 2);
  g.bezierCurveTo(-30, -20, 30, -20, 58, -2);
  g.bezierCurveTo(30, 16, -30, 18, -54, 2);
  g.closePath();
  g.fillStyle = '#e8e6f2';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#1a1424';
  g.stroke();
  // 先の 灰色
  g.save();
  g.clip();
  g.fillStyle = '#8a86a0';
  g.fillRect(20, -24, 50, 48);
  // すじ
  g.strokeStyle = 'rgba(60,50,80,0.6)';
  g.lineWidth = 2;
  for (let i = -40; i < 50; i += 9) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 10, -14);
    g.moveTo(i, 0);
    g.lineTo(i + 10, 13);
    g.stroke();
  }
  g.restore();
  // じく
  g.beginPath();
  g.moveTo(-62, 3);
  g.lineTo(56, -1);
  g.lineWidth = 3;
  g.strokeStyle = '#3a3448';
  g.stroke();
  featherTex = new THREE.CanvasTexture(c);
  featherTex.colorSpace = THREE.SRGBColorSpace;
  return featherTex;
}

/**
 * 飛ぶ 技の 絵(2026-11-27 企画者「飛ばす 技は ただの 丸は やめて。羽とか 毒とか その 技に あった 絵柄」)。
 * どれも 右向き(進む 向き = 右)。黒い ふち線で 2D の ゲームらしく。ほかの 絵と 同じく 一度 作って 使い回す
 */
const shotTexs = new Map<string, THREE.CanvasTexture>();
export function shotTexture(name: string): THREE.CanvasTexture {
  const hit = shotTexs.get(name);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.translate(64, 32);
  g.lineJoin = g.lineCap = 'round';
  const ink = '#1a1424';
  const blob = (x: number, y: number, r: number, fill: string) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
  };
  const trail = (cols: string[], len = 56, w = 16) => {
    // うしろに のびる 尾(進む 向きの 反対)
    const gr = g.createLinearGradient(-len, 0, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(1, cols[0]);
    g.beginPath();
    g.moveTo(0, -w / 2);
    g.quadraticCurveTo(-len * 0.6, -w * 0.15, -len, 0);
    g.quadraticCurveTo(-len * 0.6, w * 0.15, 0, w / 2);
    g.closePath();
    g.fillStyle = gr;
    g.fill();
  };
  switch (name) {
    case 'goo': {
      // ねばねば(スライム): 紫の しずくと 飛び散り
      trail(['rgba(176,90,255,0.7)'], 44, 18);
      g.beginPath();
      g.moveTo(26, 0);
      g.bezierCurveTo(22, -18, -6, -18, -12, -4);
      g.bezierCurveTo(-20, 0, -14, 18, 4, 16);
      g.bezierCurveTo(18, 14, 26, 8, 26, 0);
      g.fillStyle = '#9a4ae0';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = ink;
      g.stroke();
      blob(10, -6, 5, '#e0b8ff');
      blob(-22, 12, 4, '#9a4ae0');
      blob(-30, -10, 3, '#9a4ae0');
      break;
    }
    case 'poison': {
      // 毒液(KING SLIME): 緑の しずく・あわ
      trail(['rgba(120,255,90,0.6)'], 48, 18);
      g.beginPath();
      g.moveTo(28, 0);
      g.bezierCurveTo(10, -16, -14, -14, -14, 0);
      g.bezierCurveTo(-14, 14, 10, 16, 28, 0);
      g.fillStyle = '#6ad04a';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = ink;
      g.stroke();
      blob(-2, -4, 4, '#c8ff9a');
      blob(6, 5, 3, '#c8ff9a');
      blob(-24, -8, 4, '#6ad04a');
      blob(-34, 6, 3, '#6ad04a');
      break;
    }
    case 'spore': {
      // 毒の 胞子玉(SHROOM): ピンクの 玉に 白い 斑点・まわりに 粉
      for (let i = 0; i < 9; i++) blob(-10 - Math.random() * 40, (Math.random() - 0.5) * 30, 2 + Math.random() * 2, 'rgba(255,140,210,0.8)');
      blob(6, 0, 18, '#ff5ab0');
      g.lineWidth = 4;
      g.strokeStyle = ink;
      g.beginPath();
      g.arc(6, 0, 18, 0, Math.PI * 2);
      g.stroke();
      blob(0, -7, 5, '#ffe0f0');
      blob(12, 6, 4, '#ffe0f0');
      blob(14, -8, 3, '#ffe0f0');
      break;
    }
    case 'bone': {
      // 骨(SKELE)
      g.rotate(0.3);
      g.fillStyle = '#f0e8d0';
      g.strokeStyle = ink;
      g.lineWidth = 4;
      g.beginPath();
      g.roundRect(-26, -5, 52, 10, 4);
      g.fill();
      g.stroke();
      for (const sx of [-28, 28]) for (const sy of [-6, 6]) {
        g.beginPath();
        g.arc(sx, sy, 7, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.beginPath();
      g.roundRect(-24, -3, 48, 6, 3);
      g.fill();
      break;
    }
    case 'web': {
      // クモの 糸(SPIDER): 白い 網
      g.strokeStyle = 'rgba(240,240,255,0.95)';
      g.lineWidth = 2.5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
        g.stroke();
      }
      for (const r of [8, 15, 22]) {
        g.beginPath();
        for (let i = 0; i <= 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i) g.quadraticCurveTo(Math.cos(a - 0.4) * r * 0.85, Math.sin(a - 0.4) * r * 0.85, x, y);
          else g.moveTo(x, y);
        }
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-26, 0);
      g.lineTo(-60, 0);
      g.stroke();
      break;
    }
    case 'wisp': {
      // 霊の 火の玉(GHOST): 水色の 炎
      trail(['rgba(106,232,255,0.8)'], 58, 24);
      g.beginPath();
      g.moveTo(24, 0);
      g.bezierCurveTo(22, -18, -2, -22, -16, -10);
      g.quadraticCurveTo(-8, -4, -22, 0);
      g.quadraticCurveTo(-8, 4, -16, 10);
      g.bezierCurveTo(-2, 22, 22, 18, 24, 0);
      g.fillStyle = '#6ae8ff';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#1a5a7a';
      g.stroke();
      blob(8, 0, 8, '#e8ffff');
      break;
    }
    case 'rock': {
      // 岩(TROLL)
      g.beginPath();
      const pts = [[26, -4], [18, -20], [-2, -24], [-20, -14], [-26, 4], [-14, 20], [8, 22], [24, 12]];
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = '#8a7a68';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = ink;
      g.stroke();
      g.fillStyle = '#b0a088';
      g.beginPath();
      g.moveTo(-14, -12);
      g.lineTo(4, -18);
      g.lineTo(12, -8);
      g.lineTo(-6, -4);
      g.fill();
      g.strokeStyle = '#4a3e32';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-6, 6);
      g.lineTo(6, 10);
      g.lineTo(10, 2);
      g.stroke();
      break;
    }
    // ===== 自分の 技(属性ごと) =====
    case 'fire': {
      trail(['rgba(255,120,30,0.85)'], 60, 26);
      g.beginPath();
      g.moveTo(26, 0);
      g.bezierCurveTo(24, -20, -4, -22, -14, -12);
      g.quadraticCurveTo(-4, -6, -24, -2);
      g.quadraticCurveTo(-6, 4, -14, 12);
      g.bezierCurveTo(-4, 22, 24, 20, 26, 0);
      g.fillStyle = '#ff6a1a';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#7a1a0a';
      g.stroke();
      blob(10, 0, 10, '#ffd040');
      blob(13, 0, 5, '#fff6c0');
      break;
    }
    case 'water': {
      trail(['rgba(90,190,255,0.8)'], 50, 16);
      g.beginPath();
      g.moveTo(26, 0);
      g.bezierCurveTo(14, -18, -14, -14, -16, 0);
      g.bezierCurveTo(-14, 14, 14, 18, 26, 0);
      g.fillStyle = '#3aa8ff';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#0a3a6a';
      g.stroke();
      blob(2, -5, 5, '#d8f0ff');
      break;
    }
    case 'thunder': {
      g.beginPath();
      g.moveTo(-56, 2);
      const z = [[-40, -10], [-28, 6], [-12, -12], [0, 4], [14, -8], [28, 0]];
      for (const [x, y] of z) g.lineTo(x, y);
      g.strokeStyle = '#3a6aff';
      g.lineWidth = 10;
      g.stroke();
      g.strokeStyle = '#fff6a0';
      g.lineWidth = 5;
      g.stroke();
      blob(26, 0, 9, '#ffe24a');
      blob(26, 0, 4, '#ffffff');
      break;
    }
    case 'leaf': {
      trail(['rgba(110,210,80,0.6)'], 44, 12);
      g.beginPath();
      g.moveTo(28, 0);
      g.quadraticCurveTo(4, -20, -22, 0);
      g.quadraticCurveTo(4, 20, 28, 0);
      g.fillStyle = '#6ad04a';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#1a4a12';
      g.stroke();
      g.beginPath();
      g.moveTo(-22, 0);
      g.lineTo(24, 0);
      g.stroke();
      break;
    }
    case 'light': {
      trail(['rgba(255,240,150,0.8)'], 56, 14);
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? 7 : 20;
        g.lineTo(8 + Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = '#fff2a0';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#a07a10';
      g.stroke();
      blob(8, 0, 5, '#ffffff');
      break;
    }
    case 'dark': {
      trail(['rgba(150,70,255,0.8)'], 58, 22);
      blob(8, 0, 17, '#3a1a5a');
      g.lineWidth = 4;
      g.strokeStyle = '#a05aff';
      g.beginPath();
      g.arc(8, 0, 17, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#d8a0ff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(8, 0, 9, 0.4, 4.5);
      g.stroke();
      break;
    }
    default: {
      // 無属性: 白い 気の 弾(三日月の 衝撃)
      trail(['rgba(255,255,255,0.75)'], 52, 18);
      g.beginPath();
      g.arc(4, 0, 20, -1.3, 1.3);
      g.quadraticCurveTo(14, 0, 4 + Math.cos(-1.3) * 20, Math.sin(-1.3) * 20);
      g.fillStyle = '#ffffff';
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#7a6a90';
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  shotTexs.set(name, t);
  return t;
}
/** 敵の 近くの 攻撃の 絵(2026-11-27 企画者「敵も」): 牙・ひっかき・地割れ・音の 波・胞子の 粉・けむり。正方形 */
const meleeTexs = new Map<string, THREE.CanvasTexture>();
export function meleeTexture(name: string): THREE.CanvasTexture {
  const hit = meleeTexs.get(name);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.lineJoin = g.lineCap = 'round';
  const ink = '#1a1424';
  if (name === 'bite') {
    // 上と 下の あご(白い 三角の 牙)
    for (const sg of [-1, 1]) {
      g.beginPath();
      g.moveTo(-48, sg * 44);
      g.quadraticCurveTo(0, sg * 20, 48, sg * 44);
      g.lineTo(48, sg * 30);
      for (let k = 0; k < 6; k++) {
        const x0 = 48 - k * 16;
        g.lineTo(x0 - 8, sg * 4);
        g.lineTo(x0 - 16, sg * (k === 5 ? 30 : 20));
      }
      g.closePath();
      g.fillStyle = '#fff6e8';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = ink;
      g.stroke();
    }
  } else if (name === 'claw') {
    // 3本の ひっかき(ななめ・すき間 あり)
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(-34 + i * 22, -46);
      g.quadraticCurveTo(-6 + i * 22, 0, -20 + i * 22 + 30, 46);
      g.lineWidth = 11;
      g.strokeStyle = ink;
      g.stroke();
      g.lineWidth = 5;
      g.strokeStyle = '#fff0f0';
      g.stroke();
    }
  } else if (name === 'crack') {
    // 地割れ(ぎざぎざの ひび。まん中は へこみ)
    g.beginPath();
    g.arc(0, 0, 18, 0, Math.PI * 2);
    g.fillStyle = 'rgba(30,20,40,0.75)';
    g.fill();
    g.strokeStyle = ink;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      g.beginPath();
      let x = Math.cos(a) * 14;
      let y = Math.sin(a) * 14;
      g.moveTo(x, y);
      const n = 3 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        const aa = a + (Math.random() - 0.5) * 0.9;
        const st = 9 + Math.random() * 8;
        x += Math.cos(aa) * st;
        y += Math.sin(aa) * st;
        g.lineTo(x, y);
      }
      g.lineWidth = 5 - (i % 2) * 2;
      g.stroke();
    }
    } else if (name === 'sound') {
    // 音の 波(右へ ひろがる 弧)
    for (const r of [18, 34, 50]) {
      g.beginPath();
      g.arc(-40, 0, r + 20, -0.7, 0.7);
      g.lineWidth = 7;
      g.strokeStyle = '#d8a0ff';
      g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = '#ffffff';
      g.stroke();
    }
  } else if (name === 'powder') {
    // 胞子の 粉(ピンクの 粒)
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 54;
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 2 + Math.random() * 5, 0, Math.PI * 2);
      g.fillStyle = `rgba(255,${120 + Math.floor(Math.random() * 80)},210,${0.5 + Math.random() * 0.5})`;
      g.fill();
    }
  } else {
    // けむり
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 40, 18 + Math.random() * 14, 0, Math.PI * 2);
      g.fillStyle = 'rgba(200,190,215,0.55)';
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  meleeTexs.set(name, t);
  return t;
}

const SHOT_EL: Record<string, string> = { 炎: 'fire', 水: 'water', 雷: 'thunder', 自然: 'leaf', 光: 'light', 闇: 'dark' };
const MOB_SHOT: Partial<Record<string, string>> = { slime: 'goo', kingslime: 'poison', shroom: 'spore', skele: 'bone', ghost: 'wisp', troll: 'rock' };

/** 床の タイル(はっきりした ふちの 石だたみ。2D の 地図のように) */
function tileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6dcef';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d4c6e2';
  g.fillRect(4, 4, 26, 26);
  g.fillRect(34, 34, 26, 26);
  g.strokeStyle = '#7a6a8c';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 61, 61);
  g.beginPath();
  g.moveTo(32, 0);
  g.lineTo(32, 64);
  g.moveTo(0, 32);
  g.lineTo(64, 32);
  g.lineWidth = 2;
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 壁(れんが) */
function wallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#bfb0d8';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#5a4a72';
  g.lineWidth = 3;
  for (let r = 0; r < 4; r++) {
    const y = r * 16;
    g.beginPath();
    g.moveTo(0, y + 1.5);
    g.lineTo(64, y + 1.5);
    g.stroke();
    for (let x = (r % 2) * 16; x < 64; x += 32) {
      g.beginPath();
      g.moveTo(x + 1.5, y);
      g.lineTo(x + 1.5, y + 16);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 数字の 絵(ダメージ) */
function numberTexture(s: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = `900 ${s.length > 4 ? 40 : 44}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = '#16101c';
  g.strokeText(s, 128, 34);
  g.fillStyle = color;
  g.fillText(s, 128, 34);
  return new THREE.CanvasTexture(c);
}

/** 属性の 色(MONZ RUMBLE と 同じ) */
const EL_HEX: Record<string, number> = { 炎: 0xff6a2a, 水: 0x3aa8ff, 自然: 0x6ad04a, 雷: 0xffd23a, 光: 0xfff2a0, 闇: 0xa05aff, 無: 0xe0e0f0 };

/** 技の 光(冒険用の 見た目。2026-11-07 企画者「冒険では 技の エフェクトを 変えていこう」)。t: 0→1 で 形を 変える */
interface Fx {
  obj: THREE.Object3D;
  mats: THREE.Material[];
  t: number;
  life: number;
  tick: (k: number) => void;
}

/** ランクの 色(D 灰・C 緑・B 青・A 紫・S 金) */
export const RANK_HEX: Record<Rank, number> = { D: 0x9a9aa8, C: 0x4ad06a, B: 0x3a9aff, A: 0xb04aff, S: 0xffc830 };

interface Pop {
  obj: THREE.Sprite;
  t: number;
  life: number;
  vy: number;
  grow: number;
}

/** 【仮】モブ: まるい 体に 角と 目(企画者の モブが できたら 入れかえ) */
/** 敵の 絵(種類ごと)。h: 絵の 高さ・fly: 宙に 浮く */
interface MobArt {
  tex: THREE.Texture;
  /** 左右 反転した 絵(スプライトは 大きさを マイナスに しても 反転しないので 別に 持つ) */
  flip: THREE.Texture;
  /** ミミックが 化けて いる 間の 絵(ゴミ箱) */
  sleep?: THREE.Texture;
  h: number;
  fly: boolean;
}
/** 絵の ある 敵(企画者の 絵が とどいたら ここに 足す) */
const MOB_ART: Record<string, { file: string; h: number; fly: boolean }> = {
  slime: { file: 'assets/adventure/mob_slime.webp', h: 1.5, fly: false },
  kingslime: { file: 'assets/adventure/mob_kingslime.webp', h: 3.6, fly: false },
  troll: { file: 'assets/adventure/mob_troll.webp', h: 4.2, fly: false },
  ghost: { file: 'assets/adventure/mob_ghost.webp', h: 1.5, fly: true },
  spider: { file: 'assets/adventure/mob_spider.webp', h: 1.5, fly: false },
  mimic: { file: 'assets/adventure/mob_mimic.webp', h: 1.7, fly: false },
  shroom: { file: 'assets/adventure/mob_shroom.webp', h: 1.6, fly: false },
  skele: { file: 'assets/adventure/mob_skele.webp', h: 1.8, fly: false },
  golem: { file: 'assets/adventure/mob_golem.webp', h: 2.7, fly: false },
  ratz: { file: 'assets/adventure/mob_ratz.webp', h: 1.2, fly: false },
  pige: { file: 'assets/adventure/mob_pige.webp', h: 1.4, fly: true },
  batz: { file: 'assets/adventure/mob_batz.webp', h: 1.2, fly: true },
};
/** 【仮】絵が とどくまでの 仮の 形(色・大きさ・形) */
const MOB_LOOK: Record<MobKind, { color: number; size: number; shape: 'ball' | 'flat' | 'can' | 'block' | 'cap'; ghost?: boolean }> = {
  slime: { color: 0x9a4ae0, size: 1, shape: 'flat' },
  ratz: { color: 0x8a8a96, size: 0.75, shape: 'ball' },
  pige: { color: 0x7a7aa8, size: 0.7, shape: 'ball' },
  batz: { color: 0x6a2aa8, size: 0.65, shape: 'ball' },
  ghost: { color: 0x8ae8ff, size: 0.8, shape: 'ball', ghost: true },
  spider: { color: 0x2a1a3a, size: 1.05, shape: 'flat' },
  mimic: { color: 0x5a6a62, size: 1, shape: 'can' },
  shroom: { color: 0xff5ab0, size: 0.9, shape: 'cap' },
  skele: { color: 0xeae6d8, size: 0.85, shape: 'ball' },
  golem: { color: 0xa0583a, size: 1.45, shape: 'block' },
  kingslime: { color: 0x8a3ad0, size: 2.6, shape: 'flat' },
  troll: { color: 0x7a9070, size: 2.6, shape: 'block' },
};

class MobView {
  readonly root = new THREE.Group();
  private body: THREE.Mesh;
  private mat: THREE.MeshToonMaterial;
  private bar: THREE.Mesh;
  private barBg: THREE.Mesh;
  private deadT = 0;
  /** 敵の 絵(2026-11-24〜 企画者の 絵が ある 種類だけ。カメラの ほうを 向く 板) */
  private art: THREE.Sprite | null = null;
  private rightTex: THREE.Texture | null = null;
  private flipTex: THREE.Texture | null = null;
  private sleepTex: THREE.Texture | null = null;
  private artMat: THREE.SpriteMaterial | null = null;
  private artH = 1.7;
  private fly = false;
  private shadow: THREE.Mesh | null = null;
  private base = 0x8a3ac8;
  private size = 1;
  private baseY = 0.5;
  private flyLook = false;
  private sy0 = 0.85;
  private crown: THREE.Mesh | null = null;
  private lastX = 0;
  private lastZ = 0;
  private lastT = 0;
  private walkW = 0;
  private walkPh = Math.random() * 6;
  constructor(grad: THREE.Texture, art: MobArt | null = null, kind: MobKind = 'slime') {
    const L = MOB_LOOK[kind] ?? MOB_LOOK.slime;
    this.base = L.color;
    this.size = L.size;
    this.flyLook = !!MOB_KINDS[kind]?.fly;
    this.mat = new THREE.MeshToonMaterial({ color: L.color, gradientMap: grad, transparent: !!L.ghost, opacity: L.ghost ? 0.75 : 1 });
    const geo = L.shape === 'can' ? new THREE.CylinderGeometry(0.42, 0.36, 1.0, 16) : L.shape === 'block' ? new THREE.BoxGeometry(0.9, 1.0, 0.9) : new THREE.SphereGeometry(0.5, 16, 12);
    this.sy0 = L.shape === 'flat' ? 0.6 : L.shape === 'ball' || L.shape === 'cap' ? 0.85 : 1;
    this.body = new THREE.Mesh(geo, this.mat);
    this.baseY = (L.shape === 'can' || L.shape === 'block' ? 0.5 : 0.5 * this.sy0) * L.size + (this.flyLook ? 0.8 : 0);
    this.body.position.y = this.baseY;
    this.body.scale.y = this.sy0;
    this.body.castShadow = true;
    this.root.add(this.body);
    const outline = new THREE.Mesh(this.body.geometry, new THREE.MeshBasicMaterial({ color: 0x16101c, side: THREE.BackSide }));
    outline.scale.setScalar(1.08);
    this.body.add(outline);
    const horn = new THREE.MeshToonMaterial({ color: 0xffb03a, gradientMap: grad });
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), horn);
      h.position.set(0.1, 0.55, s * 0.28);
      h.rotation.x = s * 0.5;
      this.body.add(h);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff27a }));
      eye.position.set(0.52, 0.12, s * 0.2);
      this.body.add(eye);
    }
    if (kind === 'kingslime' && !art) {
      // 【仮】金の 王冠
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.3, 5, 1, true), new THREE.MeshToonMaterial({ color: 0xffd23a, gradientMap: grad, side: THREE.DoubleSide }));
      crown.rotation.z = 0.35;
      this.crown = crown;
      this.root.add(crown);
    }
    if (L.shape === 'cap') {
      // キノコの かさ
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0xff2a8a, gradientMap: grad }));
      cap.position.y = 0.3;
      this.body.add(cap);
    }
    if (this.flyLook && !art) {
      // 床の 影(浮いて いる 敵)
      const sh = new THREE.Mesh(new THREE.CircleGeometry(0.4 * L.size, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.04;
      this.root.add(sh);
    }
    // 【仮】名前(絵が とどくまで 見分けやすく)
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTexture(MOB_KINDS[kind]?.name ?? '', '#ffffff'), transparent: true, depthTest: false }));
    tag.scale.set(2.0, 0.5, 1);
    tag.renderOrder = 9;
    tag.position.y = this.baseY + 0.75 * L.size + 0.35;
    this.root.add(tag);
    this.barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), new THREE.MeshBasicMaterial({ color: 0x16101c, depthTest: false }));
    this.bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.08), new THREE.MeshBasicMaterial({ color: 0xff4a6a, depthTest: false }));
    this.barBg.renderOrder = 10;
    this.bar.renderOrder = 11;
    this.barBg.position.y = this.bar.position.y = tag.position.y + 0.35;
    this.root.add(this.barBg, this.bar);
    if (art) {
      this.body.visible = false;
      this.artMat = new THREE.SpriteMaterial({ map: art.tex, transparent: true, alphaTest: 0.1 });
      this.rightTex = art.tex;
      this.flipTex = art.flip;
      this.sleepTex = art.sleep ?? null;
      this.art = new THREE.Sprite(this.artMat);
      this.art.center.set(0.5, 0);
      this.artH = art.h;
      this.fly = art.fly;
      this.root.add(this.art);
      // 床の 影(飛ぶ 敵が どこに いるか わかるように)
      this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.04;
      this.root.add(this.shadow);
      tag.visible = false;
      const top = (this.fly ? 0.7 : 0) + this.artH + 0.15;
      this.barBg.position.y = this.bar.position.y = top;
    }
  }
  private updateArt(m: Actor, now: number, sx: number, sy: number): void {
    const sp = this.art!;
    const mat = this.artMat!;
    const tex = mat.map!;
    const img = tex.image as { width?: number; height?: number } | null;
    const aspect = img?.width && img?.height ? img.width / img.height : 1;
    // 絵は 右向き。左へ 動く ときは 左右を 反転
    const left = Math.cos(m.face) < 0;
    // ミミック: 気づくまで 置き物の ゴミ箱の 絵(2026-11-26 企画者の 絵)
    const want = this.sleepTex && !m.awake ? this.sleepTex : left ? this.flipTex! : this.rightTex!;
    if (mat.map !== want) mat.map = want;
    // 2026-11-27 企画者「敵の 動きも 少し ほしい」: 歩くと はねる・ゆれる、ため で うしろへ そる → 打つ で 前へ のめる、やられると ゆれる
    const dt = Math.max(0.001, now - this.lastT);
    const moved = Math.hypot(m.x - this.lastX, m.z - this.lastZ) / dt;
    this.lastX = m.x;
    this.lastZ = m.z;
    this.lastT = now;
    this.walkW += ((moved > 0.4 && m.act !== 'attack' ? 1 : 0) - this.walkW) * Math.min(1, dt * 10);
    this.walkPh += dt * (4 + Math.min(moved, 6) * 1.6);
    const dirS = left ? -1 : 1;
    let tilt = 0;
    let hopY = 0;
    let wx = 1;
    let wy = 1;
    let shift = 0;
    // 息(待機): ゆっくり ふくらむ
    wy += Math.sin(now * 3 + m.id) * 0.025;
    wx -= Math.sin(now * 3 + m.id) * 0.015;
    // 歩く: はねる・左右に ゆれる・着地で つぶれる
    if (this.walkW > 0.01 && !this.fly) {
      const h = Math.abs(Math.sin(this.walkPh));
      hopY = h * 0.16 * this.walkW;
      tilt += Math.sin(this.walkPh) * 0.1 * this.walkW;
      wy += (h - 0.5) * 0.08 * this.walkW;
      wx -= (h - 0.5) * 0.05 * this.walkW;
    } else if (this.walkW > 0.01) tilt += Math.sin(this.walkPh) * 0.12 * this.walkW;
    const W = isBoss(m) ? 0.9 : mobSpec(m).windup;
    if (m.act === 'attack') {
      if (!m.struck) {
        // ため: うしろへ そる
        const k = Math.min(1, m.actT / W);
        tilt += dirS * 0.22 * k;
        shift -= dirS * 0.12 * k;
      } else {
        // 打つ: 前へ のめる(すぐ もどる)
        const k = Math.max(0, 1 - (m.actT - W) / 0.3);
        tilt -= dirS * 0.28 * k;
        shift += dirS * 0.25 * k;
        wx *= 1 + 0.08 * k;
      }
    }
    if (m.act === 'hurt') {
      const k = Math.max(0, 1 - m.actT / ADV.hurtTime);
      shift += Math.sin(now * 60) * 0.08 * k;
      tilt += dirS * 0.2 * k;
    }
    // ミミック: 化けて いる 間は 動かない
    if (this.sleepTex && !m.awake) {
      tilt = 0;
      wx = wy = 1;
    }
    mat.rotation = tilt;
    sp.scale.set(this.artH * aspect * sx * wx, this.artH * (sy / 0.85) * wy, 1);
    sp.position.x = shift;
    sp.position.y = (this.fly ? 0.7 + Math.sin(now * 5 + m.id) * 0.12 : 0) + hopY;
    mat.color.setHex(0xffffff);
    if (m.act === 'attack' && !m.struck && m.actT / ADV.mob.windup > 0.5) mat.color.setHex(0xff6a7a);
    if (m.act === 'hurt') mat.color.setHex(0xff9a9a);
    mat.opacity = m.act === 'hurt' && Math.floor(now * 20) % 2 ? 0.55 : 1;
  }
  update(m: Actor, dt: number, cam: THREE.Camera, now: number): void {
    // スライムの とびかかり: 弧を えがいて とぶ(影は 床に のこす)
    // ボスの ジャンププレスは 高く・ころがり／突進は とばない
    const hopH = m.bossMove === 'press' ? 3 : m.bossMove === 'roll' || m.bossMove === 'charge' ? 0 : 1.1;
    const hopY = m.hop ? Math.sin(Math.PI * Math.min(1, m.hop.t / m.hop.dur)) * hopH : 0;
    this.root.position.set(m.x, hopY, m.z);
    if (this.shadow) this.shadow.position.y = 0.04 - hopY;
    this.body.rotation.y = -m.face;
    let sy = 0.85 + Math.sin(now * 6 + m.id) * 0.04;
    let sx = 1;
    this.mat.color.setHex(this.base);
    if (this.flyLook) this.body.position.y = this.baseY + Math.sin(now * 5 + m.id) * 0.12;
    // ミミック: 気づくまで ゴミ箱の ふり(ゆれない)
    if (!m.awake && mobSpec(m).style === 'ambush') sy = 0.85;
    const W = mobSpec(m).windup;
    if (m.act === 'attack') {
      const w = Math.min(1, m.actT / W);
      if (!m.struck) {
        // ため: ちぢんで 赤く 光る(よける 合図)
        sy = 0.85 - w * 0.25;
        sx = 1 + w * 0.2;
        this.mat.color.setHex(w > 0.5 ? 0xff4a6a : this.base);
      } else {
        sx = 1.25;
        sy = 0.7;
      }
    }
    if (m.act === 'hurt') this.mat.color.setHex(0xffffff);
    if (m.act === 'dead') {
      this.deadT += dt;
      const k = Math.max(0, 1 - this.deadT / 0.35);
      this.root.scale.setScalar(k);
      this.root.visible = k > 0;
    }
    const k0 = this.size;
    this.body.scale.set(sx * k0, (sy / 0.85) * this.sy0 * k0, sx * k0);
    if (this.art) this.updateArt(m, now, sx, sy);
    if (this.crown) {
      const top = this.art ? this.artH * (sy / 0.85) : this.baseY * 2;
      this.crown.position.set(0, top + 0.05, 0);
      this.crown.scale.setScalar(this.art ? 1.6 : 1.2);
    }
    const r = Math.max(0, m.hp / m.maxHp);
    this.bar.scale.x = r;
    this.bar.position.x = 0;
    this.barBg.quaternion.copy(cam.quaternion);
    this.bar.quaternion.copy(cam.quaternion);
    this.bar.translateX(-(1 - r) * 0.5);
    this.barBg.visible = this.bar.visible = m.hp < m.maxHp && m.act !== 'dead';
  }
}

export class DungeonView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** 2026-11-07 企画者「カメラ もっと 引きで」「もっと 2D 感」→ 遠近の ない カメラで、高い ところから 見下ろす */
  readonly camera = new THREE.OrthographicCamera(-12, 12, 7, -7, 0.1, 200);
  /** 画面の たての 広さ(世界の 長さ) */
  // 2026-11-24 企画者「若干 遠目」→ 14 → 17
  private viewH = 17;
  private grad = toonGradient();
  private rig: MonsterRig;
  private puppet: AnimeMon;
  private mobs: MobView[] = [];
  private mobTex = new Map<string, MobArt>();
  private moon!: THREE.DirectionalLight;
  private exit: THREE.Mesh;
  private exitMat: THREE.MeshBasicMaterial;
  /** しかけ(2026-11-24): 扉・スイッチ・箱・鍵・ワープの 光 */
  private doorObjs: THREE.Mesh[] = [];
  private houseDoor: THREE.Mesh | null = null;
  private plateObjs: (THREE.Mesh | null)[] = [];
  private boxObjs: (THREE.Object3D | null)[] = [];
  private keyObjs: (THREE.Object3D | null)[] = [];
  private warpRing!: THREE.Mesh;
  private pops: Pop[] = [];
  private shake = 0;
  private drops = new Map<number, THREE.Object3D>();
  private fx: Fx[] = [];
  private shotObjs = new Map<number, THREE.Object3D>();
  private mobShotObjs = new Map<number, THREE.Object3D>();
  private fieldObjs = new Map<number, THREE.Object3D>();
  private dome: THREE.Mesh;
  /** 技を ねらう 矢印(床) */
  private aimObj: THREE.Group;
  private aimState: (AimShape & { auto: boolean; dir: number }) | null = null;
  private aimKey = '';
  private buffRing: THREE.Mesh;
  /** 装備の ランクの 光(企画者「装備の 見た目 A」: ランクごとに 体の まわりが 光る) */
  private aura: THREE.Mesh;
  private auraMat: THREE.MeshBasicMaterial;
  ready = false;

  private shotArts = new Map<string, THREE.Texture | null>();
  /** 敵の 弾の 企画者の 絵(確認用ページに 入って いない 時は null) */
  private shotArt(nm: string): THREE.Texture | null {
    if (this.shotArts.has(nm)) return this.shotArts.get(nm)!;
    const path = `assets/adventure/shot_${nm}.webp`;
    const url = assetUrl(path);
    let t: THREE.Texture | null = null;
    if (!((window as { __MONZ_ASSETS?: Record<string, string> }).__MONZ_ASSETS && url === path)) {
      t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace;
    }
    this.shotArts.set(nm, t);
    return t;
  }

  /** 擬人化RPG の 試作: 自分を ドット絵の ように 見せる(3D を 小さく 写して 板に はる・8方向) */
  private pixelOpt: { on: boolean } | null = null;
  private pixRT: THREE.WebGLRenderTarget | null = null;
  private pixCam: THREE.OrthographicCamera | null = null;
  private pixQuad: THREE.Mesh | null = null;
  private pixWas = false;

  constructor(canvas: HTMLCanvasElement, s: AdvState, entrant: AnimeEntrant, private model: ModelPick, pixel: { on: boolean } | null = null) {
    this.pixelOpt = pixel;
    // 擬人化RPG の 試作は キャラを 大きく 見せる(昔の MMORPG くらいの 近さ)【仮】
    if (pixel) this.viewH = 14.5;
    // 2026-11-20 企画者「モンズランブル やってると たまに 最初に 戻っちゃう」: iPhone で メモリが 足りず ページが 読み直される →
    // 3D の 描く 細かさを 少し 下げる(細かい 画面では なめらか処理なし・最大 1.5倍)。見た目の 大きさは 同じ
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 2 });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.scene.background = new THREE.Color(0x0b0712);
    
    // 2026-11-07 企画者「もっと 2D 感」→ 光は 平らに(明るさの むらを なくす)。床は 光の 当たらない 絵の タイル
    // 2026-11-26 企画者「暗すぎて あんまり 見えない」→ あかりを 強く・床と 壁の 絵を 明るく
    this.scene.add(new THREE.HemisphereLight(0xe8e0ff, 0x6a5a7a, 2.1));
    const moon = new THREE.DirectionalLight(0xffffff, 1.2);
    moon.position.set(-4, 20, 8);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const sc = moon.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 24;
    sc.bottom = -24;
    this.scene.add(moon);
    this.scene.add(moon.target);
    this.moon = moon;
    // 自分の まわりを 照らす あかり(ダンジョンの 雰囲気)

    this.buildFloor(s);
    // 出口(全部 倒すと 光る)
    this.exitMat = new THREE.MeshBasicMaterial({ color: 0x4a3a5a, transparent: true, opacity: 0.6 });
    this.exit = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), this.exitMat);
    this.exit.rotation.x = -Math.PI / 2;
    this.exit.position.set(s.floor.exit.x, 0.03, s.floor.exit.z);
    this.scene.add(this.exit);
    this.buildPuzzles(s);
    // 自分の MONZ(MONZ RUMBLE と 同じ 体と 動き)
    this.rig = new MonsterRig(0x8fb4e8, 0xe8f0ff, 0xffd23a, this.grad);
    // 擬人化RPG の 試作: 人の 形の 体(人の 歩き方)
    this.rig.human = !!pixel;
    this.scene.add(this.rig.root);
    this.puppet = newAnimeBattle(entrant, entrant, 1).f[0];
    for (let i = 0; i < s.mobs.length; i++) {
      const v = new MobView(this.grad, this.mobArt(s.mobs[i].mobKind), s.mobs[i].mobKind);
      this.mobs.push(v);
      this.scene.add(v.root);
    }
    this.auraMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.aura = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 32), this.auraMat);
    this.aura.rotation.x = -Math.PI / 2;
    this.scene.add(this.aura);
    // 守りの ドーム(頑丈ドーム など)・強くなった 光
    // 2D: 守りは 床の 青い 六角の わく・強化は 赤い 輪
    this.dome = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.45, 6), new THREE.MeshBasicMaterial({ color: 0x8ad0ff, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.dome.rotation.x = -Math.PI / 2;
    this.dome.visible = false;
    this.scene.add(this.dome);
    this.buffRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.1, 24), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.buffRing.rotation.x = -Math.PI / 2;
    this.buffRing.visible = false;
    this.scene.add(this.buffRing);
    // ねらいの 範囲(長押し 中だけ。形は 技ごとに 作りなおす)
    this.aimObj = new THREE.Group();
    this.aimObj.visible = false;
    this.scene.add(this.aimObj);
    this.loadModel();
  }

  /** 技を ねらっている 間の 範囲(null = かくす) */
  setAim(a: (AimShape & { auto: boolean; dir: number }) | null): void {
    this.aimState = a;
  }

  /** 範囲の 形を 作る(床に 平らに・半とうめいの 黄色) */
  private buildAim(a: AimShape): void {
    for (const c of [...this.aimObj.children]) {
      this.aimObj.remove(c);
      const m = c as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    }
    const fill = (geo: THREE.BufferGeometry, op: number) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: a.self ? 0x6affb0 : 0xffe24a, transparent: true, opacity: op, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      this.aimObj.add(m);
      return m;
    };
    if (a.shape === 'band') {
      const m = fill(new THREE.PlaneGeometry(a.len, a.w), 0.3);
      m.position.x = a.len / 2;
      const e = fill(new THREE.PlaneGeometry(0.12, a.w), 0.8);
      e.position.x = a.len;
    } else if (a.shape === 'cone' || a.shape === 'fan') {
      fill(new THREE.CircleGeometry(a.len, 32, -a.arc / 2, a.arc), a.shape === 'fan' ? 0.22 : 0.3);
      fill(new THREE.RingGeometry(a.len - 0.12, a.len, 32, 1, -a.arc / 2, a.arc), 0.8);
    } else {
      fill(new THREE.CircleGeometry(a.r, 40), 0.25);
      fill(new THREE.RingGeometry(a.r - 0.12, a.r, 40), 0.85);
    }
  }

  /** 落ちている 物(2026-11-26 企画者の 絵: 回復の実・アタマ・ヨロイ・オマモリ)。装備は 足もとが ランクの 色に 光る */
  private dropMesh(item: AdvItem): THREE.Object3D {
    const g = new THREE.Group();
    const name = item.kind === 'herb' ? 'herb' : item.slot;
    let tex = this.propTex.get(`item_${name}`);
    if (!tex) {
      tex = new THREE.TextureLoader().load(assetUrl(`assets/adventure/item_${name}.webp`));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.propTex.set(`item_${name}`, tex);
    }
    const c = item.kind === 'herb' ? 0x7aff8a : RANK_HEX[item.rank];
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ map: glowTexture(), color: c, transparent: true, opacity: item.kind === 'herb' ? 0.35 : 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.4;
    g.add(glow);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.1 }));
    sp.scale.set(1.3, 1.3, 1);
    sp.position.y = 0.3;
    g.add(sp);
    return g;
  }

  private glowMat(color: number, opacity = 0.85, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial {
    // 技の 光は 壁に かくれない(2D の ように 上に 重ねる)
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side });
  }

  private addFx(obj: THREE.Object3D, life: number, tick: (k: number) => void): void {
    const mats: THREE.Material[] = [];
    obj.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) mats.push(m);
    });
    this.scene.add(obj);
    // 確認用: 見た目を ゆっくり 見る(ふだんは 1)
    life *= (window as { __MONZ_FXSLOW?: number }).__MONZ_FXSLOW ?? 1;
    this.fx.push({ obj, mats, t: 0, life, tick });
    tick(0);
  }

  /** 床に 広がる 輪(r まで) */
  private groundRing(x: number, z: number, r: number, color: number, life = 0.45, width = 0.25): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 48), this.glowMat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.07, z);
    this.addFx(m, life, (k) => {
      m.scale.setScalar(0.2 + r * (1 - (1 - k) * (1 - k)));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    });
  }

  /** ボスの 技の 前の 赤い 印(よける 合図) */
  private bossWarn(e: Extract<AdvEvent, { kind: 'bossWarn' }>): void {
    if (e.move === 'spit' || e.move === 'summon') return;
    let geo: THREE.BufferGeometry;
    if (e.move === 'club') geo = new THREE.CircleGeometry(e.r, 24, -0.8, 1.6);
    else if (e.move === 'quake') geo = new THREE.RingGeometry(e.r - 0.3, e.r, 48);
    else if (e.move === 'roll' || e.move === 'charge' || e.move === 'rock') {
      // 走る・投げる 道すじ(帯)
      const wd = e.move === 'rock' ? 1.6 : 2.6;
      geo = new THREE.PlaneGeometry(e.r, wd);
      geo.translate(e.r / 2, 0, 0);
    } else geo = new THREE.CircleGeometry(e.r, 32);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    if (e.move === 'club' || e.move === 'roll' || e.move === 'charge' || e.move === 'rock') m.rotation.z = -e.dir;
    m.position.set(e.x, 0.06, e.z);
    this.addFx(m, e.time, (k) => {
      (m.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.3 * k;
    });
  }

  /** 通常攻撃の 見た目(2D: 床に 平らな 光。段ごとに 左・右・大きく) */
  /**
   * 通常攻撃の 見た目(2026-11-26 企画者「安っぽい・もっと 重厚感・範囲を スタイリッシュに」)。
   * 先が 細い 三日月の 光を 振りぬく(1段め 右→左・2段め 左→右・3段め 大きく 1回転)。外がわに 白い 芯、少し 遅れて 色の 残像
   */
  private jabFx(e: Extract<AdvEvent, { kind: 'jab' }>): void {
    if (e.style === 'shot') return;
    const big = e.chain === 3;
    const side = e.chain === 2 ? -1 : 1;
    const color = e.style === 'whip' ? 0x30ff60 : e.style === 'dash' ? 0xffc010 : big ? 0xff4a08 : 0xff7a18;
    // 2026-11-26 企画者「通常攻撃の 当たる 位置が 分かりにくい」→ 光の 大きさ・広さを 当たる 広さと 同じに。床に 当たる 範囲を 出す
    const r = e.range;
    const arc = e.arc * 2;
    const sweep = big ? 0.9 : 0.6;
    const life = big ? 0.36 : 0.26;
    const layer = (rr: number, w: number, col: number, op: number, delay: number, y: number) => {
      const mat = new THREE.MeshBasicMaterial({ map: slashTexture(), color: col, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      mat.color.multiplyScalar(1.5);
      const m = new THREE.Mesh(crescentGeometry(rr, w, arc), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(e.x, y, e.z);
      this.addFx(m, life + delay, (k) => {
        const t = Math.max(0, (k * (life + delay) - delay) / life);
        const ease = 1 - Math.pow(1 - t, 3);
        // 振りぬく: 向きが 回りながら 少し ふくらむ
        m.rotation.z = -e.dir - side * sweep * (1 - ease);
        m.scale.setScalar(0.85 + ease * 0.2);
        (m.material as THREE.MeshBasicMaterial).opacity = op * (t < 0.1 ? t / 0.1 : 1 - Math.pow((t - 0.1) / 0.9, 2));
      });
    };
    // 床: 当たる 範囲(扇)。うすく ぬって ふちを 光らせる
    const fan = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 32, -arc / 2, arc), this.glowMat(color, 0.28, THREE.DoubleSide));
    const rim = new THREE.Mesh(new THREE.RingGeometry(r - 0.07, r, 32, 1, -arc / 2, arc), this.glowMat(0xffffff, 0.8, THREE.DoubleSide));
    fan.add(fill, rim);
    for (const sgn of [-1, 1]) {
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(r, 0.05), this.glowMat(color, 0.6, THREE.DoubleSide));
      ln.position.set(Math.cos((sgn * arc) / 2) * r * 0.5, Math.sin((sgn * arc) / 2) * r * 0.5, 0);
      ln.rotation.z = (sgn * arc) / 2;
      fan.add(ln);
    }
    fan.rotation.x = -Math.PI / 2;
    fan.rotation.z = -e.dir;
    fan.position.set(e.x, 0.06, e.z);
    this.addFx(fan, big ? 0.3 : 0.24, (k) => {
      (fill.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - k);
      (rim.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      for (const c of fan.children.slice(2)) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
    });
    layer(r, r * 0.42, color, 1, 0.03, 0.32);
    layer(r, r * 0.09, 0xffffff, 0.9, 0, 0.36);
    if (big) {
      // 3段め: 床に 衝撃の 輪 + 強い ゆれ
      this.groundRing(e.x + Math.cos(e.dir) * 0.8, e.z + Math.sin(e.dir) * 0.8, r * 1.1, 0xffb050, 0.4, 0.12);
      this.shake = Math.max(this.shake, 0.3);
    } else this.shake = Math.max(this.shake, 0.06);
    if (e.style === 'dash') {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: slashTexture(), color: 0xffe24a, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      t.rotation.x = -Math.PI / 2;
      t.rotation.z = -e.dir;
      t.position.set(e.x - Math.cos(e.dir) * 1.1, 0.2, e.z - Math.sin(e.dir) * 1.1);
      this.addFx(t, 0.25, (k) => ((t.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k)));
    }
  }

  /** 敵の 近くの 攻撃の 見た目(牙・ひっかき・地割れ・音の 波・胞子・けむり) */
  private enemyFx(e: Extract<AdvEvent, { kind: 'mobFx' }>): void {
    const bill = (tex: string, x: number, y: number, z: number, size: number, life: number, tick?: (m: THREE.Sprite, k: number) => void, rot = 0) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: meleeTexture(tex), transparent: true, depthWrite: false, depthTest: false }));
      sp.position.set(x, y, z);
      sp.material.rotation = rot;
      sp.renderOrder = 7;
      this.addFx(sp, life, (k) => {
        sp.scale.setScalar(size);
        sp.material.opacity = k < 0.6 ? 1 : (1 - k) / 0.4;
        tick?.(sp, k);
      });
    };
    const flat = (tex: string, x: number, z: number, size: number, life: number, rotZ = 0, grow = 0.3) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: meleeTexture(tex), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.set(-Math.PI / 2, 0, rotZ);
      m.position.set(x, 0.05, z);
      this.addFx(m, life, (k) => {
        m.scale.setScalar(1 - grow + grow * Math.min(1, k * 3));
        (m.material as THREE.MeshBasicMaterial).opacity = k < 0.6 ? 1 : (1 - k) / 0.4;
      });
    };
    const fx = e.x + Math.cos(e.dir) * 1.0;
    const fz = e.z + Math.sin(e.dir) * 1.0;
    const screenRot = Math.atan2(-Math.sin(e.dir) * 0.71, Math.cos(e.dir));
    switch (e.style) {
      case 'bite':
      case 'ambush':
        // 牙が とじる
        bill('bite', fx, 0.9, fz, 1.3, 0.3, (m, k) => m.scale.set(1.3, 1.3 * (1.2 - 0.6 * Math.min(1, k * 3)), 1));
        break;
      case 'slash':
        bill('claw', fx, 1.0, fz, 1.8, 0.3, undefined, screenRot);
        break;
      case 'smash':
      case 'ring':
        flat('crack', e.style === 'ring' ? e.x : fx, e.style === 'ring' ? e.z : fz, e.style === 'ring' ? e.r * 2 : 2.6, 0.7, Math.random() * 6);
        bill('smoke', e.style === 'ring' ? e.x : fx, 0.6, e.style === 'ring' ? e.z : fz, e.style === 'ring' ? e.r * 1.2 : 2, 0.6);
        if (e.style === 'ring') this.groundRing(e.x, e.z, e.r, 0xffb060, 0.45, 0.12);
        this.shake = Math.max(this.shake, 0.25);
        break;
      case 'wave':
        // 音の 波が 前へ 3つ
        for (let i = 0; i < 3; i++) {
          const d = 0.8 + i * (e.r / 3);
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: meleeTexture('sound'), transparent: true, depthWrite: false, depthTest: false }));
          sp.material.rotation = screenRot;
          sp.renderOrder = 7;
          this.addFx(sp, 0.35 + i * 0.08, (k) => {
            const t = Math.max(0, k * (0.35 + i * 0.08) - i * 0.08) / 0.35;
            sp.visible = t > 0;
            sp.position.set(e.x + Math.cos(e.dir) * d * (0.6 + t * 0.4), 1.0, e.z + Math.sin(e.dir) * d * (0.6 + t * 0.4));
            sp.scale.setScalar(1.2 + i * 0.4);
            sp.material.opacity = 1 - t;
          });
        }
        break;
      case 'spore':
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          bill('powder', e.x + Math.cos(a) * e.r * 0.5, 0.7, e.z + Math.sin(a) * e.r * 0.5, e.r * 0.9, 0.7, (m, k) => m.position.setY(0.7 + k * 0.6));
        }
        break;
      case 'blink':
        bill('smoke', e.x, 0.9, e.z, 1.8, 0.45);
        this.burst(e.x, e.z, 0x9ae8ff, 10);
        break;
    }
  }

  /** 当たった 所の 光(白い 光の 玉 + 放射の すじ)。重い 手ごたえ */
  private impact(x: number, z: number, color: number, big: boolean): void {
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    fl.position.set(x, 1.0, z);
    fl.renderOrder = 5;
    this.addFx(fl, big ? 0.22 : 0.15, (k) => {
      fl.scale.setScalar((big ? 3.4 : 2.4) * (0.5 + k * 0.8));
      fl.material.opacity = 1 - k;
    });
    const n = big ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const len = (big ? 2.0 : 1.4) * (0.6 + Math.random() * 0.5);
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.09), this.glowMat(i % 2 ? color : 0xffffff, 1, THREE.DoubleSide));
      ln.position.set(x, 1.0, z);
      ln.quaternion.copy(this.camera.quaternion);
      ln.rotateZ(a);
      this.addFx(ln, 0.16, (k) => {
        const d = 0.3 + k * len * 0.6;
        ln.position.set(x, 1.0, z);
        ln.quaternion.copy(this.camera.quaternion);
        ln.rotateZ(a);
        ln.translateX(d);
        ln.scale.x = 1 - k * 0.7;
        (ln.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      });
    }
  }

  /** 木箱の かけら */
  private splinters(x: number, z: number, n: number, colors: [number, number] = [0x8a5a32, 0x5a3a20]): void {
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: i % 3 ? colors[0] : colors[1], transparent: true }));
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3;
      const vy = 3 + Math.random() * 3;
      const rx = Math.random() * 10;
      this.addFx(b, 0.6, (k) => {
        const t = k * 0.6;
        b.position.set(x + Math.cos(a) * sp * t, Math.max(0.05, 0.8 + vy * t - 9 * t * t), z + Math.sin(a) * sp * t);
        b.rotation.set(rx * t, rx * t * 0.7, 0);
        (b.material as THREE.MeshLambertMaterial).opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
      });
    }
  }

  /** 技を 出した 時の 見た目(種類ごと) */
  private techFx(e: Extract<AdvEvent, { kind: 'tech' }>): void {
    const c = EL_HEX[e.element] ?? 0xffffff;
    const dir = e.dir;
    switch (e.fx) {
      case 'melee':
      case 'combo':
      case 'drain': {
        // 前に 三日月の 光(ひっかき・連続 打ち)
        const n = e.fx === 'combo' ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(new THREE.RingGeometry(e.r * 0.55, e.r, 24, 1, -1.1, 2.2), this.glowMat(e.fx === 'drain' ? 0x6aff8a : c));
          m.rotation.x = -Math.PI / 2;
          m.rotation.z = -dir;
          m.position.set(e.x, 0.6 + i * 0.25, e.z);
          const delay = i * 0.12;
          this.addFx(m, 0.32 + delay, (k) => {
            const kk = Math.max(0, (k * (0.32 + delay) - delay) / 0.32);
            m.visible = k * (0.32 + delay) >= delay;
            m.scale.setScalar(0.7 + kk * 0.4);
            (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - kk);
          });
        }
        break;
      }
      case 'spin':
        this.groundRing(e.x, e.z, e.r, c, 0.4, 0.4);
        this.burst(e.x, e.z, c, 14);
        break;
      case 'rush': {
        // 走った あとに 光の すじ
        const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), this.glowMat(c, 0.7, THREE.DoubleSide));
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = -dir;
        m.position.set(e.x + Math.cos(dir) * 3, 0.1, e.z + Math.sin(dir) * 3);
        this.addFx(m, 0.45, (k) => ((m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k)));
        break;
      }
      case 'beam': {
        // 2026-11-07 企画者「ビームとか もっと 2D ぽく」→ 床に 平らな 光の 帯(白い しん・色の ふち・先の 丸)
        const g = new THREE.Group();
        const mk = (w: number, color: number, op: number) => {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(e.len, w), this.glowMat(color, op, THREE.DoubleSide));
          m.rotation.x = -Math.PI / 2;
          m.position.x = e.len / 2;
          g.add(m);
          return m;
        };
        const outer = mk(e.r * 1.25, c, 0.55);
        const mid = mk(e.r * 0.7, c, 0.8);
        const core = mk(e.r * 0.3, 0xffffff, 1);
        const tip = new THREE.Mesh(new THREE.CircleGeometry(e.r * 0.75, 24), this.glowMat(c, 0.8));
        tip.rotation.x = -Math.PI / 2;
        tip.position.x = e.len;
        g.add(tip);
        g.rotation.y = -dir;
        // 体の 前から 出す(2026-11-07 企画者)
        g.position.set(e.x + Math.cos(dir) * 0.9, 0.9, e.z + Math.sin(dir) * 0.9);
        this.addFx(g, 0.5, (k) => {
          const w = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
          for (const [m, op] of [[outer, 0.55], [mid, 0.8], [core, 1], [tip, 0.8]] as const) {
            m.scale.set(1, Math.max(0.05, w), 1);
            (m.material as THREE.MeshBasicMaterial).opacity = op * Math.max(0, w);
          }
          tip.scale.setScalar(Math.max(0.05, w));
        });
        break;
      }
      case 'quake':
        this.groundRing(e.x, e.z, e.r, c, 0.5, 0.3);
        this.groundRing(e.x, e.z, e.r * 0.6, 0xffffff, 0.35, 0.2);
        this.shake = Math.max(this.shake, 0.35);
        break;
      case 'drop':
        this.groundRing(e.tx, e.tz, e.r, c, 0.45, 0.35);
        this.burst(e.tx, e.tz, c, 16);
        this.shake = Math.max(this.shake, 0.4);
        break;
      case 'pillar': {
        // 2D: 床に 光の 円と 星の 形の 光が はじける
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(e.r, 32), this.glowMat(c, 0.6));
        const star = new THREE.Mesh(starGeometry(e.r * 1.1, e.r * 0.35, 8), this.glowMat(0xffffff, 0.9));
        for (const m of [disc, star]) m.rotation.x = -Math.PI / 2;
        g.add(disc, star);
        g.position.set(e.tx, 0.1, e.tz);
        this.addFx(g, 0.55, (k) => {
          disc.scale.setScalar(0.3 + k * 0.8);
          star.scale.setScalar(0.4 + Math.min(1, k * 3) * 0.8);
          star.rotation.z = k * 1.5;
          (disc.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k);
          (star.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        });
        this.groundRing(e.tx, e.tz, e.r, c, 0.6, 0.3);
        this.shake = Math.max(this.shake, 0.45);
        break;
      }
      case 'debuff':
        // ほえる 声の 波(3重)
        for (let i = 0; i < 3; i++) this.groundRing(e.x, e.z, e.r * (0.6 + i * 0.2), 0xb070ff, 0.5 + i * 0.12, 0.12);
        break;
      case 'heal':
        this.groundRing(e.x, e.z, e.r, 0x6aff8a, 0.6, 0.2);
        break;
      case 'barrier':
        this.groundRing(e.x, e.z, 1.6, 0x8ad0ff, 0.4, 0.3);
        break;
      case 'buff':
        this.groundRing(e.x, e.z, 1.6, 0xff6a3a, 0.4, 0.3);
        this.burst(e.x, e.z, 0xff8a3a, 12);
        break;
      default:
        break;
    }
  }


  /** 床と 壁(箱を ならべる) */
  /** しかけの 見た目【仮】: 扉(しかけの 種類で 色)・スイッチ・箱・鍵・ワープ */
  /** しかけ・扉の 企画者の 絵(2026-11-27 design/adventure/gimmicks)。確認用ページに ない 時は null(前の 形) */
  private gimTex(name: string): THREE.Texture | null {
    const path = `assets/adventure/gim_${name}.webp`;
    const url = assetUrl(path);
    if ((window as { __MONZ_ASSETS?: Record<string, string> }).__MONZ_ASSETS && url === path) return null;
    let t = this.propTex.get(`gim_${name}`);
    if (!t) {
      t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      this.propTex.set(`gim_${name}`, t);
    }
    return t;
  }
  /** カメラに 向いた 板(扉・箱。カメラは いつも 同じ 向き = 45度 見下ろし) */
  private gimBoard(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, color: 0xe8e4f0 }));
    m.rotation.x = -Math.PI / 4;
    return m;
  }

  private buildPuzzles(s: AdvState): void {
    const DOOR_HEX: Record<string, number> = { kill: 0xff4a5a, switch: 0x4aa8ff, box: 0xff9a2a, key: 0xffd23a, none: 0x888888 };
    s.floor.doors.forEach((d, i) => {
      const kind = s.puzzles[i]?.kind ?? 'none';
      const dt = this.gimTex('door');
      const g = d.horiz ? new THREE.BoxGeometry(0.6, 2.2, CELL * 2) : new THREE.BoxGeometry(CELL * 2, 2.2, 0.6);
      // 横へ のびる 通路の 扉は カメラから 見ると 細いので はばを せまく
      const m = dt ? this.gimBoard(dt, d.horiz ? CELL * 1.1 : CELL * 2.1, (CELL * 2.1 * 207) / 384 * 1.4) : new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: DOOR_HEX[kind], emissive: DOOR_HEX[kind], emissiveIntensity: 0.35 }));
      // 絵の 扉は 床から 立つ(位置は 足もと)
      m.position.set(d.x, dt ? 0 : 1.1, d.z);
      if (dt) m.userData.base = 0;
      m.castShadow = true;
      m.visible = !s.puzzles[i]?.solved;
      this.scene.add(m);
      this.doorObjs.push(m);
    });
    // モンスター部屋の 扉(とじこめ の 間だけ 出る。赤く 光る)
    for (const sd of s.floor.sides.filter((x) => x.house)) {
      const xs = sd.door.map((c) => c % s.floor.w);
      const ys = sd.door.map((c) => Math.floor(c / s.floor.w));
      const horiz = ys[0] !== ys[1];
      const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * CELL;
      const cz = ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * CELL;
      const g = horiz ? new THREE.BoxGeometry(0.6, 2.2, CELL * 2) : new THREE.BoxGeometry(CELL * 2, 2.2, 0.6);
      const ht = this.gimTex('door_house');
      const m = ht ? this.gimBoard(ht, horiz ? CELL * 1.1 : CELL * 2.1, (CELL * 2.1 * 212) / 384 * 1.4) : new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xc0203a, emissive: 0xff2040, emissiveIntensity: 0.6 }));
      if (ht) (m.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
      m.position.set(cx, ht ? 0 : 1.1, cz);
      m.visible = false;
      this.scene.add(m);
      this.houseDoor = m;
    }
    s.puzzles.forEach((z) => {
      // スイッチ(床の 四角)
      if (z.plate) {
        const st = this.gimTex('switch');
        const m = st
          ? new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.95, CELL * 0.95 * (232 / 256)), new THREE.MeshBasicMaterial({ map: st, transparent: true, alphaTest: 0.2 }))
          : new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.8, 0.12, CELL * 0.8), new THREE.MeshLambertMaterial({ color: z.kind === 'box' ? 0xff9a2a : 0x4aa8ff, emissive: z.kind === 'box' ? 0xff9a2a : 0x4aa8ff, emissiveIntensity: 0.5 }));
        if (st) m.rotation.x = -Math.PI / 2;
        m.position.set(z.plate.x, st ? 0.04 : 0.06, z.plate.z);
        this.scene.add(m);
        this.plateObjs.push(m);
      } else this.plateObjs.push(null);
      // 押す 箱(木の 箱)
      if (z.box && this.gimTex('box')) {
        const g = new THREE.Group();
        const bsz = ADV.puzzle.box * 2.4;
        g.add(this.gimBoard(this.gimTex('box')!, bsz * (246 / 256), bsz * 1.15));
        this.scene.add(g);
        this.boxObjs.push(g);
      } else if (z.box) {
        const g = new THREE.Group();
        const c = new THREE.Mesh(new THREE.BoxGeometry(ADV.puzzle.box * 2, 1.4, ADV.puzzle.box * 2), new THREE.MeshLambertMaterial({ color: 0xa8743a }));
        c.position.y = 0.7;
        c.castShadow = true;
        const band = new THREE.Mesh(new THREE.BoxGeometry(ADV.puzzle.box * 2 + 0.04, 0.18, ADV.puzzle.box * 2 + 0.04), new THREE.MeshLambertMaterial({ color: 0x5a3a1a }));
        band.position.y = 0.7;
        g.add(c, band);
        this.scene.add(g);
        this.boxObjs.push(g);
      } else this.boxObjs.push(null);
      // 鍵(金色)
      if (z.key && this.gimTex('key')) {
        const g = new THREE.Group();
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.gimTex('key')!, transparent: true }));
        sp.scale.set(1.1, 1.2, 1);
        g.add(sp);
        g.position.set(z.key.x, 0.9, z.key.z);
        this.scene.add(g);
        this.keyObjs.push(g);
      } else if (z.key) {
        const g = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: 0xffd23a, emissive: 0xffb000, emissiveIntensity: 0.5 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 8, 16), mat);
        ring.position.y = 0.35;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), mat);
        bar.position.y = -0.1;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), mat);
        tooth.position.set(0.1, -0.3, 0);
        g.add(ring, bar, tooth);
        g.position.set(z.key.x, 0.9, z.key.z);
        this.scene.add(g);
        this.keyObjs.push(g);
      } else this.keyObjs.push(null);
    });
    // ワープ(さいごの 部屋)。まわる 光の 輪
    const wt = this.gimTex('warp');
    this.warpRing = wt
      ? new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: wt, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide }))
      : new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 6), new THREE.MeshBasicMaterial({ color: 0xb07aff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    if (wt) this.warpRing.userData.art = true;
    this.warpRing.rotation.x = -Math.PI / 2;
    this.warpRing.position.set(s.floor.exit.x, 0.08, s.floor.exit.z);
    this.scene.add(this.warpRing);
  }

  private propTex = new Map<string, THREE.Texture>();
  /** 置き物(floor.props の 番号 → 見た目)。こわれた 木箱は 消す */
  private propObjs = new Map<number, THREE.Object3D>();

  private buildFloor(s: AdvState): void {
    const f = s.floor;
    const floors: number[] = [];
    const walls: number[] = [];
    for (let y = 0; y < f.h; y++)
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        if (f.tiles[i] !== WALL) floors.push(i);
        else {
          // 床の となりの 壁だけ 立てる
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < f.w && yy < f.h && f.tiles[yy * f.w + xx] !== WALL) near = true;
            }
          if (near) walls.push(i);
        }
      }
    // 2026-11-25 企画者の 絵(路地裏: アスファルトの 床・レンガの 壁・コンクリートの 壁の 上)。
    // 絵は 場所で 貼る(マスごとに 同じ 絵が くり返して 見えないように)。つなぎ目は 鏡に うつす 並べ方で 消す
    const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= f.w || y >= f.h || f.tiles[y * f.w + x] === WALL;
    const FLOOR_UV = 8;
    const WALL_UV = 4;
    const SIDE_UV = 6;
    const H = 2.0;
    const fp: number[] = [];
    const fu: number[] = [];
    for (const i of floors) {
      const x0 = (i % f.w) * CELL;
      const z0 = Math.floor(i / f.w) * CELL;
      const q = [[x0, z0], [x0, z0 + CELL], [x0 + CELL, z0 + CELL], [x0, z0], [x0 + CELL, z0 + CELL], [x0 + CELL, z0]];
      for (const [x, z] of q) {
        fp.push(x, 0, z);
        fu.push(x / FLOOR_UV, -z / FLOOR_UV);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    fg.computeVertexNormals();
    const fl = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: new THREE.Color(1.45, 1.45, 1.5), map: this.tileTex('tile_floor', tileTexture) }));
    fl.receiveShadow = true;
    this.scene.add(fl);
    // 壁: 上の 面(コンクリート)と、床に 向いた 横の 面(レンガ)
    const tp: number[] = [];
    const tu: number[] = [];
    const sp: number[] = [];
    const su: number[] = [];
    const quad = (P: number[], UV: number[], a: number[], b: number[], c: number[], d: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => {
      for (const [v, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]] as [number[], number[]][]) {
        P.push(...v);
        UV.push(...u);
      }
    };
    for (const i of walls) {
      const cx = i % f.w;
      const cy = Math.floor(i / f.w);
      const x0 = cx * CELL;
      const z0 = cy * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const t = (x: number, z: number) => [x / WALL_UV, -z / WALL_UV];
      quad(tp, tu, [x0, H, z0], [x0, H, z1], [x1, H, z1], [x1, H, z0], t(x0, z0), t(x0, z1), t(x1, z1), t(x1, z0));
      // レンガは 少し 大きく 見せる
      const v0 = 0;
      const v1 = H / SIDE_UV;
      // 南(+z)・北(-z)・東(+x)・西(-x) の 面。となりが 床の ときだけ
      if (!isWall(cx, cy + 1)) quad(sp, su, [x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1], [x0 / SIDE_UV, v0], [x1 / SIDE_UV, v0], [x1 / SIDE_UV, v1], [x0 / SIDE_UV, v1]);
      if (!isWall(cx, cy - 1)) quad(sp, su, [x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0], [x1 / SIDE_UV, v0], [x0 / SIDE_UV, v0], [x0 / SIDE_UV, v1], [x1 / SIDE_UV, v1]);
      if (!isWall(cx + 1, cy)) quad(sp, su, [x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1], [z1 / SIDE_UV, v0], [z0 / SIDE_UV, v0], [z0 / SIDE_UV, v1], [z1 / SIDE_UV, v1]);
      if (!isWall(cx - 1, cy)) quad(sp, su, [x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0], [z0 / SIDE_UV, v0], [z1 / SIDE_UV, v0], [z1 / SIDE_UV, v1], [z0 / SIDE_UV, v1]);
    }
    const mk = (P: number[], UV: number[], tex: THREE.Texture, bright = 1) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: new THREE.Color(bright, bright, bright), map: tex }));
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    mk(tp, tu, this.tileTex('tile_walltop', wallTexture), 1.3);
    mk(sp, su, this.tileTex('tile_wall', wallTexture), 1.7);
    this.buildProps(s);
  }

  /**
   * 置き物・床の 模様・ネオン看板(2026-11-25 企画者の 絵)。
   * カメラは いつも 同じ 向き(南 ななめ 上 45度)なので、置き物は カメラに 向いた たての 板。
   * 板を √2 倍 高くすると 画面では 絵の とおりの 形に 見える(ななめの 板だと 北の 壁に めりこむため)
   */
  private buildProps(s: AdvState): void {
    const f = s.floor;
    const has = (name: string) => {
      const path = `assets/adventure/${name}.webp`;
      return !((window as { __MONZ_ASSETS?: Record<string, string> }).__MONZ_ASSETS && assetUrl(path) === path);
    };
    const tex = (name: string) => {
      let t = this.propTex.get(name);
      if (!t) {
        t = new THREE.TextureLoader().load(assetUrl(`assets/adventure/${name}.webp`));
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        this.propTex.set(name, t);
      }
      return t;
    };
    // 置き物の 高さ(世界の 長さ)・横の はば は 絵の 形から。【仮】大きさ
    const SIZE: Record<string, { h: number; aspect: number; shade?: number }> = {
      trash: { h: 1.5, aspect: 240 / 320 },
      dumpster: { h: 1.75, aspect: 384 / 361 },
      boxes: { h: 1.6, aspect: 311 / 320 },
      bags: { h: 1.2, aspect: 320 / 280 },
      drum: { h: 1.6, aspect: 195 / 320 },
      crate: { h: 1.45, aspect: 282 / 320 },
      lamp: { h: 3.4, aspect: 105 / 384 },
    };
    const STAND = Math.SQRT2;
    for (const [pi, p] of f.props.entries()) {
      const z = SIZE[p.kind];
      const name = `prop_${p.kind}`;
      const x = (p.cx + 0.5) * CELL;
      const zz = (p.cy + 0.5) * CELL;
      if (!has(name)) {
        // 絵が ない ときは 仮の 箱
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, z.h * 0.7, 1.4), new THREE.MeshLambertMaterial({ color: 0x5a5466 }));
        b.position.set(x, z.h * 0.35, zz);
        this.scene.add(b);
        this.propObjs.set(pi, b);
        continue;
      }
      const w = Math.min(CELL * 1.05, z.h * z.aspect);
      const h = (w / z.aspect) * STAND;
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(0, h / 2, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex(name), transparent: true, alphaTest: 0.35, color: 0xffffff }));
      // 少し ずらして 置き物どうしが きれいに ならばない ように
      const jx = (((p.cx * 73 + p.cy * 37) % 7) / 7 - 0.5) * 0.3;
      m.position.set(x + jx, 0.01, zz + 0.15);
      this.scene.add(m);
      this.propObjs.set(pi, m);
      if (p.kind === 'lamp') {
        // 街灯の あかり(光の 玉 + 足もとの 光)
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb860, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.set(2.6, 2.6, 1);
        glow.position.set(x + jx, h * 0.83, zz + 0.25);
        this.scene.add(glow);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x806030, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(x + jx, 0.03, zz + 1.2);
        this.scene.add(pool);
      }
    }
    // 床の 模様(水たまり・マンホール)。床に ぴったり
    for (const d of f.decals) {
      const name = `prop_${d.kind}`;
      if (!has(name)) continue;
      const aspect = d.kind === 'puddle' ? 384 / 216 : 374 / 384;
      const g = new THREE.PlaneGeometry(d.size * aspect, d.size);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex(name), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: d.kind === 'puddle' ? 0.9 : 1 }));
      m.rotation.set(-Math.PI / 2, 0, d.rot);
      m.position.set(d.x, 0.015, d.z);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // ネオン看板(北の 壁の 面に はりつく。光る)
    if (has('prop_neon'))
      for (const sg of f.signs) {
        const w = 1.7;
        const h = (w * 312) / 320;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex('prop_neon'), transparent: true, alphaTest: 0.3 }));
        m.position.set(sg.x, 1.15, sg.z + 0.04);
        this.scene.add(m);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3ad0, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.set(2.4, 2.0, 1);
        glow.position.set(sg.x - 0.15, 1.05, sg.z + 0.3);
        this.scene.add(glow);
      }
  }

  /** 床・壁の 絵(なければ 前の 仮の 絵) */
  private tileTex(name: string, fallback: () => THREE.Texture): THREE.Texture {
    const path = `assets/adventure/${name}.webp`;
    const url = assetUrl(path);
    // 確認用ページで 絵が 入っていない ときは 仮の 絵
    if ((window as { __MONZ_ASSETS?: Record<string, string> }).__MONZ_ASSETS && url === path) return fallback();
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  private loadModel(): void {
    const m = this.model;
    if (!m) {
      this.ready = true;
      return;
    }
    const done = (g: { scene: THREE.Object3D }) => {
      try {
        this.rig.useModel(g.scene, m.height, m.hue ?? 0, m.bones, m.amp, m.rig);
        this.rig.setModelFile(m.file);
      } catch {
        // 使えない モデルは 仮の 形の まま
      }
      this.ready = true;
    };
    const fail = () => {
      this.ready = true;
    };
    const url = assetUrl(m.file);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      if (url.startsWith('data:')) {
        const bin = atob(url.slice(url.indexOf(',') + 1));
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        // iPhone の アプリでは 絵を fetch で 読めないので、その間だけ createImageBitmap を かくす(animeField と 同じ)
        const w = window as unknown as { createImageBitmap?: unknown };
        const cib = w.createImageBitmap;
        w.createImageBitmap = undefined;
        try {
          loader.parse(buf.buffer, '', done, fail);
        } finally {
          w.createImageBitmap = cib;
        }
      } else loader.load(url, done, undefined, fail);
    } catch {
      fail();
    }
  }

  private mobArt(kind: string | undefined): MobArt | null {
    const a = kind ? MOB_ART[kind] : undefined;
    if (!a) return null;
    let art = this.mobTex.get(kind!);
    if (!art) {
      const tex = new THREE.TextureLoader().load(assetUrl(a.file));
      tex.colorSpace = THREE.SRGBColorSpace;
      const flip = new THREE.TextureLoader().load(assetUrl(a.file));
      flip.colorSpace = THREE.SRGBColorSpace;
      flip.repeat.x = -1;
      flip.offset.x = 1;
      art = { tex, flip, h: a.h, fly: a.fly };
      if (kind === 'mimic') {
        art.sleep = new THREE.TextureLoader().load(assetUrl('assets/adventure/prop_trash.webp'));
        art.sleep.colorSpace = THREE.SRGBColorSpace;
      }
      this.mobTex.set(kind!, art);
    }
    return art;
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    const a = w / Math.max(1, h);
    this.camera.top = this.viewH / 2;
    this.camera.bottom = -this.viewH / 2;
    this.camera.left = (-this.viewH * a) / 2;
    this.camera.right = (this.viewH * a) / 2;
    this.camera.updateProjectionMatrix();
  }

  private pop(text: string, color: string, x: number, y: number, z: number, size = 0.9): void {
    const mat = new THREE.SpriteMaterial({ map: numberTexture(text, color), transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.set(size * 4, size, 1);
    sp.renderOrder = 20;
    this.scene.add(sp);
    this.pops.push({ obj: sp, t: 0, life: 0.7, vy: 2.2, grow: 0 });
  }

  private burst(x: number, z: number, color: number, n = 8): void {
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.position.set(x + (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.6);
      sp.scale.setScalar(0.25);
      this.scene.add(sp);
      this.pops.push({ obj: sp, t: 0, life: 0.35, vy: 1 + Math.random() * 2, grow: 2 });
    }
  }

  /** 1フレーム 描く */
  render(s: AdvState, events: AdvEvent[], dt: number): void {
    const now = performance.now() / 1000;
    const p = s.player;
    for (const e of events) {
      if (e.kind === 'hit') {
        const toMe = e.target === 0;
        // 2026-11-07 企画者「エフェクトで 文字は 出さない・critical 小さく」→「ダメージ数は 出して」
        this.pop(String(e.dmg), toMe ? '#ff6a6a' : e.crit ? '#ffd23a' : '#ffffff', e.x, 2.1, e.z, e.crit ? 0.95 : 0.8);
        if (e.crit) this.pop('CRITICAL', '#ffd23a', e.x, 2.75, e.z, 0.4);
        this.burst(e.x, e.z, toMe ? 0xff4a4a : 0xffc060, e.crit ? 14 : 8);
        if (!toMe && !this.pixelOpt) this.impact(e.x, e.z, e.crit ? 0xffd23a : 0xffa040, e.crit);
        if (!toMe && this.pixelOpt) this.rpgHit(e.x, e.z, e.crit);
        this.shake = Math.max(this.shake, toMe ? 0.25 : e.crit ? 0.32 : 0.2);
        if (toMe) this.rig.flash = 0.12;
      } else if (e.kind === 'house') {
        if (this.houseDoor) this.houseDoor.visible = e.state === 'locked';
        if (e.state === 'locked') {
          this.shake = Math.max(this.shake, 0.5);
          this.groundRing(e.x, e.z, 10, 0xff2040, 0.8, 0.1);
        } else if (e.state === 'done') this.burst(this.houseDoor?.position.x ?? e.x, this.houseDoor?.position.z ?? e.z, 0x7affd0, 24);
      } else if (e.kind === 'crate') {
        const m = this.propObjs.get(e.prop);
        // かけらの 色: 木箱 = 木・段ボール = 茶色の 紙・ゴミ箱 = 灰色の 金属
        const kind = s.floor.props[e.prop]?.kind;
        this.splinters(e.x, e.z, e.broken ? 14 : 4, kind === 'trash' ? [0x9a98a4, 0x5a5866] : kind === 'boxes' ? [0xc09060, 0x8a6038] : undefined);
        this.shake = Math.max(this.shake, e.broken ? 0.25 : 0.12);
        if (m && e.broken) {
          this.scene.remove(m);
          this.propObjs.delete(e.prop);
        } else if (m) {
          const x0 = m.position.x;
          this.addFx(new THREE.Object3D(), 0.18, (k) => (m.position.x = x0 + Math.sin(k * 30) * 0.12 * (1 - k)));
        }
      } else if (e.kind === 'die') this.burst(e.x, e.z, 0xb070ff, 18);
      else if (e.kind === 'open') this.burst(e.x, e.z, 0x7affd0, 24);
      else if (e.kind === 'door') {
        const d = s.floor.doors[e.door];
        const o = this.doorObjs[e.door];
        if (o) this.addFx(o, 0.5, (k) => {
          o.position.y = (o.userData.base ?? 1.1) - k * 2.4;
          if (k >= 1) o.visible = false;
        });
        if (d) this.burst(d.x, d.z, 0x7affd0, 18);
        this.shake = Math.max(this.shake, 0.15);
      } else if (e.kind === 'press') this.burst(e.x, e.z, 0x7aff8a, 14);
      else if (e.kind === 'key') this.burst(e.x, e.z, 0xffd23a, 16);
      else if (e.kind === 'boxReset') this.burst(e.x, e.z, 0xc0a080, 12);
      else if (e.kind === 'drop') {
        const o = this.dropMesh(e.drop.item);
        o.position.set(e.drop.x, 0.45, e.drop.z);
        this.scene.add(o);
        this.drops.set(e.drop.id, o);
      } else if (e.kind === 'pick') {
        const o = this.drops.get(e.drop.id);
        if (o) this.scene.remove(o);
        this.drops.delete(e.drop.id);
        this.burst(p.x, p.z, e.drop.item.kind === 'herb' ? 0x7aff8a : RANK_HEX[e.drop.item.rank], 8);
      } else if (e.kind === 'tech') {
        if (this.pixelOpt) this.rpgTechFx(e, s);
        else this.techFx(e);
      } else if (e.kind === 'jab') {
        if (this.pixelOpt) this.rpgJab(e);
        else this.jabFx(e);
      }
      else if (e.kind === 'status') this.burst(e.x, e.z, 0xc080ff, 6);
      else if (e.kind === 'bossWarn') this.bossWarn(e);
      else if (e.kind === 'mobFx' && (e.style === 'counter' || e.style === 'finale')) {
        // 擬人化RPG 拳闘士: よけて 反撃・連打の さいごの アッパー
        if (e.style === 'counter') {
          this.fxBill('star', 0xffffff, s.player.x, 1.4, s.player.z, 1.6, 0.3, 0.5);
          this.fxBill('spark', 0xffe0a0, e.x, 1.0, e.z, 2.0, 0.3, 0.6);
          this.shake = Math.max(this.shake, 0.25);
        } else {
          const fx = e.x + Math.cos(e.dir) * 1.3;
          const fz = e.z + Math.sin(e.dir) * 1.3;
          this.fxBill('pillar', 0xffd080, fx, 1.6, fz, 3.4, 0.4, 0.3, 0, 2 / 3);
          this.fxBill('spark', 0xffffff, fx, 1.2, fz, 2.8, 0.35, 0.6);
          this.fxGround('ring', 0xffb060, fx, fz, 3.2, 0.45, 0.8);
          this.shake = Math.max(this.shake, 0.45);
        }
      } else if (e.kind === 'mobFx' && ['press', 'club', 'spin', 'quake', 'spit', 'summon'].includes(e.style)) {
        const c = e.style === 'quake' ? 0xffb03a : e.style === 'spit' ? 0x9aff5a : e.style === 'summon' ? 0xc07aff : 0xff6a3a;
        if (e.style !== 'spit' && e.style !== 'press') this.groundRing(e.x, e.z, e.r, c, e.style === 'quake' ? 0.6 : 0.4, e.style === 'quake' ? 0.12 : 0.25);
        if (e.style === 'quake' || e.style === 'club') this.shake = Math.max(this.shake, 0.4);
      } else if (e.kind === 'mobFx' && ['ring', 'blink', 'bite', 'ambush', 'slash', 'smash', 'wave', 'spore'].includes(e.style)) {
        this.enemyFx(e);
      } else if (e.kind === 'mobFx') {
        // 敵の 攻撃の 見た目【仮】: 胞子 ピンク・重い パンチ オレンジ・超音波 紫・ほか 白
        const c = e.style === 'spore' ? 0xff5ab0 : e.style === 'smash' ? 0xff8a2a : e.style === 'wave' ? 0xb05aff : 0xffffff;
        const fx = e.style === 'spore' || e.style === 'smash' || e.style === 'wave';
        this.groundRing(fx ? e.x : e.x + Math.cos(e.dir) * 0.9, fx ? e.z : e.z + Math.sin(e.dir) * 0.9, fx ? e.r : 1.0, c, 0.4);
        if (e.style === 'spore') this.burst(e.x, e.z, 0xff8ad0, 12);
        if (e.style === 'smash') this.shake = Math.max(this.shake, 0.25);
      }
      else if (e.kind === 'heal' && e.amount > 0) {
        this.burst(e.x, e.z, 0x5aff8a, 10);
      }
    }
    // 自分の MONZ: MONZ RUMBLE の 体を 動かす(人形に 今の 動きを 入れる)
    const f = this.puppet;
    f.x = p.x;
    f.z = p.z;
    f.y = 0;
    f.vy = 0;
    f.vx = p.vx;
    f.vz = p.vz;
    f.face = p.face;
    f.speed = Math.hypot(p.vx, p.vz);
    const W = ADV.player.windup;
    const tc = p.act === 'tech' ? s.techs[s.techSlot] : null;
    // 技は その技の 動き(MONZ RUMBLE の 体の 動き)で 見せる(2026-11-07 企画者「技の モーションが 全部 一緒」)
    const tw = tc ? techWindup(tc.kind) : W;
    f.act =
      tc
        ? { k: 'tech', id: tc.id, t: p.actT, dir: p.face, fired: p.actT >= tw, hit: p.actT >= tw, tx: p.x, tz: p.z, windup: tw, n: p.actT >= tw ? 1 : 0, next: 0 }
        : p.act === 'attack'
          ? // 続け打ちの 段(1・2・3)で 左右の 手・足が かわる(MONZ RUMBLE の 通常攻撃の 動き)
            { k: 'tech', id: 'punch', t: p.actT, dir: p.face, fired: p.actT >= W, hit: false, tx: p.x, tz: p.z, windup: W, n: p.actT >= W ? s.chain : Math.max(0, s.chain - 1), next: W + 0.16 }
          : p.act === 'hurt'
            ? { k: 'hurt', t: p.actT, until: ADV.hurtTime }
            : p.act === 'dead'
              ? { k: 'ko', t: p.actT }
              : { k: 'free' };
    // とびおり・地面の 技は とび上がる
    if (tc && (tc.kind === 'drop' || tc.kind === 'quake') && p.actT < tw) f.y = Math.sin(Math.PI * (p.actT / tw)) * (tc.kind === 'drop' ? 3 : 0.9);
    if (this.pixelOpt) this.rpgCast(s, dt);
    this.rig.guard = (s.counterUntil ?? 0) > s.t ? 1 : 0;
    // ドットの 見た目は 8方向(昔の MMORPG の キャラの 絵と 同じ)
    if (this.pixelOpt?.on) f.face = Math.round(f.face / (Math.PI / 4)) * (Math.PI / 4);
    this.rig.update(f, dt);
    // 落ちている 物: くるくる・ふわふわ
    for (const o of this.drops.values()) {
      o.rotation.y += dt * 2;
      o.position.y = 0.45 + Math.sin(now * 3 + o.id) * 0.08;
    }
    // 装備の 3D(2026-11-26 企画者「装備したら 見た目 変えたい」)
    const gearLook: Partial<Record<'head' | 'armor' | 'charm', [number, number]>> = {};
    for (const k of ['head', 'armor', 'charm'] as const) {
      const g = s.gear[k];
      if (g) gearLook[k] = [RANK_HEX[g.rank], RANKS.indexOf(g.rank)];
    }
    this.rig.setGear(gearLook);
    // 装備の ランクの 光(いちばん 高い ランク)
    const best = (['head', 'armor', 'charm'] as const).reduce((r, k) => Math.max(r, s.gear[k] ? RANKS.indexOf(s.gear[k]!.rank) : -1), -1);
    this.auraMat.opacity = best < 0 ? 0 : 0.25 + best * 0.1 + Math.sin(now * 4) * 0.08;
    if (best >= 0) this.auraMat.color.setHex(RANK_HEX[RANKS[best]]);
    this.aura.position.set(p.x, 0.06, p.z);
    this.aura.scale.setScalar(1 + best * 0.12);
    // ボスが 呼んだ 敵
    while (this.mobs.length < s.mobs.length) {
      const m = s.mobs[this.mobs.length];
      const v = new MobView(this.grad, this.mobArt(m.mobKind), m.mobKind);
      this.mobs.push(v);
      this.scene.add(v.root);
    }
    s.mobs.forEach((m, i) => this.mobs[i].update(m, dt, this.camera, now));
    // ワープ: ボスを たおすまで 暗い
    this.warpRing.visible = this.exit.visible = s.exitOpen;
    // 出口(ワープ)
    this.exitMat.color.setHex(0xb07aff);
    this.exitMat.opacity = 0.45 + Math.sin(now * 5) * 0.2;
    // 絵の ワープは ゆっくり 回る・少し 光る
    this.warpRing.rotation.z = now * (this.warpRing.userData.art ? 0.4 : 1.5);
    this.warpRing.scale.setScalar(1 + Math.sin(now * 3) * (this.warpRing.userData.art ? 0.03 : 0.08));
    // しかけ
    s.puzzles.forEach((z, i) => {
      const b = this.boxObjs[i];
      if (b && z.box) b.position.set(z.box.x, 0, z.box.z);
      const k = this.keyObjs[i];
      if (k && z.key) {
        k.visible = !z.key.taken;
        k.rotation.y = now * 2;
        k.position.y = 0.9 + Math.sin(now * 3) * 0.12;
      }
      const pl = this.plateObjs[i];
      if (pl && z.plate) {
        const mt = pl.material as THREE.MeshLambertMaterial;
        if (mt.map) {
          const want = this.gimTex(z.plate.pressed ? 'switch_on' : 'switch');
          if (want && mt.map !== want) mt.map = want;
        } else mt.emissive.setHex(z.plate.pressed ? 0x5aff8a : z.kind === 'box' ? 0xff9a2a : 0x4aa8ff);
      }
    });
    // 弾(属性の 色の 光の 玉)
    const live = new Set<number>();
    for (const sh of s.shots) {
      live.add(sh.id);
      let o = this.shotObjs.get(sh.id);
      if (!o) {
        const c = EL_HEX[sh.tech.element] ?? 0xffffff;
        // 属性に あった 絵(炎 = 火の玉・水 = しずく・雷 = いなずま・自然 = 葉・光 = 星・闇 = 闇の 玉・無 = 気の 弾)。うしろに うすい 光
        const g = new THREE.Group();
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(sh.r * 3.5);
        const enm = SHOT_EL[sh.tech.element] ?? 'none';
        // 2026-11-27 企画者の 絵(design/adventure/shots)。なければ プログラムの 絵
        const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.shotArt(enm) ?? shotTexture(enm), transparent: true, depthWrite: false, depthTest: false }));
        const sz = Math.max(0.9, sh.r * 3.4);
        core.scale.set(sz * 2, sz, 1);
        core.material.rotation = Math.atan2(-sh.vz * 0.71, sh.vx);
        g.add(glow, core);
        this.scene.add(g);
        this.shotObjs.set(sh.id, g);
        o = g;
      }
      o.position.set(sh.x, 0.8, sh.z);
    }
    for (const [id, o] of this.shotObjs)
      if (!live.has(id)) {
        this.scene.remove(o);
        this.shotObjs.delete(id);
        this.burst(o.position.x, o.position.z, 0xffd080, 5);
      }
    // 敵の 弾(羽: 白・エネルギー弾: 水色・糸: 白い 大きめ)
    const liveM = new Set<number>();
    for (const sh of s.mobShots) {
      liveM.add(sh.id);
      let o = this.mobShotObjs.get(sh.id);
      if (!o) {
        const c = sh.kind === 'ghost' ? 0x6ae8ff : sh.slow ? 0xf0f0ff : sh.kind === 'slime' ? 0xb05aff : sh.kind === 'shroom' ? 0xff5ab0 : sh.kind === 'skele' ? 0xf0e8d0 : sh.kind === 'troll' ? 0x9a8a70 : sh.kind === 'kingslime' ? 0x9aff5a : 0xd8d0ff;
        void c;
        const nm = sh.slow ? 'web' : sh.kind === 'pige' ? 'feather' : MOB_SHOT[sh.kind] ?? 'goo';
        // 2026-11-27 企画者の 絵(design/adventure/shots)。なければ プログラムで 描いた 絵
        const art = this.shotArt(nm);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: art ?? (nm === 'feather' ? featherTexture() : shotTexture(nm)), transparent: true, depthWrite: false, depthTest: false }));
        // 進む 向きに 先を 向ける(画面の 上下は 奥行きが 少し ちぢむ)
        sp.material.rotation = Math.atan2(-sh.vz * 0.71, sh.vx);
        const sz = nm === 'feather' ? 0.75 : Math.max(0.85, sh.r * 3.4);
        sp.scale.set(sz * 2.2, sz, 1);
        this.scene.add(sp);
        this.mobShotObjs.set(sh.id, sp);
        o = sp;
      }
      o.position.set(sh.x, 0.9, sh.z);
    }
    for (const [id, o] of this.mobShotObjs)
      if (!liveM.has(id)) {
        this.scene.remove(o);
        this.mobShotObjs.delete(id);
      }
    // 場(魔法陣): 回る 輪
    const liveF = new Set<number>();
    for (const f of s.fields) {
      liveF.add(f.id);
      let o = this.fieldObjs.get(f.id);
      if (!o) {
        const c = EL_HEX[f.tech.element] ?? 0xa05aff;
        const g = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(f.r, 40), this.glowMat(c, 0.18));
        const ring = new THREE.Mesh(new THREE.RingGeometry(f.r * 0.92, f.r, 40), this.glowMat(c, 0.8));
        const inner = new THREE.Mesh(new THREE.RingGeometry(f.r * 0.45, f.r * 0.5, 6), this.glowMat(c, 0.7));
        for (const m of [disc, ring, inner]) m.rotation.x = -Math.PI / 2;
        g.add(disc, ring, inner);
        g.position.set(f.x, 0.06, f.z);
        this.scene.add(g);
        this.fieldObjs.set(f.id, g);
        o = g;
      }
      o.children[2].rotation.z = now * 1.5;
      o.children[1].rotation.z = -now * 0.6;
      o.scale.setScalar(Math.min(1, f.t * 5) * (f.t > f.life - 0.3 ? (f.life - f.t) / 0.3 : 1));
    }
    for (const [id, o] of this.fieldObjs)
      if (!liveF.has(id)) {
        this.scene.remove(o);
        this.fieldObjs.delete(id);
      }
    // ねらいの 範囲(帯・扇は 自分から 向きへ。円は その 場所に)
    const a = this.aimState;
    this.aimObj.visible = !!a;
    if (a) {
      const key = `${a.shape}:${a.len.toFixed(1)}:${a.w.toFixed(2)}:${a.arc.toFixed(2)}:${a.r.toFixed(2)}:${a.self}`;
      if (key !== this.aimKey) {
        this.aimKey = key;
        this.buildAim(a);
      }
      const circle = a.shape === 'circle';
      this.aimObj.position.set(circle ? a.cx : p.x, 0.14, circle ? a.cz : p.z);
      this.aimObj.rotation.y = circle ? 0 : -a.dir;
      this.aimObj.children.forEach((c, i) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (i === 0 ? 0.28 : 0.85) * (a.auto ? 0.6 : 1)));
    }
    this.dome.visible = s.t < s.shieldUntil;
    this.dome.position.set(p.x, 0.12, p.z);
    this.dome.rotation.z = now * 0.8;
    (this.dome.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(now * 6) * 0.15;
    this.buffRing.visible = s.t < s.atkUpUntil;
    this.buffRing.position.set(p.x, 0.1, p.z);
    this.buffRing.scale.setScalar(1 + Math.sin(now * 5) * 0.08);
    // 技の 光
    for (const q of this.fx) {
      q.t += dt;
      q.tick(Math.min(1, q.t / q.life));
    }
    this.fx = this.fx.filter((q) => {
      if (q.t < q.life) return true;
      this.scene.remove(q.obj);
      q.mats.forEach((m) => m.dispose());
      return false;
    });
    // ポップ
    for (const q of this.pops) {
      q.t += dt;
      q.obj.position.y += q.vy * dt;
      const k = q.t / q.life;
      (q.obj.material as THREE.SpriteMaterial).opacity = 1 - k;
      if (q.grow) q.obj.scale.setScalar(0.25 * (1 + q.grow * k));
    }
    this.pops = this.pops.filter((q) => {
      if (q.t < q.life) return true;
      this.scene.remove(q.obj);
      (q.obj.material as THREE.SpriteMaterial).map?.dispose();
      (q.obj.material as THREE.SpriteMaterial).dispose();
      return false;
    });
    // あかりと カメラ(ななめ上から ついていく)
    this.moon.position.set(p.x - 4, 20, p.z + 8);
    this.moon.target.position.set(p.x, 0, p.z);
    const cx = p.x + (Math.random() - 0.5) * this.shake;
    const cz = p.z + (Math.random() - 0.5) * this.shake;
    this.shake *= Math.exp(-dt * 12);
    // 角度は 最初の 試作と 同じ(約58度。2026-11-07 企画者「真上からは嫌・角度は最初のぐらい」)
    this.camera.position.set(cx, 17, cz + 17); // 同じ日「若干 真上っぽい」→ 45度に
    this.camera.lookAt(cx, 0.6, cz);
    this.pixelPass(p.x, p.z);
    this.renderer.render(this.scene, this.camera);
  }

  // ===== 擬人化RPG の 試作: ラグナロクのような 技の 演出(2026-11-26 企画者の 絵 design/rpg/fx) =====
  private fxTexs = new Map<string, THREE.Texture>();
  private castObj: THREE.Mesh | null = null;
  /** さいごに 使った 技の 属性と 時刻(当たった 時の 爆発の 色) */
  private lastEl = { el: '無', t: -9 };
  private fxTex(name: string): THREE.Texture {
    let t = this.fxTexs.get(name);
    if (!t) {
      t = new THREE.TextureLoader().load(assetUrl(`assets/rpg/fx/fx_${name}.webp`));
      t.colorSpace = THREE.SRGBColorSpace;
      this.fxTexs.set(name, t);
    }
    return t;
  }
  /** 光の 絵の 材料(黒は 消える・光を 足す)。color で 染める */
  private fxMat(name: string, color: number, op = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ map: this.fxTex(name), color, transparent: true, opacity: op, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }
  /** カメラに 向いた 光の 絵。grow = 大きく なる 速さ */
  private fxBill(name: string, color: number, x: number, y: number, z: number, size: number, life: number, grow = 0.6, delay = 0, aspect = 1): void {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * aspect, size), this.fxMat(name, color));
    m.renderOrder = 6;
    const spin = (Math.random() - 0.5) * 0.6;
    this.addFx(m, life + delay, (k) => {
      const t = Math.max(0, (k * (life + delay) - delay) / life);
      m.visible = t > 0;
      m.position.set(x, y, z);
      m.quaternion.copy(this.camera.quaternion);
      if (aspect === 1) m.rotateZ(spin * t);
      m.scale.setScalar(0.55 + grow * Math.min(1, t * 2.2));
      (m.material as THREE.MeshBasicMaterial).opacity = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.88);
    });
  }
  /** 床に はりつく 光の 絵(魔法陣・衝撃波)。rot = 回る 速さ */
  private fxGround(name: string, color: number, x: number, z: number, size: number, life: number, grow = 0.4, rot = 0, yaw = 0, op = 1): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.fxMat(name, color, op));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.08, z);
    m.renderOrder = 4;
    this.addFx(m, life, (k) => {
      m.rotation.z = yaw + rot * k;
      m.scale.setScalar(1 - grow + grow * (1 - (1 - k) * (1 - k)));
      (m.material as THREE.MeshBasicMaterial).opacity = op * (k < 0.1 ? k / 0.1 : Math.max(0, 1 - (k - 0.1) / 0.9));
    });
    return m;
  }
  /** 属性の 爆発の 絵(炎・雷・光・闇 は 企画者の 絵、ほかは 火花を 色で 染める) */
  private exName(el: string): string {
    return ({ 炎: 'ex_fire', 雷: 'ex_thunder', 光: 'ex_light', 闇: 'ex_dark' } as Record<string, string>)[el] ?? 'spark';
  }
  private exColor(el: string): number {
    return this.exName(el) === 'spark' ? EL_HEX[el] ?? 0xffffff : 0xffffff;
  }
  /** 斬撃の 絵を 床に(弧の ふくらみを 前へ)。side = 振る 向き */
  /** 拳闘士(BUNK の 擬人化): 斬撃の 代わりに こぶしの 衝撃 */
  private fist = true;
  private fxSlash(x: number, z: number, dir: number, r: number, color: number, side: number, life = 0.24, delay = 0): void {
    if (this.fist) {
      const d = r * 0.75;
      const off = side * 0.25;
      this.fxBill('spark', color, x + Math.cos(dir + off * 0.3) * d, 0.9, z + Math.sin(dir + off * 0.3) * d, r * 0.9, life, 0.5, delay);
      return;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), this.fxMat('slash', color));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 6;
    this.addFx(m, life + delay, (k) => {
      const t = Math.max(0, (k * (life + delay) - delay) / life);
      m.visible = t > 0;
      const ease = 1 - Math.pow(1 - t, 3);
      // 絵の 弧は 左が ふくらむ → 前へ 向ける。振りぬく ように 回す
      m.rotation.z = -dir + Math.PI - side * 0.7 * (1 - ease);
      m.position.set(x + Math.cos(dir) * r * 0.25, 0.5, z + Math.sin(dir) * r * 0.25);
      m.scale.setScalar(0.85 + 0.2 * ease);
      (m.material as THREE.MeshBasicMaterial).opacity = t < 0.1 ? t / 0.1 : Math.max(0, 1 - Math.pow((t - 0.1) / 0.9, 1.5));
    });
  }

  /** 通常攻撃(擬人化RPG): 当たる 範囲の 扇 + 斬撃の 絵 */
  private rpgJab(e: Extract<AdvEvent, { kind: 'jab' }>): void {
    if (e.style === 'shot') return;
    // 2026-11-27 企画者「エフェクト でかすぎて 1レベルで 強そう」→ 当たる 範囲(前の 1マス)と 同じ 大きさ・控えめに
    const big = e.chain === 3;
    const side = e.chain === 2 ? -1 : 1;
    this.fxSlash(e.x, e.z, e.dir, e.range * (big ? 1.0 : 0.8), big ? 0xffc080 : 0xfff0d8, side, big ? 0.22 : 0.16);
    if (big) this.shake = Math.max(this.shake, 0.12);
  }

  /** 技が 当たった(擬人化RPG): 属性の 爆発 */
  private rpgHit(x: number, z: number, crit: boolean): void {
    const recent = performance.now() / 1000 - this.lastEl.t < 0.8;
    const el = recent ? this.lastEl.el : '無';
    this.fxBill(recent ? this.exName(el) : 'spark', recent ? this.exColor(el) : 0xffe8c0, x, 1.0, z, crit ? 1.8 : recent ? 2.2 : 1.0, 0.25, 0.5);
  }

  /** 技の ため: 足もとに 魔法陣(攻撃 = とがった 陣・回復や 守り = 花の 陣)が 回りながら 広がる */
  private rpgCast(s: AdvState, dt: number): void {
    const p = s.player;
    const tc = p.act === 'tech' && !p.struck ? s.techs[s.techSlot] : null;
    if (!tc) {
      if (this.castObj) this.castObj.visible = false;
      return;
    }
    const self = SELF_KINDS.has(tc.kind);
    const tex = self ? 'circle_sup' : 'circle_atk';
    if (!this.castObj) {
      this.castObj = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.fxMat(tex, 0xffffff));
      this.castObj.rotation.x = -Math.PI / 2;
      this.castObj.renderOrder = 3;
      this.scene.add(this.castObj);
    }
    const m = this.castObj;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map = this.fxTex(tex);
    mat.color.setHex(self ? 0x9affc0 : EL_HEX[tc.element] ?? 0xffffff);
    const w = Math.min(1, p.actT / Math.max(0.05, techWindup(tc.kind)));
    m.visible = true;
    m.position.set(p.x, 0.07, p.z);
    m.rotation.z += dt * 2.5;
    m.scale.setScalar(2.0 + w * 2.0);
    mat.opacity = 0.5 + w * 0.5;
  }

  /** 技(擬人化RPG): 形ごとの 演出(拳闘士の 試作) */
  private rpgTechFx(e: Extract<AdvEvent, { kind: 'tech' }>, s: AdvState): void {
    const tc = s.techs[e.slot];
    let name = '';
    try {
      name = tc ? getTech(tc.id).name : '';
    } catch {
      name = '';
    }
    // 2026-11-26 企画者「技名は 叫ばなくて 良い」→ 出さない
    void name;
    this.lastEl = { el: e.element, t: performance.now() / 1000 };
    const c = EL_HEX[e.element] ?? 0xffffff;
    const ex = this.exName(e.element);
    const exC = this.exColor(e.element);
    const dir = e.dir;
    switch (e.fx) {
      case 'melee':
      case 'drain':
        this.fxSlash(e.x, e.z, dir, e.r * 1.1, c, 1, 0.28);
        this.fxSlash(e.x, e.z, dir, e.r, 0xffffff, -1, 0.24, 0.05);
        break;
      case 'combo':
        for (let i = 0; i < 4; i++) this.fxSlash(e.x, e.z, dir, e.r * (1 + i * 0.05), i % 2 ? 0xffffff : c, i % 2 ? -1 : 1, 0.2, i * 0.1);
        break;
      case 'spin':
        // 剣を 振り回す: 斬撃が まわりに 3つ + 衝撃の 輪
        for (let i = 0; i < 3; i++) this.fxSlash(e.x, e.z, dir + (i * Math.PI * 2) / 3, e.r * 0.9, i ? c : 0xffffff, 1, 0.35, i * 0.05);
        this.fxGround('ring', c, e.x, e.z, e.r * 2.2, 0.45, 0.7);
        this.fxBill(ex, exC, e.x, 0.9, e.z, e.r * 1.2, 0.35, 0.5);
        break;
      case 'rush':
        // 盾を 構えて 突っこむ: 走った あとに 煙・先で 斬撃と 火花
        this.fxBill('smoke', 0xb8b0c0, e.x - Math.cos(dir) * 0.6, 0.6, e.z - Math.sin(dir) * 0.6, 1.8, 0.5, 0.7);
        this.fxSlash(e.x + Math.cos(dir) * 2.5, e.z + Math.sin(dir) * 2.5, dir, 1.8, c, 1, 0.3, 0.12);
        this.fxBill(ex, exC, e.x + Math.cos(dir) * 3, 1.0, e.z + Math.sin(dir) * 3, 2.2, 0.35, 0.6, 0.12);
        break;
      case 'quake':
        // 剣を 地面に 叩きつける: 衝撃波の 輪 2重 + 煙 + 属性の 爆発
        this.fxGround('ring', c, e.x, e.z, e.r * 2.3, 0.55, 0.85);
        this.fxGround('ring', 0xffffff, e.x, e.z, e.r * 1.4, 0.4, 0.85);
        this.fxBill('smoke', 0x9a90a8, e.x, 0.7, e.z, e.r * 1.4, 0.7, 0.6);
        this.fxBill(ex, exC, e.x, 0.9, e.z, e.r * 1.3, 0.4, 0.6);
        this.shake = Math.max(this.shake, 0.4);
        break;
      case 'drop':
        this.fxBill('pillar', c, e.tx, 1.4, e.tz, 3, 0.35, 0.3, 0, 2 / 3);
        this.fxGround('ring', c, e.tx, e.tz, e.r * 2.3, 0.5, 0.85, 0, 0, 1);
        this.fxBill(ex, exC, e.tx, 0.9, e.tz, e.r * 1.6, 0.45, 0.6, 0.05);
        this.fxBill('smoke', 0x9a90a8, e.tx, 0.6, e.tz, e.r * 1.5, 0.7, 0.6, 0.05);
        this.shake = Math.max(this.shake, 0.45);
        break;
      case 'pillar':
        // 剣を 突き立てて 大きな 柱: 魔法陣 → 光の 柱 2本 → 爆発
        this.fxGround('circle_atk', c, e.tx, e.tz, e.r * 2.4, 0.9, 0.2, 1.5);
        this.fxBill('pillar', c, e.tx, e.r * 1.1, e.tz, e.r * 2.6, 0.7, 0.3, 0, 2 / 3);
        this.fxBill('pillar', 0xffffff, e.tx, e.r * 1.0, e.tz, e.r * 2.0, 0.6, 0.3, 0.08, 2 / 3);
        this.fxBill(ex, exC, e.tx, 1.0, e.tz, e.r * 2, 0.5, 0.6, 0.1);
        this.fxGround('ring', c, e.tx, e.tz, e.r * 2.4, 0.6, 0.85);
        this.shake = Math.max(this.shake, 0.5);
        break;
      case 'beam':
        if (this.fist) {
          // ブロウクラッシュ: 地面を なぐり、前へ 一直線に 衝撃(土けむりと 輪が 順に 走る)
          const n = Math.max(2, Math.round(e.len / 1.3));
          for (let i = 0; i <= n; i++) {
            const d = 0.9 + (e.len * i) / n;
            const px = e.x + Math.cos(dir) * d;
            const pz = e.z + Math.sin(dir) * d;
            this.fxGround('ring', c, px, pz, 1.8, 0.35, 0.7, 0, 0, 0.9);
            this.fxBill('smoke', 0xa89cb8, px, 0.5, pz, 1.4, 0.5, 0.4, i * 0.04);
            this.fxBill('spark', 0xffe8c0, px, 0.7, pz, 1.2, 0.25, 0.5, i * 0.04);
          }
          this.fxBill('spark', 0xffffff, e.x + Math.cos(dir) * 0.8, 0.6, e.z + Math.sin(dir) * 0.8, 2.0, 0.25, 0.6);
          this.shake = Math.max(this.shake, 0.35);
          break;
        }
        this.techFx(e);
        this.fxBill('spark', c, e.x + Math.cos(dir), 1.0, e.z + Math.sin(dir), 2.2, 0.3, 0.6);
        break;
      case 'counter':
        // スウェイカウンター: 構え(花の 陣ではなく 体の まわりに 白い 輪)
        this.fxGround('ring', 0xffffff, e.x, e.z, 2.6, 0.5, 0.3, 0, 0, 0.8);
        this.fxBill('star', 0xdff0ff, e.x, 1.2, e.z, 1.4, 0.4, 0.4);
        break;
      case 'shot':
        this.fxBill('spark', c, e.x + Math.cos(dir) * 0.9, 1.0, e.z + Math.sin(dir) * 0.9, 1.4, 0.2, 0.5);
        break;
      case 'heal':
        this.fxGround('circle_sup', 0x7affa8, e.x, e.z, 3.4, 1.0, 0.3, 1.2);
        this.fxBill('pillar', 0x7affa8, e.x, 1.4, e.z, 3.2, 0.8, 0.2, 0, 2 / 3);
        for (let i = 0; i < 5; i++) this.fxBill('star', 0xc0ffd0, e.x + (Math.random() - 0.5) * 1.4, 0.6 + Math.random() * 1.6, e.z + (Math.random() - 0.5) * 1.4, 0.7, 0.5, 0.4, i * 0.08);
        break;
      case 'barrier':
        this.fxGround('circle_sup', 0x8ad0ff, e.x, e.z, 3.2, 0.9, 0.3, -1.2);
        this.fxBill('star', 0xbfe8ff, e.x, 1.0, e.z, 2.4, 0.45, 0.5);
        this.fxBill('ex_light', 0x8ad0ff, e.x, 1.0, e.z, 2.6, 0.5, 0.4);
        break;
      case 'buff':
        this.fxGround('circle_sup', 0xff8a4a, e.x, e.z, 3.2, 0.9, 0.3, 1.5);
        this.fxBill('pillar', 0xff8a4a, e.x, 1.4, e.z, 3.2, 0.7, 0.2, 0, 2 / 3);
        this.fxBill('star', 0xffd0a0, e.x, 1.6, e.z, 1.6, 0.4, 0.5, 0.1);
        break;
      case 'debuff':
        // 雄たけび: 足もとに 攻撃の 陣・紫の 煙と 衝撃波
        this.fxGround('circle_atk', 0xb070ff, e.x, e.z, e.r * 2.2, 0.8, 0.3, 1.2);
        this.fxGround('ring', 0xb070ff, e.x, e.z, e.r * 2.3, 0.6, 0.85);
        this.fxBill('smoke', 0x8a50c0, e.x, 0.8, e.z, 2.6, 0.7, 0.5);
        break;
      default:
        this.techFx(e);
        if (e.fx === 'field') this.fxGround('circle_atk', c, e.tx, e.tz, e.r * 2.2, 1.0, 0.2, 1.0);
        break;
    }
  }

  /**
   * 擬人化RPG の 試作 C: 自分の 体だけを 小さな 絵に 写して(ぼかさない)、その 絵を カメラに 向いた 板で 出す。
   * 板の 絵は 1マス = 1点 の ドット絵の ように 見える。体(3D)は かくす
   */
  private pixelPass(x: number, z: number): void {
    const on = !!this.pixelOpt?.on;
    if (on !== this.pixWas) {
      this.pixWas = on;
      // 体を 別の 層へ(ふつうの カメラには うつらない)
      this.rig.root.traverse((o) => o.layers.set(on ? 1 : 0));
      if (this.pixQuad) this.pixQuad.visible = on;
    }
    if (!on) return;
    this.rig.root.traverse((o) => o.layers.set(1));
    const SPAN = 2.6;
    const RES = 88;
    if (!this.pixRT) {
      this.pixRT = new THREE.WebGLRenderTarget(RES, RES, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
      this.pixRT.texture.colorSpace = THREE.SRGBColorSpace;
      this.pixCam = new THREE.OrthographicCamera(-SPAN / 2, SPAN / 2, SPAN / 2, -SPAN / 2, 0.1, 100);
      this.pixCam.layers.set(1);
      this.scene.traverse((o) => {
        if ((o as THREE.Light).isLight) o.layers.enable(1);
      });
      this.pixQuad = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), new THREE.MeshBasicMaterial({ map: this.pixRT.texture, transparent: true, alphaTest: 0.5 }));
      this.scene.add(this.pixQuad);
    }
    const cam = this.pixCam!;
    // ふつうの カメラと 同じ 向きで、自分の まん中を 見る
    const cy = 0.85;
    const off = new THREE.Vector3(0, 16.4, 17).normalize();
    cam.position.set(x, cy, z).addScaledVector(off, 20);
    cam.lookAt(x, cy, z);
    const bg = this.scene.background;
    this.scene.background = null;
    this.renderer.setRenderTarget(this.pixRT);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);
    this.renderer.setRenderTarget(null);
    this.scene.background = bg;
    this.renderer.setClearColor(0x0b0712, 1);
    const q = this.pixQuad!;
    q.position.set(x, cy, z);
    q.quaternion.copy(cam.quaternion);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
