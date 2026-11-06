import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../public/brand/', import.meta.url)));
const svg = (f) => readFileSync(f, 'utf8').replace(/<\?xml[^>]*>\s*/, '');
const A = svg('isotipo-a-sede.svg'), B = svg('isotipo-b-238.svg'), C = svg('isotipo-c-sede-simple.svg');
const F = svg('favicon.svg'), M = svg('isotipo-mono.svg');
const H = svg('logo-horizontal.svg'), HD = svg('logo-horizontal-dark.svg'), S = svg('logo-stacked.svg');
const HC = svg('logo-horizontal-c.svg'), HDC = svg('logo-horizontal-dark-c.svg'), SC = svg('logo-stacked-c.svg'), MC = svg('isotipo-mono-c.svg');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Iglesia 238 · Identidad visual</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--primary:#1E5BFF;--primary-light:#2F7BFF;--primary-deep:#1436B4;--tint:#E8F0FF;--ink:#0B1B3F;--muted:#5B6B8C;--line:#E3E8F2;--bg:#F6F8FC;--card:#fff;--radius:16px}
  *{box-sizing:border-box}
  body{margin:0;font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
  .wrap{max-width:1120px;margin:0 auto;padding:40px 24px 80px}
  header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:36px}
  header h1{font-size:22px;margin:0;letter-spacing:-.4px}
  header p{margin:4px 0 0;color:var(--muted);font-size:14px}
  h2{font-size:14px;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted);margin:44px 0 16px;font-weight:700}
  .grid{display:grid;gap:16px}
  .g3{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
  .g2{grid-template-columns:repeat(auto-fit,minmax(340px,1fr))}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;position:relative}
  .card.dark{background:#0E1A3A;color:#fff;border-color:#1B2A55}
  .card.rec{border-color:var(--primary);box-shadow:0 0 0 3px rgba(30,91,255,.12)}
  .tag{position:absolute;top:14px;right:14px;background:var(--primary);color:#fff;font-size:11px;font-weight:700;letter-spacing:.6px;padding:4px 8px;border-radius:999px}
  .mark{display:flex;align-items:center;justify-content:center;min-height:180px}
  .mark svg{width:128px;height:128px;filter:drop-shadow(0 8px 20px rgba(20,54,180,.18))}
  .card h3{margin:14px 0 4px;font-size:16px}
  .card p{margin:0;font-size:13.5px;color:var(--muted);line-height:1.5}
  .card.dark p{color:#A9B6D6}
  .lock{display:flex;align-items:center;justify-content:center;min-height:120px}
  .lock svg{height:56px;width:auto}
  .lock.stack svg{height:150px}
  .lock.mono svg{height:72px;color:var(--ink)}
  .scale{display:flex;align-items:flex-end;gap:28px;flex-wrap:wrap}
  .scale figure{margin:0;text-align:center}
  .scale svg{display:block;width:100%;height:100%}
  .scale figcaption{font-size:11px;color:var(--muted);margin-top:8px}
  .ctx-top{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--line)}
  .ctx-top .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px;letter-spacing:-.4px}
  .ctx-top .brand svg{width:34px;height:34px}
  .ctx-top .brand b{color:var(--primary);font-weight:800}
  .ctx-top .btn{border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600}
  .ctx-body{padding:18px 20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .ctx-body div{height:52px;border-radius:10px;background:var(--tint)}
  .ctx-side{display:flex;gap:0;min-height:200px;overflow:hidden;padding:0}
  .ctx-side aside{width:84px;background:#0E1A3A;display:flex;flex-direction:column;align-items:center;padding:16px 0;gap:18px}
  .ctx-side aside svg{width:40px;height:40px}
  .ctx-side aside i{display:block;width:28px;height:28px;border-radius:8px;background:#1B2A55}
  .ctx-side main{flex:1;padding:18px}
  .ctx-side main span{display:block;height:12px;border-radius:6px;background:var(--line);margin-bottom:10px}
  .ctx-side main span:nth-child(1){width:40%;height:18px;background:#D6DEEE}
  .pal{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .sw{border-radius:12px;padding:14px;color:#fff;min-height:96px;display:flex;flex-direction:column;justify-content:flex-end;font-size:12px}
  .sw b{font-size:13px}
  .sw.light{color:var(--ink);border:1px solid var(--line)}
  .export{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  button{font:inherit;font-size:12px;font-weight:600;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:8px;padding:6px 10px;cursor:pointer}
  button:hover{border-color:var(--primary);color:var(--primary)}
  .card.dark button{background:#152450;color:#fff;border-color:#263870}
  .note{font-size:12.5px;color:var(--muted);margin-top:10px}
  code{font-size:12px;background:var(--tint);padding:2px 6px;border-radius:6px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Iglesia 238 · Identidad visual</h1>
      <p>Isotipo, logotipo y tokens de marca · v1 · ${new Date().toISOString().slice(0,10)}</p>
    </div>
    <div class="lock" style="min-height:0">${H}</div>
  </header>

  <h2>Concepto</h2>
  <div class="card">
    <p><strong>Casa-escudo.</strong> La silueta combina el tejado de una <em>sede</em> (la unidad central de la plataforma) con la forma de un escudo (protección de datos, Ley 1581). La puerta en arco habla de ingreso y membresía; la cruz, de la identidad de la iglesia. El “238” evoca Hechos 2:38 y se mantiene como acento azul en el logotipo. Tile con esquinas redondeadas para funcionar como ícono de app, favicon y avatar.</p>
  </div>

  <h2>Isotipo · variantes</h2>
  <div class="grid g3">
    <div class="card rec"><span class="tag">RECOMENDADA</span>
      <div class="mark" id="m-a">${A}</div>
      <h3>A · Sede</h3><p>Casa-escudo con puerta en arco y cruz. Legible desde 24 px; la versión favicon simplifica la cruz para 16 px.</p>
      <div class="export" data-src="m-a" data-name="iglesia238-isotipo-a"></div>
    </div>
    <div class="card">
      <div class="mark" id="m-b">${B}</div>
      <h3>B · 2:38</h3><p>Tejado como chevron sobre el número. Muy directa, pero depende de tipografía y pierde el “238” por debajo de 32 px.</p>
      <div class="export" data-src="m-b" data-name="iglesia238-isotipo-b"></div>
    </div>
    <div class="card">
      <div class="mark" id="m-c">${C}</div>
      <h3>C · Sede simple</h3><p>Misma casa-escudo con ventana en lugar de cruz. Opción neutra si la plataforma atenderá a otras denominaciones.</p>
      <div class="export" data-src="m-c" data-name="iglesia238-isotipo-c"></div>
    </div>
  </div>

  <h2>Logotipo · aplicaciones (set A)</h2>
  <div class="grid g2">
    <div class="card"><div class="lock" id="l-h">${H}</div><h3>Horizontal · fondo claro</h3><p>Cabecera de la app, documentos y correos.</p><div class="export" data-src="l-h" data-name="iglesia238-logo-horizontal" data-ratio="236x56"></div></div>
    <div class="card dark"><div class="lock" id="l-hd">${HD}</div><h3>Horizontal · fondo oscuro</h3><p>Sidebars, footers y pantallas de login oscuras.</p><div class="export" data-src="l-hd" data-name="iglesia238-logo-horizontal-dark" data-ratio="236x56"></div></div>
    <div class="card"><div class="lock stack" id="l-s">${S}</div><h3>Apilado</h3><p>Splash, pantalla de carga, impresos y redes.</p><div class="export" data-src="l-s" data-name="iglesia238-logo-apilado" data-ratio="180x150"></div></div>
    <div class="card"><div class="lock mono" id="l-m">${M}</div><h3>Mono · una tinta</h3><p>Sellos, marca de agua, impresión B/N. Usa <code>currentColor</code>.</p><div class="export" data-src="l-m" data-name="iglesia238-isotipo-mono"></div></div>
  </div>

  <h2>Logotipo · aplicaciones (set C)</h2>
  <div class="grid g2">
    <div class="card"><div class="lock" id="lc-h">${HC}</div><h3>Horizontal · fondo claro</h3><p>Cabecera de la app, documentos y correos.</p><div class="export" data-src="lc-h" data-name="iglesia238-c-logo-horizontal" data-ratio="236x56"></div></div>
    <div class="card dark"><div class="lock" id="lc-hd">${HDC}</div><h3>Horizontal · fondo oscuro</h3><p>Sidebars, footers y pantallas de login oscuras.</p><div class="export" data-src="lc-hd" data-name="iglesia238-c-logo-horizontal-dark" data-ratio="236x56"></div></div>
    <div class="card"><div class="lock stack" id="lc-s">${SC}</div><h3>Apilado</h3><p>Splash, pantalla de carga, impresos y redes.</p><div class="export" data-src="lc-s" data-name="iglesia238-c-logo-apilado" data-ratio="180x150"></div></div>
    <div class="card"><div class="lock mono" id="lc-m">${MC}</div><h3>Mono · una tinta</h3><p>Sellos, marca de agua, impresión B/N. Usa <code>currentColor</code>.</p><div class="export" data-src="lc-m" data-name="iglesia238-c-isotipo-mono"></div></div>
  </div>

  <h2>Escala y favicon</h2>
  <div class="card">
    <div class="scale">
      ${[16,24,32,48,64,96,128].map(s=>`<figure><div style="width:${s}px;height:${s}px">${s<=32?F:A}</div><figcaption>${s} px${s<=32?' · favicon':''}</figcaption></figure>`).join('')}
    </div>
    <p class="note">De 16 a 32 px se usa <code>favicon.svg</code> (sin cruz, puerta más ancha), común a los sets A y C. A partir de 48 px, el isotipo completo.</p>
    <div class="export" data-src="fav" data-name="iglesia238-favicon" data-sizes="16,32,48,180,192,512"><div id="fav" hidden>${F}</div></div>
  </div>

  <h2>En contexto</h2>
  <div class="grid g2">
    <div class="card" style="padding:0;overflow:hidden">
      <div class="ctx-top"><div class="brand">${A}<span>Iglesia <b>238</b></span></div><span class="btn">Ingresar</span></div>
      <div class="ctx-body"><div></div><div></div><div></div></div>
    </div>
    <div class="card ctx-side">
      <aside>${A}<i></i><i></i><i></i></aside>
      <main><span></span><span></span><span></span><span style="width:70%"></span></main>
    </div>
  </div>

  <h2>Paleta</h2>
  <div class="pal">
    <div class="sw" style="background:#1E5BFF"><b>Primary</b>#1E5BFF</div>
    <div class="sw" style="background:#2F7BFF"><b>Primary light</b>#2F7BFF</div>
    <div class="sw" style="background:#1436B4"><b>Primary deep</b>#1436B4</div>
    <div class="sw" style="background:#0B1B3F"><b>Ink</b>#0B1B3F</div>
    <div class="sw" style="background:#5B6B8C"><b>Ink muted</b>#5B6B8C</div>
    <div class="sw light" style="background:#E8F0FF"><b>Tint</b>#E8F0FF</div>
  </div>
  <p class="note">Tipografía del logotipo: Inter 700/800 (fallback Segoe UI). Para impresión, convertir el texto a trazados.</p>
</div>

<script>
// Exportación PNG: serializa el SVG incrustado y lo rasteriza en canvas con fondo transparente.
function exportPng(svgEl, name, w, h){
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], {type:'image/svg+xml;charset=utf-8'}));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const a = document.createElement('a'); a.download = name + '-' + w + 'x' + h + '.png'; a.href = c.toDataURL('image/png'); a.click();
  };
  img.src = url;
}
document.querySelectorAll('.export').forEach(box => {
  const svgEl = document.getElementById(box.dataset.src).querySelector('svg');
  const sizes = (box.dataset.sizes || '64,192,512,1024').split(',').map(Number);
  const [rw, rh] = (box.dataset.ratio || '1x1').split('x').map(Number);
  sizes.forEach(s => {
    const b = document.createElement('button');
    const w = Math.round(s * (rw >= rh ? 1 : rw / rh)), h = Math.round(s * (rh > rw ? 1 : rh / rw));
    b.textContent = 'PNG ' + w + '×' + h;
    b.onclick = () => exportPng(svgEl, box.dataset.name, w, h);
    box.appendChild(b);
  });
});
</script>
</body>
</html>`;
writeFileSync('preview.html', html);
console.log('preview.html', html.length, 'bytes');
