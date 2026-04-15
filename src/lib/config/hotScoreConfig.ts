// 热度算法配置参数
export const HOT_SCORE_CONFIG = {
  // 各维度权重（互动为主，时效和增长为辅）
  weights: {
    baseInteraction: 0.4,   // 基础互动分（真实互动最重要）
    growth: 0.2,            // 增长速度分（降低，避免冷启动偏差）
    timeliness: 0.2,        // 时效性分（降低，避免惩罚已有话题）
    crossPlatform: 0.2,     // 跨平台分（提升，鼓励多平台覆盖）
  },

  // 互动类型权重（转发和评论比点赞更有价值）
  interactionWeights: {
    like: 1.0,
    share: 2.5,
    comment: 1.8,
    view: 0.01,
  },

  // 平台权重（缩小差距，避免乘法系数造成过大偏差）
  platformWeights: {
    yahoo: 1.05,
    x: 1.0,
    instagram: 0.95,
    tiktok: 0.92,
  } as Record<string, number>,

  // 时效性衰减参数（半衰期约 14 小时，比之前的 4.6 小时温和很多）
  timeliness: {
    lambda: 0.05,
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
