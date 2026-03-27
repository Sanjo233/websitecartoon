'use strict';

const stylePresets = {
  Sketch: { contrast: 1.05, posterize: 4, blur: 0.8, sharpen: 0.4, edge: 1.6, grayscale: 0.9 },
  Cartoon: { contrast: 1.25, posterize: 5.5, blur: 0.9, sharpen: 1.1, edge: 0.6, grayscale: 0.25 },
  Ink: { contrast: 1.15, posterize: 3.8, blur: 0.3, sharpen: 0.7, edge: 1.9, grayscale: 0.7 },
};

const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const styleButtons = document.querySelectorAll('.style-btn');
const styleStatus = document.getElementById('styleStatus');
const loader = document.getElementById('loader');
const originalCanvas = document.getElementById('originalCanvas');
const processedCanvas = document.getElementById('processedCanvas');
const downloadBtn = document.getElementById('downloadBtn');
const intensitySlider = document.getElementById('intensitySlider');
const intensityValue = document.getElementById('intensityValue');
const comparisonSlider = document.getElementById('comparisonSlider');
const processedOverlay = document.getElementById('processedOverlay');
const comparisonHandle = document.getElementById('comparisonHandle');
const darkToggle = document.getElementById('darkToggle');

const originalCtx = originalCanvas.getContext('2d');
const processedCtx = processedCanvas.getContext('2d');

let cachedImage = null;
let selectedStyle = 'Cartoon';
let canvasWidth = 0;
let canvasHeight = 0;
let isProcessing = false;

function init() {
  fileInput.addEventListener('change', (event) => handleFiles(event.target.files));
  dropArea.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach((type) => {
    dropArea.addEventListener(type, (event) => {
      event.preventDefault();
      dropArea.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    dropArea.addEventListener(type, (event) => {
      event.preventDefault();
      if (type === 'drop') {
        handleFiles(event.dataTransfer.files);
      }
      dropArea.classList.remove('dragging');
    });
  });

  styleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedStyle = button.getAttribute('data-style');
      styleStatus.textContent = `Style: ${selectedStyle}`;
      highlightStyleButton();
      processImage();
    });
  });

  highlightStyleButton();

  intensitySlider.addEventListener('input', () => {
    intensityValue.textContent = intensitySlider.value;
    processImage();
  });

  comparisonSlider.addEventListener('input', () => updateComparisonWidth(comparisonSlider.value));
  updateComparisonWidth(comparisonSlider.value);

  downloadBtn.addEventListener('click', () => {
    if (!cachedImage) return;
    const link = document.createElement('a');
    link.download = 'cartoonified.png';
    link.href = processedCanvas.toDataURL('image/png');
    link.click();
  });

  darkToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
  });
}

function highlightStyleButton() {
  styleButtons.forEach((button) => {
    const isActive = button.getAttribute('data-style') === selectedStyle;
    button.classList.toggle('border-white/40', isActive);
    button.classList.toggle('border-white/10', !isActive);
    button.classList.toggle('text-white', isActive);
    button.classList.toggle('text-slate-300', !isActive);
    button.setAttribute('aria-pressed', isActive);
  });
}

function handleFiles(files) {
  if (!files || !files.length) return;
  const file = files[0];
  if (!file.type.startsWith('image/')) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      cachedImage = img;
      fitCanvases(img);
      processImage();
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function fitCanvases(image) {
  const maxDimension = 720;
  const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
  canvasWidth = Math.round(image.width * scale);
  canvasHeight = Math.round(image.height * scale);

  [originalCanvas, processedCanvas].forEach((canvas) => {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.height = `${canvasHeight}px`;
    canvas.style.width = `${canvasWidth}px`;
  });

  processedOverlay.style.setProperty('--canvas-width', `${canvasWidth}px`);

  originalCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  originalCtx.drawImage(image, 0, 0, canvasWidth, canvasHeight);
}

function processImage() {
  if (!cachedImage || isProcessing) return;
  isProcessing = true;
  toggleLoader(true);
  downloadBtn.disabled = true;

  setTimeout(() => {
    processedCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    processedCtx.drawImage(cachedImage, 0, 0, canvasWidth, canvasHeight);
    const imageData = processedCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const originalPixels = new Uint8ClampedArray(imageData.data);
    const intensity = Number(intensitySlider.value) / 100;
    applyCartoonPipeline(imageData, stylePresets[selectedStyle], intensity, originalPixels);
    processedCtx.putImageData(imageData, 0, 0);
    toggleLoader(false);
    isProcessing = false;
    downloadBtn.disabled = false;
  }, 50);
}

function toggleLoader(show) {
  loader.classList.toggle('hidden', !show);
}

function updateComparisonWidth(value) {
  processedOverlay.style.width = `${value}%`;
  comparisonHandle.style.left = `${value}%`;
}

function applyCartoonPipeline(imageData, preset, intensity, sourceData) {
  const grayscaleStrength = preset.grayscale;
  if (grayscaleStrength > 0) {
    applyGrayscaleBlend(imageData, sourceData, grayscaleStrength * 0.35);
  }

  const contrastValue = Math.min(150, preset.contrast * intensity * 60);
  const posterizeLevels = Math.max(2, Math.round(preset.posterize * (0.4 + intensity)));
  const blurAmount = preset.blur * intensity * 1.5;
  const sharpenAmount = preset.sharpen * intensity;
  const edgeStrength = Math.max(0, preset.edge * (0.7 + intensity * 0.8));

  const edgeMap = computeEdgeMap(sourceData, canvasWidth, canvasHeight);
  applyPosterize(imageData, posterizeLevels);
  adjustContrast(imageData, contrastValue);
  blurSharpen(imageData, blurAmount, sharpenAmount);
  blendEdges(imageData, edgeMap, edgeStrength);
}

function applyGrayscaleBlend(imageData, sourceData, blendStrength) {
  if (blendStrength <= 0) return;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luminosity = 0.3 * sourceData[i] + 0.59 * sourceData[i + 1] + 0.11 * sourceData[i + 2];
    data[i] = clamp(data[i] * (1 - blendStrength) + luminosity * blendStrength);
    data[i + 1] = clamp(data[i + 1] * (1 - blendStrength) + luminosity * blendStrength);
    data[i + 2] = clamp(data[i + 2] * (1 - blendStrength) + luminosity * blendStrength);
  }
}

function computeEdgeMap(sourceData, width, height) {
  const data = sourceData;
  const gray = new Float32Array(width * height);
  const edgeMap = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      gray[y * width + x] = 0.3 * data[idx] + 0.59 * data[idx + 1] + 0.11 * data[idx + 2];
    }
  }

  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      let index = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sample = gray[(y + ky) * width + (x + kx)];
          gx += sample * kernelX[index];
          gy += sample * kernelY[index];
          index++;
        }
      }
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeMap[y * width + x] = Math.min(255, magnitude);
    }
  }
  return edgeMap;
}

function applyPosterize(imageData, levels) {
  const data = imageData.data;
  const steps = Math.max(2, levels);
  const stepSize = 255 / (steps - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / stepSize) * stepSize;
    data[i + 1] = Math.round(data[i + 1] / stepSize) * stepSize;
    data[i + 2] = Math.round(data[i + 2] / stepSize) * stepSize;
  }
}

function adjustContrast(imageData, contrast) {
  const data = imageData.data;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(factor * (data[i] - 128) + 128);
    data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128);
    data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128);
  }
}

function blurSharpen(imageData, blurStrength, sharpenStrength) {
  if (blurStrength <= 0 && sharpenStrength <= 0) return;
  const blurred = boxBlur(imageData.data, imageData.width, imageData.height, Math.max(1, Math.round(blurStrength)));
  const data = imageData.data;
  const mixFactor = Math.min(0.9, blurStrength * 0.22);
  for (let i = 0; i < data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const original = data[i + channel];
      const soft = blurred[i + channel];
      let blended = original * (1 - mixFactor) + soft * mixFactor;
      if (sharpenStrength > 0) {
        blended = blended + (original - soft) * sharpenStrength * 0.9;
      }
      data[i + channel] = clamp(blended);
    }
  }
}

function boxBlur(src, width, height, radius) {
  const dst = new Uint8ClampedArray(src.length);
  const rs = Math.max(1, radius);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let dy = -rs; dy <= rs; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -rs; dx <= rs; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const idx = (ny * width + nx) * 4;
          rSum += src[idx];
          gSum += src[idx + 1];
          bSum += src[idx + 2];
          count++;
        }
      }
      const index = (y * width + x) * 4;
      dst[index] = rSum / count;
      dst[index + 1] = gSum / count;
      dst[index + 2] = bSum / count;
      dst[index + 3] = src[index + 3];
    }
  }
  return dst;
}

function blendEdges(imageData, edgeMap, strength) {
  if (strength <= 0) return;
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const edgeValue = edgeMap[y * width + x];
      const reduction = clamp(edgeValue * strength * 0.02);
      data[idx] = clamp(data[idx] - reduction);
      data[idx + 1] = clamp(data[idx + 1] - reduction);
      data[idx + 2] = clamp(data[idx + 2] - reduction);
    }
  }
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

document.addEventListener('DOMContentLoaded', init);
