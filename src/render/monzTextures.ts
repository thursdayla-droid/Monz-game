import * as Phaser from 'phaser';
import type { Dna } from '../core/dna';
import { recolorPixels } from '../core/recolor';
import { NO_BELLY_TINT, PART_NAMES, TEXTURE_SCALE, type PartName } from './bunkRig';

export const sourceKey = (part: PartName) => `bunk:${part}`;
/** 個体ごとのテクスチャ(全パーツを1枚にまとめたもの)。パーツ名がフレーム名。 */
export const monzKey = (dna: Dna) => `monz:${dna.id}`;

const ATLAS_WIDTH = 1024;
const GAP = 2;

/** 個体の配色で塗り替えたパーツを1枚のテクスチャにまとめて登録する。 */
export function createMonzTextures(scene: Phaser.Scene, dna: Dna): void {
  const key = monzKey(dna);
  if (scene.textures.exists(key)) return;

  const parts = PART_NAMES.map((part) => {
    const src = scene.textures.get(sourceKey(part)).getSourceImage() as HTMLImageElement;
    const w = Math.max(1, Math.round(src.width * TEXTURE_SCALE));
    const h = Math.max(1, Math.round(src.height * TEXTURE_SCALE));
    return { part, src, w, h, x: 0, y: 0 };
  });

  // 棚詰め(高い順に左から並べる)
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const p of [...parts].sort((a, b) => b.h - a.h)) {
    if (x + p.w > ATLAS_WIDTH) {
      x = 0;
      y += shelf + GAP;
      shelf = 0;
    }
    p.x = x;
    p.y = y;
    x += p.w + GAP;
    shelf = Math.max(shelf, p.h);
  }

  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true })!;
  const atlas = document.createElement('canvas');
  atlas.width = ATLAS_WIDTH;
  atlas.height = y + shelf;
  const actx = atlas.getContext('2d')!;
  for (const p of parts) {
    work.width = p.w;
    work.height = p.h;
    wctx.clearRect(0, 0, p.w, p.h);
    wctx.drawImage(p.src, 0, 0, p.w, p.h);
    const img = wctx.getImageData(0, 0, p.w, p.h);
    recolorPixels(img.data, dna.appearance.palette, { belly: !NO_BELLY_TINT.has(p.part) });
    actx.putImageData(img, p.x, p.y);
  }

  const tex = scene.textures.addCanvas(key, atlas)!;
  for (const p of parts) tex.add(p.part, 0, p.x, p.y, p.w, p.h);
}

export function destroyMonzTextures(scene: Phaser.Scene, dna: Dna): void {
  const key = monzKey(dna);
  if (scene.textures.exists(key)) scene.textures.remove(key);
}
