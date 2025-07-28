/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { StreamingState } from '../types.js';

interface StreamingLayoutOptions {
  streamingState: StreamingState;
  availableTerminalHeight: number;
  terminalWidth: number;
}

export const useStreamingLayout = ({
  streamingState,
  availableTerminalHeight,
  terminalWidth,
}: StreamingLayoutOptions) => {
  const [reservedHeight, setReservedHeight] = useState<number>(0);
  const previousStateRef = useRef<StreamingState>(StreamingState.Idle);
  const heightStabilizationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // When streaming starts, reserve some height to prevent layout jumps
  useEffect(() => {
    const isStartingStreaming = 
      previousStateRef.current === StreamingState.Idle && 
      streamingState === StreamingState.Responding;
    
    const isStoppingStreaming = 
      previousStateRef.current === StreamingState.Responding && 
      streamingState === StreamingState.Idle;

    if (isStartingStreaming) {
      // Reserve about 30% of available height for streaming content
      const newReservedHeight = Math.min(
        Math.floor(availableTerminalHeight * 0.3),
        10 // Cap at 10 lines
      );
      setReservedHeight(newReservedHeight);
    } else if (isStoppingStreaming) {
      // Clear reserved height after a small delay to allow content to settle
      if (heightStabilizationTimeoutRef.current) {
        clearTimeout(heightStabilizationTimeoutRef.current);
      }
      heightStabilizationTimeoutRef.current = setTimeout(() => {
        setReservedHeight(0);
      }, 300);
    }

    previousStateRef.current = streamingState;
  }, [streamingState, availableTerminalHeight]);

  // Calculate effective available height for content
  const getEffectiveAvailableHeight = useCallback(() => {
    if (streamingState === StreamingState.Responding && reservedHeight > 0) {
      return Math.max(
        availableTerminalHeight - reservedHeight,
        Math.floor(availableTerminalHeight * 0.5) // Never go below 50% of available height
      );
    }
    return availableTerminalHeight;
  }, [streamingState, availableTerminalHeight, reservedHeight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heightStabilizationTimeoutRef.current) {
        clearTimeout(heightStabilizationTimeoutRef.current);
      }
    };
  }, []);

  return {
    effectiveAvailableHeight: getEffectiveAvailableHeight(),
    reservedHeight,
    isStreamingActive: streamingState === StreamingState.Responding,
  };
};