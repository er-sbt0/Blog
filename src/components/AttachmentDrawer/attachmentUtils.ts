export const EDITABLE_EXTENSIONS = new Set([
  "txt", "md", "markdown", "html", "htm", "css", "scss", "less",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "xml",
  "yaml", "yml", "sh", "bash", "zsh", "py", "rb", "php",
  "java", "c", "cpp", "h", "hpp", "cs", "go", "rs", "swift",
  "kt", "scala", "sql", "graphql", "gql", "vue", "svelte",
  "astro", "prisma", "env", "gitignore", "dockerfile", "makefile",
  "toml", "ini", "cfg", "conf", "log", "csv", "tsv",
]);

export function isEditable(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (EDITABLE_EXTENSIONS.has(ext)) return true;
  const configFiles = ["dockerfile", "makefile", "gemfile", "rakefile", "procfile"];
  return configFiles.includes(filename.toLowerCase());
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function extractFilename(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1];
}
