import { DocumentType as PrismaDocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  Document,
  DocumentRevision,
  DocumentStatus,
  EditorDocument,
  EditorDocumentRevision,
} from "@/types";
import { validate } from "uuid";
import { getCachedRevision } from "./revision";

// ─── Shared select fragments ─────────────────────────────────────────────────

const authorSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
  email: true,
} as const;

const revisionAuthorSelect = {
  id: true,
  handle: true,
  name: true,
  image: true,
  email: true,
} as const;

const revisionsSelect = {
  select: {
    id: true,
    documentId: true,
    createdAt: true,
    author: { select: revisionAuthorSelect },
  },
  orderBy: { createdAt: "desc" as const },
};

const documentCoreSelect = {
  id: true,
  handle: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  published: true,
  collab: true,
  private: true,
  baseId: true,
  head: true,
  type: true,
  status: true,
  background_image: true,
  seriesId: true,
  seriesOrder: true,
} as const;

// Helper: map a raw prisma post row to a CloudDocument
const toCloudDocument = (
  post: Record<string, unknown> & {
    collab: boolean | null;
    head: string | null;
    status: string | null;
    revisions: {
      id: string;
      documentId: string;
      createdAt: Date;
      author: {
        id: string;
        handle: string | null;
        name: string | null;
        image: string | null;
        email: string | null;
      };
    }[];
  },
): Document => {
  const revisions = post.collab
    ? post.revisions
    : post.revisions.filter((r) => r.id === post.head);
  return {
    ...post,
    coauthors: [],
    revisions: revisions as DocumentRevision[],
    type: PrismaDocumentType.DOCUMENT,
    head: post.head || "",
    status: post.status as DocumentStatus | undefined,
  } as unknown as Document;
};

// ─────────────────────────────────────────────────────────────────────────────

// Transform: findPublishedDocuments → findPublishedPosts
const findPublishedPosts = async (limit?: number) => {
  const posts = await prisma.document.findMany({
    where: {
      published: true,
      type: PrismaDocumentType.DOCUMENT,
      NOT: { name: { equals: "readme", mode: "insensitive" } },
    },
    select: {
      ...documentCoreSelect,
      revisions: revisionsSelect,
      author: { select: authorSelect },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return posts.map(toCloudDocument);
};

// Find all posts (published and unpublished)
const findAllPosts = async (limit?: number) => {
  const posts = await prisma.document.findMany({
    where: {
      type: PrismaDocumentType.DOCUMENT,
      NOT: { name: { equals: "readme", mode: "insensitive" } },
    },
    select: {
      ...documentCoreSelect,
      revisions: revisionsSelect,
      author: { select: authorSelect },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return posts.map(toCloudDocument);
};

// Transform: findUserDocument → findUserPost
const findUserPost = async (
  handle: string,
  revisions?: "all" | string | null,
) => {
  // First, let's check if the document exists at all (without type filter)
  const anyDocument = await prisma.document.findFirst({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
    select: { id: true, name: true, type: true },
  });

  const post = await prisma.document.findFirst({
    where: {
      AND: [
        validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
        { type: PrismaDocumentType.DOCUMENT }, // Only regular documents, not directories
      ],
    },
    include: {
      revisions: {
        select: {
          id: true,
          documentId: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              handle: true,
              name: true,
              image: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      author: {
        select: {
          id: true,
          handle: true,
          name: true,
          image: true,
          email: true,
        },
      },
      // Remove coauthors for simple blog structure
    },
  });

  if (!post) {
    return null;
  }

  const cloudPost: Document = {
    ...post,
    coauthors: [], // Remove coauthor complexity
    type: PrismaDocumentType.DOCUMENT,
    head: post.head || "",
    revisions: post.revisions as DocumentRevision[],
    status: post.status as DocumentStatus,
  };

  if (revisions !== "all") {
    const revisionId = revisions ?? (post.head || "");
    const revision = cloudPost.revisions.find(
      (revision) => revision.id === revisionId,
    );
    if (!revision) return null;
    cloudPost.revisions = [revision];
    cloudPost.updatedAt = revision.createdAt;
  }

  return cloudPost;
};

// Transform: findDocumentsByAuthorId → findPostsByAuthorId
const findPostsByAuthorId = async (authorId: string) => {
  const posts = await prisma.document.findMany({
    where: { authorId, type: PrismaDocumentType.DOCUMENT },
    select: {
      ...documentCoreSelect,
      revisions: revisionsSelect,
      author: { select: authorSelect },
    },
    orderBy: { createdAt: "desc" },
  });

  return posts.map(toCloudDocument);
};

// Transform: findPublishedDocumentsByAuthorId → findPublishedPostsByAuthorId
const findPublishedPostsByAuthorId = async (authorId: string) => {
  const posts = await prisma.document.findMany({
    where: {
      authorId,
      published: true,
      type: PrismaDocumentType.DOCUMENT,
      NOT: { name: { equals: "readme", mode: "insensitive" } },
    },
    select: {
      ...documentCoreSelect,
      revisions: revisionsSelect,
      author: { select: authorSelect },
    },
    orderBy: { createdAt: "desc" },
  });

  return posts.map(toCloudDocument);
};

// Transform: createDocument → createPost
const createPost = async (data: Prisma.DocumentUncheckedCreateInput) => {
  if (!data.id) return null;

  // Ensure it's always a DOCUMENT type, not DIRECTORY
  const postData = {
    ...data,
    type: PrismaDocumentType.DOCUMENT,
    // For blog posts, we don't use parentId (flat structure)
    parentId: null,
  };

  await prisma.document.create({ data: postData });
  return findUserPost(data.id);
};

// Transform: updateDocument → updatePost
const updatePost = async (
  handle: string,
  data: Prisma.DocumentUncheckedUpdateInput,
) => {
  // Ensure type remains DOCUMENT
  const postData = {
    ...data,
    type: PrismaDocumentType.DOCUMENT,
  };

  await prisma.document.update({
    where: validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
    data: postData,
  });
  return findUserPost(handle, "all");
};

// Transform: deleteDocument → deletePost
const deletePost = async (handle: string) => {
  // Find and delete in a single transaction to ensure consistency
  return await prisma.$transaction(async (tx) => {
    // Find the post
    const post = await tx.document.findFirst({
      where: {
        AND: [
          validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
          { type: PrismaDocumentType.DOCUMENT },
        ],
      },
      select: { id: true },
    });

    if (!post) {
      throw new Error("Post not found");
    }

    // Delete the post
    return await tx.document.delete({
      where: { id: post.id },
    });
  });
};

// Transform: findEditorDocument → findEditorPost
const findEditorPost = async (handle: string) => {
  let post = await prisma.document.findFirst({
    where: {
      AND: [
        validate(handle) ? { id: handle } : { handle: handle.toLowerCase() },
        { type: PrismaDocumentType.DOCUMENT }, // Only regular documents, not directories
      ],
    },
  });

  if (!post) return null;

  let revision = post.head ? await getCachedRevision(post.head) : null;

  if (!revision) {
    // Head is missing or points to a deleted revision — recover from latest
    const latestRevision = await prisma.revision.findFirst({
      where: { documentId: post.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentId: true, createdAt: true, data: true },
    });
    if (latestRevision) {
      // Repair the document's head pointer
      await prisma.document.update({
        where: { id: post.id },
        data: { head: latestRevision.id },
      });
      revision = {
        ...latestRevision,
        data: latestRevision.data as unknown as EditorDocumentRevision["data"],
      };
      // Update post.head so the editorPost below is consistent
      post = { ...post, head: latestRevision.id };
    }
  }

  if (!revision) return null;

  const editorPost: EditorDocument = {
    ...post,
    data: revision.data as unknown as EditorDocument["data"],
    type: PrismaDocumentType.DOCUMENT,
    status: post.status as DocumentStatus,
    head: post.head || "",
  };

  return editorPost;
};

// Function to find cloud storage usage by author ID (posts only)
const findCloudStorageUsageByAuthorId = async (authorId: string) => {
  const postSizes = await prisma.$queryRaw<
    { id: string; name: string; size: number }[]
  >`
    SELECT
      d.id,
      d.name,
      (pg_column_size(d.*) + SUM(pg_column_size(r.*)))::float AS size
    FROM
      "Document" d
    LEFT JOIN
      "Revision" r
    ON
      d.id = r."documentId"
    WHERE
      d."authorId" = ${authorId}::uuid
      AND d."type" = 'DOCUMENT'
    GROUP BY 
      d.id
    ORDER BY 
      d."createdAt" DESC;
  `;

  return postSizes;
};

// Export functions with new post naming
export {
  createPost,
  deletePost,
  findAllPosts,
  findCloudStorageUsageByAuthorId,
  findEditorPost,
  findPostsByAuthorId,
  findPublishedPosts,
  findPublishedPostsByAuthorId,
  findUserPost,
  updatePost,
};
