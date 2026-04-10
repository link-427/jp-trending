"use client";

import { useEffect } from "react";

// 注册 Service Worker（仅生产环境）
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 注册失败时静默处理
      });
    }
  }, []);

  return null;
}
