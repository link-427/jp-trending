import { GoogleGenerativeAI } from "@google/generative-ai";
import { RawPost } from "./fetchers/types";
import type { Category } from "@/types";

const MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-2.5-flash-preview-04-17",
];

const CATEGORIES: Category[] = [
  "娱乐", "动漫", "时尚", "社会", "科技", "生活", "萌宠",
];

export interface IdentifiedTopic {
  titleZh: string;
  titleJa: string;
  category: Category;
  summaryZh: string;
  postIndices: number[];
}

export interface ProcessedTopic {
  titleZh: string;
  titleJa: string;
  category: Category;
  summaryZh: string;
  sources: string[];
  heatScore: number;
  relatedPosts: RawPost[];
}

let logFn: ((msg: string) => void) | null = null;
export function setAILogger(fn: (msg: string) => void) { logFn = fn; }
function aiLog(msg: string) { console.log(msg); if (logFn) logFn(msg); }

export function isAIConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// ============ X 热搜 AI 解读 ============

// 用 AI 解读 X 热搜关键词：是什么 + 为什么火
export async function enrichXTrends(
  posts: RawPost[],
  deadline?: number
): Promise<RawPost[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return posts;

  // 筛选出 X 平台的帖子
  const xIndices: number[] = [];
  const keywords: string[] = [];
  for (let i = 0; i < posts.length; i++) {
    if (posts[i].platform === "x") {
      xIndices.push(i);
      keywords.push(posts[i].content);
    }
  }
  if (keywords.length === 0) return posts;

  // 检查时间预算（至少需要保留 35 秒给后续步骤）
  if (deadline && Date.now() > deadline - 35000) {
    aiLog("X 热搜解读：时间不足，跳过");
    return posts;
  }

  aiLog("X 热搜解读：" + keywords.length + " 个关键词...");
  const genAI = new GoogleGenerativeAI(apiKey);

  const keywordList = keywords.map((k, i) => (i + 1) + ". " + k).join("\n");
  const prompt = "以下是当前日本 Twitter/X 的热搜关键词列表。请用中文简要解读每个热搜。\n\n" +
    "关键词列表：\n" + keywordList + "\n\n" +
    "对每个关键词，请解释：\n" +
    "1. 这个热搜是关于什么的（人物/事件/作品等）\n" +
    "2. 为什么现在在日本火了\n\n" +
    "返回 JSON 数组，每项包含：\n" +
    "- index: 对应上面的序号（数字）\n" +
    "- summary: 中文解读（2-3句话，包含是什么和为什么火）\n\n" +
    "严格返回 JSON，不要添加其他文字：\n" +
    "[{\"index\":1,\"summary\":\"...\"}, ...]";

  // 尝试各模型
  for (const modelName of MODELS) {
    if (deadline && Date.now() > deadline - 35000) {
      aiLog("X 热搜解读：时间不足，停止尝试");
      break;
    }
    try {
      aiLog("X 热搜解读 [" + modelName + "]...");
      const model = genAI.getGenerativeModel({ model: modelName });

      // 给 AI 调用加超时
      const timeLeft = deadline ? Math.max(deadline - Date.now() - 35000, 5000) : 15000;
      const aiTimeout = Math.min(timeLeft, 15000);

      const resultPromise = model.generateContent(prompt);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("超时")), aiTimeout)
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);
      const text = result.response.text();

      // 解析 JSON
      let jsonText = text;
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlock) jsonText = codeBlock[1];
      const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        aiLog("X 热搜解读：AI 返回格式错误");
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        index: number; summary: string;
      }>;

      // 更新帖子的 contentZh
      const enriched = [...posts];
      let enrichCount = 0;
      for (const item of parsed) {
        const idx = item.index - 1; // 1-based -> 0-based
        if (idx >= 0 && idx < xIndices.length && item.summary) {
          const postIdx = xIndices[idx];
          enriched[postIdx] = {
            ...enriched[postIdx],
            contentZh: item.summary,
          };
          enrichCount++;
        }
      }

      aiLog("X 热搜解读完成：" + enrichCount + "/" + keywords.length + " 个关键词已解读");
      return enriched;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("Too Many") || errMsg.includes("404")) {
        aiLog("X 热搜解读 [" + modelName + "]: 配额不足");
        continue;
      }
      aiLog("X 热搜解读 [" + modelName + "]: " + errMsg.slice(0, 80));
    }
  }

  aiLog("X 热搜解读：所有模型失败，保持原始关键词");
  return posts;
}

// ============ 话题归纳（主 AI 功能） ============

export async function analyzeAndGroupPosts(
  posts: RawPost[],
  deadline?: number
): Promise<ProcessedTopic[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    aiLog("AI 未配置，使用基础处理");
    return basicGroupPosts(posts);
  }

  if (deadline && Date.now() > deadline - 15000) {
    aiLog("剩余时间不足 15 秒，跳过 AI 使用基础处理");
    return basicGroupPosts(posts);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  aiLog("开始 AI 分析 " + posts.length + " 条帖子...");

  const postSummaries = posts.map((p, i) => {
    const engagement = p.likes + p.reposts + p.comments + p.views;
    const contentShort = (p.contentZh || p.content).replace(/\n/g, " ").slice(0, 80);
    return (i + 1) + ". [" + p.platform + "] " + contentShort + " (互动:" + engagement + ")";
  });

  for (const modelName of MODELS) {
    if (deadline && Date.now() > deadline - 12000) {
      aiLog("剩余时间不足 12 秒，放弃 AI 使用基础处理");
      return basicGroupPosts(posts);
    }
    aiLog("尝试模型: " + modelName);
    const model = genAI.getGenerativeModel({ model: modelName });
    const topics = await tryAnalyzeWithModel(model, modelName, postSummaries, deadline);
    if (topics) {
      return buildTopicsWithEngagement(topics, posts);
    }
    aiLog(modelName + " 失败，尝试下一个...");
  }

  aiLog("所有 AI 模型失败，使用基础处理");
  return basicGroupPosts(posts);
}

async function tryAnalyzeWithModel(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  modelName: string,
  postSummaries: string[],
  deadline?: number
): Promise<IdentifiedTopic[] | null> {
  const batch = postSummaries.slice(0, 80);
  aiLog("[" + modelName + "] 分析 " + batch.length + " 条帖子...");

  const result = await analyzeOneBatch(model, batch, 0, deadline);
  if (result.quotaError) return null;
  if (result.topics.length > 0) {
    aiLog("[" + modelName + "] AI 识别出 " + result.topics.length + " 个话题");
    return result.topics;
  }
  return null;
}

interface BatchAnalysisResult {
  topics: IdentifiedTopic[];
  quotaError: boolean;
}

async function analyzeOneBatch(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  postSummaries: string[],
  indexOffset: number,
  deadline?: number
): Promise<BatchAnalysisResult> {
  const postList = postSummaries.join("\n");

  const prompt = "你是日本新闻和流行文化分析专家。以下是从日本各社交媒体平台收集的热门帖子/趋势。\n\n" +
    "请分析这些内容，归纳出当前的热门话题（相似内容合并为同一话题）。\n\n" +
    "帖子列表：\n" + postList + "\n\n" +
    "请返回 JSON 数组，每个话题包含：\n" +
    "1. title_zh: 中文标题（简洁，10-20字，概括话题核心内容）\n" +
    "2. title_ja: 日文标题（对应的日文原文标题）\n" +
    "3. category: 分类，从以下选一个：娱乐、动漫、时尚、社会、科技、生活、萌宠\n" +
    "4. summary_zh: 中文摘要（1-2句话）\n" +
    "5. post_indices: 属于这个话题的帖子编号数组\n\n" +
    "严格返回 JSON，不要添加其他文字或 markdown：\n" +
    "[{\"title_zh\":\"...\",\"title_ja\":\"...\",\"category\":\"...\",\"summary_zh\":\"...\",\"post_indices\":[1,2]}]";

  try {
    const timeLeft = deadline ? Math.max(deadline - Date.now() - 8000, 5000) : 20000;
    const aiTimeout = Math.min(timeLeft, 20000);

    const resultPromise = model.generateContent(prompt);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI 调用超时(" + aiTimeout + "ms)")), aiTimeout)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);
    const text = result.response.text();
    let jsonText = text;
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonText = codeBlock[1];
    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      aiLog("AI 返回格式错误: " + text.slice(0, 200));
      return { topics: [], quotaError: false };
    }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title_zh: string; title_ja?: string; category: string; summary_zh: string; post_indices: number[];
    }>;

    const topics: IdentifiedTopic[] = parsed.map((t) => ({
      titleZh: t.title_zh || "未知话题",
      titleJa: t.title_ja || "",
      category: CATEGORIES.includes(t.category as Category)
        ? (t.category as Category) : "社会",
      summaryZh: t.summary_zh || "",
      postIndices: (t.post_indices || []).map((idx) => idx - 1 + indexOffset),
    }));

    aiLog("本批识别出 " + topics.length + " 个话题");
    return { topics, quotaError: false };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("Too Many Requests") || errMsg.includes("404") || errMsg.includes("not found")) {
      aiLog("AI 配额耗尽: " + errMsg.slice(0, 100));
      return { topics: [], quotaError: true };
    }
    aiLog("AI 分析失败: " + errMsg);
    return { topics: [], quotaError: false };
  }
}

function buildTopicsWithEngagement(
  topics: IdentifiedTopic[],
  allPosts: RawPost[]
): ProcessedTopic[] {
  return topics.map((topic) => {
    const relatedPosts = topic.postIndices
      .filter((idx) => idx >= 0 && idx < allPosts.length)
      .map((idx) => allPosts[idx]);

    let heatScore = 0;
    const sourceSet = new Set<string>();
    for (const post of relatedPosts) {
      heatScore += post.likes + post.reposts + post.comments + post.views;
      sourceSet.add(post.platform);
    }
    if (heatScore === 0) heatScore = 1000;

    // 日文标题：优先用 AI 输出的，没有则从关联帖子的原文中提取
    let titleJa = topic.titleJa;
    if (!titleJa && relatedPosts.length > 0) {
      titleJa = relatedPosts[0].content.slice(0, 50);
    }

    return {
      titleZh: topic.titleZh,
      titleJa: titleJa || topic.titleZh,
      category: topic.category,
      summaryZh: topic.summaryZh,
      sources: Array.from(sourceSet),
      heatScore,
      relatedPosts,
    };
  });
}

// ============ 基础降级处理 ============

function extractKeywords(text: string): string[] {
  const tags = text.match(/#[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFFA-Za-z0-9_]+/g) || [];
  const katakana = text.match(/[\u30A0-\u30FF]{3,}/g) || [];
  const kanji = text.match(/[\u4E00-\u9FFF]{2,}/g) || [];
  return [...tags.map(t => t.replace("#", "")), ...katakana, ...kanji];
}

function keywordSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

function basicGroupPosts(posts: RawPost[]): ProcessedTopic[] {
  const postKeywords = posts.map((p) => extractKeywords(p.content));
  const assigned = new Set<number>();
  const groups: Array<{ indices: number[]; keywords: string[] }> = [];

  for (let i = 0; i < posts.length; i++) {
    if (assigned.has(i)) continue;
    const group = { indices: [i], keywords: [...postKeywords[i]] };
    assigned.add(i);
    for (let j = i + 1; j < posts.length; j++) {
      if (assigned.has(j)) continue;
      const prefixMatch = posts[i].content.replace(/\s+/g, "").slice(0, 15) ===
        posts[j].content.replace(/\s+/g, "").slice(0, 15);
      const sim = keywordSimilarity(postKeywords[i], postKeywords[j]);
      if (prefixMatch || sim > 0.3) {
        group.indices.push(j);
        group.keywords.push(...postKeywords[j]);
        assigned.add(j);
      }
    }
    groups.push(group);
  }

  return groups.map((group) => {
    const groupPosts = group.indices.map((i) => posts[i]);
    let heatScore = 0;
    const sourceSet = new Set<string>();
    for (const p of groupPosts) {
      heatScore += p.likes + p.reposts + p.comments + p.views;
      sourceSet.add(p.platform);
    }
    if (heatScore === 0) heatScore = 1000;
    const title = groupPosts[0].contentZh || groupPosts[0].content.slice(0, 30);
    const titleJa = groupPosts[0].content.slice(0, 50);
    const category = guessCategory(groupPosts.map(p => p.content).join(" "));
    return {
      titleZh: title,
      titleJa,
      category: category as Category,
      summaryZh: groupPosts[0].contentZh || "来自" + Array.from(sourceSet).join("、") + "的热门话题",
      sources: Array.from(sourceSet),
      heatScore,
      relatedPosts: groupPosts,
    };
  });
}

function guessCategory(text: string): string {
  if (/猫|犬|ペット|柴犬|トイプードル|ハムスター|うさぎ|子猫|子犬|保護猫|保護犬|にゃん|わんこ|もふもふ|肉球|動物園|水族館|かわいい動物/i.test(text)) return "萌宠";
  if (/ファッション|コーデ|ブランド|ZARA|UNIQLO|GU|着こなし|コスメ|メイク|美容|スキンケア|ネイル|ヘアスタイル|おしゃれ|モデル|VOGUE|トレンドコーデ|春コーデ|夏コーデ|秋コーデ|冬コーデ|アクセサリー|ジュエリー|香水|パリコレ|ランウェイ/i.test(text)) return "时尚";
  if (/アニメ|漫画|ゲーム|声優|鬼滅|ワンピース|呪術|ポケモン|ゼルダ|ジャンプ|vtuber|にじさんじ|ホロライブ|原神|コミケ|同人|コスプレ|推し|ガンダム|ドラゴンボール|進撃|チェンソー|スパイファミリー|フリーレン|薬屋|ブルーロック|ダンジョン|異世界|転生|配信|ゲーマー|eスポーツ/i.test(text)) return "动漫";
  if (/ドラマ|映画|音楽|ライブ|アイドル|紅白|ジャニーズ|乃木坂|芸能|バラエティ|Netflix|YOASOBI|Ado|BTSキンプリ|Snow Man|SixTONES|なにわ男子|King|藤井|テレビ|NHK|フジ|日テレ|TBS|出演|歌|ダンス|MV|MVA|舞台|俳優|女優|主演|ドキュメンタリー|バンド|フェス|コンサート/i.test(text)) return "娱乐";
  if (/iPhone|Apple|Google|AI|ChatGPT|スマホ|テクノロジー|ロボット|宇宙|半導体|EV|Tesla|テスラ|アプリ|SNS|プログラミング|開発|量子|NVIDIA|GPU|5G|6G|クラウド|セキュリティ|サイバー|ブロックチェーン|仮想通貨|ビットコイン|API|データ/i.test(text)) return "科技";
  if (/桜|ラーメン|グルメ|旅行|天気|台風|花粉|温泉|カフェ|コンビニ|料理|クリスマス|お花見|紅葉|雪|レシピ|スイーツ|ケーキ|寿司|焼肉|居酒屋|ホテル|観光|祭り|花火|梅雨|夏|冬|春|秋|ショッピング|セール|健康|ダイエット|ヨガ|写真|カメラ|風景/i.test(text)) return "生活";
  return "社会";
}