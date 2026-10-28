# Perxia - Agente de registro de proveedores

## 1. Descripción

Aplicación en desarrollo para apoyar el registro y la prevalidación de proveedores mediante un backend en Node.js y TypeScript.

El sistema consulta casos ficticios de registro, relaciona los campos de las plantillas con un maestro de proveedores y valida los soportes documentales disponibles. El objetivo es facilitar la identificación de información faltante, documentos vencidos y situaciones que requieren revisión humana.

## 2. Funcionalidades implementadas

- Consulta de los casos de registro disponibles.
- Consulta del detalle de un caso.
- Mapeo de campos de las plantillas al maestro de proveedores.
- Identificación de campos completados, faltantes y sin mapeo.
- Validación del estado de los soportes documentales.
- Identificación de bloqueos y advertencias.
- Endpoint de salud para comprobar el funcionamiento del backend.

Los datos y soportes de este prototipo son ficticios. Los archivos marcados como placeholders no se consideran documentos reales verificables.

## 3. Tecnologías

- Node.js
- TypeScript
- Express
- Zod
- Google GenAI SDK
- Anthropic SDK
- Git y GitHub
- Render

La presencia de los SDK de modelos de lenguaje en las dependencias no implica que la integración conversacional esté terminada. Esta se desarrollará y validará por etapas.

## 4. Estructura principal

```text
reto-01/
├── fixtures/
│   ├── casos/
│   ├── repositorio/
│   └── glosario-campos.json
├── scripts/
├── src/
│   ├── providers/
│   └── server.ts
├── public/
├── package.json
├── package-lock.json
├── tsconfig.json
├── render.yaml
└── README.md
```

## 5. Ejecución local

Requisitos: Node.js y npm compatibles con la configuración del proyecto.

Instalar dependencias:

```bash
npm ci
```

Compilar TypeScript:

```bash
npm run build
```

Iniciar en modo producción:

```bash
npm start
```

Para desarrollo:

```bash
npm run dev
```

El servidor utiliza `PORT` cuando está definida y, en caso contrario, el puerto local 3002.

## 6. API disponible

### Comprobar salud

```http
GET /api/health
```

### Listar casos

```http
GET /api/proveedores/casos
```

### Consultar un caso

```http
GET /api/proveedores/casos/:id
```

### Validar un caso

```http
POST /api/proveedores/casos/:id/validar
```

Ejemplo de identificador:

```text
co-industrias-delta
```

La validación puede devolver campos, soportes, bloqueos, advertencias y el indicador `listoParaFirma`.

Este indicador representa el resultado de las reglas implementadas en el prototipo; no constituye una aprobación real de un proveedor.

## 7. Casos de prueba funcionales

Los fixtures incluyen casos ficticios para:

- Colombia: `co-industrias-delta`
- Ecuador: `ec-corp-andina`
- Honduras: `hn-agroexport-sula`
- Panamá: `pa-logistica-istmo`

Los resultados dependen de los campos definidos en las plantillas y de los soportes presentes en el repositorio local de fixtures.

## 8. Variables de entorno y seguridad

Las variables sensibles deben configurarse en el entorno de ejecución y no deben publicarse en Git.

El archivo `.env` es local y no debe versionarse. No se deben incluir claves de API en el código, el README, los logs ni los commits.

En Render, las claves requeridas por las integraciones se deben configurar mediante Environment del servicio. Solo se añadirán las variables que utilice efectivamente la implementación.

## 9. Despliegue en Render

El archivo `render.yaml` define la configuración inicial del servicio web.

La compilación prevista es:

```bash
npm ci && npm run build
```

El comando de inicio es:

```bash
npm start
```

El endpoint de comprobación de salud es:

```text
/api/health
```

El despliegue automático requiere conectar el repositorio de GitHub a Render y publicar los cambios en la rama configurada.

## 10. Alcance y limitaciones

Esta versión es un prototipo de prevalidación con datos ficticios. No certifica la autenticidad de documentos, no aprueba proveedores de forma oficial y no realiza envíos a portales externos.
