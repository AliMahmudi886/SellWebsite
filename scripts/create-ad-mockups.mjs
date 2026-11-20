import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const output = path.resolve("public/ads");
await fs.mkdir(output, { recursive: true });

const colors = { paper: "#fbfaf7", green: "#31594d", orange: "#d88158", ink: "#29352f", muted: "#7d827a", line: "#e9e7df", sage: "#e7ebe4", white: "#ffffff" };
const font = "Tahoma, Segoe UI, Arial, sans-serif";
const text = (x, y, value, size, fill = colors.ink, weight = 400, anchor = "start") => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" direction="rtl" unicode-bidi="plaintext">${value}</text>`;
const baseSvg = (width, height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="wash" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#edf1eb"/><stop offset="1" stop-color="#f7eee6"/></linearGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#29352f" flood-opacity=".14"/></filter></defs><rect width="100%" height="100%" fill="${colors.paper}"/>${content}</svg>`;

function desktopWindow(x, y, width, height, scale = 1) {
  const sx = width / 1000;
  const sy = height / 700;
  return `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" filter="url(#shadow)">
    <rect width="1000" height="700" rx="24" fill="${colors.white}" stroke="${colors.line}" stroke-width="2"/>
    <path d="M24 0h952a24 24 0 0 1 24 24v43H0V24A24 24 0 0 1 24 0" fill="#f2f1ed"/>
    <circle cx="34" cy="34" r="7" fill="#d88158"/><circle cx="58" cy="34" r="7" fill="#e3bd67"/><circle cx="82" cy="34" r="7" fill="#9eaf9d"/>
    <rect x="330" y="19" width="430" height="30" rx="15" fill="white" stroke="${colors.line}"/>
    ${text(740, 39, "خانه‌ی نارنج | فروشگاه آنلاین", 12, colors.muted, 500)}
    <rect x="0" y="67" width="1000" height="31" fill="${colors.green}"/>
    ${text(950, 87, "با عشق انتخاب و بسته‌بندی می‌شود · جزئیات ارسال پس از ثبت سفارش هماهنگ می‌شود", 10, "#f8f5ec", 500)}
    <rect x="0" y="98" width="1000" height="90" fill="${colors.white}"/>
    ${text(920, 151, "خانه", 13, colors.muted)}${text(815, 151, "دسته‌بندی‌ها", 13, colors.muted)}${text(680, 151, "فروشگاه", 13, colors.muted)}${text(575, 151, "داستان ما", 13, colors.muted)}${text(475, 151, "تماس", 13, colors.muted)}
    <text x="90" y="153" font-family="${font}" font-size="28" font-weight="800" fill="${colors.green}" direction="rtl">نارنج<tspan fill="${colors.orange}">.</tspan></text>
    <line x1="35" y1="188" x2="965" y2="188" stroke="${colors.line}"/>
    <rect x="0" y="189" width="1000" height="511" fill="${colors.paper}"/>
    <rect x="560" y="244" width="360" height="375" rx="16" fill="url(#wash)"/>
    <circle cx="740" cy="416" r="104" fill="#f8f4ec"/><circle cx="740" cy="416" r="72" fill="#e1e9df"/>
    <path d="M740 342v148M666 416h148M687 363l106 106M793 363 687 469" stroke="${colors.green}" stroke-opacity=".24" stroke-width="2"/>
    <circle cx="740" cy="416" r="12" fill="${colors.orange}"/>
    <rect x="585" y="576" width="311" height="1" fill="${colors.line}"/>
    ${text(888, 600, "خانه‌ی نارنج", 12, colors.green, 700)}
    ${text(500, 292, "انتخاب‌هایی برای خانه‌ی شما", 14, colors.orange, 700)}
    ${text(500, 357, "خانه را با چیزهای کوچک،", 30, colors.ink, 800)}
    ${text(500, 400, "دوست‌داشتنی‌تر کن.", 30, colors.ink, 800)}
    ${text(500, 453, "از اشیای دست‌ساز تا جزئیات روزمره؛", 15, colors.muted)}
    ${text(500, 479, "هر انتخاب با دقت برای خانه‌ی توست.", 15, colors.muted)}
    <rect x="350" y="511" width="150" height="48" rx="6" fill="${colors.green}"/>
    ${text(425, 541, "دیدن فروشگاه  ←", 14, "white", 700, "middle")}
  </g>`;
}

function phoneWindow(x, y, width, height) {
  const sx = width / 430;
  const sy = height / 850;
  return `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" filter="url(#shadow)">
    <rect width="430" height="850" rx="56" fill="#202925"/>
    <rect x="10" y="10" width="410" height="830" rx="48" fill="${colors.white}"/>
    <rect x="145" y="18" width="140" height="25" rx="13" fill="#202925"/>
    <rect x="10" y="58" width="410" height="30" fill="${colors.green}"/>
    ${text(395, 78, "با عشق بسته‌بندی می‌شود", 10, "#f8f5ec", 500)}
    <rect x="10" y="88" width="410" height="72" fill="${colors.white}"/>
    <text x="385" y="133" text-anchor="end" font-family="${font}" font-size="25" font-weight="800" fill="${colors.green}" direction="rtl">نارنج<tspan fill="${colors.orange}">.</tspan></text>
    <circle cx="60" cy="126" r="17" fill="${colors.paper}" stroke="${colors.line}"/><path d="M68 134l10 10M68 134a8 8 0 1 1 0-16 8 8 0 0 1 0 16" fill="none" stroke="${colors.green}" stroke-width="2"/>
    <line x1="25" y1="160" x2="405" y2="160" stroke="${colors.line}"/>
    <rect x="25" y="183" width="380" height="276" rx="16" fill="url(#wash)"/>
    <circle cx="215" cy="320" r="89" fill="#f8f4ec"/><circle cx="215" cy="320" r="60" fill="#e1e9df"/>
    <path d="M215 252v136M147 320h136M167 272l96 96M263 272l-96 96" stroke="${colors.green}" stroke-opacity=".24" stroke-width="2"/><circle cx="215" cy="320" r="11" fill="${colors.orange}"/>
    ${text(380, 500, "انتخاب‌هایی برای خانه‌ی شما", 11, colors.orange, 700)}
    ${text(380, 544, "خانه را با چیزهای", 23, colors.ink, 800)}
    ${text(380, 578, "کوچک، دوست‌داشتنی‌تر کن.", 23, colors.ink, 800)}
    ${text(380, 615, "جزئیات کوچک، حال خوبِ هر روز", 12, colors.muted)}
    <rect x="204" y="645" width="176" height="46" rx="6" fill="${colors.green}"/>
    ${text(292, 674, "دیدن فروشگاه  ←", 13, "white", 700, "middle")}
    <line x1="25" y1="718" x2="405" y2="718" stroke="${colors.line}"/>
    ${text(380, 751, "فروشگاه آنلاین خانه‌ی نارنج", 12, colors.ink, 700)}
    ${text(380, 778, "خانه · دسته‌بندی‌ها · داستان ما · تماس", 10, colors.muted)}
  </g>`;
}

const story = baseSvg(1080, 1920, `
  <circle cx="80" cy="190" r="210" fill="#e7ebe4"/><circle cx="1030" cy="1620" r="260" fill="#f4e8dd"/>
  <text x="970" y="130" text-anchor="end" font-family="${font}" font-size="34" font-weight="800" fill="${colors.green}" direction="rtl">نارنج<tspan fill="${colors.orange}">.</tspan></text>
  ${text(970, 220, "فروشگاه آنلاین خانه و زندگی", 18, colors.orange, 700)}
  ${text(970, 296, "جزئیات کوچک،", 48, colors.ink, 800)}
  ${text(970, 360, "حال خوبِ هر روز", 48, colors.ink, 800)}
  ${text(970, 420, "با خانه‌ی نارنج آشنا شو", 23, colors.muted, 500)}
  ${phoneWindow(325, 520, 430, 850)}
  <rect x="270" y="1435" width="540" height="72" rx="10" fill="${colors.green}"/>
  ${text(540, 1481, "فروشگاه را ببین  ←", 24, "white", 700, "middle")}
  ${text(540, 1585, "خانه‌ی نارنج  ·  جزئیات کوچک، حال خوبِ هر روز", 16, colors.muted, 500, "middle")}
  <circle cx="910" cy="1715" r="5" fill="${colors.orange}"/><circle cx="935" cy="1715" r="5" fill="${colors.green}"/><circle cx="960" cy="1715" r="5" fill="#b8c5b8"/>
`);

const square = baseSvg(1080, 1080, `
  <circle cx="1040" cy="70" r="185" fill="#e7ebe4"/>
  <text x="978" y="110" text-anchor="end" font-family="${font}" font-size="30" font-weight="800" fill="${colors.green}" direction="rtl">نارنج<tspan fill="${colors.orange}">.</tspan></text>
  ${text(978, 195, "فروشگاه آنلاین خانه و زندگی", 16, colors.orange, 700)}
  ${text(978, 256, "خانه را با", 38, colors.ink, 800)}
  ${text(978, 307, "جزئیات کوچک", 38, colors.ink, 800)}
  ${text(978, 358, "دوست‌داشتنی‌تر کن.", 38, colors.ink, 800)}
  ${text(978, 406, "با خانه‌ی نارنج آشنا شو", 18, colors.muted)}
  ${desktopWindow(72, 460, 936, 530)}
  ${text(540, 1030, "خانه‌ی نارنج  ·  جزئیات کوچک، حال خوبِ هر روز", 14, colors.muted, 500, "middle")}
`);

const landscape = baseSvg(1600, 1000, `
  <circle cx="120" cy="80" r="270" fill="#e7ebe4"/><circle cx="1550" cy="920" r="210" fill="#f4e8dd"/>
  <text x="800" y="83" text-anchor="middle" font-family="${font}" font-size="30" font-weight="800" fill="${colors.green}" direction="rtl">نارنج<tspan fill="${colors.orange}">.</tspan>　 فروشگاه آنلاین خانه و زندگی</text>
  ${text(800, 127, "جزئیات کوچک، حال خوبِ هر روز", 17, colors.muted, 500, "middle")}
  ${desktopWindow(230, 160, 1140, 798)}
`);

const images = [
  ["narenj-site-story", story],
  ["narenj-site-square", square],
  ["narenj-site-landscape", landscape],
];
for (const [name, svg] of images) {
  const svgPath = path.join(output, `${name}.svg`);
  const pngPath = path.join(output, `${name}.png`);
  await fs.writeFile(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  console.log(pngPath);
}
