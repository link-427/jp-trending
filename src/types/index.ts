// 来源平台类型
export type Platform = "x" | "yahoo" | "tiktok" | "instagram";

// 热度标签类型
export type HeatTag = "爆" | "热" | "新";

// 分类类型
export type Category = "政治" | "娱乐" | "动漫" | "体育" | "社会" | "科技" | "生活";

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
