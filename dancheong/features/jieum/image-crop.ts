export const JIEUM_IMAGE_WIDTH = 1088;
export const JIEUM_IMAGE_HEIGHT = 608;
export const JIEUM_IMAGE_ASPECT = JIEUM_IMAGE_WIDTH / JIEUM_IMAGE_HEIGHT;

export type CropPosition = { x: number; y: number };
export type ImageDrawRect = { dx: number; dy: number; dw: number; dh: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function containScale(sourceWidth: number, sourceHeight: number) {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) throw new Error("IMAGE_SIZE_INVALID");
  return Math.min(JIEUM_IMAGE_WIDTH / sourceWidth, JIEUM_IMAGE_HEIGHT / sourceHeight);
}

export function maximumImageZoom(sourceWidth: number, sourceHeight: number) {
  const fitScale = containScale(sourceWidth, sourceHeight);
  const coverScale = Math.max(JIEUM_IMAGE_WIDTH / sourceWidth, JIEUM_IMAGE_HEIGHT / sourceHeight);
  return Math.max(3, Math.ceil((coverScale / fitScale) * 1.5 * 100) / 100);
}

export function imageDrawRect(sourceWidth: number, sourceHeight: number, zoom: number, position: CropPosition): ImageDrawRect {
  const fitScale = containScale(sourceWidth, sourceHeight);
  const safeZoom = clamp(Number.isFinite(zoom) ? zoom : 1, 1, maximumImageZoom(sourceWidth, sourceHeight));
  const dw = sourceWidth * fitScale * safeZoom;
  const dh = sourceHeight * fitScale * safeZoom;
  const safeX = clamp(Number.isFinite(position.x) ? position.x : 0.5, 0, 1);
  const safeY = clamp(Number.isFinite(position.y) ? position.y : 0.5, 0, 1);
  const dx = dw <= JIEUM_IMAGE_WIDTH ? (JIEUM_IMAGE_WIDTH - dw) / 2 : safeX === 0 ? 0 : -(dw - JIEUM_IMAGE_WIDTH) * safeX;
  const dy = dh <= JIEUM_IMAGE_HEIGHT ? (JIEUM_IMAGE_HEIGHT - dh) / 2 : safeY === 0 ? 0 : -(dh - JIEUM_IMAGE_HEIGHT) * safeY;
  return { dx, dy, dw, dh };
}

export function moveCropPosition(sourceWidth: number, sourceHeight: number, zoom: number, position: CropPosition, dxRatio: number, dyRatio: number): CropPosition {
  const rect = imageDrawRect(sourceWidth, sourceHeight, zoom, position);
  const overflowX = Math.max(0, rect.dw - JIEUM_IMAGE_WIDTH);
  const overflowY = Math.max(0, rect.dh - JIEUM_IMAGE_HEIGHT);
  return {
    x: overflowX ? clamp(position.x - (dxRatio * JIEUM_IMAGE_WIDTH) / overflowX, 0, 1) : 0.5,
    y: overflowY ? clamp(position.y - (dyRatio * JIEUM_IMAGE_HEIGHT) / overflowY, 0, 1) : 0.5,
  };
}
