import { fetchAllPlatforms, getPlatformStatus } from "./fetchers";
import { analyzeAndGroupPosts, enrichXTrends, isAIConfigured, setAILogger, ProcessedTopic } from "./ai";
import { supabase } from "./supabase";
import type { HeatTag, InteractionHistory } from "@/types";
import { calculateHotScore, sumInteractions, HotScoreResult } from "./services/hotScoreCalculator";

// 带热度评分的话题
interface ScoredTopic extends ProcessedTopic {
  hotScoreResult: HotScoreResult;
  existingId: number | null;
  firstSeenAt: Date;
}

// 最终写入数据库的条目
interface FinalItem extends ScoredTopic {
  rankOverall: number;
  rankCategory: number | null;
  heatTag: HeatTag;
}

// 完整数据处理流水线
export async function runPipeline() {
  const startTime = Date.now();
  const deadline = startTime + 55000;
  const log: string[] = [];
  const addLog = (msg: string) => { console.log(msg); log.push(msg); };

  setAILogger(addLog);
  addLog("===== 开始数据抓取流水线 =====");
  addLog("平台状态: " + JSON.stringify(getPlatformStatus()));
  addLog("AI 模块: " + (isAIConfigured() ? "已配置" : "未配置（降级模式）"));

  // 第 1 步：抓取帖子
  addLog("--- 第 1 步：抓取帖子数据 ---");
  const fetchResult = await fetchAllPlatforms();
  let rawPosts = fetchResult.posts;
  for (const fetchLog of fetchResult.logs) {
    addLog("  [抓取] " + fetchLog);
  }
  addLog("抓取阶段耗时: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");

  if (rawPosts.length === 0) {
    addLog("没有抓取到任何帖子，流水线结束");
    return { success: false, log, duration: Date.now() - startTime };
  }

  // 统计
  const platStats = new Map<string, { count: number; engagement: number }>();
  for (const post of rawPosts) {
    const s = platStats.get(post.platform) || { count: 0, engagement: 0 };
    s.count++;
    s.engagement += post.likes + post.reposts + post.comments + post.views;
    platStats.set(post.platform, s);
  }
  addLog("共抓取到 " + rawPosts.length + " 条帖子");
  for (const [p, s] of platStats) {
    addLog("  " + p + ": " + s.count + " 条帖子, 总互动量 " + s.engagement);
  }

  // 第 1.5 步：AI 解读 X 热搜关键词
  const xCount = rawPosts.filter(p => p.platform === "x").length;
  if (xCount > 0) {
    addLog("--- 第 1.5 步：AI 解读 X 热搜（" + xCount + " 个关键词）---");
    rawPosts = await enrichXTrends(rawPosts, deadline);
    const enriched = rawPosts.filter(p => p.platform === "x" && p.contentZh).length;
    addLog("X 热搜已解读: " + enriched + "/" + xCount);
    addLog("解读阶段耗时: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s (总)");
  }

  // 第 2 步：AI 归纳话题
  addLog("--- 第 2 步：AI 分析帖子内容 -> 归纳话题 ---");
  const topics = await analyzeAndGroupPosts(rawPosts, deadline);
  addLog("AI 处理完成，识别出 " + topics.length + " 个话题");
  addLog("AI阶段耗时: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s (总)");

  const catCount = new Map<string, number>();
  for (const t of topics) { catCount.set(t.category, (catCount.get(t.category) || 0) + 1); }
  addLog("分类分布: " + Array.from(catCount.entries()).map(([c, n]) => c + ":" + n).join(", "));

  // 第 3 步：计算热度评分（新算法）
  addLog("--- 第 3 步：计算热度评分（新算法）---");
  const scoredTopics = await scoreTopics(topics, addLog);

  // 第 4 步：排名
  addLog("--- 第 4 步：按热度排名 ---");
  scoredTopics.sort((a, b) => b.hotScoreResult.totalScore - a.hotScoreResult.totalScore);

  const top100 = scoredTopics.slice(0, 100).map((item, i) => ({
    ...item,
    rankOverall: i + 1,
    heatTag: getHeatTag(i + 1) as HeatTag,
    rankCategory: null as number | null,
  }));

  const categoryRanks = new Map<string, number>();
  const finalItems: FinalItem[] = top100.map((item) => {
    const catRank = (categoryRanks.get(item.category) || 0) + 1;
    categoryRanks.set(item.category, catRank);
    return { ...item, rankCategory: catRank <= 50 ? catRank : null };
  });

  addLog("总榜: " + finalItems.length + " 条");
  for (const item of finalItems.slice(0, 5)) {
    addLog("  #" + item.rankOverall + " " + item.titleZh + " [" + item.category + "] 热度:" + item.hotScoreResult.totalScore.toFixed(2));
  }

  // 第 5 步：写入数据库（upsert 模式）
  addLog("--- 第 5 步：写入数据库（upsert 模式）---");
  await upsertToDatabase(finalItems, addLog);
  addLog("数据库写入完成");

  const duration = Date.now() - startTime;
  addLog("===== 流水线完成，耗时 " + (duration / 1000).toFixed(1) + "s =====");
  return { success: true, log, count: finalItems.length, duration };
}

function getHeatTag(rank: number): HeatTag {
  if (rank <= 3) return "爆";
  if (rank <= 15) return "热";
  return "新";
}

// 批量查询已有话题 + 互动历史，在内存中计算评分（仅 2 次 DB 查询）
async function scoreTopics(
  topics: ProcessedTopic[],
  addLog: (msg: string) => void,
): Promise<ScoredTopic[]> {
  // 1. 批量查询已有话题（1 次查询）
  const titles = topics.map(t => t.titleZh);
  const { data: existingTopics } = await supabase
    .from("trending_topics")
    .select("id, title_zh, first_seen_at")
    .in("title_zh", titles);

  const existingMap = new Map<string, { id: number; first_seen_at: string }>();
  for (const t of (existingTopics || [])) {
    existingMap.set(t.title_zh, { id: t.id, first_seen_at: t.first_seen_at });
  }

  // 2. 批量查询互动历史（1 次查询）
  const existingIds = Array.from(existingMap.values()).map(t => t.id);
  const historyMap = new Map<number, InteractionHistory[]>();
  if (existingIds.length > 0) {
    const { data: allHistory } = await supabase
      .from("interaction_history")
      .select("*")
      .in("topic_id", existingIds)
      .order("recorded_at", { ascending: false });

    for (const h of ((allHistory || []) as InteractionHistory[])) {
      const list = historyMap.get(h.topic_id) || [];
      list.push(h);
      historyMap.set(h.topic_id, list);
    }
  }

  // 3. 在内存中计算评分（0 次 DB 查询）
  const scored: ScoredTopic[] = [];
  for (const topic of topics) {
    const existing = existingMap.get(topic.titleZh) || null;
    const history = existing ? (historyMap.get(existing.id) || []) : [];
    const firstSeenAt = existing?.first_seen_at
      ? new Date(existing.first_seen_at)
      : new Date();

    const scoreResult = calculateHotScore(
      topic.relatedPosts,
      topic.sources,
      firstSeenAt,
      history,
    );

    scored.push({
      ...topic,
      hotScoreResult: scoreResult,
      existingId: existing?.id || null,
      firstSeenAt,
    });
  }

  addLog("热度评分完成：" + scored.length + " 个话题");
  const newCount = scored.filter(t => !t.existingId).length;
  const existingCount = scored.filter(t => t.existingId).length;
  addLog("  新话题: " + newCount + " 个, 已有话题: " + existingCount + " 个");

  return scored;
}

// 批量写入数据库（优化：减少串行查询次数）
async function upsertToDatabase(items: FinalItem[], addLog: (msg: string) => void) {
  const now = new Date().toISOString();

  // 1. 清除所有当前排名
  const { error: clearErr } = await supabase
    .from("trending_topics")
    .update({ rank_overall: null, rank_category: null })
    .not("rank_overall", "is", null);
  if (clearErr) {
    addLog("清除旧排名失败: " + clearErr.message);
  }

  // 2. 分离已有话题和新话题
  const existingItems = items.filter(i => i.existingId);
  const newItems = items.filter(i => !i.existingId);

  // 3. 批量删除已有话题的旧帖子（1 次查询）
  if (existingItems.length > 0) {
    const existingIds = existingItems.map(i => i.existingId!);
    await supabase.from("topic_posts").delete().in("topic_id", existingIds);
  }

  // 4. 逐个更新已有话题（Supabase 不支持批量更新不同数据）
  const topicIdMap = new Map<string, number>();
  for (const item of existingItems) {
    const { error } = await supabase
      .from("trending_topics")
      .update({
        title_ja: item.titleJa,
        category: item.category,
        heat_score: item.hotScoreResult.totalScore,
        heat_tag: item.heatTag,
        sources: item.sources,
        summary_zh: item.summaryZh,
        rank_overall: item.rankOverall,
        rank_category: item.rankCategory,
        score_breakdown: item.hotScoreResult.breakdown,
        updated_at: now,
      })
      .eq("id", item.existingId!);

    if (error) {
      addLog("更新话题失败 #" + item.rankOverall + " [" + item.titleZh + "]: " + error.message);
    } else {
      topicIdMap.set(item.titleZh, item.existingId!);
    }
  }

  // 5. 逐条插入新话题（避免单条失败导致整批丢失）
  for (const item of newItems) {
    const { data: inserted, error } = await supabase
      .from("trending_topics")
      .insert({
        title_ja: item.titleJa,
        title_zh: item.titleZh,
        category: item.category,
        heat_score: item.hotScoreResult.totalScore,
        heat_tag: item.heatTag,
        sources: item.sources,
        summary_zh: item.summaryZh,
        rank_overall: item.rankOverall,
        rank_category: item.rankCategory,
        score_breakdown: item.hotScoreResult.breakdown,
        first_seen_at: item.firstSeenAt.toISOString(),
        updated_at: now,
      })
      .select("id, title_zh")
      .single();

    if (error) {
      addLog("插入话题失败 #" + item.rankOverall + " [" + item.titleZh.slice(0, 20) + "]: " + error.message);
    } else if (inserted) {
      topicIdMap.set(inserted.title_zh, inserted.id);
    }
  }

  // 6. 批量插入互动历史快照（1 次查询）
  const historyRows: Array<Record<string, unknown>> = [];
  for (const item of items) {
    const topicId = topicIdMap.get(item.titleZh);
    if (!topicId) continue;
    const interactions = sumInteractions(item.relatedPosts);
    historyRows.push({
      topic_id: topicId,
      recorded_at: now,
      likes: interactions.likes,
      shares: interactions.shares,
      comments: interactions.comments,
      views: interactions.views,
    });
  }
  if (historyRows.length > 0) {
    const { error: histErr } = await supabase.from("interaction_history").insert(historyRows);
    if (histErr) addLog("批量插入互动历史失败: " + histErr.message);
  }

  // 7. 批量插入所有关联帖子（1 次查询）
  const allPostRows: Array<Record<string, unknown>> = [];
  for (const item of items) {
    const topicId = topicIdMap.get(item.titleZh);
    if (!topicId) continue;

    const topPosts = [...item.relatedPosts]
      .sort((a, b) => (b.likes + b.reposts + b.comments + b.views) - (a.likes + a.reposts + a.comments + a.views))
      .slice(0, 5);

    if (topPosts.length > 0) {
      for (const p of topPosts) {
        allPostRows.push({
          topic_id: topicId,
          platform: p.platform,
          author_name: p.authorName || p.platform + "_user",
          content_ja: p.content.slice(0, 500),
          content_zh: p.contentZh || "",
          likes: p.likes,
          reposts: p.reposts,
          comments: p.comments,
          post_url: p.postUrl || "https://x.com/search?q=" + encodeURIComponent(p.content.slice(0, 30)),
          posted_at: now,
        });
      }
    } else {
      allPostRows.push({
        topic_id: topicId,
        platform: item.sources[0] || "yahoo",
        author_name: "search",
        content_ja: item.titleZh,
        content_zh: item.summaryZh || "",
        likes: 0,
        reposts: 0,
        comments: 0,
        post_url: "https://x.com/search?q=" + encodeURIComponent(item.titleZh),
        posted_at: now,
      });
    }
  }
  if (allPostRows.length > 0) {
    const { error: postErr } = await supabase.from("topic_posts").insert(allPostRows);
    if (postErr) addLog("批量插入帖子失败: " + postErr.message);
  }

  addLog("数据库写入：更新 " + existingItems.length + " 个, 新增 " + (topicIdMap.size - existingItems.length) + " 个");
}
