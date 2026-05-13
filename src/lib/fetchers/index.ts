import { PlatformFetcher, RawPost } from "./types";
import { googleTrendsFetcher } from "./google-trends";
import { yahooFetcher } from "./yahoo";
import { xFetcher } from "./x";
import { tiktokFetcher } from "./tiktok";
import { instagramFetcher } from "./instagram";

const fetchers: PlatformFetcher[] = [
  googleTrendsFetcher,
  yahooFetcher,
  xFetcher,
  tiktokFetcher,
  instagramFetcher,
];

export interface FetchResult {
  posts: RawPost[];
  logs: string[];
}

// 给单个 fetcher 加超时保护
function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(name + " 超时(" + ms + "ms)")), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function fetchAllPlatforms(): Promise<FetchResult> {
  const configured = fetchers.filter((f) => f.isConfigured());
  const logs: string[] = [];

  if (configured.length === 0) {
    logs.push("没有任何平台已配置");
    return { posts: [], logs };
  }
  logs.push("已配置的平台：" + configured.map((f) => f.name).join(", "));

  // 并行抓取，每个 fetcher 最多 25 秒
  const results = await Promise.allSettled(
    configured.map(async (f) => {
      const posts = await withTimeout(f.fetch(), 25000, f.name);
      return { name: f.name, posts };
    })
  );

  const allPosts: RawPost[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      const { name, posts } = result.value;
      logs.push(name + ": " + posts.length + " 条帖子");
      allPosts.push(...posts);
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      logs.push(configured[i].name + " 抓取失败: " + errMsg);
    }
  }

  return { posts: allPosts, logs };
}

export function getPlatformStatus() {
  return fetchers.map((f) => ({ name: f.name, configured: f.isConfigured() }));
}