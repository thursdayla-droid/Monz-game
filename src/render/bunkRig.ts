/**
 * BUNK系パーツの組み立て情報。
 * 【仮】パーツ画像は未承認の仮素材(design/bunk/README.md)。差し替えたら座標も見直す。
 * 座標はすべて元絵(パーツ表)のpx。
 * pivot: パーツ画像の中の「回転・接続の中心」
 * 接続位置: 胴体の足元中央を(0,0)とした位置(上がマイナス)
 */
export const TEXTURE_SCALE = 0.5;

export const PART_NAMES = [
  'body', 'head', 'spike', 'horn_l', 'horn_r',
  'eyes_smug_l', 'eyes_smug_r', 'eyes_half_l', 'eyes_half_r', 'eyes_shut_l', 'eyes_shut_r',
  'mouth_smirk', 'mouth_grin', 'mouth_angry', 'mouth_open',
  'arm_l', 'arm_r', 'leg_l', 'leg_r',
] as const;
export type PartName = (typeof PART_NAMES)[number];

/** 目のパーツは白目をおなかの色で塗らない */
export const NO_BELLY_TINT: ReadonlySet<PartName> = new Set(PART_NAMES.filter((n) => n.startsWith('eyes_')));

export const PIVOTS: Record<PartName, [number, number]> = {
  body: [328, 495],
  head: [190, 340],
  spike: [95, 150],
  horn_l: [30, 125],
  horn_r: [30, 125],
  eyes_smug_l: [51, 85],
  eyes_smug_r: [51, 85],
  eyes_half_l: [51, 85],
  eyes_half_r: [51, 85],
  eyes_shut_l: [51, 85],
  eyes_shut_r: [51, 85],
  mouth_smirk: [107, 52],
  mouth_grin: [109, 50],
  mouth_angry: [100, 55],
  mouth_open: [73, 53],
  arm_l: [243, 55],
  arm_r: [91, 60],
  leg_l: [150, 40],
  leg_r: [120, 40],
};

/** 胴体(足元中央が原点)に対する接続位置 */
export const BODY_SOCKETS = {
  shoulderL: [-100, -455],
  shoulderR: [107, -457],
  neck: [2, -365],
  top: [2, -440],
  hornL: [-120, -430],
  hornR: [120, -430],
  eyeL: [-62, -265],
  eyeR: [62, -265],
  mouth: [2, -165],
  hipL: [-98, -95],
  hipR: [102, -95],
} as const satisfies Record<string, readonly [number, number]>;

/** 頭(首の位置が原点)に対する顔の位置 */
export const HEAD_SOCKETS = {
  eyeL: [-65, -175],
  eyeR: [45, -175],
  mouth: [-15, -68],
} as const satisfies Record<string, readonly [number, number]>;

/** 足パーツの、腰(接続点)から地面までの高さ */
export const LEG_LENGTH = 240;
