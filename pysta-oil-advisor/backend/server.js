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

function tokenize(text) {
  return normalizeText(text)
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);

  const matrix = Array.from({ length: aa.length + 1 }, () =>
    new Array(bb.length + 1).fill(0)
  );

  for (let i = 0; i <= aa.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= bb.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= aa.length; i++) {
    for (let j = 1; j <= bb.length; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[aa.length][bb.length];
}

function similarity(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);

  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.92;

  const dist = levenshtein(aa, bb);
  const maxLen = Math.max(aa.length, bb.length);
  return Math.max(0, 1 - dist / maxLen);
}

function aliasBrand(brand) {
  const b = normalizeText(brand);

  const aliases = {
    cfmoto: ["cfmoto"],
    akt: ["akt"],
    yamaha: ["yamaha"],
    honda: ["honda"],
    suzuki: ["suzuki"],
    bajaj: ["bajaj"],
    tvs: ["tvs"],
    hero: ["hero"],
    victory: ["victory"],
    benelli: ["benelli"],
    ktm: ["ktm"]
  };

  for (const [key, arr] of Object.entries(aliases)) {
    if (arr.some((x) => b.includes(x))) return key;
  }

  return b;
}

function aliasModel(model) {
  const m = normalizeText(model);

  const aliases = [
    { find: ["mkd", "nkd", "nkd125"], value: "nkd 125" },
    { find: ["xtz150", "xtz"], value: "xtz 150" },
    { find: ["fz20", "fz2", "fz20fi", "fz20abs", "fz2.0"], value: "fz 2.0" },
    { find: ["cb125f", "cb125", "cb125f twister"], value: "cb 125f" },
    { find: ["xr150", "xr150l"], value: "xr 150l" },
    { find: ["gn125", "gn"], value: "gn 125" },
    { find: ["boxerct100", "ct100", "boxer100"], value: "boxer ct 100" },
    { find: ["boxers", "boxer150", "boxer s"], value: "boxer s" },
    { find: ["gixxer150"], value: "gixxer 150" },
    { find: ["szrr150", "szrr"], value: "sz-rr 150" },
    { find: ["ybrz125", "ybrz"], value: "ybr z125" },
    { find: ["xre300"], value: "xre 300" },
    { find: ["cb190r"], value: "cb 190r" },
    { find: ["cb160f"], value: "cb 160f" },
    { find: ["fzn150", "fzn"], value: "fzn 150" },
    { find: ["xtz125"], value: "xtz 125" },
    { find: ["gpd155", "nmax"], value: "nmax" },
    { find: ["pcx160", "pcx"], value: "pcx 160" },
    { find: ["xr190l", "xr190"], value: "xr 190l" }
  ];

  for (const alias of aliases) {
    if (alias.find.some((x) => m.includes(normalizeText(x)))) {
      return alias.value;
    }
  }

  return model;
}

function modelTokenScore(a, b) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  if (!aTokens.length || !bTokens.length) return 0;

  let hits = 0;
  for (const token of aTokens) {
    if (bTokens.some((bt) => similarity(token, bt) >= 0.8)) hits++;
  }

  const ratio = hits / Math.max(aTokens.length, bTokens.length);
  return Math.max(ratio, similarity(a, b));
}

function yearScore(inputYear, itemYear) {
  const y1 = parseInt(inputYear, 10);
  const y2 = parseInt(itemYear, 10);

  if (!y1 || !y2) return 0.5;
  if (y1 === y2) return 1;

  const diff = Math.abs(y1 - y2);
  if (diff === 1) return 0.9;
  if (diff === 2) return 0.75;
  if (diff <= 4) return 0.55;
  return 0.2;
}

function findBestMatch(items, brand, model, year) {
  const cleanBrand = aliasBrand(brand);
  const cleanModel = aliasModel(model);

  let best = null;
  let bestScore = 0;

  for (const item of items) {
    const bScore = similarity(aliasBrand(item.brand), cleanBrand);
    const mScore = modelTokenScore(aliasModel(item.model), cleanModel);
    const yScore = yearScore(year, item.year);

    const score = bScore * 0.3 + mScore * 0.55 + yScore * 0.15;

    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  return { best, score: bestScore };
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

    if (!best || score < 0.58) {
      return res.status(404).json({
        ok: false,
        error: "No encontramos una coincidencia confiable para esa moto.",
        suggestion: "Verifica marca, modelo y año o amplía la base de datos."
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

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);

});

