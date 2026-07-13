# DocuSign + HubSpot — Card UI (`smartflow-docusign-card`)

**HubSpot UI Extension** (React + TypeScript) que añade una *card* en el sidebar de los **Deals**.
Desde ahí el usuario envía un documento para firmar con DocuSign y ve el estado de la firma, sin salir de HubSpot.

> Repo GitHub: `git@github.com:smarteam-cr/smartflow-docusign-card.git`
> Consume el backend `docusign_integration_hs`.

---

## 1. Descripción general

- **Qué hace:** muestra los templates disponibles, deja elegir contacto y dirección (según el caso),
  envía el envelope y luego muestra el estado (Enviado / En firma / Firmado / Cancelado) con sus acciones.
- **Dependencias externas:**
  - **Backend `docusign_integration_hs`** — toda la lógica vive ahí; la card solo llama a su API REST.
  - **HubSpot UI Extensions** (`@hubspot/ui-extensions`) — componentes, contexto del CRM y `hubspot.fetch`.
- **Base de datos:** ninguna. La card no guarda estado propio; lee del backend en cada carga.
- **WordPress u otro CMS:** no aplica.

La card **no** lee propiedades del Deal directamente: solo conoce el `dealId` (desde el contexto del CRM)
y delega todo al backend.

---

## 2. Stack

- **React 18** + **TypeScript** (`.tsx`)
- **`@hubspot/ui-extensions`** (solo componentes de este paquete; no se puede usar `window.fetch` ni libs como axios)
- **HubSpot CLI** (`hs project`), `platformVersion: 2026.03`, distribución `private`

---

## 3. Ejecución local

### Requisitos previos
- **Node.js ≥ 18** y **HubSpot CLI** (`npm i -g @hubspot/cli`).
- Cuenta **HubSpot** autenticada en el CLI (`hs account auth`) con acceso a developer projects.
- El **backend corriendo en local** (`http://localhost:3002`) para que la card tenga a quién llamar.

### Instalación
```bash
cd src/app/cards
npm install
```

### Configuración para desarrollo local
La card no puede llamar a `localhost` directamente (HubSpot exige URLs HTTPS válidas). Se usa una **URL
dummy** declarada en `permittedUrls.fetch` y un **proxy** que la redirige al backend local:

1. `src/app/app-hsmeta.json` ya incluye en `permittedUrls.fetch`:
   `https://api.hubapi.com` y `https://api.docusign-integration.local`.
2. `src/app/local.json` (junto al `app-hsmeta.json`, **no** dentro de `cards/`) hace el proxy:
   ```json
   { "proxy": { "https://api.docusign-integration.local": "http://localhost:3002" } }
   ```

### Comandos
```bash
hs project dev --project-account [PortalIDHS] --testing-account [PortalIDHS]      # dev server con hot reload; la card muestra el tag "Developing locally"
hs project upload    # sube y construye el proyecto en la cuenta de HubSpot
hs project deploy    # publica un build (lo deja en vivo)
```

### Ambientes
- **Desarrollo:** `hs project dev` + `local.json` apuntando al backend local.
- **Producción:** se elimina `local.json` y se cambia la URL dummy de `permittedUrls.fetch` por el dominio
  real del backend. **El código de la card no cambia** — solo configuración.

---

## 4. Arquitectura

```
hsproject.json                       ← nombre, srcDir, platformVersion del proyecto
src/app/
├── app-hsmeta.json                  ← config del "app" (auth, scopes, permittedUrls)
├── local.json                       ← proxy a backend local (solo dev)
└── cards/
    ├── card-hsmeta.json             ← config de la card (ubicación: sidebar de Deals)
    ├── NewCard.tsx                  ← componente raíz: state machine de la UI
    ├── types.ts                     ← tipos (UiState como discriminated union, SendContext, etc.)
    ├── api/client.ts                ← llamadas al backend con hubspot.fetch
    └── components/
        ├── TemplateSelector.tsx
        ├── ContactSelector.tsx
        ├── SendButton.tsx
        └── StatusMessage.tsx
```

**Componentes principales**
- **`NewCard.tsx`** — orquesta toda la UI mediante una *state machine* (`loading → ready → sending → active/signed/failed`),
  modal de confirmación de envío y modal de cancelación.
- **`api/client.ts`** — único lugar con llamadas HTTP (`fetchSendContext`, `sendEnvelope`, `fetchEnvelopeStatus`, `voidEnvelope`).
  Siempre `hubspot.fetch` con URLs HTTPS absolutas.
- **`components/`** — piezas de presentación (selectores, botón de envío, mensajes de estado).

**Servicios externos:** solo el backend propio (vía la URL configurada) y la plataforma de HubSpot UI Extensions.

---

## 5. Pendientes, riesgos y recomendaciones

**Tareas pendientes**
- La card muestra el estado **agregado** (Enviado / En firma / Firmado), no quién firmó y quién falta;
  el progreso por firmante es Roadmap.

**Riesgos / deuda consciente**
- Sin caché ni reintentos del lado cliente (Roadmap: React Query). Cada acción recarga del backend.
- Textos en castellano *hardcoded* (sin i18n).
- Cambiar `permittedUrls.fetch` requiere coordinar con el deploy del backend (afecta el dominio real).

**Dependencias con terceros**
- HubSpot UI Extensions (CLI + `@hubspot/ui-extensions`) y el backend `docusign_integration_hs`.
  Si el backend está caído o cambia un contrato HTTP, la card muestra el error correspondiente.

> Diseño completo de la card: `../docs/specs/2026-05-13-grupo-inve-v2-consolidated-design.md` §8 (Card UI).
> Reglas de la plataforma HubSpot: `CLAUDE.md` (sección auto-generada por el CLI) y `HUBSPOT_PROJECTS.md`.
