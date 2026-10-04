export const resolveRequestApiKey = ({
  suppliedKey,
  serverKey,
  runtimeEnvironment,
}: {
  suppliedKey?: string;
  serverKey?: string;
  runtimeEnvironment?: string;
}): string => {
  const supplied = suppliedKey?.trim() ?? "";
  if (supplied) return supplied;

  // A local checkout may keep its key in a server-only .env.local file.
  // Hosted/public production must always use each visitor's device key.
  if (runtimeEnvironment === "development" || runtimeEnvironment === "test") {
    return serverKey?.trim() ?? "";
  }
  return "";
};
