/**
 * 词表聚合单元测试（从 D:\pluge\xa-note\sidepanel.js 抽取真实函数执行）。
 * 运行：node test-words.mjs
 */
import { readFileSync } from "node:fs";

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

const NAMES = ["normalizeWordKey", "classifyWordEntry", "stemCandidates", "mergeVariantGroups", "mergeWordEntries", "buildWordContext", "buildWordIndex"];
const api = new Function(`${NAMES.map(extract).join("\n\n")}\nreturn { ${NAMES.join(", ")} };`)();
const { normalizeWordKey, classifyWordEntry, stemCandidates, buildWordContext, buildWordIndex } = api;

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

const mark = (id, text, extra = {}) => ({
  id,
  text,
  description: "",
  page_title: "2017 英语二 Text 2",
  page_url: "http://mynote.local:9090/p/2017-2.html",
  created_at: 1_700_000_000_000 + Number(String(id).replace(/\D/g, "") || 0),
  select_info: "[]",
  ...extra,
});

console.log("\n[1] 归一化：大小写 / 首尾标点 / 空格差异应并成一条");
{
  const marks = [mark("a1", "Profound"), mark("a2", "profound,"), mark("a3", "  profound  ")];
  const index = buildWordIndex(marks, new Map(), { mergeForms: false });
  check("聚合成 1 条", index.length === 1, "实际 " + index.length);
  check("出现次数为 3", index[0] && index[0].count === 3, index[0] && String(index[0].count));
  check("展示最常用写法", index[0] && index[0].display === "Profound", index[0] && index[0].display);
  check("其余写法进 variants", index[0] && index[0].variants.length === 2, index[0] && JSON.stringify(index[0].variants));
}

console.log("\n[2] 不同单词不应被合到一起");
{
  const marks = [mark("b1", "attribute"), mark("b2", "contribute"), mark("b3", "attribute")];
  const index = buildWordIndex(marks, new Map(), { mergeForms: false });
  check("得到 2 条", index.length === 2, "实际 " + index.length);
  check("按出现次数降序", index[0].display === "attribute" && index[0].count === 2, JSON.stringify(index.map(i => [i.display, i.count])));
}

console.log("\n[3] 合并词形：只往「确实标过的词形」上归并，绝不凭空造词干");
{
  const marks = [mark("c1", "attribute"), mark("c2", "attributes"), mark("c3", "attributed"), mark("c4", "used")];
  const merged = buildWordIndex(marks, new Map(), { mergeForms: true });
  const attribute = merged.find(entry => entry.display.toLowerCase().startsWith("attribute"));
  check("attribute 系列合并为 1 条", Boolean(attribute) && attribute.count === 3, JSON.stringify(merged.map(e => [e.display, e.count])));
  check("used 不被并成 us", merged.some(entry => entry.display === "used"), JSON.stringify(merged.map(e => e.display)));
  check("候选: attributes 含 attribute", stemCandidates("attributes").includes("attribute"), JSON.stringify(stemCandidates("attributes")));
  check("候选: attributed 含 attribute", stemCandidates("attributed").includes("attribute"), JSON.stringify(stemCandidates("attributed")));
  check("候选: running 含 run", stemCandidates("running").includes("run"), JSON.stringify(stemCandidates("running")));
  check("候选: profoundly 含 profound", stemCandidates("profoundly").includes("profound"), JSON.stringify(stemCandidates("profoundly")));
  check("候选: used 不含 us（长度保护）", !stemCandidates("used").includes("us"), JSON.stringify(stemCandidates("used")));
  check("候选: pass 不含 pas", !stemCandidates("pass").includes("pas"), JSON.stringify(stemCandidates("pass")));
}

console.log("\n[4] 未标过的词干不参与归并（避免把无关词并在一起）");
{
  const marks = [mark("h1", "runs"), mark("h2", "runnings")];
  const merged = buildWordIndex(marks, new Map(), { mergeForms: true });
  check("run 没标过 → 保持两条", merged.length === 2, JSON.stringify(merged.map(e => e.display)));
}

console.log("\n[5] 释义去重与标签并集");
{
  const marks = [
    mark("d1", "subtle", { description: "微妙的；不易察觉的" }),
    mark("d2", "subtle", { description: "微妙的；不易察觉的" }),
    mark("d3", "subtle", { description: "熟词生义：细微的" })
  ];
  const tagNames = new Map([["d1", ["生词"]], ["d2", ["熟词生义"]], ["d3", ["熟词生义", "高频"]]]);
  const index = buildWordIndex(marks, tagNames, { mergeForms: false });
  check("释义去重后剩 2 条", index[0].meanings.length === 2, JSON.stringify(index[0].meanings));
  check("标签取并集（3 个）", index[0].tags.length === 3, JSON.stringify(index[0].tags));
}

console.log("\n[6] 上下文提取（例句来源）");
{
  const withSelector = mark("e1", "profound", {
    select_info: JSON.stringify([{ type: "TextQuoteSelector", exact: "profound", prefix: "a ", suffix: " impact on the way we think" }])
  });
  const context = buildWordContext(withSelector);
  check("拼出前后文", context.includes("a ") && context.includes("profound") && context.includes("impact"), context);
  const broken = buildWordContext(mark("e2", "profound", { select_info: "not-json" }));
  check("select_info 损坏时不抛错", broken === "profound", broken);
}

console.log("\n[7] 中文词条同样可用");
{
  const marks = [mark("f1", "熟词生义"), mark("f2", "熟词生义"), mark("f3", "长难句")];
  const index = buildWordIndex(marks, new Map(), { mergeForms: true });
  check("中文聚合正确", index.length === 2 && index[0].count === 2, JSON.stringify(index.map(e => [e.display, e.count])));
}

console.log("\n[8] 边界：空标注 / 空白文本");
{
  check("空数组返回空表", buildWordIndex([], new Map(), {}).length === 0);
  const index = buildWordIndex([mark("g1", "   "), mark("g2", "")], new Map(), {});
  check("纯空白被跳过", index.length === 0, JSON.stringify(index));
  check("normalizeWordKey 处理 undefined", normalizeWordKey(undefined) === "");
}

console.log("\n[9] 单词 / 词组 / 其它 分类（用例取自你 6 月备份里的真实标注）");
{
  const cases = [
    ["president", "word"],
    ["unremarked", "word"],
    ["the rest of", "phrase"],
    ["was under fire", "phrase"],
    ["taking up", "phrase"],
    ["A", "other"],
    ["B", "other"],
    ["[A]", "other"],
    ["[B]", "other"],
    ["(C)", "other"],
    ["【D】", "other"],
    ["A.", "other"],
    ["  [C]  ", "other"],
    ["①", "other"],
    ["1)", "other"],
    ["→", "other"],
    ["I", "other"],
    ["2017", "other"],
    ["But by the end of 2009 Ms. Simmons was under fire for having sat on Goldman's compensation committee", "other"],
    ["A year ago the end seemed near.", "other"],
    ["It is too soon to write off the EU.", "other"],
    ["debate over the EU's single currency", "phrase"],
    ["talk of a continent facing a \"Bermuda triangle\"", "phrase"],
    ["out of date.", "phrase"],
    ["restraint and confidence.", "phrase"],
    ["share price", "phrase"],
    ["熟词生义", "phrase"],
    ["长难句", "phrase"],
    ["他在会上提出的方案没有被采纳，因为缺乏数据支撑", "other"]
  ];
  cases.forEach(([text, expected]) => {
    const actual = classifyWordEntry(text);
    const label = text.length > 24 ? text.slice(0, 24) + "…" : text;
    check(`归为 ${expected.padEnd(6)} ← ${label}`, actual === expected, `实际归为 ${actual}`);
  });
}

console.log("\n[10] 词表过滤：只保留单词与词组");
{
  const sentence = "But by the end of 2009 Ms. Simmons was under fire for having sat on Goldman's compensation committee";
  const marks = [
    mark("i1", "president", { description: "主持" }),
    mark("i2", "A"),
    mark("i3", "the rest of", { description: "其余" }),
    mark("i4", sentence),
    mark("i5", "2017")
  ];
  const index = buildWordIndex(marks, new Map(), {});
  const kept = index.filter(entry => entry.kind !== "other");
  check("5 条里留下 2 条", kept.length === 2, JSON.stringify(index.map(e => [e.display.slice(0, 12), e.kind])));
  check("留下的是单词与词组", kept.every(entry => entry.display === "president" || entry.display === "the rest of"), JSON.stringify(kept.map(e => e.display)));
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exitCode = failed === 0 ? 0 : 1;
