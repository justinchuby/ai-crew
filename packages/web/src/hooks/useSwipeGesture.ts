import { useRef, useCallback, useState } from 'react';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
}

interface SwipeState {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  offsetX: number;
  offsetY: number;
  swiping: boolean;
}

/**
 * Touch gesture hook for swipe-to-approve interactions.
 *
 * Tracks touch start/move/end and fires directional callbacks
 * when the swipe distance exceeds `threshold` (fraction of viewport).
 * Provides live offset values for card transform animations.
 */
export function useSwipeGesture(handlers: SwipeHandlers, threshold = 0.3): SwipeState {
  const startX = useRef(0);
  const startY = useRef(0);
  const swipingRef = useRef(false);
  const crossedRef = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    swipingRef.current = true;
    crossedRef.current = false;
    setOffset({ x: 0, y: 0 });
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipingRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;
    setOffset({ x: dx, y: dy });

    // Haptic feedback when crossing threshold for the first time
    const threshX = threshold * window.innerWidth;
    const threshY = threshold * window.innerHeight;
    if (!crossedRef.current && (Math.abs(dx) > threshX || dy < -threshY)) {
      crossedRef.current = true;
      navigator.vibrate?.(10);
    }
  }, [threshold]);

  const onTouchEnd = useCallback(() => {
    if (!swipingRef.current) return;
    swipingRef.current = false;

    const dx = offset.x;
    const dy = offset.y;
    const threshX = threshold * window.innerWidth;
    const threshY = threshold * window.innerHeight;

    if (dx > threshX) {
      handlers.onSwipeRight?.();
    } else if (dx < -threshX) {
      handlers.onSwipeLeft?.();
    } else if (dy < -threshY) {
      handlers.onSwipeUp?.();
    }

    setOffset({ x: 0, y: 0 });
  }, [offset, threshold, handlers]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    offsetX: offset.x,
    offsetY: offset.y,
    swiping: swipingRef.current,
  };
}
