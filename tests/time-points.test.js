const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTimePoints, classifyTimePoint, splitGuideSections, sectionAhead, parseCn, findKeywords, createKeywordMatcher } = require("../time-points.js");

const labels = (text) => parseTimePoints(text).map((p) => p.label);

// [name, text from a real 沧海仙途 guide comment (or a close variant), expected highlighted labels]
const cases = [
  ["特殊时间点：月份加上午", "特殊时间点只有两个：1月晚上去药店买第二种药；5月上午去百花谷自动触发", ["1月", "5月"]],
  ["中文月份", "君琪华 ：一月晚上集市，选项", ["一月"]],
  ["寿命里的年份不是时间点", "开启练气期后转化为至少1700年寿命——1700寿命", []],
  ["五十年是时长", "下界历练是真的能顿悟啊，五十年那个沉浸感拉满了简直", []],
  ["百年之后是泛指", "如果一切止步这里，那么百年之后，云沧海再提起殷", []],
  ["境界加年数", "元婴期五年-她怎么会遗憾\n元婴期十五年-不遗憾\n元婴期五十五年-好\n元婴期155年-我和她越来越远了", ["元婴期五年", "元婴期十五年", "元婴期五十五年", "元婴期155年"]],
  ["数字加年的事件", "30年宗门秘境后去玄丹峰", ["30年"]],
  ["一年只能是频率，12月是时间点", "注意，一年只能扩招一次。你第一年找满五个月，12月去修炼秘籍了", ["第一年", "12月"]],
  ["修行第N年", "5、修行第20年云寒星考察剑术剧情", ["修行第20年"]],
  ["闭关10年是时长", "1、开局小别峰闭关10年+4000剑道。", []],
  ["25岁和2008年不是游戏时间", "答案是鹤顶红，25岁，2008年，几乎100%。", []],
  ["20年剑术副线", "合成破月玉佩，完成云寒星20年剑术副线考查任务后可", ["20年"]],
  ["多条月份剧情", "1、云沧峰讨债剧情，2月白天，6月晚上，自动", ["2月", "6月"]],
  ["五月四月中文", "5、花陇西剧情，五月之后百花谷游玩触发。6、顾少怀剧情，四月中午自动触发", ["五月", "四月"]],
  ["守三年是时长", "灵前守三年", []],
  ["月份列表每行一个", "一月 外出\n二月 外出\n三月 外出", ["一月", "二月", "三月"]],
  ["第3年1月", "第3年1月自动触发，要求百里十0天道", ["第3年1月"]],
  ["每年12月", "消耗6个月，每年12月去，次年1月出", ["每年12月", "次年1月"]],
  ["21年秘境", "要求21年宗门秘境之前，至少修", ["21年"]],
  ["20年内是时长", "副线任务，20年内剑术1000点", []],
  ["每次消耗1月是时长", "可无限重置，每次消耗1月。", []],
  ["每场战斗消耗5～6年", "每一场战斗消耗5～6年，能避则避。", []],
  ["元婴100年后", "娶桃子的道友在元婴100年后可触发3次剧情", ["元婴100年"]],
  ["金丹期99年", "秘境最早可以在金丹期99年的亲传弟子之后", ["金丹期99年"]],
  ["十年一千二是产出", "占领玉衡灵矿，真元力十年一千二，扣一千天道", []],
  ["每年生日不是时间点", "每年生日都可以送礼", []],
  ["年龄不是时间点", "年龄超过限制就不能触发", []],
  ["发布日期不是时间点", "NEW-AN90 2023-02-03 12:30 阅读时长 5月", ["5月"]],
  ["年月组合", "12年11月藏剑峰（小剧情）", ["12年11月"]],
  ["庆和纪年", "庆和20年1月去买药", ["庆和20年1月"]],
  ["修炼纪年", "修炼1年1月开始", ["修炼1年1月"]],
  ["第0年月份范围", "第0年1-7月 云海峰种田，刷阴天", ["第0年1-7月"]],
  ["月份范围", "8-11月修道院；5月到12月都可以", ["8-11月", "5月到12月"]],
  ["中文月份列表", "四五六月都会触发", ["四", "五", "六月"]],
  ["年份列举", "元婴期5，15，55，155年各有一次剧情", ["5", "15", "55", "155年"]],
  ["七月之前和八月", "分享一下我的攻略：七月之前一直去云海峰，八月去坊市，十一月十二月传道馆", ["七月", "八月", "十一月", "十二月"]],
  ["2个月是时长", "每次等待2个月才能刷新", []],
  ["272年金丹", "【新年版本】【272年金丹】", ["272年"]]
];

for (const [name, text, expected] of cases) {
  test(name, () => assert.deepEqual(labels(text), expected));
}

test("返回区间与原文一致", () => {
  const text = "前文，庆和20年1月去买药。";
  const [point] = parseTimePoints(text);
  assert.equal(text.slice(point.start, point.end), "庆和20年1月");
  assert.deepEqual({ year: point.year, month: point.month, calendar: point.calendar }, { year: 20, month: 1, calendar: "庆和" });
});

test("境界取同一段内最近的前置境界词", () => {
  const points = parseTimePoints("练气期先去云海峰。筑基期之后，5月上午去百花谷。\n\n金丹期以后另一段，6月触发。\n\n没有境界的一段，7月。");
  assert.deepEqual(points.map((p) => [p.label, p.stage]), [["5月", "筑基期"], ["6月", "金丹期"], ["7月", ""]]);
});

test("炼气会规范成练气期", () => {
  assert.equal(parseTimePoints("炼气期3月触发")[0].stage, "练气期");
});

test("中文数字解析", () => {
  assert.deepEqual(["十二", "二十五", "五十五", "一百零五", "十", "百", "四五"].map(parseCn), [12, 25, 55, 105, 10, null, null]);
});

test("没有文字或没有时间点", () => {
  assert.deepEqual(parseTimePoints(""), []);
  assert.deepEqual(parseTimePoints(undefined), []);
  assert.deepEqual(parseTimePoints("没有任何时间"), []);
});

test("classify：没有当前时间时一律普通", () => {
  assert.equal(classifyTimePoint({ month: 5 }, null).level, "normal");
});

test("classify：只有月份，本月与未来 1-2 个月", () => {
  const current = { month: 11, year: 3 };
  assert.equal(classifyTimePoint({ month: 11 }, current).level, "now");
  assert.equal(classifyTimePoint({ month: 12 }, current).level, "soon");
  assert.equal(classifyTimePoint({ month: 1 }, current).level, "soon");
  assert.equal(classifyTimePoint({ month: 2 }, current).level, "normal");
  assert.equal(classifyTimePoint({ month: 10 }, current).level, "normal");
});

test("classify：月份范围", () => {
  assert.equal(classifyTimePoint({ month: 1, monthEnd: 7 }, { month: 5 }).level, "now");
  assert.equal(classifyTimePoint({ month: 8, monthEnd: 11 }, { month: 6 }).level, "soon");
});

test("classify：有年份须年月都对", () => {
  const current = { calendar: "修炼", year: 1, month: 1 };
  assert.equal(classifyTimePoint({ calendar: "修炼", year: 1, month: 1 }, current).level, "now");
  assert.equal(classifyTimePoint({ calendar: "修炼", year: 2, month: 1 }, current).level, "normal");
  assert.equal(classifyTimePoint({ calendar: "修炼", year: 1, month: 3 }, current).level, "soon");
  assert.equal(classifyTimePoint({ calendar: "修炼", year: 1, month: 5 }, current).level, "normal");
});

test("classify：纪年不同只比月份并提示", () => {
  const result = classifyTimePoint({ calendar: "修炼", year: 1, month: 1 }, { calendar: "庆和", year: 20, month: 1 });
  assert.equal(result.level, "now");
  assert.match(result.note, /纪年不同/);
});

test("classify：境界都已知且不同则不高亮", () => {
  assert.equal(classifyTimePoint({ month: 5, stage: "筑基期" }, { month: 5, stage: "练气期" }).level, "normal");
  assert.equal(classifyTimePoint({ month: 5, stage: "" }, { month: 5, stage: "练气期" }).level, "now");
});

test("classify：当前年份未知时带年份的点不判断", () => {
  assert.equal(classifyTimePoint({ calendar: "修炼", year: 1, month: 1 }, { month: 1 }).level, "normal");
});

// Excerpt of a real hand-written guide (凡人期攻略.md): sections are markdown headings.
const MD_GUIDE = `# 沧海仙途 凡人期攻略（按月份）

范围：开局到进入练气期为止。

## 每日通用选项（原文没写月份）

- 每天早上外出，一天活动 3 次（紫胤道人 2019）。
- 书院，精神 +15：开局有 200 多金钱时（紫胤道人 2019）。

## 一月

- 上午、下午：书院学习（hg34615692；默认循环，姬荒姐妹情）。
- 晚上：

## 七月、八月

- 紫胤道人 2019 也没有写具体安排，只说花陇西事件五月到十二月都能触发（见通用选项）。

## 九月

- 晚上：丽春院喝花酒，选“欣然答应”（hg34615692）。

### 补充说明

- 深夜：随便。

## 文末

灯谜答案（依次）：家长里短，胃，汁。`;

test("切分：按标题分节，没有时间的是通用段", () => {
  const sections = splitGuideSections(MD_GUIDE);
  assert.deepEqual(sections.map((s) => [s.kind, s.title]), [
    ["general", "沧海仙途 凡人期攻略（按月份）"], ["general", "每日通用选项（原文没写月份）"],
    ["time", "一月"], ["time", "七月、八月"], ["time", "九月"], ["general", "文末"]
  ]);
  assert.deepEqual(sections.filter((s) => s.kind === "time").map((s) => s.months), [[1], [7, 8], [9]]);
});

test("切分：标题下的内容和子标题都属于该月，正文里的月份不改变归属", () => {
  const sections = splitGuideSections(MD_GUIDE);
  const july = sections.find((s) => s.title === "七月、八月");
  assert.match(july.text, /五月到十二月/);
  assert.deepEqual(july.months, [7, 8]);
  assert.match(sections.find((s) => s.title === "九月").text, /补充说明[\s\S]*深夜：随便/);
});

test("定位：9 月只命中九月，8 月命中七月、八月，取消内容后没有命中", () => {
  const sections = splitGuideSections(MD_GUIDE).filter((s) => s.kind === "time");
  const hit = (month) => sections.filter((s) => sectionAhead(s, { month }) === 0).map((s) => s.title);
  assert.deepEqual(hit(9), ["九月"]);
  assert.deepEqual(hit(8), ["七月、八月"]);
  assert.deepEqual(hit(3), []);
  assert.equal(sectionAhead(sections[0], { month: 12 }), 1);
  assert.deepEqual([].filter((s) => sectionAhead(s, { month: 9 }) === 0), []);
});

const COMMENT_GUIDE = `1、云沧峰讨债剧情，2月白天，6月晚上，自动
触发。
2、奶奶棺材本剧情，3月白天外出触发。
3、体质超过100，没有时间要求

5月到12月都可以去百花谷`;

test("切分：评论式攻略按条目分段，范围覆盖整段月份", () => {
  const sections = splitGuideSections(COMMENT_GUIDE);
  assert.deepEqual(sections.map((s) => [s.kind, s.months.join(",")]), [
    ["time", "2,6"], ["time", "3"], ["time", "5,6,7,8,9,10,11,12"], ["general", ""]
  ]);
  assert.match(sections[0].text, /触发。/);
  assert.equal(sectionAhead(sections[2], { month: 9 }), 0);
});

test("切分：没有时间点和空文本", () => {
  assert.deepEqual(splitGuideSections("").length, 0);
  const none = splitGuideSections("只有通用建议\n\n没有任何时间");
  assert.deepEqual(none.map((s) => s.kind), ["general"]);
});

const { inspectText } = require("../game-bridge.js");

test("桥接：识别带括号和换行的庆和日期", () => {
  const state = { calendar: "", year: null, month: null, stage: "" };
  assert.equal(inspectText("【庆和22年9月，清晨。】", state), true);
  assert.deepEqual(state, { calendar: "庆和", year: 22, month: 9, stage: "" });
  inspectText("今天天气不错\n庆和22年10月\n继续", state);
  assert.equal(state.month, 10);
});

test("桥接：普通剧情文字不改变状态，也不进入诊断样本", () => {
  const state = { calendar: "", year: null, month: null, stage: "" };
  assert.equal(inspectText("他说：三年后，我们再来。", state), false);
  assert.equal(inspectText("这是一段很长很长的剧情文字，" + "没有日期".repeat(30) + "月", state), false);
  assert.deepEqual(state, { calendar: "", year: null, month: null, stage: "" });
});

test("桥接：无前缀日期只认短文字开头，境界和单独月份", () => {
  const state = { calendar: "", year: null, month: null, stage: "" };
  inspectText("20年3月", state);
  assert.deepEqual([state.year, state.month], [20, 3]);
  inspectText("筑基期", state);
  assert.equal(state.stage, "筑基期");
  inspectText("5月", state);
  assert.equal(state.month, 5);
  const before = { ...state };
  inspectText("故事里提到" + "x".repeat(50) + "7年4月的事", state);
  assert.deepEqual(state, before);
});

const { createRolling, matchPrefixedDate, headerDate } = require("../game-bridge.js");
test("headerDate：顶部两个数字依次是年和月", () => {
  assert.deepEqual(headerDate([{ x: 530, text: "6" }, { x: 418, text: "0" }]), { year: 0, month: 6 });
  assert.deepEqual(headerDate([{ x: 418, text: "1" }, { x: 433, text: "0" }, { x: 530, text: "3" }]), { year: 10, month: 3 });
  assert.equal(headerDate([{ x: 530, text: "6" }]), null);
  assert.equal(headerDate([{ x: 100, text: "1" }, { x: 300, text: "2" }, { x: 500, text: "3" }]), null);
  assert.equal(headerDate([{ x: 418, text: "5" }, { x: 530, text: "13" }]), null);
});

test("桥接：逐段绘制的日期用滚动缓冲拼起来，停顿后清空", () => {
  const roll = createRolling();
  let now = 1000;
  let buffer = "";
  for (const piece of ["庆和", "19", "年", "1", "月"]) buffer = roll(piece, (now += 50));
  assert.equal(matchPrefixedDate(buffer), "庆和19年1月");
  assert.equal(matchPrefixedDate(roll("这是别的文字", now + 5000)), "");
  assert.equal(roll("x".repeat(100), now + 5100).length, 40);
});

test("切分：headings:false 时 # 不当作标题，只靠段落里的时间词", () => {
  const sections = splitGuideSections("## 一月\n\n- 去书院\n\n另一段说5月去百花谷", { headings: false });
  assert.deepEqual(sections.map((s) => [s.kind, s.months.join(",")]), [["time", "1"], ["time", "5"], ["general", ""]]);
  assert.equal(sections.length, 3);
});

const { createCoalescer } = require("../time-points.js");
test("createCoalescer：等待期间的请求合并，且不被持续请求推迟", () => {
  const pending = [];
  const timers = { setTimeout: (run, delay) => pending.push({ run, delay }) };
  let runs = 0;
  const flush = createCoalescer(() => { runs++; }, 200, timers);
  flush.request();
  flush.request();
  flush.request();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].delay, 200);
  assert.equal(runs, 0);
  pending.shift().run();
  assert.equal(runs, 1);
  flush.request();
  assert.equal(pending.length, 1);
  pending.shift().run();
  assert.equal(runs, 2);
});

test("createKeywordMatcher：结果与 findKeywords 一致（含缓存命中）", () => {
  const keywords = ["第1周", "第1周!月", "1月", "一月", "修炼8年3月", "银两", "第3周周2", "体力 80"].map((k) => k.normalize("NFKC"));
  const texts = ["第1周 周一", "9月 第1周", "庆和22年11月", "庆和22年1月", "修炼8年3月", "银两 1200", "体力 80", "", "   ", "第3周 周二", "十一月", "x".repeat(41), "1月".padEnd(40, "x"), "第1周 周一"];
  const match = createKeywordMatcher(keywords);
  for (let round = 0; round < 2; round++) for (const text of texts) assert.deepEqual(match(text), findKeywords(text, keywords), text);
  assert.equal(match("第1周 周一"), match("第1周 周一"));
});

test("createKeywordMatcher：空列表与超长文字", () => {
  assert.deepEqual(createKeywordMatcher([])("第1周"), []);
  assert.deepEqual(createKeywordMatcher(["第1周"])("第1周".padEnd(41, "x")), []);
});

test("createKeywordMatcher：超过上限后仍然正确", () => {
  const keywords = ["1月", "2月", "3月"];
  const match = createKeywordMatcher(keywords, 2);
  const texts = ["1月", "2月", "3月", "1月", "2月", "3月", "12月", "1月"];
  for (const text of texts) assert.deepEqual(match(text), findKeywords(text, keywords), text);
});
