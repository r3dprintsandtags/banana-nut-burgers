import fs from "fs";

let html = fs.readFileSync("index.html", "utf8");

// 1) Replace hero background data-URI with shop storefront
html = html.replace(
  /\.hero\{position:relative;min-height:88vh;display:flex;align-items:flex-end;color:#fff;background:#06161f top center\/cover no-repeat url\(data:image\/jpeg;base64,[^)]+\)/,
  `.hero{position:relative;min-height:88vh;display:flex;align-items:flex-end;color:#fff;background:#06161f top center/cover no-repeat url(img/shop-front.jpg)`
);

// 2) Site-wide floating background + glass cards
const injectCss = `
body{background:#06161f url(img/deep-blue.jpg) center/cover fixed no-repeat}
body:before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background:linear-gradient(180deg,rgba(6,22,31,.55) 0%,rgba(6,22,31,.72) 45%,rgba(6,22,31,.88) 100%)}
.top,.wrap,section,.bar,footer,.hero{position:relative;z-index:1}
.card,.band,.sv,.cal{background:rgba(255,255,255,.88)!important;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.45)!important;box-shadow:0 12px 40px rgba(0,0,0,.18)}
@media (prefers-color-scheme:dark){
  .card,.band,.sv,.cal{background:rgba(13,38,52,.82)!important;border-color:rgba(255,255,255,.12)!important}
}
:root[data-theme="dark"] .card,:root[data-theme="dark"] .sv,:root[data-theme="dark"] .cal{background:rgba(13,38,52,.82)!important}
.bar{background:rgba(255,248,230,.9)!important;backdrop-filter:blur(12px)}
:root[data-theme="dark"] .bar,body:not([data-theme="light"]) .bar{background:rgba(6,22,31,.88)!important}
.mos img{box-shadow:0 8px 24px rgba(0,0,0,.25);border:2px solid rgba(255,255,255,.35)}
.hero:before{background:linear-gradient(180deg,rgba(3,20,30,.15) 10%,rgba(3,20,30,.55) 55%,rgba(3,20,30,.92) 100%)!important}
section h2,section .mut,.note{text-shadow:0 1px 8px rgba(0,0,0,.35)}
`;

if (!html.includes("img/deep-blue.jpg) center/cover fixed")) {
  html = html.replace("</style>", injectCss + "\n</style>");
}

// 3) Replace IMG object (service card photos)
html = html.replace(
  /const IMG=\{[\s\S]*?\};/,
  `const IMG={gear:"img/backroll.jpg",crew:"img/shop-flag.jpg",boat:"img/dive-boat.png",snork:"img/reef-swim.jpg",beach:"img/shop-beach.jpg",falls:"img/deep-blue.jpg"};`
);

// 4) Replace mosaic gallery — find .mos block and rebuild with new photos
const gallery = `<div class="mos">
<img class="w" src="img/shop-front.jpg" alt="Banana Nut Burgers Dive Shop">
<img src="img/dive-boat.png" alt="Dive boat">
<img src="img/reef-swim.jpg" alt="Reef swim">
<img src="img/backroll.jpg" alt="Giant stride entry">
<img src="img/shop-flag.jpg" alt="Dive shop on the beach">
<img src="img/shop-beach.jpg" alt="Beach dive shop">
<img src="img/deep-blue.jpg" alt="Underwater">
</div>`;

html = html.replace(/<div class="mos">[\s\S]*?<\/div>/, gallery);

fs.writeFileSync("index.html", html);
console.log("index.html updated, size MB:", (html.length / 1e6).toFixed(2));
