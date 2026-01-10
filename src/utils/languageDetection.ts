/**
 * Language detection utilities for syntax highlighting
 */

// Map file extensions to Prism language identifiers
const extensionToLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  mjs: "javascript",
  cjs: "javascript",

  // Web
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  svg: "svg",
  xml: "xml",

  // Data formats
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  csv: "csv",

  // Markup
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  tex: "latex",
  latex: "latex",

  // Shell
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ps1: "powershell",
  bat: "batch",
  cmd: "batch",

  // Python
  py: "python",
  pyw: "python",
  pyx: "python",

  // Ruby
  rb: "ruby",
  rake: "ruby",
  gemspec: "ruby",

  // PHP
  php: "php",

  // Java/JVM
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  groovy: "groovy",
  gradle: "groovy",

  // C-family
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  cs: "csharp",
  m: "objectivec",
  mm: "objectivec",

  // Systems languages
  go: "go",
  rs: "rust",
  swift: "swift",
  zig: "zig",

  // Database
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  prisma: "prisma",

  // Config files
  dockerfile: "docker",
  makefile: "makefile",
  cmake: "cmake",
  nginx: "nginx",

  // Other
  r: "r",
  lua: "lua",
  perl: "perl",
  pl: "perl",
  vim: "vim",
  diff: "diff",
  patch: "diff",
  asm: "asm6502",
  wasm: "wasm",

  // Frameworks
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
};

// Map MIME types to Prism language identifiers
const mimetypeToLanguage: Record<string, string> = {
  "text/javascript": "javascript",
  "application/javascript": "javascript",
  "application/x-javascript": "javascript",
  "text/typescript": "typescript",
  "application/typescript": "typescript",
  "application/x-typescript": "typescript",
  "text/html": "html",
  "text/css": "css",
  "text/xml": "xml",
  "application/xml": "xml",
  "application/json": "json",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  "text/x-python": "python",
  "application/x-python": "python",
  "text/x-ruby": "ruby",
  "application/x-ruby": "ruby",
  "text/x-php": "php",
  "application/x-php": "php",
  "text/x-java": "java",
  "text/x-c": "c",
  "text/x-c++": "cpp",
  "text/x-csharp": "csharp",
  "application/x-sh": "bash",
  "application/x-shellscript": "bash",
  "text/x-shellscript": "bash",
  "application/yaml": "yaml",
  "application/x-yaml": "yaml",
  "text/yaml": "yaml",
  "text/csv": "csv",
  "text/x-sql": "sql",
  "application/sql": "sql",
};

// Languages that Prism supports (common ones)
const supportedLanguages = new Set([
  "markup",
  "html",
  "xml",
  "svg",
  "mathml",
  "css",
  "clike",
  "javascript",
  "js",
  "jsx",
  "typescript",
  "ts",
  "tsx",
  "json",
  "yaml",
  "markdown",
  "md",
  "python",
  "py",
  "bash",
  "shell",
  "sh",
  "sql",
  "graphql",
  "java",
  "c",
  "cpp",
  "csharp",
  "cs",
  "go",
  "rust",
  "swift",
  "kotlin",
  "scala",
  "ruby",
  "rb",
  "php",
  "perl",
  "lua",
  "r",
  "diff",
  "docker",
  "dockerfile",
  "makefile",
  "nginx",
  "regex",
  "toml",
  "ini",
  "latex",
  "tex",
  "scss",
  "less",
  "vim",
  "powershell",
  "batch",
]);

/**
 * Detect programming language from filename
 * @param filename - The name of the file
 * @returns The Prism language identifier or null if not detected
 */
export function detectLanguageFromFilename(filename: string): string | null {
  // Get extension from filename
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && extensionToLanguage[ext]) {
    return extensionToLanguage[ext];
  }

  // Check for common config files without extensions
  const baseName = filename.toLowerCase();
  const configFileLanguages: Record<string, string> = {
    dockerfile: "docker",
    makefile: "makefile",
    gemfile: "ruby",
    rakefile: "ruby",
    procfile: "yaml",
    jenkinsfile: "groovy",
    vagrantfile: "ruby",
    ".gitignore": "text",
    ".dockerignore": "text",
    ".env": "text",
    ".editorconfig": "ini",
    ".eslintrc": "json",
    ".prettierrc": "json",
    ".babelrc": "json",
    "tsconfig.json": "json",
    "package.json": "json",
    "composer.json": "json",
    "cargo.toml": "toml",
    "go.mod": "go",
    "go.sum": "text",
  };

  if (configFileLanguages[baseName]) {
    return configFileLanguages[baseName];
  }

  return null;
}

/**
 * Detect programming language from MIME type
 * @param mimetype - The MIME type of the file
 * @returns The Prism language identifier or null if not detected
 */
export function detectLanguageFromMimetype(mimetype: string): string | null {
  // Direct mapping
  if (mimetypeToLanguage[mimetype]) {
    return mimetypeToLanguage[mimetype];
  }

  // Generic text types
  if (mimetype.startsWith("text/")) {
    const subtype = mimetype.split("/")[1];
    if (subtype && extensionToLanguage[subtype]) {
      return extensionToLanguage[subtype];
    }
    return "text";
  }

  return null;
}

/**
 * Check if a language is supported by Prism
 * @param language - The language identifier
 * @returns true if the language is supported
 */
export function isPrismLanguageSupported(language: string): boolean {
  return supportedLanguages.has(language.toLowerCase());
}

/**
 * Get the best language for syntax highlighting
 * @param filename - The filename
 * @param mimetype - The MIME type
 * @returns The best language identifier or "text" as fallback
 */
export function detectLanguage(filename: string, mimetype: string): string {
  // Try filename first (more accurate)
  const fromFilename = detectLanguageFromFilename(filename);
  if (fromFilename && isPrismLanguageSupported(fromFilename)) {
    return fromFilename;
  }

  // Fall back to MIME type
  const fromMimetype = detectLanguageFromMimetype(mimetype);
  if (fromMimetype && isPrismLanguageSupported(fromMimetype)) {
    return fromMimetype;
  }

  // If filename detection worked but language isn't supported, still return it
  // (Prism may have partial support or plugins)
  if (fromFilename) {
    return fromFilename;
  }

  return "text";
}

/**
 * Get a human-readable language name
 * @param language - The language identifier
 * @returns Human-readable language name
 */
export function getLanguageDisplayName(language: string): string {
  const displayNames: Record<string, string> = {
    javascript: "JavaScript",
    js: "JavaScript",
    jsx: "JSX",
    typescript: "TypeScript",
    ts: "TypeScript",
    tsx: "TSX",
    python: "Python",
    py: "Python",
    ruby: "Ruby",
    rb: "Ruby",
    php: "PHP",
    java: "Java",
    csharp: "C#",
    cs: "C#",
    cpp: "C++",
    c: "C",
    go: "Go",
    rust: "Rust",
    swift: "Swift",
    kotlin: "Kotlin",
    scala: "Scala",
    bash: "Bash",
    shell: "Shell",
    sh: "Shell",
    sql: "SQL",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "Less",
    json: "JSON",
    yaml: "YAML",
    xml: "XML",
    markdown: "Markdown",
    md: "Markdown",
    graphql: "GraphQL",
    docker: "Dockerfile",
    dockerfile: "Dockerfile",
    makefile: "Makefile",
    text: "Plain Text",
    toml: "TOML",
    ini: "INI",
    diff: "Diff",
    latex: "LaTeX",
    tex: "LaTeX",
    nginx: "Nginx",
    vim: "Vim",
    lua: "Lua",
    perl: "Perl",
    r: "R",
  };

  return displayNames[language.toLowerCase()] || language.toUpperCase();
}

/**
 * Check if a MIME type represents a text-based file that can be previewed
 * @param mimetype - The MIME type of the file
 * @returns true if the file is text-based and can be previewed
 */
export function isTextFile(mimetype: string): boolean {
  // All text/* types are text files
  if (mimetype.startsWith("text/")) {
    return true;
  }

  // Common text-based application types
  const textApplicationTypes = [
    "application/json",
    "application/javascript",
    "application/x-javascript",
    "application/typescript",
    "application/x-typescript",
    "application/xml",
    "application/xhtml+xml",
    "application/sql",
    "application/x-sql",
    "application/graphql",
    "application/yaml",
    "application/x-yaml",
    "application/toml",
    "application/x-toml",
    "application/x-sh",
    "application/x-shellscript",
    "application/x-python",
    "application/x-ruby",
    "application/x-php",
    "application/x-httpd-php",
    "application/x-perl",
  ];

  return textApplicationTypes.includes(mimetype);
}
