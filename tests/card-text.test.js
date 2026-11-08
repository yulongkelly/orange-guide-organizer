const test = require("node:test");
const assert = require("node:assert/strict");
const { flowerPartsFromLabel, flowerPartsFromLine, flowerPartsFromLines, flowerLabel, displayBody } = require("../card-text.js");

test("flower parts: label, line and single number", () => {
  assert.deepEqual(flowerPartsFromLabel("鲜花 561 259"), { fresh: 561, wild: 259 });
  assert.equal(flowerPartsFromLabel("561 259"), null);
  assert.deepEqual(flowerPartsFromLine("561 259"), { fresh: 561, wild: 259 });
  assert.deepEqual(flowerPartsFromLine("42"), { fresh: 42, wild: 0 });
  assert.equal(flowerPartsFromLine("abc"), null);
  assert.deepEqual(flowerPartsFromLines(["作者", "561 259", "2024-01-01 10:00"]), { fresh: 561, wild: 259 });
  assert.equal(flowerPartsFromLines(["作者", "2024-01-01 10:00", "5"]), null);
});

test("flowerLabel prefers split fields, then flowerLine, then total", () => {
  assert.equal(flowerLabel({ flowersFresh: 561, flowersWild: 259, flowers: 820 }), "🌸 鲜花 561 · 野花 259");
  assert.equal(flowerLabel({ flowerLine: "561 259", flowers: 820 }), "🌸 鲜花 561 · 野花 259");
  assert.equal(flowerLabel({ flowerLine: "7", flowers: 7 }), "🌸 鲜花 7 · 野花 0");
  assert.equal(flowerLabel({ flowers: 820 }), "🌸 820");
  assert.equal(flowerLabel({ flowers: null }), "花数未知");
});

test("displayBody strips header/footer lines but keeps the content", () => {
  const r = { author: "甲乙", flowerLine: "561 259", postedAt: "2024-01-01 10:00", text: "甲乙\n561 259\n2024-01-01 10:00\n第一周先去主线。\n\n第二周存钱。\nIP属地 来自：广东\n12 分享 举报" };
  assert.equal(displayBody(r), "第一周先去主线。\n\n第二周存钱。");
  assert.ok(r.text.startsWith("甲乙\n561 259"));
});

test("displayBody keeps lines that merely contain the author and falls back when empty", () => {
  assert.equal(displayBody({ author: "甲", text: "甲说要攻略主线\n结局" }), "甲说要攻略主线\n结局");
  assert.equal(displayBody({ author: "甲", text: "甲" }), "甲");
});
