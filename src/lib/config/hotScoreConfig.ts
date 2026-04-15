// PRD 热度算法配置
// 互动总量 40% + 增长速度 30% + 跨平台程度 20% + 内容质量 10%
export const HOT_SCORE_CONFIG = {
  // 各维度权重（严格按 PRD）
  weights: {
    interaction: 0.4,     // 互动总量（点赞+转发+评论）
    growth: 0.3,          // 增长速度（单位时间内互动增量）
    crossPlatform: 0.2,   // 跨平台程度（多个平台都在讨论则加分）
    contentQuality: 0.1,  // 内容质量（有权威媒体或大V参与）
  },

  // 内容质量判定阈值
  contentQuality: {
    highFollowerThreshold: 10000,  // 粉丝数超过此值视为大V
    authorityKeywords: ["NHK", "テレビ朝日", "日テレ", "TBS", "フジテレビ", "読売", "朝日新聞", "毎日新聞", "産経", "共同通信", "時事通信", "Reuters", "AP"],
  },

  // 异常检测阈值
  anomalyThresholds: {
    likeCommentRatio: 100,
    duplicateRateMax: 0.8,
  },

  // 敏感词列表（命中则热度系数归零）
  sensitiveWords: ["広告", "スパム", "詐欺", "アダルト", "ギャンブル"],
};
