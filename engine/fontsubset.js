/* 字体子集化：WOFF → sfnt → harfbuzz 子集 → WOFF（仅导出时使用） */
(function (root) {
  'use strict';

  async function pipe(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }
  const inflate = (b) => pipe(b, new DecompressionStream('deflate'));
  const deflate = (b) => pipe(b, new CompressionStream('deflate'));
  const pad4 = (n) => (n + 3) & ~3;

  async function woffToSfnt(woff) {
    const dv = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
    if (dv.getUint32(0) !== 0x774f4646) throw new Error('不是 WOFF 文件');
    const flavor = dv.getUint32(4), n = dv.getUint16(12);
    const tables = [];
    for (let i = 0; i < n; i++) {
      const o = 44 + i * 20;
      const t = { tag: dv.getUint32(o), off: dv.getUint32(o + 4), comp: dv.getUint32(o + 8),
        orig: dv.getUint32(o + 12), sum: dv.getUint32(o + 16) };
      const raw = woff.subarray(t.off, t.off + t.comp);
      t.data = t.comp < t.orig ? await inflate(raw) : raw;
      tables.push(t);
    }
    return buildSfnt(flavor, tables);
  }

  function buildSfnt(flavor, tables) {
    const n = tables.length;
    let size = 12 + 16 * n;
    for (const t of tables) size += pad4(t.data.length);
    const out = new Uint8Array(size), dv = new DataView(out.buffer);
    let p2 = 1, e = 0; while (p2 * 2 <= n) { p2 *= 2; e++; }
    dv.setUint32(0, flavor); dv.setUint16(4, n); dv.setUint16(6, p2 * 16);
    dv.setUint16(8, e); dv.setUint16(10, n * 16 - p2 * 16);
    let off = 12 + 16 * n;
    tables.forEach((t, i) => {
      const r = 12 + i * 16;
      dv.setUint32(r, t.tag); dv.setUint32(r + 4, t.sum); dv.setUint32(r + 8, off); dv.setUint32(r + 12, t.data.length);
      out.set(t.data, off); off += pad4(t.data.length);
    });
    return out;
  }

  async function sfntToWoff(sfnt) {
    const dv = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    const flavor = dv.getUint32(0), n = dv.getUint16(4);
    const tables = [];
    let sfntSize = 12 + 16 * n;
    for (let i = 0; i < n; i++) {
      const r = 12 + i * 16;
      const t = { tag: dv.getUint32(r), sum: dv.getUint32(r + 4) };
      const off = dv.getUint32(r + 8), len = dv.getUint32(r + 12);
      t.orig = sfnt.subarray(off, off + len);
      const z = await deflate(t.orig);
      t.data = z.length < len ? z : t.orig;
      sfntSize += pad4(len);
      tables.push(t);
    }
    tables.sort((a, b) => a.tag - b.tag);
    let size = 44 + 20 * n;
    for (const t of tables) size += pad4(t.data.length);
    const out = new Uint8Array(size), ov = new DataView(out.buffer);
    ov.setUint32(0, 0x774f4646); ov.setUint32(4, flavor); ov.setUint32(8, size);
    ov.setUint16(12, n); ov.setUint32(16, sfntSize); ov.setUint16(20, 1);
    let off = 44 + 20 * n;
    tables.forEach((t, i) => {
      const r = 44 + i * 20;
      ov.setUint32(r, t.tag); ov.setUint32(r + 4, off); ov.setUint32(r + 8, t.data.length);
      ov.setUint32(r + 12, t.orig.length); ov.setUint32(r + 16, t.sum);
      out.set(t.data, off); off += pad4(t.data.length);
    });
    return out;
  }

  async function hbSubset(wasmBytes, sfnt, codepoints) {
    const { instance } = await WebAssembly.instantiate(wasmBytes, {});
    const e = instance.exports;
    const ptr = e.malloc(sfnt.length);
    new Uint8Array(e.memory.buffer).set(sfnt, ptr);
    const blob = e.hb_blob_create(ptr, sfnt.length, 2 /* WRITABLE */, 0, 0);
    const face = e.hb_face_create(blob, 0);
    e.hb_blob_destroy(blob);
    const input = e.hb_subset_input_create_or_fail();
    const uset = e.hb_subset_input_unicode_set(input);
    for (const cp of codepoints) e.hb_set_add(uset, cp);
    const sub = e.hb_subset_or_fail(face, input);
    e.hb_subset_input_destroy(input);
    if (!sub) { e.hb_face_destroy(face); e.free(ptr); throw new Error('harfbuzz 子集化失败'); }
    const res = e.hb_face_reference_blob(sub);
    const dp = e.hb_blob_get_data(res, 0), len = e.hb_blob_get_length(res);
    const out = new Uint8Array(e.memory.buffer).slice(dp, dp + len);
    e.hb_blob_destroy(res); e.hb_face_destroy(sub); e.hb_face_destroy(face); e.free(ptr);
    return out;
  }

  /** woff: Uint8Array；text: 需要保留的全部字符；返回子集化后的 WOFF（Uint8Array） */
  /** 输入可以是 WOFF 或 TTF/OTF（sfnt）；输出统一为 WOFF */
  async function subsetWoff(wasmBytes, woff, text) {
    const cps = new Set();
    for (const ch of text) cps.add(ch.codePointAt(0));
    const isWoff = new DataView(woff.buffer, woff.byteOffset, 4).getUint32(0) === 0x774f4646;
    const sfnt = isWoff ? await woffToSfnt(woff) : woff;
    const sub = await hbSubset(wasmBytes, sfnt, cps);
    return sfntToWoff(sub);
  }

  const api = { subsetWoff, woffToSfnt, sfntToWoff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.QS = root.QS || {}; root.QS.fontSubset = api; }
})(typeof window !== 'undefined' ? window : globalThis);
