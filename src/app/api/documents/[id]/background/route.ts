import { authOptions } from "@/lib/auth";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { findDocument, updateDocument } from "@/repositories/document";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { validate } from "uuid";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(
  async (request, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;

    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      throw new ApiError(
        401,
        "Unauthorized",
        "Please sign in to upload images",
      );
    }

    const { user } = session;
    if (user.disabled) {
      throw new ApiError(
        403,
        "Account Disabled",
        "Account is disabled for violating terms of service",
      );
    }

    const userDocument = await findDocument(params.id);
    if (!userDocument) {
      throw new ApiError(404, "Document not found");
    }

    if (user.id !== userDocument.author.id) {
      throw new ApiError(
        403,
        "Forbidden",
        "You are not authorized to modify this document",
      );
    }

    // Since directories have been removed in blog refactor, reject all background operations
    throw new ApiError(
      400,
      "Bad Request",
      "Background images are only supported for directories, which have been removed",
    );

    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw new ApiError(400, "Bad Request", "No file uploaded");
    }

    // Check file type
    const fileType = file.type;
    if (!fileType.startsWith("image/")) {
      throw new ApiError(400, "Bad Request", "Only image files are allowed");
    }

    try {
      // Generate a unique filename
      const fileExt = fileType.split("/")[1];
      const randomId = crypto.randomBytes(16).toString("hex");
      const fileName = `dir_${params.id}_${randomId}.${fileExt}`;

      // Create upload directory if it doesn't exist
      const uploadDir = path.join(
        process.cwd(),
        "public/uploads/directories",
      );
      await mkdir(uploadDir, { recursive: true });

      // Save the file
      const filePath = path.join(uploadDir, fileName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      // Update the document with the background image path
      const imagePath = `/uploads/directories/${fileName}`;

      const updatedDocument = await updateDocument(params.id, {
        background_image: imagePath,
      });

      if (!updatedDocument) {
        throw new ApiError(
          500,
          "Update Failed",
          "Failed to update document with background image",
        );
      }

      return NextResponse.json({
        data: {
          background_image: imagePath,
          document: updatedDocument!,
        },
      });
    } catch (error) {
      console.error("File processing error:", error);
      throw new ApiError(
        500,
        "Upload Failed",
        "Failed to process the uploaded file",
      );
    }
  },
);
