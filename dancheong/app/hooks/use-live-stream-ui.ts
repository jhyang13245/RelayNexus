"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FailedTurnDiagnostic } from "../../lib/simulation-stream";
import type { TurnRecord } from "../../lib/scenario";

/** Owns transient stream presentation so the page does not coordinate five
 * independent states that must be reset together after every attempt. */
export const useLiveStreamUi = () => {
  const [pendingValidatedTurn, setPendingValidatedTurn] = useState<TurnRecord | null>(null);
  const [streamStatus, setStreamStatusState] = useState("이번 장면의 입력만 압축하는 중");
  const [streamStatusCompleted, setStreamStatusCompleted] = useState(false);
  const streamStatusRef = useRef(streamStatus);
  const queuedStatusRef = useRef("");
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [finalRevealAnnouncement, setFinalRevealAnnouncement] = useState("");
  const [failedDraft, setFailedDraft] = useState<FailedTurnDiagnostic | null>(null);
  const [showFailedDraft, setShowFailedDraft] = useState(false);

  const setStreamStatus = useCallback((message: string) => {
    if (!message || message === streamStatusRef.current || message === queuedStatusRef.current) return;
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    queuedStatusRef.current = message;
    setStreamStatusCompleted(true);
    transitionTimerRef.current = setTimeout(() => {
      streamStatusRef.current = queuedStatusRef.current;
      queuedStatusRef.current = "";
      setStreamStatusState(streamStatusRef.current);
      setStreamStatusCompleted(false);
      transitionTimerRef.current = null;
    }, 260);
  }, []);

  const completeStreamStatus = useCallback(() => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    queuedStatusRef.current = "";
    transitionTimerRef.current = null;
    setStreamStatusCompleted(true);
  }, []);

  useEffect(() => () => {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
  }, []);

  const resetStreamUi = useCallback(() => {
    setPendingValidatedTurn(null);
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    streamStatusRef.current = "이번 장면의 입력만 압축하는 중";
    queuedStatusRef.current = "";
    transitionTimerRef.current = null;
    setStreamStatusState(streamStatusRef.current);
    setStreamStatusCompleted(false);
    setFinalRevealAnnouncement("");
    setFailedDraft(null);
    setShowFailedDraft(false);
  }, []);

  return {
    pendingValidatedTurn,
    setPendingValidatedTurn,
    streamStatus,
    setStreamStatus,
    streamStatusCompleted,
    completeStreamStatus,
    finalRevealAnnouncement,
    setFinalRevealAnnouncement,
    failedDraft,
    setFailedDraft,
    showFailedDraft,
    setShowFailedDraft,
    resetStreamUi,
  };
};
