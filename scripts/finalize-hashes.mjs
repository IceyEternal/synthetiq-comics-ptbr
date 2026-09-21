import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const indexPath = path.join(root, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

const sha256 = file =>
  crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");

for (const item of index.modules) {
  const manifestPath = item.manifest.path;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), "utf8"));

  manifest.entry.sha256 = sha256(manifest.entry.path);
  manifest.icon.sha256 = sha256(manifest.icon.path);

  fs.writeFileSync(
    path.join(root, manifestPath),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  item.version = manifest.version;
  item.name = manifest.name;
  item.language = manifest.language;
  item.contentType = manifest.contentType;
  item.contentRating = manifest.contentRating;
  item.releaseTrack = manifest.releaseTrack;
  item.status = manifest.status;
  item.icon = manifest.icon;
  item.manifest.sha256 = sha256(manifestPath);
}

index.generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
console.log("Hashes finalizados.");
