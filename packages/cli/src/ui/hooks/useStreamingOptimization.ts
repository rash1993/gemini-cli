/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useEffect } from 'react';
import { StreamingState } from '../types.js';

interface StreamingOptimizationOptions {
  streamingState: StreamingState;
  onContentUpdate?: () => void;
}

export const useStreamingOptimization = ({
  streamingState,
  onContentUpdate,
}: StreamingOptimizationOptions) => {
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<boolean>(false);

  // Throttle updates during streaming to reduce flicker
  const throttledUpdate = useCallback(() => {
    if (streamingState !== StreamingState.Responding) {
      // Immediate update when not streaming
      onContentUpdate?.();
      return;
    }

    if (!pendingUpdateRef.current) {
      pendingUpdateRef.current = true;
      
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      updateTimeoutRef.current = setTimeout(() => {
        onContentUpdate?.();
        pendingUpdateRef.current = false;
      }, 100); // Throttle to 100ms during streaming
    }
  }, [streamingState, onContentUpdate]);

  // Force immediate update when streaming stops
  useEffect(() => {
    if (streamingState === StreamingState.Idle && pendingUpdateRef.current) {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      onContentUpdate?.();
      pendingUpdateRef.current = false;
    }
  }, [streamingState, onContentUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  return {
    throttledUpdate,
  };
};