# Separa plantillas/mastil.xlsx en dos libros de una hoja: mastil-riendas.xlsx (T0) y mastil-verticalidad.xlsx (V1).
# Las filas variables (riendas, niveles y la tabla de verificación) las arma la web al exportar.
import re, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src); F = {n: z.read(n) for n in z.namelist()}
def txt(n): return F[n].decode()
def rows_keep(sheet, keep):
    def f(m):
        n = int(re.search(r'<row r="(\d+)"', m.group(0)).group(1))
        return m.group(0) if keep(n) else ''
    return re.sub(r'<row r="\d+"[^>]*?(?:/>|>.*?</row>)', f, sheet, flags=re.S)
def cell_clear(sheet, ref):
    return re.sub(r'<c r="%s"([^>]*?)(?:/>|>.*?</c>)' % ref, lambda m: '<c r="%s"%s/>' % (ref, re.sub(r'\s+t="[^"]*"', '', m.group(1)).rstrip(' /')), sheet, count=1, flags=re.S)
def armar(nombre, hoja, sheetxml, drawing, media, extra):
    out = dict(F)
    for n in list(out):
        if n.startswith('xl/worksheets/') or n.startswith('xl/drawings/') or n.startswith('xl/media/'): del out[n]
    out['xl/worksheets/sheet1.xml'] = sheetxml.encode()
    out['xl/worksheets/_rels/sheet1.xml.rels'] = F['xl/worksheets/_rels/sheet%s.xml.rels' % extra].replace(b'drawing%s.xml' % extra.encode(), b'drawing1.xml')
    out['xl/drawings/drawing1.xml'] = F['xl/drawings/drawing%s.xml' % extra]
    out['xl/drawings/_rels/drawing1.xml.rels'] = F['xl/drawings/_rels/drawing%s.xml.rels' % extra]
    for m in media: out['xl/media/' + m] = F['xl/media/' + m]
    wb = txt('xl/workbook.xml')
    wb = re.sub(r'<sheets>.*?</sheets>', '<sheets><sheet name="%s" sheetId="1" r:id="rId1" /></sheets>' % hoja, wb)
    wb = re.sub(r'<definedNames>.*?</definedNames>', '', wb)
    wb = re.sub(r'<mc:AlternateContent.*?</mc:AlternateContent>', '', wb)
    out['xl/workbook.xml'] = wb.encode()
    out['xl/_rels/workbook.xml.rels'] = txt('xl/_rels/workbook.xml.rels').replace('<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml" />', '').encode()
    ct = txt('[Content_Types].xml').replace('<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" />', '').replace('<Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml" />', '')
    out['[Content_Types].xml'] = ct.encode()
    ap = txt('docProps/app.xml')
    ap = re.sub(r'<HeadingPairs>.*?</HeadingPairs>', '<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Hojas de cálculo</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>', ap)
    ap = re.sub(r'<TitlesOfParts>.*?</TitlesOfParts>', '<TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>%s</vt:lpstr></vt:vector></TitlesOfParts>' % hoja, ap)
    out['docProps/app.xml'] = ap.encode()
    with zipfile.ZipFile(dst + '/' + nombre, 'w', zipfile.ZIP_DEFLATED) as o:
        for n in z.namelist():
            if n in out: o.writestr(n, out[n])
        for n in out:
            if n not in z.namelist(): o.writestr(n, out[n])
    print(nombre, 'ok')

# T0: encabezado (filas 1–22); sin el corte de columna que mandaba «Error» a otra hoja: 1 página de ancho
t0 = rows_keep(txt('xl/worksheets/sheet1.xml'), lambda n: n <= 22)
for ref in ('B10', 'B11', 'B12'): t0 = cell_clear(t0, ref)
t0 = re.sub(r'<conditionalFormatting.*?</conditionalFormatting>', '', t0, flags=re.S)
t0 = re.sub(r'<colBreaks.*?</colBreaks>', '', t0, flags=re.S)
t0 = t0.replace('<dimension ', '<sheetPr><pageSetUpPr fitToPage="1" /></sheetPr><dimension ', 1)
t0 = t0.replace('<pageSetup paperSize="9" orientation="portrait" />', '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0" />')
t0 = re.sub(r'<dimension ref="[^"]*" />', '<dimension ref="A1:Z22" />', t0)
armar('mastil-riendas.xlsx', 'Tensiones de riendas', t0, None, ['image1.png', 'image2.jpg'], '1')

# V1: encabezado (1–20) y el bloque de notas/dibujo (30–54); niveles y verificación los arma la web
v1 = rows_keep(txt('xl/worksheets/sheet2.xml'), lambda n: n <= 20 or 30 <= n <= 54)
for ref in ('B13', 'B14'): v1 = cell_clear(v1, ref)
v1 = re.sub(r'<conditionalFormatting.*?</conditionalFormatting>', '', v1, flags=re.S)
v1 = re.sub(r'<dimension ref="[^"]*" />', '<dimension ref="A1:Z54" />', v1)
v1 = re.sub(r'<sheetView ([^>]*?)topLeftCell="A12" ', r'<sheetView \1', v1)
armar('mastil-verticalidad.xlsx', 'Verticalidad', v1, None, ['image3.png', 'image4.jpg'], '2')
