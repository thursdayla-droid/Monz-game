/**
 * 冒険の 装備の 3D(2026-11-26 企画者「装備したら 見た目 変えたい」→「3D の 防具を 作る」・冒険の 中だけ)。
 * 形は 企画者の アイテムの 絵に あわせる: アタマ = ゴーグル付きの 革の 帽子・ヨロイ = 胸当てと 肩当て・オマモリ = ひもつきの お守り袋。
 * ランク(D〜S)は ふちの 色と 光で 見分ける。モデルの 骨に 付けて いっしょに 動く(monsterRig.setGear)
 */
import * as THREE from 'three';

const std = (color: number, rough = 0.75, metal = 0, emissive = 0, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });

/** ランクの ふち: S・A は 少し 光る */
function trimMat(rankHex: number, rankIdx: number): THREE.MeshStandardMaterial {
  return std(rankHex, 0.4, 0.35, rankHex, rankIdx >= 3 ? 0.55 : rankIdx >= 2 ? 0.25 : 0.08);
}

/** 黒い ふち線(企画者の 絵の 太い 線に 合わせて、うらがえしの 少し 大きい 形) */
function outline(m: THREE.Mesh, s = 1.07): void {
  const o = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0x16101c, side: THREE.BackSide }));
  o.scale.setScalar(s);
  m.add(o);
}

/** アタマ: r = 頭の 半径。前は +x */
export function helmetMesh(r: number, rankHex: number, rankIdx: number): THREE.Group {
  const g = new THREE.Group();
  const leather = std(0x5a3466, 0.85);
  const metal = std(0xb8b2b4, 0.45, 0.4);
  const brown = std(0x7a4a32, 0.9);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), leather);
  outline(dome, 1.05);
  g.add(dome);
  // ふちの 金具の 輪
  const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, r * 0.07, 6, 28), metal);
  band.rotation.x = Math.PI / 2;
  band.position.y = r * 0.16;
  g.add(band);
  // 前から うしろへ 通る 金具
  const strap = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, r * 0.07, 6, 20, Math.PI), metal);
  g.add(strap);
  // 耳あて
  for (const s of [-1, 1]) {
    // 耳あて(頭に そった 丸い 板)
    const flap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 12, 8), brown);
    flap.scale.set(1, 0.9, 0.35);
    flap.position.set(-r * 0.05, r * 0.05, s * r * 0.97);
    outline(flap, 1.1);
    g.add(flap);
  }
  // ゴーグル(ふちが ランクの 色)
  const trim = trimMat(rankHex, rankIdx);
  const lens = std(0x2a2836, 0.15, 0.6);
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.16, 8), trim);
    rim.rotation.z = Math.PI / 2;
    rim.rotation.x = 0;
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, r * 0.18, 8), lens);
    rim.add(gl);
    const a = s * 0.38;
    rim.position.set(Math.cos(a) * r * 0.86, r * 0.42, Math.sin(a) * r * 0.86);
    rim.rotation.y = -a;
    outline(rim, 1.12);
    g.add(rim);
  }
  return g;
}

/** ヨロイ: R = 体の 中心から 胸の 前までの 長さ。前は +x */
export function armorMesh(R: number, h: number, rankHex: number, rankIdx: number, style: 'chest' | 'pads' | 'back' = 'chest'): THREE.Group {
  if (style === 'back') return backArmor(R, h, rankHex, rankIdx);
  const g = new THREE.Group();
  const metal = std(0xc4bec0, 0.45, 0.45);
  const trim = trimMat(rankHex, rankIdx);
  const brown = std(0x7a4a32, 0.9);
  // 胸当て(体の 前を 包む 板)
  const th0 = Math.PI / 2 - Math.min(1.0, h / R / 2);
  const thL = Math.min(2.0, h / R);
  const plate = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 20, 10, Math.PI - 1.15, 2.3, th0, thL), metal);
  plate.material.side = THREE.DoubleSide;
  plate.visible = style === 'chest';
  g.add(plate);
  // 上と 下の ふち(ランクの 色)
  for (const t of style === 'chest' ? [th0, th0 + thL] : []) {
    const rr = R * 1.08 * Math.sin(t);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rr, R * 0.06, 5, 20, 2.3), trim);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = -1.15;
    rim.position.y = R * 1.08 * Math.cos(t);
    g.add(rim);
  }
  // 肩当て
  for (const s of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(R * 0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal);
    pad.scale.set(1, 0.7, 1);
    pad.position.set(0, R * 1.06 * Math.cos(th0) - R * 0.05, s * R * 0.85);
    outline(pad, 1.08);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.45, R * 0.05, 5, 18), trim);
    rim.rotation.x = Math.PI / 2;
    pad.add(rim);
    g.add(pad);
  }
  // ベルトと 金具
  const by = R * 1.06 * Math.cos(th0 + thL) + R * 0.05;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(R * 1.04 * Math.sin(th0 + thL) + R * 0.02, R * 0.07, 5, 24), brown);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = by;
  g.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(R * 0.08, R * 0.26, R * 0.3), trim);
  buckle.position.set(R * 1.04 * Math.sin(th0 + thL) + R * 0.08, by, 0);
  g.add(buckle);
  return g;
}

/** オマモリ: s = 袋の 高さ。ひもの 先(上)が 原点 */
export function charmMesh(s: number, rankHex: number, rankIdx: number): THREE.Group {
  const g = new THREE.Group();
  const cloth = std(0x7a3aa8, 0.9);
  const red = std(0xb04a4a, 0.85);
  const bag = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 14, 10), cloth);
  bag.scale.set(0.8, 1, 0.45);
  bag.position.y = -s * 0.75;
  outline(bag, 1.1);
  g.add(bag);
  // 花の 模様(ランクの 色)
  const flower = new THREE.Mesh(new THREE.CircleGeometry(s * 0.16, 5), trimMat(rankHex, rankIdx));
  flower.position.set(0, -s * 0.75, s * 0.24);
  g.add(flower);
  const flower2 = flower.clone();
  flower2.position.z = -s * 0.24;
  flower2.rotation.y = Math.PI;
  g.add(flower2);
  // むすび目と ひも
  const knot = new THREE.Mesh(new THREE.TorusGeometry(s * 0.12, s * 0.05, 6, 12), red);
  knot.position.y = -s * 0.3;
  g.add(knot);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.03, s * 0.03, s * 0.3, 5), red);
  cord.position.y = -s * 0.15;
  g.add(cord);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(s * 0.09, 10, 8), std(0xe0b040, 0.4, 0.5));
  bead.position.set(0, -s * 1.3, 0);
  g.add(bead);
  return g;
}

/** 四つ足の ヨロイ: 背中を おおう 板(前後に 長い)と ふち。len = 前後の のばし */
function backArmor(R: number, len: number, rankHex: number, rankIdx: number): THREE.Group {
  const g = new THREE.Group();
  const metal = std(0xc4bec0, 0.45, 0.45);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 20, 10, 0, Math.PI * 2, 0, 1.05), metal);
  cap.material.side = THREE.DoubleSide;
  g.add(cap);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.12 * Math.sin(1.05), R * 0.07, 6, 28), trimMat(rankHex, rankIdx));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = R * 1.12 * Math.cos(1.05);
  g.add(rim);
  // まん中の すじ(金具)
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(R * 1.13, R * 0.05, 5, 16, 2.1), trimMat(rankHex, rankIdx));
  ridge.rotation.z = Math.PI / 2 - 1.05;
  g.add(ridge);
  g.scale.set(len, 1, 1);
  return g;
}
