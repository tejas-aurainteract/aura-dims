/**
 * Aura DIMS - High-Resolution Slide Rasterizer
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Pre-renders visual design slides to pixel-perfect high-resolution images (WebP / PNG)
 * matching the exact logical canvas dimensions (1920x1080 Landscape, 1080x1920 Portrait).
 *
 * Guarantees that bold typography, complex multilingual scripts (Gujarati/Hindi/English),
 * border styles, shapes, and color gradients are frozen into raster pixels so physical
 * digital displays display identically offline without runtime font-engine discrepancies.
 */

import type { DesignSlide, Resolution } from '@aura-dims/display-schema';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export interface RasterizeResult {
  blob: Blob;
  dataUrl: string;
}

/**
 * Loads an image with CORS enabled and fails gracefully.
 */
function loadImageSafe(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn('[slideRasterizer] Failed to load image asset for rasterization:', url);
      resolve(null);
    };
    const sep = url.includes('?') ? '&' : '?';
    img.src = `${url}${sep}_cors=1`;
  });
}

/**
 * Draws an image with object-fit (contain, cover, fill) simulation on canvas.
 */
function drawImageProp(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: 'contain' | 'cover' | 'fill'
) {
  if (fit === 'fill') {
    ctx.drawImage(img, x, y, w, h);
    return;
  }

  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  if (!imgW || !imgH) return;

  const ratio = imgW / imgH;
  const targetRatio = w / h;

  if (fit === 'contain') {
    let renderW = w;
    let renderH = h;
    let offsetX = 0;
    let offsetY = 0;
    if (ratio > targetRatio) {
      renderH = w / ratio;
      offsetY = (h - renderH) / 2;
    } else {
      renderW = h * ratio;
      offsetX = (w - renderW) / 2;
    }
    ctx.drawImage(img, x + offsetX, y + offsetY, renderW, renderH);
  } else {
    // cover
    let sWidth = imgW;
    let sHeight = imgH;
    let sx = 0;
    let sy = 0;
    if (ratio > targetRatio) {
      sWidth = imgH * targetRatio;
      sx = (imgW - sWidth) / 2;
    } else {
      sHeight = imgW / targetRatio;
      sy = (imgH - sHeight) / 2;
    }
    ctx.drawImage(img, sx, sy, sWidth, sHeight, x, y, w, h);
  }
}

/**
 * Word wraps text based on maxWidth and line breaks.
 */
function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const rawParagraphs = text.split('\n');
  const result: string[] = [];

  for (const paragraph of rawParagraphs) {
    if (!paragraph) {
      result.push('');
      continue;
    }
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(candidate);
      if (metrics.width > maxWidth && currentLine) {
        result.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) {
      result.push(currentLine);
    }
  }

  return result;
}

/**
 * Rasterizes a single DesignSlide into a high-resolution Blob and dataUrl.
 */
export async function rasterizeSlide(
  slide: DesignSlide,
  dimensions: Resolution,
  assetsMap: Map<string, string> | Record<string, string> = new Map()
): Promise<RasterizeResult> {
  // Ensure web fonts are completely loaded before measuring and painting text
  if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.ready?.then === 'function') {
    await document.fonts.ready;
  }

  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable in this environment.');
  }

  const getAssetUrl = (assetId?: string): string | null => {
    if (!assetId) return null;
    if (assetsMap instanceof Map) {
      return assetsMap.get(assetId) || null;
    }
    return (assetsMap as Record<string, string>)[assetId] || null;
  };

  // 1. Draw Background
  const bg = slide.background;
  if (bg) {
    if (bg.type === 'color') {
      ctx.fillStyle = bg.value || '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bg.type === 'gradient') {
      const gradVal = bg.value || '';
      // Parse colors from gradient string e.g. "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
      const colors = gradVal.match(/#(?:[0-9a-fA-F]{3}){1,2}|rgb\([^)]+\)|rgba\([^)]+\)/g);
      if (colors && colors.length >= 2) {
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        colors.forEach((col, idx) => {
          grad.addColorStop(idx / (colors.length - 1), col);
        });
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else if (bg.type === 'asset' && bg.assetId) {
      const bgUrl = getAssetUrl(bg.assetId);
      if (bgUrl) {
        const bgImg = await loadImageSafe(bgUrl);
        if (bgImg) {
          drawImageProp(ctx, bgImg, 0, 0, canvas.width, canvas.height, 'cover');
        } else {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. Draw Elements in zIndex order
  const sortedElements = (slide.elements || [])
    .slice()
    .sort((a, b) => (a.zIndex || 1) - (b.zIndex || 1));

  for (const el of sortedElements) {
    ctx.save();
    ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;

    // Center translation for rotation
    const centerX = el.x + el.width / 2;
    const centerY = el.y + el.height / 2;
    if (el.rotation) {
      ctx.translate(centerX, centerY);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    if (el.type === 'shape') {
      const shapeType = el.shapeType || 'rectangle';
      const borderWidth = el.borderWidth || 0;
      const borderColor = el.borderColor || 'transparent';
      const fillColor = el.fillColor || 'transparent';

      ctx.beginPath();
      if (shapeType === 'ellipse') {
        ctx.ellipse(centerX, centerY, Math.max(0, el.width / 2), Math.max(0, el.height / 2), 0, 0, Math.PI * 2);
      } else if (shapeType === 'rounded_rectangle') {
        const radius = el.borderRadius ?? 24;
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(el.x, el.y, el.width, el.height, radius);
        } else {
          ctx.rect(el.x, el.y, el.width, el.height);
        }
      } else if (shapeType === 'line') {
        ctx.moveTo(el.x, centerY);
        ctx.lineTo(el.x + el.width, centerY);
        ctx.lineWidth = Math.max(borderWidth || 2, 2);
        ctx.strokeStyle = fillColor !== 'transparent' ? fillColor : borderColor !== 'transparent' ? borderColor : '#cbd5e1';
        ctx.stroke();
        ctx.restore();
        continue;
      } else {
        // default rectangle
        const radius = el.borderRadius || 0;
        if (radius > 0 && typeof ctx.roundRect === 'function') {
          ctx.roundRect(el.x, el.y, el.width, el.height, radius);
        } else {
          ctx.rect(el.x, el.y, el.width, el.height);
        }
      }

      if (fillColor && fillColor !== 'transparent') {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }

      if (borderWidth > 0 && borderColor && borderColor !== 'transparent') {
        ctx.lineWidth = borderWidth;
        ctx.strokeStyle = borderColor;
        ctx.stroke();
      }
    } else if (el.type === 'image') {
      const url = getAssetUrl(el.assetId);
      if (url) {
        const img = await loadImageSafe(url);
        if (img) {
          drawImageProp(ctx, img, el.x, el.y, el.width, el.height, el.fit || 'cover');
        }
      }
    } else if (el.type === 'text') {
      const fontFam =
        el.fontFamily === 'Noto Sans Gujarati'
          ? '"Noto Sans Gujarati", sans-serif'
          : el.fontFamily === 'Noto Sans Devanagari'
          ? '"Noto Sans Devanagari", sans-serif'
          : '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

      const fw = String(el.fontWeight || 'normal');
      const isBold = fw === 'bold' || fw === '700';
      const isMedium = fw === 'medium' || fw === '600';
      const weightStr = isBold ? '700' : isMedium ? '600' : '400';
      const styleStr = el.italic ? 'italic ' : '';

      ctx.font = `${styleStr}${weightStr} ${el.fontSize || 32}px ${fontFam}`;
      ctx.fillStyle = el.color || '#ffffff';
      ctx.textBaseline = 'top';

      const lineHeightPx = (el.lineHeight || 1.3) * (el.fontSize || 32);
      const lines = wrapTextLines(ctx, el.content || '', el.width);

      lines.forEach((line, index) => {
        const lineY = el.y + index * lineHeightPx;
        if (lineY + lineHeightPx > el.y + el.height + 30) return; // Prevent excessive vertical overflow

        let lineX = el.x;
        const metrics = ctx.measureText(line);
        if (el.textAlign === 'center') {
          lineX = el.x + (el.width - metrics.width) / 2;
        } else if (el.textAlign === 'right') {
          lineX = el.x + el.width - metrics.width;
        }

        ctx.fillText(line, lineX, lineY);

        if (el.underline) {
          ctx.beginPath();
          const underY = lineY + (el.fontSize || 32) * 1.1;
          ctx.moveTo(lineX, underY);
          ctx.lineTo(lineX + metrics.width, underY);
          ctx.lineWidth = Math.max(1, Math.round((el.fontSize || 32) / 16));
          ctx.strokeStyle = el.color || '#ffffff';
          ctx.stroke();
        }
      });
    }

    ctx.restore();
  }

  // 3. Export to WebP Blob & DataURL (fallback to PNG if webp is unsupported)
  const dataUrl = canvas.toDataURL('image/webp', 0.92);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          // Fallback to PNG blob
          canvas.toBlob((b2) => {
            if (b2) resolve(b2);
            else reject(new Error('Failed to create blob from rendered canvas.'));
          }, 'image/png');
        }
      },
      'image/webp',
      0.92
    );
  });

  return { blob, dataUrl };
}

/**
 * Uploads a rendered slide blob to Firebase Storage and returns its persistent download URL.
 */
export async function uploadSlideRender(
  designId: string,
  departmentId: string,
  slideId: string,
  blob: Blob
): Promise<string> {
  const safeDept = departmentId || 'global';
  const path = `renders/${safeDept}/${designId}/${slideId}.webp`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob, {
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000',
  });

  return await getDownloadURL(storageRef);
}
