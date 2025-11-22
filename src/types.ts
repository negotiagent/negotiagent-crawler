export interface CrawlRequest {
  url: string;
  depth?: number; // How deep to crawl. 0 = only the given URL.
  maxPages?: number; // Max pages to crawl to avoid infinite loops.
  excludePatterns?: string[]; // Regex patterns to exclude.
  includeUrls?: string[]; // Specific URLs to crawl (from manifest)
}

export interface PageResult {
  url: string;
  title: string;
  content: string; // Extracted text content
  html?: string; // Optional raw HTML
  metadata?: Record<string, any>;
  links: string[]; // Outgoing links found on the page
}

