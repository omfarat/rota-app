import test from "node:test";
import assert from "node:assert/strict";
import { labelRelevance, scoreCandidate, wikidataTerms, plainCredit, RADIUS_M, LABEL_SCORE_MIN } from "./lib-images.mjs";

const rejects = (label, name) => labelRelevance(label, name) < LABEL_SCORE_MIN;

test("rejects a label that only names the town", () => {
  assert.equal(rejects("Burdur", "Burdur Kent Belleği Evi"), true);
  assert.equal(rejects("Eceabat", "Maydos Kilisetepe Höyüğü"), true);
  assert.equal(rejects("Ankara", "Kale Kapısı ve Saat Kulesi"), true);
});

test("rejects a single shared word between longer names", () => {
  assert.equal(rejects("Kale", "Kale Kapısı ve Saat Kulesi"), true);
});

test("accepts equal referents that differ by a suffix", () => {
  assert.equal(rejects("Büyük Saat", "Büyük Saat Kulesi"), false);
  assert.equal(rejects("Bitlis Kalesi", "Bitlis Kalesi"), false);
  assert.equal(rejects("Dicle Köprüsü", "On Gözlü Dicle Köprü"), false);
  assert.equal(rejects("Ahi Evran Zaviyesi", "Ahi Evran Külliyesi"), false);
  assert.equal(rejects("Yukarı Taş Han, Bolu", "Yukarı Taşhan"), false);
});

test("rejects a candidate too far from the POI", () => {
  const poi = { name: "Bitlis Kalesi", lat: 38.4, lon: 42.1 };
  const near = scoreCandidate({ label: "Bitlis Kalesi", lat: 38.401, lon: 42.1 }, poi);
  const far = scoreCandidate({ label: "Bitlis Kalesi", lat: 38.405, lon: 42.1 }, poi);
  assert.equal(near.ok, true);
  assert.equal(far.ok, false);
  assert.ok(far.dist > RADIUS_M);
});

test("requires both distance and label", () => {
  const poi = { name: "Burdur Kent Belleği Evi", lat: 37.72, lon: 30.29 };
  // Right next to the POI, wrong thing entirely.
  const wrongPlace = scoreCandidate({ label: "Burdur", lat: 37.721, lon: 30.291 }, poi);
  assert.equal(wrongPlace.ok, false);
  assert.ok(wrongPlace.dist <= RADIUS_M);
});

test("drops the type word first so the search still matches", () => {
  assert.equal(wikidataTerms("Büyük Saat Kulesi")[0], "Büyük Saat");
  assert.equal(wikidataTerms("Bitlis Kalesi")[0], "Bitlis");
  assert.equal(wikidataTerms("Büyük Saat Kulesi").length > 1, true);
});

test("plainCredit strips Commons author HTML to readable text", () => {
  assert.equal(plainCredit(null), null);
  assert.equal(plainCredit(""), null);
  assert.equal(
    plainCredit('<a href="https://commons.wikimedia.org/wiki/User:X">X</a>'),
    "X",
  );
  assert.equal(plainCredit("Anatolianpride"), "Anatolianpride");
  assert.ok((plainCredit("a".repeat(200))?.length ?? 0) <= 80);
});
