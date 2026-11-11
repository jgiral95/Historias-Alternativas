# Guía rápida del código (para trabajar sin leer todo)

App de seguimiento de consultantes para profesionales de terapias alternativas (fuera del ámbito del Ministerio de Salud): sin RIPS, CIE, CUPS ni normas de conservación. Basada en Historias_clinicas. Textos de la app en español, con «usted».

## Frontend (`frontend/`)
`index.html` es la página de inicio pública (HTML estático; `portada.js` solo maneja la vista previa interactiva, con datos de ejemplo). La app está en `app.html` (se abre en `/app`), que solo carga `css/app.css` y los scripts de `js/` **en orden** (scripts clásicos que comparten el ámbito global: lo que se ejecuta al cargar no puede usar algo de un archivo posterior).

| Archivo | Qué tiene |
|---|---|
| `js/core.js` | utilidades (`$`, `esc`, `api`), estado `S`, `Store` (carga/guarda), firma en lienzo, `F()` campos, genograma |
| `js/documentos.js` | definiciones clínicas (INTAKE, NOTE_FIELDS, CAUSAS…), plantillas de consentimiento, HTML de documentos, `persist` |
| `js/interfaz.js` | `render()`, menú, botón «Atrás», lista de pacientes, resumen, Datos (`tabDatos`), consentimiento |
| `js/firma-distancia.js` | firma de consentimientos a distancia |
| `js/atenciones.js` | primera vez y evolución, «Datos de la atención» impresiones en texto libre, atención a distancia |
| `js/informes.js` | informes, plantillas de informe, recordatorios |
| `js/comentarios.js` | botón de comentarios beta |
| `js/notas-proceso.js` | notas de proceso y escritura a mano |
| `js/inicio.js` | primer ingreso, datos de ejemplo, bitácora |
| `js/perfil.js` | perfil, equipo, «Mis formatos» |
| `js/agenda.js` | agenda, citas (consultante nuevo, evento, enlace de videollamada, enviar por correo), panel «Reservas», cierre, inactividad |
| `js/archivo.js` | adjuntos, copias, exportar, historia en papel |
| `js/escalas.js` | escalas y frases frecuentes |
| `js/encuesta.js` | encuesta de satisfacción y estadísticas |
| `js/servidor.js` | ingreso, cuenta, usuarios (admin) y arranque (`boot`) — va de último |

## Backend (`backend/app/`)
FastAPI + SQLAlchemy. `main.py` (endpoints; registros cifrados por tipo: profile, patient, note, report, appt, file, scale, pnote), `firmas.py`, `booking.py` (reservas por enlace público; página `reservar.html`), `reminders.py`, `survey.py`, `gcal.py`, `security.py` (AES-256-GCM). Datos estáticos en `app/data/`.

## Pruebas
- Servidor: `cd backend && /tmp/venv-hc/bin/python -m pytest -q tests/test_X.py`
- Navegador: `PYTHON=/tmp/venv-hc/bin/python bash tests/e2e/run.sh X_e2e.js` (o `todas`).
- Correr **solo** las pruebas de lo que se tocó; la suite completa solo en cambios estructurales.

| Área | Pruebas |
|---|---|
| Datos, primera vez, evolución, agenda, informes (general) | `app_e2e.js`, `formularios_e2e.js` |
| Impresiones / humo | `humo_e2e.js`, `test_api.py -k impressions` |
| Equipo | `equipo_e2e.js`, `test_team.py` |
| Celular / diseño | `movil_e2e.js` |
| Navegación «Atrás» | `navegacion_e2e.js` |
| Notas de proceso / a mano | `notas_proceso_e2e.js`, `mano_e2e.js` |
| Reservas por enlace | `test_booking.py` |
| Recordatorios / firma a distancia / encuesta / bitácora / comentarios / inicio / caída / Google | `<nombre>_e2e.js` |

## Reglas que no cambian
Nada de exportaciones masivas; documentos firmados inmutables (solo adendas; única excepción: eliminar un consultante completo desde Archivo); el equipo nunca recibe datos clínicos; commits a `main` con las líneas Co-Authored-By y Claude-Session.

## Pendientes
- Los e2e `app_e2e.js`, `formularios_e2e.js` y otros aún asumen CIE/RIPS/EPS: hay que actualizarlos. `test_migrations.py` (2 pruebas) falla desde el origen.
- Lenguaje: la app busca mejorar la salud de los consultantes con terapias alternativas, pero no es clínica ni realiza procesos clínicos (la pueden usar también profesionales); mantener ese aviso (inicio, privacidad, ingreso, pie de la app, documentos) y evitar términos clínicos.
