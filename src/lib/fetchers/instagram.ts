import { PlatformFetcher, RawPost } from "./types";

// Instagram 日本热门内容
// 策略：搜索日本热门标签 → 获取标签下的热门帖子 + 最新帖子
// 使用 instagram-scraper-stable-api 的 hashtag 端点

const HOST = "instagram-scraper-stable-api.p.rapidapi.com";

// 搜索用的日语标签（覆盖多个热门分类）
const HASHTAGS = ["日本", "東京グルメ", "トレンド", "日本旅行", "コスメ", "日本ファッション"];

// 只保留 14 天内发布的帖子
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const instagramFetcher: PlatformFetcher = {
  name: "Instagram",
  isConfigured: () => !!process.env.INSTAGRAM_API_KEY,
  fetch: async (): Promise<RawPost[]> => {
    const apiKey = process.env.INSTAGRAM_API_KEY;
    if (!apiKey) { console.log("Instagram: 未配置 INSTAGRAM_API_KEY"); return []; }

    try {
      console.log("Instagram: 搜索日本热门标签...");
      const allPosts: RawPost[] = [];

      // 并行获取所有标签下的帖子
      const results = await Promise.allSettled(
        HASHTAGS.map((hashtag) => fetchHashtagPosts(apiKey, hashtag))
      );
      for (const result of results) {
        if (result.status === "fulfilled") allPosts.push(...result.value);
      }

      console.log("Instagram: 共获取 " + allPosts.length + " 条帖子");
      return allPosts;
    } catch (error) {
      console.error("Instagram 请求失败:", error);
      return [];
    }
  },
};

// 获取指定标签下的帖子（热门 + 最新）
async function fetchHashtagPosts(apiKey: string, hashtag: string): Promise<RawPost[]> {
  try {
    const url = "https://" + HOST + "/search_hashtag.php?hashtag=" + encodeURIComponent(hashtag);
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": HOST,
      },
    });

    if (!res.ok) {
      console.log("Instagram: #" + hashtag + " HTTP " + res.status);
      return [];
    }

    const data = await res.json();

    // 合并热门帖子和最新帖子
    const topEdges = data.top_posts?.edges || [];
    const recentEdges = data.posts?.edges || [];
    const allEdges = [...topEdges, ...recentEdges];

    const posts: RawPost[] = [];
    const now = Date.now();
    let skippedOld = 0;
    const seenIds = new Set<string>();

    for (const edge of allEdges) {
      const node = edge.node || edge;
      const id = String(node.id || node.shortcode || "");

      // 去重
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      // 过滤超过 14 天的旧帖子
      const takenAt = Number(node.taken_at_timestamp || 0);
      if (takenAt > 0 && (now - takenAt * 1000) > MAX_AGE_MS) {
        skippedOld++;
        continue;
      }

      // 提取文案
      const captionEdges = node.edge_media_to_caption?.edges;
      const text = captionEdges?.[0]?.node?.text || "";
      if (text.length < 2) continue;

      const likes = Number(node.edge_liked_by?.count || 0);
      const comments = Number(node.edge_media_to_comment?.count || 0);
      const shortcode = String(node.shortcode || "");
      const postUrl = shortcode ? "https://www.instagram.com/p/" + shortcode + "/" : "";
      const ownerId = String(node.owner?.id || "");

      posts.push({
        platform: "instagram",
        content: text.slice(0, 500),
        authorName: ownerId ? "ig_user_" + ownerId : "instagram",
        likes,
        reposts: 0,
        comments,
        views: likes,
        postUrl,
      });
    }

    console.log("Instagram: #" + hashtag + " => " + posts.length + " 条帖子" + (skippedOld > 0 ? "（过滤掉 " + skippedOld + " 条超过14天的）" : ""));
    return posts;
  } catch (error) {
    console.log("Instagram: 获取 #" + hashtag + " 失败: " + String(error).slice(0, 80));
    return [];
  }
}
