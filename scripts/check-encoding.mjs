// Guards against the failure mode where a Turkish source file is rewritten with
// the wrong encoding: a dotless i silently expands into two latin-1 chars, so
// the string an assertion looks for stops matching and the check goes quiet.
// Run before every commit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src", "scripts"];
const EXT = /\.(ts|tsx|js|jsx|mjs|css|json|md)$/;

// Mojibake signatures, written as escapes so this file does not trip its own
// check. A lead byte only counts as corruption when the byte after it lands in
// the latin-1 supplement range, because that is where a UTF-8 continuation byte
// decodes. Real names such as "İskende-i Âlâ" keep a plain ASCII letter there.
const SIGNATURES = [
  ["utf8 okundu, latin1 yazildi", /Ã[\u0080-\u00bf]/g],
  ["utf8 okundu, latin1 yazildi", /Â[\u0080-\u00bf]/g],
  ["utf8 okundu, latin1 yazildi", /â€[\u0080-\u00bf]/g],
  ["utf8 okundu, latin1 yazildi", /Ä[\u0080-\u00bf]/g],
  ["utf8 okundu, latin1 yazildi", /Å[\u0080-\u00bf]/g],
  ["emoji bozuldu", /[\u0080-\u00bf]{2,}/g],
];

const files = [];
for (const root of ROOTS) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (EXT.test(entry)) files.push(full);
    }
  };
  walk(root);
}

let broken = 0;
let checkedTurkish = 0;

for (const file of files) {
  const buf = readFileSync(file);
  const hits = [];

  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) hits.push("BOM");
  const text = buf.toString("utf8");
  if (text.includes("\ufffd")) hits.push("gecersiz kod noktasi");
  if (!Buffer.from(text, "utf8").equals(buf)) hits.push("utf-8 round-trip basarisiz");

  for (const [name, re] of SIGNATURES) {
    const m = text.match(re);
    if (m) {
      const at = text.indexOf(m[0]);
      const ctx = text
        .slice(Math.max(0, at - 30), at + m[0].length + 30)
        .replace(/\s+/g, " ");
      hits.push(`${name} ("${m[0]}" @ ${ctx})`);
    }
  }

  if (/[şğüıöçŞĞÜİÖÇ]/.test(text)) checkedTurkish++;
  if (hits.length) {
    broken++;
    console.log(`BOZUK  ${relative(process.cwd(), file)}`);
    for (const h of hits) console.log(`         ${h}`);
  }
}

console.log(`dosya            : ${files.length}`);
console.log(`turkce iceren   : ${checkedTurkish}`);
console.log(`bozuk            : ${broken}`);
process.exit(broken ? 1 : 0);