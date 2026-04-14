// 各平台抓取器返回的原始帖子数据
export interface RawPost {
  platform: "x" | "yahoo" | "tiktok" | "instagram";
  content: string;        // 帖子原文（日文）
  authorName: string;     // 作者名
  likes: number;          // 点赞数
  reposts: number;        // 转发/分享数
  comments: number;       // 评论数
  views: number;          // 浏览/播放量
  postUrl: string;        // 原帖链接
  contentZh?: string;     // AI 生成的中文解读
  followers?: number;     // 作者粉丝数（用于异常检测）
}

// 各平台抓取器的统一接口
export interface PlatformFetcher {
  name: string;
  isConfigured: () => boolean;
  fetch: () => Promise<RawPost[]>;
}

// 检测文本是否包含日语（平假名或片假名至少 2 个）
export function isJapaneseText(text: string): boolean {
  const jpChars = text.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
  return !!jpChars && jpChars.length >= 2;
}
