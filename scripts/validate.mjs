import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const fail = msg => { console.error("FAIL:", msg); process.exitCode = 1; };
const sha = file => crypto.createHash("sha256")
  .update(fs.readFileSync(path.join(root, file))).digest("hex");

const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
if (index.schemaVersion !== 1) fail("schemaVersion != 1");

for (const item of index.modules) {
  const mp = item.manifest.path;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, mp), "utf8"));

  if (item.manifest.sha256 !== sha(mp)) fail(`${item.id}: manifest hash`);
  if (manifest.contractVersion !== 1) fail(`${item.id}: contractVersion`);
  if (manifest.contentType !== "pageImages") fail(`${item.id}: contentType`);

  for (const key of ["entry", "icon"]) {
    if (!fs.existsSync(path.join(root, manifest[key].path))) fail(`${item.id}: ${key} missing`);
    else if (manifest[key].sha256 !== sha(manifest[key].path)) fail(`${item.id}: ${key} hash`);
  }

  const js = fs.readFileSync(path.join(root, manifest.entry.path), "utf8");
  for (const handler of ["searchResults","extractDetails","extractChapters","extractImages"]) {
    if (!js.includes(handler)) fail(`${item.id}: ${handler} missing`);
  }

  console.log("OK:", item.name);
}

if (!process.exitCode) console.log("OK: repositório base válido");
