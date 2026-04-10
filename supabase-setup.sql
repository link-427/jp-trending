-- 日本热点排行榜数据库建表 SQL
-- 在 Supabase SQL Editor 中执行此文件

-- 1. 热点主表
CREATE TABLE trending_topics (
  id BIGSERIAL PRIMARY KEY,
  title_ja TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  category TEXT NOT NULL,
  heat_score INTEGER NOT NULL DEFAULT 0,
  heat_tag TEXT NOT NULL DEFAULT '新',
  sources JSONB NOT NULL DEFAULT '[]',
  summary_zh TEXT NOT NULL DEFAULT '',
  rank_overall INTEGER,
  rank_category INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 原帖表
CREATE TABLE topic_posts (
  id BIGSERIAL PRIMARY KEY,
  topic_id BIGINT NOT NULL REFERENCES trending_topics(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content_ja TEXT NOT NULL DEFAULT '',
  content_zh TEXT NOT NULL DEFAULT '',
  likes INTEGER NOT NULL DEFAULT 0,
  reposts INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  post_url TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 开启 RLS（行级安全）但允许公开读取
ALTER TABLE trending_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许公开读取热点" ON trending_topics
  FOR SELECT USING (true);

CREATE POLICY "允许公开读取原帖" ON topic_posts
  FOR SELECT USING (true);

-- 4. 创建索引加速查询
CREATE INDEX idx_topics_rank_overall ON trending_topics(rank_overall);
CREATE INDEX idx_topics_category ON trending_topics(category);
CREATE INDEX idx_posts_topic_id ON topic_posts(topic_id);
