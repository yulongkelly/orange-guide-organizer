(() => {
  if (window.__orangeGuideOrganizerLoaded) return;
  window.__orangeGuideOrganizerLoaded = true;

  const topics = [
    ["主线 / 剧情", /主线|剧情|章节|剧情点|剧情线|剧情攻略|剧情选择|选项|分支|结局|he\b|be\b/i],
    ["角色 / 好感", /好感|攻略.{0,3}(角色|人物)|角色.{0,3}攻略|表白|道侣|妻妾|云沧海|元化清|阿音|萧朝辞/i],
    ["修炼 / 属性", /修为|境界|练气|筑基|金丹|元婴|化神|灵根|属性|升级|突破|寿元/i],
    ["战斗 / 妖楼", /战斗|打架|boss|妖楼|爬塔|技能|剑术|战力|伤害|挑战/i],
    ["宗门 / 养成", /宗门|门派|弟子|掌门|灵石|资源|养成|洞府|历练|秘境/i],
    ["收集 / 成就", /成就|收集|材料|装备|法宝|炼丹|炼器|御兽|符箓|阵法/i]
  ];
  const guideSignal = /攻略|路线|流程|选项|选择|先去|然后|建议|需要|必须|不要|记得|属性|好感|结局|支线|主线|第\s*[一二三四五六七八九十0-9]+章/i;
  const selectors = ['[class*="comment"]', '[class*="Comment"]', '[class*="interaction"]', '[class*="Interaction"]', '[class*="reply"]', '[class*="Reply"]', '[data-comment-id]', '[data-id*="comment"]'].join(",");
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const getWorkTitle = () => {
    const heading = clean(document.querySelector("h1")?.innerText || "");
    const pageTitle = heading || clean(document.title).replace(/\s*[|｜]\s*橙光作品.*$/i, "").split(/\s*[|｜]\s*/)[0];
    return pageTitle || `作品 ${location.pathname.match(/\/game\/(\d+)/)?.[1] || "未知"}`;
  };
  const getStoredWorkTitle = (favorite) => {
    if (favorite.workTitle) return favorite.workTitle;
    if (favorite.url?.split("#")[0] === location.href.split("#")[0]) return getWorkTitle();
    return `作品 ${favorite.url?.match(/\/game\/(\d+)/)?.[1] || "未知"}`;
  };
  const getHeader = (raw, text) => {
    const lines = String(raw || text || "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
    const author = lines[0] || "未知作者";
    const flowerLine = lines.find((line, index) => index > 0 && /^\d{1,6}(?:\s+\d{1,6})?$/.test(line)) || "";
    const date = String(raw || "").match(/\b\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\b/);
    return { author, flowerLine, postedAt: date?.[0] || "" };
  };
  const formatCommentText = (value) => {
    const seen = new Set();
    const lines = String(value || "").replace(/\r/g, "").split("\n").map((line) => line.replace(/[\t ]+/g, " ").trim());
    const kept = [];
    for (const line of lines) {
      if (!line) {
        if (kept.length && kept[kept.length - 1] !== "") kept.push("");
        continue;
      }
      if (/^(?:展开|收起|分享|举报)$/.test(line)) continue;
      if (/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}.*阅读时长/.test(line)) continue;
      if (/^.+\s+\d{1,5}\s+(?:分享|举报)(?:\s+(?:分享|举报))*$/.test(line)) continue;
      // Some layouts expose the same expanded comment twice; keep its original line breaks but remove exact duplicate lines.
      if (seen.has(line)) continue;
      seen.add(line);
      kept.push(line);
    }
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  const getTopic = (text) => topics.find(([, re]) => re.test(text))?.[0] || "其他攻略";
  const getLikes = (node, text) => {
    // Orange Light renders some like counts as a username followed by a number, e.g. "NEW-AN90 12".
    for (const el of node.querySelectorAll("span,div,a,button")) {
      const label = clean(el.innerText || el.textContent);
      const match = label.match(/^([A-Za-z][A-Za-z0-9_-]{2,})\s+(\d{1,5})$/);
      if (match) return Number(match[2]);
    }
    const candidates = [...node.querySelectorAll("button,[aria-label],[title]")]
      .map((el) => `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${clean(el.innerText || el.textContent)}`)
      .filter((value) => /赞|like/i.test(value));
    for (const candidate of candidates) {
      const match = candidate.match(/(?:点赞|赞|like)\D{0,8}(\d{1,7})/i) || candidate.match(/(\d{1,7})\D{0,4}(?:赞|like)/i);
      if (match) return Number(match[1]);
    }
    const compact = String(text || "").replace(/\s+/g, " ");
    // In this page layout the like count is its own line immediately before “分享 举报”.
    const beforeShare = compact.match(/(?:^|\s)(\d{1,5})\s*分享(?:\s*举报)?(?:\s|$)/);
    if (beforeShare) return Number(beforeShare[1]);
    const authorCount = compact.match(/(?:^|\s)[A-Za-z][A-Za-z0-9_-]{2,}\s+(\d{1,5})\s+(?:分享|举报|回复)/i)
      || compact.match(/(?:^|\s)[A-Za-z][A-Za-z0-9_-]{2,}\s+(\d{1,5})(?=\s*(?:分享|举报|回复|$))/i);
    if (authorCount) return Number(authorCount[1]);
    const fromText = compact.match(/(?:点赞|赞)\s*[:：]?\s*(\d{1,7})/);
    return fromText ? Number(fromText[1]) : null;
  };
  const getFlowerCount = (node) => {
    // Comment headers may show two flower types or one type; a single count is equivalent to count + 0.
    for (const el of node.querySelectorAll("span,div,a")) {
      const label = clean(el.innerText || el.textContent);
      const match = label.match(/^([^\d\n]{1,32}?)\s+(\d{1,6})\s+(\d{1,6})$/);
      if (match) return Number(match[2]) + Number(match[3]);
    }
    const lines = String(node.innerText || node.textContent || "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
    for (let i = 1; i < Math.min(lines.length, 5); i++) {
      const pair = lines[i].match(/^(\d{1,6})\s+(\d{1,6})$/);
      if (pair) return Number(pair[1]) + Number(pair[2]);
      if (/^\d{1,6}$/.test(lines[i])) return Number(lines[i]);
      if (/\d{4}-\d{2}-\d{2}/.test(lines[i])) break;
    }
    return null;
  };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeSourceUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["www.66rpg.com", "66rpg.com"].includes(url.hostname) && /^\/game\/\d+/.test(url.pathname) ? url.href : "";
    } catch { return ""; }
  };
  const getFavoriteWorkTitle = (favorite) => favorite.workTitle || getStoredWorkTitle(favorite);
  const makeExportBundle = (keys, scope, includeEmptyFolders = false) => {
    const uniqueKeys = [...new Set(keys)].filter((key) => favorites[key]);
    const keySet = new Set(uniqueKeys);
    const exportedFavorites = uniqueKeys.map((key) => ({ ...favorites[key], workTitle: getFavoriteWorkTitle(favorites[key]) }));
    const exportedFolders = Object.values(folders).filter((folder) => includeEmptyFolders || (folder.items || []).some((key) => keySet.has(key))).map((folder) => ({
      id: folder.id,
      name: folder.name,
      items: (folder.items || []).filter((key) => keySet.has(key)),
      createdAt: folder.createdAt || Date.now()
    }));
    return { format: "orange-guide-favorites", version: 1, exportedAt: new Date().toISOString(), scope, favorites: exportedFavorites, folders: exportedFolders };
  };
  const downloadText = (filename, content, mime) => {
    const blobUrl = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.style.display = "none";
    document.documentElement.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  };
  const safeFilename = (value) => String(value || "收藏攻略").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 70) || "收藏攻略";
  const buildViewerHtml = (bundle, heading) => {
    const foldersForKey = new Map();
    for (const folder of bundle.folders) for (const key of folder.items) {
      if (!foldersForKey.has(key)) foldersForKey.set(key, []);
      foldersForKey.get(key).push(folder.name);
    }
    const groups = new Map();
    for (const favorite of bundle.favorites) {
      const title = getFavoriteWorkTitle(favorite);
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(favorite);
    }
    const workHtml = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN")).map(([title, entries]) => {
      const articles = entries.map((favorite) => {
        const meta = [favorite.author, favorite.postedAt, favorite.likes == null ? "赞数未知" : `赞 ${favorite.likes}`, favorite.flowers == null ? "花数未知" : `🌸 ${favorite.flowers}`, ...(foldersForKey.get(favorite.key) || []).map((name) => `📁 ${name}`)].filter(Boolean).map(escapeHtml).join(" · ");
        const source = safeSourceUrl(favorite.url);
        return `<article class="card"><div class="meta">${meta}</div><pre>${escapeHtml(favorite.text)}</pre>${source ? `<a href="${escapeHtml(source)}">打开原评论来源 ↗</a>` : ""}</article>`;
      }).join("");
      const source = safeSourceUrl(entries[0]?.url);
      return `<details><summary><strong>${escapeHtml(title)}</strong><span>${entries.length} 条收藏</span></summary>${source ? `<p><a href="${escapeHtml(source)}">打开作品页 ↗</a></p>` : ""}${articles}</details>`;
    }).join("");
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title><style>
      :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f7f4ef;color:#302923;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.wrap{max-width:900px;margin:auto;padding:24px 16px 56px}h1{font-size:24px;line-height:1.3;margin:0 0 6px}.intro{color:#75695e;font-size:13px;margin:0 0 20px}details{margin:12px 0;padding:0 14px 12px;border:1px solid #e5d9ca;border-radius:12px;background:#fff}summary{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 0;cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}summary:before{content:"›";font-size:22px;color:#9a7055;transition:transform .15s}details[open] summary:before{transform:rotate(90deg)}summary strong{flex:1;font-size:16px}summary span,.meta{color:#82766b;font-size:12px}a{color:#8a5a48;text-decoration:none}.card{margin:8px 0 12px;padding:13px;border:1px solid #eee6dc;border-radius:9px;background:#fffdfb}.meta{margin-bottom:8px}pre{margin:0 0 9px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.card a{font-size:13px}@media(max-width:560px){.wrap{padding:18px 11px 40px}h1{font-size:21px}details{padding:0 11px 10px}.card{padding:10px}}
    </style></head><body><main class="wrap"><h1>${escapeHtml(heading)}</h1><p class="intro">${bundle.favorites.length} 条收藏 · 导出于 ${escapeHtml(bundle.exportedAt)}</p>${workHtml || "<p>没有可显示的收藏。</p>"}</main></body></html>`;
  };
  const downloadCollection = (keys, scopeType, scopeLabel, includeEmptyFolders = false) => {
    const bundle = makeExportBundle(keys, { type: scopeType, label: scopeLabel }, includeEmptyFolders);
    if (!bundle.favorites.length && !includeEmptyFolders) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const stem = `${safeFilename(scopeLabel)}-${today}`;
    downloadText(`${stem}.json`, JSON.stringify(bundle, null, 2), "application/json");
    downloadText(`${stem}.html`, buildViewerHtml(bundle, `${scopeLabel} · 橙光收藏攻略`), "text/html");
  };
  const validateImportBundle = (data) => {
    if (!data || data.format !== "orange-guide-favorites" || data.version !== 1 || !Array.isArray(data.favorites) || !Array.isArray(data.folders)) throw new Error("文件格式不正确或版本不支持。");
    if (data.favorites.length > 10000 || data.folders.length > 1000) throw new Error("文件中的收藏或文件夹数量超出限制。");
    const favoritesInFile = [];
    const seenKeys = new Set();
    let repeatedKeys = 0;
    for (const favorite of data.favorites) {
      if (!favorite || typeof favorite.key !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(favorite.key) || ["__proto__", "constructor", "prototype"].includes(favorite.key) || typeof favorite.text !== "string" || favorite.text.length > 200000) throw new Error("收藏条目缺少有效 ID 或正文过长。");
      if (seenKeys.has(favorite.key)) { repeatedKeys++; continue; }
      seenKeys.add(favorite.key);
      const numeric = (value) => value == null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
      if (!numeric(favorite.likes) || !numeric(favorite.flowers)) throw new Error("收藏条目的赞数或花数格式不正确。");
      favoritesInFile.push({
        key: favorite.key, text: favorite.text,
        author: typeof favorite.author === "string" ? favorite.author : "未知作者",
        flowerLine: typeof favorite.flowerLine === "string" ? favorite.flowerLine : "",
        postedAt: typeof favorite.postedAt === "string" ? favorite.postedAt : "",
        topic: typeof favorite.topic === "string" ? favorite.topic : "其他攻略",
        likes: favorite.likes ?? null, flowers: favorite.flowers ?? null,
        url: safeSourceUrl(favorite.url),
        workTitle: typeof favorite.workTitle === "string" ? favorite.workTitle : `作品 ${String(favorite.url || "").match(/\/game\/(\d+)/)?.[1] || "未知"}`,
        savedAt: Number.isFinite(favorite.savedAt) ? favorite.savedAt : Date.now()
      });
    }
    const folderIds = new Set();
    const foldersInFile = data.folders.map((folder) => {
      if (!folder || typeof folder.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(folder.id) || ["__proto__", "constructor", "prototype"].includes(folder.id) || typeof folder.name !== "string" || !Array.isArray(folder.items) || folder.items.some((key) => typeof key !== "string")) throw new Error("文件夹数据格式不正确。");
      if (folderIds.has(folder.id)) throw new Error("文件夹 ID 重复，无法安全导入。");
      folderIds.add(folder.id);
      return { id: folder.id, name: folder.name.slice(0, 120), items: [...new Set(folder.items)].filter((key) => seenKeys.has(key)), createdAt: Number.isFinite(folder.createdAt) ? folder.createdAt : Date.now() };
    });
    return { favorites: favoritesInFile, folders: foldersInFile, repeatedKeys };
  };
  const makeKey = (text, raw) => {
    const header = getHeader(raw, text);
    const source = `${location.href.split("#")[0]}|${header.author}|${header.flowerLine}|${header.postedAt}|${clean(text)}`;
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
    return `c${(hash >>> 0).toString(16)}`;
  };
  // The interaction section's box, counters and tabs sit above the first comment in the same container.
  const stripPageHeader = (raw) => String(raw || "").replace(/\r/g, "").replace(/^\s*互动区[\s\S]*?只看作者[ \t]*\n(?:\s*(?:全部精选|作者的话|攻略区|精彩长评|安利墙|其他)+[ \t]*(?:\n|$))*/, "");
  // Every comment ends with its “分享 举报” actions, so several of those in one node mean several comments.
  const splitCommentBlocks = (raw) => {
    const value = String(raw || "").replace(/\r/g, "");
    const ending = /分享(?:\s+\S{1,8}){0,6}?\s+举报[ \t]*(?=\n|$)/g;
    const blocks = [];
    let start = 0;
    for (const match of value.matchAll(ending)) {
      const end = match.index + match[0].length;
      blocks.push(value.slice(start, end));
      start = end;
    }
    return blocks.length > 1 ? blocks.map((block) => block.trim()).filter(Boolean) : [value];
  };
  const findComments = () => {
    const nodes = [...document.querySelectorAll(selectors)];
    const seen = new Set();
    const found = [];
    const add = (node, text, raw, scope) => {
      if (text.length < 25 || !guideSignal.test(text)) return;
      const key = text.slice(0, 180);
      if (seen.has(key)) return;
      seen.add(key);
      found.push({ node, text, raw, scope });
    };
    for (const node of nodes) {
      const raw = node.innerText || node.textContent || "";
      const text = formatCommentText(raw);
      if (text.length < 25 || !guideSignal.test(text)) continue;
      const childMatch = [...node.children].some((child) => {
        const childText = clean(child.innerText || child.textContent);
        return childText.length >= 25 && childText.length <= text.length * 0.92 && guideSignal.test(childText);
      });
      if (childMatch) continue;
      const body = stripPageHeader(raw);
      const blocks = splitCommentBlocks(body);
      if (blocks.length === 1 && body === raw.replace(/\r/g, "")) { add(node, text, raw, node); continue; }
      for (const block of blocks) {
        const scope = document.createElement("div");
        scope.textContent = block;
        add(node, formatCommentText(block), block, scope);
      }
    }
    return found;
  };

  const pageControlText = (el) => clean(el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText || el.textContent);
  const isVisible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  const getPagination = () => {
    const roots = [...document.querySelectorAll('[class*="pagination" i],[class*="pager" i],[id*="pagination" i],[id*="pager" i],nav')]
      .filter((el) => !panel.contains(el) && isVisible(el))
      .map((el) => ({ el, numbers: [...el.querySelectorAll('a,button,[role="button"],li')].filter((item) => isVisible(item) && /^\d{1,5}$/.test(clean(item.innerText || item.textContent))) }))
      .filter(({ numbers }) => numbers.length >= 2 && numbers.length <= 40)
      .sort((a, b) => a.numbers.length - b.numbers.length);
    const root = roots[0];
    if (!root) return null;
    const controls = [...root.el.querySelectorAll('a,button,[role="button"],li')].filter((el) => isVisible(el));
    const numberOf = (el) => {
      const label = clean(el.innerText || el.textContent);
      return /^\d{1,5}$/.test(label) ? Number(label) : null;
    };
    const hasActiveMarker = (el) => {
      let node = el;
      while (node && root.el.contains(node)) {
        if (node.matches('[aria-current="page"],[aria-selected="true"],.active,.current,.selected,[class~="on"]')) return true;
        node = node.parentElement;
      }
      return false;
    };
    const currentControl = root.numbers.find(hasActiveMarker);
    const current = currentControl ? numberOf(currentControl) : null;
    const numeric = new Map();
    for (const el of controls) {
      const number = numberOf(el);
      if (number != null && !numeric.has(number)) numeric.set(number, el);
    }
    const isDisabled = (el) => {
      let node = el;
      while (node && root.el.contains(node)) {
        if (node.matches(':disabled,[aria-disabled="true"],.disabled,[class~="disabled"]')) return true;
        node = node.parentElement;
      }
      return false;
    };
    const arrow = (direction) => controls.find((el) => {
      if (numberOf(el) != null || isDisabled(el)) return false;
      const label = pageControlText(el).toLowerCase();
      return direction === "next"
        ? /^(?:下一页|下页|next|›|>|→|\u203a)$/.test(label)
        : /^(?:上一页|上页|prev(?:ious)?|‹|<|←|\u2039)$/.test(label);
    });
    const total = Math.max(...root.numbers.map(numberOf));
    return { root: root.el, current, total: Number.isFinite(total) ? total : null, numeric, next: (current == null ? null : numeric.get(current + 1)) || arrow("next"), previous: (current == null ? null : numeric.get(current - 1)) || arrow("previous") };
  };

  const waitForPage = async (pageNumber, previousUrl) => {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const pagination = getPagination();
      if (pagination?.current === pageNumber || (location.href !== previousUrl && pagination?.current != null)) return pagination;
    }
    return null;
  };

  const recordsOnCurrentPage = () => findComments().map(({ node, text, raw, scope }, index) => {
    const header = getHeader(raw, text);
    return { node, text, raw, index, ...header, topic: getTopic(text), likes: getLikes(scope, raw), flowers: getFlowerCount(scope), key: makeKey(text, raw), url: location.href.split("#")[0], workTitle: getWorkTitle() };
  });

  const panel = document.createElement("aside");
  panel.id = "ogo-panel";
  panel.innerHTML = `
    <header><div><strong>攻略整理器</strong><small>评论收藏保存在本机</small></div><button data-action="close" aria-label="关闭">×</button></header>
    <section class="ogo-consent" data-consent role="dialog" aria-labelledby="ogo-consent-title" aria-modal="true" hidden><h2 id="ogo-consent-title">使用前请了解数据处理方式</h2><p>整理攻略需要读取当前橙光作品页中已加载的评论文字，以及页面展示的作者、作品、日期、赞数和花数。点击“抓取全部页”后，扩展会逐页切换评论分页并读取各页评论。数据只在本机浏览器中用于搜索、筛选、排序和定位。</p><p>只有点击“收藏”后，评论和相关信息才会保存到 Chrome 扩展本地存储；导出也只在你主动操作时生成文件。扩展不向开发者或云端上传评论，也不读取登录凭据或 Cookie。“定位攻略”中加入、导入或粘贴的文字只保存在本机；游戏时间功能只读取游戏画面上显示的年月和境界文字，不读取其他游戏内容，也不会上传。</p><p>你可以选择暂不使用。若之后要停止处理，可卸载扩展；卸载可能删除本机收藏，请先导出备份。<a href="https://www.66rpg.com/" target="_blank" rel="noreferrer">仅在橙光作品页运行</a></p><div class="ogo-consent-actions"><button data-action="decline-consent">暂不使用</button><button data-action="accept-consent">同意并开始</button></div></section>
    <div class="ogo-toolbar"><input data-search placeholder="搜攻略内容 / 角色名"/><select data-sort aria-label="排序方式"><option value="page">页面顺序</option><option value="likes-desc">赞数从高到低</option><option value="likes-asc">赞数从低到高</option></select><button data-action="scan">重新扫描</button></div>
    <div class="ogo-bulk-toolbar"><button data-action="scan-all-pages">抓取全部页</button><button data-action="fav-all" disabled>全部收藏（0）</button><button data-action="fav-undo" hidden>撤销</button><small data-bulk-status>自动逐页收集评论，可随时停止</small></div>
    <div class="ogo-flower-filter"><span>总花数</span><input type="number" min="0" data-flower-min placeholder="最低" aria-label="最低总花数"/><span>至</span><input type="number" min="0" data-flower-max placeholder="最高" aria-label="最高总花数"/><button data-action="clear-flower-filter">清除</button></div>
    <nav data-topics></nav><div class="ogo-folder-nav" data-folder-nav hidden></div><div class="ogo-fav-tools" data-fav-tools hidden><button data-action="select-all">全选当前列表</button><button data-action="folder-create" disabled>新建文件夹（0）</button><button data-action="folder-delete" hidden>删除文件夹</button><button data-action="export-selected" disabled>导出所选</button><button data-action="export-all">导出全部</button><button data-action="choose-import">导入 JSON</button><input data-import-file type="file" accept=".json,application/json" hidden></div><div class="ogo-status" data-status>正在扫描页面…</div><main data-results></main>
    <input data-loc-file type="file" accept=".md,.txt,text/markdown,text/plain" hidden><section class="ogo-folder-dialog" data-paste-dialog hidden><div class="ogo-folder-head"><strong>粘贴攻略</strong><button data-action="close-paste">×</button></div><p>粘贴的文字按纯文本显示。想要清晰的标题和分节，请导入 .md 文件。只保存在本机，不影响收藏。</p><input data-paste-name placeholder="攻略名称，例如：凡人期攻略"/><textarea data-paste-text rows="8" placeholder="在这里粘贴攻略文字"></textarea><div class="ogo-folder-actions"><button data-action="close-paste">取消</button><button data-action="confirm-paste">保存</button></div></section><section class="ogo-folder-dialog" data-folder-dialog hidden><div class="ogo-folder-head"><strong>新建文件夹</strong><button data-action="close-folder">×</button></div><p>选中的收藏会放进文件夹，每条评论仍单独保留。</p><input data-folder-name placeholder="文件夹名称，例如：灵兽收集攻略"/><div class="ogo-folder-actions"><button data-action="close-folder">取消</button><button data-action="confirm-folder">创建</button></div></section>
    <section class="ogo-import-dialog" data-import-dialog hidden><div class="ogo-folder-head"><strong>导入收藏备份</strong><button data-action="close-import">×</button></div><p data-import-summary></p><div class="ogo-folder-actions"><button data-action="close-import">取消</button><button data-action="confirm-import" disabled>合并导入</button></div></section>`;
  document.documentElement.append(panel);
  const launcher = document.createElement("button");
  launcher.id = "ogo-launcher";
  launcher.textContent = "📚 整理攻略";
  launcher.title = "打开攻略整理器";
  document.documentElement.append(launcher);

  let records = [];
  let favorites = {};
  let folders = {};
  let activeTopic = "全部";
  let query = "";
  let sortMode = "page";
  let flowerMin = null;
  let flowerMax = null;
  let activeFolderId = null;
  let visibleFavoriteKeys = [];
  let pendingImport = null;
  const expandedWorks = new Set();
  const selectedFavorites = new Set();
  let scanTimer;
  const timeApi = globalThis.OgoTimePoints;
  const workId = location.pathname.match(/\/game\/(\d+)/)?.[1] || "";
  const GAME_STAGES = ["凡人期", "练气期", "筑基期", "金丹期", "元婴期", "化神期"];
  const STALE_AFTER = 10 * 60 * 1000;
  let gameTimeRead = null;
  let gameTimeManual = null;
  let gameMarker = null;
  let pinnedSection = "";
  let bridge = null;
  let sentKeywords = "";
  let guides = [];
  let followGame = true;
  let previewOffset = 0;
  let locateMessage = "";
  let lastLocateKey = "";
  let locateUserScrolled = false;
  let ignoreScrollUntil = 0;
  const expandedGuides = new Set();
  let adjustOpen = false;
  let guidesOpen = false;
  const secOpen = new Map();
  // Inline editor state; only one guide section (or one whole guide) is edited at a time.
  let editing = null;
  let generalOpen = false;
  const mdApi = globalThis.OgoMarkdown;
  const bulkApi = globalThis.OgoBulkFavorite;
  let consentGranted = false;
  let bulkScanRunning = false;
  let bulkStopRequested = false;
  let bulkStatusMessage = "";
  let visibleItems = [];
  let lastBulkKeys = null;
  let activeBulkCollected = null;
  let ignorePaginationMutationsUntil = 0;
  const status = panel.querySelector("[data-status]");
  const consentScreen = panel.querySelector("[data-consent]");
  const results = panel.querySelector("[data-results]");
  const topicNav = panel.querySelector("[data-topics]");
  const folderNav = panel.querySelector("[data-folder-nav]");
  const favoriteTools = panel.querySelector("[data-fav-tools]");
  const folderDialog = panel.querySelector("[data-folder-dialog]");
  const importDialog = panel.querySelector("[data-import-dialog]");
  const importFileInput = panel.querySelector("[data-import-file]");
  const locateFileInput = panel.querySelector("[data-loc-file]");
  const pasteDialog = panel.querySelector("[data-paste-dialog]");
  const loadFavorites = () => new Promise((resolve) => chrome.storage.local.get({ ogoFavorites: {}, ogoFolders: {} }, (data) => { favorites = data.ogoFavorites || {}; folders = data.ogoFolders || {}; resolve(); }));
  const saveFavorites = () => new Promise((resolve) => chrome.storage.local.set({ ogoFavorites: favorites }, resolve));
  // Like saveFavorites, but resolves false when storage rejects the write (e.g. quota exceeded).
  const trySaveFavorites = () => new Promise((resolve) => chrome.storage.local.set({ ogoFavorites: favorites }, () => resolve(!chrome.runtime.lastError)));
  const saveFolders = () => new Promise((resolve) => chrome.storage.local.set({ ogoFolders: folders }, resolve));
  const loadGameTime = () => new Promise((resolve) => chrome.storage.local.get({ ogoGameTimeV1: {}, [`ogoLocate:${workId}`]: null }, (data) => {
    const saved = data.ogoGameTimeV1?.[workId];
    gameTimeRead = saved?.read || null;
    gameTimeManual = saved?.manual || null;
    gameMarker = saved?.marker || null;
    pinnedSection = saved?.pinned || "";
    const locate = data[`ogoLocate:${workId}`];
    guides = Array.isArray(locate?.guides) ? locate.guides.filter((g) => g && typeof g.id === "string" && typeof g.text === "string") : [];
    followGame = locate?.follow !== false;
    resolve();
  }));
  const saveGameTime = () => new Promise((resolve) => chrome.storage.local.get({ ogoGameTimeV1: {} }, (data) => {
    const all = data.ogoGameTimeV1 || {};
    all[workId] = { read: gameTimeRead, manual: gameTimeManual, marker: gameMarker, pinned: pinnedSection };
    chrome.storage.local.set({ ogoGameTimeV1: all }, () => { if (chrome.runtime.lastError) locateMessage = `保存游戏时间失败：${chrome.runtime.lastError.message}`; resolve(); });
  }));
  const saveLocate = () => new Promise((resolve) => chrome.storage.local.set({ [`ogoLocate:${workId}`]: { guides, follow: followGame } }, () => {
    const failed = chrome.runtime.lastError?.message;
    if (failed) locateMessage = `保存失败（浏览器存储可能已满）：${failed}`;
    resolve(!failed);
  }));
  const readTime = () => (gameTimeRead?.month != null ? gameTimeRead : null);
  const manualTime = () => (gameTimeManual ? { calendar: "", year: gameTimeManual.year, month: gameTimeManual.month, stage: gameTimeRead?.stage || "" } : null);
  // "Follow game" uses what the game frame reported (falling back to the manual value); otherwise the manual value wins.
  const currentGameTime = () => (followGame ? readTime() || manualTime() : manualTime() || readTime());
  const formatGameTime = (t) => `${t.calendar || ""}${t.year != null ? `${t.year}年` : ""}${t.month != null ? `${t.month}月` : ""}${t.stage ? ` · ${t.stage}` : ""}`;
  const shiftTime = (t, delta) => {
    const index = t.month - 1 + delta;
    return { ...t, month: ((index % 12) + 12) % 12 + 1, year: t.year != null ? t.year + Math.floor(index / 12) : null };
  };
  // The game runs in an h5 iframe of this work page; a message counts only if its sender is that frame (or a frame inside it).
  const gameFrame = () => [...document.querySelectorAll("iframe")].find((el) => workId && new RegExp(`^https://(?:www\\.)?66rpg\\.com/h5/${workId}(?:[/?#]|$)`).test(el.src));
  const fromGameFrame = (event) => {
    if (!/^https:\/\/(?:www\.)?66rpg\.com$/.test(event.origin)) return false;
    const frame = gameFrame();
    if (!frame) return false;
    let source = event.source;
    for (let depth = 0; source && depth < 4; depth++) {
      if (source === frame.contentWindow) return true;
      try { if (source.parent === source) break; source = source.parent; } catch { break; }
    }
    return false;
  };
  const activeKeywords = () => [...new Set(guides.filter((g) => g.enabled).flatMap((g) => sectionsOf(g).flatMap((s) => s.keywords)))];
  // The game frame reports only these keywords, so it needs the current list whenever the selected guides change.
  const syncKeywords = (force = false) => {
    const target = bridge?.source || gameFrame()?.contentWindow;
    if (!target) return;
    const list = activeKeywords();
    const signature = JSON.stringify(list);
    if (!force && signature === sentKeywords) return;
    sentKeywords = signature;
    try { target.postMessage({ type: "ogo-game-keywords", keywords: list }, bridge?.origin || location.origin); } catch {}
  };
  // Loading a save can change the reading many times a second, and the panel shares a thread with the game.
  // Readings still apply at once; only saving and redrawing wait. Other tabs redraw when they are opened.
  const gameTimeFlush = timeApi.createCoalescer(() => {
    saveGameTime();
    if (activeTopic === "定位") render();
  }, 200);
  const acceptGameTimeMessage = (event) => {
    const d = event.data;
    if (!d || !fromGameFrame(event)) return;
    if (d.type === "ogo-bridge-ready") { bridge = { source: event.source, origin: event.origin }; syncKeywords(true); return; }
    if (d.type === "ogo-game-keywords-found") {
      const known = activeKeywords();
      if (!Array.isArray(d.keywords) || !d.keywords.length || !d.keywords.every((k) => known.includes(k))) return;
      if (!pinnedSection && d.keywords.join("|") === gameMarker?.keywords.join("|")) return;
      gameMarker = { keywords: d.keywords, at: Date.now() };
      pinnedSection = "";
      gameTimeFlush.request();
      return;
    }
    if (d.type !== "ogo-game-time") return;
    const intIn = (v, lo, hi) => v === null || (Number.isInteger(v) && v >= lo && v <= hi);
    if (!["", "庆和", "修炼"].includes(d.calendar) || !intIn(d.year, 0, 999) || !intIn(d.month, 1, 12) || d.month === null || !(d.stage === "" || GAME_STAGES.includes(d.stage))) return;
    gameTimeRead = { calendar: d.calendar, year: d.year, month: d.month, stage: d.stage, at: Date.now() };
    gameTimeFlush.request();
  };

  const sectionCache = timeApi.createTextCache();
  // Only imported .md files are rendered as Markdown; comments, pasted text and .txt files stay plain text.
  const isMd = (guide) => (guide.format ? guide.format === "md" : guide.source === "file");
  const authorCache = timeApi.createTextCache();
  const authorsOf = (guide) => authorCache.get(guide.id, guide.text, "", () => mdApi.collectAuthors(guide.text));
  const renderGuideText = (guide, text) => (isMd(guide) ? mdApi.renderMarkdown(text, { authors: authorsOf(guide) }) : mdApi.renderPlain(text));
  const sectionsOf = (guide) => sectionCache.get(guide.id, guide.text, isMd(guide), () => timeApi.splitGuideSections(guide.text, { headings: isMd(guide) }));
  const newGuideId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const guessStage = (...texts) => GAME_STAGES.find((stage) => texts.some((t) => String(t || "").includes(stage.replace(/期$/, "")))) || "";
  async function addGuide(name, text, source, format = "text") {
    const body = String(text || "").replace(/\r\n?/g, "\n").trim();
    if (!body) { locateMessage = "没有可加入的文字。"; render(); return false; }
    if (body.length > 200000) { locateMessage = "这份攻略超过 20 万字，无法加入。"; render(); return false; }
    if (guides.length >= 50) { locateMessage = "最多保存 50 份攻略，请先删除不用的。"; render(); return false; }
    if (guides.some((g) => g.text === body)) { locateMessage = "这份攻略已经在定位列表里了。"; render(); return false; }
    const guide = { id: newGuideId(), name: String(name || "未命名攻略").trim().slice(0, 60) || "未命名攻略", text: body, stage: guessStage(name), enabled: guides.length === 0, source, format, createdAt: Date.now() };
    guides.push(guide);
    locateMessage = "";
    if (!(await saveLocate())) guides.pop();
    else guidesOpen = true, locateMessage = `已加入“${guide.name}”，勾选后即可定位。${format === "md" ? "" : "想要清晰的标题和分节，请导入 .md 文件。"}`;
    render();
    return !locateMessage.includes("失败");
  }

  const formatLongTime = (t) => `${t.calendar ? `${t.calendar} ` : ""}${t.year != null ? `${t.year} 年 ` : ""}${t.month != null ? `${t.month} 月` : ""}`.trim();
  const monthsLabel = (section) => [...new Set(section.points.map((p) => p.label))].slice(0, 4).join("、");
  const startsWithHeading = (e) => isMd(e.guide) && /^#{1,6}\s/.test(e.section.text);
  const bodyOf = (e) => (startsWithHeading(e) ? e.section.text.replace(/^#{1,6}\s+.*\n?/, "") : e.section.text);
  const sectionKey = (guide, index) => `${guide.id}:${index}`;
  const editorHtml = () => `<div class="ogo-edit" data-edit-box><textarea data-edit-ta spellcheck="false" aria-label="攻略原文（Markdown）"></textarea><small class="ogo-edit-error" data-edit-status role="alert" hidden></small><div class="ogo-edit-prompt" data-edit-prompt hidden><span>有未保存的改动。</span><span><button data-edit-prompt-save>保存</button><button data-edit-prompt-discard>放弃改动</button><button data-edit-prompt-stay>继续编辑</button></span></div><div class="ogo-edit-bar"><small>保存后无法撤销</small><span><button data-edit-cancel>取消</button><button data-edit-save>保存</button></span></div></div>`;
  function renderLocate() {
    // Rebuilding the results would drop the textarea's focus, caret and unsaved text, so it waits until editing ends (saving or cancelling renders again).
    if (editing?.ta && results.contains(editing.ta)) return;
    const base = currentGameTime();
    const shown = base && previewOffset ? shiftTime(base, previewOffset) : base;
    const manual = gameTimeManual || {};
    const usingRead = followGame && readTime();
    const selected = guides.filter((g) => g.enabled);
    const entries = [];
    const marker = gameMarker?.keywords || [];
    const aheadOf = (section, key) => {
      if (pinnedSection) return key === pinnedSection ? 0 : null;
      if (section.keywords.length) return section.keywords.some((k) => marker.includes(k)) ? 0 : null;
      return shown && section.kind === "time" ? timeApi.sectionAhead(section, shown) : null;
    };
    for (const guide of selected) sectionsOf(guide).forEach((section, index) => { const key = sectionKey(guide, index); entries.push({ guide, section, key, ahead: aheadOf(section, key) }); });
    const timed = entries.filter((e) => e.section.kind === "time").sort((a, b) => a.section.order - b.section.order);
    const general = entries.filter((e) => e.section.kind === "general");
    const nextAhead = Math.min(...timed.filter((e) => e.ahead != null && e.ahead > 0).map((e) => e.ahead));
    const nowEntries = timed.filter((e) => e.ahead === 0);
    const afterNow = timed[timed.lastIndexOf(nowEntries[nowEntries.length - 1]) + 1];
    const nextEntries = Number.isFinite(nextAhead) ? timed.filter((e) => e.ahead === nextAhead) : nowEntries.length && afterNow ? [afterNow] : [];
    const pinnedTitle = entries.find((e) => e.key === pinnedSection)?.section.title || "";
    const markerLabel = marker.map(timeApi.keywordLabel).sort((a, b) => b.length - a.length)[0] || "";
    const positionLabel = pinnedTitle || markerLabel;
    const many = selected.length > 1;
    const stageWarnings = selected.filter((g) => g.stage && base?.stage && g.stage !== base.stage).map((g) => `当前已是${base.stage}，“${g.name}”标注为${g.stage}攻略（仅提示，不会自动切换）。`);
    const lastReadAt = Math.max(gameTimeRead?.at || 0, gameMarker?.at || 0);
    const stale = lastReadAt && Date.now() - lastReadAt > STALE_AFTER;
    const when = lastReadAt ? new Date(lastReadAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";

    const card = (e) => {
      const isNow = e.ahead === 0;
      const isNext = !isNow && nextEntries.includes(e);
      const title = startsWithHeading(e) || e.section.kind === "general" ? e.section.title : monthsLabel(e.section);
      const editingHere = editing?.mode === "section" && editing.key === e.key;
      const open = editingHere || (secOpen.has(e.key) ? secOpen.get(e.key) : isNow);
      const flag = isNow ? `<span class="ogo-sec-flag now">当前</span>` : isNext ? `<span class="ogo-sec-flag next">接下来${e.ahead ? ` · ${e.ahead} 个月后` : ""}</span>` : "";
      return `<details class="ogo-sec ${isNow ? "now" : ""}" data-sec-key="${escapeHtml(e.key)}" data-default="${isNow ? 1 : 0}" ${open ? "open" : ""} ${isNow || (isNext && !nowEntries.length) ? "data-loc-anchor" : ""}><summary><span class="ogo-sec-title">${escapeHtml(title)}</span>${flag}${many ? `<span class="ogo-loc-guide-tag">${escapeHtml(e.guide.name)}</span>` : ""}<span class="ogo-sec-brief">${escapeHtml((isMd(e.guide) ? mdApi.summarizeMarkdown : mdApi.summarizePlain)(bodyOf(e)))}</span></summary>${editingHere ? editorHtml() : `<div class="ogo-sec-tools">${e.section.start != null ? `<button class="ogo-sec-pin" data-loc-edit="${escapeHtml(e.key)}">编辑</button>` : ""}<button class="ogo-sec-pin" data-loc-pin="${escapeHtml(e.key)}">${e.key === pinnedSection ? "取消手动定位" : "设为当前"}</button></div><div class="ogo-md">${renderGuideText(e.guide, bodyOf(e))}</div>`}</details>`;
    };
    const guideRow = (g) => {
      const timedCount = sectionsOf(g).filter((s) => s.kind === "time").length;
      return `<div class="ogo-loc-guide"><label class="ogo-loc-pick"><input type="checkbox" data-loc-toggle="${escapeHtml(g.id)}" ${g.enabled ? "checked" : ""}/><b>${escapeHtml(g.name)}</b></label><div class="ogo-loc-guide-actions"><small>${timedCount ? `${timedCount} 段` : "无时间点"}</small><select data-loc-stage="${escapeHtml(g.id)}" aria-label="适用境界"><option value="">境界不限</option>${GAME_STAGES.map((s) => `<option ${g.stage === s ? "selected" : ""}>${s}</option>`).join("")}</select><button data-loc-only="${escapeHtml(g.id)}">只用这份</button><button data-loc-view="${escapeHtml(g.id)}">${expandedGuides.has(g.id) ? "收起全文" : "全文"}</button><button data-loc-export="${escapeHtml(g.id)}">导出</button><button data-loc-rename="${escapeHtml(g.id)}">改名</button><button data-loc-delete="${escapeHtml(g.id)}">删除</button></div>${editing?.mode === "full" && editing.guideId === g.id ? editorHtml() : expandedGuides.has(g.id) ? `<div class="ogo-loc-fulltools"><button data-loc-edit-full="${escapeHtml(g.id)}">编辑全文</button></div><div class="ogo-md ogo-loc-full">${renderGuideText(g, g.text)}</div>` : ""}</div>`;
    };
    let body;
    if (!guides.length) body = `<div class="ogo-empty">还没有定位用的攻略。<br>点上方“导入 .md/.txt”或“粘贴文字”，也可以在攻略或收藏卡片上点“加入定位”。<br>想要清晰的标题和分节，请导入 .md 文件。</div>`;
    else if (!selected.length) body = `<div class="ogo-empty">没有选中任何攻略。勾选上方的攻略后，才会按游戏时间定位。</div>`;
    else if (!timed.length) body = `<div class="ogo-empty">选中的攻略里没有识别到时间。导入 .md 文件时，可以在标题末尾写上游戏里显示的文字，比如“## 暑假第一周 [第1周]”。</div>`;
    else body = `<div class="ogo-loc-toolbar"><button data-loc-jump>回到当前位置</button><span><button data-loc-fold="open">全部展开</button><button data-loc-fold="closed">全部折叠</button></span></div>${!shown && !positionLabel ? `<div class="ogo-loc-hint">还没有读取到游戏时间。可以打开游戏，或展开任意一节点“设为当前”。</div>` : !nowEntries.length ? `<div class="ogo-loc-hint">${escapeHtml(positionLabel || formatLongTime(shown))}没有对应的内容。</div>` : ""}<div class="ogo-sec-list">${timed.map(card).join("")}</div>`;
    if (selected.length && general.length) body += `<details class="ogo-loc-general" data-general ${generalOpen || (editing?.mode === "section" && general.some((e) => e.key === editing.key)) ? "open" : ""}><summary>通用内容（${general.length} 段，不按时间定位）</summary>${general.map(card).join("")}</details>`;

    const keepScroll = results.scrollTop;
    results.innerHTML = `<div class="ogo-loc-top"><div class="ogo-loc-now-line"><strong>${positionLabel ? escapeHtml(positionLabel) : base ? escapeHtml(formatLongTime(previewOffset && shown ? shown : base)) : "未读取游戏时间"}</strong><span>${pinnedTitle ? "· 手动定位" : markerLabel ? "· 自动读取" : previewOffset ? "· 预览" : base ? (usingRead ? "· 自动读取" : "· 手动") : ""}</span></div><small class="${(!base && !positionLabel) || stale ? "ogo-time-stale" : ""}">${lastReadAt ? `更新于 ${when}${stale ? "，可能已过期；打开游戏状态页可刷新" : ""}` : "游戏显示时间后自动读取，也可手动输入"}</small><details class="ogo-loc-adjust" data-adjust ${adjustOpen ? "open" : ""}><summary>调整时间 / 预览</summary><div class="ogo-time-manual"><input type="number" min="0" max="999" data-time-year placeholder="年" value="${manual.year ?? ""}" aria-label="手动输入年"/><input type="number" min="1" max="12" data-time-month placeholder="月" value="${manual.month ?? ""}" aria-label="手动输入月"/><button data-action="time-save">设定</button><button data-action="time-clear">清除手动值</button></div><label class="ogo-loc-follow"><input type="checkbox" data-loc-follow ${followGame ? "checked" : ""}/>跟随游戏时间（关闭后使用手动值）</label><div class="ogo-loc-preview"><button data-loc-shift="-1">‹ 上一月</button><span>${previewOffset && shown ? `预览 ${escapeHtml(formatLongTime(shown))}` : "预览：当前"}</span><button data-loc-shift="1">下一月 ›</button><button data-loc-shift="0" ${previewOffset ? "" : "disabled"}>还原</button></div></details></div><details class="ogo-loc-guides" data-guides ${guidesOpen ? "open" : ""}><summary>攻略 ${guides.length} 份 · 已选 ${selected.length}</summary><div class="ogo-loc-head"><span>${locateMessage ? `<small class="ogo-loc-message">${escapeHtml(locateMessage)}</small>` : ""}</span><span><button data-loc-import>导入 .md/.txt</button><button data-loc-paste>粘贴文字</button></span></div>${stageWarnings.map((w) => `<small class="ogo-loc-warn">${escapeHtml(w)}</small>`).join("")}${guides.map(guideRow).join("")}</details>${stageWarnings.length && !guidesOpen ? stageWarnings.map((w) => `<small class="ogo-loc-warn">${escapeHtml(w)}</small>`).join("") : ""}${body}`;
    if (editing && !editing.ta) {
      const ta = results.querySelector("[data-edit-ta]");
      if (ta) {
        editing.ta = ta;
        editing.status = results.querySelector("[data-edit-status]");
        ta.value = editing.original;
        ta.focus({ preventScroll: true });
      } else editing = null;
    }
    const anchorKey = `${shown ? `${shown.year}-${shown.month}` : ""}|${positionLabel}|${selected.map((g) => g.id).join(",")}`;
    const anchor = results.querySelector("[data-loc-anchor]");
    if (anchorKey !== lastLocateKey && !locateUserScrolled && anchor) {
      lastLocateKey = anchorKey;
      scrollLocateTo(anchor);
    } else {
      if (anchorKey !== lastLocateKey && !anchor) lastLocateKey = anchorKey;
      results.scrollTop = keepScroll;
    }
  }
  function scrollLocateTo(anchor) {
    ignoreScrollUntil = Date.now() + 700;
    results.scrollTop += anchor.getBoundingClientRect().top - results.getBoundingClientRect().top - 8;
  }

  function render() {
    syncKeywords();
    const topicsFound =["全部", ...new Set(records.map((r) => r.topic)), "收藏", "定位"];
    topicNav.innerHTML = topicsFound.map((topic) => `<button class="${topic === activeTopic ? "active" : ""}" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}${topic === "收藏" ? ` ${Object.keys(favorites).length}` : topic === "定位" && guides.length ? ` ${guides.length}` : ""}</button>`).join("");
    folderNav.hidden = activeTopic !== "收藏";
    folderNav.innerHTML = `<button class="${activeFolderId === null ? "active" : ""}" data-folder-filter="">全部收藏</button>` + Object.values(folders).map((folder) => {
      const count = (folder.items || []).filter((key) => favorites[key]).length;
      return `<button class="${activeFolderId === folder.id ? "active" : ""}" data-folder-filter="${escapeHtml(folder.id)}">📁 ${escapeHtml(folder.name)} <small>${count}</small></button>`;
    }).join("");
    favoriteTools.hidden = activeTopic !== "收藏";
    favoriteTools.querySelector('[data-action="select-all"]').hidden = activeTopic !== "收藏";
    const createFolderButton = favoriteTools.querySelector('[data-action="folder-create"]');
    createFolderButton.hidden = activeTopic !== "收藏";
    const exportAllButton = favoriteTools.querySelector('[data-action="export-all"]');
    exportAllButton.disabled = Object.keys(favorites).length === 0 && Object.keys(folders).length === 0;
    const deleteFolderButton = favoriteTools.querySelector('[data-action="folder-delete"]');
    deleteFolderButton.hidden = activeTopic !== "收藏" || activeFolderId === null;
    if (activeFolderId !== null) deleteFolderButton.dataset.folderId = activeFolderId;
    panel.classList.toggle("ogo-locating", activeTopic === "定位");
    if (activeTopic === "定位") { renderLocate(); return; }
    let items;
    let workGroups = null;
    if (activeTopic === "收藏") {
      const selectedFolder = activeFolderId ? folders[activeFolderId] : null;
      const keys = selectedFolder ? selectedFolder.items || [] : Object.keys(favorites);
      items = keys.map((key) => favorites[key]).filter(Boolean).map((favorite) => ({ ...favorite, workTitle: getStoredWorkTitle(favorite), saved: true }));
    } else items = records.filter((r) => activeTopic === "全部" || r.topic === activeTopic);
    if (query) items = items.filter((r) => r.text.toLowerCase().includes(query.toLowerCase()));
    if (flowerMin != null || flowerMax != null) items = items.filter((r) => r.flowers != null && (flowerMin == null || r.flowers >= flowerMin) && (flowerMax == null || r.flowers <= flowerMax));
    if (sortMode === "likes-desc") items = [...items].sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1));
    if (sortMode === "likes-asc") items = [...items].sort((a, b) => (a.likes ?? Number.MAX_SAFE_INTEGER) - (b.likes ?? Number.MAX_SAFE_INTEGER));
    if (activeTopic === "收藏") {
      workGroups = new Map();
      for (const favorite of items) {
        if (!workGroups.has(favorite.workTitle)) workGroups.set(favorite.workTitle, []);
        workGroups.get(favorite.workTitle).push(favorite);
      }
    }
    visibleFavoriteKeys = activeTopic === "收藏" ? items.map((favorite) => favorite.key).filter(Boolean) : [];
    const selectedVisibleCount = visibleFavoriteKeys.filter((key) => selectedFavorites.has(key)).length;
    createFolderButton.textContent = `新建文件夹（${selectedVisibleCount}）`;
    createFolderButton.disabled = selectedVisibleCount === 0;
    favoriteTools.querySelector('[data-action="export-selected"]').disabled = selectedVisibleCount === 0;
    visibleItems = activeTopic === "收藏" ? [] : items;
    const favAllButton = panel.querySelector('[data-action="fav-all"]');
    const unsavedCount = bulkApi.pickUnsaved(visibleItems, favorites, makeKey).length;
    favAllButton.textContent = `全部收藏（${unsavedCount}）`;
    favAllButton.hidden = activeTopic === "收藏";
    favAllButton.disabled = bulkScanRunning || unsavedCount === 0;
    panel.querySelector('[data-action="fav-undo"]').hidden = !lastBulkKeys || activeTopic === "收藏";
    const bulkButton = panel.querySelector('[data-action="scan-all-pages"]');
    bulkButton.textContent = bulkScanRunning ? "停止抓取" : "抓取全部页";
    panel.querySelector("[data-bulk-status]").textContent = bulkScanRunning ? bulkStatusMessage : "自动逐页收集评论，可随时停止";
    status.textContent = bulkScanRunning ? bulkStatusMessage : bulkStatusMessage || (activeTopic === "收藏"
      ? `${activeFolderId ? `文件夹：${folders[activeFolderId]?.name || "未命名"}` : "全部收藏"} · ${workGroups.size} 部作品 · ${items.length} 条评论`
      : `找到 ${records.length} 条疑似攻略评论 · 当前显示 ${items.length} 条`);
    const renderCard = (r) => {
      const key = r.key || makeKey(r.text);
      const isSaved = Boolean(favorites[key]);
      const jumpButton = r.node?.isConnected
        ? `<button data-jump="${r.index}">回到原评论 ↗</button>`
        : `<a class="ogo-origin" href="${escapeHtml(r.url || location.href)}" target="_blank" rel="noreferrer">打开作品页 ↗</a>`;
      const likeLabel = r.likes == null ? "赞数未知" : `赞 ${r.likes}`;
      const flowerLabel = r.flowers == null ? "花数未知" : `🌸 ${r.flowers}`;
      const selectFavorite = r.saved && activeTopic === "收藏" ? `<label class="ogo-select"><input type="checkbox" data-select-fav="${escapeHtml(key)}" ${selectedFavorites.has(key) ? "checked" : ""}/>选入文件夹</label>` : "";
      const exportOneButton = isSaved ? `<button data-export-favorite="${escapeHtml(key)}">导出</button>` : "";
      return `<article class="ogo-card"><div class="ogo-card-head"><span class="ogo-badge">${escapeHtml(r.topic || "已收藏")}</span><div class="ogo-actions">${selectFavorite}<span class="ogo-likes">${likeLabel} · ${flowerLabel}</span>${exportOneButton}<button data-locate-add="${escapeHtml(key)}" title="想要清晰的标题和分节，请导入 .md 文件。">加入定位</button>${jumpButton}<button class="ogo-fav ${isSaved ? "saved" : ""}" data-fav="${escapeHtml(key)}">${isSaved ? "★ 已收藏" : "☆ 收藏"}</button></div></div><p>${escapeHtml(r.text)}</p></article>`;
    };
    if (workGroups) {
      results.innerHTML = [...workGroups.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-CN")).map(([title, entries]) => {
        const url = entries[0]?.url || "";
        const totalForWork = Object.values(favorites).filter((favorite) => getFavoriteWorkTitle(favorite) === title).length;
        const expanded = expandedWorks.has(title);
        const countLabel = entries.length === totalForWork ? `${totalForWork} 条收藏` : `${entries.length}/${totalForWork} 条显示`;
        return `<section class="ogo-work-group"><div class="ogo-work-heading"><button class="ogo-work-toggle" data-toggle-work="${escapeHtml(title)}" aria-expanded="${expanded}"><span class="ogo-work-chevron">›</span><span>${escapeHtml(title)}</span><small>${countLabel}</small></button><div class="ogo-work-links"><button data-export-work="${escapeHtml(title)}">导出本作品</button>${url ? `<a class="ogo-work-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">打开作品 ↗</a>` : ""}</div></div><div class="ogo-work-content" ${expanded ? "" : "hidden"}>${entries.map(renderCard).join("")}</div></section>`;
      }).join("");
    } else {
      results.innerHTML = items.map(renderCard).join("");
    }
    if (!items.length) results.innerHTML = `<div class="ogo-empty">${activeTopic === "收藏" ? (activeFolderId ? "这个文件夹还没有评论。" : "还没有收藏。看到喜欢的攻略评论，点它旁边的“☆ 收藏”即可。") : records.length ? "没有符合搜索条件的评论。" : "还没找到攻略评论。先展开“全部互动”，再滚动加载评论后点重新扫描。"}</div>`;
  }

  // Single storage write; on failure the in-memory favorites roll back so the UI never shows unsaved stars.
  async function applyBulkFavorites(nextFavorites, keys, message, undoKeys) {
    const previous = favorites;
    favorites = nextFavorites;
    if (await trySaveFavorites()) {
      lastBulkKeys = undoKeys;
      bulkStatusMessage = message;
    } else {
      favorites = previous;
      bulkStatusMessage = "保存失败（可能超过存储空间），未做任何更改";
    }
    render();
  }

  function scan() {
    if (!consentGranted || bulkScanRunning || Date.now() < ignorePaginationMutationsUntil) return;
    bulkStatusMessage = "";
    lastBulkKeys = null;
    records = recordsOnCurrentPage();
    let migratedTitle = false;
    for (const favorite of Object.values(favorites)) {
      if (!favorite.workTitle && favorite.url?.split("#")[0] === location.href.split("#")[0]) {
        favorite.workTitle = getWorkTitle();
        migratedTitle = true;
      }
    }
    if (migratedTitle) saveFavorites();
    render();
  }

  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const showCollectedBulkRecords = (collected) => {
    records = [...collected.values()].map((record, index) => ({ ...record, index }));
  };
  async function scanAllPages() {
    if (bulkScanRunning) {
      bulkStopRequested = true;
      if (activeBulkCollected) showCollectedBulkRecords(activeBulkCollected);
      bulkStatusMessage = `正在停止…已收集 ${records.length} 条攻略评论`;
      render();
      return;
    }
    if (!consentGranted) return;
    const initialPager = getPagination();
    if (!initialPager?.current) {
      bulkStatusMessage = "没识别到评论分页。请先展开评论区，确认页码分页已显示后重试。";
      render();
      return;
    }
    bulkScanRunning = true;
    bulkStopRequested = false;
    clearTimeout(scanTimer);
    activeBulkCollected = new Map();
    bulkStatusMessage = "准备从第 1 页开始…";
    render();
    const collected = activeBulkCollected;
    let pagesRead = 0;
    let current = getPagination()?.current;
    const startingPage = current;
    try {
      // Start at page 1 even if the user launched the organizer from a later page.
      while (current > 1 && !bulkStopRequested) {
        const pager = getPagination();
        if (!pager?.previous) throw new Error(`无法从第 ${current} 页返回上一页。`);
        const oldUrl = location.href;
        pager.previous.click();
        const moved = await waitForPage(current - 1, oldUrl);
        if (!moved) throw new Error("翻页后未检测到页码变化；该作品的分页可能不是页面内切换。请手动切到第 1 页后重试。");
        current = moved.current;
        await pause(500);
      }
      while (!bulkStopRequested) {
        const pager = getPagination();
        current = pager?.current ?? current;
        if (current == null) throw new Error("无法识别当前评论页码，已停止抓取。");
        for (const record of recordsOnCurrentPage()) {
          const identity = `${record.author}|${record.flowerLine}|${record.postedAt}|${clean(record.text)}`;
          if (!collected.has(identity)) collected.set(identity, record);
        }
        showCollectedBulkRecords(collected);
        pagesRead++;
        bulkStatusMessage = `抓取中：第 ${current} 页${pager?.total ? ` / ${pager.total}` : ""}，已收集 ${collected.size} 条攻略评论`;
        render();
        if (!pager?.next) break;
        const oldUrl = location.href;
        const nextPage = current + 1;
        pager.next.click();
        const moved = await waitForPage(nextPage, oldUrl);
        if (!moved) {
          // Some pagers keep the final page button visible but disable the next arrow.
          const refreshed = getPagination();
          if (!refreshed?.next || refreshed.current === current) break;
          throw new Error("翻页没有成功，已保留目前已抓取的评论。");
        }
        await pause(650);
      }
      if (!bulkStopRequested && current !== startingPage) {
        bulkStatusMessage = `已读取 ${pagesRead} 页，正在返回原来的第 ${startingPage} 页…`;
        render();
        while (current > startingPage) {
          const pager = getPagination();
          if (!pager?.previous) break;
          const oldUrl = location.href;
          pager.previous.click();
          const moved = await waitForPage(current - 1, oldUrl);
          if (!moved) break;
          current = moved.current;
          await pause(300);
        }
      }
      showCollectedBulkRecords(collected);
      bulkStatusMessage = bulkStopRequested
        ? `已停止：读取 ${pagesRead} 页，收集到 ${records.length} 条攻略评论。`
        : `全部抓取完成：读取 ${pagesRead} 页，去重后共 ${records.length} 条攻略评论。`;
    } catch (error) {
      showCollectedBulkRecords(collected);
      bulkStatusMessage = `${error.message} 已读取 ${pagesRead} 页，保留 ${records.length} 条评论。`;
    } finally {
      showCollectedBulkRecords(collected);
      bulkScanRunning = false;
      bulkStopRequested = false;
      activeBulkCollected = null;
      clearTimeout(scanTimer);
      ignorePaginationMutationsUntil = Date.now() + 1800;
      render();
    }
  }

  launcher.addEventListener("click", () => {
    const toggle = () => panel.classList.toggle("open");
    if (!editing) toggle();
    else if (editDirty()) askLeave(toggle);
    else leaveEdit(toggle);
  });
  panel.addEventListener("click", async (event) => {
    const close = event.target.closest('[data-action="close"]');
    if (close) panel.classList.remove("open");
    if (event.target.closest('[data-action="accept-consent"]')) {
      chrome.storage.local.set({ ogoDataConsentV1: true }, () => {
        consentGranted = true;
        panel.classList.remove("ogo-needs-consent");
        consentScreen.hidden = true;
        scan();
      });
    }
    if (event.target.closest('[data-action="decline-consent"]')) panel.classList.remove("open");
    if (event.target.closest('[data-action="scan"]')) scan();
    if (event.target.closest('[data-action="scan-all-pages"]')) await scanAllPages();
    const topicButton = event.target.closest("[data-topic]");
    if (topicButton) {
      activeTopic = topicButton.dataset.topic;
      if (activeTopic !== "收藏") activeFolderId = null;
      render();
    }
    const folderFilter = event.target.closest("[data-folder-filter]");
    if (folderFilter) { activeFolderId = folderFilter.dataset.folderFilter || null; render(); }
    const workToggle = event.target.closest("[data-toggle-work]");
    if (workToggle) {
      const title = workToggle.dataset.toggleWork;
      if (expandedWorks.has(title)) expandedWorks.delete(title);
      else expandedWorks.add(title);
      render();
    }
    if (event.target.closest('[data-action="select-all"]')) {
      for (const key of visibleFavoriteKeys) selectedFavorites.add(key);
      render();
    }
    if (event.target.closest('[data-action="export-all"]')) {
      downloadCollection(Object.keys(favorites), "all", "全部收藏", true);
    }
    const exportOne = event.target.closest("[data-export-favorite]");
    if (exportOne) {
      const key = exportOne.dataset.exportFavorite;
      const favorite = favorites[key];
      if (favorite) downloadCollection([key], "favorite", `${getFavoriteWorkTitle(favorite)}-${favorite.author || "单条收藏"}`);
    }
    const exportWork = event.target.closest("[data-export-work]");
    if (exportWork) {
      const title = exportWork.dataset.exportWork;
      const keys = Object.entries(favorites).filter(([, favorite]) => getFavoriteWorkTitle(favorite) === title).map(([key]) => key);
      downloadCollection(keys, "work", title);
    }
    if (event.target.closest('[data-action="export-selected"]')) {
      const keys = visibleFavoriteKeys.filter((key) => selectedFavorites.has(key));
      downloadCollection(keys, "selected", "所选收藏");
    }
    if (event.target.closest('[data-action="choose-import"]')) importFileInput.click();
    if (event.target.closest('[data-action="close-import"]')) {
      importDialog.hidden = true;
      pendingImport = null;
    }
    if (event.target.closest('[data-action="confirm-import"]') && pendingImport) {
      const mergedFavorites = { ...favorites };
      for (const favorite of pendingImport.favorites) if (!Object.hasOwn(mergedFavorites, favorite.key)) mergedFavorites[favorite.key] = favorite;
      const mergedFolders = { ...folders };
      const importedFavoriteKeys = new Set(pendingImport.favorites.map((favorite) => favorite.key));
      for (const folder of pendingImport.folders) {
        const members = folder.items.filter((key) => Object.hasOwn(mergedFavorites, key));
        if (mergedFolders[folder.id]) {
          mergedFolders[folder.id] = { ...mergedFolders[folder.id], items: [...new Set([...(mergedFolders[folder.id].items || []), ...members])] };
        } else {
          mergedFolders[folder.id] = { ...folder, items: [...new Set(members.filter((key) => importedFavoriteKeys.has(key)))] };
        }
      }
      try {
        await new Promise((resolve, reject) => chrome.storage.local.set({ ogoFavorites: mergedFavorites, ogoFolders: mergedFolders }, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
        favorites = mergedFavorites;
        folders = mergedFolders;
        selectedFavorites.clear();
        activeTopic = "收藏";
        activeFolderId = null;
        importDialog.hidden = true;
        pendingImport = null;
        render();
      } catch (error) {
        importDialog.querySelector("[data-import-summary]").textContent = `导入失败：${error.message}`;
        importDialog.querySelector('[data-action="confirm-import"]').disabled = true;
      }
    }
    if (event.target.closest('[data-action="folder-create"]')) {
      folderDialog.hidden = false;
      folderDialog.querySelector("[data-folder-name]").focus();
    }
    if (event.target.closest('[data-action="close-folder"]')) folderDialog.hidden = true;
    if (event.target.closest('[data-action="confirm-folder"]')) {
      const nameInput = folderDialog.querySelector("[data-folder-name]");
      const name = nameInput.value.trim();
      const selectedKeys = visibleFavoriteKeys.filter((key) => selectedFavorites.has(key));
      if (!name || !selectedKeys.length) { nameInput.focus(); return; }
      const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      folders[id] = { id, name, items: selectedKeys, createdAt: Date.now() };
      selectedFavorites.clear();
      nameInput.value = "";
      folderDialog.hidden = true;
      await saveFolders();
      activeTopic = "收藏";
      activeFolderId = id;
      render();
    }
    if (event.target.closest('[data-action="folder-delete"]')) {
      const id = event.target.closest('[data-action="folder-delete"]').dataset.folderId;
      delete folders[id];
      await saveFolders();
      activeFolderId = null;
      render();
    }
    const selectCheckbox = event.target.closest("[data-select-fav]");
    if (selectCheckbox) {
      if (selectCheckbox.checked) selectedFavorites.add(selectCheckbox.dataset.selectFav);
      else selectedFavorites.delete(selectCheckbox.dataset.selectFav);
      render();
    }
    const favButton = event.target.closest("[data-fav]");
    if (favButton) {
      const key = favButton.dataset.fav;
      const record = records.find((r) => r.key === key);
      if (favorites[key]) {
        delete favorites[key]; selectedFavorites.delete(key);
        for (const folder of Object.values(folders)) folder.items = (folder.items || []).filter((itemKey) => itemKey !== key);
        await saveFolders();
      }
      else if (record) favorites[key] = bulkApi.toFavorite(key, record, Date.now());
      await saveFavorites();
      render();
    }
    if (event.target.closest('[data-action="fav-all"]') && !bulkScanRunning && activeTopic !== "收藏") {
      const { next, addedKeys } = bulkApi.mergeFavorites(favorites, bulkApi.pickUnsaved(visibleItems, favorites, makeKey), Date.now());
      if (addedKeys.length) await applyBulkFavorites(next, addedKeys, `已收藏 ${addedKeys.length} 条`, addedKeys);
    }
    if (event.target.closest('[data-action="fav-undo"]') && lastBulkKeys) {
      const keys = lastBulkKeys.filter((key) => favorites[key]);
      for (const key of keys) selectedFavorites.delete(key);
      await applyBulkFavorites(bulkApi.removeKeys(favorites, keys), keys, `已撤销 ${keys.length} 条收藏`, null);
    }
    const jump = event.target.closest("[data-jump]");
    if (jump) {
      const record = records.find((r) => r.index === Number(jump.dataset.jump));
      if (record?.node?.isConnected) {
        record.node.scrollIntoView({ behavior: "smooth", block: "center" });
        record.node.classList.add("ogo-highlight");
        setTimeout(() => record.node?.classList.remove("ogo-highlight"), 2200);
      }
    }
  });
  panel.querySelector("[data-search]").addEventListener("input", (event) => { query = event.target.value; render(); });
  panel.querySelector("[data-sort]").addEventListener("change", (event) => { sortMode = event.target.value; render(); });
  importFileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = validateImportBundle(JSON.parse(await file.text()));
      const newCount = parsed.favorites.filter((favorite) => !Object.hasOwn(favorites, favorite.key)).length;
      const duplicateCount = parsed.favorites.length - newCount + parsed.repeatedKeys;
      pendingImport = parsed;
      importDialog.querySelector("[data-import-summary]").textContent = `${file.name}：${newCount} 条新收藏、${duplicateCount} 条重复收藏、${parsed.folders.length} 个文件夹。合并导入会保留本机已有内容。`;
      importDialog.querySelector('[data-action="confirm-import"]').disabled = false;
    } catch (error) {
      pendingImport = null;
      importDialog.querySelector("[data-import-summary]").textContent = `无法导入：${error.message}。现有收藏未更改。`;
      importDialog.querySelector('[data-action="confirm-import"]').disabled = true;
    }
    importDialog.hidden = false;
    event.target.value = "";
  });
  panel.querySelector("[data-flower-min]").addEventListener("input", (event) => { flowerMin = event.target.value === "" ? null : Number(event.target.value); render(); });
  panel.querySelector("[data-flower-max]").addEventListener("input", (event) => { flowerMax = event.target.value === "" ? null : Number(event.target.value); render(); });
  panel.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="clear-flower-filter"]')) {
      flowerMin = null; flowerMax = null;
      panel.querySelector("[data-flower-min]").value = "";
      panel.querySelector("[data-flower-max]").value = "";
      render();
    }
  });
  const findGuide = (id) => guides.find((g) => g.id === id);
  const setEditStatus = (text) => {
    const el = editing?.status;
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  };
  const editDirty = () => Boolean(editing?.ta) && timeApi.normalizeNewlines(editing.ta.value) !== editing.saved;
  // Writes the textarea back into the guide (section edits only replace that section's range). On failure the guide is rolled back and the textarea keeps its text.
  async function persistEdit(e) {
    const g = findGuide(e.guideId);
    if (!g) return true;
    const value = timeApi.normalizeNewlines(e.ta.value);
    if (value === e.saved) return true;
    if (e.mode === "full" && !value.trim()) { setEditStatus("攻略不能为空，未保存；文字仍保留在框内。"); return false; }
    let next;
    try { next = timeApi.replaceRange(g.text, e.start, e.end, value); } catch { setEditStatus("找不到这一节在原文里的位置，未保存；文字仍保留在框内。"); return false; }
    if (next.length > 200000) { setEditStatus("攻略超过 20 万字，未保存；文字仍保留在框内。"); return false; }
    const previous = g.text;
    g.text = next;
    if (!(await saveLocate())) {
      g.text = previous;
      const reason = locateMessage;
      locateMessage = "";
      setEditStatus(`${reason || "保存失败"}。文字仍保留在框内，请先复制备份。`);
      return false;
    }
    e.end = e.start + value.length;
    e.saved = value;
    setEditStatus("");
    return true;
  }
  // Section indexes (secOpen / pinnedSection keys) shift when an edit adds, removes or retitles sections, so move them to where the same section now sits.
  function remapEditedKeys(g, e) {
    const map = e.mode === "full" ? e.oldSections.map(() => -1) : timeApi.remapSectionIndexes(e.oldSections, sectionsOf(g), { start: e.start, oldEnd: e.origEnd, newEnd: e.end });
    const prefix = `${g.id}:`;
    const moved = (key) => { const j = map[Number(key.slice(prefix.length))]; return j >= 0 ? `${prefix}${j}` : ""; };
    const opens = [...secOpen].filter(([key]) => key.startsWith(prefix));
    for (const [key] of opens) secOpen.delete(key);
    for (const [key, value] of opens) { const next = moved(key); if (next) secOpen.set(next, value); }
    if (pinnedSection.startsWith(prefix)) {
      const next = moved(pinnedSection);
      if (next !== pinnedSection) { pinnedSection = next; saveGameTime(); }
    }
  }
  // "保存": writes the text, leaves edit mode and re-renders (which also sends changed keywords to the game). Stays in edit mode if saving failed.
  // `then(changed)` runs after the edit state is cleared and before the re-render, so a click that was waiting for the edit to end still finds its target.
  async function saveEdit(then) {
    const e = editing;
    if (!e?.ta) return true;
    if (!(await (e.chain = e.chain.then(() => persistEdit(e)).catch(() => false)))) return false;
    const g = findGuide(e.guideId);
    const changed = e.saved !== e.original;
    if (g && changed) remapEditedKeys(g, e);
    editing = null;
    then?.(changed);
    render();
    return true;
  }
  // "取消": drops the textarea's text; the saved guide is untouched.
  function leaveEdit(then) {
    editing = null;
    then?.(false);
    render();
  }
  function askLeave(then) {
    const prompt = editing.ta.closest("[data-edit-box]").querySelector("[data-edit-prompt]");
    editing.pending = then;
    prompt.hidden = false;
    prompt.scrollIntoView({ block: "nearest" });
  }
  function beginEdit(g, mode, key, index) {
    if (editing) return;
    g.text = timeApi.normalizeNewlines(g.text);
    const sections = sectionsOf(g);
    let start = 0;
    let end = g.text.length;
    if (mode === "section") {
      const section = sections[index];
      if (!section || section.start == null) return;
      ({ start, end } = section);
      secOpen.set(key, true);
    } else expandedGuides.add(g.id);
    const original = g.text.slice(start, end);
    editing = { guideId: g.id, mode, key, start, end, origEnd: end, original, saved: original, oldSections: sections.map(({ start: s, end: e }) => ({ start: s, end: e })), ta: null, status: null, pending: null, chain: Promise.resolve(true) };
    render();
  }
  // Clicking anything outside the editor can't silently lose text: without changes the editor just closes, with changes the in-panel prompt asks first.
  // The click is then replayed (dropped if the sections it pointed at may have moved).
  panel.addEventListener("click", (event) => {
    if (!editing || event.target.closest("[data-edit-box]")) return;
    event.stopPropagation();
    event.preventDefault();
    const target = event.target;
    const replay = (changed) => { if (target.isConnected && !(changed && target.closest("[data-sec-key],[data-loc-edit],[data-loc-pin]"))) target.click(); };
    if (editDirty()) askLeave(replay);
    else leaveEdit(replay);
  }, true);
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape" && editing?.ta && event.target === editing.ta) event.stopPropagation(); });
  window.addEventListener("beforeunload", (event) => { if (editDirty()) { event.preventDefault(); event.returnValue = ""; } });
  results.addEventListener("scroll", () => { if (activeTopic === "定位" && Date.now() > ignoreScrollUntil) locateUserScrolled = true; });
  panel.addEventListener("change", async (event) => {
    const t = event.target;
    if (t.matches("[data-loc-follow]")) { followGame = t.checked; await saveLocate(); render(); }
    if (t.matches("[data-loc-toggle]")) { const g = findGuide(t.dataset.locToggle); if (g) { g.enabled = t.checked; locateMessage = ""; await saveLocate(); render(); } }
    if (t.matches("[data-loc-stage]")) { const g = findGuide(t.dataset.locStage); if (g) { g.stage = t.value; await saveLocate(); render(); } }
    if (t.matches("[data-loc-file]")) {
      const file = t.files?.[0];
      t.value = "";
      if (!file) return;
      if (file.size > 1000000) { locateMessage = "文件超过 1 MB，无法导入。"; render(); return; }
      let text;
      try { text = await file.text(); } catch { locateMessage = "无法读取这个文件。"; render(); return; }
      await addGuide(file.name.replace(/\.(?:md|txt|markdown)$/i, ""), text, "file", /\.(?:md|markdown)$/i.test(file.name) ? "md" : "text");
    }
  });
  panel.addEventListener("click", async (event) => {
    const target = event.target;
    const idOf = (attr) => target.closest(`[${attr}]`)?.getAttribute(attr);
    if (target.closest('[data-action="time-save"]')) {
      const monthInput = panel.querySelector("[data-time-month]");
      const yearInput = panel.querySelector("[data-time-year]");
      const month = Number(monthInput.value);
      const year = yearInput.value === "" ? null : Number(yearInput.value);
      if (monthInput.value === "" || !Number.isInteger(month) || month < 1 || month > 12 || (year != null && (!Number.isInteger(year) || year < 0 || year > 999))) { monthInput.focus(); return; }
      gameTimeManual = { year, month };
      followGame = false;
      previewOffset = 0;
      await saveGameTime();
      await saveLocate();
      render();
    }
    if (target.closest('[data-action="time-clear"]')) {
      gameTimeManual = null;
      followGame = true;
      previewOffset = 0;
      await saveGameTime();
      await saveLocate();
      render();
    }
    const fold = idOf("data-loc-fold");
    if (fold) {
      for (const el of results.querySelectorAll("[data-sec-key]")) secOpen.set(el.dataset.secKey, fold === "open");
      render();
    }
    if (target.closest("[data-loc-shift]")) {
      const delta = Number(idOf("data-loc-shift"));
      previewOffset = delta === 0 ? 0 : previewOffset + delta;
      render();
    }
    const pin = idOf("data-loc-pin");
    if (pin) {
      pinnedSection = pin === pinnedSection ? "" : pin;
      locateUserScrolled = false;
      await saveGameTime();
      render();
    }
    if (target.closest("[data-loc-jump]")) {
      locateUserScrolled = false;
      lastLocateKey = "";
      render();
    }
    if (target.closest("[data-loc-import]")) locateFileInput.click();
    if (target.closest("[data-loc-paste]")) { pasteDialog.hidden = false; pasteDialog.querySelector("[data-paste-name]").focus(); }
    if (target.closest('[data-action="close-paste"]')) pasteDialog.hidden = true;
    if (target.closest('[data-action="confirm-paste"]')) {
      const name = pasteDialog.querySelector("[data-paste-name]");
      const text = pasteDialog.querySelector("[data-paste-text]");
      if (!text.value.trim()) { text.focus(); return; }
      if (await addGuide(name.value || "粘贴的攻略", text.value, "paste")) { name.value = ""; text.value = ""; pasteDialog.hidden = true; }
    }
    const only = idOf("data-loc-only");
    if (only) { for (const g of guides) g.enabled = g.id === only; await saveLocate(); render(); }
    const edit = idOf("data-loc-edit");
    if (edit) {
      const g = findGuide(edit.split(":")[0]);
      if (g) beginEdit(g, "section", edit, Number(edit.split(":")[1]));
    }
    const editFull = idOf("data-loc-edit-full");
    if (editFull) { const g = findGuide(editFull); if (g) beginEdit(g, "full", "", 0); }
    if (target.closest("[data-edit-save]")) await saveEdit();
    if (target.closest("[data-edit-cancel]")) leaveEdit();
    if (target.closest("[data-edit-prompt-save]")) { const then = editing?.pending; await saveEdit(then); }
    if (target.closest("[data-edit-prompt-discard]")) leaveEdit(editing?.pending);
    if (target.closest("[data-edit-prompt-stay]") && editing) { editing.pending = null; editing.ta.closest("[data-edit-box]").querySelector("[data-edit-prompt]").hidden = true; editing.ta.focus(); }
    const exp = idOf("data-loc-export");
    if (exp) {
      const g = findGuide(exp);
      if (g) {
        downloadText(`${safeFilename(g.name)}.${isMd(g) ? "md" : "txt"}`, g.text, isMd(g) ? "text/markdown" : "text/plain");
        locateMessage = `已导出“${g.name}”。`;
        render();
      }
    }
    const view = idOf("data-loc-view");
    if (view) { if (expandedGuides.has(view)) expandedGuides.delete(view); else expandedGuides.add(view); render(); }
    const rename = idOf("data-loc-rename");
    if (rename) {
      const g = findGuide(rename);
      const name = g ? window.prompt("新的名称", g.name) : null;
      if (g && name && name.trim()) { g.name = name.trim().slice(0, 60); await saveLocate(); render(); }
    }
    const del = idOf("data-loc-delete");
    if (del) {
      const g = findGuide(del);
      if (g && window.confirm(`删除“${g.name}”？只删除定位用的这份副本，不影响收藏。`)) {
        guides = guides.filter((x) => x.id !== del);
        expandedGuides.delete(del);
        await saveLocate();
        render();
      }
    }
    const add = target.closest("[data-locate-add]");
    if (add) {
      const key = add.dataset.locateAdd;
      const record = records.find((r) => r.key === key) || favorites[key];
      if (record) {
        const label = `${record.author || "评论"} · ${record.text.replace(/\s+/g, " ").slice(0, 14)}`;
        await addGuide(label, record.text, "comment");
        status.textContent = locateMessage;
      }
    }
  });
  panel.addEventListener("toggle", (event) => {
    const el = event.target;
    if (el.matches?.("[data-sec-key]")) { if (el.open === (el.dataset.default === "1")) secOpen.delete(el.dataset.secKey); else secOpen.set(el.dataset.secKey, el.open); }
    else if (el.matches?.("[data-adjust]")) adjustOpen = el.open;
    else if (el.matches?.("[data-guides]")) guidesOpen = el.open;
    else if (el.matches?.("[data-general]")) generalOpen = el.open;
  }, true);
  window.addEventListener("message", acceptGameTimeMessage);
  setInterval(() => { if (activeTopic === "定位" && document.activeElement?.tagName !== "INPUT") render(); }, 60000);
  new MutationObserver(() => {
    if (!consentGranted || bulkScanRunning || Date.now() < ignorePaginationMutationsUntil) { clearTimeout(scanTimer); return; }
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 700);
  }).observe(document.body, { childList: true, subtree: true });
  chrome.storage.local.remove("ogoLocalAiConsentV1");
  Promise.all([loadFavorites(), loadGameTime()]).then(() => chrome.storage.local.get({ ogoDataConsentV1: false }, (data) => {
    consentGranted = data.ogoDataConsentV1 === true;
    if (consentGranted) scan();
    else {
      panel.classList.add("ogo-needs-consent");
      consentScreen.hidden = false;
      status.textContent = "首次使用前，请阅读并选择是否同意本地处理页面评论。";
      render();
    }
  }));
})();
