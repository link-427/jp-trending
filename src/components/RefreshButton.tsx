"use client";

import { useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";

interface RefreshButtonProps {
  onRefreshComplete?: () => void;
}

export default function RefreshButton({ onRefreshComplete }: RefreshButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleRefresh = useCallback(async () => {
    if (isLoading || cooldown > 0) return;

    setIsLoading(true);

    try {
      const response = await fetch("/api/refresh-trending", {
        method: "POST",
      });

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error("服务器返回非JSON响应");
      }

      if (!response.ok) {
        throw new Error(data.error || "刷新失败");
      }

      // 刷新成功，通知父组件重新加载数据
      onRefreshComplete?.();

      // 5秒冷却
      setCooldown(5);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "未知错误";
      console.error("刷新失败:", msg);
      alert("刷新失败: " + msg);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, cooldown, onRefreshComplete]);

  const disabled = isLoading || cooldown > 0;

  return (
    <button
      onClick={handleRefresh}
      disabled={disabled}
      className={[
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
        disabled
          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
          : "bg-red-50 text-red-500 hover:bg-red-500 hover:text-white active:scale-95",
      ].join(" ")}
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
      <span>
        {isLoading ? "刷新中..." : cooldown > 0 ? cooldown + "s" : "刷新"}
      </span>
    </button>
  );
}