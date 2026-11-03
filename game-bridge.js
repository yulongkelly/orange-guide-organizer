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

  // Pure: keep the last 60 short labels, oldest first. A label drawn again moves to the end.
  const rememberIn = (labels, value) => {
    if (typeof value !== "string" || !value.trim() || value.length > 40 || labels[labels.length - 1] === value) return;
    const seen = labels.indexOf(value);
    if (seen >= 0) labels.splice(seen, 1);
    labels.push(value);
    if (labels.length > 60) labels.shift();
  };

  // Pure: the md5 a resource address is named by (".../ca9bc9e1f0a2….png"), or "" when it has none. The path wins over the query.
  const MD5 = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/gi;
  const md5FromUrl = (url) => {
    if (typeof url !== "string" || url.length > 2000) return "";
    for (const part of [url.split(/[?#]/)[0], url]) {
      const all = part.match(MD5);
      if (all) return all[all.length - 1].toLowerCase();
    }
    return "";
  };

  // Pure: md5s of the pictures in a scene tree that are showing, in drawing order, each once. `imageOf(node)` gives an md5 or "".
  const CHILD_KEYS = ["children", "_children", "childs", "_childs", "childList", "_childList", "$children"];
  const NESTED_KEYS = ["bitmap", "_bitmap", "texture", "_texture", "image", "_image"];
  const URL_KEYS = ["url", "_url", "src", "_src", "path", "_path", "fileName", "_fileName"];
  const hidden = (node) => node.visible === false || node._visible === false || node.isVisible === false || node.alpha === 0 || node._alpha === 0 || node.opacity === 0;
  // A node's picture from its own address fields, or from the bitmap/texture it holds.
  const md5FromFields = (node) => {
    for (const owner of [node, ...NESTED_KEYS.map((k) => node[k])]) {
      if (!owner || typeof owner !== "object") continue;
      for (const key of URL_KEYS) { const md5 = md5FromUrl(owner[key]); if (md5) return md5; }
    }
    return "";
  };
  const collectVisibleImages = (root, imageOf = md5FromFields, limit = 3000) => {
    const md5s = new Set();
    const seen = new Set();
    const walk = (node, depth) => {
      if (!node || typeof node !== "object" || seen.has(node) || seen.size >= limit || depth > 30) return;
      seen.add(node);
      try {
        if (hidden(node)) return;
        const md5 = imageOf(node);
        if (md5) md5s.add(md5);
        for (const key of CHILD_KEYS) if (Array.isArray(node[key])) for (const child of node[key]) walk(child, depth + 1);
      } catch {}
    };
    walk(root, 0);
    return [...md5s];
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = { inspectText, createRolling, matchPrefixedDate, headerDate, rememberIn, md5FromUrl, collectVisibleImages }; return; }
  if (window.__ogoGameBridge || window === window.top) return;
  window.__ogoGameBridge = true;
  const rolling = createRolling();
  const state = { calendar: "", year: null, month: null, stage: "" };
  let lastSent = "";
  // Keywords come from the guides the player selected. Only those that appear on screen are reported, never the text around them.
  const { createKeywordMatcher, isImageKeyword, findImageKeywords, imageKeywordUses } = window.OgoTimePoints;
  let keywords = [];
  // 图:… keywords, matched against the md5 of pictures the game loads.
  let imageKeywords = [];
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

  // Pictures are only a fallback: a picture is not reported when on-screen text matched a keyword around the same time.
  let lastTextHitAt = 0;
  const publishKeywords = (found) => {
    if (found.length && !found.some(isImageKeyword)) lastTextHitAt = Date.now();
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
      const joinedFound = matchKeywords(recent);
      const direct = value.length <= 60 ? matchKeywords(value).filter((keyword) => joinedFound.includes(keyword)) : [];
      publishKeywords(direct.length ? direct : joinedFound);
    }
  };

  // Only md5s of loaded pictures are kept (by the object that loaded them, and the last 60 for when the scene tree can't be read).
  // They stay in this frame; only a guide's own 图:… keyword that matches is ever reported.
  const loadedBy = new WeakMap();
  const recentImages = [];
  const TEXT_WINDOW = 1000;
  const IMAGE_WAIT = 400;
  // What is on screen now: the scene tree when it can be read, else the most recently loaded pictures.
  const shownImages = () => {
    let shown = [];
    try { shown = collectVisibleImages(window.GlobalData?._instance?._commonCanvas, (node) => loadedBy.get(node) || md5FromFields(node)); } catch {}
    return shown.length ? shown : recentImages;
  };
  // `triggers` are the pictures that just appeared; only keywords that use one of them are reported. Combinations are checked against
  // everything on screen, since their other pictures may have been loaded long before.
  const checkImages = (triggers) => {
    if (!watching || !imageKeywords.length || !imageKeywords.some((keyword) => triggers.some((md5) => imageKeywordUses(keyword, md5)))) return;
    const at = Date.now();
    // Wait a moment: the date text on the same screen may be drawn just after the picture loads, and the new layer joins the scene.
    setTimeout(() => {
      if (!watching || lastTextHitAt >= at - TEXT_WINDOW) return;
      const found = findImageKeywords([...shownImages(), ...triggers], imageKeywords).filter((keyword) => triggers.some((md5) => imageKeywordUses(keyword, md5)));
      if (found.length) publishKeywords(found);
    }, IMAGE_WAIT);
  };
  const noteImage = (self, args) => {
    let md5 = "";
    for (const arg of args) if (typeof arg === "string" && (md5 = md5FromUrl(arg))) break;
    if (!md5) return;
    if (self && typeof self === "object") loadedBy.set(self, md5);
    rememberIn(recentImages, md5);
    checkImages([md5]);
  };
  const checkVisible = () => checkImages(shownImages());

  const setWatching = (active) => {
    if (active === watching) return;
    watching = active;
    if (!active) return;
    lastValue = "";
    for (const label of [...recentLabels]) inspect(label);
    checkHeader();
    checkVisible();
  };

  window.addEventListener("message", (event) => {
    if ((event.source !== window.parent && event.source !== window.top) || !trustedOrigin(event.origin)) return;
    if (event.data?.type === "ogo-game-watch") { setWatching(event.data.active === true); return; }
    const list = event.data?.type === "ogo-game-keywords" ? event.data.keywords : null;
    if (!Array.isArray(list) || !list.every((item) => typeof item === "string" && item.length <= (isImageKeyword(item) ? 150 : 40))) return;
    keywords = list.slice(0, 500).filter((keyword) => !isImageKeyword(keyword));
    imageKeywords = list.slice(0, 500).filter(isImageKeyword);
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
    checkVisible();
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
          if (watching) inspect(text);
          else rememberLabel(text);
          if (owner === "TextField" && name === "buildBitmapFontText") noteHeaderField(this, text);
        }
      } catch {}
      return original.apply(this, args);
    };
    wrapped.__ogoWrapped = true;
    try { proto[name] = wrapped; } catch {}
  };
  // Same for picture loads: the address is read before the original runs.
  const wrapLoad = (proto) => {
    const original = proto?.load;
    if (typeof original !== "function" || original.__ogoWrapped) return;
    const wrapped = function (...args) {
      try { noteImage(this, args); } catch {}
      return original.apply(this, args);
    };
    wrapped.__ogoWrapped = true;
    try { proto.load = wrapped; } catch {}
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
    for (const name of ["Sprite", "Button"]) if (typeof window[name] === "function") wrapLoad(window[name].prototype);
    if (typeof window.GLTools === "function") for (const name of ["getTextArr", "getTextWidth"]) wrap("GLTools", window.GLTools.prototype, name);
    if (typeof window.TextField !== "function") return false;
    for (const name of Object.getOwnPropertyNames(window.TextField.prototype)) if (name !== "constructor" && TEXT_METHOD.test(name)) wrap("TextField", window.TextField.prototype, name);
    if (typeof window.Font === "function") for (const name of ["drawText", "getTextWidth"]) wrap("Font", window.Font.prototype, name);
    if (typeof window.SALText === "function") for (const name of Object.getOwnPropertyNames(window.SALText.prototype || {})) if (name !== "constructor" && TEXT_METHOD.test(name)) wrap("SALText", window.SALText.prototype, name);
    // Keep trying (until the timer gives up) while the picture classes are not defined yet.
    return typeof window.Sprite === "function";
  };

  if (!install()) {
    const timer = setInterval(() => { if (install()) clearInterval(timer); }, 300);
    setTimeout(() => clearInterval(timer), 180000);
  }
  send({ type: "ogo-bridge-ready" });
})();
