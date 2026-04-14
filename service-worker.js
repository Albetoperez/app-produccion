self.addEventListener("install", () => {
  console.log("Service Worker instalado");
});

self.addEventListener("fetch", () => {
  // necesario para PWA básica
});