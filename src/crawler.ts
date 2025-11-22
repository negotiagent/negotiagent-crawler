import { chromium, Browser, Page } from "playwright";
import { URL } from "url";
import { CrawlRequest, PageResult, PageResource } from "./types";
import axios from 'axios';
import * as path from 'path';

export class Crawler {
  private visitedUrls: Set<string> = new Set();
  private results: PageResult[] = [];
  private request: CrawlRequest;
  private baseUrl: string;

  constructor(request: CrawlRequest) {
    this.request = request;
    this.baseUrl = new URL(request.url).origin;
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove hash
      parsed.hash = "";
      // Remove trailing slash
      if (parsed.pathname.endsWith("/")) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      return parsed.toString();
    } catch (e) {
      return "";
    }
  }

  private isValidUrl(url: string): boolean {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      // Only crawl same origin
      if (parsed.origin !== this.baseUrl) return false;
      
      // Exclude patterns
      if (this.request.excludePatterns) {
        for (const pattern of this.request.excludePatterns) {
          if (new RegExp(pattern).test(url)) return false;
        }
      }

      // Filter out non-html resources (basic check)
      const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.css', '.js', '.ico', '.svg', '.mp4'];
      if (extensions.some(ext => parsed.pathname.toLowerCase().endsWith(ext))) return false;

      return true;
    } catch (e) {
      return false;
    }
  }

  async crawl(): Promise<PageResult[]> {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    
    const queue: { url: string; depth: number }[] = [];

    if (this.request.includeUrls && this.request.includeUrls.length > 0) {
        // If a manifest list is provided, populate queue with it
        for (const url of this.request.includeUrls) {
            queue.push({ url, depth: 0 });
            this.visitedUrls.add(this.normalizeUrl(url));
        }
    } else {
        // Default start
        queue.push({ url: this.request.url, depth: 0 });
        this.visitedUrls.add(this.normalizeUrl(this.request.url));
    }

    // Use defaults if not provided
    const maxPages = this.request.maxPages ?? 50;
    let pagesProcessed = 0;

    try {
      while (queue.length > 0 && pagesProcessed < maxPages) {
        const current = queue.shift();
        if (!current) break;

        // Check depth
        if (this.request.depth !== undefined && current.depth > this.request.depth) {
          continue;
        }

        console.log(`Crawling: ${current.url} (Depth: ${current.depth})`);
        
        const page = await context.newPage();
        try {
          const response = await page.goto(current.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Wait for product grid if it exists (heuristic for Hitachi site)
          try {
              // Wait a bit for dynamic content to settle
              await page.waitForTimeout(2000);
              
              // If we are on a product list page, try to wait for the items
              const productSelector = '.product-card, .product-item, .overview-list'; 
              // (I'm guessing selectors here, but waiting for network idle is often safer for broad crawling)
              await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          } catch (e) {
              // Ignore wait errors
          }

          // Update base URL if this is the first page and it redirected
          // AND we are not in manifest mode (where we trust the URLs)
          if (pagesProcessed === 0 && response && !this.request.includeUrls) {
             const finalUrl = new URL(response.url());
             if (finalUrl.origin !== this.baseUrl) {
                 console.log(`Redirected from ${this.baseUrl} to ${finalUrl.origin}. Updating base URL.`);
                 this.baseUrl = finalUrl.origin;
             }
          }
          
          const result = await this.extractContent(page, current.url);
          this.results.push(result);
          pagesProcessed++;

          // Find new links if we haven't reached max depth
          // AND we are not in manifest mode (usually we don't crawl deeper if strictly following a list, 
          // unless we want to discover new things from the list. Let's assume manifest = exact list for now).
          if (!this.request.includeUrls && (this.request.depth === undefined || current.depth < this.request.depth)) {
            const links = await this.extractLinks(page);
            for (const link of links) {
              const normalized = this.normalizeUrl(link);
              // Ensure we are staying within the path prefix if started with a deep path
              // Optional: we might want to enforce path prefix restriction more strictly
              if (this.isValidUrl(link) && !this.visitedUrls.has(normalized)) {
                // Simple check: if user started at /a/b/, only crawl things starting with /a/b/
                // This is "sub-page" logic requested by user
                if (link.startsWith(this.request.url)) {
                     this.visitedUrls.add(normalized);
                     queue.push({ url: link, depth: current.depth + 1 });
                }
              }
            }
          }
        } catch (error) {
          console.error(`Failed to crawl ${current.url}:`, error);
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }

    return this.results;
  }

  private async extractContent(page: Page, url: string): Promise<PageResult> {
    const title = await page.title();
    
    // Basic content extraction - can be improved with readability scripts
    const content = await page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, nav, footer');
      scripts.forEach(s => s.remove());
      return document.body.innerText;
    });

    const links = await this.extractLinks(page);
    let resources: PageResource[] = [];

    if (this.request.includeResources) {
        resources = await this.extractResources(page, url);
    }

    return {
      url,
      title,
      content,
      links,
      resources
    };
  }

  private async extractLinks(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => a.href)
        .filter(href => href.startsWith('http'));
    });
  }

  private async extractResources(page: Page, sourceUrl: string): Promise<PageResource[]> {
      const resources: PageResource[] = [];
      
      // 1. Extract Image URLs (content images only, try to skip UI icons)
      // Heuristic: Large images or images within article/main tags
      const imageUrls = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          return imgs
            .filter(img => {
                // Basic filter for tiny icons
                if (img.width < 50 || img.height < 50) return false;
                return true;
            })
            .map(img => img.src);
      });

      // 2. Extract PDF Links
      // Improved selector to catch PDFs by href extension OR by text content like "brochure"
      const pdfUrls = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a'));
          return anchors
              .filter(a => {
                  const href = a.href.toLowerCase();
                  const text = a.innerText.toLowerCase();
                  // Check href for .pdf
                  if (href.includes('.pdf')) return true;
                  // Check for download attributes or common text
                  if (text.includes('brochure') || text.includes('specifications') || text.includes('download')) {
                       // Only if it looks like a file download link (heuristic)
                       // Ideally we check headers, but we can't do that easily inside evaluate.
                       // For now, let's assume these might be relevant and let the downloader filter by content-type
                       return true; 
                  }
                  return false;
              })
              .map(a => a.href);
      });

      const allUrls = [...new Set([...imageUrls, ...pdfUrls])];

      for (const url of allUrls) {
          try {
              if (!url.startsWith('http')) continue; // Skip data URIs etc for now
              
              const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
              const contentType = response.headers['content-type'];
              let type: 'image' | 'pdf' | 'other' = 'other';
              let extension = '';

              if (contentType?.includes('image')) {
                  type = 'image';
                  extension = contentType.split('/')[1] || 'jpg';
              } else if (contentType?.includes('pdf')) {
                  type = 'pdf';
                  extension = 'pdf';
              } else {
                  // Fallback to extension from URL
                  const ext = path.extname(url);
                  if (ext) extension = ext.replace('.', '');
              }

              resources.push({
                  url,
                  type,
                  buffer: Buffer.from(response.data),
                  extension
              });
              
          } catch (e) {
            //   console.warn(`Failed to download resource ${url}`);
          }
      }
      
      return resources;
  }
}
