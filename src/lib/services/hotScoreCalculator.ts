import { HOT_SCORE_CONFIG } from "../config/hotScoreConfig";
import { RawPost } from "../fetchers/types";
import type { InteractionHistory, ScoreBreakdown } from "@/types";

// PRD 热度算法
// 热度 = (互动总量×40% + 增长速度×30% + 跨平台程度×20% + 内容质量×10%) × 异常系数

const cfg = HOT_SCORE_CONFIG;

export interface HotScoreResult {
  totalScore: number;
  breakdown: ScoreBreakdown;
}

// 计算总热度分数
export function calculateHotScore(
  posts: RawPost[],
  platforms: string[],
  history: InteractionHistory[],
): HotScoreResult {
  const interaction = calcInteraction(posts);
  const growth = calcGrowth(posts, history);
  const crossPlatform = calcCrossPlatform(platforms);
  const contentQuality = calcContentQuality(posts);
  const anomalyCoefficient = detectAnomalies(posts);

  const rawScore =
    interaction * cfg.weights.interaction +
    growth * cfg.weights.growth +
    crossPlatform * cfg.weights.crossPlatform +
    contentQuality * cfg.weights.contentQuality;

  const totalScore = Math.round(rawScore * anomalyCoefficient * 100) / 100;

  return {
    totalScore,
    breakdown: {
      interaction: Math.round(interaction * 100) / 100,
      growth: Math.round(growth * 100) / 100,
      crossPlatform: Math.round(crossPlatform * 100) / 100,
      contentQuality: Math.round(contentQuality * 100) / 100,
      anomalyCoefficient: Math.round(anomalyCoefficient * 1000) / 1000,
    },
  };
}

// 1. 互动总量分（0-100）
// 直接累加所有帖子的点赞+转发+评论，log 归一化
function calcInteraction(posts: RawPost[]): number {
  let total = 0;
  for (const p of posts) {
    total += p.likes + p.reposts + p.comments;
  }
  // log10 归一化：1万互动≈80分，10万≈100分
  return Math.min(100, Math.log10(total + 1) * 20);
}

// 2. 增长速度分（0-100）
// 对比上一次记录的互动量，计算增长倍率
function calcGrowth(posts: RawPost[], history: InteractionHistory[]): number {
  // 当前互动总量
  let currentTotal = 0;
  for (const p of posts) {
    currentTotal += p.likes + p.reposts + p.comments;
  }

  // 没有历史记录 = 新话题，给中性分
  if (history.length === 0) {
    return 50;
  }

  // 取最近一条历史记录
  const sorted = [...history].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  );
  const latest = sorted[0];
  const pastTotal = latest.likes + latest.shares + latest.comments;

  if (pastTotal === 0) {
    return currentTotal > 0 ? 80 : 0;
  }

  // 增长倍率 = 当前 / 历史
  const growthRate = currentTotal / pastTotal;

  // 归一化：1倍=30分（持平），2倍=60分，5倍=90分，10倍=100分
  if (growthRate <= 1) {
    return Math.max(0, growthRate * 30);
  }
  return Math.min(100, 30 + Math.log10(growthRate) * 60);
}

// 3. 跨平台程度分（0-100）
// 简单直接：1个平台=25分，2个=50分，3个=75分，4个=100分
function calcCrossPlatform(platforms: string[]): number {
  const unique = new Set(platforms);
  return Math.min(100, unique.size * 25);
}

// 4. 内容质量分（0-100）
// 有权威媒体 +50，有大V（高粉丝）+50
function calcContentQuality(posts: RawPost[]): number {
  let score = 0;
  const thresholds = cfg.contentQuality;

  let hasHighFollower = false;
  let hasAuthority = false;

  for (const p of posts) {
    // 大V 检测
    if (p.followers && p.followers >= thresholds.highFollowerThreshold) {
      hasHighFollower = true;
    }
    // 权威媒体检测（在作者名或内容中匹配关键词）
    const text = (p.authorName || "") + " " + p.content;
    for (const keyword of thresholds.authorityKeywords) {
      if (text.includes(keyword)) {
        hasAuthority = true;
        break;
      }
    }
    if (hasHighFollower && hasAuthority) break;
  }

  if (hasAuthority) score += 50;
  if (hasHighFollower) score += 50;

  // 补充：帖子数量多也说明质量高（多条相关内容）
  if (posts.length >= 5) score = Math.max(score, 30);
  else if (posts.length >= 3) score = Math.max(score, 20);

  return Math.min(100, score);
}

// 异常过滤系数（0-1，1 为正常）
function detectAnomalies(posts: RawPost[]): number {
  let coefficient = 1.0;
  const thresholds = cfg.anomalyThresholds;

  let totalLikes = 0;
  let totalComments = 0;
  const contentSet = new Set<string>();
  let allContent = "";

  for (const post of posts) {
    totalLikes += post.likes;
    totalComments += post.comments;
    contentSet.add(post.content.slice(0, 50));
    allContent += post.content;
  }

  // 点赞/评论比异常
  if (totalComments > 0 && totalLikes / totalComments > thresholds.likeCommentRatio) {
    coefficient *= 0.5;
  }

  // 内容重复率异常
  if (posts.length > 1) {
    const duplicateRate = 1 - contentSet.size / posts.length;
    if (duplicateRate > thresholds.duplicateRateMax) {
      coefficient *= 0.5;
    }
  }

  // 敏感词检测
  for (const word of cfg.sensitiveWords) {
    if (allContent.includes(word)) {
      coefficient = 0;
      break;
    }
  }

  return coefficient;
}

// 计算帖子的总互动量（用于记录到 interaction_history）
export function sumInteractions(posts: RawPost[]): {
  likes: number;
  shares: number;
  comments: number;
  views: number;
} {
  let likes = 0, shares = 0, comments = 0, views = 0;
  for (const p of posts) {
    likes += p.likes;
    shares += p.reposts;
    comments += p.comments;
    views += p.views;
  }
  return { likes, shares, comments, views };
}
