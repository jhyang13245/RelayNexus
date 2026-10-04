"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const LATEST_BUTTON_DISTANCE = 1;

export const useStoryScrollUi = (
  storyScrollRef: RefObject<HTMLDivElement | null>,
  enabled = true,
) => {
  const [showLatestButton, setShowLatestButton] = useState(false);
  const lockedScrollTopRef = useRef<number | null>(null);
  const lockedStoryAnchorRef = useRef<{
    turnId: string;
    blockId: string;
    viewportTop: number;
    scrollTop: number;
  } | null>(null);

  const updateLatestButton = useCallback(() => {
    const scroller = storyScrollRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    setShowLatestButton(distance > LATEST_BUTTON_DISTANCE);
  }, [storyScrollRef]);

  useEffect(() => {
    if (!enabled) {
      setShowLatestButton(false);
      return;
    }
    const scroller = storyScrollRef.current;
    if (!scroller) return;
    const resizeObserver = new ResizeObserver(updateLatestButton);
    const observeContents = () => {
      resizeObserver.observe(scroller);
      Array.from(scroller.children).forEach((child) => resizeObserver.observe(child));
      updateLatestButton();
    };
    const mutationObserver = new MutationObserver(observeContents);
    observeContents();
    mutationObserver.observe(scroller, { childList: true, subtree: true });
    scroller.addEventListener("scroll", updateLatestButton, { passive: true });
    window.addEventListener("resize", updateLatestButton, { passive: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      scroller.removeEventListener("scroll", updateLatestButton);
      window.removeEventListener("resize", updateLatestButton);
    };
  }, [enabled, storyScrollRef, updateLatestButton]);

  useLayoutEffect(() => {
    const scroller = storyScrollRef.current;
    if (!scroller) return;
    const anchor = lockedStoryAnchorRef.current;
    if (anchor) {
      const mountedTurn = Array.from(
        scroller.querySelectorAll<HTMLElement>("[data-story-turn-id]"),
      ).find((element) => element.dataset.storyTurnId === anchor.turnId);
      const mountedBlock = mountedTurn
        ? Array.from(mountedTurn.querySelectorAll<HTMLElement>("[data-story-block-id]"))
          .find((element) => element.dataset.storyBlockId === anchor.blockId)
        : undefined;
      const correction = mountedBlock
        ? mountedBlock.getBoundingClientRect().top - anchor.viewportTop
        : 0;
      const correctionIsSafe = Number.isFinite(correction) &&
        Math.abs(correction) <= Math.max(scroller.clientHeight, 320);
      scroller.scrollTop = correctionIsSafe
        ? anchor.scrollTop + correction
        : anchor.scrollTop;
      lockedStoryAnchorRef.current = null;
      lockedScrollTopRef.current = null;
      return;
    }
    if (lockedScrollTopRef.current !== null) {
      scroller.scrollTop = lockedScrollTopRef.current;
      lockedScrollTopRef.current = null;
    }
  });

  const lockScrollForNextLayout = useCallback(() => {
    lockedScrollTopRef.current = storyScrollRef.current?.scrollTop ?? null;
  }, [storyScrollRef]);

  const preserveVisibleStoryAnchorForNextLayout = useCallback(() => {
    const scroller = storyScrollRef.current;
    if (!scroller) return;
    const viewport = scroller.getBoundingClientRect();
    const blocks = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-story-block-id]"),
    );
    const visible = blocks.find((element) =>
      element.getBoundingClientRect().bottom > viewport.top + 1
    ) ?? blocks.at(-1);
    if (!visible?.dataset.storyBlockId) {
      lockedScrollTopRef.current = scroller.scrollTop;
      return;
    }
    const turn = visible.closest<HTMLElement>("[data-story-turn-id]");
    if (!turn?.dataset.storyTurnId) {
      lockedScrollTopRef.current = scroller.scrollTop;
      return;
    }
    lockedStoryAnchorRef.current = {
      turnId: turn.dataset.storyTurnId,
      blockId: visible.dataset.storyBlockId,
      viewportTop: visible.getBoundingClientRect().top,
      scrollTop: scroller.scrollTop,
    };
  }, [storyScrollRef]);

  const scrollToLatest = useCallback(() => {
    const scroller = storyScrollRef.current;
    if (!scroller) return;
    setShowLatestButton(false);
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [storyScrollRef]);

  return {
    showLatestButton,
    scrollToLatest,
    lockScrollForNextLayout,
    preserveVisibleStoryAnchorForNextLayout,
  };
};
