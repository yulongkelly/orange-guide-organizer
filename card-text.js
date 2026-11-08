(function (root) {
  // Pure helpers for the comment card: flower counts split into 鲜花 / 野花, and a display-only body without the header and footer lines.
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  // "name 561 259" (header label) -> { fresh: 561, wild: 259 }.
  function flowerPartsFromLabel(label) {
    const match = clean(label).match(/^([^\d\n]{1,32}?)\s+(\d{1,6})\s+(\d{1,6})$/);
    return match ? { fresh: Number(match[2]), wild: Number(match[3]) } : null;
  }

  // A line like "561 259" is fresh + wild; a single "561" counts as fresh with wild 0.
  function flowerPartsFromLine(line) {
    const text = clean(line);
    const pair = text.match(/^(\d{1,6})\s+(\d{1,6})$/);
    if (pair) return { fresh: Number(pair[1]), wild: Number(pair[2]) };
    return /^\d{1,6}$/.test(text) ? { fresh: Number(text), wild: 0 } : null;
  }

  // Scans the first few text lines (after the author line) the same way the page header is laid out.
  function flowerPartsFromLines(lines) {
    for (let i = 1; i < Math.min(lines.length, 5); i++) {
      const parts = flowerPartsFromLine(lines[i]);
      if (parts) return parts;
      if (/\d{4}-\d{2}-\d{2}/.test(lines[i])) break;
    }
    return null;
  }

  // Label for a record or stored favorite; old favorites without the split fields fall back to flowerLine, then to the total.
  function flowerLabel(r) {
    const num = (v) => typeof v === "number" && Number.isFinite(v);
    let parts = num(r.flowersFresh) && num(r.flowersWild) ? { fresh: r.flowersFresh, wild: r.flowersWild } : null;
    if (!parts && r.flowerLine) parts = flowerPartsFromLine(r.flowerLine);
    if (parts) return `🌸 鲜花 ${parts.fresh} · 野花 ${parts.wild}`;
    return r.flowers == null ? "花数未知" : `🌸 ${r.flowers}`;
  }

  // Display-only body: drops leading author / flower / date lines and trailing IP and share/report lines. r.text itself is never changed.
  function displayBody(r) {
    const original = String(r.text || "");
    const lines = original.replace(/\r/g, "").split("\n").map((line) => line.trim());
    const head = new Set([r.author, r.flowerLine, r.postedAt].filter(Boolean).map(clean));
    const isFooter = (line) => /^IP属地/.test(line) || /^(?:\d{1,6}\s+)?(?:分享|举报)(?:\s+(?:分享|举报))*$/.test(line);
    let start = 0;
    let end = lines.length;
    while (start < end && (lines[start] === "" || head.has(clean(lines[start])))) start++;
    while (end > start && (lines[end - 1] === "" || isFooter(lines[end - 1]))) end--;
    const body = lines.slice(start, end).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return body || original.trim();
  }

  const api = { flowerPartsFromLabel, flowerPartsFromLine, flowerPartsFromLines, flowerLabel, displayBody };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OgoCardText = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
