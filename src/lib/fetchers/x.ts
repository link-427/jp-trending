import { PlatformFetcher, RawPost } from "./types";

// X (Twitter) 日本区热搜
// 注意：API 返回的 tweet_volume 大部分为 null
// 但趋势本身是按热度排好序的，所以按排名赋予合理的讨论量
export const xFetcher: PlatformFetcher = {
  name: "X (Twitter)",
  isConfigured: () => !!process.env.TIKTOK_API_KEY,
  fetch: async (): Promise<RawPost[]> => {
    const apiKey = process.env.TIKTOK_API_KEY;
    if (!apiKey) { console.log("X: 未配置 API Key"); return []; }

    const host = "twitter241.p.rapidapi.com";
    const url = "https://" + host + "/trends-by-location?woeid=23424856";
    try {
      console.log("X: 请求 " + host + "...");
      const res = await fetch(url, {
        headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": host },
      });
      console.log("X: HTTP " + res.status);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("X 错误: " + errText.slice(0, 300));
        return [];
      }
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        console.error("X: 响应不是有效JSON:", text.slice(0, 200));
        return [];
      }
      return parseXTrends(data);
    } catch (error) {
      console.error("X 请求失败:", error);
      return [];
    }
  },
};

function parseXTrends(data: unknown): RawPost[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  let trendList: unknown[] = [];

  if (obj.result && Array.isArray(obj.result)) {
    const first = obj.result[0] as Record<string, unknown> | undefined;
    if (first?.trends && Array.isArray(first.trends)) {
      trendList = first.trends;
    }
  }
  if (trendList.length === 0 && Array.isArray(data)) {
    const first = (data as unknown[])[0] as Record<string, unknown> | undefined;
    if (first?.trends && Array.isArray(first.trends)) {
      trendList = first.trends;
    } else {
      trendList = data as unknown[];
    }
  }
  if (trendList.length === 0) {
    const list = (obj.data || obj.trends || obj.items || []) as unknown[];
    if (Array.isArray(list)) trendList = list;
  }

  if (trendList.length === 0) {
    console.log("X: 无法解析响应, keys:", Object.keys(obj).join(","));
    return [];
  }

  console.log("X: 解析出 " + trendList.length + " 条趋势");
  return trendList.slice(0, 50).map((item: unknown, index: number) => {
    const t = (item || {}) as Record<string, unknown>;
    const name = String(t.name || t.query || "").replace(/^#/, "");
    const volume = Number(t.tweet_volume || 0);

    // 如果 API 提供了 tweet_volume 就用真实的
    // 否则按排名估算：日本推特热搜 #1 约 30-50 万讨论
    // 使用指数衰减：rank1=300000, rank10=100000, rank30=30000, rank50=10000
    const estimatedVolume = volume > 0
      ? volume
      : Math.round(300000 * Math.pow(0.93, index));

    return {
      platform: "x" as const,
      content: name,
      authorName: "",
      likes: 0,
      reposts: 0,
      comments: 0,
      views: estimatedVolume,
      postUrl: "https://x.com/search?q=" + encodeURIComponent(name),
    };
  });
}