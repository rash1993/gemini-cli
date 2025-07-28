/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useEffect } from 'react';
import { StreamingState } from '../types.js';

interface SmoothScrollOptions {
  streamingState: StreamingState;
  availableTerminalHeight?: number;
  constrainHeight: boolean;
}

export const useSmoothScroll = ({
  streamingState,
  availableTerminalHeight,
  constrainHeight,
}: SmoothScrollOptions) => {
  const lastContentHeightRef = useRef<number>(0);
  const smoothScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate optimal height for streaming content to reduce jumps
  const getOptimalStreamingHeight = useCallback((contentLines: number): number => {
    if (!availableTerminalHeight || !constrainHeight) {
      return contentLines;
    }

    // During streaming, reserve some space for the content to grow
    // This reduces the frequency of height changes
    const reservedLines = Math.min(5, Math.floor(availableTerminalHeight * 0.2));
    const maxStreamingHeight = availableTerminalHeight - reservedLines;
    
    // Use a stepped approach to reduce constant height changes
    const steps = [
      Math.floor(maxStreamingHeight * 0.3),
      Math.floor(maxStreamingHeight * 0.6),
      maxStreamingHeight,
    ];
    
    for (const step of steps) {
      if (contentLines <= step) {
        return Math.max(step, contentLines);
      }
    }
    
    return maxStreamingHeight;
  }, [availableTerminalHeight, constrainHeight]);

  // Debounced height update to prevent rapid changes
  const updateContentHeight = useCallback((newHeight: number) => {
    if (smoothScrollTimeoutRef.current) {
      clearTimeout(smoothScrollTimeoutRef.current);
    }

    // Only update if height change is significant (> 2 lines) or streaming finished
    const heightDiff = Math.abs(newHeight - lastContentHeightRef.current);
    const isStreamingFinished = streamingState === StreamingState.Idle;
    
    if (heightDiff > 2 || isStreamingFinished) {
      smoothScrollTimeoutRef.current = setTimeout(() => {
        lastContentHeightRef.current = newHeight;
      }, isStreamingFinished ? 0 : 150); // Immediate update when finished, debounced during streaming
    }
  }, [streamingState]);

  // Calculate whether to show truncation message
  const shouldShowTruncation = useCallback((contentLines: number): boolean => {
    if (!constrainHeight || !availableTerminalHeight) {
      return false;
    }

    const optimalHeight = getOptimalStreamingHeight(contentLines);
    return contentLines > optimalHeight && streamingState === StreamingState.Responding;
  }, [constrainHeight, availableTerminalHeight, getOptimalStreamingHeight, streamingState]);

  // Get the number of lines to show for streaming content
  const getDisplayLines = useCallback((contentLines: number): number => {
    if (!constrainHeight || !availableTerminalHeight) {
      return contentLines;
    }

    return Math.min(contentLines, getOptimalStreamingHeight(contentLines));
  }, [constrainHeight, availableTerminalHeight, getOptimalStreamingHeight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (smoothScrollTimeoutRef.current) {
        clearTimeout(smoothScrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    updateContentHeight,
    shouldShowTruncation,
    getDisplayLines,
    getOptimalStreamingHeight,
  };
};