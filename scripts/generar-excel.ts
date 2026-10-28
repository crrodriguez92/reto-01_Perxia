
import { generarFormularioExcel } from "../src/providers/service";

const casos = [
  "co-industrias-delta",
  "ec-corp-andina",
  "hn-agroexport-sula",
  "pa-logistica-istmo",
];

async function main(): Promise<void> {
  let errores = 0;

  for (const caso of casos) {
    console.log(`\n===== ${caso} =====`);

    try {
      const resultado = await generarFormularioExcel(caso);

      console.log(JSON.stringify(resultado, null, 2));
    } catch (error: unknown) {
      errores++;

      const mensaje =
        error instanceof Error
          ? error.message
          : "Error inesperado";

      console.error(`[ERROR] ${caso}: ${mensaje}`);
    }
  }

  console.log("\n===== RESUMEN =====");
  console.log(`Casos procesados: ${casos.length}`);
  console.log(`Errores de generación: ${errores}`);

  if (errores > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const mensaje =
    error instanceof Error
      ? error.message
      : "Error inesperado";

  console.error(mensaje);
  process.exitCode = 1;
});
