export const RELAY_CORE_ORIGIN = "https://relay-core.juno12345.chatgpt.site";

export const relayCoreRequestHeaders = (
  options: { revalidate?: boolean } = {},
): HeadersInit => {
  const bearer = process.env.RELAY_CORE_SITE_BEARER?.trim();
  return {
    ...(options.revalidate === false ? {} : { "Cache-Control": "no-cache" }),
    "x-relay-source": "relay-nexus",
    ...(bearer ? { "OAI-Sites-Authorization": `Bearer ${bearer}` } : {}),
  };
};

export const relayCoreUrl = (path: string, fresh = false): string => {
  const url = new URL(path, RELAY_CORE_ORIGIN);
  if (fresh) url.searchParams.set("nexusFresh", Date.now().toString(36));
  return url.toString();
};
