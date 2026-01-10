import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { existsSync, statSync } from "fs";

export const dynamic = "force-dynamic";

// Text-based file extensions that can be edited
const EDITABLE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "xml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "py",
  "rb",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "swift",
  "kt",
  "scala",
  "sql",
  "graphql",
  "gql",
  "vue",
  "svelte",
  "astro",
  "prisma",
  "env",
  "gitignore",
  "dockerfile",
  "makefile",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "csv",
  "tsv",
]);

function isEditableFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (EDITABLE_EXTENSIONS.has(ext)) {
    return true;
  }
  // Allow common config files without extensions
  const baseName = filename.toLowerCase();
  const configFiles = [
    "dockerfile",
    "makefile",
    "gemfile",
    "rakefile",
    "procfile",
  ];
  return configFiles.includes(baseName);
}

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

export async function PUT(
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

    // Check if file is editable
    if (!isEditableFile(filename)) {
      return NextResponse.json(
        { error: "This file type cannot be edited" },
        { status: 415 },
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

    // Parse request body
    const body = await request.json();
    const { content } = body;

    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "Content must be a string" },
        { status: 400 },
      );
    }

    // Write the file
    await writeFile(filePath, content, "utf-8");

    // Get updated file size
    const stats = statSync(filePath);
    const newSize = stats.size;

    return NextResponse.json({
      success: true,
      size: newSize,
      filename,
    });
  } catch (error) {
    console.error("Error updating attachment:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
