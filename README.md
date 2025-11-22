# Negotiagent Crawler

This is a web crawler built with Microsoft Playwright and TypeScript, designed to crawl company websites and dump the findings into an AWS S3 bucket. The output is formatted to be suitable for ingestion into an AWS Knowledge Base (KB).

## Features

-   **Crawls** a target website up to a specified depth.
-   **Extracts** text content, title, and metadata from pages.
-   **Outputs** results as JSON files to an S3 bucket.
-   **Handles** redirects and stays within the same domain (origin).
-   **Filters** out non-HTML resources (images, PDFs, etc. - though PDFs could be added if needed).

## Prerequisites

-   Node.js (v14+)
-   AWS Credentials with S3 write access.

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

Create a `.env` file in the root directory or set environment variables:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

## Usage

Run the crawler using the CLI:

```bash
npm start -- --url=<target_url> --bucket=<s3_bucket_name> [options]
```

### Options

-   `--url`: The starting URL to crawl (Required).
-   `--bucket`: The S3 bucket name to upload findings to (Required).
-   `--depth`: How deep to crawl links. Default is `2`. (0 = only start page, 1 = start page + direct links).
-   `--max-pages`: Maximum number of pages to crawl. Default is `50`.

### Example

```bash
npm start -- --url=https://www.example.com --bucket=my-kb-bucket --depth=3 --max-pages=100
```

## Output Format

The crawler uploads JSON files to S3 with the following key structure:
`s3://<bucket>/<domain>/<url_hash>.json`

Each JSON file contains:

```json
{
  "url": "https://www.example.com/about",
  "title": "About Us - Example Company",
  "content": "Full text content of the page...",
  "crawledAt": "2023-10-27T10:00:00.000Z"
}
```

This structure allows AWS Knowledge Base to ingest the `content` field for RAG (Retrieval-Augmented Generation) applications.

