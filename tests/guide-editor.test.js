const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { splitGuideSections, replaceRange, remapSectionIndexes, createTextCache, normalizeNewlines } = require("../time-points.js");

const SAMPLE = normalizeNewlines(fs.readFileSync(path.join(__dirname, "..", "凡人期攻略.md"), "utf8"));
const KEYWORD_GUIDE = "前言\n\n## 暑假第一周 [第1周]\n甲\n\n## 暑假第二周 [第2周]\n甲\n\n## 暑假第三周 [第3周]\n乙\n";
const edit = (text, index, next, options = { headings: true }) => {
  const section = splitGuideSections(text, options)[index];
  return replaceRange(text, section.start, section.end, next);
};

test("小节偏移指回原文：凡人期攻略.md 每一节都能原样取出", () => {
  const sections = splitGuideSections(SAMPLE, { headings: true });
  assert.ok(sections.length > 3);
  for (const s of sections) assert.equal(SAMPLE.slice(s.start, s.end), s.text);
});

test("没有标题的纯文字也带偏移，合并的“通用”节没有范围", () => {
  const text = "1月先买剑\n\n随便写点\n\n2月去山洞\n";
  const sections = splitGuideSections(text, { headings: false });
  for (const s of sections.filter((x) => x.kind === "time")) assert.equal(text.slice(s.start, s.end), s.text);
  const general = sections.find((x) => x.kind === "general");
  assert.equal(general.start, null);
  assert.equal(general.end, null);
});

test("编辑某一节后，其他节逐字不变，分隔空行保留", () => {
  const before = splitGuideSections(SAMPLE, { headings: true });
  const index = Math.floor(before.length / 2);
  const next = edit(SAMPLE, index, before[index].text + "\n新增一行");
  const after = splitGuideSections(next, { headings: true });
  assert.equal(after.length, before.length);
  after.forEach((s, i) => { if (i !== index) assert.equal(s.text, before[i].text); });
  assert.equal(after[index].text, before[index].text + "\n新增一行");
  assert.equal(next.slice(0, before[index].start), SAMPLE.slice(0, before[index].start));
  assert.equal(next.slice(next.length - (SAMPLE.length - before[index].end)), SAMPLE.slice(before[index].end));
});

test("内容相同的两节只改中间那节", () => {
  const next = edit(KEYWORD_GUIDE, 2, "## 暑假第二周 [第2周]\n甲（已改）");
  assert.equal(next, "前言\n\n## 暑假第一周 [第1周]\n甲\n\n## 暑假第二周 [第2周]\n甲（已改）\n\n## 暑假第三周 [第3周]\n乙\n");
  const same = "## 甲 [第1周]\n同\n\n## 甲 [第1周]\n同\n\n## 甲 [第1周]\n同\n";
  assert.equal(edit(same, 1, "## 甲 [第1周]\n改"), "## 甲 [第1周]\n同\n\n## 甲 [第1周]\n改\n\n## 甲 [第1周]\n同\n");
});

test("改标题里的关键词后 keywords 更新", () => {
  const next = edit(KEYWORD_GUIDE, 2, "## 暑假第二周 [第2周|第9-10周]\n甲");
  const sections = splitGuideSections(next, { headings: true });
  assert.deepEqual(sections[2].keywords, ["第2周", "第9周", "第10周"]);
  assert.deepEqual(sections[1].keywords, ["第1周"]);
  assert.deepEqual(sections[3].keywords, ["第3周"]);
});

test("开头节和最后一节也能正确写回", () => {
  const first = edit(KEYWORD_GUIDE, 0, "新的前言");
  assert.ok(first.startsWith("新的前言\n\n## 暑假第一周"));
  assert.equal(first.slice(first.indexOf("## 暑假第一周")), KEYWORD_GUIDE.slice(KEYWORD_GUIDE.indexOf("## 暑假第一周")));
  const lastIndex = splitGuideSections(KEYWORD_GUIDE, { headings: true }).length - 1;
  const last = edit(KEYWORD_GUIDE, lastIndex, "## 暑假第三周 [第3周]\n丙");
  assert.equal(last, KEYWORD_GUIDE.replace("乙", "丙"));
});

test("replaceRange 拒绝越界范围，并统一换行", () => {
  assert.throws(() => replaceRange("abc", 2, 9, "x"), RangeError);
  assert.throws(() => replaceRange("abc", 2, 1, "x"), RangeError);
  assert.equal(replaceRange("a\r\nb", 0, 1, "x\r\ny"), "x\ny\nb");
});

test("编辑后用偏移找回原来的小节（置顶、展开状态不指错）", () => {
  const oldSections = splitGuideSections(KEYWORD_GUIDE, { headings: true });
  const target = oldSections[2];
  const next = replaceRange(KEYWORD_GUIDE, target.start, target.end, target.text + "\n多出来的几行\n又一行");
  const newSections = splitGuideSections(next, { headings: true });
  const map = remapSectionIndexes(oldSections, newSections, { start: target.start, oldEnd: target.end, newEnd: target.start + target.text.length + "\n多出来的几行\n又一行".length });
  assert.deepEqual(map, [0, 1, 2, 3]);
  oldSections.forEach((s, i) => assert.equal(newSections[map[i]].title, s.title));
});

test("把一节改成不带时间的标题后，它变成通用节，其余小节仍对得上", () => {
  const oldSections = splitGuideSections(KEYWORD_GUIDE, { headings: true });
  const target = oldSections[2];
  const replacement = "## 随便写的标题\n甲";
  const next = replaceRange(KEYWORD_GUIDE, target.start, target.end, replacement);
  const newSections = splitGuideSections(next, { headings: true });
  const map = remapSectionIndexes(oldSections, newSections, { start: target.start, oldEnd: target.end, newEnd: target.start + replacement.length });
  assert.equal(newSections[map[3]].title, "暑假第三周");
  assert.equal(newSections[map[2]].kind, "general");
});

test("缓存按文字内容区分：长度不变的修改不会读到旧结果", () => {
  const cache = createTextCache();
  let calls = 0;
  const compute = (text) => () => { calls++; return splitGuideSections(text, { headings: true }); };
  const a = "## 一月 [第1周]\n甲";
  const b = "## 一月 [第2周]\n甲";
  assert.equal(a.length, b.length);
  assert.deepEqual(cache.get("g1", a, true, compute(a))[0].keywords, ["第1周"]);
  assert.deepEqual(cache.get("g1", b, true, compute(b))[0].keywords, ["第2周"]);
  cache.get("g1", b, true, compute(b));
  assert.equal(calls, 2);
  cache.get("g1", b, false, compute(b));
  assert.equal(calls, 3);
  cache.get("g2", b, true, compute(b));
  assert.equal(calls, 4);
});
