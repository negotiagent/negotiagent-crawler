export interface CrawlRequest {
  url: string;
  depth?: number; // How deep to crawl. 0 = only the given URL.
  maxPages?: number; // Max pages to crawl to avoid infinite loops.
  excludePatterns?: string[]; // Regex patterns to exclude.
  includeUrls?: string[]; // Specific URLs to crawl (from manifest)
  includeResources?: boolean; // Whether to download images/PDFs
}

export interface PageResource {
  url: string;
  type: 'image' | 'pdf' | 'other';
  buffer: Buffer;
  extension: string;
}

export interface PageResult {
  url: string;
  title: string;
  content: string; // Extracted text content
  html?: string; // Optional raw HTML
  metadata?: Record<string, any>;
  links: string[]; // Outgoing links found on the page
  resources?: PageResource[];
}

