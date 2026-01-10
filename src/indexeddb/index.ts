"use client";
import { IDB_KEY } from "./constants";
import { getActions, getConnection } from "./idb";
import { IndexedDBConfig } from "./interfaces";
import { EditorDocument, EditorDocumentRevision } from "@/types";

export interface AttachmentContentCache {
  id: string; // filename
  url: string;
  content: string;
  mimetype: string;
  size: number;
  cachedAt: number; // timestamp
}

async function setupIndexedDB(config: IndexedDBConfig) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      await getConnection(config);
      window[IDB_KEY] = { init: 1, config };
      resolve();
    } catch (e) {
      console.error(e);
      reject(e);
    }
  });
}

export function getStore<T>(storeName: string) {
  return getActions<T>(storeName);
}

const idbConfig = {
  databaseName: "matheditor",
  version: 4,
  stores: [
    {
      name: "documents",
      id: { keyPath: "id" },
      indices: [
        {
          name: "handle",
          keyPath: "handle",
          options: { unique: true },
        },
        { name: "name", keyPath: "name" },
        { name: "data", keyPath: "data" },
        { name: "createdAt", keyPath: "createdAt" },
        { name: "updatedAt", keyPath: "updatedAt" },
        { name: "baseId", keyPath: "baseId" },
        { name: "head", keyPath: "head" },
      ],
    },
    {
      name: "revisions",
      id: { keyPath: "id" },
      indices: [
        { name: "documentId", keyPath: "documentId" },
        { name: "createdAt", keyPath: "createdAt" },
      ],
    },
    {
      name: "notesCanvas",
      id: { keyPath: "id" },
      indices: [
        { name: "name", keyPath: "name" },
        { name: "createdAt", keyPath: "createdAt" },
        { name: "updatedAt", keyPath: "updatedAt" },
      ],
    },
    {
      name: "attachmentContent",
      id: { keyPath: "id" },
      indices: [
        { name: "url", keyPath: "url", options: { unique: true } },
        { name: "cachedAt", keyPath: "cachedAt" },
      ],
    },
  ],
};

if (typeof window !== "undefined") {
  setupIndexedDB(idbConfig).catch(console.error);
}
export const documentDB = getStore<EditorDocument>("documents");
export const revisionDB = getStore<EditorDocumentRevision>("revisions");
export const attachmentContentDB = getStore<AttachmentContentCache>(
  "attachmentContent",
);

export default documentDB;
