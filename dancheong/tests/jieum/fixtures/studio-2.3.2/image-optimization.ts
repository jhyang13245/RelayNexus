import type { CharacterImage, Project } from "./studio-model";

export type ImageExportMode = "original" | "screen";
export type ImageOptimizationProgress = { completed: number; total: number };
export type ScreenImageEncoder = (source: Blob) => Promise<{ blob: Blob; width: number; height: number } | null>;
export type ImageOptimizationReport = {
  mode: ImageExportMode;
  maxEdge: number;
  quality: number;
  total: number;
  converted: number;
  retained: number;
  originalBytes: number;
  outputBytes: number;
};

export function screenImageSize(width: number, height: number) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Do not flatten animated assets. PNG chunks and WebP chunks are length-delimited.
export async function isOptimizableImage(blob: Blob): Promise<boolean> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type)) return false;
  if (blob.type === "image/jpeg") return true;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const png = blob.type === "image/png";
  let offset = png ? 8 : 12;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(png ? offset : offset + 4, !png);
    const start = png ? offset + 4 : offset;
    const tag = String.fromCharCode(...bytes.subarray(start, start + 4));
    if (tag === "acTL" || tag === "ANIM" || tag === "ANMF") return false;
    offset += png ? length + 12 : length + 8 + (length % 2);
  }
  return true;
}

/** One decode/canvas at a time. Unsupported encoders retain the original. */
export const encodeImageForScreen: ScreenImageEncoder = async (source) => {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(source);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("이미지 읽기 시간 초과")), 30000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error("이미지를 읽을 수 없습니다.")); };
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) return null;
    const size = screenImageSize(image.naturalWidth, image.naturalHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, size.width, size.height);
    const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    let blob = await encode("image/webp");
    if (blob && blob.type !== "image/webp") {
      // Safari may return PNG for an unavailable WebP encoder. Use JPEG only
      // when every output pixel is opaque; transparent artwork keeps PNG.
      const pixels = context.getImageData(0, 0, size.width, size.height).data;
      let opaque = true;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 255) { opaque = false; break; }
      }
      if (opaque) blob = await encode("image/jpeg");
    }
    if (!blob || !["image/webp", "image/jpeg", "image/png"].includes(blob.type)) return null;
    return { blob, ...size };
  } finally {
    image.onload = null;
    image.onerror = null;
    image.src = "";
    canvas.width = canvas.height = 1;
    URL.revokeObjectURL(url);
  }
};

function sourceBlob(image: CharacterImage): Blob {
  if (image.sourceBlob instanceof Blob) return image.sourceBlob;
  const comma = image.dataUrl.indexOf(",");
  const header = image.dataUrl.slice(0, comma);
  if (comma < 0 || !header.startsWith("data:") || !/;base64$/i.test(header)) throw new Error(`이미지 원본을 읽을 수 없습니다: ${image.fileName}`);
  const binary = atob(image.dataUrl.slice(comma + 1).replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
  return new Blob([bytes], { type: header.slice(5).split(";")[0] || image.mimeType });
}

/** Produces an export-only copy; the working draft and its originals are untouched. */
export async function prepareProjectImages(
  project: Project,
  mode: ImageExportMode,
  onProgress?: (progress: ImageOptimizationProgress) => void,
  encoder: ScreenImageEncoder = encodeImageForScreen,
): Promise<{ project: Project; report: ImageOptimizationReport }> {
  const images = [...[project.player, ...project.npcs].flatMap((character) => character.images), ...project.imageTriggers.flatMap((trigger) => trigger.attachedImages)];
  const report: ImageOptimizationReport = { mode, maxEdge: 1600, quality: 0.85, total: images.length, converted: 0, retained: 0, originalBytes: 0, outputBytes: 0 };
  if (mode === "original") return { project, report };
  const cache = new Map<string | Blob, { blob: Blob; width: number; height: number } | null>();
  const replacements = new Map<CharacterImage, CharacterImage>();
  onProgress?.({ completed: 0, total: images.length });
  for (const [index, image] of images.entries()) {
    const source = sourceBlob(image);
    const key = image.sourceBlob ?? image.dataUrl;
    if (!cache.has(key)) {
      let result: Awaited<ReturnType<ScreenImageEncoder>> = null;
      // Never repeatedly recompress a previously optimized package image.
      if (!image.imageOptimization && await isOptimizableImage(source)) {
        try { result = await encoder(source); } catch { /* Retain undecodable originals. */ }
      }
      cache.set(key, result && result.blob.size < source.size && ["image/webp", "image/jpeg", "image/png"].includes(result.blob.type) ? result : null);
    }
    const result = cache.get(key);
    report.originalBytes += source.size;
    report.outputBytes += result?.blob.size ?? source.size;
    if (result) {
      const extension = result.blob.type === "image/webp" ? "webp" : result.blob.type === "image/jpeg" ? "jpg" : "png";
      replacements.set(image, { ...image,
        fileName: `${image.fileName.replace(/\.[^.]+$/, "")}.${extension}`,
        mimeType: result.blob.type, sourceBlob: result.blob, dataUrl: "",
        dataUrlHeader: `data:${result.blob.type};base64`, byteLength: result.blob.size,
        imageOptimization: { profile: "screen_v1", width: result.width, height: result.height, originalBytes: source.size },
      });
      report.converted += 1;
    } else report.retained += 1;
    onProgress?.({ completed: index + 1, total: images.length });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const replace = (image: CharacterImage) => replacements.get(image) ?? image;
  return { project: { ...project,
    player: { ...project.player, images: project.player.images.map(replace) },
    npcs: project.npcs.map((character) => ({ ...character, images: character.images.map(replace) })),
    imageTriggers: project.imageTriggers.map((trigger) => ({ ...trigger, attachedImages: trigger.attachedImages.map(replace) })),
  }, report };
}
