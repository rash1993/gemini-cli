/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import * as path from 'path';
import { promises as fs } from 'fs';

/**
 * Parameters for the WebImageScraperTool.
 */
export interface WebImageScraperParams {
  url: string;
  output_directory: string;
  max_size_mb?: number;
  skip_formats?: string[];
  timeout_ms?: number;
}

/**
 * Web Image Scraper tool that scrapes images from web pages.
 * Uses the web-image-scraper package to extract, download, and classify images from web pages.
 */
export class WebImageScraperTool extends BaseTool<
  WebImageScraperParams,
  ToolResult
> {
  static readonly Name: string = 'scrape_web_images';

  constructor() {
    super(
      WebImageScraperTool.Name,
      'Web Image Scraper',
      'Scrapes images from web pages and saves them with metadata. Provide a URL and output directory to download all images from a webpage with intelligent classification and metadata extraction.',
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'The web URL to scrape for images. Must be a valid HTTP/HTTPS URL.',
          },
          output_directory: {
            type: 'string',
            description:
              'Directory path where scraped images and JSON metadata will be saved.',
          },
          max_size_mb: {
            type: 'number',
            minimum: 1,
            maximum: 500,
            description: 'Maximum size per image in MB. Defaults to 100MB',
            default: 100,
          },
          skip_formats: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Image formats to skip (e.g., ["gif", "ico"]). Defaults to ["gif", "ico"]',
            default: ['gif', 'ico'],
          },
          timeout_ms: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            description: 'Timeout in milliseconds for page loading. Defaults to 30000ms',
            default: 30000,
          },
        },
        required: ['url', 'output_directory'],
      },
    );
  }

  validateToolParams(params: WebImageScraperParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation. Ensure url and output_directory are provided as non-empty strings.';
    }

    if (!params.url || params.url.trim() === '') {
      return 'The url parameter cannot be empty.';
    }

    // Validate URL format
    try {
      new URL(params.url);
    } catch (error) {
      return 'The url parameter must be a valid HTTP/HTTPS URL.';
    }

    if (!params.output_directory || params.output_directory.trim() === '') {
      return 'The output_directory parameter cannot be empty.';
    }

    if (params.max_size_mb && (params.max_size_mb < 1 || params.max_size_mb > 500)) {
      return 'Max size must be between 1 and 500 MB.';
    }

    if (params.timeout_ms && (params.timeout_ms < 1000 || params.timeout_ms > 300000)) {
      return 'Timeout must be between 1000ms and 300000ms (5 minutes).';
    }

    return null;
  }

  getDescription(params: WebImageScraperParams): string {
    const maxSize = params.max_size_mb || 100;
    const skipFormats = params.skip_formats || ['gif', 'ico'];
    return `Scraping images from "${params.url}" to directory "${params.output_directory}" (max ${maxSize}MB per image, skipping ${skipFormats.join(', ')})`;
  }

  async execute(
    params: WebImageScraperParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const {
      url,
      output_directory,
      max_size_mb = 100,
      skip_formats = ['gif', 'ico'],
      timeout_ms = 30000,
    } = params;

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('Web image scraping was cancelled');
      }

      console.log(
        `[WebImageScraperTool] Starting image scraping for URL: "${url}"`,
      );

      // Ensure output directory exists
      await fs.mkdir(output_directory, { recursive: true });

      // Import and use the web-image-scraper package
      let WebImageScraper;
      try {
        // Try to import from the web-image-scraper package
        // TODO: Fix web-image-scraper package dependency
        // const scraperModule = await import('web-image-scraper');
        // WebImageScraper = scraperModule.WebImageScraper;
        throw new Error('Web image scraper package not found. The web-image-scraper dependency needs to be properly configured.');
      } catch (importError) {
        console.error('[WebImageScraperTool] Failed to import web-image-scraper:', importError);
        throw new Error('Web image scraper package not found. Please ensure the web-image-scraper package is properly installed and built.');
      }

      // Create scraper instance with options
      const scraper = new WebImageScraper({
        max_size_mb,
        skip_formats,
      });

      // Execute scraping
      const scrapingOptions = {
        output_dir: output_directory,
        max_size_mb,
        skip_formats,
        timeout_ms,
      };

      const result = await scraper.scrapeImages(url, scrapingOptions);

      if (signal.aborted) {
        throw new Error('Web image scraping was cancelled');
      }

      if (result && result.images) {
        const imageCount = result.successful_downloads;
        const failedCount = result.failed_downloads;
        const totalFound = result.total_images_found;
        const jsonPath = path.join(result.output_directory, 'scrape_results.json');

        const successMessage = `Successfully scraped ${imageCount} images from ${url}`;
        const summary = `Found ${totalFound} images, downloaded ${imageCount}, failed ${failedCount}`;

        // Create detailed response for LLM
        const llmResponse = {
          success: true,
          source_url: url,
          output_directory: result.output_directory,
          json_file_path: jsonPath,
          statistics: {
            total_images_found: totalFound,
            successful_downloads: imageCount,
            failed_downloads: failedCount,
          },
          scrape_timestamp: result.scrape_timestamp,
          images: result.images.map((img: any) => ({
            id: img.id,
            original_url: img.original_url,
            local_path: img.local_path,
            filename: img.filename,
            size_bytes: img.size_bytes,
            format: img.format,
            alt_text: img.alt_text,
            source_type: img.source_type,
            classification_confidence: img.classification_confidence,
            content_hints: img.content_hints,
          })),
          message: successMessage,
        };

        return {
          llmContent: JSON.stringify(llmResponse),
          returnDisplay: `✅ ${successMessage}\n\n📊 Summary: ${summary}\n\n📁 Output Directory: ${result.output_directory}\n📄 JSON Results: ${jsonPath}\n\n🖼️ Downloaded Images:\n${result.images.slice(0, 10).map((img: any, i: number) => `${i + 1}. ${img.filename} (${img.format}, ${(img.size_bytes / 1024).toFixed(1)}KB) - ${img.alt_text || 'No alt text'}`).join('\n')}${result.images.length > 10 ? `\n... and ${result.images.length - 10} more images` : ''}\n\n${failedCount > 0 ? `⚠️ Failed Downloads: ${failedCount}\n` : ''}📋 Full results saved to: ${jsonPath}`,
        };
      } else {
        throw new Error('Scraping completed but no valid results returned');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[WebImageScraperTool] Error scraping images:`,
        errorMessage,
      );

      return {
        llmContent: JSON.stringify({
          success: false,
          error: `Web image scraping failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error scraping images from ${url}: ${errorMessage}`,
      };
    }
  }
}