const MAX_HUB_COVER_BYTES = 6 * 1024 * 1024;
const HUB_COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const downloadHubCoverFile = async (
  coverUrl: string,
  title: string,
): Promise<File> => {
  const response = await fetch(coverUrl, {
    cache: "force-cache",
  });
  if (!response.ok) throw new Error("너름 작품 표지를 내려받지 못했습니다.");
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  const blob = await response.blob();
  if (!HUB_COVER_TYPES.has(type) || blob.size === 0 || blob.size > MAX_HUB_COVER_BYTES) {
    throw new Error("너름 작품 표지 형식 또는 크기가 올바르지 않습니다.");
  }
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${title.slice(0, 80)}-cover.${extension}`, { type });
};
