import type * as Phaser from 'phaser';
import { assetUrl } from '../assetUrl';

/**
 * BUNK 以外の 種族の お世話画面の 姿の 絵(2026-11-15〜 企画者「全ての キャラの 1段階目から」)。
 * 企画者の 絵(design/species/<種族>/poses/)を tools/make_care_poses.py で 切り抜いた もの。
 * 1段階め(2026-11-16〜 進化した 姿も。<種族>_f2 など)。height は 立っている BUNK の 高さに 対する 大きさ。
 */
export type CarePoseName = 'sit' | 'sleep' | 'stretch' | 'look' | 'hungry' | 'sleepy' | 'happy' | 'angry' | 'cry' | 'surprised';
type PoseInfo = Partial<Record<CarePoseName, { w: number; h: number; height: number }>>;

const found = import.meta.glob('../../public/assets/poses/*/poses.json', { eager: true, import: 'default' }) as Record<string, PoseInfo>;
export const CARE_POSES: Record<string, PoseInfo> = {};
for (const [path, info] of Object.entries(found)) {
  const sp = /poses\/([^/]+)\/poses\.json$/.exec(path)?.[1];
  if (sp) CARE_POSES[sp] = info;
}

/**
 * 見渡す 姿の 絵が 向いている 方(-1 = 向かって左・1 = 右)。その 向きの 時だけ 出す(姿の 絵は 反転しない)
 */
export const CARE_LOOK_DIR: Record<string, -1 | 1> = { mofu: 1, crownie: 1, zipp: 1, puni: 1, riot: 1, grit: 1, vybe: 1, shellz: 1, bunk_f2: 1, bunk_f3: 1, mofu_f3: -1 };

export const carePoseKey = (sp: string, name: string) => `pose:${sp}:${name}`;
export const hasCarePoses = (sp: string): boolean => !!CARE_POSES[sp];

/** その 種族の 姿の 絵を 読みこむ 予定に 入れる */
export function loadCarePoses(load: Phaser.Loader.LoaderPlugin, sp: string): void {
  for (const name of Object.keys(CARE_POSES[sp] ?? {})) {
    const key = carePoseKey(sp, name);
    if (!load.scene.textures.exists(key)) load.image(key, assetUrl(`assets/poses/${sp}/${name}.webp`));
  }
}
