// 来源平台类型
export type Platform = "x" | "yahoo" | "tiktok" | "instagram";

// 热度标签类型
export type HeatTag = "爆" | "热" | "新";

// 分类类型
export type Category = "娱乐" | "动漫" | "时尚" | "社会" | "科技" | "生活" | "萌宠";

// 热度评分明细
export interface ScoreBreakdown {
  baseInteraction: number;
  growth: number;
  timeliness: number;
  crossPlatform: number;
  anomalyCoefficient: number;
  platformWeight: number;
}

// 互动历史记录
export interface InteractionHistory {
  id: number;
  topic_id: number;
  recorded_at: string;
  likes: number;
  shares: number;
  comments: number;
  views: number;
}

// 热点主表
export interface TrendingTopic {
  id: number;
  title_ja: string;
  title_zh: string;
  category: Category;
  heat_score: number;
  heat_tag: HeatTag;
  sources: Platform[];
  summary_zh: string;
  rank_overall: number | null;
  rank_category: number;
  first_seen_at: string;
  score_breakdown: ScoreBreakdown | null;
  has_authority_media: boolean;
  has_verified_account: boolean;
  created_at: string;
  updated_at: string;
}

// 原帖
export interface TopicPost {
  id: number;
  topic_id: number;
  platform: Platform;
  author_name: string;
  content_ja: string;
  content_zh: string;
  likes: number;
  reposts: number;
  comments: number;
  post_url: string;
  posted_at: string;
}

// 带原帖的热点（前端展示用）
export interface TrendingTopicWithPosts extends TrendingTopic {
  posts: TopicPost[];
}
