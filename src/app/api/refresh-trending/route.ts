import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 60;

// 简单的速率限制：记录上次刷新时间
let lastRefreshTime = 0;
const MIN_INTERVAL = 30000; // 最少间隔 30 秒

export async function POST() {
  const now = Date.now();
  if (now - lastRefreshTime < MIN_INTERVAL) {
    const waitSec = Math.ceil((MIN_INTERVAL - (now - lastRefreshTime)) / 1000);
    return NextResponse.json(
      { error: "请求过于频繁，请 " + waitSec + " 秒后重试" },
      { status: 429 }
    );
  }

  lastRefreshTime = now;

  try {
    const result = await runPipeline();
    return NextResponse.json({
      success: result.success,
      data: result.success
        ? "刷新完成，共 " + result.count + " 条热点，耗时 " + ((result.duration || 0) / 1000).toFixed(1) + "s"
        : "刷新失败: " + (result.error || "未获取到数据"),
      error: result.success ? undefined : result.error,
    });
  } catch (error) {
    console.error("手动刷新失败:", error);
    return NextResponse.json(
      { error: "刷新失败: " + String(error) },
      { status: 500 }
    );
  }
}