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
  const findComments = () => {
    const nodes = [...document.querySelectorAll(selectors)];
    const seen = new Set();
    const found = [];
    for (const node of nodes) {
      const raw = node.innerText || node.textContent || "";
      const text = formatCommentText(raw);
      if (text.length < 25 || text.length > 5000 || !guideSignal.test(text)) continue;
      const childMatch = [...node.children].some((child) => {
        const childText = clean(child.innerText || child.textContent);
        return childText.length >= 25 && childText.length <= text.length * 0.92 && guideSignal.test(childText);
      });
      if (childMatch) continue;
      const key = text.slice(0, 180);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ node, text, raw });
    }
    return found;
  };

  const panel = document.createElement("aside");
  panel.id = "ogo-panel";
  panel.innerHTML = `
    <header><div><strong>攻略整理器</strong><small>评论收藏保存在本机</small></div><button data-action="close" aria-label="关闭">×</button></header>
    <section class="ogo-consent" data-consent role="dialog" aria-labelledby="ogo-consent-title" aria-modal="true" hidden><h2 id="ogo-consent-title">使用前请了解数据处理方式</h2><p>整理攻略需要读取当前橙光作品页中已加载的评论文字，以及页面展示的作者、作品、日期、赞数和花数。数据只在本机浏览器中用于搜索、筛选、排序和定位。</p><p>只有点击“收藏”后，评论和相关信息才会保存到 Chrome 扩展本地存储；导出也只在你主动操作时生成文件。扩展不会上传评论、调用 AI 或读取登录凭据、Cookie。</p><p>你可以选择暂不使用。若之后要停止处理，可卸载扩展；卸载可能删除本机收藏，请先导出备份。<a href="https://www.66rpg.com/" target="_blank" rel="noreferrer">仅在橙光作品页运行</a></p><div class="ogo-consent-actions"><button data-action="decline-consent">暂不使用</button><button data-action="accept-consent">同意并开始</button></div></section>
    <div class="ogo-toolbar"><input data-search placeholder="搜攻略内容 / 角色名"/><select data-sort aria-label="排序方式"><option value="page">页面顺序</option><option value="likes-desc">赞数从高到低</option><option value="likes-asc">赞数从低到高</option></select><button data-action="scan">重新扫描</button></div>
    <div class="ogo-flower-filter"><span>总花数</span><input type="number" min="0" data-flower-min placeholder="最低" aria-label="最低总花数"/><span>至</span><input type="number" min="0" data-flower-max placeholder="最高" aria-label="最高总花数"/><button data-action="clear-flower-filter">清除</button></div>
    <nav data-topics></nav><div class="ogo-folder-nav" data-folder-nav hidden></div><div class="ogo-fav-tools" data-fav-tools hidden><button data-action="select-all">全选当前列表</button><button data-action="folder-create" disabled>新建文件夹（0）</button><button data-action="folder-delete" hidden>删除文件夹</button><button data-action="export-selected" disabled>导出所选</button><button data-action="export-all">导出全部</button><button data-action="choose-import">导入 JSON</button><input data-import-file type="file" accept=".json,application/json" hidden></div><div class="ogo-status" data-status>正在扫描页面…</div><main data-results></main>
    <section class="ogo-folder-dialog" data-folder-dialog hidden><div class="ogo-folder-head"><strong>新建文件夹</strong><button data-action="close-folder">×</button></div><p>选中的收藏会放进文件夹，每条评论仍单独保留。</p><input data-folder-name placeholder="文件夹名称，例如：灵兽收集攻略"/><div class="ogo-folder-actions"><button data-action="close-folder">取消</button><button data-action="confirm-folder">创建</button></div></section>
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
  let consentGranted = false;
  const status = panel.querySelector("[data-status]");
  const consentScreen = panel.querySelector("[data-consent]");
  const results = panel.querySelector("[data-results]");
  const topicNav = panel.querySelector("[data-topics]");
  const folderNav = panel.querySelector("[data-folder-nav]");
  const favoriteTools = panel.querySelector("[data-fav-tools]");
  const folderDialog = panel.querySelector("[data-folder-dialog]");
  const importDialog = panel.querySelector("[data-import-dialog]");
  const importFileInput = panel.querySelector("[data-import-file]");
  const loadFavorites = () => new Promise((resolve) => chrome.storage.local.get({ ogoFavorites: {}, ogoFolders: {} }, (data) => { favorites = data.ogoFavorites || {}; folders = data.ogoFolders || {}; resolve(); }));
  const saveFavorites = () => new Promise((resolve) => chrome.storage.local.set({ ogoFavorites: favorites }, resolve));
  const saveFolders = () => new Promise((resolve) => chrome.storage.local.set({ ogoFolders: folders }, resolve));

  function render() {
    const topicsFound = ["全部", ...new Set(records.map((r) => r.topic)), "收藏"];
    topicNav.innerHTML = topicsFound.map((topic) => `<button class="${topic === activeTopic ? "active" : ""}" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}${topic === "收藏" ? ` ${Object.keys(favorites).length}` : ""}</button>`).join("");
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
    status.textContent = activeTopic === "收藏"
      ? `${activeFolderId ? `文件夹：${folders[activeFolderId]?.name || "未命名"}` : "全部收藏"} · ${workGroups.size} 部作品 · ${items.length} 条评论`
      : `找到 ${records.length} 条疑似攻略评论 · 当前显示 ${items.length} 条`;
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
      return `<article class="ogo-card"><div class="ogo-card-head"><span class="ogo-badge">${escapeHtml(r.topic || "已收藏")}</span><div class="ogo-actions">${selectFavorite}<span class="ogo-likes">${likeLabel} · ${flowerLabel}</span>${exportOneButton}${jumpButton}<button class="ogo-fav ${isSaved ? "saved" : ""}" data-fav="${escapeHtml(key)}">${isSaved ? "★ 已收藏" : "☆ 收藏"}</button></div></div><p>${escapeHtml(r.text)}</p></article>`;
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

  function scan() {
    if (!consentGranted) return;
    records = findComments().map(({ node, text, raw }, index) => {
      const header = getHeader(raw, text);
      return { node, text, raw, index, ...header, topic: getTopic(text), likes: getLikes(node, raw), flowers: getFlowerCount(node), key: makeKey(text, raw), url: location.href.split("#")[0], workTitle: getWorkTitle() };
    });
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

  launcher.addEventListener("click", () => panel.classList.toggle("open"));
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
      else if (record) favorites[key] = { key, text: record.text, author: record.author, flowerLine: record.flowerLine, postedAt: record.postedAt, topic: record.topic, likes: record.likes, flowers: record.flowers, url: record.url, workTitle: record.workTitle, savedAt: Date.now() };
      await saveFavorites();
      render();
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
  new MutationObserver(() => { if (!consentGranted) return; clearTimeout(scanTimer); scanTimer = setTimeout(scan, 700); }).observe(document.body, { childList: true, subtree: true });
  loadFavorites().then(() => chrome.storage.local.get({ ogoDataConsentV1: false }, (data) => {
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
