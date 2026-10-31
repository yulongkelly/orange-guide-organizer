const test = require("node:test");
const assert = require("node:assert/strict");
const { pickUnsaved, toFavorite, mergeFavorites, removeKeys } = require("../bulk-favorite.js");

const keyOf = (text) => `k-${text}`;

test("pickUnsaved skips saved records and keeps order", () => {
  const items = [{ key: "a", text: "A" }, { key: "b", text: "B" }, { key: "c", text: "C" }];
  const picked = pickUnsaved(items, { b: { key: "b" } }, keyOf);
  assert.deepEqual(picked.map((p) => p.key), ["a", "c"]);
});

test("pickUnsaved counts duplicate keys once and falls back to keyOf", () => {
  const items = [{ key: "a", text: "A" }, { key: "a", text: "A2" }, { text: "X" }, { text: "X" }];
  const picked = pickUnsaved(items, {}, keyOf);
  assert.deepEqual(picked.map((p) => p.key), ["a", "k-X"]);
  assert.equal(picked[0].record.text, "A");
});

test("pickUnsaved ignores inherited keys and handles empty input", () => {
  assert.equal(pickUnsaved([{ key: "toString", text: "t" }], {}, keyOf).length, 1);
  assert.deepEqual(pickUnsaved(null, {}, keyOf), []);
});

test("toFavorite copies the same fields as the star button", () => {
  const r = { text: "t", author: "a", flowerLine: "f", postedAt: "p", topic: "x", likes: 1, flowers: 2, url: "u", workTitle: "w", extra: 1 };
  assert.deepEqual(toFavorite("k", r, 5), { key: "k", text: "t", author: "a", flowerLine: "f", postedAt: "p", topic: "x", likes: 1, flowers: 2, url: "u", workTitle: "w", savedAt: 5 });
});

test("mergeFavorites adds new entries without touching existing or the input", () => {
  const old = { b: { key: "b", text: "old", savedAt: 1 } };
  const picked = pickUnsaved([{ key: "a", text: "A", node: {} }, { key: "b", text: "B" }], {}, keyOf);
  const { next, addedKeys } = mergeFavorites(old, picked, 9);
  assert.deepEqual(addedKeys, ["a"]);
  assert.equal(next.b.text, "old");
  assert.equal(next.a.savedAt, 9);
  assert.equal("node" in next.a, false);
  assert.deepEqual(Object.keys(old), ["b"]);
});

test("removeKeys undoes only the given keys", () => {
  const favs = { a: { key: "a" }, b: { key: "b" }, c: { key: "c" } };
  assert.deepEqual(Object.keys(removeKeys(favs, ["a", "c", "zz"])), ["b"]);
  assert.equal(Object.keys(favs).length, 3);
});
