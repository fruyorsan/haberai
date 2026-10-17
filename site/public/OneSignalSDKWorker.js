// OneSignal Web Push service worker — kök kapsamda (/) çalışır.
//
// Bu dosya sayesinde bildirimler site KAPALIYKEN de alınır: tarayıcı, OneSignal
// sunucusundan gelen bildirimi bu service worker üzerinden gösterir.
//
// GitHub Pages'te dosya /OneSignalSDKWorker.js adresinde yayınlanır
// (site/public → derleme kökü). OneSignal panelinde "Site URL" alanı
// https://haberinai.site olmalıdır.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
