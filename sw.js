// Shifty の Service Worker（2026-10-08・通知専用）。
// 役目は2つだけ: Cloud Functions（functions/index.js の notify*）が送った Web Push を表示することと、押されたら開くこと。
// **ファイルのキャッシュはしない**（fetch を扱わない）。配信物は index.html の ?v= の版数で更新を管理しており、
// ここでキャッシュすると古い app-*.js が残る。登録は通知を有効にする操作のとき（app-my.js の pushSubscribe）だけ。
// index.html からは読み込まない（ブラウザが Service Worker として別に取得する）。
"use strict";

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });

// payload は {title, body, url, tag}（functions/notify.js が作る）
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  const title = typeof data.title === "string" && data.title ? data.title : "Shifty";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "favicon-180.png",
    badge: "favicon-180.png",
    tag: typeof data.tag === "string" && data.tag ? data.tag : undefined,
    data: { url: typeof data.url === "string" && data.url ? data.url : "./" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 押したら開く。同じ URL のタブ（ホーム画面のアプリ）が開いていればそこへ移り、無ければ新しく開く。
// 管理者の通知の開く先は #/admin（app-utils.js の isAdminRouteHash＝管理者画面から始まる）、スタッフは #/m/<token> か #/me。
// 開く先は同じサイト（scope の下）だけ＝他所のサイトへは飛ばさない
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "./";
  let target;
  try {
    const u = new URL(raw, self.registration.scope);
    target = u.origin === self.location.origin ? u.href : self.registration.scope;
  } catch (e) { target = self.registration.scope; }
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (c.url === target && "focus" in c) return c.focus();
    }
    // 開いている別の画面（入力途中かもしれない）は書き換えず、新しく開く
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return undefined;
  })());
});
