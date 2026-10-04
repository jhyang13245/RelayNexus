export type ComposerNavigator = Pick<
  Navigator,
  "maxTouchPoints" | "platform" | "userAgent"
>;

export function isMobileComposerDevice(
  navigatorLike: ComposerNavigator,
): boolean {
  const userAgent = navigatorLike.userAgent ?? "";
  const platform = navigatorLike.platform ?? "";

  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    (platform === "MacIntel" && navigatorLike.maxTouchPoints > 1)
  );
}

export function shouldSubmitComposerOnEnter(input: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  mobileDevice: boolean;
}): boolean {
  return (
    input.key === "Enter" &&
    !input.shiftKey &&
    !input.isComposing &&
    !input.mobileDevice
  );
}
