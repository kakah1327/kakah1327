/**
 * Funções de processamento de imagem pixel a pixel.
 * Cada função recebe um ImageData (Canvas 2D API) e devolve um ImageData processado,
 * imitando o que um script Python faria percorrendo a imagem com laços aninhados.
 */

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function cloneImageData(imageData) {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );
}

function negative(imageData) {
  const out = cloneImageData(imageData);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  return out;
}

function grayscaleAverage(imageData) {
  const out = cloneImageData(imageData);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
    d[i] = d[i + 1] = d[i + 2] = avg;
  }
  return out;
}

function grayscaleLuminosity(imageData) {
  const out = cloneImageData(imageData);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  return out;
}

// brightness: -100..100 | contrast: -100..100 (ambos vindos dos sliders da UI)
function brightnessContrast(imageData, brightness, contrast) {
  const out = cloneImageData(imageData);
  const d = out.data;
  const c = (contrast / 100) * 255; // escala para -255..255
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  for (let i = 0; i < d.length; i += 4) {
    for (let ch = 0; ch < 3; ch++) {
      let v = d[i + ch] + brightness;
      v = factor * (v - 128) + 128;
      d[i + ch] = clampByte(v);
    }
  }
  return out;
}

// binariza a imagem: pixels >= level viram branco, o resto vira preto
function threshold(imageData, level) {
  const out = cloneImageData(imageData);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = l >= level ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return out;
}

const KERNELS = {
  blur: { matrix: [1, 2, 1, 2, 4, 2, 1, 2, 1], divisor: 16, offset: 0 },
  sharpen: { matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0], divisor: 1, offset: 0 },
  laplace: { matrix: [0, -1, 0, -1, 4, -1, 0, -1, 0], divisor: 1, offset: 128 },
  emboss: { matrix: [-2, -1, 0, -1, 1, 1, 0, 1, 2], divisor: 1, offset: 128 },
};

// convolução 3x3 genérica, aplicada por canal (R, G, B), com bordas replicadas
function convolve3x3(imageData, kernelDef) {
  const { matrix, divisor, offset } = kernelDef;
  const { width, height, data: src } = imageData;
  const out = cloneImageData(imageData);
  const dst = out.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        let k = 0;
        for (let ky = -1; ky <= 1; ky++) {
          const yi = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const xi = Math.min(width - 1, Math.max(0, x + kx));
            sum += src[(yi * width + xi) * 4 + ch] * matrix[k];
            k++;
          }
        }
        dst[(y * width + x) * 4 + ch] = clampByte(sum / divisor + offset);
      }
    }
  }
  return out;
}

// detecção de bordas de Sobel: combina gradiente horizontal (Gx) e vertical (Gy)
function sobel(imageData) {
  const grayData = grayscaleLuminosity(imageData);
  const { width, height, data: src } = grayData;
  const out = cloneImageData(imageData);
  const dst = out.data;

  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumX = 0;
      let sumY = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const yi = Math.min(height - 1, Math.max(0, y + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const xi = Math.min(width - 1, Math.max(0, x + kx));
          const v = src[(yi * width + xi) * 4];
          sumX += v * gx[k];
          sumY += v * gy[k];
          k++;
        }
      }
      const mag = clampByte(Math.sqrt(sumX * sumX + sumY * sumY));
      const idx = (y * width + x) * 4;
      dst[idx] = dst[idx + 1] = dst[idx + 2] = mag;
    }
  }
  return out;
}

// erosão/dilatação em imagem binarizada (255 = objeto/branco, 0 = fundo/preto)
function morphology(imageData, level, iterations, mode) {
  let current = threshold(imageData, level);
  const { width, height } = current;

  for (let it = 0; it < iterations; it++) {
    const src = current.data;
    const next = cloneImageData(current);
    const dst = next.data;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let result = mode === "erode" ? 255 : 0;
        for (let ky = -1; ky <= 1; ky++) {
          const yi = Math.min(height - 1, Math.max(0, y + ky));
          for (let kx = -1; kx <= 1; kx++) {
            const xi = Math.min(width - 1, Math.max(0, x + kx));
            const v = src[(yi * width + xi) * 4];
            result = mode === "erode" ? Math.min(result, v) : Math.max(result, v);
          }
        }
        const idx = (y * width + x) * 4;
        dst[idx] = dst[idx + 1] = dst[idx + 2] = result;
      }
    }
    current = next;
  }
  return current;
}

window.Filters = {
  negative,
  grayscaleAverage,
  grayscaleLuminosity,
  brightnessContrast,
  threshold,
  convolve3x3,
  sobel,
  morphology,
  KERNELS,
  cloneImageData,
};
