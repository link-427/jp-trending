import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 清理旧数据：删除超过 7 天且不在排行榜上的话题及其关联数据
export async function GET(request: Request) {
  // 简单鉴权
  const authHeader = request.headers.get("authorization");
  if (authHeader !== "Bearer " + process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const log: string[] = [];

  // 1. 删除 7 天前的互动历史记录
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count: historyDeleted, error: histErr } = await supabase
    .from("interaction_history")
    .delete({ count: "exact" })
    .lt("recorded_at", sevenDaysAgo);

  if (histErr) {
    log.push("清理互动历史失败: " + histErr.message);
  } else {
    log.push("清理互动历史: " + (historyDeleted || 0) + " 条");
  }

  // 2. 删除 7 天前且不在排行榜上的话题
  //    先找出需要删除的话题 ID
  const { data: staleTopics, error: staleErr } = await supabase
    .from("trending_topics")
    .select("id")
    .is("rank_overall", null)
    .lt("updated_at", sevenDaysAgo);

  if (staleErr) {
    log.push("查询过期话题失败: " + staleErr.message);
  } else if (staleTopics && staleTopics.length > 0) {
    const staleIds = staleTopics.map(t => t.id);

    // 删除关联帖子
    const { error: postErr } = await supabase
      .from("topic_posts")
      .delete()
      .in("topic_id", staleIds);
    if (postErr) log.push("清理关联帖子失败: " + postErr.message);

    // 删除关联互动历史
    const { error: histErr2 } = await supabase
      .from("interaction_history")
      .delete()
      .in("topic_id", staleIds);
    if (histErr2) log.push("清理关联互动历史失败: " + histErr2.message);

    // 删除话题
    const { error: topicErr } = await supabase
      .from("trending_topics")
      .delete()
      .in("id", staleIds);

    if (topicErr) {
      log.push("清理过期话题失败: " + topicErr.message);
    } else {
      log.push("清理过期话题: " + staleIds.length + " 个");
    }
  } else {
    log.push("没有需要清理的过期话题");
  }

  return NextResponse.json({ success: true, log });
}
