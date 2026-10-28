import {
  existsSync,
  readFileSync,
  readdirSync
} from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(process.cwd(), "fixtures");
const CASES_DIR = join(ROOT, "casos");
const REPOSITORY_DIR = join(ROOT, "repositorio");
const SUPPORTS_DIR = join(REPOSITORY_DIR, "soportes");

type AnyRecord = Record<string, any>;

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

function getValueByPath(source: AnyRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (
      current === null ||
      typeof current !== "object" ||
      !(key in current)
    ) {
      return undefined;
    }

    return (current as AnyRecord)[key];
  }, source);
}

function listCaseIds(): string[] {
  return readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function loadCase(id: string) {
  if (!listCaseIds().includes(id)) {
    throw new Error(`Caso de proveedor no encontrado: ${id}`);
  }

  const directory = join(CASES_DIR, id);
  const solicitud = readJson<AnyRecord>(
    join(directory, "solicitud.json")
  );

  const supportRequirements = readJson<string[]>(
    join(directory, "soportes-exigidos.json")
  );

  const cellTemplatePath = join(directory, "plantilla-celdas.json");
  const fieldTemplatePath = join(directory, "plantilla-campos.json");

  let template: AnyRecord[];
  let templateType: "celdas" | "campos";

  if (existsSync(cellTemplatePath)) {
    template = readJson<AnyRecord[]>(cellTemplatePath);
    templateType = "celdas";
  } else if (existsSync(fieldTemplatePath)) {
    template = readJson<AnyRecord[]>(fieldTemplatePath);
    templateType = "campos";
  } else {
    template = [];
    templateType = "campos";
  }

  return {
    id,
    directory,
    solicitud,
    supportRequirements,
    template,
    templateType
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
      tipoPlantilla: templateType
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
    soportesExigidos: caso.supportRequirements
  };
}

function mapFields(
  template: AnyRecord[],
  templateType: "celdas" | "campos",
  glossary: Record<string, string>,
  master: AnyRecord
) {
  const normalizedGlossary = new Map(
    Object.entries(glossary).map(([label, key]) => [
      normalizeLabel(label),
      key
    ])
  );

  const fields = template.map((item) => {
    const label = String(item.etiqueta ?? "");
    const key = normalizedGlossary.get(normalizeLabel(label)) ?? null;
    const value = key ? getValueByPath(master, key) : undefined;
    const required =
      templateType === "campos" ? item.obligatorio === true : null;

    let status: "completado" | "faltante" | "sin_mapeo";

    if (!key) {
      status = "sin_mapeo";
    } else if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      status = "faltante";
    } else {
      status = "completado";
    }

    return {
      etiqueta: label,
      campoMaestro: key,
      valor: value ?? null,
      obligatorio: required,
      estado: status,
      ...(item.hoja ? { hoja: item.hoja } : {}),
      ...(item.celda_valor ? { celdaValor: item.celda_valor } : {})
    };
  });

  const bloqueos: string[] = [];
  const advertencias: string[] = [];

  for (const field of fields) {
    if (field.obligatorio === true && field.estado !== "completado") {
      bloqueos.push(
        field.estado === "sin_mapeo"
          ? `El campo obligatorio "${field.etiqueta}" no tiene correspondencia en el glosario.`
          : `Falta el valor del campo obligatorio "${field.etiqueta}".`
      );
    } else if (field.estado === "sin_mapeo") {
      advertencias.push(
        `No se encontró correspondencia en el glosario para "${field.etiqueta}".`
      );
    } else if (
      field.estado === "faltante" &&
      field.obligatorio !== false
    ) {
      advertencias.push(
        `No se encontró un valor maestro para "${field.etiqueta}".`
      );
    }
  }

  return { fields, bloqueos, advertencias };
}

function validateSupports(
  requiredTypes: string[],
  country: string
) {
  const index = readJson<AnyRecord[]>(
    join(SUPPORTS_DIR, "index.json")
  );

  const today = new Date().toISOString().slice(0, 10);
  const results = requiredTypes.map((type) => {
    const entry = index.find(
      (item) =>
        item.tipo === type &&
        item.pais_emisor === country
    );

    if (!entry) {
      return {
        tipo: type,
        estado: "faltante",
        detalle: `No hay un soporte registrado para "${type}" emitido en ${country}.`
      };
    }

    const filePath = join(SUPPORTS_DIR, entry.archivo);

    if (!existsSync(filePath)) {
      return {
        tipo: type,
        archivo: entry.archivo,
        estado: "faltante",
        detalle: "El índice referencia un archivo que no existe."
      };
    }

    const content = readFileSync(filePath, "utf8");
    const expiry = entry.vigencia_hasta as string | null;

    if (expiry && expiry < today) {
      return {
        tipo: type,
        archivo: entry.archivo,
        vigenciaHasta: expiry,
        estado: "vencido",
        detalle: `El soporte venció el ${expiry}.`
      };
    }

    if (content.includes("PLACEHOLDER DE SOPORTE")) {
      return {
        tipo: type,
        archivo: entry.archivo,
        vigenciaHasta: expiry,
        estado: "no_verificable",
        detalle: "El archivo es un marcador ficticio, no un documento real verificable."
      };
    }

    return {
      tipo: type,
      archivo: entry.archivo,
      vigenciaHasta: expiry,
      estado: "vigente",
      detalle: "Existe un archivo y no se detectó vencimiento en sus metadatos."
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
    join(ROOT, "glosario-campos.json")
  );
  const master = readJson<AnyRecord>(
    join(REPOSITORY_DIR, "maestro.json")
  );

  const mapping = mapFields(
    caso.template,
    caso.templateType,
    glossary,
    master
  );

  const supportValidation = validateSupports(
    caso.supportRequirements,
    String(caso.solicitud.pais)
  );

  const bloqueos = [
    ...mapping.bloqueos,
    ...supportValidation.bloqueos
  ];

  return {
    casoId: id,
    cliente: caso.solicitud.cliente,
    pais: caso.solicitud.pais,
    formato: caso.solicitud.formato,
    fechaEvaluacion: new Date().toISOString(),
    campos: mapping.fields,
    soportes: supportValidation.soportes,
    resumen: {
      totalCampos: mapping.fields.length,
      camposCompletados: mapping.fields.filter(
        (field) => field.estado === "completado"
      ).length,
      camposSinMapeo: mapping.fields.filter(
        (field) => field.estado === "sin_mapeo"
      ).length,
      soportesExigidos: caso.supportRequirements.length,
      soportesBloqueantes: supportValidation.bloqueos.length
    },
    bloqueos,
    advertencias: mapping.advertencias,
    listoParaFirma: bloqueos.length === 0
  };
}
