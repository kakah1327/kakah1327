/**
 * Cálculo e desenho do histograma de intensidades (0-255) de uma imagem.
 */

function computeHistogram(imageData) {
  const hist = new Array(256).fill(0);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    hist[gray]++;
  }
  return hist;
}

function drawHistogram(canvas, hist) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const max = Math.max(...hist, 1);
  const barWidth = w / hist.length;

  ctx.fillStyle = "#6366f1";
  for (let i = 0; i < hist.length; i++) {
    const barHeight = (hist[i] / max) * (h - 4);
    ctx.fillRect(i * barWidth, h - barHeight, Math.max(barWidth, 1), barHeight);
  }
}

window.Histogram = { computeHistogram, drawHistogram };
