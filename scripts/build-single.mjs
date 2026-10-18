import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "Neeky.html");

function inlineCssUrls(css, baseDir) {
  return css.replace(/url\((?:["']?)([^"')]+)(?:["']?)\)/g, (full, rel) => {
    if (rel.startsWith("data:")) return full;
    const file = path.resolve(baseDir, rel);
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const mime = ext === ".woff2" ? "font/woff2" : "application/octet-stream";
    return `url("data:${mime};base64,${buf.toString("base64")}")`;
  });
}

export async function buildHtml() {
  const fonts = inlineCssUrls(fs.readFileSync(path.join(root, "fonts.css"), "utf8"), root);
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\s+$/, "");
  const icon = fs.readFileSync(path.join(root, "favicon.svg"));
  const iconHref = `data:image/svg+xml;base64,${icon.toString("base64")}`;
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["js/main.js"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    legalComments: "eof",
    charset: "utf8",
    target: "es2022",
    logLevel: "silent",
    sourcemap: false,
  });
  let js = result.outputFiles[0].text;
  if (!js.endsWith("\n")) js += "\n";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Neeky Home Designer</title>
    <meta name="description" content="Metric floor-plan studio. Draw in metres, snap to a grid, and extrude a 3D house. Offline single-file build." />
    <link rel="icon" type="image/svg+xml" href="${iconHref}" />
    <style>
${fonts}
${styles}
      html, body { margin: 0; height: 100%; background: #f3efe6; }
    </style>
  </head>
  <body>
    <div id="neeky-root"></div>
    <script type="module">
${js}</script>
  </body>
</html>
`;
}

const html = await buildHtml();
const check = process.argv.includes("--check");
if (check) {
  const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
  if (current !== html) {
    console.error("Neeky.html does not match the source. Run: npm run build");
    process.exit(1);
  }
  console.log("Neeky.html matches the source.");
} else {
  fs.writeFileSync(outPath, html);
  console.log(`Wrote ${outPath} (${html.length} bytes)`);
}
