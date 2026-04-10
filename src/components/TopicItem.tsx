"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingTopicWithPosts } from "@/types";
import PlatformIcon from "./PlatformIcon";
import HeatTagBadge from "./HeatTagBadge";
import PostCard from "./PostCard";

// 格式化数字：12000 -> 1.2万
function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export default function TopicItem({
  topic,
  rank,
}: {
  topic: TrendingTopicWithPosts;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isTop3 = rank <= 3;

  return (
    <div className={`border-b border-gray-100 ${isTop3 ? "bg-orange-50" : ""}`}>
      {/* 热点主体 */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer active:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        {/* 排名序号 */}
        <div
          className={`shrink-0 w-8 text-center font-bold ${
            rank === 1
              ? "text-red-500 text-xl"
              : rank === 2
              ? "text-orange-500 text-xl"
              : rank === 3
              ? "text-yellow-500 text-xl"
              : "text-gray-400 text-base"
          }`}
        >
          {rank}
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/topic/${topic.id}`}
              onClick={(e) => e.stopPropagation()}
              className={`font-semibold hover:text-blue-600 ${
                isTop3 ? "text-base" : "text-sm"
              }`}
            >
              {topic.title_zh}
            </Link>
            <HeatTagBadge tag={topic.heat_tag} />
          </div>

          {/* 日文原文 */}
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {topic.title_ja}
          </p>

          {/* 来源平台图标 */}
          <div className="flex items-center gap-1.5 mt-1.5">
            {topic.sources.map((p) => (
              <PlatformIcon key={p} platform={p} />
            ))}
            <span className="text-xs text-gray-400 ml-1">
              {formatNumber(
                topic.heat_score
              )}
              讨论
            </span>
          </div>
        </div>

        {/* 展开箭头 */}
        <div className="shrink-0 text-gray-300 mt-1">
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 展开的原帖列表 */}
      {expanded && (
        <div className="px-4 pb-3 pl-15">
          <div className="border-t border-gray-100 pt-2 space-y-2">
            {topic.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
