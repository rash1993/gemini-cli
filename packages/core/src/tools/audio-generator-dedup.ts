/**
 * Audio Generation Deduplication Manager
 * Prevents duplicate audio generation requests for the same content
 */

import crypto from 'crypto';

interface ActiveTask {
  taskId: string;
  textHash: string;
  voice: string;
  startTime: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class AudioGenerationDeduplicator {
  private static instance: AudioGenerationDeduplicator;
  private activeTasks: Map<string, ActiveTask> = new Map();
  private readonly TASK_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
  private cleanupTimer: NodeJS.Timeout;

  private constructor() {
    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredTasks();
    }, this.CLEANUP_INTERVAL_MS);
  }

  static getInstance(): AudioGenerationDeduplicator {
    if (!AudioGenerationDeduplicator.instance) {
      AudioGenerationDeduplicator.instance = new AudioGenerationDeduplicator();
    }
    return AudioGenerationDeduplicator.instance;
  }

  /**
   * Generate a hash for the audio content to detect duplicates
   */
  private generateContentHash(text: string, voice: string, instructions?: string): string {
    const content = `${text}|${voice}|${instructions || ''}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if an identical audio generation task is already running
   */
  findActiveTask(text: string, voice: string, instructions?: string): ActiveTask | null {
    const contentHash = this.generateContentHash(text, voice, instructions);
    
    for (const [taskId, task] of this.activeTasks) {
      if (task.textHash === contentHash && 
          (task.status === 'pending' || task.status === 'processing')) {
        
        // Check if task is not too old
        const age = Date.now() - task.startTime;
        if (age < this.TASK_EXPIRY_MS) {
          console.log(`[AudioDeduplicator] Found existing task ${taskId} for identical content`);
          return task;
        }
      }
    }
    
    return null;
  }

  /**
   * Register a new audio generation task
   */
  registerTask(taskId: string, text: string, voice: string, instructions?: string): void {
    const contentHash = this.generateContentHash(text, voice, instructions);
    
    const task: ActiveTask = {
      taskId,
      textHash: contentHash,
      voice,
      startTime: Date.now(),
      status: 'processing'
    };
    
    this.activeTasks.set(taskId, task);
    console.log(`[AudioDeduplicator] Registered new task ${taskId}`);
  }

  /**
   * Update task status
   */
  updateTaskStatus(taskId: string, status: 'completed' | 'failed'): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = status;
      console.log(`[AudioDeduplicator] Task ${taskId} status updated to ${status}`);
      
      // Remove completed/failed tasks after a short delay
      setTimeout(() => {
        this.activeTasks.delete(taskId);
      }, 5000);
    }
  }

  /**
   * Clean up expired tasks
   */
  private cleanupExpiredTasks(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [taskId, task] of this.activeTasks) {
      const age = now - task.startTime;
      if (age > this.TASK_EXPIRY_MS) {
        this.activeTasks.delete(taskId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[AudioDeduplicator] Cleaned up ${cleaned} expired tasks`);
    }
  }

  /**
   * Get statistics about active tasks
   */
  getStats(): { active: number; pending: number; processing: number } {
    let pending = 0;
    let processing = 0;
    
    for (const task of this.activeTasks.values()) {
      if (task.status === 'pending') pending++;
      if (task.status === 'processing') processing++;
    }
    
    return {
      active: this.activeTasks.size,
      pending,
      processing
    };
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.activeTasks.clear();
  }
}

export const audioDeduplicator = AudioGenerationDeduplicator.getInstance();