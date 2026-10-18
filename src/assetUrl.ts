/**
 * 画像などの場所。ページの中に画像を埋め込んで配る確認用ページでは、
 * window.__MONZ_ASSETS に「ファイルの場所 → 埋め込んだ画像」が入っているので、そちらを使う。
 */
declare global {
  interface Window {
    __MONZ_ASSETS?: Record<string, string>;
    __MONZ_JSON?: Record<string, unknown>;
  }
}

export const assetUrl = (path: string): string => window.__MONZ_ASSETS?.[path] ?? path;
export const embeddedJson = (path: string): unknown => window.__MONZ_JSON?.[path];
