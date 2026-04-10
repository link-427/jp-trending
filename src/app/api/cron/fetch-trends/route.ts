import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";

export const maxDuration = 60;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== "Bearer " + cronSecret) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const result = await runPipeline();
    return NextResponse.json({
      data: result.success
        ? "抓取完成，共 " + result.count + " 条热点，耗时 " + (result.duration / 1000).toFixed(1) + "s"
        : "抓取失败，请查看日志",
      success: result.success,
      log: result.log,
    });
  } catch (error) {
    console.error("Cron job 执行失败:", error);
    return NextResponse.json({ error: "执行失败", detail: String(error) }, { status: 500 });
  }
}

export async function GET() {
  const { getPlatformStatus } = await import("@/lib/fetchers");
  const { isAIConfigured } = await import("@/lib/ai");
  return NextResponse.json({
    data: {
      platforms: getPlatformStatus(),
      ai: isAIConfigured() ? "gemini" : "not_configured",
    },
  });
}
