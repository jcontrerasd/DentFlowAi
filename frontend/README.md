# Frontend DentFlowAi

Aplicación cliente de DentFlowAi construida con Next.js (App Router), TypeScript y Tailwind.

## Requisitos

- Node.js 20+
- npm 10+

## Comandos

```bash
npm install
npm run dev
```

Aplicación local: http://localhost:3000

## Scripts disponibles

- `npm run dev`: servidor de desarrollo
- `npm run build`: build de producción
- `npm run start`: iniciar build
- `npm run lint`: análisis estático
- `npm run type-check`: chequeo de tipos TypeScript sin emitir artefactos
- `npm run test:run`: suite completa de pruebas
- `npm run test:smoke`: smoke tests críticos (auth, onboarding/registro, casos)

## Integraciones

- Firebase Auth
- Firebase Storage
- Firebase Data Connect (SDK generado en `lib/dataconnect`)

## Notas de mantenimiento

- Este frontend no depende de `axios` ni `js-cookie`.
- Si se cambian operaciones GraphQL en Data Connect, regenerar SDK y validar tipos en compile/lint.

## Flujo sugerido para PR

```bash
npm run lint
npm run type-check
npm run build
npm run test:run
```
