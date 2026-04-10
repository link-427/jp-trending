"use client";

import type { Category } from "@/types";

const categories: Category[] = ["政治", "娱乐", "动漫", "体育", "社会", "科技", "生活"];
const allTabs = ["总榜", ...categories];

export default function CategoryTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-gray-100 scrollbar-hide">
      {allTabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            active === tab
              ? "bg-red-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
