"use client";

import { TopicPost } from "@/types";
import PlatformIcon from "./PlatformIcon";

// 格式化数字
function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export default function PostCard({
  post,
  full = false,
}: {
  post: TopicPost;
  full?: boolean;
}) {
  // 优先显示中文翻译，没有则显示日文原文
  const content = post.content_zh || post.content_ja || "";
  const hasUrl = post.post_url && post.post_url.startsWith("http");

  return (
    <div className="bg-gray-50 rounded-lg p-3 text-sm">
      {/* 头部：平台 + 作者 */}
      <div className="flex items-center gap-2 mb-1">
        <PlatformIcon platform={post.platform} />
        <span className="text-gray-600 font-medium text-xs">{post.author_name}</span>
      </div>

      {/* 内容 */}
      {content && (
        <p className={`text-gray-700 ${full ? "" : "line-clamp-3"}`}>
          {content}
        </p>
      )}

      {/* 底部：互动数据 + 原帖链接 */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {post.likes > 0 && <span>❤ {formatNum(post.likes)}</span>}
          {post.reposts > 0 && <span>🔄 {formatNum(post.reposts)}</span>}
          {post.comments > 0 && <span>💬 {formatNum(post.comments)}</span>}
        </div>
        {hasUrl && (
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:text-blue-700 font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            查看原帖 →
          </a>
        )}
      </div>
    </div>
  );
}