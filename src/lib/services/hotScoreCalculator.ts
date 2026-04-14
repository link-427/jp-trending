import { HOT_SCORE_CONFIG } from "../config/hotScoreConfig";
import { RawPost } from "../fetchers/types";
import type { InteractionHistory, ScoreBreakdown } from "@/types";

// 热度计算器
// 公式：热度 = (基础互动×30% + 增长速度×30% + 时效性×25% + 跨平台×15%) × 异常系数 × 平台权重

const cfg = HOT_SCORE_CONFIG;

export interface HotScoreResult {
  totalScore: number;
  breakdown: ScoreBreakdown;
}

// 计算总热度分数
export function calculateHotScore(
  posts: RawPost[],
  platforms: string[],
  firstSeenAt: Date,
  history: InteractionHistory[],
): HotScoreResult {
  const baseInteraction = calculateBaseInteraction(posts, platforms);
  const growth = calculateGrowth(history);
  const timeliness = calculateTimeliness(firstSeenAt);
  const crossPlatform = calculateCrossPlatform(platforms);
  const anomalyCoefficient = detectAnomalies(posts);
  const platformWeight = getPlatformWeight(platforms);

  const rawScore =
    baseInteraction * cfg.weights.baseInteraction +
    growth * cfg.weights.growth +
    timeliness * cfg.weights.timeliness +
    crossPlatform * cfg.weights.crossPlatform;

  const totalScore = Math.round(rawScore * anomalyCoefficient * platformWeight * 100) / 100;

  return {
    totalScore,
    breakdown: {
      baseInteraction: Math.round(baseInteraction * 100) / 100,
      growth: Math.round(growth * 100) / 100,
      timeliness: Math.round(timeliness * 100) / 100,
      crossPlatform: Math.round(crossPlatform * 100) / 100,
      anomalyCoefficient: Math.round(anomalyCoefficient * 1000) / 1000,
      platformWeight: Math.round(platformWeight * 1000) / 1000,
    },
  };
}

// 1. 基础互动分（0-100）
// 加权互动量 = (likes×1.0 + shares×2.5 + comments×1.8 + views×0.01) × 平台权重
// 基础互动分 = min(100, log10(加权互动量 + 1) × 20)
function calculateBaseInteraction(posts: RawPost[], platforms: string[]): number {
  const avgPlatformWeight = getPlatformWeight(platforms);
  let totalWeighted = 0;

  for (const post of posts) {
    const w = cfg.interactionWeights;
    const weighted =
      post.likes * w.like +
      post.reposts * w.share +
      post.comments * w.comment +
      post.views * w.view;
    totalWeighted += weighted;
  }

  totalWeighted *= avgPlatformWeight;
  return Math.min(100, Math.log10(totalWeighted + 1) * 20);
}

// 2. 增长速度分（0-100）
// 从 interaction_history 计算多个时间段的增长率
// 增长速度分 = (min(rate_1h,10)×0.4 + min(rate_3h,5)×0.3 + min(rate_6h,3)×0.2 + min(rate_24h,2)×0.1) × 10
function calculateGrowth(history: InteractionHistory[]): number {
  if (history.length < 2) {
    // 冷启动：首次出现没有历史数据，给中等分
    return 50;
  }

  const now = new Date();
  const sorted = [...history].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  );

  // 最新一条记录的总互动量
  const latest = sorted[0];
  const latestTotal = latest.likes + latest.shares + latest.comments + latest.views;

  // 计算各时间段增长率
  const rate1h = getGrowthRate(sorted, now, 1, latestTotal);
  const rate3h = getGrowthRate(sorted, now, 3, latestTotal);
  const rate6h = getGrowthRate(sorted, now, 6, latestTotal);
  const rate24h = getGrowthRate(sorted, now, 24, latestTotal);

  const caps = cfg.growthRateCaps;
  const tw = cfg.growthTimeWeights;

  const score =
    (Math.min(rate1h, caps["1h"]) * tw["1h"] +
     Math.min(rate3h, caps["3h"]) * tw["3h"] +
     Math.min(rate6h, caps["6h"]) * tw["6h"] +
     Math.min(rate24h, caps["24h"]) * tw["24h"]) * 10;

  return Math.min(100, Math.max(0, score));
}

// 找到距离 now 最接近 hoursAgo 的历史记录，计算增长率
function getGrowthRate(
  sorted: InteractionHistory[],
  now: Date,
  hoursAgo: number,
  latestTotal: number,
): number {
  const targetTime = now.getTime() - hoursAgo * 3600 * 1000;

  // 找最接近目标时间的记录
  let closest: InteractionHistory | null = null;
  let closestDiff = Infinity;

  for (const record of sorted) {
    const diff = Math.abs(new Date(record.recorded_at).getTime() - targetTime);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = record;
    }
  }

  // 如果最接近的记录和目标时间差距超过时间段的一半，视为无数据
  if (!closest || closestDiff > hoursAgo * 3600 * 1000 * 0.5) {
    return 1; // 无数据，给中性增长率
  }

  const pastTotal = closest.likes + closest.shares + closest.comments + closest.views;
  if (pastTotal === 0) return latestTotal > 0 ? 5 : 0; // 从 0 增长，给较高增长率

  return latestTotal / pastTotal;
}

// 3. 时效性分（0-100）
// 公式：100 × e^(-lambda × t)，t 为距离首次出现的小时数
function calculateTimeliness(firstSeenAt: Date): number {
  const now = new Date();
  const hours = (now.getTime() - firstSeenAt.getTime()) / (3600 * 1000);
  if (hours < 0) return 100; // 时间异常，给满分
  return 100 * Math.exp(-cfg.timeliness.lambda * hours);
}

// 4. 跨平台分（0-100）
// 公式：(出现平台数/4 × 60%) + (主流平台覆盖度 × 40%)
function calculateCrossPlatform(platforms: string[]): number {
  const uniquePlatforms = new Set(platforms);
  const platformCoverage = (uniquePlatforms.size / 4) * 100;

  // 主流平台覆盖度
  const mainstreamScore =
    (uniquePlatforms.has("x") ? 30 : 0) +
    (uniquePlatforms.has("yahoo") ? 25 : 0) +
    (uniquePlatforms.has("instagram") ? 15 : 0) +
    (uniquePlatforms.has("tiktok") ? 10 : 0);

  // 加权：平台数量占 60%，主流覆盖度占 40%（主流满分 80，归一化到 100）
  return platformCoverage * 0.6 + (mainstreamScore / 80) * 100 * 0.4;
}

// 5. 异常过滤系数（0-1，1 为正常）
function detectAnomalies(posts: RawPost[]): number {
  let coefficient = 1.0;
  const thresholds = cfg.anomalyThresholds;

  // 计算总互动量
  let totalLikes = 0;
  let totalComments = 0;
  let totalFollowers = 0;
  let followerCount = 0;
  const contentSet = new Set<string>();
  let allContent = "";

  for (const post of posts) {
    totalLikes += post.likes;
    totalComments += post.comments;
    if (post.followers && post.followers > 0) {
      totalFollowers += post.followers;
      followerCount++;
    }
    const shortContent = post.content.slice(0, 50);
    contentSet.add(shortContent);
    allContent += post.content;
  }

  // 点赞/评论比异常
  if (totalComments > 0 && totalLikes / totalComments > thresholds.likeCommentRatio) {
    coefficient *= 0.5;
  }

  // 账号质量低（平均粉丝数过低）
  if (followerCount > 0 && totalFollowers / followerCount < thresholds.minAvgFollowers) {
    coefficient *= 0.6;
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

// 综合平台权重（取所有来源平台的平均权重）
function getPlatformWeight(platforms: string[]): number {
  if (platforms.length === 0) return 1.0;
  let total = 0;
  for (const p of platforms) {
    total += cfg.platformWeights[p] || 1.0;
  }
  return total / platforms.length;
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
