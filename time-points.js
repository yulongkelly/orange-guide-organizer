(function (root) {
  // Pure helpers (no DOM): find game-time mentions in guide text and compare them with the player's current game time.
  const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const NUM = "(?:\\d{1,4}|[零〇一二三四五六七八九十百]+)";
  const MON = "(?:\\d{1,2}|[一二三四五六七八九十]{1,3})";
  const SEP = "[-~～到至—－]";
  const STAGE_RE = /凡人期|(?:练气|炼气|筑基|金丹|元婴|化神)期?/g;
  const STAGE_WORDS = "凡人期|练气期|炼气期|筑基期|金丹期|元婴期|化神期|练气|炼气|筑基|金丹|元婴|化神";
  // Words right before a number that make it a length of time ("消耗1月"), not a point in time.
  const DURATION_BEFORE = /(?:消耗|花费|耗费|耗时|耗|需要|共计|总共|合计|约|至少|最多|超过|整整|减少|增加|缩短|延长|推迟|延迟|每次|闭关|教你|过去|等了|守|再过)$/;
  // Words right after "N年" / "N月" that make it a length of time or a lifespan.
  const DURATION_AFTER = /^(?:寿|岁|内|以内|之内|份|时间|左右|不到|以上|个)/;
  const EVENT_AFTER = "宗门|秘境|试炼|山洞|剑术|比试|考察|副线|主线|剧情|任务|大会|开始|金丹|筑基|元婴|化神|练气|炼气";

  const parseCn = (s) => {
    if (/^\d+$/.test(s)) return Number(s);
    // Only well-formed numerals; a bare 百 ("百年之后") is vague and "四五" is a list, not a number.
    if (!/[一二三四五六七八九十]/.test(s) || !/^(?:[一二三四五六七八九]百)?零?(?:[一二三四五六七八九]?十)?[一二三四五六七八九]?$/.test(s)) return null;
    let total = 0;
    let current = 0;
    for (const ch of s) {
      if (ch === "百") { total += current * 100; current = 0; }
      else if (ch === "十") { total += (current || 1) * 10; current = 0; }
      else if (ch in CN_DIGITS) current = CN_DIGITS[ch];
    }
    return total + current;
  };
  const toYear = (s) => {
    const n = parseCn(s);
    return n != null && n >= 0 && n <= 999 ? n : null;
  };
  const toMonth = (s) => {
    const n = parseCn(s);
    return n != null && n >= 1 && n <= 12 ? n : null;
  };
  const normalizeStage = (word) => {
    if (!word) return "";
    const base = word.replace(/期$/, "").replace("炼气", "练气");
    return `${base}期`;
  };
  const normalizeCalendar = (word) => (word === "庆和" ? "庆和" : word ? "修炼" : "");

  // Replace dates, publish times and 4-digit years with spaces so they never look like game time.
  const maskNonGame = (text) => text
    .replace(/\d{4}\s*[-/.]\s*\d{1,2}(?:\s*[-/.]\s*\d{1,2})?(?:\s+\d{1,2}:\d{2})?/g, (m) => " ".repeat(m.length))
    .replace(/\d{4,}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?)?/g, (m) => " ".repeat(m.length));

  function parseTimePoints(input) {
    const text = String(input || "");
    const masked = maskNonGame(text);
    const found = [];
    const overlaps = (start, end) => found.some((p) => start < p.end && end > p.start);
    const blockedBefore = (start) => DURATION_BEFORE.test(masked.slice(Math.max(0, start - 4), start));
    const blockedAfter = (end) => DURATION_AFTER.test(masked.slice(end, end + 3));
    const stageBefore = (start) => {
      const paragraphStart = text.lastIndexOf("\n\n", start) + 1;
      let stage = "";
      for (const m of text.slice(Math.max(0, paragraphStart), start).matchAll(STAGE_RE)) stage = m[0];
      return normalizeStage(stage);
    };
    const add = (start, end, fields, stage) => {
      if (overlaps(start, end)) return;
      found.push({ start, end, label: text.slice(start, end), year: null, month: null, monthEnd: null, calendar: "", ...fields, stage: stage ?? stageBefore(start) });
    };
    const scan = (pattern, handler) => {
      for (const m of masked.matchAll(new RegExp(pattern, "g"))) {
        const start = m.index;
        const end = start + m[0].length;
        if (blockedBefore(start) || blockedAfter(end) || overlaps(start, end)) continue;
        handler(m, start, end);
      }
    };

    // 庆和20年1月 / 修炼1年1月 / 12年11月 / 第0年1-7月
    scan(`(庆和|修炼|修行)?(第)?(${NUM})年(?:的|零)?(第)?(${MON})(?:\\s*${SEP}\\s*(${MON}))?月`, (m, start, end) => {
      const year = toYear(m[3]);
      const month = toMonth(m[5]);
      const monthEnd = m[6] ? toMonth(m[6]) : null;
      if (year == null || month == null || (m[6] && (monthEnd == null || monthEnd < month))) return;
      add(start, end, { year, month, monthEnd, calendar: normalizeCalendar(m[1]) });
    });

    // 5，15，55，155年 / 1,2,3月: mark every item
    for (const [unit, convert] of [["年", toYear], ["月", toMonth]]) {
      scan(`(?<![\\d零〇一二三四五六七八九十百])((?:${unit === "年" ? NUM : MON})(?:\\s*[，,、]\\s*(?:${unit === "年" ? NUM : MON})){1,8})${unit}`, (m, start, end) => {
        const items = [...m[1].matchAll(new RegExp(unit === "年" ? NUM : MON, "g"))];
        if (items.some((item) => convert(item[0]) == null)) return;
        for (const item of items) {
          const value = convert(item[0]);
          add(start + item.index, start + item.index + item[0].length + (item === items[items.length - 1] ? 1 : 0), unit === "年" ? { year: value } : { month: value });
        }
      });
    }

    // 5月到12月 / 8-11月 / 5月-7月
    scan(`(?<![\\d零〇一二三四五六七八九十百])(${MON})月?\\s*${SEP}\\s*(${MON})月`, (m, start, end) => {
      const month = toMonth(m[1]);
      const monthEnd = toMonth(m[2]);
      if (month == null || monthEnd == null || monthEnd < month) return;
      add(start, end, { month, monthEnd });
    });

    // 元婴期五年 / 金丹期99年 / 元婴100年后
    scan(`(${STAGE_WORDS})(?:期)?(?:的|第|在|约|大约|到)?(${NUM})年`, (m, start, end) => {
      const year = toYear(m[2]);
      if (year == null) return;
      add(start, end, { year }, normalizeStage(m[1]));
    });

    // 庆和20年 / 修炼5年 / 第3年 / 修行第20年
    scan(`(?<![\\d零〇一二三四五六七八九十百])(?:(庆和|修炼|修行)第?|第)(${NUM})年`, (m, start, end) => {
      const year = toYear(m[2]);
      if (year == null) return;
      add(start, end, { year, calendar: normalizeCalendar(m[1]) });
    });

    // Bare "21年秘境" style: only when followed by an event word, otherwise it is probably a duration.
    scan(`(?<![\\d零〇一二三四五六七八九十百第])(${NUM})年(?=${EVENT_AFTER})`, (m, start, end) => {
      const year = toYear(m[1]);
      if (year == null) return;
      add(start, end - 0, { year });
    });

    // 5月 / 一月 / 每年12月 / 次年1月 / 四五六月
    scan(`(?<![\\d零〇一二三四五六七八九十百.])(每年|次年|下年|来年|明年)?第?(${MON})月`, (m, start, end) => {
      const prefixLength = m[1] ? m[1].length : 0;
      const body = m[2];
      const month = toMonth(body);
      if (month != null) { add(start, end, { month }); return; }
      if (body.length >= 2 && /^[一二三四五六七八九]+$/.test(body)) {
        const parts = [...body].map(toMonth);
        if (parts.some((value) => value == null)) return;
        const bodyStart = start + prefixLength + (m[0].includes("第") ? 1 : 0);
        parts.forEach((value, i) => add(bodyStart + i, bodyStart + i + 1 + (i === parts.length - 1 ? 1 : 0), { month: value }));
      }
    });

    return found.sort((a, b) => a.start - b.start);
  }

  const stagesCompatible = (a, b) => !a || !b || a === b;
  // How many months from `current` until this point starts: 0 = covers the current month, null = already past / not comparable.
  function pointAhead(point, current) {
    if (!current || current.month == null) return { ahead: null, note: "" };
    if (!stagesCompatible(point.stage, current.stage)) return { ahead: null, note: "" };
    const mismatch = Boolean(point.calendar && current.calendar && point.calendar !== current.calendar);
    const note = mismatch ? `纪年不同（攻略用${point.calendar}，当前为${current.calendar}），只按月份比对` : "";
    if (point.month == null) {
      if (point.year == null || mismatch || current.year == null) return { ahead: null, note };
      return { ahead: point.year === current.year ? 0 : null, note };
    }
    const end = point.monthEnd ?? point.month;
    const compareYear = point.year != null && !mismatch;
    if (compareYear && current.year == null) return { ahead: null, note: "当前游戏年份未知，无法比对年份" };
    if (compareYear) {
      const cur = current.year * 12 + current.month;
      const first = point.year * 12 + point.month;
      const last = point.year * 12 + end;
      if (cur >= first && cur <= last) return { ahead: 0, note };
      return { ahead: first > cur ? first - cur : null, note };
    }
    if (current.month >= point.month && current.month <= end) return { ahead: 0, note };
    return { ahead: (point.month - current.month + 12) % 12, note };
  }
  // Compare one time point with the current game time. Returns { level: "now" | "soon" | "normal", note }.
  function classifyTimePoint(point, current) {
    const { ahead, note } = pointAhead(point, current);
    if (ahead === 0) return { level: "now", note };
    if (ahead != null && ahead <= 2) return { level: "soon", note };
    return { level: "normal", note };
  }

  const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  const LIST_ITEM = /^\s*(?:\d+\s*[、.)）]|[-*•]\s|[一二三四五六七八九十]+、)/;
  const summarize = (points) => {
    const months = new Set();
    const years = [];
    for (const p of points) {
      if (p.month != null) for (let m = p.month; m <= (p.monthEnd ?? p.month); m++) months.add(m);
      if (p.year != null) years.push(p.year);
    }
    const monthList = [...months].sort((a, b) => a - b);
    return { months: monthList, years, order: (years.length ? Math.min(...years) : 0) * 13 + (monthList[0] || 0), stage: points.find((p) => p.stage)?.stage || "" };
  };

  // Cut a guide into sections. With options.headings !== false, Markdown headings win ("## 七月、八月" owns everything under it until the next heading of the
  // same or higher level); otherwise blank-line paragraphs / list items that mention a time become their own section.
  // Content with no time goes into "general" sections. Section points are offsets relative to section.text.
  function splitGuideSections(input, options = {}) {
    const text = String(input || "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const sections = [];
    const finish = (draft) => {
      const body = draft.lines.join("\n").replace(/\s+$/, "");
      if (!body.trim()) return;
      const section = { kind: draft.points.length ? "time" : "general", title: draft.title, text: body, points: draft.points, months: [], years: [], order: 0, stage: "" };
      if (section.kind === "time") Object.assign(section, summarize(draft.points));
      sections.push(section);
    };
    const hasTimedHeading = options.headings !== false && lines.some((line) => HEADING.test(line) && parseTimePoints(HEADING.exec(line)[2]).length);
    if (hasTimedHeading) {
      let draft = { title: "开头", level: 0, points: [], lines: [] };
      for (const line of lines) {
        const heading = HEADING.exec(line);
        if (heading) {
          const level = heading[1].length;
          const points = parseTimePoints(line).filter((p) => p.start >= line.indexOf(heading[2]));
          const timed = points.length > 0;
          // A sub-heading without a time stays inside the timed section above it.
          if (!timed && draft.points.length && level > draft.level) { draft.lines.push(line); continue; }
          finish(draft);
          draft = { title: heading[2], level, points, lines: [line] };
        } else draft.lines.push(line);
      }
      finish(draft);
      return sections;
    }
    const blocks = [];
    let block = [];
    const flush = () => { if (block.length) blocks.push(block.join("\n")); block = []; };
    for (const line of lines) {
      if (!line.trim()) { flush(); continue; }
      if (LIST_ITEM.test(line)) flush();
      block.push(line);
    }
    flush();
    const general = [];
    for (const body of blocks) {
      const points = parseTimePoints(body);
      if (!points.length) { general.push(body); continue; }
      finish({ title: body.split("\n")[0].replace(/^\s*(?:[-*•]\s*|\d+\s*[、.)）]\s*)/, "").slice(0, 24), points, lines: [body] });
    }
    if (general.length) finish({ title: "通用", points: [], lines: [general.join("\n\n")] });
    return sections;
  }

  // Months until the section starts (0 = now), or null when none of its points can be compared.
  function sectionAhead(section, current) {
    let best = null;
    for (const point of section.points) {
      const { ahead } = pointAhead(point, current);
      if (ahead != null && (best == null || ahead < best)) best = ahead;
    }
    return best;
  }

  const api = { parseTimePoints, classifyTimePoint, pointAhead, splitGuideSections, sectionAhead, parseCn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OgoTimePoints = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
