/** URLに ?debug=1 を付けると画面左上に情報を出す(iPhoneのSafariには開発者ツールがないため)。 */
export const DEBUG = new URLSearchParams(location.search).has('debug');

const el = document.getElementById('debug');
const lines = new Map<string, string>();

export function debugSet(key: string, value: string): void {
  if (!DEBUG || !el) return;
  lines.set(key, value);
  el.style.display = 'block';
  el.textContent = [...lines.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
}

if (DEBUG) {
  window.addEventListener('error', (e) => debugSet('error', String(e.message)));
  window.addEventListener('unhandledrejection', (e) => debugSet('error', String(e.reason)));
}
