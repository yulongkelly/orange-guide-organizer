(function (root) {
  // Tiny safe Markdown renderer for guide text (no DOM, no dependencies). Everything is escaped first and only a fixed set of
  // tags is produced; raw HTML, links and image syntax in the source are shown as plain text.
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SLOT = "(?:上午|下午|晚上|深夜|白天|清晨|中午|早上|夜间)";
  const SLOT_LEAD = new RegExp(`^(${SLOT}(?:[、，,和/]${SLOT})*)[：:]\\s*`);
  const AUTHOR_TAIL = /(（[^（）]{1,60}）)([。；;]?)\s*$/;
  const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  // Inline: escape, then **bold** and `code`. Presentation-only decorations wrap time-of-day leads and a trailing （author）.
  const inline = (raw, decorate) => {
    let text = String(raw);
    let lead = "";
    if (decorate) {
      const slot = text.match(SLOT_LEAD);
      if (slot) { lead = `<span class="ogo-md-slot">${escapeHtml(slot[1])}</span>`; text = text.slice(slot[0].length); }
    }
    let html = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    if (decorate) html = html.replace(AUTHOR_TAIL, (m, by, end) => `<span class="ogo-md-by">${by}</span>${end}`);
    return lead + html;
  };

  const splitRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  const isSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes("-");

  function renderMarkdown(input) {
    const lines = String(input || "").replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (heading) { out.push(`<h4 class="ogo-md-h ogo-md-h${heading[1].length}">${inline(heading[2], false)}</h4>`); i++; continue; }
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
        out.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
        continue;
      }
      if (line.includes("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
        const head = splitRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) { rows.push(splitRow(lines[i])); i++; }
        out.push(`<div class="ogo-md-tablewrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, false)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, false)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      if (LIST_ITEM.test(line)) {
        const stack = [];
        let html = "";
        while (i < lines.length) {
          const current = lines[i];
          const item = current.match(LIST_ITEM);
          if (!item) {
            // wrapped text belongs to the previous item; one blank line between items does not end the list
            if (!current.trim()) { const next = lines.slice(i + 1).find((l) => l.trim()); if (next && LIST_ITEM.test(next)) { i++; continue; } break; }
            if (/^\s+/.test(current)) { html += `<br>${inline(current.trim(), false)}`; i++; continue; }
            break;
          }
          const indent = item[1].replace(/\t/g, "    ").length;
          const tag = /\d/.test(item[2]) ? "ol" : "ul";
          while (stack.length && indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
          if (!stack.length || indent > stack[stack.length - 1].indent) { html += `<${tag}>`; stack.push({ indent, tag }); }
          else {
            html += "</li>";
            const top = stack[stack.length - 1];
            if (top.tag !== tag) { html += `</${top.tag}><${tag}>`; top.tag = tag; }
          }
          html += `<li>${inline(item[3], true)}`;
          i++;
        }
        while (stack.length) html += `</li></${stack.pop().tag}>`;
        out.push(html);
        continue;
      }
      const paragraph = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !LIST_ITEM.test(lines[i]) && !/^\s*>/.test(lines[i])) { paragraph.push(lines[i].trim()); i++; }
      if (!paragraph.length) { paragraph.push(line.trim()); i++; }
      out.push(`<p>${paragraph.map((l) => inline(l, true)).join("<br>")}</p>`);
    }
    return out.join("");
  }

  // One short line for a collapsed card: first content line without heading marks, list markers or author tail.
  function summarizeMarkdown(input, max = 36) {
    const cut = (text) => (text.length > max ? `${text.slice(0, max)}…` : text);
    let lead = "";
    for (const raw of String(input || "").split(/\r\n?|\n/)) {
      const line = raw.trim();
      if (!line || /^#{1,6}\s/.test(line) || /^(?:-{3,}|\*{3,})$/.test(line)) continue;
      const plain = line.replace(/^(?:[-*+]|\d+[.)]|>)\s*/, "").replace(/\*\*|`/g, "").replace(AUTHOR_TAIL, "").trim();
      if (!plain) continue;
      if (/[：:]$/.test(plain)) { lead += plain; continue; }
      return cut(lead + plain);
    }
    return cut(lead);
  }

  // Plain text (comments, pasted text): only paragraphs and line breaks, no symbol is interpreted as structure.
  function renderPlain(input) {
    return String(input || "").replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean)).filter((lines) => lines.length)
      .map((lines) => `<p>${lines.map(escapeHtml).join("<br>")}</p>`).join("");
  }
  function summarizePlain(input, max = 36) {
    const first = String(input || "").split(/\r\n?|\n/).map((l) => l.trim()).find(Boolean) || "";
    return first.length > max ? `${first.slice(0, max)}…` : first;
  }

  const api = { renderMarkdown, summarizeMarkdown, renderPlain, summarizePlain };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OgoMarkdown = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
