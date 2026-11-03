const test = require("node:test");
const assert = require("node:assert");
const { parseHeadingKeywords, keywordLabel, findImageKeywords, imageKeywordUses, pickImageSection, createKeywordMatcher, splitGuideSections } = require("../time-points.js");
const { md5FromUrl, collectVisibleImages } = require("../game-bridge.js");

const MD5 = "ca9bc9e1f0a2d3e4b5c6d7e8f9a0b1c2";

test("parseHeadingKeywords：图: 关键词只保留小写十六进制，不做中文数字规范化", () => {
  assert.deepEqual(parseHeadingKeywords("十月 [靖安成16年10月|图:CA9BC9E1F0A2]"), { title: "十月", keywords: ["靖安成16年10月", "图:ca9bc9e1f0a2"] });
  assert.deepEqual(parseHeadingKeywords("十月 [图：ca9b-c9e1 f0a2]").keywords, ["图:ca9bc9e1f0a2"]);
  assert.deepEqual(parseHeadingKeywords("十月 [图:ca9|十月]").keywords, ["10月"], "太短的图关键词会丢掉");
  assert.deepEqual(parseHeadingKeywords("x [图:aaaaaaaa1-3]").keywords, ["图:aaaaaaaa13"], "不按范围展开");
});

test("keywordLabel：图关键词没有文字标签", () => {
  assert.equal(keywordLabel("图:ca9bc9e1f0a2"), "");
  assert.equal(keywordLabel("第1周!月"), "第1周");
});

test("findImageKeywords：按 md5 前缀匹配，只看图关键词", () => {
  const keywords = ["图:ca9bc9e1f0a2", "图:ffffffff", "ca9bc9e1"];
  assert.deepEqual(findImageKeywords([MD5], keywords), ["图:ca9bc9e1f0a2"]);
  assert.deepEqual(findImageKeywords([MD5.toUpperCase()], keywords), ["图:ca9bc9e1f0a2"]);
  assert.deepEqual(findImageKeywords(["0".repeat(32)], keywords), []);
});

test("组合图关键词：解析成排好序的 a+b", () => {
  assert.deepEqual(parseHeadingKeywords("十月 [图:bbbbbbbb+aaaaaaaa]").keywords, ["图:aaaaaaaa+bbbbbbbb"]);
  assert.deepEqual(parseHeadingKeywords("十月 [图:aaaaaaaa＋图：BBBBBBBB]").keywords, ["图:aaaaaaaa+bbbbbbbb"]);
  assert.deepEqual(parseHeadingKeywords("十月 [图:aaaaaaaa+bbb]").keywords, [], "有一段太短就整个丢掉");
});

test("组合图关键词：所有图都在屏幕上才命中，命中时只用最大的组合", () => {
  const sixty = "6".repeat(32);
  const october = "a".repeat(32);
  const keywords = ["图:66666666+aaaaaaaa", "图:aaaaaaaa", "图:bbbbbbbb"];
  assert.deepEqual(findImageKeywords([october], keywords), ["图:aaaaaaaa"]);
  assert.deepEqual(findImageKeywords([sixty], keywords), []);
  assert.deepEqual(findImageKeywords([sixty, october], keywords), ["图:66666666+aaaaaaaa"]);
  assert.equal(imageKeywordUses("图:66666666+aaaaaaaa", october), true);
  assert.equal(imageKeywordUses("图:66666666+aaaaaaaa", "b".repeat(32)), false);
});

test("文字匹配器不会把图关键词当文字", () => {
  assert.deepEqual(createKeywordMatcher(["图:ca9bc9e1f0a2", "第1周"])("第1周 周一"), ["第1周"]);
});

test("md5FromUrl：从资源地址取 32 位 md5", () => {
  assert.equal(md5FromUrl(`https://cdn.66rpg.com/res/ca/${MD5}.png`), MD5);
  assert.equal(md5FromUrl(`https://cdn.66rpg.com/res/${MD5.toUpperCase()}.png?v=${"1".repeat(32)}`), MD5, "路径优先于查询串");
  assert.equal(md5FromUrl(`/res/x.png?md5=${MD5}`), MD5);
  assert.equal(md5FromUrl(`/res/${MD5}0.png`), "", "33 位不算");
  assert.equal(md5FromUrl("/res/title.png"), "");
  assert.equal(md5FromUrl(null), "");
});

test("pickImageSection：对白里的年份优先", () => {
  const candidates = [
    { index: 2, keywords: ["靖安成15年10月", "图:ca9bc9e1f0a2"] },
    { index: 7, keywords: ["靖安成16年10月", "图:ca9bc9e1f0a2"] },
    { index: 12, keywords: ["靖安成17年10月", "图:ca9bc9e1f0a2"] }
  ];
  assert.equal(pickImageSection(candidates, { context: ["靖安成16年"], current: 0 }), 7);
  assert.equal(pickImageSection(candidates, { context: ["靖安成16年9月"], current: 0 }), 7, "上个月的日期也带年份");
  assert.equal(pickImageSection(candidates, { context: ["靖安成99年"], current: 3 }), 7, "年份对不上时按位置");
});

test("pickImageSection：没有年份时选当前位置及之后最近的一节", () => {
  const candidates = [{ index: 2, keywords: ["图:ca9bc9e1f0a2"] }, { index: 7, keywords: ["图:ca9bc9e1f0a2"] }];
  assert.equal(pickImageSection(candidates, { current: -1 }), 2);
  assert.equal(pickImageSection(candidates, { current: 2 }), 2, "还在这一节就不动");
  assert.equal(pickImageSection(candidates, { current: 3 }), 7, "往前推进到下一年");
  assert.equal(pickImageSection(candidates, { current: 9 }), 2, "后面没有时回到第一节");
  assert.equal(pickImageSection([], {}), -1);
});

test("标题里的图关键词让这一节参与定位", () => {
  const guide = `## 冥府养成 [图:ca9bc9e1f0a2]
甲

## 十月 [10月]
乙
`;
  assert.deepEqual(splitGuideSections(guide).map((s) => [s.kind, s.title, s.keywords]), [["time", "冥府养成", ["图:ca9bc9e1f0a2"]], ["time", "十月", ["10月"]]]);
});

test("collectVisibleImages：走场景树，跳过隐藏的图层和子树", () => {
  const sprite = (name, extra = {}) => ({ url: `https://cdn/res/${name.repeat(32).slice(0, 32)}.png`, ...extra });
  const shared = sprite("a");
  const root = {
    children: [
      sprite("a", { width: 1280, height: 720 }),
      { _children: [sprite("b", { bitmap: { width: 120, height: 40 } }), sprite("c", { visible: false })] },
      { visible: false, children: [sprite("d")] },
      { childs: [shared, { _texture: { url: `/res/${"e".repeat(32)}.png`, _width: 30, _height: 20 } }] },
      sprite("f", { alpha: 0 })
    ]
  };
  root.children.push(root);
  assert.deepEqual(collectVisibleImages(root).map((md5) => md5[0]), ["a", "b", "e"]);
});

test("collectVisibleImages：优先用加载时记下的图", () => {
  const node = {};
  assert.deepEqual(collectVisibleImages({ children: [node] }, (n) => (n === node ? "1".repeat(32) : "")), ["1".repeat(32)]);
  assert.deepEqual(collectVisibleImages(undefined), []);
});
