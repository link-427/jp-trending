import { PlatformFetcher, RawPost } from "./types";

// TikTok 日本区热门内容
// 策略：搜索日本热门标签 → 获取标签下的热门帖子
// 比 feed/list 更精准，返回的都是日本相关的真实热门内容

const HOST = "tiktok-scraper7.p.rapidapi.com";

// 搜索用的日语关键词（覆盖多个热门分类）
const SEARCH_KEYWORDS = ["トレンド", "日本", "東京グルメ", "バズ"];

// 只保留 14 天内发布的帖子
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const tiktokFetcher: PlatformFetcher = {
  name: "TikTok",
  isConfigured: () => !!process.env.TIKTOK_API_KEY,
  fetch: async (): Promise<RawPost[]> => {
    const apiKey = process.env.TIKTOK_API_KEY;
    if (!apiKey) { console.log("TikTok: 未配置 TIKTOK_API_KEY"); return []; }

    try {
      // 第 1 步：搜索热门标签
      console.log("TikTok: 搜索日本热门标签...");
      const challenges = await searchChallenges(apiKey);
      console.log("TikTok: 找到 " + challenges.length + " 个热门标签");

      if (challenges.length === 0) return [];

      // 第 2 步：取浏览量最高的几个标签，获取帖子
      const topChallenges = challenges
        .sort((a, b) => b.viewCount - a.viewCount)
        .slice(0, 6);

      console.log("TikTok: 获取 " + topChallenges.length + " 个标签下的帖子...");
      const allPosts: RawPost[] = [];

      // 并行获取所有标签下的帖子
      const postResults = await Promise.allSettled(
        topChallenges.map((c) => fetchChallengePosts(apiKey, c.id, c.name))
      );
      for (const result of postResults) {
        if (result.status === "fulfilled") allPosts.push(...result.value);
      }

      console.log("TikTok: 共获取 " + allPosts.length + " 条帖子");
      return allPosts;
    } catch (error) {
      console.error("TikTok 请求失败:", error);
      return [];
    }
  },
};

interface ChallengeInfo {
  id: string;
  name: string;
  viewCount: number;
}

// 搜索日本相关的热门标签（并行请求所有关键词）
async function searchChallenges(apiKey: string): Promise<ChallengeInfo[]> {
  const seen = new Set<string>();
  const results: ChallengeInfo[] = [];

  const searches = await Promise.allSettled(
    SEARCH_KEYWORDS.map(async (keyword) => {
      const url = "https://" + HOST + "/challenge/search?keywords=" + encodeURIComponent(keyword) + "&count=10";
      const res = await fetch(url, {
        headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": HOST },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const list = data?.data?.challenge_list;
      return Array.isArray(list) ? list : [];
    })
  );

  for (const result of searches) {
    if (result.status !== "fulfilled") continue;
    for (const c of result.value) {
      const id = String(c.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      results.push({
        id,
        name: String(c.cha_name || ""),
        viewCount: Number(c.view_count || 0),
      });
    }
  }

  return results;
}

// 获取指定标签下的热门帖子
async function fetchChallengePosts(apiKey: string, challengeId: string, challengeName: string): Promise<RawPost[]> {
  try {
    const url = "https://" + HOST + "/challenge/posts?challenge_id=" + challengeId + "&count=10";
    const res = await fetch(url, {
      headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": HOST },
    });

    if (!res.ok) return [];
    const data = await res.json();

    const videos = data?.data?.videos;
    if (!Array.isArray(videos)) return [];

    const posts: RawPost[] = [];
    const now = Date.now();
    let skippedOld = 0;
    for (const v of videos) {
      // 过滤超过 14 天的旧帖子
      const createTime = Number(v.create_time || 0);
      if (createTime > 0 && (now - createTime * 1000) > MAX_AGE_MS) {
        skippedOld++;
        continue;
      }

      const desc = String(v.title || v.desc || v.content_desc || "").trim();
      const author = v.author || {};
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
      const content = desc.length >= 2 ? desc : "#" + challengeName + " [TikTok视频] " + authorName;

      posts.push({
        platform: "tiktok",
        content,
        authorName,
        likes,
        reposts,
        comments,
        views,
        postUrl,
        followers: Number(author.follower_count || 0),
      });
    }

    console.log("TikTok: #" + challengeName + " => " + posts.length + " 条帖子" + (skippedOld > 0 ? "（过滤掉 " + skippedOld + " 条超过14天的）" : ""));
    return posts;
  } catch {
    console.log("TikTok: 获取 #" + challengeName + " 帖子失败");
    return [];
  }
}
