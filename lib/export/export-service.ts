/**
 * Export service for handling image exports (fully in-browser)
 *
 * Pure Canvas Architecture:
 * - Uses Konva canvas for ALL rendering (background, patterns, noise, images, text, overlays)
 * - Only uses modern-screenshot for 3D perspective transforms (HTML fallback)
 *
 * All export operations run client-side without external services.
 * Cloudinary is optional and only used for image optimization when configured.
 */

import Konva from 'konva';
import { domToCanvas } from 'modern-screenshot';
import { addWatermarkToCanvas } from './watermark';

export interface ExportOptions {
  format: 'png';
  quality: number;
  scale: number;
  exportWidth: number;
  exportHeight: number;
}

export interface ExportResult {
  dataURL: string;
  blob: Blob;
}

/**
 * Capture 3D transformed element using modern-screenshot
 * This properly captures CSS 3D transforms including perspective
 */
async function capture3DTransformWithModernScreenshot(
  elementId: string,
  scale: number
): Promise<HTMLCanvasElement> {
  // Find the 3D overlay element
  const container = document.getElementById(elementId);
  if (!container) {
    throw new Error(`Element with id "${elementId}" not found`);
  }

  const overlayElement = container.querySelector('[data-3d-overlay="true"]') as HTMLElement;
  if (!overlayElement) {
    throw new Error('3D overlay element not found');
  }

  // Get the bounding box of the overlay element
  const rect = overlayElement.getBoundingClientRect();
  const overlayComputedStyle = window.getComputedStyle(overlayElement);

  // Create a temporary container for capture
  // Position it off-screen to avoid affecting the viewport
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.top = '-9999px';
  tempContainer.style.width = `${rect.width}px`;
  tempContainer.style.height = `${rect.height}px`;
  tempContainer.style.overflow = 'visible';

  // Clone the overlay element with all its styles
  // The overlay element itself has perspective, which applies to its children
  const clonedOverlay = overlayElement.cloneNode(true) as HTMLElement;

  // Preserve all computed styles from the original overlay
  clonedOverlay.style.position = 'relative';
  clonedOverlay.style.left = '0';
  clonedOverlay.style.top = '0';
  clonedOverlay.style.width = overlayComputedStyle.width;
  clonedOverlay.style.height = overlayComputedStyle.height;
  clonedOverlay.style.perspective = overlayComputedStyle.perspective;
  clonedOverlay.style.transformStyle = overlayComputedStyle.transformStyle;

  // Clone the image inside with all its transform styles
  const originalImg = overlayElement.querySelector('img');
  if (originalImg) {
    const clonedImg = originalImg.cloneNode(true) as HTMLImageElement;
    const imgComputedStyle = window.getComputedStyle(originalImg);

    // Preserve all image styles including the 3D transform
    clonedImg.style.width = imgComputedStyle.width;
    clonedImg.style.height = imgComputedStyle.height;
    clonedImg.style.objectFit = imgComputedStyle.objectFit;
    clonedImg.style.opacity = imgComputedStyle.opacity;
    clonedImg.style.borderRadius = imgComputedStyle.borderRadius;
    clonedImg.style.transform = imgComputedStyle.transform; // This contains the 3D transform
    clonedImg.style.transformOrigin = imgComputedStyle.transformOrigin;
    clonedImg.style.willChange = imgComputedStyle.willChange;

    // Clear the cloned overlay and add the cloned image
    clonedOverlay.innerHTML = '';
    clonedOverlay.appendChild(clonedImg);
  }

  tempContainer.appendChild(clonedOverlay);
  document.body.appendChild(tempContainer);

  try {
    // Wait for any images to load and styles to apply
    await new Promise(resolve => setTimeout(resolve, 100));

    // Use modern-screenshot to capture the 3D transformed element
    // Capture the overlay element which has perspective and contains the transformed image
    // modern-screenshot properly handles CSS 3D transforms including perspective
    const canvas = await domToCanvas(clonedOverlay, {
      width: rect.width * scale,
      height: rect.height * scale,
    });

    return canvas;
  } finally {
    // Clean up temporary container
    document.body.removeChild(tempContainer);
  }
}

/**
 * Export Konva stage as canvas (including all layers - background, patterns, images, overlays)
 * Now that everything is rendered in Konva, we export the complete stage
 */
async function exportKonvaStage(
  stage: Konva.Stage | null,
  targetWidth: number,
  targetHeight: number,
  scale: number,
  format: 'png',
  quality: number
): Promise<HTMLCanvasElement> {
  if (!stage) {
    throw new Error('Konva stage not found');
  }

  // Get current stage dimensions (display dimensions)
  const originalWidth = stage.width();
  const originalHeight = stage.height();

  // Calculate scale factor to match export dimensions
  const scaleX = targetWidth / originalWidth;
  const scaleY = targetHeight / originalHeight;

  // Export Konva stage at its current dimensions with high pixelRatio
  // This preserves exact positioning and includes ALL layers (background, patterns, images, text, overlays)
  const exportPixelRatio = scale * Math.max(scaleX, scaleY);
  const dataURL = stage.toDataURL({
    mimeType: 'image/png',
    quality: quality,
    pixelRatio: exportPixelRatio,
  });

  // Convert data URL to canvas
  const tempCanvas = document.createElement('canvas');
  const tempImg = new Image();
  await new Promise<void>((resolve, reject) => {
    tempImg.onload = () => {
      tempCanvas.width = tempImg.width;
      tempCanvas.height = tempImg.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      tempCtx.drawImage(tempImg, 0, 0);
      resolve();
    };
    tempImg.onerror = reject;
    tempImg.src = dataURL;
  });

  // Now scale the canvas to match export dimensions
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetWidth * scale;
  finalCanvas.height = targetHeight * scale;
  const ctx = finalCanvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw the scaled image
  ctx.drawImage(
    tempCanvas,
    0, 0, tempCanvas.width, tempCanvas.height,
    0, 0, targetWidth * scale, targetHeight * scale
  );

  return finalCanvas;
}

/**
 * Export element using pure canvas approach: Konva stage contains everything
 * (background, patterns, noise, main image, text overlays, image overlays)
 * Only 3D transforms use HTML fallback since Konva doesn't support CSS 3D transforms
 */
export async function exportElement(
  elementId: string,
  options: ExportOptions,
  konvaStage: Konva.Stage | null,
  backgroundConfig: any,
  backgroundBorderRadius: number,
  textOverlays: any[] = [],
  imageOverlays: any[] = [],
  perspective3D?: any,
  imageSrc?: string,
  screenshotRadius?: number,
  backgroundBlur: number = 0,
  backgroundNoise: number = 0,
  backgroundOpacity: number = 1
): Promise<ExportResult> {
  // Wait a bit to ensure DOM is ready
  await new Promise(resolve => setTimeout(resolve, 200));

  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Image render card not found. Please ensure an image is uploaded.');
  }

  if (!konvaStage) {
    throw new Error('Konva stage not found');
  }

  try {
    // Step 1: Export Konva stage (includes ALL layers: background, patterns, noise, main image, text overlays, image overlays)
    // Since we moved to pure canvas rendering, everything is in the Konva stage
    let konvaCanvas = await exportKonvaStage(
      konvaStage,
      options.exportWidth,
      options.exportHeight,
      options.scale,
      options.format,
      options.quality
    );

    // Step 2: If 3D transforms are active, capture using modern-screenshot and composite on top
    if (perspective3D && imageSrc) {
      const has3DTransform =
        perspective3D.rotateX !== 0 ||
        perspective3D.rotateY !== 0 ||
        perspective3D.rotateZ !== 0 ||
        perspective3D.translateX !== 0 ||
        perspective3D.translateY !== 0 ||
        perspective3D.scale !== 1;

      if (has3DTransform) {
        try {
          // Find the 3D transformed image overlay to get dimensions
          const overlayContainer = element.querySelector('[data-3d-overlay="true"]') as HTMLElement;

          if (overlayContainer) {
            // Get the displayed dimensions from the overlay
            const overlayRect = overlayContainer.getBoundingClientRect();
            const innerContainer = element.querySelector('div[style*="position: relative"]') as HTMLElement;

            if (innerContainer) {
              const innerRect = innerContainer.getBoundingClientRect();

              // Capture 3D transform using modern-screenshot
              const transformedCanvas = await capture3DTransformWithModernScreenshot(
                elementId,
                options.scale
              );

              // Calculate position relative to inner container
              const relativeX = overlayRect.left - innerRect.left;
              const relativeY = overlayRect.top - innerRect.top;

              // Scale to export dimensions
              const scaleX = (options.exportWidth * options.scale) / innerRect.width;
              const scaleY = (options.exportHeight * options.scale) / innerRect.height;

              const scaledX = relativeX * scaleX;
              const scaledY = relativeY * scaleY;
              const scaledWidth = transformedCanvas.width;
              const scaledHeight = transformedCanvas.height;

              // Composite the transformed canvas onto the Konva canvas
              const compositeCtx = konvaCanvas.getContext('2d');
              if (compositeCtx && transformedCanvas.width > 0 && transformedCanvas.height > 0) {
                compositeCtx.imageSmoothingEnabled = true;
                compositeCtx.imageSmoothingQuality = 'high';
                compositeCtx.save();
                compositeCtx.drawImage(
                  transformedCanvas,
                  0, 0, transformedCanvas.width, transformedCanvas.height,
                  scaledX, scaledY, scaledWidth, scaledHeight
                );
                compositeCtx.restore();
              }
            }
          }
        } catch (error) {
          console.warn('Failed to capture 3D transform with modern-screenshot, using Konva image instead:', error);
          console.error('Error details:', error);
        }
      }
    }

    // Step 3: Use the Konva canvas as the final canvas (it already contains everything)
    // No need to composite multiple layers since everything is in Konva now
    const finalCanvas = konvaCanvas;

    // Step 4: Add watermark
    addWatermarkToCanvas(finalCanvas, {
      text: 'stage',
      position: 'bottom-right',
      backgroundColor: 'transparent',
      textColor: 'rgba(255, 255, 255, 0.7)',
    });

    // Step 5: Convert to blob and data URL
    const mimeType = 'image/png';

    const blob = await new Promise<Blob>((resolve, reject) => {
      finalCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob from canvas'));
          return;
        }
        resolve(blob);
      }, mimeType, options.quality);
    });

    const dataURL = finalCanvas.toDataURL(mimeType, options.quality);

  if (!dataURL || dataURL === 'data:,') {
    throw new Error('Failed to generate image data URL');
  }

  return { dataURL, blob };
  } catch (error) {
    console.error('Export failed:', error);
    throw error;
  }
}
