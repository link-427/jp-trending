// 热度算法配置参数
export const HOT_SCORE_CONFIG = {
  // 各维度权重
  weights: {
    baseInteraction: 0.3,   // 基础互动分
    growth: 0.3,            // 增长速度分
    timeliness: 0.25,       // 时效性分
    crossPlatform: 0.15,    // 跨平台分
  },

  // 互动类型权重（转发和评论比点赞更有价值）
  interactionWeights: {
    like: 1.0,
    share: 2.5,
    comment: 1.8,
    view: 0.01,
  },

  // 平台权重（新闻类平台权重更高）
  platformWeights: {
    yahoo: 1.1,
    x: 1.0,
    instagram: 0.85,
    tiktok: 0.8,
  } as Record<string, number>,

  // 时效性衰减参数
  timeliness: {
    lambda: 0.15,  // 衰减系数，越大衰减越快
  },

  // 异常检测阈值
  anomalyThresholds: {
    likeCommentRatio: 100,    // 点赞/评论比超过此值视为异常
    growthRateMax: 50,        // 1 小时增长率超过此值视为异常
    minAvgFollowers: 100,     // 平均粉丝数低于此值视为低质量
    duplicateRateMax: 0.8,    // 内容重复率超过此值视为异常
  },

  // 敏感词列表（命中则热度系数归零）
  sensitiveWords: ["広告", "スパム", "詐欺", "アダルト", "ギャンブル"],

  // 增长速度各时间段权重
  growthTimeWeights: {
    "1h": 0.4,
    "3h": 0.3,
    "6h": 0.2,
    "24h": 0.1,
  },

  // 增长率上限（防止极端值）
  growthRateCaps: {
    "1h": 10,
    "3h": 5,
    "6h": 3,
    "24h": 2,
  },
};
