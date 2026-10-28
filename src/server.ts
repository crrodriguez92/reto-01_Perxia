import "dotenv/config";
import express from "express";
import {
  listarCasos,
  obtenerCaso,
  validarCaso
} from "./providers/service";

const app = express();
const port = Number(process.env.PORT) || 3002;

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    estado: "ok",
    aplicacion: "Agente de registro de proveedores",
    fecha: new Date().toISOString()
  });
});

app.get("/api/proveedores/casos", (_req, res) => {
  try {
    res.json({ casos: listarCasos() });
  } catch (error) {
    console.error("Error listando casos:", error);
    res.status(500).json({ error: "No fue posible listar los casos." });
  }
});

app.get("/api/proveedores/casos/:id", (req, res) => {
  try {
    res.json(obtenerCaso(req.params.id));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error inesperado";

    res.status(404).json({ error: message });
  }
});

app.post("/api/proveedores/casos/:id/validar", (req, res) => {
  try {
    res.json(validarCaso(req.params.id));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error inesperado";

    console.error("Error validando caso:", message);
    res.status(400).json({ error: message });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Agente de proveedores disponible en http://localhost:${port}`);
});
