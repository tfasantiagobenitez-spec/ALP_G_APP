# Simulador FV · Análisis Técnico-Económico Solar

Aplicación web profesional para el dimensionamiento y análisis técnico, económico y financiero de proyectos solares fotovoltaicos en Argentina (autoconsumo residencial, comercial, industrial y grandes usuarios).

Sin dependencias ni necesidad de compilación (*build*): se abre [index.html](file:///c:/Users/benit/ALP_G_APP/index.html) directamente en el navegador o se sirve con cualquier servidor web estático.

---

## 📁 Estructura del Proyecto

```
index.html          Interfaz de usuario (SPA con 7 pestañas de análisis)
css/styles.css      Estilos modernos, tipografía Inter, modo Claro/Oscuro y plantilla de impresión
js/calc.js          Motor de cálculo técnico-económico, BESS, CO₂, dimensionador, pérdidas y leasing
js/config.js        Configuración de credenciales para la nube (Supabase)
js/db.js            Capa de persistencia dual unificada (LocalStorage offline + Supabase nube)
js/ejemplo.js       Proyectos de ejemplo reales listos para utilizar
test/calc.test.js   Suite de tests unitarios: `node test/calc.test.js`
supabase/schema.sql Esquema PostgreSQL con RLS, roles y presets de distribuidoras argentinas
```

---

## 🚀 Funcionalidades y Pestañas

### 1. 📋 Datos y Asistente de Dimensionamiento
- **📐 Asistente de Techado y Superficie**:
  - *Modo 1 (Por Superficie $m^2$)*: Calcula módulos máximos, kWp instalable, generación anual y sobrecarga estática ($kg/m^2$) según el tipo de cubierta (Chapa coplanar, Losa plana, Tejas, Suelo).
  - *Modo 2 (Por Objetivo de Consumo %)*: Dimensiona la potencia fotovoltaica requerida para cubrir un porcentaje deseado de la factura eléctrica anual.
- **Cliente y Presupuesto**: Nombre, ubicación, CUIT, N° de cotización, selector de 29+ ciudades/regiones de Argentina con irradiación solar precargada.
- **Almacenamiento con Baterías (BESS)**: Capacidad ($kWh$), tecnología (Litio LFP / Gel), profundidad de descarga ($DoD\%$) y autonomía de respaldo en horas.
- **Tarifa Eléctrica**: Presets de distribuidoras (**EPE Santa Fe**, **Edenor/Edesur AMBA**, **EDEN/EDEA/EDES**, **EPEC Córdoba**, Genérica) y esquema de inyección remunerada de excedentes.
- **Parámetros Económicos y Leasing**: Inflación tarifaria, tasa de descuento ($WACC$), OPEX, recambio de inversores y canon de leasing con deducción de Ganancias.

### 2. ⚡ Energía, CO₂ y Desglose de Pérdidas
- Balance mensual interactivo de generación solar, demanda, autoconsumo y excedentes inyectados a red.
- **⏱ Curva Diaria Horaria (24 horas)**: Simulación de campana solar horaria vs. curva de demanda del cliente, con ciclado de carga/descarga del banco de baterías.
- **🔬 Diagrama de Pérdidas Técnicas y Performance Ratio (PR)**: Desglose físico de pérdidas por temperatura de celda, suciedad/soiling, mismatch de módulos, caídas de tensión DC/AC y rendimiento del inversor.
- **Indicadores Ambientales (ESG)**: Toneladas de $CO_2$ evitadas al año y en vida útil (factor matriz SADI $0.45\text{ kg }CO_2/kWh$), árboles plantados equivalentes y kilómetros no emitidos.

### 3. 📈 Resultados Económicos (Compra Directa)
- **Selector de Moneda en Tiempo Real**: Visualización instantánea de todos los flujos, tablas y KPIs en **Pesos Argentinos (ARS)** o **Dólares (USD)**.
- Indicadores financieros clave: **VAN** ($\$$ y $U\$D$), **TIR**, **Payback simple**, **Payback descontado**, **LCOE** ($\$/kWh$ y $\text{¢}U\$D/kWh$) y ahorro acumulado a 20-30 años.
- **Exportación a Excel (CSV)**: Descarga del flujo de fondos anual completo con desglose de generación, ahorros, OPEX, recambio y flujos acumulados descontados.

### 4. 🏦 Leasing vs. Compra al Contado
- Comparativa lado a lado entre inversión directa y esquema de leasing financiero (con selector ARS / USD).
- Flujo de caja neto mensual (ahorro energético generado vs. cuota total de leasing).
- Desglose de canon, seguro, mantenimiento, opción de compra y ahorro por escudo fiscal en Ganancias.

### 5. 🎯 Análisis de Sensibilidad y Riesgo
- **Matriz Tarifa vs. CAPEX**: Mapa de calor cruzado del VAN ($U\$D$) frente a variaciones de $-20\%$ a $+20\%$ en la tarifa eléctrica y en el costo de instalación.
- **Matriz Inflación vs. Tasa de Descuento**: Evaluación del VAN ante distintos escenarios macroeconómicos.

### 6. ⚖️ Comparador Multi-Proyecto
- Tabla comparativa de métricas lado a lado seleccionando múltiples proyectos o escenarios de potencia para el mismo cliente.

### 7. 📄 Propuesta Comercial Ejecutiva (Cotización Imprimible en PDF)
- Propuesta comercial ejecutiva con membrete configurable (logo en PNG/JPG, datos del instalador, asesor, teléfono, email y validez de la oferta).
- **Gráficos Vectoriales SVG Integrados**: Balance energético mensual y curva de retorno de inversión embebidos directamente en el documento.
- Insignia de Certificación de Impacto Ambiental Positivo y bloque de firmas formales.
- Botón **"Imprimir / Guardar en PDF"** con estilos `@media print` optimizados.

---

## ⚙️ Persistencia Dual

- **Modo Local (por defecto)**: Guarda automáticamente en `localStorage`. Funciona 100% offline sin necesidad de cuentas ni conexión a internet.
- **Modo Nube (Supabase)**: Multi-usuario en tiempo real. Soporta autenticación de usuarios, roles (`admin`, `vendedor`, `lector`), sincronización en la nube y control de conflictos.

---

## 🧪 Pruebas Unitarias

Para ejecutar la suite de pruebas del motor de cálculo:

```bash
node test/calc.test.js
```

