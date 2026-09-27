/**
 * 用真实备份数据体检分类器：统计各类别数量，并列出被过滤掉的样本，确认过滤得对不对。
 * 运行：node check-filter.mjs [导出文件路径]
 */
import { readFileSync } from "node:fs";

const EXPORT_PATH = process.argv[2] || "D:/pluge/xa-note/backup/xa-note-export-2026-06-23.json";
const SRC_PATH = "D:/pluge/xa-note/sidepanel.js";

const src = readFileSync(SRC_PATH, "utf8");
function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`源码里找不到函数: ${name}`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`花括号不配平: ${name}`);
}
const classifyWordEntry = new Function(`${extract("classifyWordEntry")}\nreturn classifyWordEntry;`)();

const data = JSON.parse(readFileSync(EXPORT_PATH, "utf8"));
const marks = (data.marks || []).filter(mark => (mark.text || "").trim());
const buckets = { word: [], phrase: [], other: [] };
marks.forEach(mark => buckets[classifyWordEntry(mark.text)].push(mark.text.replace(/\s+/g, " ").trim()));

console.log(`样本：${EXPORT_PATH}`);
console.log(`有文本的标注共 ${marks.length} 条\n`);
console.log(`单词 word   : ${buckets.word.length}`);
console.log(`词组 phrase : ${buckets.phrase.length}`);
console.log(`过滤 other  : ${buckets.other.length}\n`);

console.log("—— 被过滤掉的样本（最多 40 条，请确认这些确实不该进词表）——");
buckets.other.slice(0, 40).forEach(text => {
  const label = text.length > 60 ? text.slice(0, 60) + "…" : text;
  console.log(`  ✗ ${label}`);
});
if (buckets.other.length > 40) console.log(`  …另有 ${buckets.other.length - 40} 条`);

console.log("\n—— 保留的样本（最多 15 条）——");
[...buckets.word.slice(0, 8), ...buckets.phrase.slice(0, 7)].forEach(text => console.log(`  ✓ ${text}`));
