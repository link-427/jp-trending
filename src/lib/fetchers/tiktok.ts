import { PlatformFetcher, RawPost } from "./types";

// 判断文本是否与日本相关（平假名、片假名或 CJK 汉字）
function isJapaneseRelated(text: string): boolean {
  const jpChars = text.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
  if (jpChars && jpChars.length >= 2) return true;
  // 含有日语常见标签也算
  if (/日本|東京|大阪|#jp|#japan/i.test(text)) return true;
  return false;
}

// TikTok 日本区热门视频
export const tiktokFetcher: PlatformFetcher = {
  name: "TikTok",
  isConfigured: () => !!process.env.TIKTOK_API_KEY,
  fetch: async (): Promise<RawPost[]> => {
    const apiKey = process.env.TIKTOK_API_KEY;
    if (!apiKey) { console.log("TikTok: 未配置 TIKTOK_API_KEY"); return []; }

    const host = "tiktok-scraper7.p.rapidapi.com";
    // 请求更多视频以提高日语命中率
    const url = "https://" + host + "/feed/list?region=JP&count=50";
    try {
      console.log("TikTok: 请求 " + host + "...");
      const res = await fetch(url, {
        headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": host },
      });
      console.log("TikTok: HTTP " + res.status);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("TikTok 错误: " + errText.slice(0, 300));
        return [];
      }
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        console.error("TikTok: 响应不是有效JSON:", text.slice(0, 200));
        return [];
      }
      console.log("TikTok code:" + data.code + " msg:" + data.msg);
      return parseTikTokVideos(data);
    } catch (error) {
      console.error("TikTok 请求失败:", error);
      return [];
    }
  },
};

function parseTikTokVideos(data: unknown): RawPost[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  let videoList: unknown[] = [];
  if (Array.isArray(obj.data)) videoList = obj.data;
  else if (obj.data && typeof obj.data === "object") {
    const d = obj.data as Record<string, unknown>;
    videoList = (d.items || d.videos || d.aweme_list || []) as unknown[];
  }
  if (videoList.length === 0 && Array.isArray(obj.aweme_list)) videoList = obj.aweme_list;
  if (videoList.length === 0 && Array.isArray(obj.items)) videoList = obj.items;

  if (videoList.length === 0) {
    console.log("TikTok: 没有视频数据, keys:", Object.keys(obj).join(","));
    return [];
  }
  console.log("TikTok: 找到 " + videoList.length + " 条视频（过滤前）");

  const posts: RawPost[] = [];
  let skipped = 0;
  for (const item of videoList) {
    const v = (item || {}) as Record<string, unknown>;

    let desc = "";
    if (Array.isArray(v.content_desc)) {
      desc = v.content_desc.map(String).join(" ").trim();
    } else {
      desc = String(v.content_desc || v.desc || v.title || "").trim();
    }

    if (!isJapaneseRelated(desc)) {
      skipped++;
      continue;
    }

    const author = (v.author || {}) as Record<string, unknown>;
    const authorName = String(author.nickname || author.unique_id || "");
    const authorId = String(author.unique_id || "user");
    const likes = Number(v.digg_count || 0);
    const reposts = Number(v.share_count || 0);
    const comments = Number(v.comment_count || 0);
    const views = Number(v.play_count || 0);
    const videoId = String(v.video_id || v.aweme_id || v.id || "");
    const postUrl = videoId
      ? "https://www.tiktok.com/@" + authorId + "/video/" + videoId
      : "";
    const content = desc.length >= 2 ? desc : "[TikTok视频] " + authorName;

    posts.push({
      platform: "tiktok",
      content,
      authorName,
      likes,
      reposts,
      comments,
      views,
      postUrl,
    });
  }

  console.log("TikTok: 过滤掉 " + skipped + " 条非日语内容，返回 " + posts.length + " 条帖子");
  return posts;
}