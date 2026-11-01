// BUNK の骨入りモデルの右腕のウェイトと骨の中心を直す(企画者 2026-11-01「直してOK」)。元のファイルは書き換えない。
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
const byName = Object.fromEntries(names.map((n, i) => [n, i]));
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim = meshNode.getMesh().listPrimitives()[0];
const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
const N = P.getCount();
// 0) 今の逆バインド行列が「骨のワールド行列の逆」と合っているか
const ibmAcc = skin.getInverseBindMatrices();
const meshWorld = meshNode.getWorldMatrix();
let maxErr = 0;
for (let i = 0; i < joints.length; i++) {
  const ibm = ibmAcc.getElement(i, new Array(16));
  const inv = mat4.invert(mat4.create(), mat4.multiply(mat4.create(), mat4.invert(mat4.create(), meshWorld), joints[i].getWorldMatrix()));
  for (let k = 0; k < 16; k++) maxErr = Math.max(maxErr, Math.abs(inv[k] - ibm[k]));
}
console.log('IBM check max diff', maxErr.toFixed(5));
// 1) ウェイト: 右の上半身の頂点に、左右反転した左の頂点のウェイトを写す(左右の骨の名前を入れかえる)
const swap = names.map((n) => { const m = n.startsWith('L_') ? 'R_' + n.slice(2) : n.startsWith('R_') ? 'L_' + n.slice(2) : n; return byName[m] ?? byName[n]; });
const pos = new Float32Array(N * 3), jj = new Uint16Array(N * 4), ww = new Float32Array(N * 4);
const p = [0, 0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
for (let i = 0; i < N; i++) { P.getElement(i, p); J.getElement(i, j); W.getElement(i, w); pos.set(p, i * 3); jj.set(j, i * 4); const s = w[0] + w[1] + w[2] + w[3] || 1; for (let k = 0; k < 4; k++) ww[i * 4 + k] = w[k] / s; }
const cell = 0.01, grid = new Map();
const key = (x, y, z) => (Math.floor(x / cell) + 512) * 1048576 + (Math.floor(y / cell) + 512) * 1024 + (Math.floor(z / cell) + 512);
for (let i = 0; i < N; i++) { const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); let L = grid.get(k); if (!L) grid.set(k, (L = [])); L.push(i); }
const nearest = (x, y, z) => {
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
  let best = -1, bd = 1e9;
  for (let r = 1; r <= 6 && (best < 0 || r <= 2); r++)
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
      if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== r && r > 1) continue;
      const L = grid.get((cx + a + 512) * 1048576 + (cy + b + 512) * 1024 + (cz + c + 512)); if (!L) continue;
      for (const q of L) { const d = (pos[q * 3] - x) ** 2 + (pos[q * 3 + 1] - y) ** 2 + (pos[q * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = q; } }
    }
  return [best, Math.sqrt(bd)];
};
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const nj = new Uint16Array(jj), nw = new Float32Array(ww);
let changed = 0, far = 0, maxD = 0;
for (let i = 0; i < N; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  const t = sstep(0.0, 0.06, z) * sstep(0.18, 0.30, y);
  if (t <= 0) continue;
  const [m, d] = nearest(x, y, -z);
  if (d > 0.02) far++; maxD = Math.max(maxD, d);
  const acc = new Map();
  for (let k = 0; k < 4; k++) {
    acc.set(jj[i * 4 + k], (acc.get(jj[i * 4 + k]) || 0) + ww[i * 4 + k] * (1 - t));
    const mj = swap[jj[m * 4 + k]];
    acc.set(mj, (acc.get(mj) || 0) + ww[m * 4 + k] * t);
  }
  const top = [...acc.entries()].filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  while (top.length < 4) top.push([0, 0]);
  const s = top.reduce((v, e) => v + e[1], 0);
  for (let k = 0; k < 4; k++) { nj[i * 4 + k] = top[k][0]; nw[i * 4 + k] = top[k][1] / s; }
  changed++;
}
console.log('verts', N, 'changed', changed, 'mirror match farther than 2cm', far, 'max', maxD.toFixed(3));
// 正規化の確認
let bad = 0; for (let i = 0; i < N; i++) { const s = nw[i * 4] + nw[i * 4 + 1] + nw[i * 4 + 2] + nw[i * 4 + 3]; if (Math.abs(s - 1) > 1e-4) bad++; }
console.log('weights not summing to 1:', bad);
// 2) 右腕の骨の中心を、左腕の左右反転の場所へ(向きは変えない)
const worldPos = (node) => { const m = node.getWorldMatrix(); return [m[12], m[13], m[14]]; };
for (const n of ['R_Clavicle', 'R_Upperarm', 'R_Forearm', 'R_Hand']) {
  const R = joints[byName[n]], L = joints[byName['L_' + n.slice(2)]];
  const lp = worldPos(L); lp[2] = -lp[2];
  const parent = R.getParentNode();
  const inv = mat4.invert(mat4.create(), parent.getWorldMatrix());
  const local = [inv[0] * lp[0] + inv[4] * lp[1] + inv[8] * lp[2] + inv[12], inv[1] * lp[0] + inv[5] * lp[1] + inv[9] * lp[2] + inv[13], inv[2] * lp[0] + inv[6] * lp[1] + inv[10] * lp[2] + inv[14]];
  console.log(n, 'from', worldPos(R).map((v) => v.toFixed(3)).join(','), 'to', lp.map((v) => v.toFixed(3)).join(','));
  R.setTranslation(local);
}
// 3) 逆バインド行列を、今の骨の場所から計算し直す(立ち姿の形は変わらない)
const ibm = new Float32Array(joints.length * 16);
for (let i = 0; i < joints.length; i++) ibm.set(mat4.invert(mat4.create(), mat4.multiply(mat4.create(), mat4.invert(mat4.create(), meshWorld), joints[i].getWorldMatrix())), i * 16);
ibmAcc.setArray(ibm);
// 4) 書きこむ(元とは別のファイル)
const jAcc = doc.createAccessor().setType('VEC4').setArray(new Uint8Array(nj)).setBuffer(root.listBuffers()[0]);
const wAcc = doc.createAccessor().setType('VEC4').setArray(nw).setBuffer(root.listBuffers()[0]);
prim.setAttribute('JOINTS_0', jAcc).setAttribute('WEIGHTS_0', wAcc);
J.dispose(); W.dispose();
for (const e of root.listExtensionsUsed()) if (e.extensionName === 'EXT_meshopt_compression') e.dispose();
await io.write(out, doc);
console.log('wrote', out);
