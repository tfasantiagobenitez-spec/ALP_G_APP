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
    run_sub = p_sub.add_run("Simulador Fotovoltaico v2.0 · Diseño Satelital 3D, BESS, Monte Carlo & Tornado, Pipeline Comercial, Tablero Gerencial y Propuestas Ejecutivas")
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
        ("3. Guía Paso a Paso de las 10 Pestañas de la Plataforma", "5"),
        ("   3.1. Pestaña 📋 Datos, BOM Detallado y Chequeos Inteligentes", "5"),
        ("   3.2. Pestaña 🛰️ Techo & 3D (Diseño Satelital, Gemelo Digital y Cierre Express en 90s)", "6"),
        ("   3.3. Pestaña ⚡ Energía, Curva 24h, BESS y Pérdidas Técnicas (Sankey)", "8"),
        ("   3.4. Pestaña 📈 Resultados Económicos (Compra Directa y Flujo de Fondos)", "9"),
        ("   3.5. Pestaña 🏦 Financiamiento: Leasing ALP, Préstamos Bancarios y PPA", "10"),
        ("   3.6. Pestaña 🎯 Riesgo: Simulación Monte Carlo, Gráfico de Tornado y Matrices", "11"),
        ("   3.7. Pestaña ⚖️ Comparador Multi-Proyecto Lado a Lado", "12"),
        ("   3.8. Pestaña 📌 Pipeline Comercial, Revisiones Congeladas y Papelera", "13"),
        ("   3.9. Pestaña 📊 Tablero Gerencial, Embudo de Ventas y Alertas de Seguimiento", "14"),
        ("   3.10. Pestaña 📄 Propuesta Comercial Ejecutiva (PDF / HTML / WhatsApp / Email)", "15"),
        ("4. Base de Datos Solar y Presets de Distribuidoras Argentinas", "16"),
        ("5. Formulación Matemática y Algoritmos de Ingeniería", "17"),
        ("6. Preguntas Frecuentes y Buenas Prácticas (FAQ)", "20"),
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
        ("Diseño Satelital 3D y Cierre Express en 90s: ", "Trazado de cubiertas sobre mosaico Esri/OSM, auto-layout de hasta 8.000 módulos, gemelo digital 3D WebGL con cálculo de sombras por Ray-Casting astronómico y botón 'Aplicar al Proyecto'."),
        ("Dimensionamiento Inteligente y BOM Detallado: ", "Asistente por superficie (m²) o consumo (kWh), desglose de presupuesto por ítems (Bill of Materials) y sistema de chequeos inteligentes con semáforo de validación en tiempo real."),
        ("Balance Energético Mensual y Curva Diaria: ", "Simula la curva solar horaria de 24 horas frente al perfil de demanda del cliente, modelando almacenamiento con baterías BESS, desglose de pérdidas físicas (Sankey) y PR real."),
        ("Evaluación Financiera Multimoneda Integral: ", "Cálculo instantáneo de VAN (ARS/USD), TIR, Payback simple y descontado, LCOE y ahorro acumulado a 20-30 años con conmutador ARS/USD y exportación de flujo a Excel (CSV)."),
        ("Comparador de Financiamiento 4 Vías: ", "Evaluación comparativa de Compra Contado, Leasing ALP no bancario (con escudo fiscal en Ganancias del 30-35%), Préstamos Bancarios (Francés/Alemán/UVA con CFT) y esquemas PPA."),
        ("Análisis de Riesgo Estocástico & Sensibilidad: ", "Simulación de Monte Carlo (400 a 4.000 escenarios) con histograma de probabilidad de VAN positivo, diagrama de Tornado ('Qué variable mueve más el resultado') y matrices cruzadas de calor."),
        ("Comparador Multi-Proyecto Lado a Lado: ", "Contraste sinóptico de múltiples variantes de potencia o clientes simultáneos."),
        ("Pipeline Comercial & Revisiones Congeladas: ", "Gestión de ventas estilo Kanban (Borrador a Ganada) con ponderación probabilística, congelamiento inmutable de revisiones históricas y papelera de reciclaje."),
        ("Tablero Gerencial & Business Intelligence: ", "Métricas consolidadas de cartera en MWp y U$D, embudo de conversión, desglose por provincia y vendedor, y alertas automáticas de cotizaciones estancadas."),
        ("Propuesta Comercial Multicanal Ejecutiva: ", "Generación de cotizaciones formales con membrete y logo corporativo, ficha satelital 3D, gráficos vectoriales SVG, y exportación a PDF, HTML autónomo, WhatsApp y Email."),
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
    # SECCIÓN 3: GUÍA PASO A PASO DE LAS 10 PESTAÑAS
    # -------------------------------------------------------------
    h1 = doc.add_heading("3. Guía Paso a Paso de las 10 Pestañas de la Plataforma", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    # Pestaña 1
    doc.add_heading("3.1. Pestaña 📋 Datos, BOM Detallado y Chequeos Inteligentes", level=2)
    doc.add_paragraph(
        "Es el centro neurálgico de ingeniería y parametrización de la plataforma. Integra formularios declarativos, "
        "asistentes geométricos, desglose de costos ítem por ítem (BOM) y un auditor de reglas técnicas en tiempo real:"
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
        ("Cliente y Emplazamiento: ", "Razón social, CUIT (con validación de dígito verificador Módulo 11), ubicación y selector de ciudad argentina para autocompletar la radiación solar anual y coordenadas satelitales."),
        ("Generación Fotovoltaica: ", "Potencia kWp, costo unitario (U$D/kWp), tipo de cambio ($/USD), Performance Ratio (PR %), irradiación anual en plano y degradación anual de paneles (%/año)."),
        ("Almacenamiento con Baterías (BESS): ", "Habilitación de banco de acumulación, tecnología (Litio LFP / Gel Plomo-Ácido), capacidad en kWh, costo unitario (U$D/kWh) y profundidad de descarga máxima (DoD %). El sistema modela el ciclado diario y la autonomía en horas ante cortes de red."),
        ("Tarifa Eléctrica e Impuestos: ", "Tarifa monómica de energía ($/kWh) o desglose por bandas horarias (Pico, Resto, Valle), potencia contratada e impuestos provinciales/municipales con presets oficiales para EPE Santa Fe, Edenor/Edesur, EDEN, EPEC Córdoba, etc. Modalidad de inyección remunerada según Ley 27.424."),
        ("Parámetros Macroeconómicos: ", "Horizonte de evaluación (20 a 30 años), tasa de descuento exigida (WACC %), ajuste anual de tarifas eléctricas (inflación energética %), OPEX anual (% CAPEX) y ciclos de recambio de inversores y baterías."),
        ("Condiciones Financieras: ", "Parámetros para Leasing (canon por kWp, plazo en meses, anticipo, opción residual, seguro y deducción en Ganancias), Préstamos bancarios (Francés/Alemán/UVA y CFT) y contratos PPA."),
    ]
    for bold_text, normal_text in secciones_form:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    doc.add_heading("C. Presupuesto Detallado por Ítems (BOM - Bill of Materials):", level=3)
    doc.add_paragraph(
        "Al tildar 'Presupuesto detallado por ítems', el sistema desactiva el costo global fijo y habilita una planilla analítica "
        "de cómputo y presupuesto de obra donde cada componente se cotiza por unidad o por kWp instalado:"
    )
    bom_items = [
        ("Módulos Fotovoltaicos: ", "Cómputo automático según cantidad de paneles y potencia unitaria (U$D/panel o U$D/Wp)."),
        ("Inversores On-Grid / Híbridos: ", "Unidades de inversores centrales o microinversores, dimensionados para la potencia pico de campo."),
        ("Estructuras de Montaje: ", "Rieles de aluminio extruido, grampas intermedias/finales, triángulos fijos o anclajes a chapa grecada."),
        ("Protecciones Eléctricas DC/AC: ", "Tableros seccionadores, fusibles gPV, descargadores de sobretensión transitoria (SPD Tipo II), termomagnéticas y disyuntores diferenciales."),
        ("Cableado Solar y Conectores: ", "Cables unipolares solares de 4/6 mm² con aislación reticulada resistente a UV, conectores MC4 y canalizaciones."),
        ("Mano de Obra e Ingeniería: ", "Instalación electromecánica, izajes, puesta en marcha, ensayos y tramitación del certificado de Usuario-Generador ante la distribuidora."),
        ("Almacenamiento BESS (opcional): ", "Módulos de baterías de litio ferrofosfato (LiFePO4) o gel con rack y BMS.")
    ]
    for bold_text, normal_text in bom_items:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)
    doc.add_paragraph(
        "El presupuesto suma automáticamente los subtotales, calcula el CAPEX final del proyecto y actualiza el ratio U$D/kWp resultante."
    )

    doc.add_heading("D. Panel de Chequeos Inteligentes (Semáforo de Validación):", level=3)
    doc.add_paragraph(
        "Ubicado en la parte superior de la pestaña Datos, el panel de Chequeos Inteligentes evalúa de forma continua más de 12 reglas "
        "de consistencia técnica y normativa, alertando antes de presentar la cotización:"
    )
    chequeos_data = [
        ("🟢 Proyecto Coherente", "Todos los parámetros de potencia, módulos, relaciones DC/AC y marco fiscal se encuentran dentro de los estándares óptimos de ingeniería."),
        ("🟡 Advertencias Técnicas", "Avisa situaciones no críticas pero que requieren atención: ej. sobredimensionamiento DC/AC > 1.30 (posible recorte de potencia en horas pico), inyección sin precio asignado o sobrecarga cercana al límite de la cubierta."),
        ("🔴 Inconsistencias Críticas", "Detecta errores graves: ej. potencia contratada insuficiente para la inyección proyectada, CUIT inválido, o parámetros económicos negativos.")
    ]
    for sem, desc in chequeos_data:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(sem + ": ")
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(desc)

    doc.add_page_break()

    # Pestaña 2: Techo & 3D
    doc.add_heading("3.2. Pestaña 🛰️ Techo & 3D (Diseño Satelital y Cierre Express en 90s)", level=2)
    doc.add_paragraph(
        "Esta pestaña incorpora tecnología de vanguardia para cotizaciones inmediatas en campo (tablets) y presentaciones comerciales en videollamada. "
        "Permite realizar en solo 90 segundos lo que tradicionalmente demandaba visitas técnicas previas y software CAD complejo, "
        "integrando cuatro pilares tecnológicos:"
    )

    t_pilares = doc.add_table(rows=5, cols=2)
    t_pilares.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_pilares.cell(0, 0).text = "Pilar Tecnológico"
    t_pilares.cell(0, 1).text = "Implementación en ALP GROUP Simulador FV"
    format_row(t_pilares.rows[0], "009FE3", RGBColor(255, 255, 255), is_bold=True, font_size=9.5)

    pilares_data = [
        ("1. Visión y Detección de Techos", "Mosaico satelital de alta resolución (Esri World Imagery) y geocodificación de calles/parques industriales (OSM Nominatim). Herramienta de polígono interactivo para delimitar cubiertas, cálculo automático de azimut óptimo y gestor interactivo de obstáculos (Árboles, Chimeneas, Climatizadores HVAC, Domos/Tragaluces y Antenas) con radios y alturas configurables."),
        ("2. Auto-Layout Inteligente y Tipos de Cubierta", "Algoritmo de empaquetado reticular que calcula la cantidad máxima de módulos (paneles de 575 Wp monocristalinos), potencia pico kWp instalable y factor de ocupación respetando pasillos perimetrales. Soporta cubiertas a Dos Aguas (cumbrera central), Un Agua (monopendiente) y Losa Plana (con muro parapeto perimetral y caballetes de aluminio elevados con espaciado anti-sombras calculado para el solsticio de invierno)."),
        ("3. Gemelo 3D, Cámaras y Sombras por Trazado de Rayos", "Motor gráfico WebGL interactivo (Three.js) con presets de cámara instantáneos (🛰️ Planta Cenital, 📐 Isométrica 45°, 🌅 Frontal/Rasante y 🔄 Reset). Posicionamiento astronómico del sol (Duffie & Beckman) con slider de hora (06:00 a 19:00 hs) y mes. Incorpora simulación de sombras por Ray-Casting en tiempo real: los módulos bajo sombra se oscurecen dinámicamente en 3D y se calcula el porcentaje de atenuación actual y la pérdida anual estimada (% derate)."),
        ("4. Conexión Climática & Cierre 90s", "Conexión a la API satelital de NASA POWER para radiación histórica y comparador financiero express: Ahorro mensual en factura eléctrica vs. Cuota del leasing no bancario de ALP Group, con cálculo de flujo neto, envío directo a WhatsApp, descarga de render 3D y volcador integral al proyecto (incluyendo pérdidas por sombras calculadas).")
    ]
    for i, (k, v) in enumerate(pilares_data):
        t_pilares.cell(i+1, 0).text = k
        t_pilares.cell(i+1, 1).text = v
        format_row(t_pilares.rows[i+1], "F8FAFC" if i % 2 == 0 else "FFFFFF", RGBColor(51, 65, 85), is_bold=False, font_size=9)
        t_pilares.rows[i+1].cells[0].paragraphs[0].runs[0].bold = True

    t_pilares.columns[0].width = Inches(2.2)
    t_pilares.columns[1].width = Inches(4.3)

    doc.add_heading("Guía Operativa Paso a Paso para el Asesor Comercial:", level=3)
    pasos_techo = [
        ("1. Búsqueda y Localización Satelital: ", "Ingresá el parque industrial, ciudad o dirección en el buscador (ej: 'Parque Industrial Hudson, Berazategui') o presioná '📍 Mi GPS' para volar directamente a la planta."),
        ("2. Delimitación de la Cubierta: ", "Podés optar por dos métodos instantáneos:\n"
         "  • Método A (Trazado Manual): Hacé clic en '✏️ Trazar Techo', marcá con un solo clic cada una de las 4 esquinas del galpón sobre la foto satelital, y finalizá presionando el botón verde '✅ Listo / Cerrar Techo' (o clic en el punto verde #1 / doble clic).\n"
         "  • Método B (Plantilla 90s): Centrá la fábrica en pantalla y presioná '🏭 Nave 1.200 m²', '🏢 Comercial 450 m²' o '🏬 Losa Plana 300 m²' para estampar la nave de inmediato."),
        ("3. Optimización de Paneles y Orientación (Azimut): ", "En el panel lateral podés seleccionar la potencia del módulo (575 Wp Topcon, 600 Wp o 550 Wp), orientación Vertical u Horizontal y rotar el Azimut para que las filas sigan la cumbrera del techo. Al pulsar '⚡ Auto-Optimizar Disposición de Paneles', el sistema recalcula la retícula en milisegundos con capacidad para mega-naves logísticas de hasta 8.000 módulos (14.000+ m²)."),
        ("4. Detección de Obstáculos y Sombras 3D: ", "Presioná '🚫 Añadir Obstáculo' para marcar chimeneas, climatizadores HVAC, tragaluces o árboles linderos. El sistema excluirá los paneles en la zona de interferencia y el motor astronómico (Three.js) calculará la sombra solar arrojada a lo largo del año, deduciendo el porcentaje de pérdida anual (% derate)."),
        ("5. Transferencia al Proyecto y Cierre Comercial: ", "Revisá el resumen financiero express (ahorro mensual vs. cuota de leasing). Al presionar '⚡ Aplicar al Proyecto', la potencia (kWp), cantidad de paneles, azimut, inclinación y factor de sombras se transfieren en tiempo real a todas las pestañas de ingeniería y finanzas del simulador.")
    ]
    for bold_text, normal_text in pasos_techo:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    create_callout_box(
        doc,
        "Al presionar el botón '⚡ Aplicar al Proyecto', el sistema vuelca inmediatamente la potencia pico (kWp), "
        "cantidad de paneles, azimut, inclinación, superficie de cubierta y el factor de atenuación por sombras 3D calculado a todas las demás pestañas, "
        "recalculando el flujo de caja en el acto. El botón '💬 WhatsApp' abre un mensaje con el resumen y pitch comercial redactado para enviar al cliente durante la reunión, "
        "y el botón '📸 Foto 3D' descarga una captura fotorrealista en alta resolución del gemelo digital.",
        title="CIERRE COMERCIAL EN EL ACTO (90 SEGUNDOS)"
    )

    doc.add_page_break()

    # Pestaña 3
    doc.add_heading("3.3. Pestaña ⚡ Energía, CO₂ y Desglose de Pérdidas Técnicas", level=2)
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

    # Pestaña 4
    doc.add_heading("3.4. Pestaña 📈 Resultados Económicos (Compra Directa)", level=2)
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

    # Pestaña 5
    doc.add_heading("3.5. Pestaña 🏦 Financiamiento: Comparador 4 Vías (Contado, Leasing ALP, Préstamos y PPA)", level=2)
    doc.add_paragraph(
        "Permite contrastar de manera simultánea cuatro modalidades de financiamiento e inversión para proyectos solares corporativos, "
        "todas expresadas en dólares constantes con ahorros proyectados y descontadas a la tasa WACC:"
    )
    
    t_fin_comp = doc.add_table(rows=5, cols=3)
    t_fin_comp.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_fin_comp.cell(0, 0).text = "Modalidad"
    t_fin_comp.cell(0, 1).text = "Esquema de Desembolso y Propiedad"
    t_fin_comp.cell(0, 2).text = "Beneficio Clave y Ventaja Fiscal"
    format_row(t_fin_comp.rows[0], "009FE3", RGBColor(255, 255, 255), is_bold=True, font_size=9.5)
    
    fin_comp_data = [
        ("1. Compra al Contado (Llave en mano)", "100% de desembolso inicial (CAPEX). El cliente es dueño del activo desde el día 1.", "Mayor ahorro monetario acumulado y máximo VAN a 25-30 años."),
        ("2. Leasing ALP (No bancario)", "Desembolso inicial reducido (anticipo). Cuotas mensuales fijas por kWp con seguro y O&M incluidos. Opción de compra final.", "100% de la cuota deducible del Impuesto a las Ganancias (alícuota 30-35%). No compromete márgenes crediticios bancarios."),
        ("3. Préstamo Bancario Tradicional", "Financiamiento del 70% al 100% del CAPEX. Sistemas Francés, Alemán o UVA en pesos/dólares con cálculo de CFT.", "El cliente conserva capital de trabajo. Amortización del bien e intereses de deuda son deducibles impositivamente."),
        ("4. Contrato PPA (Power Purchase)", "Desembolso inicial U$D 0. El cliente compra los kWh solares a una tarifa pactada inferior a la de red.", "Ahorro operativo desde el primer mes sin asumir riesgos de operación ni deuda financiera.")
    ]
    for i, fila in enumerate(fin_comp_data):
        for j, val in enumerate(fila):
            t_fin_comp.cell(i+1, j).text = val
        format_row(t_fin_comp.rows[i+1], "F8FAFC" if i % 2 == 0 else "FFFFFF", RGBColor(51, 65, 85), is_bold=False, font_size=9)
        t_fin_comp.rows[i+1].cells[0].paragraphs[0].runs[0].bold = True
    
    t_fin_comp.columns[0].width = Inches(1.8)
    t_fin_comp.columns[1].width = Inches(2.7)
    t_fin_comp.columns[2].width = Inches(2.5)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    doc.add_heading("Detalle Operativo del Leasing ALP:", level=3)
    bullets_s4 = [
        ("Flujo Neto Mensual: ", "Compara mes a mes el ahorro en factura eléctrica vs. la cuota integral del leasing (canon + seguro + mantenimiento). Si el ahorro supera la cuota, el proyecto tiene flujo de caja positivo inmediato."),
        ("Escudo Fiscal en Ganancias: ", "Calcula el crédito fiscal neto generado al computar el gasto de cánones, seguro y mantenimiento como gasto operativo directo en el balance impositivo."),
        ("Conmutador de Moneda: ", "Permite evaluar el detalle del leasing en USD (U$D) o en ARS ($) al tipo de cambio proyectado."),
        ("Gráfico Acumulado Contado vs. Leasing: ", "Curva acumulada que muestra el cruce de ambos esquemas y el costo de oportunidad del capital."),
    ]
    for bold_text, normal_text in bullets_s4:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    # Pestaña 6
    doc.add_heading("3.6. Pestaña 🎯 Riesgo: Simulación Monte Carlo, Gráfico de Tornado y Matrices", level=2)
    doc.add_paragraph(
        "Evalúa la solidez y volatilidad del proyecto frente al contexto macroeconómico argentino a través de tres herramientas analíticas complementarias:"
    )

    doc.add_heading("A. Simulación Estocástica de Monte Carlo:", level=3)
    doc.add_paragraph(
        "A diferencia de los modelos estáticos que muestran un único valor de VAN, la simulación de Monte Carlo ejecuta miles de sorteos probabilísticos "
        "modificando simultáneamente seis factores inciertos (irradiación solar ±4%, tarifa eléctrica ±10%, CAPEX ±8%, actualización tarifaria ±5 p.p., devaluación ±5 p.p. y degradación de paneles) "
        "mediante distribuciones gaussianas con el método polar de Box-Muller y semilla reproducible."
    )
    bullets_mc = [
        ("Selector de Escenarios: ", "Permite elegir entre 400 (rápido para tablets), 1.000 (estándar recomendado) y 4.000 escenarios (alta precisión para directorios)."),
        ("Probabilidad de Éxito P(VAN > 0): ", "Porcentaje exacto de escenarios donde el proyecto resulta económicamente rentable. Un valor > 90% indica robustez extrema."),
        ("Percentiles P10, P50 y P90: ", "P10 representa el escenario pesimista (90% de probabilidad de superarlo), P50 la mediana esperada y P90 el escenario optimista."),
        ("Histograma de Frecuencia de VAN: ", "Gráfico de barras que representa la distribución del VAN con línea divisoria roja en U$D 0."),
    ]
    for bold_text, normal_text in bullets_mc:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    doc.add_heading("B. Gráfico de Tornado ('Qué variable mueve más el resultado'):", level=3)
    doc.add_paragraph(
        "Aísla cada variable moviéndola ±1.5 desvíos estándar (±1.5σ) mientras mantiene las demás en su valor base. "
        "Ordena las variables de mayor a menor amplitud de VAN, indicando a la dirección qué parámetros deben negociarse prioritariamente "
        "(generalmente actualización tarifaria y tipo de cambio en el mercado local)."
    )

    doc.add_heading("C. Matrices de Sensibilidad Cruzada (Mapas de Calor):", level=3)
    doc.add_paragraph(
        "• Matriz 1 (Tarifa vs. CAPEX): Cruza variaciones de -20% a +20% en la tarifa con variaciones de -15% a +15% en el costo de instalación (U$D/kWp).\n"
        "• Matriz 2 (Inflación Tarifaria vs. Tasa de Descuento): Cruza tasas de descuento del 6% al 15% con distintos ritmos de ajuste tarifario anual."
    )

    doc.add_page_break()

    # Pestaña 7
    doc.add_heading("3.7. Pestaña ⚖️ Comparador Multi-Proyecto Lado a Lado", level=2)
    doc.add_paragraph(
        "Permite seleccionar varios proyectos o variantes de potencia guardadas (ej: 30 kWp sin baterías vs. 30 kWp con BESS vs. 60 kWp para venta a red) "
        "y compararlos en una sola tabla sinóptica evaluando CAPEX, generación anual, cobertura de demanda, VAN, TIR, Payback simple y descontado, LCOE y cuota de leasing."
    )

    # Pestaña 8
    doc.add_heading("3.8. Pestaña 📌 Pipeline Comercial, Revisiones Congeladas y Papelera", level=2)
    doc.add_paragraph(
        "Proporciona un entorno de gestión comercial especializado para hacer seguimiento de las cotizaciones a lo largo de su ciclo de vida:"
    )
    bullets_pipe = [
        ("Tablero Kanban Interactivo: ", "Organiza los proyectos en 5 columnas visuales: Borrador (10% de probabilidad), Enviada (30%), En negociación (60%), Ganada (100%) y Perdida (0%)."),
        ("Ponderación Automática de Cartera: ", "Calcula el valor esperado del pipeline multiplicando el CAPEX por la probabilidad asignada a la etapa."),
        ("Función '📎 Congelar Revisión': ", "Permite generar una copia inmutable del proyecto (Rev. 0, Rev. 1, etc.) en el momento de entregar la cotización al cliente. Si más adelante se modifican parámetros tarifarios o técnicos en el proyecto activo, las revisiones congeladas permanecen intactas para consulta y trazabilidad histórica."),
        ("Historial de Revisiones: ", "Tabla con fecha, autor, potencia, CAPEX y VAN de cada versión entregada al cliente."),
        ("Papelera de Reciclaje ('🗑 Papelera'): ", "Resguarda proyectos eliminados accidentalmente, con opción de recuperación inmediata."),
    ]
    for bold_text, normal_text in bullets_pipe:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    # Pestaña 9
    doc.add_heading("3.9. Pestaña 📊 Tablero Gerencial, Embudo de Ventas y Alertas de Seguimiento", level=2)
    doc.add_paragraph(
        "Diseñado para gerentes de ventas y directores de proyectos, consolida la información de todos los proyectos activos en un panel de Business Intelligence:"
    )
    bullets_tablero = [
        ("Tarjetas de KPIs Consolidados: ", "Potencia total cotizada (MWp), Monto total de cartera en U$D, Pipeline ponderado según probabilidades y Tasa de conversión (Win Rate % de proyectos ganados sobre presentados)."),
        ("Gráfico de Potencia Cotizada por Mes: ", "Histograma temporal que revela el ritmo de generación de presupuestos y la estacionalidad del negocio."),
        ("Gráfico de Embudo Comercial (Funnel): ", "Visualización de la tasa de retención entre etapas (Borrador → Enviada → Negociación → Cierre)."),
        ("Desglose Geográfico por Provincia: ", "Tabla con la distribución de potencia y clientes en Santa Fe, Buenos Aires, Córdoba, CABA, etc."),
        ("Rendimiento por Asesor Comercial: ", "Ranking de proyectos y volumen cotizado por cada vendedor del equipo."),
        ("Módulo de Alertas ('Necesitan Atención'): ", "Algoritmo proactivo que detecta automáticamente propuestas enviadas con más de 15 días sin respuesta o negociaciones estancadas con más de 30 días sin avance, sugiriendo acciones de seguimiento comercial."),
    ]
    for bold_text, normal_text in bullets_tablero:
        p = doc.add_paragraph(style='List Bullet')
        r_b = p.add_run(bold_text)
        r_b.bold = True
        r_b.font.color.rgb = RGBColor(0, 159, 227)
        p.add_run(normal_text)

    # Pestaña 10
    doc.add_heading("3.10. Pestaña 📄 Propuesta Comercial Ejecutiva (PDF / HTML / WhatsApp / Email)", level=2)
    doc.add_paragraph(
        "Genera una cotización formal ejecutiva de alto impacto estético, lista para su presentación o envío a clientes corporativos:"
    )
    bullets_s7 = [
        ("Membrete y Branding Oficial: ", "Logotipo corporativo de ALP GROUP o de la empresa partner, datos fiscales, asesor responsable y plazo de validez de la oferta en días."),
        ("Ficha Técnica del Cliente & Emplazamiento: ", "Razón social, CUIT, ciudad, tipo de instalación y especificaciones de módulos, potencia pico y baterías BESS."),
        ("Ficha Satelital 3D & Métricas de Cubierta: ", "Incorpora la captura fotorrealista del gemelo digital 3D obtenida en la pestaña Techo 3D ('📸 Foto 3D'), superficie útil de techo (m²), azimut, inclinación y factor de ocupación."),
        ("Gráficos Vectoriales SVG Integrados: ", "Gráfico de barras de balance energético mensual y gráfico de curva de retorno financiero acumulado con el punto de Payback señalado."),
        ("Comparativa Económica de Doble Opción: ", "Resumen lado a lado de Compra Directa (Llave en mano) vs. Financiamiento por Leasing ALP."),
        ("Insignia de Certificación Ambiental ESG: ", "Distintivo ecológico destacando el aporte a la descarbonización, CO₂ evitado y árboles equivalentes."),
        ("Bloque de Firmas Formales: ", "Líneas de firma para el responsable técnico de ALP GROUP y conformidad del cliente."),
        ("Exportación Multicanal en 1 Clic: ", "Botón '🖨 Imprimir / Guardar en PDF' (formato A4 sin menús), botón '⬇ Descargar HTML' (archivo autónomo portable), botón '💬 WhatsApp' (abre chat con mensaje estructurado y métricas) y botón '✉ Email' (abre correo preformateado)."),
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
    # SECCIÓN 5: FORMULACIÓN MATEMÁTICA, MODELOS FÍSICOS Y ALGORITMOS DE INGENIERÍA
    # -------------------------------------------------------------
    h1 = doc.add_heading("5. Formulación Matemática, Modelos Físicos y Algoritmos de Ingeniería", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    doc.add_paragraph(
        "Esta sección documenta de manera exhaustiva el fundamento teórico, las leyes físicas, las normas internacionales "
        "y los modelos matemáticos y financieros implementados en el motor de cálculo (calc.js) del Simulador Fotovoltaico de ALP GROUP."
    )

    # 5.1. Generación Solar
    doc.add_heading("5.1. Modelo Físico de Radiación Solar y Generación Fotovoltaica", level=2)
    doc.add_paragraph(
        "La estimación de producción eléctrica anual y mensual se calcula a partir de la potencia pico instalada (kWp), "
        "la irradiación global horizontal/inclinada anual del sitio (kWh/m²/año) y el Performance Ratio (PR) del sistema:"
    )
    
    box_gen = (
        "1. Generación Eléctrica Anual Año 1 (kWh/año):\n"
        "   E_anual = P_kWp × H_anual × (PR / 100)\n\n"
        "2. Rendimiento Específico / Yield del Sistema (kWh/kWp/año):\n"
        "   Y_f = E_anual / P_kWp = H_anual × (PR / 100)\n\n"
        "3. Distribución Estacional Mensual (kWh/mes):\n"
        "   E_gen,m = E_anual × f_m   (para m = 1, 2, ..., 12)\n\n"
        "   Donde f_m es el vector de coeficientes normalizados para el Hemisferio Sur (Centro/Norte de Argentina):\n"
        "   f = [Ene: 0.1094, Feb: 0.0979, Mar: 0.0891, Abr: 0.0736, May: 0.0591, Jun: 0.0502,\n"
        "        Jul: 0.0532, Ago: 0.0676, Sep: 0.0835, Oct: 0.0986, Nov: 0.1065, Dic: 0.1113]  (∑ f_m = 1.0000)"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_gen)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # 5.2. Pérdidas y PR
    doc.add_heading("5.2. Modelo Físico de Pérdidas Técnicas y Performance Ratio (PR)", level=2)
    doc.add_paragraph(
        "El Performance Ratio (PR) evalúa la calidad global de la instalación descontando las atenuaciones energéticas en cascada:"
    )
    
    t_loss = doc.add_table(rows=8, cols=3)
    t_loss.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_loss.cell(0, 0).text = "Etapa / Factor de Pérdida"
    t_loss.cell(0, 1).text = "Coeficiente (%)"
    t_loss.cell(0, 2).text = "Fundamento Físico y Normativo"
    format_row(t_loss.rows[0], "009FE3", RGBColor(255, 255, 255), is_bold=True, font_size=9.5)
    
    loss_data = [
        ("Temperatura de Celdas (P_temp)", "4.2% - 6.2%", "Coeficiente térmico de potencia γ_Pmp (~ -0.35%/°C) sobre 25°C STC. Varia según ventilación (Chapa: 6.2%, Losa: 4.9%, Suelo: 4.2%)."),
        ("Suciedad Superficial (Soiling)", "3.0%", "Atenuación óptica por deposición de polvo, polvillo agrícola y hollín ambiental sobre el vidrio frontal."),
        ("Mismatch / Tolerancia Fabril", "1.5%", "Dispersión de parámetros I-V entre módulos conectados en serie y curvas de máxima potencia (MPPT)."),
        ("Cableado Continuo DC (Joule)", "1.2%", "Pérdidas resistivas I²R en conductores solares de 4/6 mm² desde strings hasta inversores."),
        ("Eficiencia del Inversor (η_inv)", "2.1%", "Rendimiento ponderado de conversión DC a AC trifásica/monofásica (eficiencia típica 97.9%)."),
        ("Cableado Alterno AC (Joule)", "0.8%", "Caída óhmica de tensión entre bornes de salida del inversor y el tablero general de baja tensión."),
        ("Performance Ratio Resultante", "83.0% - 86.0%", "PR = ∏ (1 - Pérdida_i). Rendimiento neto global del generador solar entregado a la red.")
    ]
    for i, (k, v, desc) in enumerate(loss_data):
        t_loss.cell(i+1, 0).text = k
        t_loss.cell(i+1, 1).text = v
        t_loss.cell(i+1, 2).text = desc
        bg = "E0F2FE" if i == 6 else ("F8FAFC" if i % 2 == 0 else "FFFFFF")
        format_row(t_loss.rows[i+1], bg, RGBColor(2, 132, 199) if i == 6 else RGBColor(51, 65, 85), is_bold=(i==6), font_size=8.5)
    
    t_loss.columns[0].width = Inches(2.2)
    t_loss.columns[1].width = Inches(1.2)
    t_loss.columns[2].width = Inches(3.1)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

    # 5.3. Balance Energético
    doc.add_heading("5.3. Modelo de Balance Energético y Autoconsumo", level=2)
    doc.add_paragraph(
        "El autoconsumo solo existe cuando la generación y la demanda coinciden en el mismo instante. "
        "Por eso el motor no compara totales mensuales: resuelve el balance hora por hora para los doce meses "
        "(12 × 24 = 288 pasos de cálculo) y recién después agrega los resultados a valores mensuales y anuales. "
        "Para cada mes m se reparte la energía del mes entre las 24 horas de un día tipo y se despacha ese día:"
    )

    box_balance = (
        "1. Reparto horario de la energía del mes (kWh/h):\n"
        "   E_gen,m,h = (E_gen,m / d_m) × f_solar,m,h\n"
        "   E_con,m,h = (E_con,m / d_m) × f_dem,h\n"
        "   d_m = días del mes; f_solar y f_dem suman 1 en las 24 horas.\n\n"
        "2. Autoconsumo Solar Directo Horario (kWh/h):\n"
        "   E_auto_dir,m,h = min( E_gen,m,h , E_con,m,h )\n\n"
        "3. Excedente y déficit brutos antes de la batería (kWh/h):\n"
        "   E_exc_bruto,m,h = E_gen,m,h - E_auto_dir,m,h\n"
        "   E_red_bruto,m,h = E_con,m,h - E_auto_dir,m,h\n\n"
        "4. Agregación mensual (kWh/mes), ya con el aporte del banco:\n"
        "   E_auto,m = d_m × ∑_h ( E_auto_dir,m,h + Bat_descarga,m,h )\n"
        "   E_exc,m  = d_m × ∑_h E_exc_final,m,h\n"
        "   E_red,m  = d_m × ∑_h E_red_final,m,h\n\n"
        "5. Grado de Cobertura Solar de la Demanda (%):\n"
        "   Cobertura (%) = [ ∑ E_auto,m / ∑ E_con,m ] × 100\n\n"
        "6. Tasa de Aprovechamiento del Generador Solar (%):\n"
        "   Aprovechamiento (%) = [ ∑ E_auto,m / ∑ E_gen,m ] × 100\n\n"
        "El balance conserva la energía en todos los casos:\n"
        "   E_auto,m + E_exc,m = E_gen,m        E_auto,m + E_red,m = E_con,m"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_balance)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    doc.add_paragraph(
        "Compatibilidad con propuestas anteriores: el campo «Modelo de autoconsumo» permite volver al criterio mensual "
        "E_auto,m = min(E_gen,m , E_con,m) que utilizaban las versiones previas del simulador. Ese modo supone que toda "
        "la energía del mediodía encuentra demanda simultánea, sobreestima el ahorro y no simula el ciclado de las "
        "baterías, por lo que solo debe usarse para reproducir una cotización ya entregada al cliente."
    )

    box_balance = (
        "Criterio mensual (versión anterior, solo para reproducir cotizaciones ya emitidas):\n"
        "   E_auto,m = min( E_gen,m , E_con,m )\n"
        "   E_exc,m  = max( E_gen,m - E_con,m , 0 )\n"
        "   E_red,m  = max( E_con,m - E_gen,m , 0 )"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_balance)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # 5.4. Curva de 24 Horas y Baterías BESS
    doc.add_heading("5.4. Geometría Solar Horaria y Almacenamiento con Baterías (BESS)", level=2)
    doc.add_paragraph(
        "La forma de la campana solar no se asume: se deduce de la posición del sol en el emplazamiento. "
        "El motor toma la latitud y la longitud de la localidad elegida, calcula la declinación solar del día "
        "representativo de cada mes y reparte la energía según el coseno del ángulo cenital. De ahí surgen, sin "
        "parámetros adicionales, los días largos de verano, los días cortos de invierno y el corrimiento del "
        "mediodía solar respecto del reloj (huso UTC-3), que en el centro del país cae cerca de las 13:00 hs."
    )

    box_bess = (
        "1. Declinación Solar del día representativo n del mes (grados):\n"
        "   δ = 23.45 × sen( 360° × (284 + n) / 365 )\n"
        "   n = 17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344 (días tipo de Klein)\n\n"
        "2. Ángulo Horario corregido por el huso horario (grados):\n"
        "   ω_h = 15° × ( h + 0.5 - 12 - Δt )        Δt = (λ_ref - λ_local) / 15    ,  λ_ref = -45° (UTC-3)\n\n"
        "3. Coseno del Ángulo Cenital y fracción horaria de generación:\n"
        "   cos θ_z,h = sen(φ) · sen(δ) + cos(φ) · cos(δ) · cos(ω_h)        φ = latitud del sitio\n"
        "   f_solar,m,h = max( cos θ_z,h , 0 ) / ∑_h max( cos θ_z,h , 0 )    → ∑_h f_solar,m,h = 1\n\n"
        "4. Capacidad Útil del Banco de Baterías (kWh):\n"
        "   C_util = C_nominal × (DoD% / 100)    (Litio LFP: DoD 80-90%, Gel: DoD 50%)\n\n"
        "5. Límite de Potencia de Carga/Descarga (kW):\n"
        "   P_bat,max = C_nominal × C_rate        (C_rate típico 0.5)\n\n"
        "6. Rendimiento repartido entre carga y descarga:\n"
        "   η_c = η_d = √(η_ida_y_vuelta)          (Litio LFP: 92%, Gel: 82%)\n\n"
        "7. Dinámica de Carga con Excedente Solar:\n"
        "   Bat_carga,h = min( E_exc_bruto,h , P_bat,max , (C_util - SoC_h) / η_c )\n"
        "   SoC_h+1 = SoC_h + Bat_carga,h × η_c\n\n"
        "8. Dinámica de Descarga cuando falta generación:\n"
        "   Bat_descarga,h = min( E_red_bruto,h , P_bat,max , SoC_h × η_d )\n"
        "   SoC_h+1 = SoC_h - Bat_descarga,h / η_d\n\n"
        "9. Autoconsumo Total Integrado con Baterías:\n"
        "   E_auto_total,h = E_auto_directo,h + Bat_descarga,h\n\n"
        "10. Autonomía del Sistema de Respaldo (Horas):\n"
        "   Autonomia = C_util / (E_con_anual / 8760 h)"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_bess)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    doc.add_paragraph(
        "El día tipo de cada mes se simula tres veces encadenando el estado de carga final con el inicial, de modo que "
        "el banco arranca el cálculo en su régimen estacionario y no en un estado artificialmente vacío. El aporte de "
        "las baterías se valoriza como energía que deja de comprarse a la red en lugar de verterse como excedente: "
        "Ahorro_bateria = E_bat,anual × (Tarifa_con_impuestos - Tarifa_inyección). El banco también incorpora su propio "
        "recambio en el flujo de fondos, cada «Vida útil del banco» años y por un porcentaje configurable de su costo."
    )

    box_bess = (
        "Perfiles horarios de demanda utilizados (fracciones normalizadas a suma 1):\n"
        "   Residencial : picos de mañana y, sobre todo, de 18:00 a 22:00 hs\n"
        "   Comercial   : meseta diurna de 09:00 a 18:00 hs\n"
        "   Industrial  : curva casi plana, con leve realce en los turnos diurnos"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_bess)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # 5.5. Algoritmos de Dimensionamiento
    doc.add_heading("5.5. Algoritmos de Dimensionamiento Automatizado", level=2)
    doc.add_paragraph(
        "El asistente de dimensionamiento implementa dos algoritmos matemáticos determinísticos:"
    )
    
    box_dim = (
        "A. ALGORITMO POR SUPERFICIE DE CUBIERTA DISPONIBLE:\n"
        "   1. Superficie útil efectiva:    A_util = A_techo × f_cubierta\n"
        "      (f_cubierta: Chapa coplanar = 0.75, Losa plana = 0.55, Teja = 0.65, Suelo = 0.50)\n"
        "   2. Módulos fotovoltaicos:       N_paneles = ⌊ A_util / 2.58 m² ⌋   (Panel tipo 575 Wp)\n"
        "   3. Potencia pico instalable:    P_kWp = (N_paneles × 575 Wp) / 1000\n"
        "   4. Sobrecarga estática total:   W_total = N_paneles × 28.5 kg + A_util × (w_cubierta - 11 kg/m²)\n\n"
        "B. ALGORITMO POR OBJETIVO DE COBERTURA ENERGÉTICA (%):\n"
        "   1. Energía objetivo anual:      E_obj = E_con_anual × (Cobertura% / 100)\n"
        "   2. Rendimiento específico sitio: Yield = H_anual × (PR / 100)\n"
        "   3. Potencia pico requerida:     P_kWp_req = E_obj / Yield\n"
        "   4. Cantidad entera de paneles:  N_paneles = ⌈ (P_kWp_req × 1000) / P_panel ⌉\n"
        "   5. Superficie de techo mínima:  A_min = (N_paneles × 2.58 m²) / f_cubierta"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_dim)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # 5.6. Modelo Tarifario y Ahorro
    doc.add_heading("5.6. Modelo Tarifario: Bandas Horarias, IVA y Potencia Contratada", level=2)
    doc.add_paragraph(
        "Una factura eléctrica argentina no es un único precio por kWh. Tiene energía en bandas horarias, cargo por "
        "potencia contratada, cargo fijo y un IVA que, según la condición del cliente, es costo o es crédito fiscal. "
        "El simulador valoriza cada kWh autoconsumido al precio de la banda en la que efectivamente se produjo."
    )

    box_bandas = (
        "1. Bandas horarias (resolución de la Secretaría de Energía):\n"
        "   Pico   18:00 a 23:00      Valle  23:00 a 05:00      Resto  el horario restante\n"
        "   Los límites son configurables por proyecto.\n\n"
        "2. Precio final de la hora h ($/kWh):\n"
        "   Precio_h = Tarifa_banda(h) × (1 + Σ Impuestos% / 100) × (1 + IVA_aplicable% / 100)\n\n"
        "3. IVA según la condición del cliente:\n"
        "   Consumidor final o monotributista → IVA_aplicable = IVA        (es un costo)\n"
        "   Responsable inscripto            → IVA_aplicable = 0          (es crédito fiscal)\n"
        "   Computar el IVA para un responsable inscripto sobreestima el ahorro un 21 %.\n\n"
        "4. Ahorro por energía del mes m ($):\n"
        "   Ahorro_m = d_m × Σ_h [ E_auto,m,h × Precio_h + E_exc,m,h × Tarifa_inyección ]\n\n"
        "5. Ahorro por potencia contratada ($/año), solo si el cliente renegocia el contrato:\n"
        "   ΔP_m = max( P_punta_sin_solar,m - P_punta_con_solar,m , 0 )\n"
        "   Ahorro_potencia = Σ_m ΔP_m × Cargo_potencia\n"
        "   Por defecto no se computa: la punta de demanda suele caer fuera del horario solar y bajar\n"
        "   la potencia facturada exige renegociar con la distribuidora.\n\n"
        "6. Factura anual estimada, para mostrar el antes y el después:\n"
        "   Factura = E_consumo × Tarifa_plena + Cargo_fijo × 12 + P_contratada × Cargo_potencia × 12"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_bandas)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    doc.add_paragraph(
        "Conviene tener presente que el sol produce en la banda resto y prácticamente nada en la de pico. Una tarifa "
        "con pico caro mejora poco el ahorro solar, salvo que haya baterías que desplacen energía al horario nocturno."
    )

    doc.add_heading("5.6.1. Impuestos Eléctricos por Distribuidora", level=3)
    doc.add_paragraph(
        "El ahorro monetario del cliente se calcula valorizando el autoconsumo a la tarifa completa con impuestos:"
    )
    
    box_tarifa = (
        "1. Tarifa Plena con Impuestos ($/kWh):\n"
        "   T_full = T_base × [ 1 + ( ∑ Impuestos% ) / 100 ]\n\n"
        "2. Ahorro Económico del Año 1 ($/año):\n"
        "   Ahorro_1 = ∑ [ E_auto,m × T_full + E_exc,m × T_inyeccion ]   (para m = 1..12)\n\n"
        "3. Ahorro Anual Año 1 en Dólares (USD/año):\n"
        "   Ahorro_1_USD = Ahorro_1 / Tipo_de_Cambio"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_tarifa)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # 5.7. Modelo Financiero de Compra Directa
    doc.add_heading("5.7. Marco Monetario: Moneda de Análisis, Devaluación y Tasas Equivalentes", level=2)
    doc.add_paragraph(
        "El ahorro nace en pesos y la inversión se cotiza en dólares, así que el análisis solo cierra si las dos monedas "
        "se tratan de forma consistente. El simulador proyecta un tipo de cambio año a año a partir de la devaluación "
        "esperada y vincula las dos tasas de descuento con la relación de Fisher. El usuario carga la tasa en la moneda "
        "en la que decide analizar el proyecto y la otra se deriva sola, de modo que el VAN es el mismo número medido "
        "en cualquiera de las dos monedas."
    )

    box_moneda = (
        "1. Tipo de Cambio Proyectado al año t ($/U$D):\n"
        "   TC_t = TC_0 × (1 + dev)^t                      dev: devaluación anual esperada\n\n"
        "2. Tasas Equivalentes (relación de Fisher):\n"
        "   (1 + r_pesos) = (1 + r_dolares) × (1 + dev)\n"
        "   Se carga la tasa de la moneda de análisis y la otra se despeja de esta identidad.\n\n"
        "3. Variación Real de la Tarifa medida en Dólares (%/año):\n"
        "   inf_USD = [ (1 + inf_ARS) / (1 + dev) ] - 1\n"
        "   Ejemplo: una tarifa que sube 20 % anual en pesos con 15 % de devaluación sube 4,35 % en dólares.\n\n"
        "4. Equivalencia del VAN entre monedas (se demuestra sustituyendo 1 y 2):\n"
        "   VAN_USD = ∑ [ Flujo_t / ( TC_t × (1 + r_dolares)^t ) ] = VAN_ARS / TC_0\n\n"
        "5. Equivalencia de la TIR:\n"
        "   (1 + TIR_pesos) = (1 + TIR_dolares) × (1 + dev)"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_moneda)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    doc.add_paragraph(
        "Con devaluación cero el ahorro crece en dólares al mismo ritmo que en pesos, lo que a veinte o treinta años "
        "multiplica la tarifa en moneda dura de forma poco creíble. La app avisa en pantalla cuando se combina un "
        "aumento tarifario alto con devaluación nula."
    )

    # 5.8. Régimen fiscal
    doc.add_heading("5.8. Tratamiento de Ganancias y Comparación Simétrica", level=2)
    doc.add_paragraph(
        "Para un cliente que tributa Ganancias, el ahorro de energía reduce un gasto deducible y por lo tanto aumenta "
        "la base imponible. Si ese efecto se ignora en la compra pero se reconoce el escudo del leasing, la comparación "
        "queda sesgada a favor del leasing. El simulador ofrece tres regímenes y el simétrico es el único que compara "
        "peras con peras."
    )

    box_fiscal = (
        "Régimen SIMÉTRICO (recomendado para Responsable Inscripto):\n"
        "   • El ahorro tributa:            Flujo_t = (Ahorro_t - OPEX_t - Recambio_t) × (1 - g)\n"
        "   • La compra amortiza el equipo: Amort_t = CAPEX_ARS / N_amort        para t ≤ N_amort\n"
        "     Escudo_amort,t = Amort_t × g        →   ∑ Escudo_amort = CAPEX_ARS × g\n"
        "   • El leasing deduce el canon:   Escudo_leasing,t = (Canon_t + Seguro_t + Mtto_t) × g\n"
        "   • El ahorro también tributa del lado del leasing, con la misma alícuota g.\n\n"
        "Régimen SIN GANANCIAS (consumidor final o monotributista):\n"
        "   g = 0 en ambas opciones: ni escudo fiscal ni impuesto sobre el ahorro.\n\n"
        "Régimen ANTERIOR (solo para reproducir cotizaciones ya emitidas):\n"
        "   El leasing deduce el canon pero la compra no amortiza y el ahorro no tributa.\n"
        "   Favorece artificialmente al leasing; la app lo señala con una advertencia en pantalla.\n\n"
        "   g: alícuota del Impuesto a las Ganancias (30 % o 35 %)\n"
        "   N_amort: años de vida fiscal del equipo (5 por defecto)\n"
        "   La amortización se computa sobre costo histórico, sin ajuste por inflación."
    )
    p = doc.add_paragraph()
    r = p.add_run(box_fiscal)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    doc.add_paragraph(
        "Los resultados fiscales son una estimación de ingeniería, no un dictamen contable. Antes de presentarlos como "
        "compromiso, validalos con el contador del cliente."
    )

    # 5.9. Modelo financiero
    doc.add_heading("5.9. Modelo Financiero de Compra Directa (Flujo de Fondos, VAN, TIR, Payback y LCOE)", level=2)
    doc.add_paragraph(
        "Modela el flujo de caja dinámico a lo largo de 20 a 30 años incorporando degradación de celdas, actualización "
        "tarifaria, OPEX, recambio de inversores y del banco de baterías, y el tratamiento fiscal de la sección anterior:"
    )

    box_fin = (
        "1. Inversión Inicial Total (CAPEX):\n"
        "   CAPEX_USD = (P_kWp × Costo_kWp) + (C_bat_kWh × Costo_bat_kWh)\n"
        "   CAPEX_ARS = CAPEX_USD × TC_0\n\n"
        "2. Flujo de Fondos del Año t (t = 1, 2, ..., N), en pesos nominales:\n"
        "   • Generación año t:       E_gen,t = E_anual × (1 - d)^(t-1)          (d: degradación anual ~0.5%)\n"
        "   • Ahorro energético t:    Ahorro_t = Ahorro_1 × (1 - d)^(t-1) × (1 + inf)^(t-1)\n"
        "   • Gasto OPEX año t:       OPEX_t = CAPEX_ARS × (OPEX% / 100) × (1 + inf)^(t-1)\n"
        "   • Recambio inversor t:    CAPEX_solar × (Recambio% / 100) × (1 + inf)^(t-1)   (si t mod k = 0)\n"
        "   • Recambio banco t:       CAPEX_bat × (Recambio_bat% / 100) × (1 + inf)^(t-1) (si t mod Vida_bat = 0)\n"
        "   • Flujo neto:             Flujo_t = (Ahorro_t - OPEX_t - Recambio_t) × (1 - g) + Amort_t × g\n"
        "   • Su equivalente en dólares:  Flujo_USD,t = Flujo_t / TC_t\n\n"
        "3. Valor Actual Neto (VAN):\n"
        "   VAN_ARS = -CAPEX_ARS + ∑ [ Flujo_t / (1 + r_pesos)^t ]\n"
        "   VAN_USD = -CAPEX_USD + ∑ [ Flujo_USD,t / (1 + r_dolares)^t ] = VAN_ARS / TC_0\n\n"
        "4. Tasa Interna de Retorno (TIR):\n"
        "   Tasa r* que satisface la ecuación no lineal: VAN(r*) = 0\n"
        "   (Calculada numéricamente mediante algoritmo de bisección con convergencia |f(r)| < 10^-7).\n"
        "   Se informan por separado la TIR en pesos nominales y la TIR en dólares.\n\n"
        "5. Período de Recupero de la Inversión (Payback Simple con Interpolación Lineal):\n"
        "   Payback = (t - 1) + [ |Flujo_Acumulado_{t-1}| / Flujo_t ]\n"
        "   Se mide sobre los flujos de la moneda de análisis elegida.\n\n"
        "6. Costo Nivelado de la Energía (LCOE - Levelized Cost of Energy), siempre antes de impuestos:\n"
        "   LCOE = [ CAPEX + ∑ ( (OPEX_t + Recambio_t) / (1 + r)^t ) ] / [ ∑ ( E_gen,t / (1 + r)^t ) ]"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_fin)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # 5.10. Modelo de Leasing
    doc.add_heading("5.10. Modelo Financiero de Leasing Solar y Escudo Fiscal", level=2)
    doc.add_paragraph(
        "Modela el contrato de leasing operativo/financiero y cuantifica el beneficio impositivo en Ganancias:"
    )
    
    box_leasing = (
        "1. Canon Mensual de Leasing (USD/mes):\n"
        "   Canon_mes = Canon_unitario_kWp × P_kWp\n\n"
        "2. Costo Total Bruto del Contrato de Leasing (USD):\n"
        "   Costo_bruto = Pago_Inicial + (Canon_mes × Plazo_meses) + ∑ Seguros + ∑ Mantenimientos + Opcion_Compra\n\n"
        "3. Escudo Fiscal en Impuesto a las Ganancias (USD):\n"
        "   Gasto_Deducible = (Canon_mes × Plazo_meses) + ∑ Seguros + ∑ Mantenimientos\n"
        "   Ahorro_Ganancias = Gasto_Deducible × (Alícuota_Ganancias / 100)    (Alícuota: 30% o 35%)\n\n"
        "4. Costo Neto Efectivo del Leasing (USD):\n"
        "   Costo_neto = Costo_bruto - Ahorro_Ganancias\n\n"
        "5. Flujo Anual del Cliente (USD), con el ahorro convertido al TC proyectado de cada año:\n"
        "   Ahorro_USD,t = Ahorro_ARS,t / TC_t\n"
        "   Flujo_t = Ahorro_USD,t × (1 - g) - Costo_leasing_t + Escudo_leasing_t\n"
        "   El factor (1 - g) es el mismo que se aplica a la compra directa: sin él la comparación\n"
        "   entre las dos opciones queda sesgada a favor del leasing.\n\n"
        "6. Flujo Mensual Neto Operativo (USD/mes):\n"
        "   Flujo_mes = Ahorro_Solar_mes × (1 - g) - [ Canon_mes + (Seguro_anual + Mtto_anual) / 12 ]\n"
        "   (Si Flujo_mes > 0, el sistema genera excedente de caja positivo desde el primer mes).\n\n"
        "7. Descuento del flujo:\n"
        "   Se usa r_dolares, la tasa equivalente en dólares de la sección 5.7, porque el flujo del\n"
        "   leasing está expresado en esa moneda."
    )
    p = doc.add_paragraph()
    r = p.add_run(box_leasing)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # 5.11. Análisis de Sensibilidad
    doc.add_heading("5.11. Modelo de Análisis de Sensibilidad Bidimensional", level=2)
    doc.add_paragraph(
        "Construye matrices matriciales cruzadas de evaluación de riesgo evaluando simultáneamente dos perturbaciones:"
    )
    
    box_sens = (
        "1. Matriz Tarifa Eléctrica vs. CAPEX:\n"
        "   Grid de 5 × 5 nodos: ΔTarifa ∈ {-20%, -10%, 0%, +10%, +20%}  ×  ΔCAPEX ∈ {-15%, -10%, 0%, +10%, +15%}\n"
        "   Para cada nodo (i, j), el motor recalcula el modelo completo y extrae: VAN, TIR y Payback.\n\n"
        "2. Matriz Inflación Tarifaria vs. Tasa de Descuento (WACC):\n"
        "   Grid de 5 × 4 nodos: WACC ∈ {6%, 8%, 10%, 12%, 15%}  ×  ΔInflación ∈ {-5%, 0%, +5%, +10%}\n"
        "   Permite identificar el umbral de viabilidad (puntos donde VAN > 0 y TIR > WACC)."
    )
    p = doc.add_paragraph()
    r = p.add_run(box_sens)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # 5.10. Impacto Ambiental ESG
    doc.add_heading("5.12. Dimensionamiento Eléctrico del Inversor y de las Cadenas", level=2)
    doc.add_paragraph(
        "La ventana de tensión de un inversor se verifica en los dos extremos térmicos del año. Con el mínimo "
        "histórico de temperatura la tensión de circuito abierto sube y no puede superar la máxima admisible; con la "
        "celda caliente la tensión de máxima potencia baja y tiene que quedar por encima de la mínima de seguimiento."
    )

    box_inv = (
        "1. Tensión de circuito abierto con la mínima temperatura de diseño (V):\n"
        "   Voc_frío = Voc_STC × [ 1 + (coef_Voc / 100) × (T_min - 25) ]\n\n"
        "2. Temperatura de celda en el peor caso de calor (°C):\n"
        "   T_celda,max = T_amb,max + (NOCT - 20) / 800 × 1000\n\n"
        "3. Tensión de máxima potencia con la celda caliente (V):\n"
        "   Vmp_caliente = Vmp_STC × [ 1 + (coef_Voc / 100) × (T_celda,max - 25) ]\n\n"
        "4. Módulos en serie admisibles:\n"
        "   N_max = piso( V_max_inversor / Voc_frío )\n"
        "   N_min = techo( max( V_arranque , V_min_seguimiento ) / Vmp_caliente )\n"
        "   Se elige la serie más larga que entra en la ventana: menos corriente y menos pérdida en el cableado.\n\n"
        "5. Cadenas en paralelo:\n"
        "   N_cadenas = techo( N_módulos / N_serie )\n"
        "   La corriente de cortocircuito del módulo no puede superar la máxima de la entrada MPPT.\n\n"
        "6. Relación entre generador e inversor:\n"
        "   DC/AC = P_kWp / P_inversor_AC        (habitual 1,10 a 1,30)\n\n"
        "7. Potencia de pico en un día despejado (kW):\n"
        "   P_pico,DC = P_kWp × (G_plano,max / 1000) × Factor_DC\n"
        "   Factor_DC descuenta las pérdidas anteriores al inversor: temperatura, suciedad,\n"
        "   dispersión entre módulos y caída en el cableado de continua.\n\n"
        "8. Régimen de generación distribuida (Ley 27.424):\n"
        "   La potencia instalada no puede superar la potencia contratada para poder inyectar."
    )
    p = doc.add_paragraph()
    r = p.add_run(box_inv)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    doc.add_paragraph(
        "El recorte por potencia se informa de dos maneras porque son dos cosas distintas. El del día despejado es el "
        "criterio de diseño: con una relación DC/AC de 1,20 se recorta cerca del 3 % de la energía del día y con 1,50, "
        "cerca del 14 %. El del año medio sale del balance horario, que promedia días nublados y aplana el pico, así "
        "que siempre da menos. El primero sirve para elegir el inversor; el segundo, para el flujo de fondos."
    )

    # 5.13. Financiamiento
    doc.add_heading("5.13. Préstamo Bancario, PPA y Comparación de Alternativas", level=2)
    doc.add_paragraph(
        "Las cuatro alternativas de financiamiento se expresan en dólares, con el ahorro convertido al tipo de cambio "
        "proyectado de cada año y descontadas a la misma tasa. Solo así la comparación no depende de en qué moneda "
        "esté expresada cada pata del negocio."
    )

    box_fin2 = (
        "1. Cuota del sistema francés (cuota constante):\n"
        "   Cuota = Capital × i × (1 + i)^n / [ (1 + i)^n - 1 ]        i = TNA / 12 / 100\n\n"
        "2. Sistema alemán (amortización constante):\n"
        "   Amortización_m = Capital / n          Interés_m = Saldo_{m-1} × i\n\n"
        "3. Préstamo ajustable por UVA:\n"
        "   El capital se indexa antes de devengar el interés del período:\n"
        "   Saldo_indexado = Saldo × (1 + ajuste_mensual)\n\n"
        "4. Costo financiero total efectivo anual:\n"
        "   Tasa mensual i* que anula:  Capital_neto - Σ [ Cuota_m / (1 + i*)^m ] = 0\n"
        "   CFT = (1 + i*)^12 - 1        Incluye los gastos de otorgamiento.\n\n"
        "5. Flujo del cliente con préstamo (U$D del año t):\n"
        "   Flujo_t = (Ahorro_t - OPEX_t) × (1 - g) - Cuota_t + (Interés_t + Amortización_equipo_t) × g\n"
        "   El interés del préstamo y la amortización del equipo son deducibles.\n\n"
        "6. Flujo del cliente con PPA:\n"
        "   Pago_PPA,t = E_autoconsumida,t × Precio_PPA × (1 + ajuste)^(t-1)\n"
        "   Flujo_t = Valor_energía_red,t × (1 - g) - Pago_PPA,t - Opción_compra_t + Escudo_t\n"
        "   El cliente no invierte: su desembolso inicial es cero."
    )
    p = doc.add_paragraph()
    r = p.add_run(box_fin2)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    doc.add_paragraph(
        "Endeudarse en pesos cuando se espera una devaluación alta licúa la deuda, y el modelo lo refleja: el mismo "
        "préstamo en pesos y en dólares da valores actuales netos muy distintos. Es una diferencia real, no un "
        "artefacto del cálculo."
    )

    # 5.14. Riesgo
    doc.add_heading("5.14. Análisis de Incertidumbre: Monte Carlo y Tornado", level=2)
    doc.add_paragraph(
        "Un único valor de VAN esconde cuánto puede moverse el resultado. La simulación de Monte Carlo sortea miles de "
        "escenarios moviendo todas las variables inciertas a la vez y devuelve la distribución completa. El diagrama "
        "de tornado, en cambio, mueve una variable por vez y ordena cuál pesa más."
    )

    box_riesgo = (
        "1. Variables inciertas y su dispersión típica (todas configurables):\n"
        "   Recurso solar             ±4 %      variabilidad interanual de la irradiación\n"
        "   Tarifa eléctrica          ±10 %     incertidumbre del precio de la energía\n"
        "   Costo del sistema         ±8 %      precio de módulos, inversores y montaje\n"
        "   Actualización tarifaria   ±5 p.p.   ritmo de actualización en pesos\n"
        "   Devaluación               ±5 p.p.   ritmo de depreciación del peso\n"
        "   Degradación de módulos    ±0,15 p.p.\n\n"
        "2. Sorteo de cada escenario:\n"
        "   Variable_rel = Base × (1 + z × σ / 100)        Variable_abs = Base + z × σ\n"
        "   z ~ N(0,1) por el método polar de Box-Muller.\n"
        "   El generador lleva semilla fija: el mismo proyecto devuelve siempre los mismos números.\n\n"
        "3. Salidas de la simulación:\n"
        "   P(VAN > 0)     probabilidad de que el proyecto sea rentable\n"
        "   P10, P50, P90  percentiles pesimista, central y optimista del VAN\n\n"
        "4. Diagrama de tornado:\n"
        "   Para cada variable, con las demás en su valor base:\n"
        "   Amplitud_i = | VAN(Base_i + k·σ_i) - VAN(Base_i - k·σ_i) |        k = 1,5 por defecto\n"
        "   Las variables se ordenan por amplitud decreciente."
    )
    p = doc.add_paragraph()
    r = p.add_run(box_riesgo)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    doc.add_paragraph(
        "En los proyectos argentinos el tornado casi siempre pone arriba la actualización tarifaria y la devaluación, "
        "muy por encima del recurso solar y del precio de los paneles. Eso dice dónde está el riesgo real del negocio: "
        "en la macroeconomía, no en la ingeniería."
    )

    doc.add_heading("5.15. Modelo de Descarbonización e Impacto Ambiental (ESG)", level=2)
    doc.add_paragraph(
        "Cuantifica los beneficios ecológicos a partir del factor de emisión de la matriz eléctrica argentina (SADI):"
    )
    
    box_esg = (
        "1. Toneladas de CO₂ Evitadas Anualmente (Ton CO₂/año):\n"
        "   CO2_anual = ( E_anual × FE_red ) / 1000      (FE_red = 0.45 kg CO₂/kWh - Factor SADI CAMMESA)\n\n"
        "2. Toneladas de CO₂ Evitadas en la Vida Útil (Ton CO₂ Total):\n"
        "   CO2_total = [ ( ∑ E_gen,t ) × FE_red ] / 1000\n\n"
        "3. Árboles Plantados Equivalentes:\n"
        "   Arboles_Eq = ( CO2_anual × 1000 kg ) / 21.7 kg CO₂/árbol/año\n\n"
        "4. Kilómetros no Emitidos en Automóvil Convencional:\n"
        "   Km_Auto_Eq = ( CO2_anual × 1000 kg ) / 0.19 kg CO₂/km"
    )
    p = doc.add_paragraph()
    r = p.add_run(box_esg)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(30, 41, 59)
    p.paragraph_format.space_after = Pt(6)

    # -------------------------------------------------------------
    # SECCIÓN 6: FAQ Y BUENAS PRÁCTICAS
    # -------------------------------------------------------------
    h1 = doc.add_heading("6. Preguntas Frecuentes y Buenas Prácticas (FAQ)", level=1)
    h1.runs[0].font.color.rgb = RGBColor(0, 159, 227)
    
    faqs = [
        ("¿Cómo guardar un proyecto de forma segura?", 
         "Podés presionar '💾 Guardar' o utilizar el atajo de teclado Ctrl+S. Si estás en modo local, se guarda en el navegador; si estás en modo nube, se sincroniza en la base de datos de Supabase."),
        ("¿Cómo hacer seguimiento comercial y congelar una versión entregada?", 
         "En la pestaña '📌 Pipeline', podés mover la oportunidad entre las etapas del embudo comercial (Borrador, Enviada, Negociación, Ganada). Al enviar una cotización formal al cliente, presioná '📎 Congelar revisión'. El sistema creará una copia histórica inmutable (Rev. 0, Rev. 1, etc.) preservando intactos los valores cotizados para auditoría o comparaciones futuras."),
        ("¿Cómo interpretar la simulación de Monte Carlo y el gráfico de Tornado?", 
         "En la pestaña '🎯 Riesgo', presioná '▶ Correr simulación'. El indicador P(VAN > 0) te indica la probabilidad matemática de rentabilidad sorteando miles de escenarios combinados. En el Gráfico de Tornado, las barras más anchas señalan los factores macroeconómicos o de ingeniería que más mueven el VAN, marcando prioridades para la negociación comercial."),
        ("¿Qué hacer si un cliente tiene consumos estacionales variables?", 
         "En la pestaña '⚡ Energía y CO₂', podés editar manualmente los kWh de consumo de cada uno de los 12 meses del año según las facturas históricas del cliente."),
        ("¿Cómo modificar el membrete o logotipo de la empresa?", 
         "En la barra superior, hacé clic en '🏢 Membrete'. Podés cargar un nuevo archivo de imagen (PNG/JPG), actualizar el nombre de la empresa, el asesor asignado, teléfono, email y validez de la oferta."),
        ("¿Cómo exportar la propuesta comercial a un cliente?", 
         "Ingresá a la pestaña '📄 Propuesta' y elegí entre '🖨 Imprimir / Guardar en PDF' (formato limpio A4), '⬇ Descargar HTML' (archivo interactivo sin conexión), '💬 WhatsApp' (mensaje estructurado con métricas de ahorro) o '✉ Email'."),
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
