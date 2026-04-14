import { PlatformFetcher, RawPost } from "./types";

// Google Trends 日本区热搜（RSS 免费、无需 API Key）
// 注意：platform 设为 "yahoo" 是因为 PRD 只定义了 4 个平台
// Google Trends 作为 Yahoo 搜索热词的补充数据源
export const googleTrendsFetcher: PlatformFetcher = {
  name: "Google Trends (Japan)",
  isConfigured: () => true,
  fetch: async (): Promise<RawPost[]> => {
    try {
      const res = await fetch("https://trends.google.com/trending/rss?geo=JP", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TrendBot/1.0)" },
      });
      if (!res.ok) {
        console.error("Google Trends RSS 请求失败: " + res.status);
        return [];
      }
      const xml = await res.text();
      console.log("Google Trends RSS 长度: " + xml.length);
      return parseGoogleTrendsRSS(xml);
    } catch (error) {
      console.error("Google Trends 抓取失败:", error);
      return [];
    }
  },
};

function parseGoogleTrendsRSS(xml: string): RawPost[] {
  const posts: RawPost[] = [];
  const itemPattern = /<item>[\s\S]*?<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemPattern.exec(xml)) !== null && posts.length < 30) {
    const itemXml = itemMatch[0];

    // 提取标题
    let keyword = "";
    const titleCdata = itemXml.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/);
    const titlePlain = itemXml.match(/<title>(.+?)<\/title>/);
    if (titleCdata) keyword = titleCdata[1].trim();
    else if (titlePlain) keyword = titlePlain[1].trim();
    if (keyword.length < 2) continue;

    // 提取描述（如果有）
    let description = keyword;
    const descCdata = itemXml.match(/<description><!\[CDATA\[(.+?)\]\]><\/description>/);
    const descPlain = itemXml.match(/<description>(.+?)<\/description>/);
    if (descCdata) description = descCdata[1].trim();
    else if (descPlain) description = descPlain[1].trim();

    // 提取流量
    const trafficMatch = itemXml.match(/<ht:approx_traffic>([\d,+]+)<\/ht:approx_traffic>/);
    const traffic = trafficMatch
      ? parseInt(trafficMatch[1].replace(/[,+]/g, ""), 10) || 5000
      : Math.max(5000 - posts.length * 100, 500);

    // 提取链接
    const linkMatch = itemXml.match(/<link>(.+?)<\/link>/);
    const postUrl = linkMatch ? linkMatch[1].trim() : "https://trends.google.com/trending?geo=JP";

    posts.push({
      platform: "yahoo",
      content: description.length > keyword.length ? description : keyword,
      authorName: "Google Trends",
      likes: 0,
      reposts: 0,
      comments: 0,
      views: traffic,
      postUrl,
    });
  }

  console.log("Google Trends RSS 解析出 " + posts.length + " 条热搜");
  return posts;
}
