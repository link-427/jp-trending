import Link from "next/link";
import { notFound } from "next/navigation";
import HeatTagBadge from "@/components/HeatTagBadge";
import PlatformIcon from "@/components/PlatformIcon";
import PostCard from "@/components/PostCard";
import { getTopicByIdFromDB } from "@/lib/data";

export default async function TopicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  const topic = await getTopicByIdFromDB(numId);
  if (!topic) notFound();

  return (
    <div className="max-w-2xl mx-auto bg-white min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <Link href="/" className="text-sm text-blue-500 hover:text-blue-700">
          ← 返回排行榜
        </Link>
      </header>

      <main className="px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">{topic.title_zh}</h1>
        <p className="text-sm text-gray-400 mb-3">{topic.title_ja}</p>

        <div className="flex items-center gap-2 flex-wrap mb-4">
          <HeatTagBadge tag={topic.heat_tag} />
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{topic.category}</span>
          <div className="flex items-center gap-1">
            {topic.sources.map((p) => (<PlatformIcon key={p} platform={p} />))}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-bold text-gray-700 mb-2">事件概要</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{topic.summary_zh}</p>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-700 mb-3">热门原帖（{topic.posts.length} 条）</h2>
          <div className="space-y-3">
            {topic.posts.map((post) => (<PostCard key={post.id} post={post} full />))}
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-gray-300 py-6">
        数据来源：X · Yahoo! Japan · TikTok · Instagram
      </footer>
    </div>
  );
}
