/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Parameters for the GCSDownloadTool.
 */
export interface GCSDownloadParams {
  gcs_url: string;
  local_path?: string;
  create_directories?: boolean;
}

/**
 * GCS Download tool that downloads files from Google Cloud Storage URLs.
 * Assumes the environment is already authenticated with proper GCS access.
 */
export class GCSDownloadTool extends BaseTool<GCSDownloadParams, ToolResult> {
  static readonly Name: string = 'download_gcs_file';

  constructor(private readonly config?: Config) {
    super(
      GCSDownloadTool.Name,
      'GCS File Download',
      'Downloads files from Google Cloud Storage URLs. Provide a GCS URL (gs://bucket/path) and optionally specify a local download path. The environment must be authenticated for GCS access.',
      {
        type: 'object',
        properties: {
          gcs_url: {
            type: 'string',
            description: 'The GCS URL to download (e.g., gs://bucket-name/path/to/file.txt)',
          },
          local_path: {
            type: 'string',
            description: 'Local path where the file should be saved. If not provided, saves to current directory with original filename',
          },
          create_directories: {
            type: 'boolean',
            description: 'Whether to create parent directories if they don\'t exist. Defaults to true',
            default: true,
          },
        },
        required: ['gcs_url'],
      },
    );
  }

  validateToolParams(params: GCSDownloadParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation. Ensure gcs_url is a non-empty string.';
    }

    if (!params.gcs_url || params.gcs_url.trim() === '') {
      return 'The gcs_url parameter cannot be empty.';
    }

    // Validate GCS URL format
    if (!params.gcs_url.startsWith('gs://')) {
      return 'The gcs_url must be a valid GCS URL starting with "gs://"';
    }

    // Basic URL structure validation
    const urlPattern = /^gs:\/\/[a-z0-9]([a-z0-9\-._])*[a-z0-9]\/.+/;
    if (!urlPattern.test(params.gcs_url)) {
      return 'Invalid GCS URL format. Expected format: gs://bucket-name/path/to/file';
    }

    return null;
  }

  getDescription(params: GCSDownloadParams): string {
    const localPath = params.local_path || 'current directory';
    return `Downloading GCS file: ${params.gcs_url} to ${localPath}`;
  }

  async execute(params: GCSDownloadParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: JSON.stringify({ success: false, error: validationError }),
        returnDisplay: `Error: ${validationError}`,
      };
    }

    const { 
      gcs_url, 
      local_path,
      create_directories = true 
    } = params;

    try {
      // Check if operation was cancelled
      if (signal.aborted) {
        throw new Error('GCS download was cancelled');
      }

      console.log(`[GCSDownloadTool] Starting download from: ${gcs_url}`);

      // Extract filename from GCS URL if local_path is not provided
      const gcsPath = gcs_url.replace(/^gs:\/\/[^\/]+\//, '');
      const filename = path.basename(gcsPath);
      const targetPath = local_path || filename;

      // Create parent directories if needed
      if (create_directories) {
        const parentDir = path.dirname(targetPath);
        if (parentDir !== '.' && parentDir !== '') {
          await fs.mkdir(parentDir, { recursive: true });
          console.log(`[GCSDownloadTool] Created directory: ${parentDir}`);
        }
      }

      // Use gsutil to download the file
      const { spawn } = await import('child_process');
      
      await new Promise<void>((resolve, reject) => {
        const gsutil = spawn('gsutil', ['cp', gcs_url, targetPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        gsutil.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        gsutil.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        gsutil.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`gsutil failed with exit code ${code}: ${stderr}`));
          }
        });

        gsutil.on('error', (error) => {
          reject(new Error(`Failed to spawn gsutil: ${error.message}`));
        });

        // Handle cancellation
        signal.addEventListener('abort', () => {
          gsutil.kill('SIGTERM');
          reject(new Error('Download cancelled'));
        });
      });

      // Verify the file was downloaded
      const stats = await fs.stat(targetPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      const successMessage = `Successfully downloaded file from GCS`;

      return {
        llmContent: JSON.stringify({
          success: true,
          gcs_url,
          local_path: targetPath,
          file_size_bytes: stats.size,
          file_size_mb: fileSizeMB,
          message: successMessage,
        }),
        returnDisplay: `✅ ${successMessage}\n\n📁 GCS URL: ${gcs_url}\n💾 Local Path: ${targetPath}\n📊 File Size: ${fileSizeMB} MB\n📅 Downloaded: ${new Date().toISOString()}`,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[GCSDownloadTool] Error downloading file:`, errorMessage);
      
      return {
        llmContent: JSON.stringify({
          success: false,
          error: `GCS download failed: ${errorMessage}`,
        }),
        returnDisplay: `❌ Error downloading file: ${errorMessage}`,
      };
    }
  }
}