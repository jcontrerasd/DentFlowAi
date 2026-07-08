# Lista de precios (`price_rule`) — plantilla para completar

Reglas vigentes en `/dashboard/admin/prices` (28 activas). Los valores actuales son en su mayoría **placeholder del seed** (costo $5.000 · fee 15% · venta $5.750). Completar las columnas **Nuevo…** con los valores definitivos; si una fila no cambia, dejarla en blanco.

- **Costo técnico**: monto que se paga al técnico (CLP).
- **Fee %**: porcentaje del marketplace (ej. `15` = 15%).
- **Precio venta**: precio final al dentista = `costo × (1 + fee)`.

## Matriz base (Restauración × Urgencia, material y color = `*`)

| Código | Restauración | Urgencia | Costo actual | Fee actual | Venta actual | **Nuevo costo (CLP)** | **Nuevo fee %** | **Nueva venta (CLP)** |
|---|---|---|---|---|---|---|---|---|
| prc_004 | Corona Unitaria | Baja | $6.000 | 15,0% | $6.900 | | | |
| prc_020 | Corona Unitaria | Normal | $10.000 | 15,0% | $11.500 | | | |
| prc_028 | Corona Unitaria | Alta | $10.000 | 15,0% | $11.500 | | | |
| prc_015 | Inlay | Baja | $5.000 | 15,0% | $5.750 | | | |
| prc_001 | Inlay | Normal | $5.000 | 15,0% | $5.750 | | | |
| prc_013 | Inlay | Alta | $5.000 | 15,0% | $5.750 | | | |
| prc_016 | Onlay | Baja | $5.000 | 15,0% | $5.750 | | | |
| prc_025 | Onlay | Normal | $85.000 | 15,0% | $97.750 | | | |
| prc_018 | Onlay | Alta | $5.000 | 15,0% | $5.750 | | | |
| prc_012 | Carilla | Baja | $5.000 | 15,0% | $5.750 | | | |
| prc_026 | Carilla | Normal | $5.000 | 15,0% | $5.750 | | | |
| prc_019 | Carilla | Alta | $5.000 | 15,0% | $5.750 | | | |
| prc_009 | Puente | Baja | $5.000 | 15,0% | $5.750 | | | |
| prc_010 | Puente | Normal | $5.000 | 15,0% | $5.750 | | | |
| prc_021 | Puente | Alta | $5.000 | 15,0% | $5.750 | | | |
| prc_024 | Corona sobre implante | Baja | $5.000 | 15,0% | $5.750 | | | |
| prc_005 | Corona sobre implante | Normal | $5.000 | 15,0% | $5.750 | | | |
| prc_027 | Corona sobre implante | Alta | $5.000 | 15,0% | $5.750 | | | |
| prc_017 | Denture | Baja | $5.000 | 15,0% | $5.750 | | | |
| prc_014 | Denture | Normal | $5.000 | 15,0% | $5.750 | | | |
| prc_007 | Denture | Alta | $5.000 | 15,0% | $5.750 | | | |
| prc_006 | Guía Quirúrgica | Baja | $5.000 | 15,0% | $5.750 | | | |
| prc_002 | Guía Quirúrgica | Normal | $5.000 | 15,0% | $5.750 | | | |
| prc_011 | Guía Quirúrgica | Alta | $5.000 | 15,0% | $5.750 | | | |
| prc_023 | Otro | Baja | $5.000 | 15,0% | $5.750 | | | |
| prc_022 | Otro | Normal | $5.000 | 15,0% | $5.750 | | | |
| prc_003 | Otro | Alta | $5.000 | 15,0% | $5.750 | | | |

## Reglas específicas por material (existentes)

Tienen prioridad sobre la matriz base en el lookup regresivo.

| Código | Restauración | Urgencia | Material | Color | Costo actual | Fee actual | Venta actual | **Nuevo costo (CLP)** | **Nuevo fee %** | **Nueva venta (CLP)** |
|---|---|---|---|---|---|---|---|---|---|---|
| prc_008 | Corona Unitaria | Alta | Zirconio Multicapa (Premium) | * | $88.000 | 15,0% | $101.200 | | | |

## Reglas nuevas por material / color (opcional)

La cascada de dimensiones es **Restauración → Urgencia → Material → Color** sin huecos (patrones válidos: `R·*·*·*`, `R·U·*·*`, `R·U·M·*`, `R·U·M·S`). Agregar aquí combinaciones que necesiten precio distinto:

| Restauración | Urgencia | Material | Color | Costo técnico (CLP) | Fee % | Precio venta (CLP) |
|---|---|---|---|---|---|---|
| | | | | | | |

Materiales activos disponibles: Zirconio Multicapa (Premium) · Zirconio Monolítico · Disilicato de Litio (E-max) · Metal-Cerámica · PMMA (Provisional) · PEEK / BioHPP · Titanio · Cromo-Cobalto (Laser) · Composite HD · Cerámica Feldespática · Otro.
