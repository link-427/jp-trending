import { PlatformFetcher, RawPost } from "./types";

// Yahoo Japan 实时搜索热词
// 热搜页面上的关键词本身就是按热度排好的
export const yahooFetcher: PlatformFetcher = {
  name: "Yahoo! Japan",
  isConfigured: () => true,
  fetch: async (): Promise<RawPost[]> => {
    let posts = await tryYahooBuzz();
    if (posts.length > 0) return posts;
    posts = await tryYahooRealtime();
    if (posts.length > 0) return posts;
    console.log("Yahoo: 所有方式均未获取到数据");
    return [];
  },
};

async function tryYahooBuzz(): Promise<RawPost[]> {
  try {
    const res = await fetch("https://search.yahoo.co.jp/realtime/buzz", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ja-JP,ja;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) { console.log("Yahoo buzz 请求失败: " + res.status); return []; }
    const html = await res.text();
    console.log("Yahoo buzz 页面长度: " + html.length);
    return parseYahooHtml(html);
  } catch (error) {
    console.log("Yahoo buzz 抓取错误: " + error);
    return [];
  }
}

async function tryYahooRealtime(): Promise<RawPost[]> {
  try {
    const res = await fetch("https://search.yahoo.co.jp/realtime", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ja-JP,ja;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) { console.log("Yahoo realtime 请求失败: " + res.status); return []; }
    const html = await res.text();
    console.log("Yahoo realtime 页面长度: " + html.length);
    return parseYahooHtml(html);
  } catch (error) {
    console.log("Yahoo realtime 抓取错误: " + error);
    return [];
  }
}

function parseYahooHtml(html: string): RawPost[] {
  const posts: RawPost[] = [];
  const seen = new Set<string>();
  const patterns = [
    /<a[^>]*href="[^"]*(?:search|realtime)[^"]*[?&]p=([^"&]+)[^"]*"[^>]*>([^<]+)<\/a>/gi,
    /data-keyword="([^"]+)"/gi,
    /<[^>]*class="[^"]*(?:trend|buzz|keyword)[^"]*"[^>]*>([^<]{2,30})<\//gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const raw = match[match.length - 1];
      const keyword = decodeURIComponent(raw).trim();
      if (keyword.length < 2 || keyword.length > 50 || seen.has(keyword)) continue;
      if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(keyword)) continue;
      if (/検索|ログイン|設定|ヘルプ|トップ|もっと/.test(keyword)) continue;

      seen.add(keyword);
      // Yahoo 实时热搜按排名估算热度
      // 日本 Yahoo 实时热搜 #1 约有 10-30 万讨论
      const rank = posts.length;
      const estimatedHeat = Math.round(200000 * Math.pow(0.9, rank));

      posts.push({
        platform: "yahoo",
        content: keyword,
        authorName: "Yahoo! Japan",
        likes: 0,
        reposts: 0,
        comments: 0,
        views: estimatedHeat,
        postUrl: "https://search.yahoo.co.jp/realtime/search?p=" + encodeURIComponent(keyword),
      });
      if (posts.length >= 30) break;
    }
    if (posts.length >= 30) break;
  }

  if (posts.length > 0) console.log("Yahoo 解析出 " + posts.length + " 条热搜");
  return posts;
}