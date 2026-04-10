"use client";

import { useState, useEffect } from "react";
import CategoryTabs from "@/components/CategoryTabs";
import TopicItem from "@/components/TopicItem";
import { TrendingTopicWithPosts } from "@/types";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("总榜");
  const [topics, setTopics] = useState<TrendingTopicWithPosts[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    async function fetchTopics() {
      setLoading(true);
      try {
        let query = supabase.from("trending_topics").select("*");
        if (!activeTab || activeTab === "总榜") {
          query = query.not("rank_overall", "is", null).order("rank_overall").limit(100);
        } else {
          query = query.eq("category", activeTab).order("rank_category").limit(50);
        }
        const { data: dbTopics, error } = await query;

        if (!error && dbTopics && dbTopics.length > 0) {
          const topicIds = dbTopics.map((t) => t.id);
          const { data: allPosts } = await supabase
            .from("topic_posts")
            .select("*")
            .in("topic_id", topicIds)
            .order("likes", { ascending: false });

          const topicsWithPosts = dbTopics.map((topic) => ({
            ...topic,
            posts: (allPosts || []).filter((p: { topic_id: number }) => p.topic_id === topic.id),
          })) as TrendingTopicWithPosts[];

          setTopics(topicsWithPosts);
          if (dbTopics[0]?.updated_at || dbTopics[0]?.created_at) {
            const time = new Date(dbTopics[0].updated_at || dbTopics[0].created_at);
            setUpdatedAt(time.toLocaleString("zh-CN", {
              month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
            }));
          }
        } else {
          setTopics([]);
          setUpdatedAt("");
        }
      } catch {
        setTopics([]);
        setUpdatedAt("");
      }
      setLoading(false);
    }
    fetchTopics();
  }, [activeTab]);

  return (
    <div className="max-w-2xl mx-auto bg-white min-h-screen">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">日本热点雷达</h1>
          <span className="text-xs text-gray-400">
            {updatedAt ? "更新于 " + updatedAt : ""}
          </span>
        </div>
        <CategoryTabs active={activeTab} onChange={setActiveTab} />
      </header>

      <main>
        {loading ? (
          <div className="text-center text-gray-400 py-20">加载中...</div>
        ) : topics.length === 0 ? (
          <div className="text-center text-gray-400 py-20">暂无热点数据</div>
        ) : (
          topics.map((topic) => {
            const rank = activeTab === "总榜" ? topic.rank_overall ?? 0 : topic.rank_category;
            return <TopicItem key={topic.id} topic={topic} rank={rank} />;
          })
        )}
      </main>

      <footer className="text-center text-xs text-gray-300 py-6">
        数据来源：X · Yahoo! Japan · TikTok · Instagram<br />每 30 分钟自动更新
      </footer>
    </div>
  );
}
