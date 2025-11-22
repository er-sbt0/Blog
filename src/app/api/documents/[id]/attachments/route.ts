import { authOptions } from "@/lib/auth";
import { findUserPost } from "@/repositories/post";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { validate } from "uuid";
import crypto from "crypto";

export const dynamic = "force-dynamic";

interface UploadAttachmentResponse {
  data?: {
    url: string;
    filename: string;
    mimetype: string;
    size: number;
  };
  error?: {
    title: string;
    subtitle?: string;
  };
}

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: UploadAttachmentResponse = {};

  try {
    console.log("Processing attachment upload for document:", params.id);

    if (!validate(params.id)) {
      response.error = { title: "Bad Request", subtitle: "Invalid id" };
      return NextResponse.json(response, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to upload attachments",
      };
      return NextResponse.json(response, { status: 401 });
    }

    const { user } = session;
    if (user.disabled) {
      response.error = {
        title: "Account Disabled",
        subtitle: "Account is disabled for violating terms of service",
      };
      return NextResponse.json(response, { status: 403 });
    }

    const userDocument = await findUserPost(params.id);
    if (!userDocument) {
      response.error = { title: "Document not found" };
      return NextResponse.json(response, { status: 404 });
    }

    if (user.id !== userDocument.author.id) {
      response.error = {
        title: "Forbidden",
        subtitle: "You are not authorized to modify this document",
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    console.log(
      "File received:",
      file ? `${file.name} (${file.type}, ${file.size} bytes)` : "No file",
    );

    if (!file) {
      response.error = {
        title: "Bad Request",
        subtitle: "No file uploaded",
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      response.error = {
        title: "File Too Large",
        subtitle: "Maximum file size is 10MB",
      };
      return NextResponse.json(response, { status: 400 });
    }

    try {
      // Generate a unique filename, preserving original extension
      const originalName = file.name;
      const fileExt = originalName.split(".").pop() || "bin";
      const randomId = crypto.randomBytes(16).toString("hex");
      const fileName = `attach_${params.id}_${randomId}.${fileExt}`;

      console.log("Creating directory and saving file:", fileName);

      // Create upload directory if it doesn't exist
      const uploadDir = path.join(process.cwd(), "public/uploads/attachments");
      await mkdir(uploadDir, { recursive: true });

      // Save the file
      const filePath = path.join(uploadDir, fileName);
      console.log("File will be saved to:", filePath);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);
      console.log("File saved successfully");

      // Return the attachment metadata with API URL for download
      const fileUrl = `/api/attachments/${fileName}`;

      response.data = {
        url: fileUrl,
        filename: originalName,
        mimetype: file.type || "application/octet-stream",
        size: file.size,
      };

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      console.error("File processing error:", error);
      response.error = {
        title: "Upload Failed",
        subtitle: "Failed to process the uploaded file",
      };
      return NextResponse.json(response, { status: 500 });
    }
  } catch (error) {
    console.error(error);
    response.error = {
      title: "Something went wrong",
      subtitle: "Please try again later",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
