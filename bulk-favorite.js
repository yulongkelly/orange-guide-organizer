(function (root) {
  // Pure helpers for "全部收藏": pick the visible records that are not favorites yet (one per key) and build the stored objects.
  function pickUnsaved(items, favorites, keyOf) {
    const seen = new Set();
    const picked = [];
    for (const record of items || []) {
      const key = record.key || keyOf(record.text);
      if (!key || seen.has(key) || Object.hasOwn(favorites, key)) continue;
      seen.add(key);
      picked.push({ key, record });
    }
    return picked;
  }

  // Same fields as the single-card star button.
  function toFavorite(key, r, savedAt) {
    return { key, text: r.text, author: r.author, flowerLine: r.flowerLine, postedAt: r.postedAt, topic: r.topic, likes: r.likes, flowers: r.flowers, url: r.url, workTitle: r.workTitle, savedAt };
  }

  // Returns a new favorites object plus the keys added; existing entries are never overwritten.
  function mergeFavorites(favorites, picked, savedAt) {
    const next = { ...favorites };
    const addedKeys = [];
    for (const { key, record } of picked) {
      if (Object.hasOwn(next, key)) continue;
      next[key] = toFavorite(key, record, savedAt);
      addedKeys.push(key);
    }
    return { next, addedKeys };
  }

  // Removes only the keys from one bulk add; anything else stays untouched.
  function removeKeys(favorites, keys) {
    const next = { ...favorites };
    for (const key of keys) delete next[key];
    return next;
  }

  const api = { pickUnsaved, toFavorite, mergeFavorites, removeKeys };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OgoBulkFavorite = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
