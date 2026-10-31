const test = require("node:test");
const assert = require("node:assert");
const { collectAuthors, renderMarkdown } = require("../markdown.js");

const guide = ["- 甲（褚璃儿、乐妈0423）。", "- 乙（褚璃儿）。", "- 丙（乐妈0423）。", "- 丁（星途）。", "- 戊（洛艽 2021-06）。", "- 己（洛艽 2021-02）。", "- 庚（褚璃儿“加好感”）。"].join("\n");

test("collectAuthors：只收多次署名的名字", () => {
  const names = collectAuthors(guide);
  assert.ok(names.includes("褚璃儿") && names.includes("乐妈0423") && names.includes("洛艽"));
  assert.ok(!names.includes("星途"));
  assert.ok(!names.some((name) => name.includes("“")));
});

test("renderMarkdown：括号内和行首的作者变淡", () => {
  const authors = ["廉怼怼.", "渔鱼一鱼", "方某在此", "新月.."];
  const html = renderMarkdown("早餐：10分饱（廉怼怼.；渔鱼一鱼：前12天）/ 8分饱。", { authors });
  assert.match(html, /（<span class="ogo-md-by">廉怼怼\.<\/span>；<span class="ogo-md-by">渔鱼一鱼<\/span>：前12天）/);
  assert.match(renderMarkdown("方某在此、新月..：暑假先吃到43kg", { authors }), /^<p><span class="ogo-md-by">方某在此、新月\.\.<\/span>：/);
});

test("renderMarkdown：普通文字里的同名词不变", () => {
  assert.equal(renderMarkdown("侧重星途，之后练歌", { authors: ["星途"] }), "<p>侧重星途，之后练歌</p>");
});

test("renderMarkdown：作者名里的特殊字符会转义", () => {
  const html = renderMarkdown("做法（a<b>c）/ 另一种。", { authors: ["a<b>c"] });
  assert.ok(!html.includes("<b>"));
});