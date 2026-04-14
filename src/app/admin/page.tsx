"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function runFetch() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/refresh-trending", { method: "POST" });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        setResult(JSON.stringify(data, null, 2));
      } catch {
        setResult("服务器返回非JSON响应 (HTTP " + res.status + "):\n" + text.slice(0, 500));
      }
    } catch (err) {
      setResult("请求失败: " + err);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto bg-white min-h-screen p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-gray-900">管理后台</h1>
        <Link href="/" className="text-sm text-blue-500">返回首页</Link>
      </div>
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h2 className="font-medium text-gray-800 mb-2">数据抓取</h2>
          <p className="text-sm text-gray-500 mb-3">点击按钮触发数据抓取</p>
          <button
            onClick={runFetch}
            disabled={loading}
            className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {loading ? "执行中..." : "手动触发抓取"}
          </button>
        </div>
        {result && (
          <pre className="p-4 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto whitespace-pre-wrap">
            {result}
          </pre>
        )}
      </div>
    </div>
  );
}
