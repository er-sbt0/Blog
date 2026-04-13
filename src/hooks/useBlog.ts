import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, documentsSelectors, RootState } from "@/store";
import { isReadmeDocument } from "@/constants";
import {
  createCloudDocument,
  createSeries,
  deleteCloudDocument,
  deleteSeries,
  loadSeries,
  updateCloudDocument,
  updateSeries,
} from "@/store/app";
import { DocumentCreateInput, DocumentUpdateInput } from "@/types";

// ===== POST HOOKS =====

export const usePosts = () => {
  const documents = useSelector((state: RootState) =>
    documentsSelectors.selectAll(state)
  );
  // Posts are cloud documents of type DOCUMENT that are not readme entries
  return documents.filter(
    (doc) =>
      doc.cloud !== undefined &&
      doc.cloud.type === "DOCUMENT" &&
      !isReadmeDocument(doc.cloud.name),
  );
};

export const usePublishedPosts = () => {
  const documents = useSelector((state: RootState) =>
    documentsSelectors.selectAll(state)
  );
  return documents.filter(
    (doc) =>
      doc.cloud?.published &&
      doc.cloud.type === "DOCUMENT" &&
      !isReadmeDocument(doc.cloud.name),
  );
};

export const usePostActions = () => {
  const dispatch = useDispatch<AppDispatch>();

  return {
    createPost: (postData: DocumentCreateInput) =>
      dispatch(createCloudDocument(postData)),
    updatePost: (id: string, data: DocumentUpdateInput) =>
      dispatch(updateCloudDocument({ id, partial: data })),
    deletePost: (id: string) => dispatch(deleteCloudDocument(id)),
  };
};

// ===== SERIES HOOKS =====

export const useSeries = () => {
  const series = useSelector((state: RootState) => state.series);
  return series;
};

export const useSeriesActions = () => {
  const dispatch = useDispatch<AppDispatch>();

  return {
    loadSeries: () => dispatch(loadSeries()),
    createSeries: (seriesData: { title: string; description?: string }) =>
      dispatch(createSeries(seriesData)),
    updateSeries: (
      id: string,
      data: { title?: string; description?: string },
    ) => dispatch(updateSeries({ id, data })),
    deleteSeries: (id: string) => dispatch(deleteSeries(id)),
  };
};

// ===== COMBINED BLOG HOOKS =====

export const useBlogData = () => {
  const posts = usePosts();
  const series = useSeries();
  const publishedPosts = usePublishedPosts();

  return {
    posts,
    series,
    publishedPosts,
    totalPosts: posts.length,
    totalSeries: series.length,
    totalPublishedPosts: publishedPosts.length,
  };
};

export const useBlogActions = () => {
  const postActions = usePostActions();
  const seriesActions = useSeriesActions();

  return {
    ...postActions,
    ...seriesActions,
    loadBlogData: () => {
      seriesActions.loadSeries();
    },
  };
};
