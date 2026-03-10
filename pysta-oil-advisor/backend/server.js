const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const dataPath = path.join(__dirname, "data.json");

function loadData() {
  const raw = fs.readFileSync(dataPath, "utf8");
  return JSON.parse(raw);
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function similarity(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);

  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.85;

  let matches = 0;
  for (const ch of aa) {
    if (bb.includes(ch)) matches++;
  }

  return matches / Math.max(aa.length, bb.length);
}

function findBestMatch(items, brand, model, year) {
  const nBrand = normalizeText(brand);
  const nModel = normalizeText(model);
  const nYear = String(year || "").trim();

  let best = null;
  let bestScore = 0;

  for (const item of items) {
    const brandScore = similarity(item.brand, nBrand);
    const modelScore = similarity(item.model, nModel);
    const yearScore = String(item.year) === nYear ? 1 : 0;

    const score = brandScore * 0.35 + modelScore * 0.55 + yearScore * 0.1;

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return {
    best,
    score: bestScore
  };
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Pysta Oil Advisor API activa"
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/recommend", (req, res) => {
  try {
    const { brand, model, year } = req.body || {};

    if (!brand || !model || !year) {
      return res.status(400).json({
        ok: false,
        error: "Debes enviar brand, model y year"
      });
    }

    const items = loadData();
    const { best, score } = findBestMatch(items, brand, model, year);

    if (!best || score < 0.45) {
      return res.status(404).json({
        ok: false,
        error: "No encontramos una coincidencia confiable para esa moto.",
        suggestion: "Verifica marca, modelo y año."
      });
    }

    return res.json({
      ok: true,
      input: { brand, model, year },
      matched_vehicle: {
        brand: best.brand,
        model: best.model,
        year: best.year
      },
      recommendation: {
        engine_type: best.engine_type,
        viscosity: best.viscosity,
        api: best.api,
        jaso: best.jaso,
        capacity_liters: best.capacity_liters,
        notes: best.notes
      },
      confidence: Number(score.toFixed(2))
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      ok: false,
      error: "Error interno del servidor"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});