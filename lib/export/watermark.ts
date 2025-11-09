/**
 * Watermark utility for adding watermarks to exported images
 */

export interface WatermarkOptions {
  text?: string;
  fontSize?: number;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  opacity?: number;
  backgroundColor?: string;
  textColor?: string;
}

const DEFAULT_OPTIONS: Required<WatermarkOptions> = {
  text: 'stage',
  fontSize: 0, // Will be calculated based on canvas size
  position: 'bottom-right',
  opacity: 0.7,
  backgroundColor: 'transparent', // No background
  textColor: 'rgba(255, 255, 255, 0.7)', // Lightened text
};

/**
 * Add watermark to canvas element
 */
export function addWatermarkToCanvas(
  canvas: HTMLCanvasElement,
  options: WatermarkOptions = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get 2d context for watermark');
    return;
  }

  const width = canvas.width;
  const height = canvas.height;

  // Validate canvas dimensions
  if (width === 0 || height === 0) {
    console.error('Canvas has invalid dimensions:', { width, height });
    return;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Calculate font size based on canvas dimensions
  const minDimension = Math.min(width, height);
  const fontSize = opts.fontSize || Math.max(24, Math.min(minDimension * 0.04, 48));
  const text = opts.text;

  // Set up font
  ctx.save();
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = fontSize;

  // Calculate position based on option with proper padding
  // Use larger padding to ensure watermark is fully visible
  const edgePadding = Math.max(fontSize * 2, 32); // Minimum 32px or 2x font size
  
  let x: number, y: number;
  
  switch (opts.position) {
    case 'bottom-left':
      x = edgePadding;
      y = height - edgePadding;
      break;
    case 'top-right':
      x = width - textWidth - edgePadding;
      y = fontSize + edgePadding;
      break;
    case 'top-left':
      x = edgePadding;
      y = fontSize + edgePadding;
      break;
    case 'bottom-right':
    default:
      // Position from right edge with padding
      x = width - textWidth - edgePadding;
      // Position from bottom edge with padding
      y = height - edgePadding;
      break;
  }

  // Ensure within bounds - ensure text is fully visible
  x = Math.max(edgePadding, Math.min(x, width - textWidth - edgePadding));
  y = Math.max(fontSize + edgePadding, Math.min(y, height - edgePadding));

  // Draw text only (no background) - lightened color
  ctx.fillStyle = opts.textColor || 'rgba(255, 255, 255, 0.7)';
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
  
  ctx.restore();

  console.log('Watermark added:', {
    canvasSize: { width, height },
    watermarkPosition: { x, y },
    fontSize,
    textWidth,
    textHeight,
    text
  });
}


