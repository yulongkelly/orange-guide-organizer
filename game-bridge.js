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
  // It keeps only the last ~40 characters and forgets everything after a pause.
  const createRolling = () => {
    let text = "";
    let last = 0;
    return (fragment, now) => {
      if (now - last > 800) text = "";
      last = now;
      text = (text + String(fragment).slice(-40)).slice(-40);
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

  if (typeof module !== "undefined" && module.exports) { module.exports = { inspectText, createRolling, matchPrefixedDate, headerDate }; return; }
  if (window.__ogoGameBridge || window === window.top) return;
  window.__ogoGameBridge = true;
  const rolling = createRolling();
  const state = { calendar: "", year: null, month: null, stage: "" };
  let lastSent = "";
  // Keywords come from the guides the player selected. Only those that appear on screen are reported, never the text around them.
  const { findKeywords } = window.OgoTimePoints;
  let keywords = [];
  let lastKeywords = "";
  let lastValue = "";
  // Labels already on screen are not drawn again, so keep a few to check when the keyword list arrives. They stay in this frame.
  const recentLabels = [];
  let lastPieces = "";
  const rememberLabel = (value) => {
    if (typeof value !== "string" || !value.trim() || value.length > 40) return;
    const seen = recentLabels.indexOf(value);
    if (seen >= 0) recentLabels.splice(seen, 1);
    recentLabels.push(value);
    if (recentLabels.length > 60) recentLabels.shift();
  };

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
    if (!keywords.some((keyword) => keyword.startsWith("修炼"))) return;
    const date = headerDate([...headerFields.values()]);
    if (date) publishKeywords(findKeywords(`修炼${date.year}年${date.month}月`, keywords));
  };
  const noteHeaderField = (field, value) => {
    if (typeof value !== "string" || typeof field?.x !== "number" || typeof field.y !== "number" || field.y < 0 || field.y > HEADER_MAX_Y || field.x < HEADER_MIN_X) return;
    const x = Math.round(field.x);
    const now = Date.now();
    // A number that grows a digit moves; digits left beside it from an earlier draw are stale.
    for (const [key, entry] of headerFields) if (Math.abs(key - x) <= 20 && now - entry.at > 50) headerFields.delete(key);
    if (/^\s*\d{1,3}\s*$/.test(value)) headerFields.set(x, { x, text: value.trim(), at: now });
    else headerFields.delete(x);
    checkHeader();
  };

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
    publish();
    if (keywords.length) {
      // The month may be drawn just before the week, so a match in this text alone still has to hold in the rolling text.
      const joinedFound = findKeywords(recent, keywords);
      const direct = value.length <= 60 ? findKeywords(value, keywords).filter((keyword) => joinedFound.includes(keyword)) : [];
      publishKeywords(direct.length ? direct : joinedFound);
    }
  };

  window.addEventListener("message", (event) => {
    if ((event.source !== window.parent && event.source !== window.top) || !trustedOrigin(event.origin)) return;
    const list = event.data?.type === "ogo-game-keywords" ? event.data.keywords : null;
    if (!Array.isArray(list) || !list.every((item) => typeof item === "string" && item.length <= 40)) return;
    keywords = list.slice(0, 500);
    lastKeywords = "";
    lastValue = "";
    checkHeader();
    const fromPieces = findKeywords(lastPieces, keywords);
    if (fromPieces.length) publishKeywords(fromPieces);
    else for (let i = recentLabels.length - 1; i >= 0; i--) {
      const found = findKeywords(recentLabels[i], keywords);
      if (found.length) { publishKeywords(found); break; }
    }
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
        for (const text of textsOf(this, args)) {
          inspect(text);
          if (owner === "TextField" && name === "buildBitmapFontText") noteHeaderField(this, text);
        }
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
