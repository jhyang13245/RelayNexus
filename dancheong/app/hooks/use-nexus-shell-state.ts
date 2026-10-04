"use client";

import { useState } from "react";

export type ApiConnectionStatus = "disconnected" | "testing" | "connected" | "error";
export type SettingsTab = "connection" | "engine" | "appearance" | "generation" | "works" | "about";
export type LibraryTab = "works" | "chats";
export type SyncStatus = "idle" | "saving" | "saved" | "error";
export type ThemeMode = "light" | "dark";
export type ReadingWidth = "narrow" | "normal" | "wide";
export type ReadingFontSize = "small" | "medium" | "large";
export type TypingSpeed = "slow" | "natural" | "fast" | "instant";

export const useNexusSettingsState = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connection");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [readingWidth, setReadingWidth] = useState<ReadingWidth>("normal");
  const [readingFontSize, setReadingFontSize] = useState<ReadingFontSize>("small");
  const [typingSpeed, setTypingSpeed] = useState<TypingSpeed>("natural");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [rememberApiKey, setRememberApiKey] = useState(true);
  const [apiStatus, setApiStatus] = useState<ApiConnectionStatus>("disconnected");
  const [apiMessage, setApiMessage] = useState(
    "연결할 때 API 키를 암호화하여 이 기기에 기억합니다. 업데이트·새로고침 후 자동 복원되며 소설 데이터에는 포함하지 않습니다.",
  );
  return {
    settingsOpen,
    setSettingsOpen,
    settingsTab,
    setSettingsTab,
    themeMode,
    setThemeMode,
    readingWidth,
    setReadingWidth,
    readingFontSize,
    setReadingFontSize,
    typingSpeed,
    setTypingSpeed,
    apiKey,
    setApiKey,
    apiKeyDraft,
    setApiKeyDraft,
    showApiKey,
    setShowApiKey,
    rememberApiKey,
    setRememberApiKey,
    apiStatus,
    setApiStatus,
    apiMessage,
    setApiMessage,
  };
};

export const useNexusLibraryState = <
  Project,
  Session,
  Checkpoint,
  Account,
  AuditLog,
>({
  initialProject,
  initialSession,
  initialProjectId,
  initialSessionId,
}: {
  initialProject: Project;
  initialSession: Session;
  initialProjectId: string;
  initialSessionId: string;
}) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("chats");
  const [projects, setProjects] = useState<Project[]>([initialProject]);
  const [sessions, setSessions] = useState<Session[]>([initialSession]);
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId);
  const [activeSessionName, setActiveSessionName] = useState("데모 이야기");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [sessionSwitching, setSessionSwitching] = useState(false);
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncConflict, setSyncConflict] = useState(false);
  const [conflictCheckpointId, setConflictCheckpointId] = useState<string | null>(null);
  const [checkpointsOpen, setCheckpointsOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [checkpointsLoading, setCheckpointsLoading] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [thumbnailSavingProjectId, setThumbnailSavingProjectId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  return {
    account,
    setAccount,
    accountOpen,
    setAccountOpen,
    auditLogs,
    setAuditLogs,
    auditLoading,
    setAuditLoading,
    libraryTab,
    setLibraryTab,
    projects,
    setProjects,
    sessions,
    setSessions,
    activeProjectId,
    setActiveProjectId,
    activeSessionId,
    setActiveSessionId,
    activeSessionName,
    setActiveSessionName,
    libraryLoading,
    setLibraryLoading,
    sessionSwitching,
    setSessionSwitching,
    sessionRefreshing,
    setSessionRefreshing,
    syncStatus,
    setSyncStatus,
    syncConflict,
    setSyncConflict,
    conflictCheckpointId,
    setConflictCheckpointId,
    checkpointsOpen,
    setCheckpointsOpen,
    checkpoints,
    setCheckpoints,
    checkpointsLoading,
    setCheckpointsLoading,
    deletingProjectId,
    setDeletingProjectId,
    thumbnailSavingProjectId,
    setThumbnailSavingProjectId,
    renamingSessionId,
    setRenamingSessionId,
    renameDraft,
    setRenameDraft,
  };
};
