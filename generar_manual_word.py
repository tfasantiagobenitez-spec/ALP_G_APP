# -*- coding: utf-8 -*-
"""
Script para generar el Manual de Usuario profesional en formato Word (.docx)
para el Simulador Fotovoltaico de ALP GROUP.
"""
import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def create_callout_box(doc, text, title="NOTA IMPORTANTE", bg_hex="F0F9FF", border_hex="0284C7"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, bg_hex)
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    
    # Border
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'<w:tcBorders {nsdecls("w")}><w:left w:val="single" w:sz="24" w:space="0" w:color="{border_hex}"/><w:top w:val="none"/><w:right w:val="none"/><w:bottom w:val="none"/></w:tcBorders>')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run_title = p.add_run(f"📌 {title}: ")
    run_title.bold = True
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(10.5)
    run_title.font.color.rgb = RGBColor(2, 132, 199)
    
    run_text = p.add_run(text)
    run_text.font.name = "Calibri"
    run_text.font.size = Pt(10)
    run_text.font.color.rgb = RGBColor(51, 65, 85)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def format_row(row, bg_hex, text_color_rgb, is_bold=False, font_size=9.5):
    for cell in row.cells:
        set_cell_background(cell, bg_hex)
        set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        for p in cell.paragraphs:
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            for r in p.runs:
                r.bold = is_bold
                r.font.name = "Calibri"
                r.font.size = Pt(font_size)
                r.font.color.rgb = text_color_rgb

def build_manual():
    doc = docx.Document()
    
    # Configuración de márgenes
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        section.header.is_linked_to_previous = False
        section.footer.is_linked_to_previous = False
        
        # Header y Footer
        header_p = section.header.paragraphs[0]
        header_p.text = "ALP GROUP · Manual de Usuario · Simulador Fotovoltaico"
        header_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        header_p.runs[0].font.size = Pt(8.5)
        header_p.runs[0].font.color.rgb = RGBColor(148, 163, 184)
        
        footer_p = section.footer.paragraphs[0]
        footer_p.text = "Simulador FV v2.0 · Confidencial · Uso Técnico-Comercial"
        footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer_p.runs[0].font.size = Pt(8.5)
        footer_p.runs[0].font.color.rgb = RGBColor(148, 163, 184)

    # -------------------------------------------------------------
    # PORTADA
    # -------------------------------------------------------------
    p_logo = doc.add_paragraph()
    p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_logo.paragraph_format.space_before = Pt(20)
    p_logo.paragraph_format.space_after = Pt(30)
    
    logo_path = r"c:\Users\benit\ALP_G_APP\img\logo.png"
    if os.path.exists(logo_path):
        p_logo.add_run().add_picture(logo_path, width=Inches(3.4))
    
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_after = Pt(8)
    run_title = p_title.add_run("MANUAL DE USUARIO Y GUÍA TÉCNICA")
    run_title.bold = True
    run_title.font.name = "Arial"
    run_title.font.size = Pt(24)
    run_title.font.color.rgb = RGBColor(0, 159, 227) # Azul ALP
    
    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_after = Pt(28)
    run_sub = p_sub.add_run("Simulador Fotovoltaico · Análisis Técnico-Económico, BESS, Matrices de Sensibilidad y Propuestas Comerciales")
    run_sub.font.name = "Calibri"
    run_sub.font.size = Pt(14)
    run_sub.font.color.rgb = RGBColor(71, 85, 105)
    
    # Línea decorativa
    p_line = doc.add_paragraph()
    p_line.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_line.paragraph_format.space_after = Pt(40)
    r_line = p_line.add_run("━" * 40)
    r_line.font.color.rgb = RGBColor(0, 159, 227)
    
    # Tabla de Datos de la Portada
    t_meta = doc.add_table(rows=5, cols=2)
    t_meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("Empresa / Organización:", "ALP GROUP · Soluciones Energéticas"),
        ("Plataforma Web:", "https://alp-g-app.vercel.app"),
        ("Versión del Sistema:", "v2.0 (Edición Corporativa 2026)"),
        ("Área de Aplicación:", "Ingeniería de Preventa, Comercial y Proyectos Solares"),
        ("Fecha de Publicación:", "Septiembre 2026")
    ]
    for i, (k, v) in enumerate(meta_data):
        t_meta.cell(i, 0).text = k
        t_meta.cell(i, 1).text = v
        t_meta.cell(i, 0).width = Inches(2.3)
        t_meta.cell(i, 1).width = Inches(4.2)
        format_row(t_meta.rows[i], "F8FAFC" if i % 2 == 0 else "FFFFFF", RGBColor(30, 41, 59), is_bold=False, font_size=10)
        t_meta.rows[i].cells[0].paragraphs[0].runs[0].bold = True
        t_meta.rows[i].cells[0].paragraphs[0].runs[0].font.color.rgb = RGBColor(0, 159, 227)
        
    doc.add_page_break()

    # -------------------------------------------------------------
    # ÍNDICE GENERAL
    # -------------------------------------------------------------
    h1 = doc.add_heading("Índice General de Contenidos", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    toc_items = [
        ("1. Introducción y Propósito de la Plataforma", "3"),
        ("2. Arquitectura del Sistema y Persistencia Dual (Nube vs. Local)", "4"),
        ("3. Guía Paso a Paso de las 7 Pestañas de Análisis", "5"),
        ("   3.1. Pestaña 📋 Datos & Asistente de Dimensionamiento", "5"),
        ("   3.2. Pestaña ⚡ Energía, CO₂ y Desglose de Pérdidas Técnicas", "7"),
        ("   3.3. Pestaña 📈 Resultados Económicos (Compra Directa)", "8"),
        ("   3.4. Pestaña 🏦 Leasing vs. Compra al Contado", "9"),
        ("   3.5. Pestaña 🎯 Análisis de Sensibilidad y Matrices de Riesgo", "10"),
        ("   3.6. Pestaña ⚖️ Comparador Multi-Proyecto Lado a Lado", "11"),
        ("   3.7. Pestaña 📄 Propuesta Comercial Ejecutiva (Cotización para Clientes)", "11"),
        ("4. Base de Datos Solar y Presets de Distribuidoras Argentinas", "12"),
        ("5. Formulación Matemática y Algoritmos de Ingeniería", "13"),
        ("6. Preguntas Frecuentes y Buenas Prácticas (FAQ)", "15"),
    ]
    
    t_toc = doc.add_table(rows=len(toc_items), cols=2)
    t_toc.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, (item, page) in enumerate(toc_items):
        t_toc.cell(i, 0).text = item
        t_toc.cell(i, 1).text = page
        t_toc.cell(i, 0).width = Inches(5.8)
        t_toc.cell(i, 1).width = Inches(0.7)
        format_row(t_toc.rows[i], "FFFFFF", RGBColor(51, 65, 85), is_bold=not item.startswith("   "), font_size=10)
        t_toc.rows[i].cells[1].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT
    
    doc.add_page_break()

    # -------------------------------------------------------------
    # SECCIÓN 1: INTRODUCCIÓN
    # -------------------------------------------------------------
    h1 = doc.add_heading("1. Introducción y Propósito de la Plataforma", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    doc.add_paragraph(
        "El Simulador Fotovoltaico de ALP GROUP es una aplicación web integral de ingeniería y análisis económico-financiero, "
        "diseñada específicamente para el mercado de energía solar distribuida en Argentina. "
        "Su objetivo principal es permitir a ingenieros de preventa, asesores comerciales y directores de proyectos dimensionar con precisión técnica "
        "sistemas solares fotovoltaicos para clientes residenciales, comerciales, industriales y grandes usuarios, evaluando la rentabilidad "
        "de esquemas de compra directa llave en mano versus esquemas de financiamiento por leasing."
    )
    
    create_callout_box(
        doc,
        "La aplicación no requiere instalación de software ni compilación. Se encuentra desplegada y lista para operar en https://alp-g-app.vercel.app "
        "y también puede ejecutarse de forma local u offline en cualquier navegador moderno.",
        title="ACCESO RÁPIDO A LA PLATAFORMA"
    )
    
    doc.add_heading("Capacidades Principales:", level=2)
    bullets_s1 = [
        ("Dimensionamiento Inteligente de Cubierta: ", "Calcula la potencia pico instalable y módulos a partir de los metros cuadrados (m²) de techo disponibles o por objetivo de cobertura de factura."),
        ("Balance Energético Mensual y Curva Diaria: ", "Simula la curva solar campana de 24 horas frente al perfil de consumo del cliente, integrando almacenamiento con baterías (BESS)."),
        ("Desglose de Pérdidas y PR: ", "Modela factores térmicos, suciedad (soiling), tolerancia (mismatch), cableado DC/AC y rendimiento del inversor."),
        ("Evaluación Financiera Integral: ", "Cálculo en tiempo real de VAN (ARS/USD), TIR, Payback simple, Payback descontado, LCOE y ahorro acumulado a 20-30 años."),
        ("Modelo Completo de Leasing vs. Contado: ", "Incorpora canon periódico, seguro, mantenimiento, opción de compra y deducción en el Impuesto a las Ganancias."),
        ("Matrices de Riesgo y Sensibilidad: ", "Mapas de calor cruzados ante variaciones de tarifa eléctrica, CAPEX, inflación tarifaria y tasa de descuento."),
        ("Propuesta Comercial Ejecutiva con Gráficos Vectoriales: ", "Generación de cotizaciones formales listas para imprimir o exportar a PDF con membrete de ALP GROUP y gráficos SVG."),
    ]
    for bold_text, normal_text in bullets_s1:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    # -------------------------------------------------------------
    # SECCIÓN 2: ARQUITECTURA Y PERSISTENCIA DUAL
    # -------------------------------------------------------------
    h1 = doc.add_heading("2. Arquitectura del Sistema y Persistencia Dual", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    doc.add_paragraph(
        "La aplicación implementa una capa de abstracción de datos unificada (DB) con persistencia dual:"
    )
    
    t_arch = doc.add_table(rows=3, cols=3)
    t_arch.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers_arch = ["Modo de Operación", "Tecnología Base", "Casos de Uso Recomendados"]
    for j, h in enumerate(headers_arch):
        t_arch.cell(0, j).text = h
    format_row(t_arch.rows[0], "009FE3", RGBColor(255, 255, 255), is_bold=True, font_size=10)
    
    filas_arch = [
        ("Modo Local (Offline)", "localStorage del navegador web", "Visitas técnicas en terreno, obras sin conexión a internet, simulaciones rápidas individuales sin login."),
        ("Modo Nube (Cloud)", "Supabase (PostgreSQL + RLS + Auth)", "Trabajo colaborativo en equipo, catálogo centralizado de clientes, control de versiones y auditoría de proyectos.")
    ]
    for i, fila in enumerate(filas_arch):
        for j, val in enumerate(fila):
            t_arch.cell(i+1, j).text = val
        format_row(t_arch.rows[i+1], "F8FAFC" if i % 2 == 0 else "FFFFFF", RGBColor(51, 65, 85), is_bold=(j==0), font_size=9.5)
        t_arch.rows[i+1].cells[0].paragraphs[0].runs[0].bold = True
        
    t_arch.columns[0].width = Inches(1.8)
    t_arch.columns[1].width = Inches(2.2)
    t_arch.columns[2].width = Inches(2.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECCIÓN 3: GUÍA PASO A PASO DE LAS 7 PESTAÑAS
    # -------------------------------------------------------------
    h1 = doc.add_heading("3. Guía Paso a Paso de las 7 Pestañas de Análisis", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    # Pestaña 1
    doc.add_heading("3.1. Pestaña 📋 Datos & Asistente de Dimensionamiento", level=2)
    doc.add_paragraph(
        "Es el punto de entrada para parametrizar el proyecto. Contiene formularios declarativos y herramientas de cálculo avanzadas:"
    )
    
    doc.add_heading("A. Asistente de Techado y Superficie (Herramienta Desplegable):", level=3)
    doc.add_paragraph(
        "Al presionar el encabezado '📐 Asistente de Dimensionamiento y Superficie de Techo', se despliegan dos modos de cálculo:"
    )
    
    t_asist = doc.add_table(rows=5, cols=3)
    t_asist.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_asist.cell(0, 0).text = "Tipo de Cubierta"
    t_asist.cell(0, 1).text = "Factor de Ocupación"
    t_asist.cell(0, 2).text = "Criterio Técnico y Sobrecarga"
    format_row(t_asist.rows[0], "009FE3", RGBColor(255, 255, 255), is_bold=True, font_size=9.5)
    
    filas_asist = [
        ("Techo de Chapa", "75 % de área útil", "Montaje coplanar directo sobre grecas. Sobrecarga estática: ~13.5 kg/m²."),
        ("Losa Plana", "55 % de área útil", "Estructura triangular inclinada con pasillos inter-filas para evitar sombras mutuas. Sobrecarga: ~22.0 kg/m²."),
        ("Techo de Tejas", "65 % de área útil", "Anclajes estructurales salvando quiebres de agua y obstáculos. Sobrecarga: ~16.0 kg/m²."),
        ("Suelo / Terreno", "50 % de área útil", "Estructuras fijas hincadas con calles de mantenimiento para parques solares. Sobrecarga: N/A.")
    ]
    for i, fila in enumerate(filas_asist):
        for j, val in enumerate(fila):
            t_asist.cell(i+1, j).text = val
        format_row(t_asist.rows[i+1], "F8FAFC" if i % 2 == 0 else "FFFFFF", RGBColor(51, 65, 85), is_bold=False, font_size=9)
        t_asist.rows[i+1].cells[0].paragraphs[0].runs[0].bold = True
    
    t_asist.columns[0].width = Inches(1.8)
    t_asist.columns[1].width = Inches(1.7)
    t_asist.columns[2].width = Inches(3.0)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    doc.add_paragraph(
        "Al presionar '⚡ Aplicar potencia y módulos al proyecto', el sistema actualiza automáticamente la cantidad de paneles, "
        "la potencia kWp y el tipo de montaje en el formulario general."
    )

    doc.add_heading("B. Secciones del Formulario General:", level=3)
    secciones_form = [
        ("Cliente y Emplazamiento: ", "Razón social, CUIT, ubicación y selector de ciudad argentina para autocompletar la radiación solar anual."),
        ("Generación Fotovoltaica: ", "Potencia kWp, costo unitario (U$D/kWp), tipo de cambio ($/USD), Performance Ratio (PR %), irradiación anual y degradación de paneles (%/año)."),
        ("Almacenamiento con Baterías (BESS): ", "Habilitación de banco de acumulación, tecnología (Litio LFP / Gel), capacidad en kWh, costo unitario (U$D/kWh) y profundidad de descarga (DoD %). El sistema calcula automáticamente la autonomía de respaldo en horas."),
        ("Tarifa Eléctrica e Impuestos: ", "Tarifa monómica de energía ($/kWh) y tabla de impuestos provinciales/municipales con presets automáticos para EPE Santa Fe, Edenor/Edesur, EDEN, EPEC Córdoba, etc. Modalidad de inyección remunerada de excedentes."),
        ("Parámetros Macroeconómicos: ", "Horizonte de vida útil (20 a 30 años), tasa de descuento exigida (WACC %), aumento anual de tarifa (inflación energética %), OPEX anual (% CAPEX) y recambio programado de inversores."),
        ("Financiamiento por Leasing: ", "Canon mensual por kWp, plazo en meses (12 a 120), pago inicial de anticipo, valor residual / opción de compra, seguro anual, mantenimiento anual y alícuota deducible del Impuesto a las Ganancias (30% o 35%)."),
    ]
    for bold_text, normal_text in secciones_form:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    doc.add_page_break()

    # Pestaña 2
    doc.add_heading("3.2. Pestaña ⚡ Energía, CO₂ y Desglose de Pérdidas Técnicas", level=2)
    doc.add_paragraph(
        "Permite auditar el comportamiento físico y energético del generador solar fotovoltaico:"
    )
    
    bullets_s2 = [
        ("Balance Mensual Año 1: ", "Tabla interactiva mes a mes con generación solar, consumo del cliente, autoconsumo directo, excedentes a red y ahorro económico."),
        ("Estimación Solar Automática: ", "Botón 'Estimar generación' que distribuye la producción anual (kWp × Irradiación × PR) utilizando la campana estacional del hemisferio sur para Argentina."),
        ("Curva Diaria Horaria de 24 Horas: ", "Simulación a nivel horario (0 a 23 hs) comparando la generación solar fotovoltaica con la curva de demanda típica del tipo de usuario (Residencial con picos noche, Comercial con consumo diurno, Industrial continuo). "
         "Si se configuraron baterías, simula el almacenamiento de excedentes al mediodía (11:00 a 15:00 hs) y la inyección/descarga durante el horario pico nocturno (18:00 a 22:00 hs)."),
        ("Diagrama de Pérdidas Técnicas (Sankey): ", "Desglose de atenuaciones físicas del sistema: pérdidas térmicas por temperatura de celda (-4.2% a -6.2%), suciedad superficial/soiling (-3.0%), dispersión de módulos/mismatch (-1.5%), cableado DC (-1.2%), conversión del inversor (-2.1%) y cableado AC (-0.8%). Muestra el Performance Ratio (PR) real resultante."),
        ("Impacto Ambiental ESG: ", "Cálculo de toneladas de CO₂ evitadas por año y durante toda la vida útil (basado en el factor de emisión de la matriz eléctrica argentina SADI de 0.45 kg CO₂/kWh), árboles plantados equivalentes y kilómetros no emitidos en automóviles."),
    ]
    for bold_text, normal_text in bullets_s2:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    # Pestaña 3
    doc.add_heading("3.3. Pestaña 📈 Resultados Económicos (Compra Directa)", level=2)
    doc.add_paragraph(
        "Modela la viabilidad financiera bajo la modalidad de adquisición directa llave en mano (CAPEX):"
    )
    
    t_kpis = doc.add_table(rows=7, cols=2)
    t_kpis.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_kpis.cell(0, 0).text = "Indicador Financiero"
    t_kpis.cell(0, 1).text = "Descripción e Interpretación"
    format_row(t_kpis.rows[0], "009FE3", RGBColor(255, 255, 255), is_bold=True, font_size=9.5)
    
    kpis_data = [
        ("VAN (Valor Actual Neto)", "Valor monetario agregado del proyecto descontado a la tasa de retorno exigida (WACC). Si VAN > 0, el proyecto genera riqueza por encima del costo de oportunidad."),
        ("TIR (Tasa Interna de Retorno)", "Tasa de rendimiento intrínseca del flujo de fondos. Se compara contra la tasa de descuento para validar la rentabilidad."),
        ("Payback Simple", "Tiempo exacto (en años y meses) necesario para que los ahorros acumulados amortizen la inversión inicial total."),
        ("Payback Descontado", "Tiempo de repago considerando el valor del dinero en el tiempo (flujos descontados al WACC)."),
        ("LCOE (Costo Nivelado de Energía)", "Costo neto de generar cada kWh a lo largo de toda la vida útil ($/kWh y ¢USD/kWh). Se compara contra la tarifa eléctrica de red."),
        ("Ahorro Acumulado Total", "Suma total de ahorros proyectados en 20-30 años considerando degradación de paneles e inflación de tarifas.")
    ]
    for i, (k, v) in enumerate(kpis_data):
        t_kpis.cell(i+1, 0).text = k
        t_kpis.cell(i+1, 1).text = v
        format_row(t_kpis.rows[i+1], "F8FAFC" if i % 2 == 0 else "FFFFFF", RGBColor(51, 65, 85), is_bold=False, font_size=9)
        t_kpis.rows[i+1].cells[0].paragraphs[0].runs[0].bold = True
    
    t_kpis.columns[0].width = Inches(2.2)
    t_kpis.columns[1].width = Inches(4.3)

    create_callout_box(
        doc,
        "Podés presionar los botones [ ARS ($) ] y [ USD (U$D) ] en la barra superior de la pestaña para alternar instantáneamente "
        "todas las tarjetas de KPIs, gráficos de flujo de fondos y columnas de la tabla anual entre Pesos y Dólares al tipo de cambio oficial del proyecto. "
        "Además, el botón '📥 Descargar Flujo en Excel (CSV)' genera una planilla completa compatible con Microsoft Excel.",
        title="CONMUTADOR DE MONEDA Y EXPORTACIÓN A EXCEL"
    )

    doc.add_page_break()

    # Pestaña 4
    doc.add_heading("3.4. Pestaña 🏦 Leasing vs. Compra al Contado", level=2)
    doc.add_paragraph(
        "Permite presentar una alternativa de financiamiento donde el cliente no inmoviliza capital inicial elevado:"
    )
    bullets_s4 = [
        ("Flujo Neto Mensual: ", "Compara el ahorro eléctrico mensual generado por los paneles frente a la cuota integral de leasing (canon + seguro + mantenimiento). Si el ahorro mensual supera la cuota, el proyecto se autofinancia desde el mes 1."),
        ("Escudo Fiscal en Ganancias: ", "Calcula el ahorro impositivo resultante de deducir el canon, seguro y mantenimiento de la base imponible del Impuesto a las Ganancias (alícuota del 30% o 35%)."),
        ("Desglose del Costo Total: ", "Tabla de desglose: Pago inicial + Suma de cánones + Seguros + Mantenimientos + Opción de compra final − Ahorro en Ganancias = Costo Neto del Leasing."),
        ("Gráfico de Flujo Comparativo: ", "Curva acumulada año por año enfrentando la opción Contado vs. Leasing."),
    ]
    for bold_text, normal_text in bullets_s4:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    # Pestaña 5
    doc.add_heading("3.5. Pestaña 🎯 Análisis de Sensibilidad y Matrices de Riesgo", level=2)
    doc.add_paragraph(
        "Evalúa la robustez del proyecto ante variaciones del entorno macroeconómico y de precios mediante dos matrices cruzadas de mapa de calor:"
    )
    doc.add_paragraph(
        "• Matriz 1 (Tarifa vs. CAPEX): Evalúa simultáneamente variaciones de -20% a +20% en el precio de la energía eléctrica y de -15% a +15% en el costo de instalación (U$D/kWp), mostrando el VAN resultante en cada intersección.\n"
        "• Matriz 2 (Inflación Tarifaria vs. Tasa de Descuento): Evalúa el VAN combinando tasas de descuento del 6% al 15% con distintos ritmos de ajuste tarifario anual."
    )

    # Pestaña 6
    doc.add_heading("3.6. Pestaña ⚖️ Comparador Multi-Proyecto Lado a Lado", level=2)
    doc.add_paragraph(
        "Permite seleccionar varios proyectos o variantes de potencia guardadas (ej: 10 kWp vs. 30 kWp vs. 50 kWp) y compararlos en una sola tabla sinóptica "
        "evaluando CAPEX, generación anual, cobertura, VAN, TIR, Payback, LCOE y canon de leasing."
    )

    # Pestaña 7
    doc.add_heading("3.7. Pestaña 📄 Propuesta Comercial Ejecutiva (PDF Imprimible)", level=2)
    doc.add_paragraph(
        "Genera una cotización formal ejecutiva lista para entregar al cliente. Incluye:"
    )
    bullets_s7 = [
        ("Membrete Oficial: ", "Logo de ALP GROUP, datos de la empresa, asesor responsable, teléfono, email y plazo de validez de la oferta en días."),
        ("Ficha Técnica del Cliente & Obra: ", "Razón social, CUIT, ubicación, tipo de instalación y especificaciones de paneles, potencia pico y baterías."),
        ("Gráficos Vectoriales SVG Integrados: ", "Gráfico de barras de balance energético mensual y gráfico de curva de retorno financiero acumulado con el punto de Payback señalado."),
        ("Comparativa Económica de Doble Opción: ", "Resumen lado a lado de Compra Directa (Llave en mano) vs. Financiamiento por Leasing."),
        ("Insignia de Certificación Ambiental: ", "Distintivo ecológico destacando el aporte a la descarbonización y árboles equivalentes."),
        ("Bloque de Firmas Formales: ", "Líneas de firma para el responsable técnico de ALP GROUP y conformidad del cliente."),
        ("Botón 'Imprimir / Guardar en PDF': ", "Estilizado con reglas @media print para generar un PDF impecable sin barras ni elementos de interfaz."),
    ]
    for bold_text, normal_text in bullets_s7:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    doc.add_page_break()

    # -------------------------------------------------------------
    # SECCIÓN 4: BASE DE DATOS SOLAR Y DISTRIBUIDORAS
    # -------------------------------------------------------------
    h1 = doc.add_heading("4. Base de Datos Solar y Presets de Distribuidoras Argentinas", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    doc.add_paragraph(
        "El motor incluye datos de irradiación solar anual (kWh/m²) para más de 29 localidades y regiones argentinas:"
    )
    
    t_ciudades = doc.add_table(rows=9, cols=4)
    t_ciudades.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_ciudades.cell(0, 0).text = "Región / Ciudad"
    t_ciudades.cell(0, 1).text = "Irradiación"
    t_ciudades.cell(0, 2).text = "Región / Ciudad"
    t_ciudades.cell(0, 3).text = "Irradiación"
    format_row(t_ciudades.rows[0], "009FE3", RGBColor(255, 255, 255), is_bold=True, font_size=9)
    
    ciudades_sample = [
        ("Buenos Aires (CABA / AMBA)", "1.750 kWh/m²", "Mendoza Capital", "2.050 kWh/m²"),
        ("La Plata", "1.740 kWh/m²", "San Juan Capital", "2.180 kWh/m²"),
        ("Mar del Plata / Costa", "1.680 kWh/m²", "Salta Capital", "2.120 kWh/m²"),
        ("Bahía Blanca", "1.820 kWh/m²", "Puna Jujeña / Cauchari", "2.450 kWh/m²"),
        ("Rosario", "1.820 kWh/m²", "Neuquén / Alto Valle", "1.880 kWh/m²"),
        ("Santa Fe Capital", "1.835 kWh/m²", "Bariloche / Cordillera", "1.620 kWh/m²"),
        ("Córdoba Capital", "1.910 kWh/m²", "Resistencia / Corrientes", "1.840 kWh/m²"),
        ("Río Cuarto / Villa María", "1.890 kWh/m²", "Posadas / Iguazú", "1.780 kWh/m²")
    ]
    for i, (c1, i1, c2, i2) in enumerate(ciudades_sample):
        t_ciudades.cell(i+1, 0).text = c1
        t_ciudades.cell(i+1, 1).text = i1
        t_ciudades.cell(i+1, 2).text = c2
        t_ciudades.cell(i+1, 3).text = i2
        format_row(t_ciudades.rows[i+1], "F8FAFC" if i % 2 == 0 else "FFFFFF", RGBColor(51, 65, 85), is_bold=False, font_size=8.5)
        t_ciudades.rows[i+1].cells[0].paragraphs[0].runs[0].bold = True
        t_ciudades.rows[i+1].cells[2].paragraphs[0].runs[0].bold = True

    t_ciudades.columns[0].width = Inches(2.2)
    t_ciudades.columns[1].width = Inches(1.1)
    t_ciudades.columns[2].width = Inches(2.1)
    t_ciudades.columns[3].width = Inches(1.1)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    doc.add_heading("Presets de Distribuidoras Eléctricas:", level=2)
    doc.add_paragraph(
        "• EPE Santa Fe: Ley 7797 (6%), Ley 13.414 FER (1.5%), Alumbrado Público CAP (0.2%), Ley 12692.\n"
        "• Edenor / Edesur (AMBA): Contribución Municipal Art. 34 (6.424%), Dec-Ley 7290 (1%), Tasa Alumbrado (1.43%).\n"
        "• EDEN / EDEA / EDES (Pcia. Bs. As.): Ley 11969 (6%), Ley 7290 (1%), Ley 11769 FCT (3.5%), Alumbrado (0.24%).\n"
        "• EPEC Córdoba: FODEP (10%), Tasa Reg. Dec. 2298/00 (1.044%), Res. 27/15 Seguridad Eléctrica (0.261%)."
    )

    doc.add_page_break()

    # -------------------------------------------------------------
    # SECCIÓN 5: FORMULACIÓN MATEMÁTICA Y ALGORITMOS
    # -------------------------------------------------------------
    h1 = doc.add_heading("5. Formulación Matemática y Algoritmos de Ingeniería", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    formulas = [
        ("1. Valor Actual Neto (VAN):", "VAN = -CAPEX + ∑ [ Flujo_t / (1 + r)^t ]\nDonde r es la tasa de descuento anual (WACC) y Flujo_t es el ahorro neto del año t."),
        ("2. Tasa Interna de Retorno (TIR):", "Tasa r* que satisface: VAN(r*) = 0.\nEl motor calcula la raíz mediante el algoritmo de bisección numérica con convergencia de 10^-7."),
        ("3. Costo Nivelado de la Energía (LCOE):", "LCOE = [ CAPEX + ∑ (OPEX_t + Recambio_t)/(1+r)^t ] / [ ∑ Generacion_t/(1+r)^t ]\nPermite comparar directamente el costo solar ($/kWh o USD/kWh) contra la tarifa de red."),
        ("4. Payback con Interpolación Lineal:", "Payback = (t - 1) + [ |Flujo_Acumulado_{t-1}| / Flujo_t ]\nCalcula con precisión de fracción de año el momento exacto en que se recupera la inversión."),
        ("5. Degradación e Inflación Compuesta:", "Generacion_t = Generacion_1 × (1 - d)^(t-1)\nAhorro_t = Ahorro_1 × (1 - d)^(t-1) × (1 + inf)^(t-1)\nDonde d es la degradación anual (ej: 0.5%/año) e inf es el aumento tarifario anual."),
        ("6. Autonomía del Banco de Baterías (BESS):", "Capacidad_Util = Capacidad_Nominal × (DoD % / 100)\nAutonomia_Horas = Capacidad_Util / Demanda_Media_Horaria"),
        ("7. Escudo Fiscal del Leasing en Ganancias:", "Ahorro_Impositivo = (∑ Canones + ∑ Seguros + ∑ Mantenimientos) × Alícuota_Ganancias\nCosto_Neto = Pago_Inicial + ∑ Canones + ∑ Seguros + ∑ Mtto + Opcion_Compra − Ahorro_Impositivo")
    ]
    
    for tit, form in formulas:
        p = doc.add_paragraph()
        r_t = p.add_run(tit + "\n")
        r_t.bold = True
        r_t.font.color.rgb = RGBColor(0, 159, 227)
        r_f = p.add_run(form)
        r_f.font.name = "Consolas"
        r_f.font.size = Pt(9.5)
        r_f.font.color.rgb = RGBColor(30, 41, 59)
        p.paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECCIÓN 6: FAQ Y BUENAS PRÁCTICAS
    # -------------------------------------------------------------
    h1 = doc.add_heading("6. Preguntas Frecuentes y Buenas Prácticas (FAQ)", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    faqs = [
        ("¿Cómo guardar un proyecto de forma segura?", 
         "Podés presionar '💾 Guardar' o utilizar el atajo de teclado Ctrl+S. Si estás en modo local, se guarda en el navegador; si estás en modo nube, se sincroniza en la base de datos de Supabase."),
        ("¿Qué hacer si un cliente tiene consumos estacionales variables?", 
         "En la pestaña '⚡ Energía y CO₂', podés editar manualmente los kWh de consumo de cada uno de los 12 meses del año según las facturas históricas del cliente."),
        ("¿Cómo modificar el membrete o logotipo de la empresa?", 
         "En la barra superior, hacé clic en '🏢 Membrete'. Podés cargar un nuevo archivo de imagen (PNG/JPG), actualizar el nombre de la empresa, el asesor asignado, teléfono, email y validez de la oferta."),
        ("¿Cómo exportar la propuesta comercial a un cliente?", 
         "Ingresá a la pestaña '📄 Propuesta Comercial' y hacé clic en '🖨 Imprimir / Guardar en PDF'. Seleccioná la impresora 'Guardar como PDF' en tu navegador para generar un documento ejecutivo listo para enviar por email o WhatsApp."),
        ("¿Cómo duplicar un proyecto para evaluar dos potencias distintas?", 
         "Abrí el proyecto base y presioná '⧉ Duplicar'. Se creará una copia independiente ('Proyecto (copia)') donde podrás cambiar la potencia o los parámetros sin alterar el original.")
    ]
    
    for q, a in faqs:
        p = doc.add_paragraph()
        r_q = p.add_run(f"❓ {q}\n")
        r_q.bold = True
        r_q.font.color.rgb = RGBColor(0, 159, 227)
        r_a = p.add_run(f"💡 {a}")
        r_a.font.color.rgb = RGBColor(51, 65, 85)
        p.paragraph_format.space_after = Pt(8)

    # Guardar documento
    output_path = r"c:\Users\benit\ALP_G_APP\Manual_de_Usuario_Simulador_FV_ALP_GROUP.docx"
    doc.save(output_path)
    print(f"Manual generado con éxito en: {output_path}")

if __name__ == "__main__":
    build_manual()
