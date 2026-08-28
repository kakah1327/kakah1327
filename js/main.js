/**
 * Interação da UI: upload de imagem, controles do laboratório e navegação entre seções.
 */

const CODE_SNIPPETS = {
  original: `# imagem original, sem processamento`,

  negativo: `from PIL import Image

img = Image.open("foto.png").convert("RGB")
largura, altura = img.size
pixels = img.load()

for y in range(altura):
    for x in range(largura):
        r, g, b = pixels[x, y]
        pixels[x, y] = (255 - r, 255 - g, 255 - b)

img.save("negativo.png")`,

  "cinza-media": `for y in range(altura):
    for x in range(largura):
        r, g, b = pixels[x, y]
        media = (r + g + b) // 3
        pixels[x, y] = (media, media, media)`,

  "cinza-luminosidade": `for y in range(altura):
    for x in range(largura):
        r, g, b = pixels[x, y]
        # pesos que imitam a sensibilidade do olho humano
        l = int(0.299 * r + 0.587 * g + 0.114 * b)
        pixels[x, y] = (l, l, l)`,

  "brilho-contraste": `def ajusta(v, brilho, fator):
    v = fator * (v - 128) + 128 + brilho
    return max(0, min(255, int(v)))

for y in range(altura):
    for x in range(largura):
        r, g, b = pixels[x, y]
        pixels[x, y] = (
            ajusta(r, brilho, fator),
            ajusta(g, brilho, fator),
            ajusta(b, brilho, fator),
        )`,

  limiarizacao: `limiar = 128

for y in range(altura):
    for x in range(largura):
        r, g, b = pixels[x, y]
        l = 0.299 * r + 0.587 * g + 0.114 * b
        v = 255 if l >= limiar else 0
        pixels[x, y] = (v, v, v)`,

  blur: `kernel = [
    [1, 2, 1],
    [2, 4, 2],
    [1, 2, 1],
]
divisor = 16

# para cada pixel (x, y), soma a vizinhança 3x3 ponderada pelo kernel
# e divide pelo divisor -> essa é a ideia geral de CONVOLUÇÃO
for y in range(1, altura - 1):
    for x in range(1, largura - 1):
        soma = [0, 0, 0]
        for ky in range(-1, 2):
            for kx in range(-1, 2):
                r, g, b = pixels[x + kx, y + ky]
                peso = kernel[ky + 1][kx + 1]
                soma[0] += r * peso
                soma[1] += g * peso
                soma[2] += b * peso
        nova_pixels[x, y] = tuple(int(c / divisor) for c in soma)`,

  sharpen: `kernel = [
    [ 0, -1,  0],
    [-1,  5, -1],
    [ 0, -1,  0],
]
divisor = 1
# mesma lógica de convolução do desfoque, só muda o kernel`,

  "bordas-laplaciano": `kernel = [
    [ 0, -1,  0],
    [-1,  4, -1],
    [ 0, -1,  0],
]
divisor = 1
deslocamento = 128  # soma pra centralizar os valores negativos em cinza`,

  "bordas-sobel": `gx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
gy = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]

# converte pra cinza antes, depois combina os dois gradientes:
for y in range(1, altura - 1):
    for x in range(1, largura - 1):
        somaX = somaY = 0
        for ky in range(-1, 2):
            for kx in range(-1, 2):
                l = cinza[x + kx, y + ky]
                somaX += l * gx[ky + 1][kx + 1]
                somaY += l * gy[ky + 1][kx + 1]
        mag = min(255, int((somaX ** 2 + somaY ** 2) ** 0.5))
        nova_pixels[x, y] = (mag, mag, mag)`,

  relevo: `kernel = [
    [-2, -1,  0],
    [-1,  1,  1],
    [ 0,  1,  2],
]
divisor = 1
deslocamento = 128`,

  erosao: `# 1) binariza a imagem (ver limiarização)
# 2) para cada pixel, o resultado é o MENOR valor da vizinhança 3x3
for y in range(1, altura - 1):
    for x in range(1, largura - 1):
        vizinhanca = [binaria[x + kx, y + ky]
                      for ky in range(-1, 2) for kx in range(-1, 2)]
        nova_pixels[x, y] = min(vizinhanca)  # encolhe as regiões brancas`,

  dilatacao: `# 1) binariza a imagem (ver limiarização)
# 2) para cada pixel, o resultado é o MAIOR valor da vizinhança 3x3
for y in range(1, altura - 1):
    for x in range(1, largura - 1):
        vizinhanca = [binaria[x + kx, y + ky]
                      for ky in range(-1, 2) for kx in range(-1, 2)]
        nova_pixels[x, y] = max(vizinhanca)  # expande as regiões brancas`,
};

const CONTROLS_BY_FILTER = {
  "brilho-contraste": ["brightness", "contrast"],
  limiarizacao: ["threshold"],
  erosao: ["threshold", "iterations"],
  dilatacao: ["threshold", "iterations"],
};

let originalImageData = null;

function $(id) {
  return document.getElementById(id);
}

function fitCanvasToImage(canvas, img, maxWidth) {
  const scale = Math.min(1, maxWidth / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
}

function drawImageToCanvases(img) {
  const canvasOriginal = $("canvasOriginal");
  const canvasResult = $("canvasResult");
  fitCanvasToImage(canvasOriginal, img, 420);
  canvasResult.width = canvasOriginal.width;
  canvasResult.height = canvasOriginal.height;

  const ctxOriginal = canvasOriginal.getContext("2d");
  ctxOriginal.drawImage(img, 0, 0, canvasOriginal.width, canvasOriginal.height);
  originalImageData = ctxOriginal.getImageData(0, 0, canvasOriginal.width, canvasOriginal.height);

  applyCurrentFilter();
}

function generateSampleImage() {
  const tmp = document.createElement("canvas");
  tmp.width = 400;
  tmp.height = 280;
  const ctx = tmp.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, tmp.width, tmp.height);
  grad.addColorStop(0, "#4f46e5");
  grad.addColorStop(1, "#06b6d4");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, tmp.width, tmp.height);

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(110, 140, 55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.fillRect(210, 70, 130, 130);

  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(240, 235);
  ctx.lineTo(370, 235);
  ctx.stroke();

  const img = new Image();
  img.onload = () => drawImageToCanvases(img);
  img.src = tmp.toDataURL();
}

function updateControlsVisibility(filter) {
  const visible = new Set(CONTROLS_BY_FILTER[filter] || []);
  document.querySelectorAll(".control-group[data-control]").forEach((el) => {
    el.classList.toggle("hidden", !visible.has(el.dataset.control));
  });
}

function applyCurrentFilter() {
  if (!originalImageData) return;

  const filter = $("filterSelect").value;
  updateControlsVisibility(filter);

  const src = Filters.cloneImageData(originalImageData);
  let result;

  switch (filter) {
    case "original":
      result = src;
      break;
    case "negativo":
      result = Filters.negative(src);
      break;
    case "cinza-media":
      result = Filters.grayscaleAverage(src);
      break;
    case "cinza-luminosidade":
      result = Filters.grayscaleLuminosity(src);
      break;
    case "brilho-contraste":
      result = Filters.brightnessContrast(
        src,
        Number($("brightnessSlider").value),
        Number($("contrastSlider").value)
      );
      break;
    case "limiarizacao":
      result = Filters.threshold(src, Number($("thresholdSlider").value));
      break;
    case "blur":
      result = Filters.convolve3x3(src, Filters.KERNELS.blur);
      break;
    case "sharpen":
      result = Filters.convolve3x3(src, Filters.KERNELS.sharpen);
      break;
    case "bordas-laplaciano":
      result = Filters.convolve3x3(src, Filters.KERNELS.laplace);
      break;
    case "bordas-sobel":
      result = Filters.sobel(src);
      break;
    case "relevo":
      result = Filters.convolve3x3(src, Filters.KERNELS.emboss);
      break;
    case "erosao":
      result = Filters.morphology(
        src,
        Number($("thresholdSlider").value),
        Number($("iterationsSlider").value),
        "erode"
      );
      break;
    case "dilatacao":
      result = Filters.morphology(
        src,
        Number($("thresholdSlider").value),
        Number($("iterationsSlider").value),
        "dilate"
      );
      break;
    default:
      result = src;
  }

  const canvasResult = $("canvasResult");
  canvasResult.getContext("2d").putImageData(result, 0, 0);

  const hist = Histogram.computeHistogram(result);
  Histogram.drawHistogram($("canvasHistogram"), hist);

  $("codeBlock").textContent = CODE_SNIPPETS[filter] || "";

  syncSliderLabels();
}

function syncSliderLabels() {
  $("brightnessValue").textContent = $("brightnessSlider").value;
  $("contrastValue").textContent = $("contrastSlider").value;
  $("thresholdValue").textContent = $("thresholdSlider").value;
  $("iterationsValue").textContent = $("iterationsSlider").value;
}

function setupUpload() {
  $("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => drawImageToCanvases(img);
    img.src = URL.createObjectURL(file);
  });

  $("sampleButton").addEventListener("click", generateSampleImage);
}

function setupControls() {
  $("filterSelect").addEventListener("change", applyCurrentFilter);
  ["brightnessSlider", "contrastSlider", "thresholdSlider", "iterationsSlider"].forEach((id) => {
    $(id).addEventListener("input", applyCurrentFilter);
  });
}

function setupSectionHighlight() {
  const links = document.querySelectorAll(".nav-link");
  const sections = Array.from(links).map((link) => document.querySelector(link.getAttribute("href")));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === id));
      });
    },
    { rootMargin: "-40% 0px -50% 0px" }
  );

  sections.forEach((section) => section && observer.observe(section));
}

document.addEventListener("DOMContentLoaded", () => {
  setupUpload();
  setupControls();
  setupSectionHighlight();
  updateControlsVisibility("original");
  generateSampleImage();
});
