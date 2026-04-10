import { fetchAllPlatforms, getPlatformStatus } from "./fetchers";
import { analyzeAndGroupPosts, enrichXTrends, isAIConfigured, setAILogger } from "./ai";
import { supabase } from "./supabase";
import type { HeatTag } from "@/types";
import { RawPost } from "./fetchers/types";

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

  // 第 3 步：排名
  addLog("--- 第 3 步：按互动量排名 ---");
  const sorted = topics.sort((a, b) => b.heatScore - a.heatScore);
  const withRanks = sorted.slice(0, 100).map((item, i) => ({
    ...item,
    rankOverall: i + 1,
    heatTag: getHeatTag(i + 1),
  }));

  const categoryRanks = new Map<string, number>();
  const finalItems = withRanks.map((item) => {
    const catRank = (categoryRanks.get(item.category) || 0) + 1;
    categoryRanks.set(item.category, catRank);
    return { ...item, rankCategory: catRank <= 50 ? catRank : null };
  });

  addLog("总榜: " + finalItems.length + " 条");
  for (const item of finalItems.slice(0, 5)) {
    addLog("  #" + item.rankOverall + " " + item.titleZh + " [" + item.category + "] 互动:" + item.heatScore);
  }

  // 第 4 步：写入数据库
  addLog("--- 第 4 步：写入数据库 ---");
  await saveToDatabase(finalItems);
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

async function saveToDatabase(
  items: Array<{
    titleZh: string;
    category: string;
    summaryZh: string;
    sources: string[];
    heatScore: number;
    rankOverall: number;
    rankCategory: number | null;
    heatTag: HeatTag;
    relatedPosts: RawPost[];
  }>
) {
  await supabase.from("topic_posts").delete().neq("id", 0);
  await supabase.from("trending_topics").delete().neq("id", 0);

  const batchSize = 20;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const topicRows = batch.map((item) => ({
      title_ja: item.titleZh,
      title_zh: item.titleZh,
      category: item.category,
      heat_score: item.heatScore,
      heat_tag: item.heatTag,
      sources: item.sources,
      summary_zh: item.summaryZh,
      rank_overall: item.rankOverall,
      rank_category: item.rankCategory,
    }));

    const { data: inserted, error } = await supabase
      .from("trending_topics")
      .insert(topicRows)
      .select("id");

    if (error || !inserted) {
      console.error("批量插入热点失败:", error);
      continue;
    }

    const allPostRows: Array<Record<string, unknown>> = [];
    for (let j = 0; j < inserted.length; j++) {
      const topicId = inserted[j].id;
      const item = batch[j];
      const topPosts = item.relatedPosts
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
            posted_at: new Date().toISOString(),
          });
        }
      } else {
        const searchUrl = "https://x.com/search?q=" + encodeURIComponent(item.titleZh);
        allPostRows.push({
          topic_id: topicId,
          platform: item.sources[0] || "yahoo",
          author_name: "search",
          content_ja: item.titleZh,
          content_zh: item.summaryZh || "",
          likes: 0,
          reposts: 0,
          comments: 0,
          post_url: searchUrl,
          posted_at: new Date().toISOString(),
        });
      }
    }

    if (allPostRows.length > 0) {
      const { error: postErr } = await supabase.from("topic_posts").insert(allPostRows);
      if (postErr) console.error("批量插入帖子失败:", postErr);
    }
  }
}