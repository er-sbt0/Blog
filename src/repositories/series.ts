import { DocumentType as PrismaDocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  Document,
  type DocumentType,
  Series,
  SeriesCreateInput,
  SeriesUpdateInput,
} from "@/types";

// Standard author selection for consistency
const authorSelect = {
  id: true,
  handle: true,
  name: true,
  email: true,
  image: true,
};

// Find all series with author relations
export async function findAllSeries(): Promise<Series[]> {
  const series = await prisma.series.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      author: {
        select: authorSelect,
      },
      posts: {
        select: {
          id: true,
          handle: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          published: true,
          private: true,
          head: true,
          collab: true,
          status: true,
          seriesId: true,
          seriesOrder: true,
          background_image: true,
          sort_order: true,
          baseId: true,
          parentId: true,
          type: true,
          author: {
            select: authorSelect,
          },
          coauthors: {
            select: {
              user: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          revisions: {
            select: {
              id: true,
              createdAt: true,
              documentId: true,
              authorId: true,
              author: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        where: {
          type: PrismaDocumentType.DOCUMENT,
        },
        orderBy: {
          seriesOrder: "asc",
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return series.map((s) => ({
    ...s,
    posts: s.posts.map((p) => ({
      ...p,
      type: p.type as DocumentType,
      head: p.head || "",
      coauthors: p.coauthors.map((c) => c.user),
      revisions: p.revisions as any,
    })) as Document[],
  })) as Series[];
}

// Find series by ID with full relations
export async function findSeriesById(id: string): Promise<Series | null> {
  const series = await prisma.series.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      author: {
        select: authorSelect,
      },
      posts: {
        select: {
          id: true,
          handle: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          published: true,
          private: true,
          head: true,
          collab: true,
          status: true,
          seriesId: true,
          seriesOrder: true,
          background_image: true,
          sort_order: true,
          baseId: true,
          parentId: true,
          type: true,
          author: {
            select: authorSelect,
          },
          coauthors: {
            select: {
              user: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          revisions: {
            select: {
              id: true,
              createdAt: true,
              documentId: true,
              authorId: true,
              author: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        where: {
          type: PrismaDocumentType.DOCUMENT,
        },
        orderBy: {
          seriesOrder: "asc",
        },
      },
    },
  });

  if (!series) return null;

  return {
    ...series,
    posts: series.posts.map((p) => ({
      ...p,
      type: p.type as DocumentType,
      head: p.head || "",
      coauthors: p.coauthors.map((c) => c.user),
      revisions: p.revisions as any,
    })) as Document[],
  } as Series;
}

// Find series by author ID
export async function findSeriesByAuthorId(
  authorId: string,
): Promise<Series[]> {
  const series = await prisma.series.findMany({
    where: { authorId },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      author: {
        select: authorSelect,
      },
      posts: {
        select: {
          id: true,
          handle: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          authorId: true,
          published: true,
          private: true,
          head: true,
          collab: true,
          status: true,
          seriesId: true,
          seriesOrder: true,
          background_image: true,
          sort_order: true,
          baseId: true,
          parentId: true,
          type: true,
          author: {
            select: authorSelect,
          },
          coauthors: {
            select: {
              user: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          revisions: {
            select: {
              id: true,
              createdAt: true,
              documentId: true,
              authorId: true,
              author: {
                select: authorSelect,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        where: {
          type: PrismaDocumentType.DOCUMENT,
        },
        orderBy: {
          seriesOrder: "asc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return series.map((s) => ({
    ...s,
    posts: s.posts.map((p) => ({
      ...p,
      type: p.type as DocumentType,
      head: p.head || "",
      coauthors: p.coauthors.map((c) => c.user),
      revisions: p.revisions as any,
    })) as Document[],
  })) as Series[];
}

// Create series and return full entity with relations
export async function createSeries(data: SeriesCreateInput): Promise<Series> {
  await prisma.series.create({
    data: {
      id: data.id,
      title: data.title,
      description: data.description,
      authorId: data.authorId,
    },
  });

  const series = await findSeriesById(data.id);
  if (!series) {
    throw new Error("Failed to create series");
  }
  return series;
}

// Update series and return updated entity
export async function updateSeries(
  id: string,
  data: SeriesUpdateInput,
): Promise<Series> {
  await prisma.series.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    },
  });

  const series = await findSeriesById(id);
  if (!series) {
    throw new Error("Failed to update series");
  }
  return series;
}

// Delete series (documents will have seriesId set to null via CASCADE)
export async function deleteSeries(id: string): Promise<void> {
  await prisma.series.delete({
    where: { id },
  });
}

// Add post to series by updating document's seriesId and seriesOrder
export async function addPostToSeries(
  seriesId: string,
  postId: string,
  order: number,
): Promise<void> {
  await prisma.document.update({
    where: { id: postId },
    data: {
      seriesId,
      seriesOrder: order,
    },
  });
}

// Remove post from series by setting seriesId and seriesOrder to null
export async function removePostFromSeries(postId: string): Promise<void> {
  await prisma.document.update({
    where: { id: postId },
    data: {
      seriesId: null,
      seriesOrder: null,
    },
  });
}

// Update the order of posts within a series
export async function updateSeriesPostOrder(
  seriesId: string,
  postOrders: { postId: string; order: number }[],
): Promise<void> {
  await prisma.$transaction(
    postOrders.map(({ postId, order }) =>
      prisma.document.update({
        where: { id: postId },
        data: { seriesOrder: order },
      })
    ),
  );
}

// Get posts available to add to a series (user's posts not in any series)
export async function getAvailablePostsForSeries(
  authorId: string,
): Promise<Document[]> {
  const posts = await prisma.document.findMany({
    where: {
      authorId,
      seriesId: null,
      type: PrismaDocumentType.DOCUMENT,
    },
    select: {
      id: true,
      handle: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      authorId: true,
      published: true,
      private: true,
      head: true,
      collab: true,
      status: true,
      seriesId: true,
      seriesOrder: true,
      background_image: true,
      sort_order: true,
      baseId: true,
      parentId: true,
      type: true,
      author: {
        select: authorSelect,
      },
      coauthors: {
        select: {
          user: {
            select: authorSelect,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      revisions: {
        select: {
          id: true,
          createdAt: true,
          documentId: true,
          authorId: true,
          author: {
            select: authorSelect,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return posts.map((p) => ({
    ...p,
    type: p.type as DocumentType,
    head: p.head || "",
    coauthors: p.coauthors.map((c) => c.user),
    revisions: p.revisions as any,
  })) as Document[];
}
