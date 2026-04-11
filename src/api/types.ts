/**
 * API-layer types that supplement the shared `src/types.ts` definitions.
 * Covers routes whose response shapes are not already represented there.
 */

export interface ApiError {
  title: string;
  subtitle?: string;
}

// -----------------------------------------------------------------------
// Series – single item (GET /api/series/:id)
// -----------------------------------------------------------------------
export interface GetOneSeriesResponse {
  data?: import("@/types").Series;
  error?: ApiError;
}

// -----------------------------------------------------------------------
// Series posts (PATCH /api/series/:id/posts)
// -----------------------------------------------------------------------
export interface SeriesPostUpdate {
  postId: string;
  order: number;
}

export interface UpdateSeriesPostsInput {
  postsToAdd: SeriesPostUpdate[];
  postsToRemove: string[];
}

export interface UpdateSeriesPostsResponse {
  error?: ApiError;
}

// -----------------------------------------------------------------------
// Document times (POST /api/documents/update-times)
// -----------------------------------------------------------------------
export interface DocumentTimeUpdate {
  id: string;
  createdAt: Date | string;
}

export interface UpdateDocumentTimesInput {
  updates: DocumentTimeUpdate[];
}

// -----------------------------------------------------------------------
// Attachments (POST /api/documents/:id/attachments)
// -----------------------------------------------------------------------
export interface AttachmentData {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface UploadAttachmentResponse {
  data?: AttachmentData;
  error?: ApiError;
}

// -----------------------------------------------------------------------
// Notes / canvas (GET /api/notes/canvas, POST /api/notes)
// -----------------------------------------------------------------------
export interface NotesCanvas {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notes: any[];
}

export interface GetNotesCanvasResponse {
  data?: NotesCanvas;
  error?: ApiError;
}

export interface CreateNoteInput {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  title?: string;
  content: string;
  color: string;
  zIndex: number;
}

export interface CreateNoteResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  error?: ApiError;
}

// -----------------------------------------------------------------------
// Series delete (DELETE /api/series/:id) – inline type in seriesThunks
// -----------------------------------------------------------------------
export interface DeleteSeriesResponse {
  data?: string;
  error?: ApiError;
}
