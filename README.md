# Alter-Karute

Aplicación web de seguimiento de consultantes para profesionales de terapias alternativas (no reguladas por el Ministerio de Salud).
Derivada de Historias_clinicas, **sin** RIPS, CIE-10/11, CUPS ni reglas de conservación/actas normativas.

## Puesta en marcha
1. `cp .env.example .env` y complete `SESSION_SECRET` y `DATA_KEY` (instrucciones en el archivo).
2. `docker compose up -d --build` → la app queda en el puerto `APP_PORT` (8086 por defecto).
3. Cree el primer administrador: `docker compose exec api python -m app.create_admin`.

## Pruebas
- Servidor: `cd backend && python -m pytest -q tests/test_api.py`
- Navegador: `bash tests/e2e/run.sh humo_e2e.js`

Guía del código: `CLAUDE.md`.
