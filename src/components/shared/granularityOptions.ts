import type { PartitionGranularity } from "@/types/partitioning";

export const granularityOptions: {
  value: PartitionGranularity;
  label: string;
  description: string;
}[] = [
  { value: "day", label: "Daily", description: "Group posts by day" },
  { value: "week", label: "Weekly", description: "Group posts by week" },
  { value: "month", label: "Monthly", description: "Group posts by month" },
  {
    value: "quarter",
    label: "Quarterly",
    description: "Group posts by 3-month periods (default)",
  },
  {
    value: "halfyear",
    label: "Semi-annual",
    description: "Group posts by 6-month periods",
  },
  { value: "year", label: "Yearly", description: "Group posts by year" },
];
