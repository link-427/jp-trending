# AGENTS.md - AI 辅助开发规则

## 项目简介

日本热点排行榜 PWA 应用（手机可添加到主屏当 APP 用，电脑也能用浏览器打开）。从 4 个平台（X/Twitter、Yahoo! Japan、TikTok、Instagram）抓取日本区热门内容，生成中文排行榜。总榜 100 名，分类榜各 50 名，每条热点附带 5 条原帖链接。详细需求见 `prd-japan-trending.md`。

## 技术栈（必须严格遵守，不要自行替换）

- 框架：Next.js（App Router）
- 样式：Tailwind CSS
- PWA：next-pwa
- 数据库：Supabase
- 定时任务：Vercel Cron Jobs
- AI 能力：OpenAI API 或 Claude API
- 部署：Vercel
- 语言：TypeScript

## 项目结构

```
src/
  app/                  # Next.js App Router 页面
    page.tsx            # 首页（排行榜）
    topic/[id]/page.tsx # 热点详情页
    manifest.json       # PWA 配置
    api/                # 后端接口
      cron/             # 定时抓取任务
      topics/           # 热点数据接口
  components/           # 可复用组件
  lib/                  # 工具函数、数据库连接、AI 调用
  types/                # TypeScript 类型定义
public/
  icons/                # PWA 图标（各尺寸）
```

## 代码规范

- 所有代码文件使用 TypeScript，不要写 .js 文件
- 组件使用函数式组件 + React Hooks
- 样式全部用 Tailwind CSS 的 class，不要写单独的 CSS 文件
- 变量和函数命名用英文驼峰命名（camelCase），组件用大驼峰（PascalCase）
- 不要过度封装，简单直接优先
- 不要安装 PRD 和本文件未提到的第三方库，除非我明确要求

## 界面规范

- 界面语言全部是中文
- 整体风格简洁干净，参考微博热搜的排行榜样式
- 移动端优先设计，必须适配手机和电脑
- 热度标签颜色：爆=红色、热=橙色、新=蓝色
- 排名前 3 名要有高亮/大字体等突出样式
- 点击热点展开原帖用手风琴交互（展开/收起），不跳转新页面

## 数据库

- 使用 Supabase，只有 2 张表：trending_topics 和 topic_posts
- 表结构见 PRD 中"数据库表设计"部分
- 数据库操作使用 Supabase JS SDK（@supabase/supabase-js）
- 不要手写 SQL，用 SDK 提供的查询方法

## API 接口

- 所有 API 放在 src/app/api/ 目录下
- 返回格式统一为 JSON：`{ data: ..., error: ... }`
- 定时任务接口放在 src/app/api/cron/ 下

## 数据来源（4 个平台）

- X (Twitter)：日本区 Trending
- Yahoo! Japan：实时搜索热词
- TikTok：日本区热门标签
- Instagram：日本区热门标签
- 不要使用 5ch，不要自行添加其他平台

## 注意事项

- 每次只做我要求的功能，不要自行扩展其他功能
- 不要做用户画像、营销建议、趋势分析这些功能，已经砍掉了
- 遇到不确定的地方先问我，不要自己猜
- 每个步骤做完后告诉我怎么验证结果
- 代码中的注释用中文写
