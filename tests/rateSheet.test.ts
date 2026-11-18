import assert from "node:assert/strict";
import test from "node:test";
import { buildImagePdf, pdfPageSlices, sheetColumnWidths, sheetHeight } from "../src/lib/rateSheet.ts";

test("列の幅は合計が表の幅になる", () => {
  const widths = sheetColumnWidths(4, 828);
  assert.equal(widths.reduce((a, b) => a + b, 0), 828);
  assert.ok(widths[0] > widths[1]);
});

test("行が増えると画像の高さが増える", () => {
  const base = { title: "t", subtitle: "s", sections: [{ title: "コース", headers: ["内容", "料金"], rows: [["a", "1"]] }] };
  const more = { ...base, sections: [{ ...base.sections[0], rows: [["a", "1"], ["b", "2"]] }] };
  assert.ok(sheetHeight(more) > sheetHeight(base));
});

test("A4縦で切る", () => {
  const slices = pdfPageSlices(1000, 3000);
  assert.equal(slices.length, 3);
  assert.equal(slices[0].top, 0);
  assert.equal(slices.reduce((sum, slice) => sum + slice.height, 0), 3000);
});

test("PDFの形（ページ数・xref・終わり）", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildImagePdf([{ jpeg, width: 10, height: 20 }, { jpeg, width: 10, height: 5 }]);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.match(text, /\/Count 2/);
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  const xrefAt = Number(text.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(text.slice(xrefAt, xrefAt + 4), "xref");
  // xref の位置が各 obj の先頭を指している
  for (const match of text.matchAll(/(\d{10}) 00000 n /g)) {
    assert.match(text.slice(Number(match[1]), Number(match[1]) + 10), /^\d+ 0 obj/);
  }
});
