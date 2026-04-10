import { PlatformFetcher, RawPost, isJapaneseText } from "./types";

// Instagram 日本热门账号帖子（作为补充内容）
// 注意：这些不是"热搜"，而是日本热门账号的最新帖子
const JP_ACCOUNTS = [
  "tokyocameraclub",
  "retrip_gourmet",
  "tastemade_japan",
];

async function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const instagramFetcher: PlatformFetcher = {
  name: "Instagram",
  isConfigured: () => !!process.env.INSTAGRAM_API_KEY,
  fetch: async (): Promise<RawPost[]> => {
    const apiKey = process.env.INSTAGRAM_API_KEY;
    if (!apiKey) { console.log("Instagram: 未配置 INSTAGRAM_API_KEY"); return []; }

    const host = "instagram120.p.rapidapi.com";
    const url = "https://" + host + "/api/instagram/posts";

    const results = await Promise.allSettled(
      JP_ACCOUNTS.map(async (username) => {
        console.log("Instagram: 抓取 @" + username + "...");
        const res = await fetchWithTimeout(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RapidAPI-Key": apiKey,
            "X-RapidAPI-Host": host,
          },
          body: JSON.stringify({ username, maxId: "" }),
        }, 8000);
        console.log("Instagram @" + username + ": HTTP " + res.status);
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("Instagram @" + username + " 错误: " + errText.slice(0, 200));
          return [];
        }
        const rawText = await res.text();
        let data;
        try { data = JSON.parse(rawText); } catch {
          console.error("Instagram @" + username + ": 响应不是有效JSON:", rawText.slice(0, 200));
          return [];
        }
        const posts = parseInstagramResponse(data, username);
        console.log("Instagram @" + username + ": " + posts.length + " 条帖子");
        return posts;
      })
    );

    const allPosts: RawPost[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        allPosts.push(...result.value);
      } else {
        console.log("Instagram @" + JP_ACCOUNTS[i] + " 超时或失败: " + String(result.reason).slice(0, 100));
      }
    }
    console.log("Instagram: 共返回 " + allPosts.length + " 条帖子");
    return allPosts;
  },
};

function parseInstagramResponse(data: unknown, fallbackAuthor: string): RawPost[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  let edges: unknown[] = [];
  if (obj.result && typeof obj.result === "object") {
    const result = obj.result as Record<string, unknown>;
    if (Array.isArray(result.edges)) edges = result.edges;
  }
  if (edges.length === 0 && Array.isArray(obj.data)) edges = obj.data;
  if (edges.length === 0 && Array.isArray(obj.edges)) edges = obj.edges;
  if (edges.length === 0 && Array.isArray(obj.items)) edges = obj.items;

  if (edges.length === 0) {
    console.log("Instagram: 空数据, keys:", Object.keys(obj).join(","));
    return [];
  }

  const posts: RawPost[] = [];
  let skipped = 0;
  for (const edge of edges) {
    const edgeObj = (edge || {}) as Record<string, unknown>;
    const node = (edgeObj.node || edgeObj) as Record<string, unknown>;

    const caption = node.caption as Record<string, unknown> | string | null;
    let text = "";
    if (typeof caption === "string") text = caption;
    else if (caption && typeof caption === "object") text = String(caption.text || "");
    if (text.length < 2) continue;

    if (!isJapaneseText(text)) {
      skipped++;
      continue;
    }

    const user = (node.user || node.owner || {}) as Record<string, unknown>;
    const authorName = String(user.username || fallbackAuthor);
    const likes = Number(node.like_count || 0);
    const comments = Number(node.comment_count || 0);
    const views = Number(node.view_count || node.video_view_count || 0);
    const shortcode = String(node.code || node.shortcode || "");
    const postUrl = shortcode ? "https://www.instagram.com/p/" + shortcode + "/" : "";

    // Instagram 点赞/评论数较少，按比例放大以匹配其他平台的量级
    // Instagram 上 1000 赞约等于 Twitter 上 5 万讨论
    const engagementMultiplier = 50;

    posts.push({
      platform: "instagram",
      content: text.slice(0, 500),
      authorName,
      likes: likes * engagementMultiplier,
      reposts: 0,
      comments: comments * engagementMultiplier,
      views: views > 0 ? views : likes * engagementMultiplier,
      postUrl,
    });
  }
  if (skipped > 0) console.log("Instagram: 过滤掉 " + skipped + " 条非日语内容");
  return posts;
}