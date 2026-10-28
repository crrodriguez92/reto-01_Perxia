
import ExcelJS from "exceljs";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "fixtures");
const CASES_DIR = join(ROOT, "casos");
const REPOSITORY_DIR = join(ROOT, "repositorio");
const SUPPORTS_DIR = join(REPOSITORY_DIR, "soportes");

type JsonRecord = Record<string, unknown>;

type TemplateItem = {
  etiqueta?: string;
  obligatorio?: boolean;
  hoja?: string;
  celda_valor?: string;
  celda_etiqueta?: string;
};

type FieldStatus = "lleno" | "faltante" | "requiere_confirmacion";

function readJson<T>(filePath: string): T {
  if (!existsSync(filePath)) {
    throw new Error(`No se encontró el archivo requerido: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getValueByPath(source: JsonRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (
      current === null ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return undefined;
    }

    return (current as JsonRecord)[key];
  }, source);
}

function listCaseIds(): string[] {
  return readdirSync(CASES_DIR, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function loadCase(id: string) {
  if (!listCaseIds().includes(id)) {
    throw new Error(`Caso de proveedor no encontrado: ${id}`);
  }

  const directory = join(CASES_DIR, id);
  const solicitud = readJson<JsonRecord>(join(directory, "solicitud.json"));

  const supportRequirements = readJson<string[]>(
    join(directory, "soportes-exigidos.json"),
  );

  const cellTemplatePath = join(directory, "plantilla-celdas.json");
  const fieldTemplatePath = join(directory, "plantilla-campos.json");

  let template: TemplateItem[];
  let templateType: "celdas" | "campos";

  if (existsSync(cellTemplatePath)) {
    template = readJson<TemplateItem[]>(cellTemplatePath);
    templateType = "celdas";
  } else if (existsSync(fieldTemplatePath)) {
    template = readJson<TemplateItem[]>(fieldTemplatePath);
    templateType = "campos";
  } else {
    throw new Error(`El caso "${id}" no contiene una plantilla reconocida.`);
  }

  return {
    id,
    directory,
    solicitud,
    supportRequirements,
    template,
    templateType,
  };
}

export function listarCasos() {
  return listCaseIds().map((id) => {
    const { solicitud, templateType, template, supportRequirements } =
      loadCase(id);

    return {
      id,
      cliente: solicitud.cliente,
      pais: solicitud.pais,
      formato: solicitud.formato,
      fecha: solicitud.fecha,
      asunto: solicitud.asunto,
      cantidadCampos: template.length,
      cantidadSoportesExigidos: supportRequirements.length,
      tipoPlantilla: templateType,
    };
  });
}

export function obtenerCaso(id: string) {
  const caso = loadCase(id);

  return {
    id: caso.id,
    solicitud: caso.solicitud,
    plantilla: caso.template,
    tipoPlantilla: caso.templateType,
    soportesExigidos: caso.supportRequirements,
  };
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function isTaxIdentifier(label: string): boolean {
  const normalized = normalizeLabel(label);

  return [
    "nit",
    "ruc",
    "rtn",
    "identificacion tributaria",
    "numero de identificacion fiscal",
  ].includes(normalized);
}

function mapFields(
  template: TemplateItem[],
  templateType: "celdas" | "campos",
  glossary: Record<string, string>,
  master: JsonRecord,
  country: string,
) {
  const normalizedGlossary = new Map(
    Object.entries(glossary).map(([label, path]) => [
      normalizeLabel(label),
      path,
    ]),
  );

  const fields = template.map((item) => {
    const label = String(item.etiqueta ?? "");
    const key = normalizedGlossary.get(normalizeLabel(label)) ?? null;

    const rawValue = key ? getValueByPath(master, key) : undefined;

    const required =
      templateType === "campos" ? item.obligatorio === true : null;

    let status: FieldStatus;
    let note: string | undefined;

    if (!key) {
      status = "requiere_confirmacion";
      note = "No se encontró correspondencia para este campo en el glosario.";
    } else if (isEmpty(rawValue)) {
      status = "faltante";
      note =
        "El campo tiene correspondencia en el glosario, pero no se encontró un valor en el maestro.";
    } else if (country !== "CO" && isTaxIdentifier(label)) {
      status = "requiere_confirmacion";
      note =
        "El maestro contiene un identificador tributario colombiano. Debe confirmarse el identificador válido para el país de destino.";
    } else {
      status = "lleno";
    }

    const value = isEmpty(rawValue) ? null : rawValue;

    return {
      etiqueta: label,
      campoMaestro: key,
      rutaMaestro: key ? `maestro.${key}` : null,
      valor: value,
      obligatorio: required,
      estado: status,
      ...(note ? { observacion: note } : {}),
      ...(item.hoja ? { hoja: item.hoja } : {}),
      ...(item.celda_valor ? { celdaValor: item.celda_valor } : {}),
      ...(item.celda_etiqueta ? { celdaEtiqueta: item.celda_etiqueta } : {}),
    };
  });

  const bloqueos: string[] = [];
  const advertencias: string[] = [];

  for (const field of fields) {
    if (field.obligatorio === true && field.estado !== "lleno") {
      bloqueos.push(
        `El campo obligatorio "${field.etiqueta}" requiere atención: ${field.estado}.`,
      );
    } else if (field.estado === "requiere_confirmacion") {
      advertencias.push(`El campo "${field.etiqueta}" requiere confirmación.`);
    } else if (field.estado === "faltante" && field.obligatorio !== false) {
      advertencias.push(
        `No se encontró un valor maestro para "${field.etiqueta}".`,
      );
    }
  }

  return { fields, bloqueos, advertencias };
}

function validateSupports(requiredTypes: string[], country: string) {
  const index = readJson<JsonRecord[]>(join(SUPPORTS_DIR, "index.json"));

  const today = new Date().toISOString().slice(0, 10);

  const results = requiredTypes.map((type) => {
    const entry = index.find(
      (item) => item.tipo === type && item.pais_emisor === country,
    );

    if (!entry) {
      return {
        tipo: type,
        estado: "faltante",
        detalle: `No hay un soporte registrado para "${type}" emitido en ${country}.`,
      };
    }

    const filename = typeof entry.archivo === "string" ? entry.archivo : "";

    if (!filename) {
      return {
        tipo: type,
        estado: "faltante",
        detalle: "El índice no contiene un nombre de archivo válido.",
      };
    }

    const filePath = join(SUPPORTS_DIR, filename);

    if (!existsSync(filePath)) {
      return {
        tipo: type,
        archivo: filename,
        estado: "faltante",
        detalle: "El índice referencia un archivo que no existe.",
      };
    }

    const content = readFileSync(filePath, "utf8");
    const expiry =
      typeof entry.vigencia_hasta === "string" ? entry.vigencia_hasta : null;

    if (expiry && expiry < today) {
      return {
        tipo: type,
        archivo: filename,
        vigenciaHasta: expiry,
        estado: "vencido",
        detalle: `El soporte venció el ${expiry}.`,
      };
    }

    if (content.includes("PLACEHOLDER DE SOPORTE")) {
      return {
        tipo: type,
        archivo: filename,
        vigenciaHasta: expiry,
        estado: "no_verificable",
        detalle:
          "El archivo es un marcador ficticio, no un documento real verificable.",
      };
    }

    return {
      tipo: type,
      archivo: filename,
      vigenciaHasta: expiry,
      estado: "vigente",
      detalle:
        "Existe un archivo y no se detectó vencimiento en sus metadatos.",
    };
  });

  const bloqueos = results
    .filter((item) => item.estado !== "vigente")
    .map((item) => `${item.tipo}: ${item.detalle}`);

  return { soportes: results, bloqueos };
}

export function validarCaso(id: string) {
  const caso = loadCase(id);

  const glossary = readJson<Record<string, string>>(
    join(ROOT, "glosario-campos.json"),
  );

  const master = readJson<JsonRecord>(join(REPOSITORY_DIR, "maestro.json"));

  const country = String(caso.solicitud.pais ?? "");

  const mapping = mapFields(
    caso.template,
    caso.templateType,
    glossary,
    master,
    country,
  );

  const supportValidation = validateSupports(caso.supportRequirements, country);

  const bloqueos = [...mapping.bloqueos, ...supportValidation.bloqueos];

  return {
    casoId: id,
    cliente: caso.solicitud.cliente,
    pais: country,
    formato: caso.solicitud.formato,
    fechaEvaluacion: new Date().toISOString(),
    campos: mapping.fields,
    soportes: supportValidation.soportes,
    resumen: {
      totalCampos: mapping.fields.length,
      camposLlenos: mapping.fields.filter((field) => field.estado === "lleno")
        .length,
      camposFaltantes: mapping.fields.filter(
        (field) => field.estado === "faltante",
      ).length,
      camposRequierenConfirmacion: mapping.fields.filter(
        (field) => field.estado === "requiere_confirmacion",
      ).length,
      soportesExigidos: caso.supportRequirements.length,
      soportesBloqueantes: supportValidation.bloqueos.length,
    },
    bloqueos,
    advertencias: mapping.advertencias,
    listoParaFirma: bloqueos.length === 0,
  };
}

/**
 * Genera el formulario Excel para los casos que definen
 * ubicaciones explícitas de hoja y celda.
 *
 * La generación del archivo no implica que el paquete
 * esté aprobado para firma ni que los soportes sean válidos.
 */

export async function generarFormularioExcel(id: string) {
  const caso = loadCase(id);

  const glossary = readJson<Record<string, string>>(
    join(ROOT, "glosario-campos.json"),
  );

  const master = readJson<JsonRecord>(
    join(REPOSITORY_DIR, "maestro.json"),
  );

  const country = String(caso.solicitud.pais ?? "");

  const mapping = mapFields(
    caso.template,
    caso.templateType,
    glossary,
    master,
    country,
  );

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Agente de registro de proveedores";
  workbook.created = new Date();

  if (caso.templateType === "celdas") {
    for (const field of mapping.fields) {
      if (!field.hoja || !field.celdaValor) {
        throw new Error(
          `La plantilla contiene una ubicación incompleta para "${field.etiqueta}".`,
        );
      }

      let worksheet = workbook.getWorksheet(field.hoja);

      if (!worksheet) {
        worksheet = workbook.addWorksheet(field.hoja);
      }

      if (field.celdaEtiqueta) {
        worksheet.getCell(field.celdaEtiqueta).value =
          field.etiqueta;
      }

      const cell = worksheet.getCell(field.celdaValor);
      const value = field.valor;

      if (value === null || value === undefined) {
        cell.value = "";
      } else if (typeof value === "object") {
        cell.value = JSON.stringify(value);
      } else {
        cell.value = String(value);
      }
    }
  } else {
    const worksheet = workbook.addWorksheet("Datos Proveedor");

    worksheet.columns = [
      { header: "Campo", key: "etiqueta", width: 38 },
      { header: "Valor", key: "valor", width: 48 },
      { header: "Estado", key: "estado", width: 26 },
      { header: "Observación", key: "observacion", width: 75 },
    ];

    worksheet.getRow(1).font = { bold: true };

    for (const field of mapping.fields) {
      const value = field.valor;

      worksheet.addRow({
        etiqueta: field.etiqueta,
        valor:
          value === null || value === undefined
            ? ""
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value),
        estado: field.estado,
        observacion:
          "observacion" in field &&
          typeof field.observacion === "string"
            ? field.observacion
            : "",
      });
    }

    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = {
      from: "A1",
      to: `D${mapping.fields.length + 1}`,
    };
  }

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => {
      row.alignment = {
        ...row.alignment,
        vertical: "top",
        wrapText: true,
      };
    });

    if (caso.templateType === "celdas") {
      worksheet.getColumn("B").width = 34;
      worksheet.getColumn("C").width = 42;
    }
  }

  const outputDirectory = join(
    process.cwd(),
    "out",
    id,
  );

  mkdirSync(outputDirectory, { recursive: true });

  const outputPath = join(
    outputDirectory,
    "formulario.xlsx",
  );

  await workbook.xlsx.writeFile(outputPath);

  return {
    ok: true,
    casoId: id,
    archivo: outputPath,
    tipoPlantilla: caso.templateType,
    hojas: workbook.worksheets.map(
      (worksheet) => worksheet.name,
    ),
    camposEscritos: mapping.fields.length,
    camposLlenos: mapping.fields.filter(
      (field) => field.estado === "lleno",
    ).length,
    camposFaltantes: mapping.fields.filter(
      (field) => field.estado === "faltante",
    ).length,
    camposRequierenConfirmacion: mapping.fields.filter(
      (field) => field.estado === "requiere_confirmacion",
    ).length,
    advertencias: mapping.advertencias,
  };
}
