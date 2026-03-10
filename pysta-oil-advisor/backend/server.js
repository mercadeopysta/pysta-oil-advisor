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
    .replace(/\s+/g, " ")
    .trim();
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

app.get("/options", (req, res) => {
  try {
    const items = loadData();

    const brandsMap = {};

    for (const item of items) {
      const brand = item.brand;
      const model = item.model;
      const year = item.year;

      if (!brandsMap[brand]) {
        brandsMap[brand] = {};
      }

      if (!brandsMap[brand][model]) {
        brandsMap[brand][model] = [];
      }

      if (!brandsMap[brand][model].includes(year)) {
        brandsMap[brand][model].push(year);
      }
    }

    for (const brand of Object.keys(brandsMap)) {
      for (const model of Object.keys(brandsMap[brand])) {
        brandsMap[brand][model].sort((a, b) => a - b);
      }
    }

    res.json({
      ok: true,
      options: brandsMap
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: "No se pudieron cargar las opciones"
    });
  }
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

    const found = items.find((item) => {
      return (
        normalizeText(item.brand) === normalizeText(brand) &&
        normalizeText(item.model) === normalizeText(model) &&
        String(item.year) === String(year)
      );
    });

    if (!found) {
      return res.status(404).json({
        ok: false,
        error: "No existe una coincidencia exacta para esa moto."
      });
    }

    return res.json({
      ok: true,
      matched_vehicle: {
        brand: found.brand,
        model: found.model,
        year: found.year
      },
      recommendation: {
        engine_type: found.engine_type,
        viscosity: found.viscosity,
        api: found.api,
        jaso: found.jaso,
        capacity_liters: found.capacity_liters,
        notes: found.notes
      }
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
