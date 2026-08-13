// ogp.png を生成するスクリプト（@napi-rs/canvas 使用）
// フォントは 'Hiragino Sans' を明示する。sans-serif だけだとフォールバック先に
// 一部の漢字（済・録・応・昼など）のグリフが無く、豆腐(□)になる。
// 使い方: cd /tmp/ogp_gen && npm install @napi-rs/canvas && node /path/to/generate-ogp.js
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const W = 1200, H = 630;
const OUT = path.resolve(__dirname, 'ogp.png');
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// 背景（フラット）
// 以前は3停のグラデーション＋半径300pxの光球を重ねていたが、どちらも情報を伝えていないため廃止。
// 伝える仕事はシフト表のモックアップに寄せる。
ctx.fillStyle = '#FFFFFF';
ctx.fillRect(0, 0, W, H);

// ロゴアイコン背景
ctx.fillStyle = '#f87036';
ctx.beginPath();
ctx.roundRect(72, 72, 56, 56, 14);
ctx.fill();

// ロゴテキスト
ctx.fillStyle = '#1A1A2E';
ctx.font = 'bold 38px "Hiragino Sans", sans-serif';
ctx.fillText('shifty', 144, 113);

// メインキャッチコピー
// 「シフト管理をもっとシンプルに」は何をする製品か言っていないため、動作が想像できる文に変える。
// 一語だけ色を変えるのは階層を色で作る手抜きなので、着色もやめる。
// サイズは実測で決めている。左カラムに使える幅は 624px（カード左端720 - 左余白72 - 余裕24）で、
// Hiragino Sans は字幅が広く 60px だと2行目が 679px となりカードに重なる。52px で 588px。
ctx.fillStyle = '#1A1A2E';
ctx.font = 'bold 52px "Hiragino Sans", sans-serif';
ctx.fillText('シフト希望を、', 72, 215);
ctx.fillText('URLを配るだけで集める', 72, 283);

// 説明文（26px では 614/624 と際どいため 24px）
ctx.fillStyle = '#374151';
ctx.font = '24px "Hiragino Sans", sans-serif';
ctx.fillText('スタッフはスマホで提出。店長はExcelで受け取る。', 72, 355);

// 特徴（同じ強さのバッジを4つ並べるとどれも読まれないため、中黒区切りのテキストにして3つに絞る）
// 「完全無料」の"完全"は情報を足していない。「スマホ対応」は2026年に主張することではない。
ctx.fillStyle = '#1A1A2E';
ctx.font = 'bold 22px "Hiragino Sans", sans-serif';
ctx.fillText('無料', 72, 500);
const freeW = ctx.measureText('無料').width;
ctx.fillStyle = '#9CA3AF';
ctx.font = '22px "Hiragino Sans", sans-serif';
ctx.fillText('・登録不要・Excel出力', 72 + freeW, 500);

// モックアップカード
const mx = 720, my = 80, mw = 400, mh = 420;
// 影はぼかし40pxがカード自体より大きく輪郭をぼかしていたため、要素より小さい影に落とす
ctx.shadowColor = 'rgba(0,0,0,0.10)';
ctx.shadowBlur = 14;
ctx.shadowOffsetY = 4;
ctx.fillStyle = 'white';
ctx.beginPath();
ctx.roundRect(mx, my, mw, mh, 12);
ctx.fill();
ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
// 白地に白カードなので輪郭を1本引く
ctx.strokeStyle = '#E5E7EB';
ctx.lineWidth = 1;
ctx.beginPath();
ctx.roundRect(mx, my, mw, mh, 12);
ctx.stroke();

// カードヘッダー
ctx.fillStyle = '#f87036';
ctx.beginPath();
ctx.roundRect(mx, my, mw, 56, [12, 12, 0, 0]);
ctx.fill();
ctx.fillStyle = 'white';
ctx.font = 'bold 17px "Hiragino Sans", sans-serif';
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
  ctx.font = '15px "Hiragino Sans", sans-serif';
  ctx.fillText(row.name, mx + 16, ry + 22);
  row.cells.forEach((cell, ci) => {
    const cx2 = mx + 120 + ci * 54;
    const col = colors[cell.c];
    ctx.fillStyle = col.bg;
    ctx.beginPath();
    ctx.roundRect(cx2, ry + 4, 46, 30, 6);
    ctx.fill();
    ctx.fillStyle = col.fg;
    ctx.font = 'bold 14px "Hiragino Sans", sans-serif';
    const tw = ctx.measureText(cell.t).width;
    ctx.fillText(cell.t, cx2 + (46 - tw) / 2, ry + 24);
  });
});

// カードフッター
ctx.fillStyle = '#F9FAFB';
ctx.beginPath();
ctx.roundRect(mx, my + mh - 56, mw, 56, [0, 0, 12, 12]);
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
ctx.font = 'bold 15px "Hiragino Sans", sans-serif';
ctx.fillText('Excelで出力', mx + 28, my + mh - 23);

// ドメイン
ctx.fillStyle = '#9CA3AF';
ctx.font = '20px "Hiragino Sans", sans-serif';
const domain = 'shiftyshifty.app';
ctx.fillText(domain, W - 72 - ctx.measureText(domain).width, H - 28);

const buf = canvas.toBuffer('image/png');
fs.writeFileSync(OUT, buf);
console.log(`生成完了: ${OUT} (${Math.round(buf.length / 1024)}KB)`);
