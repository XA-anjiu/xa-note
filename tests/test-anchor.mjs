/**
 * 定位算法单元测试（从 D:\pluge\xa-note\content.js 抽取真实函数执行，不是副本）。
 * 运行：node test-anchor.mjs
 */
import { readFileSync } from "node:fs";

const SRC_PATH = "D:/pluge/xa-note/content.js";
const src = readFileSync(SRC_PATH, "utf8");

/** 按函数名提取源码文本（花括号配平），保证测的是真实实现。 */
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

const NAMES = [
  "normalizeLocatorText",
  "bigramCounts",
  "diceSimilarity",
  "buildNormalizedView",
  "normalizedViewOf",
  "rangeFromMappedSpan",
  "rangeFromNormalizedQuote",
  "rangeFromFuzzyQuote",
];

let capture = null;
/** rangeFromTextIndex 的替身：不建 Range，只记录最终落在原文的下标区间。 */
function captureRange(pageIndex, start, end) {
  capture = [start, end];
  return { start, end, collapsed: false };
}

const api = new Function(
  "rangeFromTextIndex",
  `${NAMES.map(extract).join("\n\n")}\nreturn { ${NAMES.join(", ")} };`,
)(captureRange);

const makeIndex = text => ({ text, nodes: [{ node: {}, start: 0, end: text.length }] });

function locate(fn, pageText, selector) {
  capture = null;
  const range = fn(selector, makeIndex(pageText));
  if (!range) return null;
  return { start: capture[0], end: capture[1], slice: pageText.slice(capture[0], capture[1]) };
}

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

const { rangeFromNormalizedQuote, rangeFromFuzzyQuote } = api;

console.log("\n[1] 空白差异（笔记重新导出后换行/缩进变化）");
{
  const page = "第一题\n\n   下列各句中，没有语病的一项是（      ）\n\nA. 他昨天…";
  const sel = { type: "TextQuoteSelector", exact: "下列各句中，没有语病的一项是（ ）", prefix: "第一题", suffix: "A. 他昨天" };
  const hit = locate(rangeFromNormalizedQuote, page, sel);
  check("归一化策略命中", hit !== null, "未命中");
  check("覆盖原文完整片段", hit !== null && hit.slice.startsWith("下列各句中") && hit.slice.endsWith("）"), hit && JSON.stringify(hit.slice));
}

console.log("\n[2] 同一片段多次出现（靠前后文选对那一个）");
{
  const page = "AAA 目标句子 BBB ……中间…… CCC 目标句子 DDD";
  const first = locate(rangeFromNormalizedQuote, page, { exact: "目标句子", prefix: "AAA ", suffix: " BBB" });
  const second = locate(rangeFromNormalizedQuote, page, { exact: "目标句子", prefix: "CCC ", suffix: " DDD" });
  check("选中第一处", first !== null && first.start === 4, first && String(first.start));
  check("选中第二处", second !== null && second.start === page.indexOf("目标句子", 10), second && String(second.start));
}

console.log("\n[3] 文本被改了一个字（模糊兜底）");
{
  const page = "The quick brown fox jumps over the lazy d0g and then runs away";
  const hit = locate(rangeFromFuzzyQuote, page, { exact: "The quick brown fox jumps over the lazy dog" });
  check("模糊策略命中", hit !== null, "未命中");
  check("定位到正确开头", hit !== null && hit.slice.startsWith("The quick brown fox jumps"), hit && JSON.stringify(hit.slice));
  check("长度接近原文（不吞掉后文）", hit !== null && Math.abs(hit.slice.length - 43) <= 6, hit && String(hit.slice.length));
}

console.log("\n[4] 两处都被改动（势均力敌 → 宁可不标）");
{
  const page = "hello world foo bar qux …… hello world foo bar qux";
  const hit = locate(rangeFromFuzzyQuote, page, { exact: "hello world foo bar baz" });
  check("歧义时返回未定位", hit === null, hit && JSON.stringify(hit.slice));
}

console.log("\n[5] 过短文本不做模糊（避免误标）");
{
  const page = "这是 abc xyz 结尾";
  const hit = locate(rangeFromFuzzyQuote, page, { exact: "abc zzz" });
  check("短文本返回未定位", hit === null, hit && JSON.stringify(hit.slice));
}

console.log("\n[6] 中文长句（无空格，改一个字）");
{
  const page = "信号与系统这门课的重点是卷积和变换，第三章讲傅里叶变换与采样定里。";
  const hit = locate(rangeFromFuzzyQuote, page, { exact: "第三章讲傅里叶变换与采样定理" });
  check("中文模糊命中", hit !== null, "未命中");
  check("定位到正确片段", hit !== null && hit.slice.startsWith("第三章讲傅里叶") && hit.slice.includes("采样定"), hit && JSON.stringify(hit.slice));
}

console.log("\n[7] 空白差异不应干扰后续模糊（回归检查）");
{
  const page = "The   quick\n\nbrown   fox   jumps over the lazy dog";
  const hit = locate(rangeFromNormalizedQuote, page, { exact: "The quick brown fox jumps over the lazy dog" });
  check("归一化策略直接命中", hit !== null, "未命中");
  check("覆盖到原文最后", hit !== null && hit.slice.trim().endsWith("lazy dog"), hit && JSON.stringify(hit.slice));
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exitCode = failed === 0 ? 0 : 1;
