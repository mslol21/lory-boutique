const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const publicDir = path.join(__dirname, "../client/public");
const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest.webmanifest")));
assert.equal(manifest.display, "standalone");
assert.equal(manifest.scope, "/");
for (const size of ["192x192", "512x512"]) assert(manifest.icons.some(icon => icon.sizes.split(" ").includes(size)));
for (const icon of manifest.icons) assert(fs.existsSync(path.join(publicDir, icon.src)));
const handlers = {}, additions = [];
const cache = {
  addAll: async urls => additions.push(...urls),
  match: async () => ({ text: async () => '<link href="/assets/style.css"><script src="/assets/app.js"></script>' }),
};
vm.runInNewContext(fs.readFileSync(path.join(publicDir, "sw.js"), "utf8"), {
  self: { location: { origin: "https://loryboutique.vercel.app" }, addEventListener: (name, handler) => handlers[name] = handler },
  caches: { open: async () => cache }, URL,
});
for (const [pathname, method, authorized] of [
  ["/api/products", "GET", false], ["/api/sales/checkout", "POST", false],
  ["/uploads/customer-image.png", "GET", false], ["/assets/app.js", "GET", true],
]) {
  let intercepted = false;
  handlers.fetch({ request: { url: "https://loryboutique.vercel.app" + pathname, method, headers: { has: () => authorized } }, respondWith: () => intercepted = true });
  assert.equal(intercepted, false, "Dados comerciais não podem passar pelo cache");
}
(async () => {
  let installed;
  handlers.install({ waitUntil: promise => installed = promise });
  await installed;
  assert(additions.includes("/assets/app.js"));
  assert(additions.includes("/assets/style.css"));
  assert(!additions.some(url => url.startsWith("/api/")));
  console.log("PWA validado: ícones, manifesto, interface offline e exclusão de dados comerciais do cache.");
})().catch(error => { console.error(error); process.exitCode = 1; });
