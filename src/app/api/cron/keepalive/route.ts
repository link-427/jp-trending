import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 每天 ping 一次 Supabase，防止免费版项目因不活跃被暂停
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== "Bearer " + process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count, error } = await supabase
    .from("trending_topics")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message });
  }

  return NextResponse.json({
    success: true,
    message: "Supabase 心跳正常，当前 " + (count || 0) + " 条话题",
    timestamp: new Date().toISOString(),
  });
}
