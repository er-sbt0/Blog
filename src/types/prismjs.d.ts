declare module "prismjs" {
  export interface Grammar {
    [key: string]: unknown;
  }

  export interface Languages {
    [key: string]: Grammar;
  }

  export const languages: Languages;

  export function highlight(
    text: string,
    grammar: Grammar,
    language: string,
  ): string;

  export function highlightAll(async?: boolean, callback?: () => void): void;

  export function highlightElement(
    element: Element,
    async?: boolean,
    callback?: () => void,
  ): void;
}

declare module "prismjs/components/prism-javascript" {}
declare module "prismjs/components/prism-typescript" {}
declare module "prismjs/components/prism-jsx" {}
declare module "prismjs/components/prism-tsx" {}
declare module "prismjs/components/prism-css" {}
declare module "prismjs/components/prism-python" {}
declare module "prismjs/components/prism-bash" {}
declare module "prismjs/components/prism-json" {}
declare module "prismjs/components/prism-yaml" {}
declare module "prismjs/components/prism-markdown" {}
declare module "prismjs/components/prism-sql" {}
declare module "prismjs/components/prism-csharp" {}
