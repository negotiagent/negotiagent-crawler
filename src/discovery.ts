import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { URL } from 'url';
import { Crawler } from './crawler';
import { CrawlRequest } from './types';

export interface SiteStructure {
  totalUrls: number;
  urls: string[];
  sections: Record<string, number>; // e.g. "/products/": 50
}

export class DiscoveryService {
  private parser = new XMLParser();
  private baseUrl: string;

  constructor(url: string) {
    this.baseUrl = new URL(url).origin;
  }

  async discover(): Promise<SiteStructure> {
    console.log(`Starting discovery for ${this.baseUrl}...`);
    
    // 1. Try to find sitemaps via robots.txt
    let urls = await this.getUrlsFromRobotsTxt();
    
    // 2. If no sitemaps found, fallback to crawling (dry-run)
    if (urls.length === 0) {
      console.log("No sitemaps found. Falling back to crawl discovery...");
      urls = await this.crawlForDiscovery();
    }

    console.log(`Discovery found ${urls.length} URLs.`);
    
    // 3. Analyze structure
    return this.analyzeStructure(urls);
  }

  private async getUrlsFromRobotsTxt(): Promise<string[]> {
    try {
      const robotsUrl = `${this.baseUrl}/robots.txt`;
      console.log(`Checking ${robotsUrl}...`);
      const response = await axios.get(robotsUrl, { validateStatus: () => true });
      
      if (response.status !== 200) return [];

      const sitemapLines = response.data
        .split('\n')
        .filter((line: string) => line.toLowerCase().startsWith('sitemap:'));

      const urls: string[] = [];
      
      for (const line of sitemapLines) {
        const sitemapUrl = line.split(': ')[1]?.trim();
        if (sitemapUrl) {
            const sitemapUrls = await this.fetchSitemap(sitemapUrl);
            urls.push(...sitemapUrls);
        }
      }

      // If no sitemaps in robots.txt, try standard locations
      if (urls.length === 0) {
         const commonSitemaps = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'];
         for (const path of commonSitemaps) {
             const commonUrls = await this.fetchSitemap(`${this.baseUrl}${path}`);
             urls.push(...commonUrls);
             if (urls.length > 0) break; 
         }
      }

      return urls;
    } catch (e) {
      console.error("Error checking robots.txt:", e);
      return [];
    }
  }

  private async fetchSitemap(url: string): Promise<string[]> {
    try {
      console.log(`Fetching sitemap: ${url}`);
      const response = await axios.get(url);
      const parsed = this.parser.parse(response.data);
      const urls: string[] = [];

      // Handle Sitemap Index
      if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
        const sitemaps = Array.isArray(parsed.sitemapindex.sitemap) 
            ? parsed.sitemapindex.sitemap 
            : [parsed.sitemapindex.sitemap];
        
        for (const sm of sitemaps) {
          if (sm.loc) {
            urls.push(...await this.fetchSitemap(sm.loc));
          }
        }
      } 
      // Handle Urlset
      else if (parsed.urlset && parsed.urlset.url) {
        const entries = Array.isArray(parsed.urlset.url) 
            ? parsed.urlset.url 
            : [parsed.urlset.url];
        
        for (const entry of entries) {
            if (entry.loc) urls.push(entry.loc);
        }
      }

      return urls;
    } catch (e) {
      console.warn(`Failed to fetch/parse sitemap ${url}`);
      return [];
    }
  }

  private async crawlForDiscovery(): Promise<string[]> {
    // Use our existing Crawler but we need to modify it to be faster/lighter or just use it as is for now.
    // For "Discovery", we typically want a higher limit but maybe less depth? 
    // Actually, let's reuse the Crawler class but maybe we add a 'discoveryMode' to it later.
    // For now, let's instantiate a Crawler with a reasonable limit to sample the site.
    
    const request: CrawlRequest = {
        url: this.baseUrl,
        depth: 3, 
        maxPages: 200, // Sample size for discovery if no sitemap
    };

    // We need to instantiate the Crawler. 
    // Note: This is a bit circular if we want to use Crawler for discovery, 
    // but for a robust implementation, we should probably separate the "Link Finding" logic.
    // For this MVP, let's just return a basic set or warn the user.
    
    console.log("Falling back to limited crawl (max 200 pages) to sample structure...");
    const crawler = new Crawler(request);
    const results = await crawler.crawl();
    return results.map(r => r.url);
  }

  private analyzeStructure(urls: string[]): SiteStructure {
    const sections: Record<string, number> = {};
    
    for (const u of urls) {
      try {
        const path = new URL(u).pathname;
        // Get the first directory segment
        const parts = path.split('/').filter(p => p);
        if (parts.length > 0) {
            const section = `/${parts[0]}/`;
            sections[section] = (sections[section] || 0) + 1;
        } else {
            sections['/'] = (sections['/'] || 0) + 1;
        }
      } catch (e) {
          // ignore invalid urls
      }
    }

    return {
      totalUrls: urls.length,
      urls,
      sections
    };
  }
}

