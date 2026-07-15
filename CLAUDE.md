# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working on HubSpot components

IMPORTANT: IF THE 'HubSpotDev' MCP SERVER IS INSTALLED USE THE TOOLS BEFORE TRYING TO MANUALLY USE CLI COMMANDS OR BEFORE TRYING TO DO ANYTHING WITH HUBSPOT ASSETS

## HubSpot Project Information
- The project configuration is in the `hsproject.json` file
- A directory is considered a part of the project if it or a directory above it contains a `hsproject.json` file
- The project src directory is defined in the `srcDir` field in the `hsproject.json`
- The project's platform version is defined in `platformVersion` in the `hs project.json`
- The `platformVersion` determines what features the project has access to as well as the shape of the configuration files

## Local Development
### Local Development Server (`hs project dev`)
- Start a local development server with `hs project dev` to view extension changes without refreshing
- The server runs on your local machine and syncs changes to HubSpot in real-time
- When the server is running, UI extensions (cards, settings pages) display a "Developing locally" tag
- Saving changes to JSX files automatically refreshes the page

### Local Proxy Configuration (`local.json`)
- During local development, you can proxy `hubspot.fetch()` requests to a locally running backend
- Create a `local.json` file in the same directory as your app's `*-hsmeta.json` file
- The proxy configuration maps HTTPS URLs to local URLs:
  ```json
  {
    "proxy": {
      "https://example.com": "http://localhost:8080"
    }
  }
  ```
- **Important**: Proxy URLs must be valid HTTPS URLs (the key, not the value)
- Path-based routing is NOT supported (e.g., `"https://example.com/a": "http://localhost:8080"` will not work)
- When a `local.json` file is detected, the CLI confirms the proxy is active
- To disable the proxy, rename the file to `local.json.bak` and restart the dev server

### Request Signing with CLIENT_SECRET
- You can inject the `CLIENT_SECRET` environment variable when starting the local dev server:
  ```shell
  CLIENT_SECRET="abc123" hs project dev
  ```
- This enables request signing during local development for testing secure backend communications

## npm packages
### `@hubspot/ui-extensions`
- In the `@hubspot/ui-extensions` npm package, only the component properties defined by the component are valid.  `style` properties are not valid

### `hubspot.fetch` API
- `hubspot.fetch` is a function provided by `@hubspot/ui-extensions` for making HTTP requests from UI components
- **Critical**: `hubspot.fetch` requires fully qualified domain names (FQDN) with HTTPS - relative paths are NOT supported
- All URLs must be added to the `permittedUrls.fetch` array in the app's `*-hsmeta.json` configuration file
- Example:
  ```json
  "permittedUrls": {
    "fetch": ["https://api.example.com", "https://api.hubapi.com"],
    "iframe": [],
    "img": []
  }
  ```
- Fetch URLs must be valid HTTPS URLs and cannot be `localhost`
- To call a local backend during development, use the `local.json` proxy configuration (see Local Development section)

## Component Information
### General
- Component configuration files must end with `-hsmeta.json`
- The `uid` field in the `-hsmeta.json` files must be unique with the project
- The `type` field in the `-hsmeta.json` files defines the type of the component
- Components can not be in nested subdirectories, only the specified directories in their corresponding component rules.
- Example components can be found in https://github.com/HubSpot/hubspot-project-components. The directories are split up by platform version and follow this format `${platformVersion}/components`. Note the project create tool only supports platform versions >= 2025.2.
- All component subdirectories must be in the project source directory

### app component
- There can only be one `app` component
- `app` component must be in the `app` directory
- If the `config.distribution` field is set to `marketplace`, the only valid `config.auth.type` value is `oauth`

### card
- `card` components must be in the `app/cards` directory
- The global `window` object is not available in the `card` component
- Cannot use `window.fetch`, and instead must use the `hubspot.fetch` function provided by the `@hubspot/ui-extensions` npm package.  Any urls called with the `hubspot.fetch` function must be added to the `config.permittedUrls.fetch` array in the `app` component's hsmeta.json file
- `hubspot.fetch` requires fully qualified HTTPS URLs (e.g., `https://api.example.com/endpoint`) - relative paths like `/api/endpoint` are NOT supported
- Only components exported from the `@hubspot/ui-extensions` npm package can be used in `card` components

### app-event
- `app-event` components must be in the `app/app-events` directory

### app-object
- `app-object` components must be in the `app/app-object` directory

### app-function
- `app-function` components must be in the `app/functions` directory
- `app-function` components are not available when `config.distribution` is set to `marketplace` in the `app` component `-hsmeta.son` file

# settings
- There can only be one `settings` component
- `settings` components must be in the `app/settings` directory
- The global `window` object is not available in the `settings` component
- Cannot use `window.fetch`, and instead must use the `hubspot.fetch` function provided by the `@hubspot/ui-extensions` npm package.  Any urls called with the `hubspot.fetch` function must be added to the `config.permittedUrls.fetch` array in the `app` component's `hsmeta.json` file
- `hubspot.fetch` requires fully qualified HTTPS URLs - relative paths are NOT supported
- Only components exported from the `@hubspot/ui-extensions` npm package can be used in `settings` components
- React Components from `@hubspot/ui-extensions/crm` cannot be used in `settings` components

# scim
- There can only be one `scim` component
- `scim` components must be in the `app/scim` directory

# webhooks
- There can only be one `webhooks` component.
- `webhooks` components must be in the `app/webhooks` directory

### workflow-actions
- `workflow-action` components must be in the `app/workflow-actions` directory

## HubSpot CLI commands
- All the commands and subcommands have a `--help` argument that provides details on the command and it's arguments
- The help output is standard yargs output
- The commands for working with projects in HubSpot are subcommands of `hs project`
- Debugging flag that can be added to `hs` commands and subcommands: `--debug`
- Debugging problems with CLI installation: `hs doctor`

### Project Commands
- `hs project create` - Create a new HubSpot project interactively
- `hs project upload` - Upload the project to HubSpot (build is created automatically)
- `hs project deploy` - Deploy a specific build of the project to make it live
- `hs project dev` - Start a local development server for real-time development of UI extensions
- `hs project watch` - Watch for file changes and automatically upload them
- `hs project list` - List all projects in the account
- `hs project download` - Download a project from HubSpot to local
- `hs project open` - Open the current project page in the browser
- `hs project logs` - View logs for deployed projects
- `hs project list-builds` - List all builds for a project
- `hs project validate` - Validate project configuration files
- `hs project migrate` - Migrate a project to a newer platform version
- `hs project migrate-app` - Migrate a legacy app to the projects framework
- `hs project clone-app` - Clone an existing app configuration

### Account Management
- `hs init` - Initial setup of the hubspot configuration file
- `hs account auth` - Authenticate a new account (requires browser interaction)
- `hs account list` - List all configured accounts
- `hs account use` - Switch the default account
- `hs account info` - Display information about an account
- `hs account rename` - Rename an account in the config
- `hs account remove` - Remove an account from the config
- `hs account clean` - Clean up invalid/expired authentication
- `hs account create-override` - Create a project-specific account override
- `hs account remove-override` - Remove a project-specific account override

### CMS Commands
- `hs cms upload <src> <dest>` - Upload files to HubSpot
- `hs cms fetch <src> <dest>` - Download files from HubSpot
- `hs cms watch <src> <dest>` - Watch for changes and automatically upload
- `hs cms list <path>` - List remote files in HubSpot
- `hs cms delete <path>` - Delete files from HubSpot
- `hs cms mv <srcPath> <destPath>` - Move/rename files in HubSpot
- `hs cms function list` - List all serverless functions
- `hs cms function logs <path>` - View logs for a serverless function
- `hs create template <name>` - Create a new template
- `hs create module <name>` - Create a new module
- `hs create function <name>` - Create a new serverless function
- `hs theme preview` - Preview a theme locally at https://hslocal.net:3002/

### Sandbox Management
- `hs sandbox create` - Create a development sandbox account
- `hs sandbox delete` - Delete a sandbox account

### Secrets Management
- `hs secret list` - List secrets for serverless functions
- `hs secret add <name> <value>` - Add a secret
- `hs secret update <name> <value>` - Update a secret
- `hs secret delete <name>` - Delete a secret

### Test Account Management
- `hs test-account create` - Create a configurable test account
- `hs test-account delete` - Delete a test account
- `hs test-account import-data` - Import test data

## General
- Follow existing patterns in the codebase
- Use proper component structure based on component `type` in the `-hsmeta.json` file
- Ensure configuration files follow HubSpot naming conventions
- Always validate that components are placed in correct directories
- When working with UI extensions, remember that `hubspot.fetch` requires HTTPS URLs in `permittedUrls.fetch`
- Use `hs project dev` for iterative development of cards and settings pages
- Use `local.json` to proxy API requests to a local backend during development

---

# 📌 Reglas específicas del proyecto (DocuSign integration)

> **Lo de arriba** es contenido auto-generado por HubSpot CLI sobre la plataforma — referencia valiosa, **no modificar**.
> **Lo siguiente** son las reglas específicas de ESTE proyecto. Conviven sin conflicto.

> 📄 **Spec del proyecto**: `../docs/specs/2026-04-27-docusign-hubspot-mvp-design.md` (en el workspace, no en este repo).
> 📄 **Reglas globales del workspace**: `../CLAUDE.md`.

---

## Qué hace esta card

Card en el sidebar del registro de **Deal** que permite enviar un documento DocuSign a un contacto asociado del Deal:

1. Al cargar: `GET /api/v1/deals/:dealId/send-context?userTeam=<equipo>` (templates, contactos, modo jurídico, direccionFiscal, pais) + `GET /api/v1/deals/:dealId/envelope-status`. `userTeam` es el nombre del **equipo predeterminado** del usuario de la card (de `context.user.teams`, `primary: true`; por regla del cliente ese usuario es siempre el propietario del Negocio) — el backend lo usa para filtrar los templates que devuelve. Si el usuario no tiene equipo predeterminado, el param se omite.
2. El firmante es el **único** contacto del Deal con la etiqueta de asociación **"Responsable Jurídico"** (Negocios↔Contactos; la detecta el backend en `send-context`). Según `clienteMode`: `juridico` (exactamente 1 etiquetado) → banner con el firmante y envío habilitado; `dropdown` (0 etiquetados) o `multiple_juridicos_error` (2+) → al hacer click en "Enviar" se muestra un error rojo (no se abre el modal de confirmación) con botón "Volver a comprobar" que recarga el contexto. Ya no hay selector de contacto: `contactId` viaja **siempre** (el del contacto etiquetado). **No hay input de Representante legal**: `legalRepresentative` se deriva del nombre completo del contacto etiquetado (fallback: su email) y viaja obligatorio junto con **Número de identificación** (`dniLegalRepresentative`, único input de texto del firmante). El dropdown **Acuerdo** (Acta de representación legal / Acta de nombramiento) es obligatorio y viaja como `commercialAgreement` (texto).
3. **No hay campos de Dirección ni País en la card**: el backend los incluye en `send-context` como `direccionFiscal` (propiedad `direccion_fiscal` de la **Empresa** asociada al Negocio) y `pais` (propiedad `pais` del **Negocio**). Viajan al API como `location` y `country` (texto). Si falta alguno: banner amarillo de aviso al cargar + al hacer click en "Enviar" error rojo (no se abre el modal) pidiendo llenar la propiedad en HubSpot, con "Volver a comprobar".
4. Usuario selecciona Template + Acuerdo + Número de identificación → click "Enviar".
5. `POST /api/v1/docusign/envelopes` con `{ dealId, templateId, contactId, location, country, commercialAgreement, legalRepresentative, dniLegalRepresentative }`.
6. La card muestra estado lifecycle (active/signed/failed) con acciones correspondientes.

---

## Stack

- **React 18** + **TypeScript** (`.tsx`)
- **`@hubspot/ui-extensions`** (componentes, `hubspot.fetch`, contexto CRM)
- HubSpot CLI projects, `platformVersion: "2026.03"`

---

## Estructura de archivos en `src/app/cards/`

```
NewCard.tsx                ← componente raíz (state machine UI)
components/
├── TemplateSelector.tsx
├── SendButton.tsx
└── StatusMessage.tsx
hooks/
├── useTemplates.ts        ← fetch + estado loading/error
└── useSendEnvelope.ts     ← POST + estado sending/error
api/
└── client.ts              ← API_BASE + hubspot.fetch wrappers
types.ts                   ← Template, UiState (discriminated union), etc.
local.json                 ← proxy config (dev) — NO se commitea si tiene info sensible
```

---

## Pattern: state machine con discriminated union

```ts
type UiState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      sendContext: SendContext;
      selectedTemplateId: string | null;
      selectedContactId: string | null;
      selectedDirectionId: string | null;
    }
  | { kind: 'loadError'; message: string }
  | {
      kind: 'sending';
      sendContext: SendContext;
      selectedTemplateId: string;
      selectedContactId: string;
      selectedDirectionId: string | null;
    }
  | {
      kind: 'sendError';
      sendContext: SendContext;
      selectedTemplateId: string;
      selectedContactId: string;
      selectedDirectionId: string | null;
      message: string;
    }
  | { kind: 'active'; envelopeId: string; dealId: string; status: string; sentAt: string | null; }
  | { kind: 'signed'; envelopeId: string; signedAt: string | null; pdfUrl: string | null; }
  | { kind: 'failed'; envelopeId: string; status: string; };
```

TypeScript garantiza que en cada estado solo accedes a las propiedades válidas. **No renderices estados que no existan en este tipo.** Si necesitas un estado nuevo, añádelo aquí — TS te guiará por todos los lugares que tienen que cambiar.

---

## Pattern: API client en `api/client.ts`

Las llamadas al backend **NUNCA** viven en componentes. Siempre en `api/client.ts` o en hooks (`useTemplates`, `useSendEnvelope`).

```ts
const API_BASE = 'https://api.docusign-integration.local';   // dummy en dev

export async function fetchSendContext(dealId: string): Promise<SendContext> {
  const res = await hubspot.fetch(
    `${API_BASE}/api/v1/deals/${encodeURIComponent(dealId)}/send-context`,
    { method: 'GET' }
  );
  if (!res.ok) {
    const msg = await extractErrorMessage(res, 'No pudimos cargar el contexto de envío');
    throw new Error(msg);
  }
  return (await res.json()) as SendContext;
}
```

**Reglas:**
- Solo `hubspot.fetch`, **nunca** `window.fetch` ni libs externas como axios (no funcionan en cards).
- URLs absolutas HTTPS, jamás relativas.
- Errores del backend vienen como `{ error, message, details }` — extraer `message` para mostrar al usuario, conservar `error` (code) para logging si necesario.

---

## Setup local (`local.json` + `permittedUrls.fetch`)

**1. URL dummy en `permittedUrls.fetch`** del `app-hsmeta.json`:

```json
"permittedUrls": {
  "fetch": [
    "https://api.hubapi.com",
    "https://api.docusign-integration.local"
  ]
}
```

HubSpot exige HTTPS válido aquí — **no acepta `localhost`.** Por eso usamos un dominio dummy.

**2. `local.json`** (junto a `app-hsmeta.json` en `src/app/`, **no** en `src/app/cards/` — la doc oficial de HubSpot exige que esté al lado del `*-hsmeta.json` del app):

```json
{
  "proxy": {
    "https://api.docusign-integration.local": "http://localhost:3002"
  }
}
```

Cuando corres `hs project dev`, el CLI intercepta llamadas a la URL dummy y las redirige a tu Fastify local. En producción borras `local.json` y cambias `permittedUrls.fetch` al dominio real — el código de la card no cambia ni una línea.

---

## Cómo obtener `dealId` desde el contexto

```tsx
hubspot.extend<'crm.record.tab'>(({ context }) => {
  const dealId = context.crm.objectId;   // string, ej. "12345678901"
  return <Extension dealId={dealId} />;
});
```

**No leer propiedades del Deal desde la card** — eso lo hace el backend. La card solo conoce la **identidad** del Deal (`dealId`) y delega.

---

## Estado actual vs Plan 12 (frontend)

**Implementado (rama `v2-grupo-inve-ui`):**
- ✅ Lista templates con `<Select>`
- ✅ Jurídico auto (banner) vs dropdown (ContactSelector) vs error (alert rojo bloqueante)
- ✅ Direcciones: 0→input texto libre, 1+→dropdown + opción "Otra (escribir manualmente)"; se envía el texto como `location`
- ✅ Inputs "Representante legal" y "DNI del firmante" siempre visibles y obligatorios → `legalRepresentative` / `dniLegalRepresentative`
- ✅ Dropdown "País" obligatorio (5 países CA/Caribe) → `country` (texto)
- ✅ `fetchSendContext` reemplaza `fetchTemplates` + `fetchContacts`
- ✅ Vistas lifecycle: ACTIVE (sent/signing) con "Cancelar" + "Refrescar", SIGNED con "Ver PDF" + "Nuevo contrato", FAILED con "Nuevo contrato"
- ✅ Modal de cancelación (razón obligatoria min 5 chars)
- ✅ `sendEnvelope` con `location` (texto) + `contactId`/`legalRepresentative` según haya contacto o no
- ✅ Solo castellano hardcoded

**Pendiente (Plan 12 restante):**
- Modal de confirmación antes de enviar (resumen de firmantes + template + empresa)
- Indicador "✓ Cotización vinculada" / "✓ N capex incluidos"

**Roadmap (post-v2):**
- React Query (cache, retry, optimistic UI)
- Search/filter en lista de templates
- Historial de envelopes del Deal (múltiples Notes en timeline)
- Settings page para configurar mappings por template
- i18n con `react-intl` (es-ES, en-US)
- Auditoría de a11y con `axe-core`

Spec completo en `docs/specs/2026-05-13-grupo-inve-v2-consolidated-design.md` §8 (F6 Card UI).

---

## Si necesitas extender la card

| Quieres... | Hazlo así... |
|---|---|
| Nuevo estado de UI | añade variante al `type UiState` (discriminated union). TS te guía por todos los lugares que cambian. |
| Nueva llamada al backend | función en `api/client.ts` + hook en `hooks/` si es reutilizable. |
| Nuevo componente | en `components/`, **no inline** dentro de `NewCard.tsx`. Mantén `NewCard.tsx` <100 líneas. |
| Cambio en `permittedUrls.fetch` | coordina con backend (afecta deploy real). |
| Mostrar otra prop del Deal | NO leer del CRM desde la card — pedir al backend que la incluya en su response. |

---

## Si dudas de una decisión

1. Lee el **spec del workspace**: `../docs/specs/`.
2. Lee el **CLAUDE.md del workspace**: `../CLAUDE.md`.
3. Si una decisión técnica de **HubSpot** no está clara, lee el contenido de arriba de este archivo (auto-generado por HubSpot CLI — es referencia oficial).
4. Si una decisión del **proyecto** no está clara aquí ni en el spec, **pregunta antes de inventar** — y cuando se acuerde, **documéntala** aquí.
