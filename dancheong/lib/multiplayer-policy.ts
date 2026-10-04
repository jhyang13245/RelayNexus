export const MULTIPLAYER_KEY_RECOVERY_SECONDS = 90;

export type MultiplayerRoomStatus =
  | "WAITING"
  | "ACTIVE"
  | "PAUSED_KEY"
  | "SOLO"
  | "CLOSED";

export type MultiplayerMemberStatus =
  | "JOINED"
  | "READY"
  | "KEY_BLOCKED"
  | "KICKED"
  | "LEFT";

export type MultiplayerCallCause = "NORMAL" | "AUTO_TIMEOUT" | "HOST_FORCE";

export type TurnMember = {
  id: string;
  accountId: string;
  seat: number;
  status: MultiplayerMemberStatus;
};

export const isPresentMember = (member: TurnMember) =>
  member.status !== "KICKED" && member.status !== "LEFT";

export const activeMembers = <T extends TurnMember>(members: T[]): T[] =>
  members.filter(isPresentMember).sort((left, right) => left.seat - right.seat);

export const nextTurnMember = (
  members: TurnMember[],
  currentMemberId: string,
): TurnMember | undefined => {
  const present = activeMembers(members);
  if (!present.length) return undefined;
  const currentIndex = present.findIndex((member) => member.id === currentMemberId);
  return present[(currentIndex < 0 ? 0 : currentIndex + 1) % present.length];
};

export const roomStatusForMemberCount = (count: number): MultiplayerRoomStatus =>
  count <= 0 ? "CLOSED" : count === 1 ? "SOLO" : "ACTIVE";

export const payerAccountIdForCall = ({
  cause,
  currentPlayerAccountId,
  hostAccountId,
}: {
  cause: MultiplayerCallCause;
  currentPlayerAccountId: string;
  hostAccountId: string;
}) => cause === "HOST_FORCE" ? hostAccountId : currentPlayerAccountId;

export const canStartRoom = (members: Array<TurnMember & { apiKeyReady: boolean }>) => {
  const present = activeMembers(members);
  return present.length >= 2 && present.every((member) =>
    member.status === "READY" && member.apiKeyReady
  );
};

export const keyRecoveryDeadline = (nowMs: number) =>
  new Date(nowMs + MULTIPLAYER_KEY_RECOVERY_SECONDS * 1000).toISOString();

export const hasDeadlineExpired = (deadline: string | null | undefined, nowMs: number) =>
  Boolean(deadline && Date.parse(deadline) <= nowMs);
