import {
  createAction,
  createAsyncThunk,
  createSlice,
  PayloadAction,
} from "@reduxjs/toolkit";
import NProgress from "nprogress";
import documentDB, { revisionDB } from "@/indexeddb";
import {
  Alert,
  Announcement,
  AppState,
  BackupDocument,
  CloudDocumentRevision,
  Document,
  DocumentCreateInput,
  DocumentStorageUsage,
  DocumentUpdateInput,
  EditorDocument,
  EditorDocumentRevision,
  EMPTY_EDITOR_STATE,
  UserDocument,
} from "../types";
import { Series } from "@/types";
import { apiClient } from "@/api";
import { validate } from "uuid";
import { duplicateDocument } from "./app/duplicateDocument";
import {
  createSeries,
  deleteSeries,
  loadSeries,
  updateSeries,
} from "./thunks/seriesThunks";
import { alert, updateUser } from "./thunks/userThunks";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

const initialState: AppState = {
  documents: [],
  series: [],
  ui: {
    announcements: [],
    alerts: [],
    initialized: false,
    documentsLoading: false,
    drawer: false,
    page: 1,
    diff: {
      open: false,
    },
    isDirty: false,
    attachmentPreview: null,
    attachmentModified: null,
  },
};

export const triggerAutosaveBeforeNavigation = createAction<
  { targetUrl: string }
>("app/triggerAutosaveBeforeNavigation");

export const load = createAsyncThunk("app/load", async (_, thunkAPI) => {
  // Load series LAST so it's the freshest data
  await Promise.allSettled([
    thunkAPI.dispatch(loadSession()),
    thunkAPI.dispatch(loadLocalDocuments()),
  ]);

  // Load cloud documents, then series to ensure series.posts is authoritative
  await thunkAPI.dispatch(loadCloudDocuments());
  await thunkAPI.dispatch(loadSeries());
});

export const loadSession = createAsyncThunk(
  "app/loadSession",
  async (_, thunkAPI) => {
    try {
      const data = await apiClient.auth.getSession();
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "session not found",
        });
      }
      if (!data.user) return thunkAPI.fulfillWithValue(undefined);
      const user = {
        id: data.user.id,
        handle: data.user.handle,
        name: data.user.name,
        email: data.user.email,
        image: data.user.image,
      };
      return thunkAPI.fulfillWithValue(user);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const loadLocalDocuments = createAsyncThunk(
  "app/loadLocalDocuments",
  async (_, thunkAPI) => {
    try {
      const documents = await documentDB.getAll();
      const revisions = await revisionDB.getAll();
      const localDocuments: EditorDocument[] = await Promise.all(
        documents.map(async (document) => {
          const { data, ...rest } = document;
          const backupDocument: BackupDocument = {
            ...document,
            revisions: revisions.filter((revision) =>
              revision.documentId === document.id
            ),
          };
          const localRevisions = backupDocument.revisions.map((
            { data, ...rest },
          ) => ({
            ...rest,
            // Ensure dates are serialized to strings
            createdAt: rest.createdAt instanceof Date
              ? rest.createdAt.toISOString()
              : rest.createdAt,
          }));
          const localDocument: EditorDocument = {
            ...rest,
            // Ensure dates are serialized to strings
            createdAt: rest.createdAt instanceof Date
              ? rest.createdAt.toISOString()
              : rest.createdAt,
            updatedAt: rest.updatedAt instanceof Date
              ? rest.updatedAt.toISOString()
              : rest.updatedAt,
            data: EMPTY_EDITOR_STATE,
            revisions: localRevisions.map((rev) => ({
              ...rev,
              data: EMPTY_EDITOR_STATE,
            })),
          };
          return localDocument;
        }),
      );
      return thunkAPI.fulfillWithValue(localDocuments);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const loadCloudDocuments = createAsyncThunk(
  "app/loadCloudDocuments",
  async (arg: Document[] | undefined, thunkAPI) => {
    try {
      NProgress.start();
      if (arg) {
        return thunkAPI.fulfillWithValue(
          arg,
        );
      }
      const data = await apiClient.documents.list();
      return thunkAPI.fulfillWithValue(data ?? []);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export async function fetchLocalStorageUsage(): Promise<
  DocumentStorageUsage[]
> {
  const documents = await documentDB.getAll();
  const revisions = await revisionDB.getAll();
  const localStorageUsage: DocumentStorageUsage[] = [];
  documents.sort((a, b) => {
    const first = a.updatedAt;
    const second = b.updatedAt;
    if (!first && !second) return 0;
    if (!first) return 1;
    if (!second) return -1;
    return new Date(second).getTime() - new Date(first).getTime();
  }).forEach((document) => {
    const backupDocument: BackupDocument = {
      ...document,
      revisions: revisions.filter((revision) =>
        revision.documentId === document.id
      ),
    };
    const backupDocumentSize = new Blob([JSON.stringify(backupDocument)]).size;
    localStorageUsage.push({
      id: document.id,
      name: document.name,
      size: backupDocumentSize,
    });
  });
  return localStorageUsage;
}

export async function fetchCloudStorageUsage(): Promise<
  DocumentStorageUsage[]
> {
  const data = await apiClient.storage.getUsage();
  if (!data) throw new Error("failed to get cloud storage usage");
  return data;
}

export const getLocalStorageUsage = createAsyncThunk(
  "app/getLocalStorageUsage",
  async (_, thunkAPI) => {
    try {
      return thunkAPI.fulfillWithValue(await fetchLocalStorageUsage());
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getCloudStorageUsage = createAsyncThunk(
  "app/getCloudStorageUsage",
  async (_, thunkAPI) => {
    try {
      return thunkAPI.fulfillWithValue(await fetchCloudStorageUsage());
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getCloudDocumentThumbnail = createAsyncThunk(
  "app/getCloudDocumentThumbnail",
  async (id: string, thunkAPI) => {
    try {
      const data = await apiClient.thumbnails.get(id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "thumbnail not found",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getLocalDocument = createAsyncThunk(
  "app/getLocalDocument",
  async (id: string, thunkAPI) => {
    try {
      const isValidId = validate(id);
      const document = isValidId
        ? await documentDB.getByID(id)
        : await documentDB.getOneByKey("handle", id);
      if (!document) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      return thunkAPI.fulfillWithValue(document);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getLocalRevision = createAsyncThunk(
  "app/getLocalRevision",
  async (id: string, thunkAPI) => {
    try {
      const revision = await revisionDB.getByID(id);
      if (!revision) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "revision not found",
        });
      }
      return thunkAPI.fulfillWithValue(revision);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getLocalDocumentRevisions = createAsyncThunk(
  "app/getLocalDocumentRevisions",
  async (id: string, thunkAPI) => {
    try {
      const revisions = await revisionDB.getManyByKey("documentId", id);
      return thunkAPI.fulfillWithValue(revisions);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const getCloudDocument = createAsyncThunk(
  "app/getCloudDocument",
  async (id: string, thunkAPI) => {
    try {
      NProgress.start();
      const data = await apiClient.documents.get(id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const getCloudRevision = createAsyncThunk(
  "app/getCloudRevision",
  async (id: string, thunkAPI) => {
    try {
      NProgress.start();
      const data = await apiClient.revisions.get(id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "revision not found",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const forkLocalDocument = createAsyncThunk(
  "app/forkLocalDocument",
  async (
    arg: { id: string; revisionId?: string | null },
    thunkAPI,
  ) => {
    try {
      const { id, revisionId } = arg;
      const isValidId = validate(id);
      const document = isValidId
        ? await documentDB.getByID(id)
        : await documentDB.getOneByKey("handle", id);
      if (!document) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      if (!revisionId || revisionId === document.head) {
        return thunkAPI
          .fulfillWithValue(document);
      }
      const revision = await revisionDB.getByID(revisionId);
      if (!revision) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "revision not found",
        });
      }
      return thunkAPI.fulfillWithValue({
        ...document,
        head: revision.id,
        updatedAt: revision.createdAt,
        data: revision.data,
      });
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const forkCloudDocument = createAsyncThunk(
  "app/forkCloudDocument",
  async (
    arg: { id: string; revisionId?: string | null },
    thunkAPI,
  ) => {
    try {
      const { id, revisionId } = arg;
      NProgress.start();
      const data = await apiClient.documents.fork(id, revisionId);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const createLocalDocument = createAsyncThunk(
  "app/createLocalDocument",
  async (arg: DocumentCreateInput, thunkAPI) => {
    try {
      const {
        coauthors,
        published,
        collab,
        private: isPrivate,
        revisions,
        ...document
      } = arg;
      const id = await documentDB.add(document);
      if (!id) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to create document",
        });
      }
      const { data, ...rest } = document;
      if (revisions) await revisionDB.addMany(revisions);
      const localDocumentRevisions = (revisions ?? []).map((
        { data, ...rest },
      ) => rest);
      const localDocument: EditorDocument = {
        ...rest,
        data: EMPTY_EDITOR_STATE,
        revisions: localDocumentRevisions.map((rev) => ({
          ...rev,
          data: EMPTY_EDITOR_STATE,
        })),
      };
      return thunkAPI.fulfillWithValue(localDocument);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const createLocalRevision = createAsyncThunk(
  "app/createLocalRevision",
  async (revision: EditorDocumentRevision, thunkAPI) => {
    try {
      const id = await revisionDB.add(revision);
      if (!id) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to create revision",
        });
      }
      const { data, ...rest } = revision;
      return thunkAPI.fulfillWithValue(rest);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const createCloudDocument = createAsyncThunk(
  "app/createCloudDocument",
  async (arg: DocumentCreateInput, thunkAPI) => {
    try {
      NProgress.start();
      const data = await apiClient.documents.create(arg);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to create document",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const createCloudRevision = createAsyncThunk(
  "app/createCloudRevision",
  async (revision: EditorDocumentRevision, thunkAPI) => {
    try {
      NProgress.start();
      const data = await apiClient.revisions.create(revision);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to create revision",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const syncLocalToCloud = createAsyncThunk(
  "app/syncLocalToCloud",
  async (
    payload: {
      id: string;
      localHead: string;
      updatedAt: string | Date;
      parentId?: string | null;
    },
    thunkAPI,
  ) => {
    try {
      NProgress.start();
      const { id, localHead, updatedAt, parentId } = payload;

      // Regular edits update documentDB (not revisionDB), so read from there
      const localDoc = await documentDB.getByID(id);
      if (!localDoc?.data) {
        return thunkAPI.rejectWithValue({
          title: "Sync failed",
          subtitle: "Local document not found",
        });
      }

      const revision: EditorDocumentRevision = {
        id: localHead,
        documentId: id,
        data: localDoc.data,
        createdAt: updatedAt,
      };

      try {
        await thunkAPI.dispatch(createCloudRevision(revision)).unwrap();
      } catch (e) {
        return thunkAPI.rejectWithValue(e);
      }

      try {
        await thunkAPI.dispatch(
          updateCloudDocument({
            id,
            partial: { head: localHead, updatedAt, parentId },
          }),
        ).unwrap();
      } catch (e) {
        return thunkAPI.rejectWithValue(e);
      }

      return thunkAPI.fulfillWithValue(undefined);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const updateLocalDocument = createAsyncThunk(
  "app/updateLocalDocument",
  async (
    arg: { id: string; partial: DocumentUpdateInput },
    thunkAPI,
  ) => {
    try {
      const { id, partial } = arg;
      const {
        coauthors,
        published,
        collab,
        private: isPrivate,
        revisions,
        ...document
      } = partial;
      const result = await documentDB.patch(id, document);
      if (!result) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to update document",
        });
      }
      const payload: { id: string; partial: Partial<EditorDocument> } = {
        id,
        partial: { ...document },
      };
      if (revisions) {
        await revisionDB.addMany(revisions);
        const localDocumentRevisions = (revisions ?? []).map((
          { data, ...rest },
        ) => rest);
        payload.partial.revisions = localDocumentRevisions.map((rev) => ({
          ...rev,
          data: EMPTY_EDITOR_STATE,
        }));
      }

      return thunkAPI.fulfillWithValue(payload);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const updateCloudDocument = createAsyncThunk(
  "app/updateCloudDocument",
  async (
    arg: { id: string; partial: DocumentUpdateInput },
    thunkAPI,
  ) => {
    try {
      NProgress.start();
      const { id, partial } = arg;
      const data = await apiClient.documents.update(id, partial);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to update document",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const deleteLocalDocument = createAsyncThunk(
  "app/deleteLocalDocument",
  async (id: string, thunkAPI) => {
    try {
      await documentDB.deleteByID(id);
      await revisionDB.deleteManyByKey("documentId", id);
      return thunkAPI.fulfillWithValue(id);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const deleteLocalRevision = createAsyncThunk(
  "app/deleteLocalRevision",
  async (arg: { id: string; documentId: string }, thunkAPI) => {
    try {
      await revisionDB.deleteByID(arg.id);
      return thunkAPI.fulfillWithValue(arg);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

export const deleteCloudDocument = createAsyncThunk(
  "app/deleteCloudDocument",
  async (id: string, thunkAPI) => {
    try {
      NProgress.start();
      const data = await apiClient.documents.delete(id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to delete document",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const deleteCloudRevision = createAsyncThunk(
  "app/deleteCloudRevision",
  async (arg: { id: string; documentId: string }, thunkAPI) => {
    try {
      NProgress.start();
      const data = await apiClient.revisions.delete(arg.id);
      if (!data) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "failed to delete revision",
        });
      }
      return thunkAPI.fulfillWithValue(data);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    } finally {
      NProgress.done();
    }
  },
);

export const getDocumentById = createAsyncThunk(
  "app/getDocumentById",
  async (id: string, thunkAPI) => {
    try {
      const state = thunkAPI.getState() as AppState;
      const userDocument = state.documents.find((doc) => doc.id === id);
      if (!userDocument) {
        return thunkAPI.rejectWithValue({
          title: "Something went wrong",
          subtitle: "document not found",
        });
      }
      return thunkAPI.fulfillWithValue(userDocument);
    } catch (error: unknown) {
      console.error(error);
      return thunkAPI.rejectWithValue({
        title: "Something went wrong",
        subtitle: toErrorMessage(error),
      });
    }
  },
);

// Series and user/alert thunks are defined in ./thunks/seriesThunks and ./thunks/userThunks
export { createSeries, deleteSeries, loadSeries, updateSeries };
export { alert, updateUser };

// Add a special action to handle the auto-save before navigation
export const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AppState["user"]>) {
      state.user = action.payload;
    },
    announce: (state, action: PayloadAction<Announcement>) => {
      state.ui.announcements.push(action.payload);
    },
    clearAnnouncement: (state) => {
      state.ui.announcements.shift();
    },
    clearAlert: (state) => {
      state.ui.alerts.shift();
    },
    toggleDrawer: (state, action: PayloadAction<boolean | undefined>) => {
      if (action.payload !== undefined) state.ui.drawer = action.payload;
      else state.ui.drawer = !state.ui.drawer;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.ui.page = action.payload;
    },
    setDiff: (
      state,
      action: PayloadAction<Partial<AppState["ui"]["diff"]>>,
    ) => {
      state.ui.diff = { ...state.ui.diff, ...action.payload };
    },
    setDirty: (state, action: PayloadAction<boolean>) => {
      state.ui.isDirty = action.payload;
    },
    openAttachmentPreview: (
      state,
      action: PayloadAction<{
        nodeKey?: string | null;
        url: string;
        filename: string;
        mimetype: string;
      }>,
    ) => {
      state.ui.attachmentPreview = {
        open: true,
        nodeKey: action.payload.nodeKey ?? null,
        url: action.payload.url,
        filename: action.payload.filename,
        mimetype: action.payload.mimetype,
      };
    },
    closeAttachmentPreview: (state) => {
      state.ui.attachmentPreview = null;
    },
    notifyAttachmentModified: (
      state,
      action: PayloadAction<{ url: string }>,
    ) => {
      state.ui.attachmentModified = {
        url: action.payload.url,
        timestamp: Date.now(),
      };
    },
    clearAttachmentModified: (state) => {
      state.ui.attachmentModified = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(load.fulfilled, (state, action) => {
        state.documents = state.documents.sort((a, b) => {
          const first = a.local?.updatedAt || a.cloud?.updatedAt;
          const second = b.local?.updatedAt || b.cloud?.updatedAt;
          if (!first && !second) return 0;
          if (!first) return 1;
          if (!second) return -1;
          return new Date(second).getTime() -
            new Date(first).getTime();
        });
        state.ui.initialized = true;
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        const user = action.payload;
        state.user = user;
      })
      .addCase(loadLocalDocuments.fulfilled, (state, action) => {
        const documents = action.payload;
        documents.forEach((document) => {
          const userDocument = state.documents.find((doc) =>
            doc.id === document.id
          );
          if (!userDocument) {
            state.documents.push({
              id: document.id,
              local: document,
            });
          } else userDocument.local = document;
        });
      })
      .addCase(loadCloudDocuments.pending, (state) => {
        state.ui.documentsLoading = true;
      })
      .addCase(loadCloudDocuments.fulfilled, (state, action) => {
        state.ui.documentsLoading = false;
        const documents = action.payload;
        documents.forEach((document) => {
          const userDocument = state.documents.find((doc) =>
            doc.id === document.id
          );
          if (!userDocument) {
            state.documents.push({
              id: document.id,
              cloud: document,
            });
          } else {
            userDocument.cloud = document;
          }
        });
      })
      .addCase(loadCloudDocuments.rejected, (state) => {
        state.ui.documentsLoading = false;
      })
      .addCase(getLocalDocument.fulfilled, (state, action) => {
        const document = action.payload;
        const userDocument = state.documents.find((doc) =>
          doc.id === document.id
        );
        if (!userDocument) {
          state.documents.unshift({ id: document.id, local: document });
        } else {
          userDocument.local = document;
        }
      })
      .addCase(getCloudDocument.fulfilled, (state, action) => {
        const { cloudDocument } = action.payload;
        const userDocument = state.documents.find((doc) =>
          doc.id === cloudDocument.id
        );
        if (!userDocument) {
          state.documents.unshift({
            id: cloudDocument.id,
            cloud: cloudDocument,
          });
        } else {
          userDocument.cloud = cloudDocument;
        }
      })
      .addCase(getCloudRevision.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(forkCloudDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(createLocalDocument.fulfilled, (state, action) => {
        const document = action.payload;
        const userDocument = state.documents.find((doc) =>
          doc.id === document.id
        );
        if (!userDocument) {
          state.documents.unshift({
            id: document.id,
            local: document,
          });
        } else userDocument.local = document;
      })
      .addCase(createLocalRevision.fulfilled, (state, action) => {
        const revision = action.payload;
        const userDocument = state.documents.find((doc) =>
          doc.id === revision.documentId
        );
        if (!userDocument) return;
        const localDocument = userDocument.local;
        if (!localDocument) return;
        if (!localDocument.revisions) localDocument.revisions = [];
        localDocument.revisions?.unshift({
          ...revision,
          data: EMPTY_EDITOR_STATE,
        });
      })
      .addCase(createCloudDocument.fulfilled, (state, action) => {
        const document = action.payload;
        const userDocument = state.documents.find((doc) =>
          doc.id === document.id
        );
        if (!userDocument) {
          state.documents.unshift({
            id: document.id,
            cloud: document,
          });
        } else {
          userDocument.cloud = document;
        }
      })
      .addCase(createCloudDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(createCloudRevision.fulfilled, (state, action) => {
        const revision = action.payload;
        const document = state.documents.find((doc) =>
          doc.id === revision.documentId
        );
        if (!document?.cloud) return;
        document.cloud.revisions.unshift(revision);
      })
      .addCase(createCloudRevision.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(updateLocalDocument.fulfilled, (state, action) => {
        const { id, partial } = action.payload;
        const userDocument = state.documents.find((doc) => doc.id === id);
        if (!userDocument) return;
        const localDocument = userDocument.local;
        if (!localDocument) return;
        Object.assign(localDocument, partial);
      })
      .addCase(updateCloudDocument.fulfilled, (state, action) => {
        const document = action.payload;
        const userDocument = state.documents.find((doc) =>
          doc.id === document.id
        );
        if (!userDocument) {
          state.documents.unshift({
            id: document.id,
            cloud: document,
          });
        } else {
          userDocument.cloud = document;
        }
      })
      .addCase(updateCloudDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(deleteLocalDocument.fulfilled, (state, action) => {
        const id = action.payload;
        const userDocument = state.documents.find((doc) => doc.id === id);
        if (!userDocument) return;
        if (!userDocument.cloud) {
          state.documents.splice(
            state.documents.indexOf(userDocument),
            1,
          );
        } else delete userDocument.local;

        // Also remove the post from any series that contains it
        if (state.series && state.series.length > 0) {
          state.series.forEach((series) => {
            if (series.posts && series.posts.length > 0) {
              series.posts = series.posts.filter((post) => post.id !== id);
            }
          });
        }
      })
      .addCase(deleteLocalRevision.fulfilled, (state, action) => {
        const { id, documentId } = action.payload;
        const userDocument = state.documents.find((doc) =>
          doc.id === documentId
        );
        if (!userDocument) return;
        const localDocument = userDocument.local;
        if (!localDocument) return;
        if (!localDocument.revisions) return;
        const revision = localDocument.revisions.find((
          revision: EditorDocumentRevision,
        ) => revision.id === id);
        if (!revision) return;
        localDocument.revisions = localDocument.revisions
          .filter((revision: EditorDocumentRevision) => revision.id !== id);
      })
      .addCase(deleteCloudDocument.fulfilled, (state, action) => {
        const id = action.payload;
        const userDocument = state.documents.find((doc) => doc.id === id);
        if (!userDocument) return;
        const index = state.documents.indexOf(userDocument);
        if (!userDocument.local) state.documents.splice(index, 1);
        else delete userDocument.cloud;

        // Also remove the post from any series that contains it
        if (state.series && state.series.length > 0) {
          state.series.forEach((series) => {
            if (series.posts && series.posts.length > 0) {
              series.posts = series.posts.filter((post) => post.id !== id);
            }
          });
        }
      })
      .addCase(deleteCloudDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(deleteCloudRevision.fulfilled, (state, action) => {
        const { id, documentId } = action.payload;
        const userDocument = state.documents.find((doc) =>
          doc.id === documentId
        );
        if (!userDocument) return;
        const cloudDocument = userDocument.cloud;
        if (!cloudDocument) return;
        const revision = cloudDocument.revisions.find((
          revision: CloudDocumentRevision,
        ) => revision.id === id);
        if (!revision) return;
        cloudDocument.revisions = cloudDocument.revisions
          .filter((revision) => revision.id !== id);
      })
      .addCase(deleteCloudRevision.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const user = action.payload;
        state.user = user;
      })
      .addCase(updateUser.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(duplicateDocument.fulfilled, (state, action) => {
        // Add the duplicated document to the state
        const duplicatedDoc = action.payload;
        const newUserDocument: UserDocument = {
          id: duplicatedDoc.id,
          local: duplicatedDoc,
        };
        state.documents.push(newUserDocument);
      })
      .addCase(duplicateDocument.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(alert.pending, (state, action) => {
        const alert = action.meta.arg;
        state.ui.alerts.push(alert);
      })
      .addCase(alert.fulfilled, (state) => {
        state.ui.alerts.shift();
      })
      .addCase(alert.rejected, (state, action) => {
        state.ui.alerts.shift();
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      // ===== SERIES MANAGEMENT REDUCER CASES =====
      .addCase(loadSeries.fulfilled, (state, action) => {
        state.series = action.payload || [];
      })
      .addCase(loadSeries.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(createSeries.fulfilled, (state, action) => {
        const series = action.payload;
        if (series) {
          state.series.unshift(series);
        }
      })
      .addCase(createSeries.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(updateSeries.fulfilled, (state, action) => {
        const updatedSeries = action.payload;
        if (updatedSeries) {
          const index = state.series.findIndex((s) =>
            s.id === updatedSeries.id
          );
          if (index !== -1) {
            state.series[index] = updatedSeries;
          }
        }
      })
      .addCase(updateSeries.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      })
      .addCase(deleteSeries.fulfilled, (state, action) => {
        const deletedSeriesId = action.payload;
        if (deletedSeriesId) {
          state.series = state.series.filter((s) => s.id !== deletedSeriesId);
        }
      })
      .addCase(deleteSeries.rejected, (state, action) => {
        const message = action.payload as {
          title: string;
          subtitle: string;
        };
        state.ui.announcements.push({ message });
      });
  },
});

// Re-export the duplicateDocument action
export { duplicateDocument };

export default appSlice.reducer;
