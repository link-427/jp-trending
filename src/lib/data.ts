import { supabase } from "./supabase";
import { TrendingTopicWithPosts, TopicPost } from "@/types";

// 从数据库获取排行榜数据
export async function getTopicsFromDB(
  category: string | null
): Promise<TrendingTopicWithPosts[]> {
  let query = supabase.from("trending_topics").select("*");

  if (!category || category === "总榜") {
    // 总榜：按 rank_overall 排序，取前100条
    query = query.not("rank_overall", "is", null).order("rank_overall").limit(100);
  } else {
    // 分类榜：筛选分类，按 rank_category 排序，取前50条
    query = query.eq("category", category).order("rank_category").limit(50);
  }

  const { data: topics, error } = await query;
  if (error || !topics) return [];

  // 获取所有热点的原帖
  const topicIds = topics.map((t) => t.id);
  const { data: allPosts } = await supabase
    .from("topic_posts")
    .select("*")
    .in("topic_id", topicIds)
    .order("likes", { ascending: false });

  // 把原帖挂到对应热点上
  return topics.map((topic) => ({
    ...topic,
    posts: (allPosts || []).filter((p: TopicPost) => p.topic_id === topic.id),
  })) as TrendingTopicWithPosts[];
}

// 根据 id 获取单个热点（含原帖）
export async function getTopicByIdFromDB(
  id: number
): Promise<TrendingTopicWithPosts | null> {
  const { data: topic, error } = await supabase
    .from("trending_topics")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !topic) return null;

  const { data: posts } = await supabase
    .from("topic_posts")
    .select("*")
    .eq("topic_id", id)
    .order("likes", { ascending: false });

  return { ...topic, posts: posts || [] } as TrendingTopicWithPosts;
}
