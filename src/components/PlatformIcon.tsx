import { Platform } from "@/types";

// 平台图标和名称映射
const platformConfig: Record<Platform, { label: string; color: string }> = {
  x: { label: "𝕏", color: "bg-black text-white" },
  yahoo: { label: "Y!", color: "bg-purple-600 text-white" },
  tiktok: { label: "TT", color: "bg-gray-900 text-white" },
  instagram: { label: "IG", color: "bg-gradient-to-r from-purple-500 to-pink-500 text-white" },
};

export default function PlatformIcon({ platform }: { platform: Platform }) {
  const config = platformConfig[platform];
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0 ${config.color}`}
    >
      {config.label}
    </span>
  );
}
