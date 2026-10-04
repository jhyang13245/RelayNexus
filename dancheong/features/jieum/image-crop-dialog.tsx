"use client";

import { RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { JIEUM_IMAGE_HEIGHT, JIEUM_IMAGE_WIDTH, imageDrawRect, maximumImageZoom, moveCropPosition, type CropPosition } from "./image-crop";

export type CroppedImage = { blob: Blob; width: typeof JIEUM_IMAGE_WIDTH; height: typeof JIEUM_IMAGE_HEIGHT };

export function ImageCropDialog({ file, onCancel, onComplete }: { file: File | null; onCancel: () => void; onComplete: (result: CroppedImage) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [maximumZoom, setMaximumZoom] = useState(3);
  const [position, setPosition] = useState<CropPosition>({ x: 0.5, y: 0.5 });
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "saving">("loading");

  const paint = useCallback(() => {
    const canvas = canvasRef.current, image = imageRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = imageDrawRect(image.naturalWidth, image.naturalHeight, zoom, position);
    ctx.fillStyle = "#8b8e8c";
    ctx.fillRect(0, 0, JIEUM_IMAGE_WIDTH, JIEUM_IMAGE_HEIGHT);
    ctx.drawImage(image, draw.dx, draw.dy, draw.dw, draw.dh);
  }, [position, zoom]);

  useEffect(() => {
    if (!file) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    setZoom(1); setMaximumZoom(3); setPosition({ x: 0.5, y: 0.5 }); setStatus("loading");
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => { imageRef.current = image; setMaximumZoom(maximumImageZoom(image.naturalWidth, image.naturalHeight)); setStatus("ready"); };
    image.onerror = () => setStatus("error");
    image.src = url;
    return () => { imageRef.current = null; URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => { if (status === "ready") paint(); }, [paint, status]);

  const move = (dx: number, dy: number) => {
    const image = imageRef.current, canvas = canvasRef.current;
    if (!image || !canvas) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    setPosition((current) => moveCropPosition(image.naturalWidth, image.naturalHeight, zoom, current, dx / box.width, dy / box.height));
  };
  const finish = () => {
    const canvas = canvasRef.current;
    if (!canvas || status !== "ready") return;
    setStatus("saving");
    canvas.toBlob((blob) => {
      if (!blob) { setStatus("error"); return; }
      onComplete({ blob, width: JIEUM_IMAGE_WIDTH, height: JIEUM_IMAGE_HEIGHT });
    }, "image/webp", 0.92);
  };

  if (!file) return null;
  return <dialog ref={dialogRef} className="image-crop-dialog" aria-labelledby="image-crop-title" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <header><div><span>IMAGE CROP</span><h2 id="image-crop-title">사용할 영역 선택</h2><p>사진 전체가 보이는 상태에서 시작합니다. 확대하고 드래그해 1088 × 608 영역을 맞추세요.</p></div><button type="button" className="crop-close" aria-label="닫기" onClick={onCancel}><X size={20} /></button></header>
    <div className={`crop-stage ${status}`}>
      <canvas ref={canvasRef} width={JIEUM_IMAGE_WIDTH} height={JIEUM_IMAGE_HEIGHT} tabIndex={status === "ready" ? 0 : -1} aria-label="이미지 자르기 영역. 방향키로 위치를 조정할 수 있습니다."
        onPointerDown={(event) => { if (status !== "ready") return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }; }}
        onPointerMove={(event) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; move(event.clientX - drag.x, event.clientY - drag.y); drag.x = event.clientX; drag.y = event.clientY; }}
        onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onKeyDown={(event) => { const amount = event.shiftKey ? 24 : 8; if (event.key === "ArrowLeft") move(amount, 0); else if (event.key === "ArrowRight") move(-amount, 0); else if (event.key === "ArrowUp") move(0, amount); else if (event.key === "ArrowDown") move(0, -amount); else return; event.preventDefault(); }} />
      <div className="crop-thirds" aria-hidden="true"><i /><i /><i /><i /></div>
      {status === "loading" && <p>이미지를 불러오는 중…</p>}
      {status === "error" && <p>이 이미지를 처리할 수 없습니다. 다른 파일을 선택해 주세요.</p>}
    </div>
    <div className="crop-zoom"><span>전체</span><input aria-label="이미지 확대" type="range" min="1" max={maximumZoom} step="0.01" value={zoom} disabled={status !== "ready"} onChange={(event) => setZoom(Number(event.target.value))} /><span>확대</span><button type="button" onClick={() => { setZoom(1); setPosition({ x: 0.5, y: 0.5 }); }} disabled={status !== "ready"}><RotateCcw size={16} /> 초기화</button></div>
    <footer><button type="button" className="soft-button" onClick={onCancel}>취소</button><button type="button" className="primary-button" disabled={status !== "ready"} onClick={finish}>{status === "saving" ? "이미지 만드는 중…" : "이 영역 사용"}</button></footer>
  </dialog>;
}
