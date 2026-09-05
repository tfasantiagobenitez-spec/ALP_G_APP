# Simulador FV · Análisis Técnico-Económico Solar

Aplicación web profesional para el dimensionamiento y análisis técnico, económico y financiero de proyectos solares fotovoltaicos en Argentina (autoconsumo residencial, comercial, industrial y grandes usuarios).

Sin dependencias ni necesidad de compilación (*build*): se abre [index.html](file:///c:/Users/benit/ALP_G_APP/index.html) directamente en el navegador o se sirve con cualquier servidor web estático.

---

## 📁 Estructura del Proyecto

```
index.html          Interfaz de usuario (SPA con pestañas de análisis y gemelo 3D)
css/styles.css      Estilos modernos, tipografía Inter, modo Claro/Oscuro y visor 3D/impresión
js/calc.js          Motor: balance horario 12×24, tarifa por bandas, inversor, BESS, CO₂, pérdidas, leasing y presupuesto
js/solar.js         Física solar: declinación, transposición al plano, día despejado y temperatura de celda
js/techo3d.js       Motor 3D: geometría de cubiertas, empaquetado reticular de módulos, NASA POWER y posición solar
js/ui-techo3d.js    Visor híbrido 2D Satelital (Leaflet) + 3D WebGL (Three.js), sombras dinámicas y cierre 90s
js/finanzas.js      Préstamo bancario, PPA y comparador de las cuatro alternativas de financiamiento
js/riesgo.js        Monte Carlo y diagrama de tornado, con semilla fija para que el resultado sea reproducible
js/ui-comun.js      Formato es-AR, gráficos SVG sin dependencias y utilidades de interfaz
js/ui-analisis.js   Pestañas de Financiamiento y Riesgo
js/ui-gestion.js    Pipeline, revisiones congeladas, tablero gerencial, papelera y presupuesto por ítems
js/config.js        Configuración de credenciales para la nube (Supabase)
js/db.js            Capa de persistencia dual unificada (LocalStorage offline + Supabase nube) y membrete de la empresa
js/ejemplo.js       Proyectos de ejemplo reales listos para utilizar
test/todos.js       Corre todas las suites de tests: `node test/todos.js`
supabase/schema.sql Esquema PostgreSQL con RLS, roles, pipeline, catálogo y auditoría
supabase/aplicar_esquema.js  Aplica el esquema al proyecto de Supabase y verifica el resultado
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

### 2. 🛰️ Techo & 3D (Diseño Satelital y Cierre Express en 90s)
- **Cartografía Satelital de Alta Resolución**: Mosaico global vía **Esri World Imagery** con buscador de direcciones, ciudades y parques industriales en Argentina (OpenStreetMap Nominatim) y botón de geolocalización GPS en vivo.
- **Trazador Asistido de Techos & Exclusión de Obstáculos**: Delimitación poligonal de la cubierta con cálculo instantáneo de área ($m^2$), perímetro y orientación/azimut del eje principal. Marcador de chimeneas, domos, extractores y árboles con radio de exclusión.
- **Auto-Layout de Módulos (Paneles 575 Wp)**: Empaquetado reticular inteligente que maximiza la potencia instalable ($kWp$) respetando pasillos perimetrales de seguridad y espaciado entre filas.
- **Gemelo 3D en Tiempo Real (Three.js)**: Extrusión volumétrica del edificio según su altura y tipo de cubierta (industrial, comercial, losa). Módulos 3D fotorrealistas y obstáculos circundantes.
- **Simulador de Sombras Astronómicas**: Control interactivo de hora del día (06:00 a 19:00 hs), mes del año y animación continua *"▶ Animar Día"* proyectando las sombras reales del sol sobre el techo y los paneles.
- **Conexión Climatológica Satelital**: Consulta a la API de **NASA POWER** para obtener radiación solar histórica (GHI, DNI, DHI) y temperatura con fallback automático offline al motor de `solar.js`.
- **Cierre Financiero Express (90s)**: Comparador en vivo de **Ahorro mensual en la factura vs. Cuota mensual de Leasing no bancario de ALP Group** (*"El sistema se paga solo desde el mes 1"*).
- **Acciones Comerciales 1-Clic**: Botón *⚡ Aplicar al Proyecto Completo* (actualiza potencia, paneles, azimut e inclinación en todo el simulador), *💬 WhatsApp* (genera el pitch de ventas con cifras clave listo para enviar) y *📸 Foto 3D* (captura el render para la propuesta).

### 3. ⚡ Energía, CO₂ y Desglose de Pérdidas
- **Balance horario (12 × 24 h)**: el autoconsumo surge de simular cada mes hora por hora, no de comparar totales mensuales. Ver [Modelo de autoconsumo](#-modelo-de-autoconsumo).
- Balance mensual interactivo de generación solar, demanda, autoconsumo y excedentes inyectados a red.
- **⏱ Curva Diaria Horaria (24 horas)**: campana solar calculada con la posición real del sol en el emplazamiento (latitud, longitud, declinación y huso UTC-3), frente a la curva de demanda del cliente y al ciclado de carga/descarga del banco de baterías. Seleccionable por mes o como día medio del año.
- **🔬 Diagrama de Pérdidas Técnicas y Performance Ratio (PR)**: Desglose físico de pérdidas por temperatura de celda, suciedad/soiling, mismatch de módulos, caídas de tensión DC/AC y rendimiento del inversor.
- **Indicadores Ambientales (ESG)**: Toneladas de $CO_2$ evitadas al año y en vida útil (factor matriz SADI $0.45\text{ kg }CO_2/kWh$), árboles plantados equivalentes y kilómetros no emitidos.

### 4. 📈 Resultados Económicos (Compra Directa)
- **Selector de Moneda en Tiempo Real**: Visualización instantánea de todos los flujos, tablas y KPIs en **Pesos Argentinos (ARS)** o **Dólares (USD)**.
- Indicadores financieros clave: **VAN** ($\$$ y $U\$D$), **TIR**, **Payback simple**, **Payback descontado**, **LCOE** ($\$/kWh$ y $\text{¢}U\$D/kWh$) y ahorro acumulado a 20-30 años.
- **Exportación a Excel (CSV)**: Descarga del flujo de fondos anual completo con desglose de generación, ahorros, OPEX, recambio y flujos acumulados descontados.

### 5. 🏦 Financiamiento
- **Comparador de cuatro alternativas**: compra al contado, leasing, préstamo bancario y PPA, todas en dólares, con el ahorro convertido al tipo de cambio proyectado de cada año y descontadas a la misma tasa. Ver [Comparador de financiamiento](#-comparador-de-financiamiento).
- **Préstamo bancario**: sistema francés o alemán, en dólares, en pesos a tasa fija o ajustable por UVA, con gastos de otorgamiento y costo financiero total.
- **PPA**: el cliente no invierte y compra la energía solar a un precio menor que el de la distribuidora, con opción de compra al final del contrato.
- Detalle del leasing: canon, seguro, mantenimiento, opción de compra y escudo fiscal en Ganancias.

### 6. 🎯 Riesgo
- **Simulación de Monte Carlo**: sortea miles de escenarios moviendo a la vez el recurso solar, la tarifa, el costo del sistema, la actualización tarifaria y la devaluación. Devuelve la distribución completa del VAN, la probabilidad de que sea positivo y los percentiles P10, P50 y P90.
- **Diagrama de tornado**: ordena las variables por cuánto mueven el VAN. La más larga es la que hay que negociar primero.
- **Matriz Tarifa vs. CAPEX** y **Matriz Inflación vs. Tasa de Descuento**: mapas de calor del VAN ante variaciones cruzadas.

### 7. ⚖️ Comparador Multi-Proyecto
- Tabla comparativa de métricas lado a lado seleccionando múltiples proyectos o escenarios de potencia para el mismo cliente.

### 8. 📌 Pipeline Comercial
- Etapas: borrador, enviada, en negociación, ganada y perdida, con probabilidad de cierre y motivo de pérdida.
- Tablero de columnas con todos los proyectos, potencia acumulada por etapa y acceso directo a cada uno.
- **Revisiones congeladas**: cada envío al cliente deja una copia inmutable del estado con sus indicadores, fecha y autor. Se numeran Rev. A, Rev. B y así.
- **Papelera**: eliminar manda a la papelera, desde donde se restaura o se borra definitivamente.

### 9. 📊 Tablero Gerencial
- Potencia y monto cotizados, ticket medio, tasa de conversión y valor del pipeline ponderado por probabilidad de cierre.
- Embudo comercial, potencia cotizada y ganada por mes, y agrupaciones por ubicación y por responsable.
- **Necesitan atención**: ofertas vencidas según la validez del membrete, proyectos frenados más de 45 días, pérdidas sin motivo cargado y proyectos con VAN negativo que siguen abiertos.

### 10. 📄 Propuesta Comercial Ejecutiva (Cotización Imprimible en PDF)
- Propuesta comercial ejecutiva con membrete configurable (logo en PNG/JPG, datos del instalador, asesor, teléfono, email y validez de la oferta).
- **Estudio Satelital 3D Integrado**: Incorpora la superficie de cubierta, azimut, inclinación, factor de ocupación y la imagen renderizada del gemelo 3D de la nave del cliente.
- **Gráficos Vectoriales SVG Integrados**: Balance energético mensual y curva de retorno de inversión embebidos directamente en el documento.
- Insignia de Certificación de Impacto Ambiental Positivo y bloque de firmas formales.
- Botón **"Imprimir / Guardar en PDF"** con estilos `@media print` optimizados.
- **Compartir por WhatsApp o email** con un resumen de una línea por concepto.
- **Descargar HTML autónomo**: un solo archivo que se abre en cualquier navegador sin la app, conserva los gráficos vectoriales e imprime en PDF. Sin librerías externas.

---

## 🔆 Modelo de autoconsumo

El autoconsumo solo existe cuando la generación y la demanda coinciden en el mismo instante. El motor lo resuelve **hora por hora para los doce meses** y recién después agrega a valores mensuales y anuales.

- **Generación horaria**: la energía de cada mes se reparte entre las 24 horas según el coseno del ángulo cenital, calculado con la latitud y longitud de la localidad elegida, la declinación solar del día representativo del mes y la corrección del huso UTC-3. De ahí salen solos los días largos de verano y el mediodía solar cerca de las 13:00 hs.
- **Demanda horaria**: perfil residencial (pico nocturno), comercial (meseta diurna) o industrial (casi plano), según el tipo de sistema.
- **Baterías**: el excedente carga el banco con límite de potencia (C-rate) y rendimiento repartido entre carga y descarga; lo almacenado se entrega cuando falta sol. El día tipo se simula tres veces encadenando el estado de carga, para arrancar en régimen estacionario. El aporte se valoriza como energía que deja de comprarse a la red, y el banco lleva su propio recambio en el flujo de fondos.
- **Conservación**: el balance cumple siempre `autoconsumo + excedente = generación` y `autoconsumo + red = consumo`.

> ⚠️ **Cambio respecto de versiones anteriores.** El simulador calculaba el autoconsumo como `mín(generación, consumo)` de cada mes, lo que supone que toda la energía del mediodía encuentra demanda simultánea. Ese criterio sobreestima el ahorro (mucho en residencial, menos en industrial) y hacía que las baterías sumaran costo sin aportar energía. Un proyecto guardado con el modelo anterior mostrará ahora cobertura y VAN más bajos. Para reproducir una cotización ya entregada, poné **Modelo de autoconsumo → Mensual** en la pestaña Datos; el modo queda guardado con el proyecto y se indica en la pestaña Energía y en el CSV exportado.

## 💵 Moneda de análisis y devaluación

El ahorro nace en pesos y la inversión se cotiza en dólares. El simulador proyecta el tipo de cambio año a año con la **devaluación anual esperada** y vincula las dos tasas de descuento con la relación de Fisher: `(1 + r_pesos) = (1 + r_dólares) × (1 + devaluación)`. Cargás la tasa en la moneda que elegís para analizar y la otra se deriva sola, así el VAN da el mismo número medido en cualquiera de las dos.

El indicador que importa aparece en la pestaña Resultados: **cuánto sube realmente la tarifa medida en dólares**, `(1 + inflación) / (1 + devaluación) − 1`. Una tarifa que sube 20 % anual en pesos con 15 % de devaluación sube 4,35 % en dólares, no 20 %.

> ⚠️ Con devaluación cero el ahorro crece en dólares al mismo ritmo que en pesos, lo que a 20 o 30 años multiplica la tarifa en moneda dura de forma poco creíble. La app avisa cuando se combina un aumento tarifario alto con devaluación nula.

## 🧾 Tratamiento de Ganancias

Para un cliente que tributa Ganancias, el ahorro de energía reduce un gasto deducible y por lo tanto **aumenta la base imponible**. Si eso se ignora en la compra pero se reconoce el escudo del leasing, la comparación queda sesgada. Hay tres regímenes:

| Régimen | Ahorro | Compra | Leasing |
|---|---|---|---|
| **Simétrico** (por defecto) | tributa a la alícuota | amortiza el equipo en N años | deduce canon, seguro y mantenimiento |
| **Sin Ganancias** | no tributa | sin escudo | sin escudo |
| **Anterior** (solo compatibilidad) | no tributa | sin escudo | deduce canon, seguro y mantenimiento |

> ⚠️ **Cambio respecto de versiones anteriores.** Un proyecto guardado con leasing deducible pasa por defecto al régimen simétrico, así que su comparación cambia: el leasing deja de verse artificialmente mejor. Para reproducir una cotización ya entregada, elegí **Tratamiento de Ganancias → Solo escudo del leasing** en la pestaña Datos. Los resultados fiscales son una estimación de ingeniería, no un dictamen contable.

## ✅ Chequeos del proyecto

Un panel en la pestaña Datos revisa el proyecto en cada tecla y lista lo que no cierra: potencia que no coincide con los módulos, PR o irradiación fuera de rango, consumo en cero, cobertura mayor al 100 %, generación que no coincide con la estimada, inyección remunerada sin precio, CUIT con dígito verificador inválido, parámetros de batería atípicos y marcos monetario o fiscal que engañan. Cada hallazgo tiene un botón que lleva al campo.

La insignia en la barra de resumen muestra el estado de un vistazo. **La propuesta no se imprime** si el membrete no tiene nombre, teléfono y email reales, y pide confirmación si quedan errores sin resolver.

## 🔢 Ingreso de números

Los campos numéricos aceptan notación argentina y anglosajona: `1.234,56`, `8,05`, `1.500` (mil quinientos), `1,500.50` y `U$D 550`. Debajo del campo se muestra el valor que el motor interpretó cada vez que el texto lleva coma o punto, para que no queden dudas.

## 🛰 Irradiación sobre el plano de los módulos

El campo **Fuente de irradiación** tiene tres modos:

| Modo | De dónde sale la irradiación |
|---|---|
| **Valor anual a mano** (por defecto) | El número cargado en el formulario, con el reparto mensual genérico |
| **Calculada sobre el plano** | Geometría solar del sitio: latitud, longitud, inclinación, azimut y albedo |
| **NASA POWER + plano** | Serie mensual satelital del punto exacto, transpuesta al plano de los módulos |

El cálculo encadena irradiación horizontal, índice de claridad, fracción difusa por la correlación de Erbs, transposición isotrópica de Liu-Jordan al plano inclinado y perfil horario resultante. De ahí salen, sin parámetros extra, la ganancia por inclinación, el reparto mensual real del recurso y la temperatura de celda por el modelo NOCT.

El botón **Aplicar inclinación óptima** busca el ángulo que maximiza la irradiación anual para el azimut cargado. En Rosario da 26°, con una ganancia del 7,9 % sobre el plano horizontal.

Los datos de NASA POWER se descargan una vez y quedan guardados con el proyecto, así que el cálculo sigue funcionando sin conexión. Se eligió NASA POWER y no PVGIS porque es el único de los dos que permite consultarlo desde el navegador.

## 🔌 Inversor, cadenas y recorte de potencia

Con la potencia del inversor cargada, la app verifica la ventana de tensión en los dos extremos térmicos: la tensión de circuito abierto con el mínimo histórico de temperatura no puede superar la máxima del inversor, y la de máxima potencia con la celda caliente tiene que quedar por encima de la mínima de seguimiento. De ahí salen la cantidad de módulos en serie y las cadenas necesarias.

El recorte por potencia se informa de dos maneras, porque son dos cosas distintas:

- **Día despejado**: es el criterio de diseño. Un modelo de cielo claro da el pico real de potencia continua, que en Argentina ronda el 90 % de la potencia de placa. Con una relación DC/AC de 1,2 se recorta cerca del 3 % de la energía del día; con 1,5, cerca del 14 %.
- **Año medio**: es lo que sale del balance horario, que promedia días nublados y aplana el pico. Siempre da menos. Sirve para el flujo de fondos, no para elegir el inversor.

## 💸 Comparador de financiamiento

Las cuatro alternativas se llevan a dólares y se descuentan a la misma tasa, así la comparación no depende de en qué moneda esté cada pata:

- **Contado**: máximo retorno, requiere el capital completo por adelantado.
- **Leasing**: canon mensual deducible, sin inmovilizar capital.
- **Préstamo**: el equipo es del cliente desde el día uno y se amortiza fiscalmente; el interés también es deducible. Endeudarse en pesos con devaluación alta licúa la deuda, y el modelo lo muestra.
- **PPA**: sin inversión ni riesgo técnico, con un ahorro menor.

El costo financiero total del préstamo sale de la tasa interna de las cuotas reales, con gastos de otorgamiento incluidos, así que siempre queda por encima de la tasa nominal.

## 🎲 Análisis de riesgo

Monte Carlo mueve seis variables a la vez con las dispersiones típicas de cada una: recurso solar 4 %, tarifa 10 %, costo del sistema 8 %, actualización tarifaria y devaluación 5 puntos, degradación 0,15 puntos. Todas son ajustables.

La semilla es fija, así que **el mismo proyecto devuelve siempre los mismos números** y la propuesta se puede reproducir seis meses después. Mil escenarios corren en menos de medio segundo.

El tornado, en los proyectos argentinos, casi siempre pone arriba la actualización tarifaria y la devaluación. Eso dice dónde está el riesgo real: no en el sol ni en el precio de los paneles, sino en la macro.

## 🧾 Presupuesto por ítems

El precio por kWp puede cargarse a mano o salir de un presupuesto detallado. Con el presupuesto activo, el U$D/kWp pasa a ser un resultado y no un dato.

El catálogo trae módulos, inversores, baterías, estructura por tipo de cubierta, cableado, tableros, mano de obra e ingeniería, con precios de referencia que conviene reemplazar por los del proveedor. En modo nube lo mantiene un administrador; en modo local vive en el navegador.

El botón **Sugerir** arma un presupuesto tentativo coherente con la potencia, la cubierta y las baterías del proyecto: elige el módulo más cercano a la potencia unitaria cargada y el inversor que cubre la potencia con la menor cantidad de equipos.

## ⚙️ Persistencia Dual

- **Modo Local (por defecto)**: Guarda automáticamente en `localStorage`. Funciona 100% offline sin necesidad de cuentas ni conexión a internet.
- **Modo Nube (Supabase)**: Multi-usuario en tiempo real. Soporta autenticación de usuarios, roles (`admin`, `vendedor`, `lector`), sincronización en la nube y control de conflictos.
- **Pipeline, revisiones, catálogo y auditoría**: en modo nube viven en las tablas `propuestas`, `productos` y `auditoria`, con políticas de seguridad a nivel de fila. Las revisiones congeladas no se pueden editar: una revisión modificable no sirve para nada. La auditoría registra altas, ediciones, envíos a la papelera y restauraciones.
- **Membrete compartido**: en modo nube los datos y el logo de la empresa viven en la tabla `empresa` y los ve todo el equipo. Solo un `admin` puede modificarlos, y la política de seguridad a nivel de fila lo verifica también del lado del servidor. En modo local siguen guardándose en el navegador. Arrancan vacíos a propósito, para que ninguna propuesta salga con datos de relleno.

---

## ☁️ Aplicar el esquema en Supabase

El proyecto en uso es `crxxjfcidqkecqbjeaxr`, en la región de San Pablo. Su URL y su clave pública están en [js/config.js](js/config.js); la clave pública es de exposición prevista, la protección real la dan las políticas de seguridad a nivel de fila.

Para ver qué falta en la base, sin escribir nada:

```bash
node supabase/aplicar_esquema.js --verificar
```

Para aplicar el esquema hace falta una credencial, que se pasa por variable de entorno y nunca se escribe en el repositorio:

```bash
setx SUPABASE_ACCESS_TOKEN "sbp_..."     # token de supabase.com/dashboard/account/tokens
node supabase/aplicar_esquema.js
```

El esquema es idempotente: se puede volver a correr sobre una base ya creada sin romper nada. También sirve pegar [supabase/schema.sql](supabase/schema.sql) entero en el editor SQL del panel.

La contraseña de la base quedó en `supabase/credenciales.local.txt`, que está en `.gitignore`. Se puede cambiar desde Project Settings, Database, Reset database password.

## 🧪 Pruebas Unitarias

Para ejecutar la suite de pruebas del motor de cálculo:

```bash
node test/todos.js
```

Cada suite también corre sola: `node test/solar.test.js`, `node test/finanzas.test.js`, `node test/riesgo.test.js`, `node test/motor.test.js`, `node test/calc.test.js`.

140 tests sobre parseo numérico, física solar, balance horario, tarifa por bandas, dimensionamiento de inversor, equivalencia de monedas, regímenes fiscales, préstamo, PPA, Monte Carlo, tornado, presupuesto por ítems, validaciones y geometría de techo. Se ejecutan también en cada push mediante GitHub Actions ([.github/workflows/tests.yml](.github/workflows/tests.yml)).

