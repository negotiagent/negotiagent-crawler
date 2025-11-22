# Negotiagent Crawler

This is a web crawler built with Microsoft Playwright and TypeScript, designed to crawl company websites and dump the findings into an AWS S3 bucket. The output is formatted to be suitable for ingestion into an AWS Knowledge Base (KB).

## Features

-   **Crawls** a target website up to a specified depth.
-   **Discovery Mode**: Analyzes `robots.txt` and sitemaps to find all available pages.
-   **Manifest Ingestion**: Accepts a curated list of URLs to crawl (e.g., filtered from discovery).
-   **Extracts** text content, title, and metadata from pages.
-   **Outputs** results as JSON files to an S3 bucket or local directory.
-   **Handles** redirects and stays within the same domain (origin).
-   **Filters** out non-HTML resources (images, PDFs, etc.).

## Prerequisites

-   Node.js (v14+)
-   AWS Credentials (if uploading to S3).

## Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Install Playwright browsers:
    ```bash
    npx playwright install chromium
    ```
4.  Build the project:
    ```bash
    npm run build
    ```

## Configuration

### AWS Credentials
You can provide credentials via a `.env` file, environment variables, or by using a configured AWS Profile.

**.env file:**
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

**AWS Profile:**
Use the `--profile=<profile_name>` flag to use a specific profile from `~/.aws/credentials`.

## Usage

The crawler supports three main modes of operation:

### 1. Standard Crawl
Crawls a website starting from a URL, following links up to a certain depth.

```bash
npm start -- --url=<target_url> --bucket=<s3_bucket> [options]
```

### 2. Discovery Mode
Scans `robots.txt` and XML sitemaps to discover all available URLs on the site without downloading content. Generates a `manifest-<domain>.json` file.

```bash
npm start -- --url=<target_url> --discover
```

### 3. Manifest Ingestion
Crawls only the specific URLs listed in a manifest JSON file. Useful for controlling exactly what gets ingested after discovery.

```bash
npm start -- --manifest=<path_to_manifest.json> --bucket=<s3_bucket> [options]
```

### Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `--url` | The starting URL to crawl or discover. | Required (unless `--manifest` is used) |
| `--bucket` | S3 bucket name to upload findings to. | Required (or `--output-dir`) |
| `--output-dir` | Local directory to save results instead of S3. | Required (or `--bucket`) |
| `--profile` | AWS Profile to use for S3 authentication. | `negotiagent` |
| `--depth` | How deep to crawl links (0=page only, 1=direct links). | `2` (std), `3` (discover) |
| `--max-pages` | Maximum number of pages to crawl. | `50` (std), `200` (discover) |
| `--discover` | Run in discovery mode to find URLs via sitemaps. | `false` |
| `--manifest` | Path to a JSON file containing a list of URLs to crawl. | `null` |

### Examples

**Full Crawl to S3:**
```bash
npm start -- --url=https://www.example.com --bucket=my-kb-bucket --depth=5 --max-pages=1000 --profile=my-profile
```

**Test Crawl to Local Directory:**
```bash
npm start -- --url=https://www.example.com --output-dir=./local-data --depth=1
```

**Discover URLs and Create Manifest:**
```bash
npm start -- --url=https://www.example.com --discover
```

**Ingest from Manifest:**
```bash
npm start -- --manifest=manifest-www.example.com.json --bucket=my-kb-bucket
```

## Output Format

The crawler produces JSON files with the following key structure:
`s3://<bucket>/<domain>/<md5_hash_of_url>.json`

Each JSON file contains:

```json
{
  "url": "https://www.example.com/about",
  "title": "About Us - Example Company",
  "content": "Full text content of the page...",
  "crawledAt": "2023-10-27T10:00:00.000Z"
}
```
