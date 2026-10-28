
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

  if (!apiKey || apiKey === "TU_CLAVE_DE_GEMINI") {
    throw new Error(
      "Configura GEMINI_API_KEY en el archivo .env."
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log(`Probando conexión con Gemini: ${model}`);

  const response = await ai.models.generateContent({
    model,
    contents:
      "Responde en español: confirma que estás disponible para un agente conversacional de registro de proveedores."
  });

  console.log("\nRespuesta de Gemini:");
  console.log(response.text ?? "(El modelo no devolvió texto)");

  console.log("\nConexión con Gemini verificada.");
}

main().catch((error: unknown) => {
  console.error("No se pudo completar la prueba de Gemini.");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
