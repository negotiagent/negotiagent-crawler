import { Crawler } from "./crawler";
import { DiscoveryService } from "./discovery";
import { uploadToS3 } from "./s3";
import { CrawlRequest } from "./types";
import * as crypto from "crypto";
import { URL } from "url";
import * as fs from 'fs';
import * as path from 'path';

function getUrlHash(url: string): string {
  return crypto.createHash("md5").update(url).digest("hex");
}

async function main() {
  // Simple argument parsing
  const args = process.argv.slice(2);
  const urlArg = args.find(arg => arg.startsWith("--url="));
  const bucketArg = args.find(arg => arg.startsWith("--bucket="));
  const outputDirArg = args.find(arg => arg.startsWith("--output-dir="));
  const depthArg = args.find(arg => arg.startsWith("--depth="));
  const maxPagesArg = args.find(arg => arg.startsWith("--max-pages="));
  const profileArg = args.find(arg => arg.startsWith("--profile="));
  const discoverArg = args.includes("--discover");
  const manifestArg = args.find(arg => arg.startsWith("--manifest="));

  if (!urlArg && !manifestArg) {
    console.error("Usage: node dist/index.js --url=<url> [--discover] [--manifest=<file>] [--bucket=<bucket> | --output-dir=<dir>] [--depth=<depth>] [--max-pages=<number>] [--profile=<profile>]");
    process.exit(1);
  }

  const url = urlArg ? urlArg.split("=")[1] : "";
  const bucket = bucketArg ? bucketArg.split("=")[1] : null;
  const outputDir = outputDirArg ? outputDirArg.split("=")[1] : null;
  const depth = depthArg ? parseInt(depthArg.split("=")[1], 10) : (discoverArg ? 3 : 2);
  const maxPages = maxPagesArg ? parseInt(maxPagesArg.split("=")[1], 10) : (discoverArg ? 200 : 50);
  const profile = profileArg ? profileArg.split("=")[1] : "negotiagent";

  // Set AWS Profile
  if (profile) {
    process.env.AWS_PROFILE = profile;
    console.log(`Using AWS Profile: ${profile}`);
  }

  // --- DISCOVERY MODE ---
  if (discoverArg) {
    if (!url) {
        console.error("Discovery mode requires --url");
        process.exit(1);
    }
    const discovery = new DiscoveryService(url);
    const structure = await discovery.discover();

    console.log("\n--- Site Structure Analysis ---");
    console.log(`Total URLs found: ${structure.totalUrls}`);
    console.log("Section breakdown:");
    for (const [section, count] of Object.entries(structure.sections)) {
        console.log(`  ${section}: ${count}`);
    }
    
    const domain = new URL(url).hostname;
    const filename = `manifest-${domain}.json`;
    fs.writeFileSync(filename, JSON.stringify(structure, null, 2));
    console.log(`\nManifest saved to ${filename}`);
    console.log(`You can edit this file to filter URLs and then run:`);
    console.log(`npm start -- --manifest=${filename} --bucket=${bucket || 'YOUR_BUCKET'}`);
    return;
  }

  // --- CRAWL / INGEST MODE ---
  let request: CrawlRequest = {
    url,
    depth,
    maxPages,
  };

  // If manifest provided, use it
  if (manifestArg) {
      const manifestPath = manifestArg.split("=")[1];
      if (fs.existsSync(manifestPath)) {
          console.log(`Loading manifest from ${manifestPath}...`);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (manifest.urls && Array.isArray(manifest.urls)) {
              request.includeUrls = manifest.urls;
              request.maxPages = manifest.urls.length; // Override maxPages to ensure we get everything in manifest
              if (!request.url && request.includeUrls && request.includeUrls.length > 0) {
                  request.url = request.includeUrls[0]; // Fallback for Crawler constructor
              }
          }
      } else {
          console.error(`Manifest file not found: ${manifestPath}`);
          process.exit(1);
      }
  }

  if (!request.url) {
     console.error("No URL provided and no valid manifest found.");
     process.exit(1);
  }

  console.log(`Starting crawl for ${request.url} ${request.includeUrls ? '(Manifest Mode)' : `with depth ${depth} and max pages ${maxPages}`}`);

  const crawler = new Crawler(request);
  const results = await crawler.crawl();

  console.log(`Crawl completed. Found ${results.length} pages.`);

  const domain = new URL(request.url).hostname;
  
  if (outputDir) {
      const dir = path.join(outputDir, domain);
      if (!fs.existsSync(dir)){
          fs.mkdirSync(dir, { recursive: true });
      }
      console.log(`Saving results locally to ${dir}...`);
  } else if (bucket) {
      console.log(`Uploading to S3 bucket ${bucket}...`);
  } else {
      console.log("No bucket or output-dir specified. Results are only logged.");
  }

  for (const result of results) {
    const urlHash = getUrlHash(result.url);
    const key = `${domain}/${urlHash}.json`;
    
    const body = JSON.stringify({
        url: result.url,
        title: result.title,
        content: result.content,
        crawledAt: new Date().toISOString(),
    }, null, 2);

    try {
      if (outputDir) {
          fs.writeFileSync(path.join(outputDir, domain, `${urlHash}.json`), body);
      } else if (bucket) {
          await uploadToS3(bucket, key, body, "application/json");
      }
    } catch (e) {
      console.error(`Failed to save/upload ${result.url}:`, e);
    }
  }
  console.log("All operations completed.");
}

if (require.main === module) {
  main().catch(console.error);
}
