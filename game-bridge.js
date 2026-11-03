(() => {
  // Runs inside the 66rpg h5 game frame (page context). It only watches text the game engine is about to draw,
  // keeps the in-game date and 境界, and sends those few parsed values to the page above it. Other text is never forwarded.
  const STAGES = /凡人期|练气期|炼气期|筑基期|金丹期|元婴期|化神期/;
  // 庆和22年9月 anywhere in the text (also inside 【庆和22年9月，清晨。】 or multi-line text).
  const PREFIXED_DATE = /(庆和|修炼|修行)\s*(\d{1,3})\s*年\s*(\d{1,2})\s*月/;
  const PLAIN_DATE = /^\s*(\d{1,3})\s*年\s*(\d{1,2})\s*月/;
  const DATE_LIKE = /年[^]{0,12}月|庆和|修炼/;

  // Pure: update `state` from one drawn string.
  const inspectText = (value, state) => {
    if (typeof value !== "string" || value.length > 2000 || !/[年月期]/.test(value)) return false;
    const prefixed = value.match(PREFIXED_DATE);
    const plain = value.length <= 40 ? value.match(PLAIN_DATE) : null;
    const month = prefixed ? Number(prefixed[3]) : plain ? Number(plain[2]) : 0;
    if (month >= 1 && month <= 12) {
      if (prefixed) state.calendar = prefixed[1] === "庆和" ? "庆和" : "修炼";
      state.year = Number(prefixed ? prefixed[2] : plain[1]);
      state.month = month;
    } else {
      const monthOnly = value.length <= 12 ? value.replace(/\s+/g, "").match(/^第?(\d{1,2})月$/) : null;
      if (monthOnly && Number(monthOnly[1]) >= 1 && Number(monthOnly[1]) <= 12) state.month = Number(monthOnly[1]);
    }
    const stage = value.length <= 20 ? value.match(STAGES) : null;
    if (stage) state.stage = stage[0] === "炼气期" ? "练气期" : stage[0];
    return value.length <= 80 && DATE_LIKE.test(value);
  };

  // Pure: short rolling buffer of the most recent drawn text, so a date drawn in pieces ("庆和", "19", "年"…) can still be matched.
  // It keeps only the last ~40 characters and forgets everything after a pause. Two numbers drawn one after another ("30", "1")
  // are kept apart by a line break, so they are read as 30 and 1, not 301.
  const createRolling = () => {
    let text = "";
    let last = 0;
    return (fragment, now) => {
      if (now - last > 800) text = "";
      last = now;
      const piece = String(fragment).slice(-40);
      text = (text + (/\d$/.test(text) && /^\d/.test(piece) ? "\n" : "") + piece).slice(-40);
      return text;
    };
  };
  const matchPrefixedDate = (text) => text.match(PREFIXED_DATE)?.[0] || "";

  // Pure: some games bake 修炼/年/月 into a header image and only draw the numbers. Digits close together are one number;
  // the header must hold exactly two numbers, year then month.
  const headerDate = (fields) => {
    const groups = [];
    for (const field of [...fields].sort((a, b) => a.x - b.x)) {
      const last = groups[groups.length - 1];
      if (last && field.x - last.x <= 20) { last.text += field.text; last.x = field.x; }
      else groups.push({ ...field });
    }
    if (groups.length !== 2) return null;
    const [year, month] = groups.map((group) => Number(group.text));
    return month >= 1 && month <= 12 ? { year, month } : null;
  };

  // Pure: keep the last 60 short labels, oldest first. A label drawn again moves to the end.
  const rememberIn = (labels, value) => {
    if (typeof value !== "string" || !value.trim() || value.length > 40 || labels[labels.length - 1] === value) return;
    const seen = labels.indexOf(value);
    if (seen >= 0) labels.splice(seen, 1);
    labels.push(value);
    if (labels.length > 60) labels.shift();
  };

  // Pure: eras the guide's keywords count years in: 昭元30年 -> 昭元, 靖安成15年4月 -> 靖安成.
  const keywordEras = (keywords) => [...new Set(keywords.map((keyword) => keyword.split("!")[0].match(/^(\D+?)\d+年/)?.[1]).filter(Boolean))];
  // Pure: some games draw the era and the numbers as text but bake 年/月 into the background ("昭", "元", "30", "1", "辰").
  // An era from the guide followed by two separate numbers is read as that year and month: { era: "昭元", year: 30, month: 1, text: "昭元30年1月" }.
  const eraDate = (text, eras) => {
    for (const era of eras) {
      const letters = [...era].map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
      const match = String(text).match(new RegExp(`${letters}\\s*(\\d{1,3})\\s+(\\d{1,2})(?!\\d)`));
      const year = match && Number(match[1]);
      const month = match && Number(match[2]);
      if (match && month >= 1 && month <= 12) return { era, year, month, text: `${era}${year}年${month}月` };
    }
    return null;
  };

  // Pure: a display object's position on screen. Engine x/y are relative to the parent, so add them up the parent chain,
  // scaling by each parent's scale on the way.
  const parentOf = (node) => node.parent || node._parent || null;
  const globalPosition = (node) => {
    let x = Number(node.x) || 0;
    let y = Number(node.y) || 0;
    for (let p = parentOf(node), depth = 0; p && depth < 50; p = parentOf(p), depth++) {
      x = x * (Number.isFinite(p.scaleX) ? p.scaleX : 1) + (Number(p.x) || 0);
      y = y * (Number.isFinite(p.scaleY) ? p.scaleY : 1) + (Number(p.y) || 0);
    }
    return { x, y };
  };
  // Pure: the outermost container, and whether the node or a container above it is hidden. A field removed from the screen
  // ends up under another top than the fields still showing.
  const topOf = (node) => {
    let top = node;
    for (let p = parentOf(node), depth = 0; p && depth < 50; p = parentOf(p), depth++) top = p;
    return top;
  };
  const hiddenUp = (node) => {
    for (let n = node, depth = 0; n && depth < 50; n = parentOf(n), depth++) if (n.visible === false || n._visible === false) return true;
    return false;
  };
  // Pure: texts in the order a reader sees them: rows top to bottom (within `tolerance` px counts as one row), left to right in a row.
  // One line break between texts, which keyword matching drops except between two numbers (30 and 1 stay apart).
  const readingOrder = (items, tolerance = 8) => {
    const rows = [];
    for (const item of [...items].sort((a, b) => a.y - b.y)) {
      const row = rows[rows.length - 1];
      if (row && item.y - row.y <= tolerance) row.items.push(item);
      else rows.push({ y: item.y, items: [item] });
    }
    return rows.map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => item.text).join("\n")).join("\n");
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = { inspectText, createRolling, matchPrefixedDate, headerDate, rememberIn, keywordEras, eraDate, globalPosition, topOf, readingOrder }; return; }
  if (window.__ogoGameBridge || window === window.top) return;
  window.__ogoGameBridge = true;
  const rolling = createRolling();
  const state = { calendar: "", year: null, month: null, stage: "" };
  let lastSent = "";
  // Keywords come from the guides the player selected. Only those that appear on screen are reported, never the text around them.
  const { createKeywordMatcher } = window.OgoTimePoints;
  let keywords = [];
  let matchKeywords = createKeywordMatcher(keywords);
  let hasCultivation = false;
  let lastKeywords = "";
  let lastValue = "";
  // Labels already on screen are not drawn again, so keep a few to check when the keyword list arrives. They stay in this frame.
  const recentLabels = [];
  let lastPieces = "";
  const rememberLabel = (value) => rememberIn(recentLabels, value);
  // Text is only checked while the 定位 tab is open. Until then labels are just remembered, and they are checked when it opens.
  let watching = false;

  const trustedOrigin = (origin) => /^https:\/\/(?:www\.)?66rpg\.com$/.test(origin);
  const targetOrigin = () => {
    try {
      const referrer = new URL(document.referrer).origin;
      if (trustedOrigin(referrer)) return referrer;
    } catch {}
    return location.origin;
  };
  // The work page is normally the direct parent; also tell the top page in case the game is wrapped in another frame.
  const send = (message) => {
    const targets = new Set([window.parent, window.top]);
    for (const target of targets) { try { target.postMessage(message, targetOrigin()); } catch {} }
  };

  const publish = () => {
    const signature = `${state.calendar}|${state.year}|${state.month}|${state.stage}`;
    if (signature === lastSent || state.month == null) return;
    lastSent = signature;
    send({ type: "ogo-game-time", calendar: state.calendar, year: state.year, month: state.month, stage: state.stage, at: Date.now() });
  };

  const publishKeywords = (found) => {
    const signature = found.join("|");
    if (!found.length || signature === lastKeywords) return;
    lastKeywords = signature;
    send({ type: "ogo-game-keywords-found", keywords: found, at: Date.now() });
  };

  // Header numbers are read only for guides keyed to 修炼N年, so other games' top-of-screen numbers are ignored.
  const HEADER_MAX_Y = 15;
  // Other numbers sit at the top left; the year and month are in the middle of the bar.
  const HEADER_MIN_X = 300;
  const headerFields = new Map();
  const checkHeader = () => {
    if (!hasCultivation) return;
    const date = headerDate([...headerFields.values()]);
    if (date) publishKeywords(matchKeywords(`修炼${date.year}年${date.month}月`));
  };
  const noteHeaderField = (field, value) => {
    if (typeof value !== "string" || typeof field?.x !== "number" || typeof field.y !== "number" || field.y < 0 || field.y > HEADER_MAX_Y || field.x < HEADER_MIN_X) return;
    const x = Math.round(field.x);
    const now = Date.now();
    // A number that grows a digit moves; digits left beside it from an earlier draw are stale.
    for (const [key, entry] of headerFields) if (Math.abs(key - x) <= 20 && now - entry.at > 50) headerFields.delete(key);
    if (/^\s*\d{1,3}\s*$/.test(value)) headerFields.set(x, { x, text: value.trim(), at: now });
    else headerFields.delete(x);
    if (watching) checkHeader();
  };

  // Eras come from the guide's keywords, so two numbers on screen are only read as a date for a guide that counts years that way.
  let eras = [];
  let erasFor = null;
  const readEra = (text) => {
    if (erasFor !== keywords) { erasFor = keywords; eras = keywordEras(keywords); }
    return eras.length ? eraDate(text, eras) : null;
  };
  const eraKeywords = (era) => (era ? matchKeywords(era.text) : []);

  const inspect = (value) => {
    if (value === lastValue) return;
    lastValue = value;
    rememberLabel(value);
    inspectText(value, state);
    // Pieces drawn one after another: match the date in the rolling buffer (only the matched date is used).
    const recent = rolling(value, Date.now());
    if (value.length <= 3) lastPieces = recent;
    const joined = matchPrefixedDate(recent);
    if (joined) inspectText(joined, state);
    // Draw order is not screen order, so the era rule reads one text at a time here; split dates are read as rows (checkRows).
    const era = readEra(value);
    if (era) Object.assign(state, { calendar: ["庆和", "修炼"].includes(era.era) ? era.era : "", year: era.year, month: era.month });
    publish();
    if (keywords.length) {
      // The month may be drawn just before the week, so a match in this text alone still has to hold in the rolling text.
      const joinedFound = matchKeywords(recent);
      const direct = value.length <= 60 ? matchKeywords(value).filter((keyword) => joinedFound.includes(keyword)) : [];
      publishKeywords([...new Set([...eraKeywords(era), ...(direct.length ? direct : joinedFound)])]);
    }
  };

  // A date can be split over several text fields that the game places out of order (1, 30, 辰, 昭, 元), so fields are also read
  // as a row in screen order: 昭 元 30 1 辰. Only short fields are kept, and only the last 300; their text stays in this frame.
  const fields = new Map();
  const dirtyFields = new Set();
  let rowTimer = 0;
  const fieldText = (field, fallback) => {
    for (const key of ["text", "_text", "showText", "_showText"]) if (typeof field[key] === "string") return field[key];
    return fallback;
  };
  const rowText = (field) => {
    const top = topOf(field);
    const at = globalPosition(field);
    const row = [];
    for (const [other, seen] of fields) {
      if (topOf(other) !== top || hiddenUp(other)) continue;
      const text = fieldText(other, seen);
      const where = globalPosition(other);
      if (text.length <= 40 && Math.abs(where.y - at.y) <= 8) row.push({ text, ...where });
    }
    return readingOrder(row);
  };
  // Runs a moment after fields change, once the game has also moved them into place.
  const checkRows = () => {
    rowTimer = 0;
    const done = new Set();
    for (const field of dirtyFields) {
      let text = "";
      try { text = rowText(field); } catch {}
      if (!text || done.has(text)) continue;
      done.add(text);
      const era = readEra(text);
      if (era) { Object.assign(state, { calendar: ["庆和", "修炼"].includes(era.era) ? era.era : "", year: era.year, month: era.month }); publish(); }
      if (keywords.length) publishKeywords([...new Set([...eraKeywords(era), ...matchKeywords(text)])]);
    }
    dirtyFields.clear();
  };
  const markRows = (list) => {
    if (!watching) return;
    for (const field of list) dirtyFields.add(field);
    if (!rowTimer && dirtyFields.size) rowTimer = setTimeout(checkRows, 50);
  };
  const noteField = (field, value) => {
    if (!field || typeof field !== "object" || typeof value !== "string" || value.length > 40) return;
    fields.delete(field);
    fields.set(field, value);
    if (fields.size > 300) fields.delete(fields.keys().next().value);
    markRows([field]);
  };

  const setWatching = (active) => {
    if (active === watching) return;
    watching = active;
    if (!active) return;
    lastValue = "";
    for (const label of [...recentLabels]) inspect(label);
    checkHeader();
    markRows([...fields.keys()]);
  };

  window.addEventListener("message", (event) => {
    if ((event.source !== window.parent && event.source !== window.top) || !trustedOrigin(event.origin)) return;
    if (event.data?.type === "ogo-game-watch") { setWatching(event.data.active === true); return; }
    const list = event.data?.type === "ogo-game-keywords" ? event.data.keywords : null;
    if (!Array.isArray(list) || !list.every((item) => typeof item === "string" && item.length <= 40)) return;
    keywords = list.slice(0, 500);
    matchKeywords = createKeywordMatcher(keywords);
    hasCultivation = keywords.some((keyword) => keyword.startsWith("修炼"));
    lastKeywords = "";
    lastValue = "";
    checkHeader();
    const fromPieces = matchKeywords(lastPieces);
    if (fromPieces.length) publishKeywords(fromPieces);
    else for (let i = recentLabels.length - 1; i >= 0; i--) {
      const found = matchKeywords(recentLabels[i]);
      if (found.length) { publishKeywords(found); break; }
    }
    markRows([...fields.keys()]);
  });

  const textsOf = (self, args) => {
    const out = [];
    for (const arg of args) {
      if (typeof arg === "string") out.push(arg);
      else if (Array.isArray(arg)) for (const item of arg) if (typeof item === "string") out.push(item);
    }
    for (const key of ["text", "_text", "showText", "_showText", "m_text", "str", "_str"]) if (typeof self?.[key] === "string") out.push(self[key]);
    return out;
  };

  // Wrap a prototype method so the original still runs first: same this, same arguments, same return value.
  const wrap = (owner, proto, name) => {
    const original = proto?.[name];
    if (typeof original !== "function" || original.__ogoWrapped) return;
    const wrapped = function (...args) {
      try {
        const texts = textsOf(this, args);
        for (const text of texts) {
          if (watching) inspect(text);
          else rememberLabel(text);
          if (owner === "TextField" && name === "buildBitmapFontText") noteHeaderField(this, text);
        }
        if (owner === "TextField" && texts.length) noteField(this, texts[0]);
      } catch {}
      return original.apply(this, args);
    };
    wrapped.__ogoWrapped = true;
    try { proto[name] = wrapped; } catch {}
  };

  // Text-carrying methods only; per-frame methods such as update/draw are left alone.
  const TEXT_METHOD = /text|label|caption|content/i;
  // Generic canvas / engine entry points, hooked as early as possible.
  let lowLevelHooked = false;
  const installLowLevel = () => {
    if (lowLevelHooked) return;
    lowLevelHooked = true;
    const ctx = window.CanvasRenderingContext2D?.prototype;
    if (ctx) for (const name of ["fillText", "strokeText"]) wrap("Canvas2D", ctx, name);
  };
  const install = () => {
    installLowLevel();
    if (typeof window.GLTools === "function") for (const name of ["getTextArr", "getTextWidth"]) wrap("GLTools", window.GLTools.prototype, name);
    if (typeof window.TextField !== "function") return false;
    for (const name of Object.getOwnPropertyNames(window.TextField.prototype)) if (name !== "constructor" && TEXT_METHOD.test(name)) wrap("TextField", window.TextField.prototype, name);
    if (typeof window.Font === "function") for (const name of ["drawText", "getTextWidth"]) wrap("Font", window.Font.prototype, name);
    if (typeof window.SALText === "function") for (const name of Object.getOwnPropertyNames(window.SALText.prototype || {})) if (name !== "constructor" && TEXT_METHOD.test(name)) wrap("SALText", window.SALText.prototype, name);
    return true;
  };

  if (!install()) {
    const timer = setInterval(() => { if (install()) clearInterval(timer); }, 300);
    setTimeout(() => clearInterval(timer), 180000);
  }
  send({ type: "ogo-bridge-ready" });
})();
