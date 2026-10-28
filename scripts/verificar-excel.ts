
import ExcelJS from "exceljs";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";

type CampoPlantilla = {
  etiqueta?: string;
  hoja?: string;
  celda_etiqueta?: string;
  celda_valor?: string;
};

async function main(): Promise<void> {
  const casoId = "co-industrias-delta";

  const excelPath = resolve(
    "out",
    casoId,
    "formulario.xlsx",
  );

  const plantillaPath = resolve(
    "fixtures",
    "casos",
    casoId,
    "plantilla-celdas.json",
  );

  if (!existsSync(excelPath)) {
    throw new Error(`No existe el Excel: ${excelPath}`);
  }

  if (!existsSync(plantillaPath)) {
    throw new Error(`No existe la plantilla: ${plantillaPath}`);
  }

  const plantilla = JSON.parse(
    readFileSync(plantillaPath, "utf8"),
  ) as CampoPlantilla[];

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  let correctos = 0;
  let errores = 0;

  console.log(`Caso: ${casoId}`);
  console.log(`Excel: ${excelPath}`);
  console.log(`Campos de plantilla: ${plantilla.length}`);
  console.log("");

  for (const campo of plantilla) {
    const etiqueta = campo.etiqueta ?? "(sin etiqueta)";
    const hojaNombre = campo.hoja;

    if (
      !hojaNombre ||
      !campo.celda_etiqueta ||
      !campo.celda_valor
    ) {
      errores++;
      console.error(
        `[ERROR] ${etiqueta}: faltan hoja o coordenadas en la plantilla.`,
      );
      continue;
    }

    const hoja = workbook.getWorksheet(hojaNombre);

    if (!hoja) {
      errores++;
      console.error(
        `[ERROR] ${etiqueta}: no existe la hoja "${hojaNombre}".`,
      );
      continue;
    }

    const etiquetaReal = hoja.getCell(
      campo.celda_etiqueta,
    ).text.trim();

    const valorReal = hoja.getCell(
      campo.celda_valor,
    ).text.trim();

    if (etiquetaReal !== etiqueta) {
      errores++;
      console.error(
        `[ERROR] ${etiqueta}: etiqueta incorrecta en ` +
        `${hojaNombre}!${campo.celda_etiqueta}. ` +
        `Esperada="${etiqueta}", encontrada="${etiquetaReal}".`,
      );
      continue;
    }

    if (valorReal === "") {
      errores++;
      console.error(
        `[ERROR] ${etiqueta}: valor vacío en ` +
        `${hojaNombre}!${campo.celda_valor}.`,
      );
      continue;
    }

    correctos++;
    console.log(
      `[OK] ${etiqueta}: ` +
      `${hojaNombre}!${campo.celda_etiqueta} / ` +
      `${hojaNombre}!${campo.celda_valor}`,
    );
  }

  console.log("\n--- Resultado ---");
  console.log(`Correctos: ${correctos}`);
  console.log(`Errores: ${errores}`);

  if (errores > 0) {
    console.error("RESULTADO: FALLÓ la verificación.");
    process.exitCode = 1;
  } else {
    console.log("RESULTADO: verificación superada.");
  }
}

main().catch((error: unknown) => {
  const mensaje =
    error instanceof Error
      ? error.message
      : "Error inesperado";

  console.error(`No se pudo verificar el Excel: ${mensaje}`);
  process.exitCode = 1;
});
