# Prode Mundial

App web simple para un prode del Mundial con registro abierto, login, pronosticos por partido, panel admin y tabla de posiciones.

Incluye la fase de grupos del Mundial 2026 con banderas por seleccion y una imagen local en el encabezado.

## Credenciales locales

El seed crea un admin inicial:

- Email: `admin@prode.local`
- Password: `admin1234`

Cambialas en `.env` antes de compartir la app.

## Deploy en Vercel

Esta version esta preparada para usar Postgres en produccion. En Vercel crea una base desde Storage o Marketplace (Prisma Postgres, Neon o Supabase) y configura estas variables:

- `DATABASE_URL`
- `AUTH_SECRET`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Antes del primer uso en produccion, ejecuta las migraciones y el seed:

```bash
pnpm prisma:deploy
pnpm prisma:seed
```

El seed es seguro para produccion: conserva usuarios, resultados y pronosticos existentes; solo crea/actualiza el admin y agrega partidos faltantes del fixture.

## Comandos

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:deploy
pnpm prisma:seed
pnpm dev
```

Para correr local tambien necesitas un `DATABASE_URL` de Postgres en `.env`.

## Reglas

- Cada usuario puede cargar o editar su pronostico hasta la hora de inicio del partido.
- Resultado exacto: 3 puntos.
- Ganador o empate correcto: 1 punto.
- Incorrecto o partido sin resultado: 0 puntos.
- La tabla solo muestra ranking, puntos, exactos y cantidad de pronosticos.
