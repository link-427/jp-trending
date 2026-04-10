import { HeatTag } from "@/types";

const tagStyles: Record<HeatTag, string> = {
  "爆": "bg-red-500 text-white",
  "热": "bg-orange-500 text-white",
  "新": "bg-blue-500 text-white",
};

export default function HeatTagBadge({ tag }: { tag: HeatTag }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${tagStyles[tag]}`}
    >
      {tag}
    </span>
  );
}
