// Barrido a 390 px: por cada ruta, si la página se sale por la derecha, qué
// elemento lo causa, y una captura de página entera.
//
//   node scripts/supabase-local/barrido.mjs <correo|-> <carpeta> <ruta> [<ruta>…]
//
// Necesita la web de arrancar.sh en marcha. @playwright/test se toma de
// apps/web, que es quien lo tiene instalado.
import { createRequire } from "node:module";
const { chromium } = createRequire(new URL("../../apps/web/package.json", import.meta.url))("@playwright/test");
const [email, out, ...routes] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
// Con "-" como correo no se entra: para las pantallas públicas (acceso,
// invitaciones, sesión caducada).
if (email !== "-") {
  await p.goto("http://localhost:3999/login"); await p.fill('input[type="email"]', email); await p.fill('input[type="password"]', "Cuotly-demo-2026");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }), p.click('button[type="submit"]')]);
}
for (const route of routes) {
  try {
    await p.goto("http://localhost:3999" + route, { waitUntil: "networkidle", timeout: 120000 });
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    const r = await p.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const culp = [];
      for (const el of document.querySelectorAll("main *, header *")) {
        const bx = el.getBoundingClientRect();
        if (bx.right > W + 2 && bx.width > 0) {
          const pa = el.parentElement?.getBoundingClientRect();
          if (!pa || pa.right <= W + 2) culp.push(`${el.tagName}.${String(el.className).slice(0, 90)} [${Math.round(bx.right)}] «${(el.textContent || "").trim().slice(0, 40)}»`);
        }
      }
      return { sw: document.documentElement.scrollWidth, culp: culp.slice(0, 4), title: document.querySelector("h1")?.textContent?.trim().slice(0, 50) };
    });
    const name = route.replace(/[^a-z0-9]+/gi, "_").slice(-80);
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    console.log((r.sw > 392 ? "ANCHO " + r.sw : "ok    ") + "  " + route + "  | " + (r.title ?? "") + (r.culp.length ? "\n        " + r.culp.join("\n        ") : ""));
  } catch (e) { console.log("FALLO  " + route + " " + String(e).slice(0, 120)); }
}
await b.close();
