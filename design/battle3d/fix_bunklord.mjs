// BUNKLORD の骨入りモデルを直す(企画者 2026-11-02「こちらでお願いします」)。元のファイルは書き換えない。
// 1) 骨の場所: 左腕はそのまま(正しい)。右腕は左腕の左右反転。足・腰・背中・首・頭は、体の形から決めた場所へ(向きは変えない)
// 2) ウェイト: 腕 = 元の左腕のウェイト(右は左右反転して写す)。腕以外 = 近い骨に分ける(体の形にそった線までの近さ)
// 3) 逆バインド行列を計算し直す(立ち姿の形は変わらない)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { mat4 } from 'gl-matrix';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [src, out] = process.argv.slice(2);
const doc = await io.read(src);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = skin.listJoints();
const names = joints.map((j) => j.getName());
const B = Object.fromEntries(names.map((n, i) => [n, i]));
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim = meshNode.getMesh().listPrimitives()[0];
const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
const N = P.getCount();
const wpos = (node) => { const m = node.getWorldMatrix(); return [m[12], m[13], m[14]]; };
const setWorld = (name, p) => {
  const node = joints[B[name]];
  const inv = mat4.invert(mat4.create(), node.getParentNode().getWorldMatrix());
  node.setTranslation([inv[0] * p[0] + inv[4] * p[1] + inv[8] * p[2] + inv[12], inv[1] * p[0] + inv[5] * p[1] + inv[9] * p[2] + inv[13], inv[2] * p[0] + inv[6] * p[1] + inv[10] * p[2] + inv[14]]);
};
// ---- 1) 骨の場所(上から順に。親を先に動かす) ----
const L = (n) => wpos(joints[B[n]]);
const armL = Object.fromEntries(['L_Clavicle', 'L_Upperarm', 'L_Forearm', 'L_Hand'].map((n) => [n, L(n)]));
const PLACE = [
  ['Hip', [0, 0.36, 0]], ['Pelvis', [0, 0.36, 0]], ['Waist', [0, 0.42, 0]], ['Spine01', [0, 0.5, 0]], ['Spine02', [0, 0.58, 0]],
  ['NeckTwist01', [0, 0.62, 0]], ['NeckTwist02', [0, 0.64, 0]], ['Head', [0, 0.66, 0]],
  ['L_Thigh', [0, 0.33, -0.17]], ['L_Calf', [0.03, 0.2, -0.22]], ['L_Foot', [0.05, 0.08, -0.25]], ['L_ToeBase', [0.17, 0.03, -0.25]],
  ['R_Thigh', [0, 0.33, 0.17]], ['R_Calf', [0.03, 0.2, 0.22]], ['R_Foot', [0.05, 0.08, 0.25]], ['R_ToeBase', [0.17, 0.03, 0.25]],
  ['L_Clavicle', armL.L_Clavicle], ['L_Upperarm', armL.L_Upperarm], ['L_Forearm', armL.L_Forearm], ['L_Hand', armL.L_Hand],
  ['R_Clavicle', [armL.L_Clavicle[0], armL.L_Clavicle[1], -armL.L_Clavicle[2]]], ['R_Upperarm', [armL.L_Upperarm[0], armL.L_Upperarm[1], -armL.L_Upperarm[2]]],
  ['R_Forearm', [armL.L_Forearm[0], armL.L_Forearm[1], -armL.L_Forearm[2]]], ['R_Hand', [armL.L_Hand[0], armL.L_Hand[1], -armL.L_Hand[2]]],
];
for (const [n, p] of PLACE) { if (B[n] === undefined) { console.log('no bone', n); continue; } setWorld(n, p); }
for (const [n] of PLACE) console.log(n.padEnd(12), wpos(joints[B[n]]).map((v) => v.toFixed(3)).join(','));
// ---- 2) ウェイト ----
const pos = new Float32Array(N * 3), jj = new Uint16Array(N * 4), ww = new Float32Array(N * 4);
const p = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
for (let i = 0; i < N; i++) { P.getElement(i, p); J.getElement(i, j); W.getElement(i, w); pos.set(p, i * 3); jj.set(j, i * 4); const s = w[0] + w[1] + w[2] + w[3] || 1; for (let k = 0; k < 4; k++) ww[i * 4 + k] = w[k] / s; }
const isArmL = (n) => /^L_(Clavicle|Upperarm|UpperarmTwist0\d|Forearm|ForearmTwist0\d|ElbowShareBone|Hand|Thumb\d|Index\d|Mid\d|Ring\d|Pinky\d)$/.test(n);
// 指の骨は使わない(グローブは手の骨へ)。ねじれの骨も近い腕の骨へ
const armTarget = (n) => (/Thumb|Index|Mid|Ring|Pinky/.test(n) ? 'L_Hand' : /UpperarmTwist/.test(n) ? 'L_Upperarm' : /ForearmTwist|ElbowShare/.test(n) ? 'L_Forearm' : n);
const cell = 0.01, grid = new Map();
const key = (x, y, z) => (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512);
for (let i = 0; i < N; i++) { const k = key(Math.floor(pos[i * 3] / cell), Math.floor(pos[i * 3 + 1] / cell), Math.floor(pos[i * 3 + 2] / cell)); let Lst = grid.get(k); if (!Lst) grid.set(k, (Lst = [])); Lst.push(i); }
const nearest = (x, y, z) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell); let best = -1, bd = 1e9;
  for (let r = 1; r <= 6 && (best < 0 || r <= 2); r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) { if (r > 1 && Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== r) continue; const Lst = grid.get(key(cx + a, cy + b, cz + c)); if (!Lst) continue; for (const q of Lst) { const d = (pos[q * 3] - x) ** 2 + (pos[q * 3 + 1] - y) ** 2 + (pos[q * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = q; } } }
  return best; };
// 体の骨(線: 骨の場所 → 次の場所)
const wp = (n) => wpos(joints[B[n]]);
const SEG = [
  ['Pelvis', wp('Pelvis'), wp('Waist')], ['Waist', wp('Waist'), wp('Spine01')], ['Spine01', wp('Spine01'), wp('Spine02')], ['Spine02', wp('Spine02'), wp('Head')],
  ['Head', wp('Head'), [0, 0.95, 0]],
  ['L_Thigh', wp('L_Thigh'), wp('L_Calf')], ['L_Calf', wp('L_Calf'), wp('L_Foot')], ['L_Foot', wp('L_Foot'), wp('L_ToeBase')],
  ['R_Thigh', wp('R_Thigh'), wp('R_Calf')], ['R_Calf', wp('R_Calf'), wp('R_Foot')], ['R_Foot', wp('R_Foot'), wp('R_ToeBase')],
];
const segDist = (q, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const aq = [q[0] - a[0], q[1] - a[1], q[2] - a[2]]; const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9; const t = Math.max(0, Math.min(1, (aq[0] * ab[0] + aq[1] * ab[1] + aq[2] * ab[2]) / L2)); return Math.hypot(aq[0] - ab[0] * t, aq[1] - ab[1] * t, aq[2] - ab[2] * t); };
const nj = new Uint16Array(N * 4), nw = new Float32Array(N * 4);
let armVerts = 0;
for (let i = 0; i < N; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  const acc = new Map();
  const add = (n, v) => { if (v > 0) acc.set(B[n], (acc.get(B[n]) || 0) + v); };
  // 腕(左は自分の、右は左右反転した左の頂点の、左腕のウェイト)
  const src = z <= 0 ? i : nearest(x, y, -z);
  let arm = 0;
  for (let k = 0; k < 4; k++) { const n = names[jj[src * 4 + k]]; if (isArmL(n)) { const t = armTarget(n); const v = ww[src * 4 + k]; arm += v; add(z <= 0 ? t : 'R_' + t.slice(2), v); } }
  if (arm > 0.05) armVerts++;
  // 体: 近い骨ほど強く(近さの4乗)。左右の足は反対側には付けない
  const rest = 1 - arm;
  if (rest > 1e-4) {
    const cand = [];
    for (const [n, a, b] of SEG) {
      if (n.startsWith('L_') && z > 0.04) continue;
      if (n.startsWith('R_') && z < -0.04) continue;
      const d = Math.max(0.02, segDist([x, y, z], a, b));
      cand.push([n, 1 / d ** 4]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    const top = cand.slice(0, 3);
    const s = top.reduce((v, c) => v + c[1], 0);
    for (const [n, v] of top) add(n, (rest * v) / s);
  }
  const top4 = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  while (top4.length < 4) top4.push([0, 0]);
  const s = top4.reduce((v, e) => v + e[1], 0);
  for (let k = 0; k < 4; k++) { nj[i * 4 + k] = top4[k][0]; nw[i * 4 + k] = top4[k][1] / s; }
}
let bad = 0; for (let i = 0; i < N; i++) { const s = nw[i * 4] + nw[i * 4 + 1] + nw[i * 4 + 2] + nw[i * 4 + 3]; if (Math.abs(s - 1) > 1e-4) bad++; }
console.log('verts', N, 'arm verts', armVerts, 'weights not 1:', bad);
// ---- 3) 逆バインド行列 ----
const meshWorld = meshNode.getWorldMatrix();
const ibm = new Float32Array(joints.length * 16);
for (let i = 0; i < joints.length; i++) ibm.set(mat4.invert(mat4.create(), mat4.multiply(mat4.create(), mat4.invert(mat4.create(), meshWorld), joints[i].getWorldMatrix())), i * 16);
skin.getInverseBindMatrices().setArray(ibm);
const buf = root.listBuffers()[0];
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint8Array(nj)).setBuffer(buf)).setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(nw).setBuffer(buf));
J.dispose(); W.dispose();
for (const e of root.listExtensionsUsed()) if (e.extensionName === 'EXT_meshopt_compression') e.dispose();
await io.write(out, doc);
console.log('wrote', out);
