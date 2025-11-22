import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ filename: string }> },
) {
  const params = await props.params;

  try {
    const { filename } = params;

    // Security: prevent directory traversal
    if (
      filename.includes("..") || filename.includes("/") ||
      filename.includes("\\")
    ) {
      return NextResponse.json(
        { error: "Invalid filename" },
        { status: 400 },
      );
    }

    // Construct file path
    const filePath = path.join(
      process.cwd(),
      "public/uploads/attachments",
      filename,
    );

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 },
      );
    }

    // Read file
    const fileBuffer = await readFile(filePath);

    // Determine content type based on extension
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      txt: "text/plain",
      pdf: "application/pdf",
      zip: "application/zip",
      tar: "application/x-tar",
      gz: "application/gzip",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      sh: "application/x-sh",
      js: "application/javascript",
      json: "application/json",
      xml: "application/xml",
      md: "text/markdown",
      csv: "text/csv",
    };

    const contentType = ext
      ? (contentTypeMap[ext] || "application/octet-stream")
      : "application/octet-stream";

    // Return file with appropriate headers
    return new NextResponse(fileBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error serving attachment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
