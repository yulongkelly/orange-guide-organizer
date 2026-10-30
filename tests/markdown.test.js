const test = require("node:test");
const assert = require("node:assert/strict");
const { renderMarkdown, summarizeMarkdown } = require("../markdown.js");

test("标题、粗体和段落", () => {
  const html = renderMarkdown("## 九月\n\n这是**重点**内容\n第二行");
  assert.match(html, /<h4 class="ogo-md-h ogo-md-h2">九月<\/h4>/);
  assert.match(html, /<p>这是<strong>重点<\/strong>内容<br>第二行<\/p>/);
});

test("无序、有序和嵌套列表", () => {
  const html = renderMarkdown("- 一\n  - 一之一\n  - 一之二\n- 二\n\n1. 甲\n2. 乙");
  assert.equal(html, "<ul><li>一<ul><li>一之一</li><li>一之二</li></ul></li><li>二</li></ul><ol><li>甲</li><li>乙</li></ol>");
});

test("引用和表格", () => {
  assert.match(renderMarkdown("> 提示\n> 再提示"), /<blockquote><p>提示<br>再提示<\/p><\/blockquote>/);
  const table = renderMarkdown("| 月 | 事 |\n| --- | --- |\n| 一月 | 买药 |");
  assert.match(table, /<div class="ogo-md-tablewrap"><table><thead><tr><th>月<\/th><th>事<\/th><\/tr><\/thead><tbody><tr><td>一月<\/td><td>买药<\/td><\/tr><\/tbody><\/table><\/div>/);
});

test("时段开头和末尾作者只加样式，不改文字", () => {
  const html = renderMarkdown("- 晚上：丽春院喝花酒（hg34615692）。");
  assert.match(html, /<span class="ogo-md-slot">晚上<\/span>丽春院喝花酒<span class="ogo-md-by">（hg34615692）<\/span>。/);
  const text = html.replace(/<[^>]+>/g, "");
  assert.equal(text, "丽春院喝花酒（hg34615692）。".replace(/^/, "晚上"));
  assert.match(renderMarkdown("- 上午、下午：书院"), /<span class="ogo-md-slot">上午、下午<\/span>书院/);
});

test("原文里的 HTML、脚本和链接一律转义", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[点我](javascript:alert(1)) ![x](http://a/b.png)\n- <b onclick="x()">列表</b>\n| <i>a</i> | b |\n| - | - |\n| <u>c</u> | d |');
  assert.ok(!/<script|<img|<b |<i>|<u>|<a /.test(html));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /\[点我\]\(javascript:alert\(1\)\)/);
  assert.match(html, /&lt;b onclick=&quot;x\(\)&quot;&gt;/);
});

test("评论式纯文本按段落和换行显示", () => {
  assert.equal(renderMarkdown("1、云沧峰讨债剧情，2月白天\n触发。\n\n2、奶奶剧情"), "<p>1、云沧峰讨债剧情，2月白天<br>触发。</p><p>2、奶奶剧情</p>");
});

test("空文本和只有空白", () => {
  assert.equal(renderMarkdown(""), "");
  assert.equal(renderMarkdown("  \n \n"), "");
});

test("折叠卡片摘要", () => {
  assert.equal(summarizeMarkdown("## 九月\n\n- 晚上：丽春院喝花酒，选“欣然答应”（hg34615692）。"), "晚上：丽春院喝花酒，选“欣然答应”");
  assert.equal(summarizeMarkdown("## 空"), "");
  assert.equal(summarizeMarkdown("- " + "字".repeat(60)).length, 37);
});

test("摘要：只有时段标签时接上下一行内容", () => {
  assert.equal(summarizeMarkdown("- 上午：\n  - 书院学习（作者）"), "上午：书院学习");
  assert.equal(summarizeMarkdown("- 晚上："), "晚上：");
});

const { renderPlain, summarizePlain } = require("../markdown.js");
test("纯文本：只排段落和换行，不解释 # - | 等符号，并转义", () => {
  const html = renderPlain("## 不是标题\n- 不是列表\n\n<img src=x onerror=alert(1)> | a | b |\n**不是粗体**");
  assert.equal(html, "<p>## 不是标题<br>- 不是列表</p><p>&lt;img src=x onerror=alert(1)&gt; | a | b |<br>**不是粗体**</p>");
  assert.equal(renderPlain(""), "");
  assert.equal(summarizePlain("\n  第一行内容\n第二行"), "第一行内容");
});
