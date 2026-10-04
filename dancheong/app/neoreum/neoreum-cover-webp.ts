const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_WIDTH = 1080;
const MAX_HEIGHT = 1440;
const WEBP_QUALITY = 0.84;

export async function optimizeCoverToWebp(file: File): Promise<File> {
  if (!COVER_TYPES.has(file.type)) {
    throw new Error("PNG, JPG 또는 WebP 표지를 선택해 주세요.");
  }
  if (typeof window === "undefined" || typeof Image === "undefined") return file;

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_WIDTH / image.naturalWidth, MAX_HEIGHT / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("표지 이미지를 처리하지 못했습니다."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== "image/webp") {
          reject(new Error("이 브라우저에서 WebP 표지를 만들지 못했습니다."));
          return;
        }
        const baseName = file.name.replace(/\.[^.]+$/u, "").slice(0, 80) || "relay-cover";
        resolve(new File([blob], `${baseName}.webp`, { type: "image/webp" }));
      }, "image/webp", WEBP_QUALITY);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("선택한 표지 파일을 읽지 못했습니다."));
    };
    image.src = objectUrl;
  });
}
