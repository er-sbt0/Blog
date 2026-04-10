// Re-export the shared PartitionControl under the old name so that
// SeriesSearchAndControls (and any other consumer) keeps working without changes.
export { PartitionControl as PostsPartitionControl } from "@/components/PostsList/components/PartitionControl";
