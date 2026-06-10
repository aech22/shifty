// ogp.png を生成するスクリプト（@napi-rs/canvas 使用）
// 使い方: cd /tmp/ogp_gen && npm install @napi-rs/canvas && node /path/to/generate-ogp.js
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const W = 1200, H = 630;
const OUT = path.resolve(__dirname, 'ogp.png');
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// 背景グラデーション
const grad = ctx.createLinearGradient(0, 0, W, H);
grad.addColorStop(0, '#fff7f3');
grad.addColorStop(0.5, '#fff0e8');
grad.addColorStop(1, '#fde8d8');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, W, H);

// 背景サークル（装飾）
const radGrad = ctx.createRadialGradient(1080, 80, 0, 1080, 80, 300);
radGrad.addColorStop(0, 'rgba(248,112,54,0.12)');
radGrad.addColorStop(1, 'rgba(248,112,54,0)');
ctx.fillStyle = radGrad;
ctx.beginPath();
ctx.arc(1080, 80, 300, 0, Math.PI * 2);
ctx.fill();

// ロゴアイコン背景
ctx.fillStyle = '#f87036';
ctx.beginPath();
ctx.roundRect(72, 72, 56, 56, 14);
ctx.fill();

// ロゴテキスト
ctx.fillStyle = '#1A1A2E';
ctx.font = 'bold 38px sans-serif';
ctx.fillText('shifty', 144, 113);

// メインキャッチコピー
ctx.fillStyle = '#1A1A2E';
ctx.font = 'bold 60px sans-serif';
ctx.fillText('シフト管理を', 72, 220);

ctx.fillStyle = '#f87036';
ctx.font = 'bold 60px sans-serif';
const accentText = 'もっとシンプル';
ctx.fillText(accentText, 72, 295);
ctx.fillStyle = '#1A1A2E';
ctx.fillText('に', 72 + ctx.measureText(accentText).width, 295);

// 説明文
ctx.fillStyle = '#374151';
ctx.font = '26px sans-serif';
ctx.fillText('スタッフはスマホで希望を提出。', 72, 370);
ctx.fillText('店長はExcelで一括管理。登録不要。', 72, 406);

// バッジ
const badges = [
  { text: '完全無料', filled: true },
  { text: '登録不要', filled: false },
  { text: 'Excel出力', filled: false },
  { text: 'スマホ対応', filled: false },
];
let bx = 72;
ctx.font = 'bold 20px sans-serif';
badges.forEach(b => {
  const tw = ctx.measureText(b.text).width;
  const bw = tw + 32, bh = 44;
  ctx.beginPath();
  ctx.roundRect(bx, 480, bw, bh, 22);
  if (b.filled) {
    ctx.fillStyle = '#f87036';
    ctx.fill();
    ctx.fillStyle = 'white';
  } else {
    ctx.strokeStyle = '#f87036';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f87036';
  }
  ctx.fillText(b.text, bx + 16, 509);
  bx += bw + 12;
});

// モックアップカード
const mx = 720, my = 80, mw = 400, mh = 420;
ctx.shadowColor = 'rgba(0,0,0,0.12)';
ctx.shadowBlur = 40;
ctx.shadowOffsetY = 10;
ctx.fillStyle = 'white';
ctx.beginPath();
ctx.roundRect(mx, my, mw, mh, 20);
ctx.fill();
ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

// カードヘッダー
ctx.fillStyle = '#f87036';
ctx.beginPath();
ctx.roundRect(mx, my, mw, 56, [20, 20, 0, 0]);
ctx.fill();
ctx.fillStyle = 'white';
ctx.font = 'bold 17px sans-serif';
ctx.fillText('6月シフト希望（7名提出済み）', mx + 16, my + 35);

// シフト行
const rows = [
  { name: '田中 さくら', cells: [{t:'朝',c:'morning'},{t:'昼',c:'lunch'},{t:'夜',c:'dinner'},{t:'朝',c:'morning'},{t:'休',c:'off'}] },
  { name: '鈴木 けんと', cells: [{t:'休',c:'off'},{t:'夜',c:'dinner'},{t:'夜',c:'dinner'},{t:'昼',c:'lunch'},{t:'夜',c:'dinner'}] },
  { name: '山本 あおい', cells: [{t:'昼',c:'lunch'},{t:'朝',c:'morning'},{t:'休',c:'off'},{t:'夜',c:'dinner'},{t:'昼',c:'lunch'}] },
  { name: '佐藤 ゆうき', cells: [{t:'夜',c:'dinner'},{t:'休',c:'off'},{t:'昼',c:'lunch'},{t:'朝',c:'morning'},{t:'休',c:'off'}] },
];
const colors = {
  morning: { bg: '#FEF3C7', fg: '#92400E' },
  lunch:   { bg: '#DBEAFE', fg: '#1D4ED8' },
  dinner:  { bg: '#D1FAE5', fg: '#065F46' },
  off:     { bg: '#F3F4F6', fg: '#9CA3AF' },
};
rows.forEach((row, ri) => {
  const ry = my + 70 + ri * 72;
  ctx.fillStyle = '#374151';
  ctx.font = '15px sans-serif';
  ctx.fillText(row.name, mx + 16, ry + 22);
  row.cells.forEach((cell, ci) => {
    const cx2 = mx + 120 + ci * 54;
    const col = colors[cell.c];
    ctx.fillStyle = col.bg;
    ctx.beginPath();
    ctx.roundRect(cx2, ry + 4, 46, 30, 6);
    ctx.fill();
    ctx.fillStyle = col.fg;
    ctx.font = 'bold 14px sans-serif';
    const tw = ctx.measureText(cell.t).width;
    ctx.fillText(cell.t, cx2 + (46 - tw) / 2, ry + 24);
  });
});

// カードフッター
ctx.fillStyle = '#F9FAFB';
ctx.beginPath();
ctx.roundRect(mx, my + mh - 56, mw, 56, [0, 0, 20, 20]);
ctx.fill();
ctx.strokeStyle = '#E5E7EB';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.moveTo(mx, my + mh - 56);
ctx.lineTo(mx + mw, my + mh - 56);
ctx.stroke();
ctx.fillStyle = '#1D6F42';
ctx.beginPath();
ctx.roundRect(mx + 16, my + mh - 44, 120, 32, 8);
ctx.fill();
ctx.fillStyle = 'white';
ctx.font = 'bold 15px sans-serif';
ctx.fillText('Excelで出力', mx + 28, my + mh - 23);

// ドメイン
ctx.fillStyle = '#9CA3AF';
ctx.font = '20px sans-serif';
const domain = 'shiftyshifty.app';
ctx.fillText(domain, W - 72 - ctx.measureText(domain).width, H - 28);

const buf = canvas.toBuffer('image/png');
fs.writeFileSync(OUT, buf);
console.log(`生成完了: ${OUT} (${Math.round(buf.length / 1024)}KB)`);
