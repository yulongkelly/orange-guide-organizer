const test = require("node:test");
const assert = require("node:assert");
const { normalizeKeyword, parseHeadingKeywords, findKeywords, splitGuideSections } = require("../time-points.js");

test("normalizeKeyword：中文数字和阿拉伯数字等价", () => {
  assert.equal(normalizeKeyword("第一周 周一 晨"), "第1周周1晨");
  assert.equal(normalizeKeyword("第1周周一"), "第1周周1");
  assert.equal(normalizeKeyword("十一月"), "11月");
  assert.equal(normalizeKeyword("第１周"), "第1周");
});

test("parseHeadingKeywords：标题与关键词分开", () => {
  assert.deepEqual(parseHeadingKeywords("暑假第一周 [第1周]"), { title: "暑假第一周", keywords: ["第1周"] });
  assert.deepEqual(parseHeadingKeywords("默认循环 [第1周|第二周]").keywords, ["第1周", "第2周"]);
  assert.deepEqual(parseHeadingKeywords("默认循环 [第4-6周]").keywords, ["第4周", "第5周", "第6周"]);
  assert.deepEqual(parseHeadingKeywords("目标数值"), { title: "目标数值", keywords: [] });
});

test("parseHeadingKeywords：倒序或过大的范围不展开", () => {
  assert.deepEqual(parseHeadingKeywords("x [第8-4周]").keywords, ["第8-4周"]);
  assert.deepEqual(parseHeadingKeywords("x [第1-500周]").keywords, ["第1-500周"]);
});

test("findKeywords：匹配屏幕上的短文字", () => {
  assert.deepEqual(findKeywords("第1周 周一 晨", ["第1周", "第2周"]), ["第1周"]);
  assert.deepEqual(findKeywords("第一周 周一 晨", ["第1周"]), ["第1周"]);
  assert.deepEqual(findKeywords("第3周 周二 午", ["第3周", "第3周周2"]), ["第3周", "第3周周2"]);
});

test("findKeywords：数字边界", () => {
  assert.deepEqual(findKeywords("第11周 周一", ["第1周"]), []);
  assert.deepEqual(findKeywords("庆和22年11月", ["1月"]), []);
  assert.deepEqual(findKeywords("庆和22年1月", ["1月"]), ["1月"]);
  assert.deepEqual(findKeywords("十一月", ["一月"].map(normalizeKeyword)), []);
});

test("findKeywords：!月 排除紧跟月份的周数", () => {
  assert.deepEqual(parseHeadingKeywords("暑假 [第4-5周!月]").keywords, ["第4周!月", "第5周!月"]);
  assert.deepEqual(findKeywords("第1周 周一 晨", ["第1周!月"]), ["第1周!月"]);
  assert.deepEqual(findKeywords("9月 第1周 6:00", ["第1周!月", "9月"]), ["9月"]);
  assert.deepEqual(findKeywords("九月第一周", ["第1周!月", "9月"]), ["9月"]);
});

test("findKeywords：长对话不算", () => {
  const dialogue = "老师说下学期的比赛报名要在第1周之前交上来，大家回家以后都要和父母好好商量一下再决定";
  assert.deepEqual(findKeywords(dialogue, ["第1周"]), []);
});

test("splitGuideSections：关键词标题成为时间节，并保持作者顺序", () => {
  const guide = "# 攻略\n\n## 目标\n内容\n\n## 暑假第二周 [第2周]\n二\n\n## 暑假第一周 [第1周]\n一\n\n## 初三九月\n九\n\n## 文末\n完";
  const sections = splitGuideSections(guide, { headings: true });
  const timed = sections.filter((s) => s.kind === "time");
  assert.deepEqual(timed.map((s) => s.title), ["暑假第二周", "暑假第一周", "初三九月"]);
  assert.deepEqual(timed[0].keywords, ["第2周"]);
  assert.ok(timed[0].order < timed[1].order && timed[1].order < timed[2].order);
  assert.deepEqual(sections.find((s) => s.title === "目标").keywords, []);
});

test("splitGuideSections：纯文本不解析方括号", () => {
  const sections = splitGuideSections("## 第一周 [第1周]\n内容", { headings: false });
  assert.ok(sections.every((s) => s.keywords.length === 0));
});

test("splitGuideSections：年月攻略不受影响", () => {
  const sections = splitGuideSections("## 一月\n甲\n\n## 三月\n乙", { headings: true });
  assert.deepEqual(sections.map((s) => s.months), [[1], [3]]);
  assert.ok(sections.every((s) => s.keywords.length === 0));
});
