import json, sys, statistics, re
SP=sys.argv[1]; OUT=sys.argv[2]
exec(open(SP+'/3-etiquetas.py',encoding='utf-8').read().split("for x in T: print(x)")[0].replace("SP=sys.argv[1]","SP=%r"%SP))
# --- correcciones de x contaminadas por rayitas vecinas (medidas a ojo sobre el recorte) ---
fix = {
 ('PERSONA FÍSICA CON ACTIVIDAD EMPRESARIAL',0):(78,287), ('PERSONA MORAL',0):(315,391), ('PERSONA FÍSICA',0):(422,495), ('OTRO',0):(673,699),
 ('EDAD',1):(542,565), ('EDAD',2):(592,615), (')',3):(473,474),
 ('CALLE',0):(65,90), ('NÚM. EXTERIOR',0):(440,508), ('NÚM. INTERIOR',0):(558,623), ('COLONIA',0):(671,710),
 ('CÓDIGO POSTAL',0):(64,135), ('CIUDAD',0):(183,215), ('VIVIENDA ACTUAL',0):(63,142),
 ('HORARIO DE LOCALIZACIÓN PARA VERIFICAR',0):(721,918),
 ('NÚMERO',0):(278,318), ('EMPLEADOS',0):(278,332), ('EFECTIVO (',0):(623,670), ('FORMA DE PAGO',0):(623,697),
 ('FRECUENCIA DE PAGO',0):(623,719), ('COLONIA',2):(463,500),
 ('FECHA DE NACIMIENTO',1):(399,500), ('NÚM. EXTERIOR',3):(448,517), ('NÚM.  INTERIOR',0):(522,591),
 ('FACEBOOK',1):(366,412), ('TELÉFONO CON LADA (NO CELULARES)',0):(62,232),
}
seen={}
grupos=[]  # baselines por renglón: los items de un mismo L() comparten línea base
for it in T:
    k=it['t']; n=seen.get(k,0); seen[k]=n+1
    if (k,n) in fix: it['x0'],it['x1']=fix[(k,n)]
# baseline común por renglón: agrupar por cercanía de baseline (±4) en orden
filas=[]
for it in T:
    if it['p']==700: continue
    for f in filas:
        if abs(statistics.median([i['b'] for i in f])-it['b'])<=4 and abs(f[0]['b']-it['b'])<=5: f.append(it); break
    else: filas.append([it])
for f in filas:
    b=round(statistics.median([i['b'] for i in f]))
    for i in f: i['b']=b
# La casilla y la etiqueta de JUBILADO O PENSIONADO van 2 px más arriba.
for i in T:
    if i['t']=='JUBILADO O PENSIONADO': i['b']-=2
# Todas las etiquetas son del mismo tamaño (7 px de mayúscula) y los títulos de
# barra también (10 px): lo que se midió distinto fue por una rayita vecina.
for i in T: i['h']=10 if i['p']==700 else 7
# Desfases medidos por correlación contra el escaneo (desfase.py). Un dx de 4 o
# más es la rayita vecina confundiendo la medida: ese no se aplica.
import os
if os.path.exists(SP+'/desfases.json'):
    for idx,dx,dy in json.load(open(SP+'/desfases.json')):
        T[idx]['b']+=dy
        if abs(dx)<=3: T[idx]['x0']+=dx; T[idx]['x1']+=dx

# El escaneo corre ~5 px a la izquierda de arriba abajo: se endereza.
def X(x,y): return round(x + 5.5*(y-171)/1220, 1)

lineas=[  # y, x0, x1
 (299,61,926),(333,61,926),(371,60,925),(400.5,708,926),
 (467,58,927),(508.5,58,927),(541,58,927),
 (612,58,926),(648,58,926),(686,58,926),
 (758.5,57,926),(797.5,56,926),(836.5,57,925),
 (918,57,925),(958.5,57,924),(998.5,56,925),(1036.5,55,924),
 (1103,56,924),(1143.5,56,924),(1184,55,924),(1222,56,923),(1259.5,55,923),
 (1341.5,54,922),(1375.5,54,922),
 (1446.5,57,919),(1483.5,58,919),(1520,58,919),
 (222.5,735,893),
]
rayas=[  # x, y0, y1
 (61,282,299),(580.5,281,299),(925.5,281,299),
 (61,315,333),(446.5,315,333),(925,315,333),
 (60.5,352,371),(446.5,352,371),(674,352,371),(925,352,371),
 (557.5,450,467),(700,449,467),(793.5,449,467),
 (285.5,481,508.5),(700.5,480,508.5),(793.5,480,508.5),
 (492.5,523,541),
 (432.5,595,612),(549,594,612),(657.5,594,612),
 (527.5,630,648),(716.5,630,648),
 (359.5,659,686),(715.5,659,686),
 (430.5,741,758.5),(546.5,741,758.5),(655.5,741,758.5),
 (715.5,780,797.5),
 (358.5,809,836.5),(715.5,809,836.5),
 (618.5,891,918),(778,892,918),
 (618.5,931,958.5),(778,931,958.5),
 (273,972,998.5),(361,972,998.5),(460.5,972,998.5),(617.5,972,998.5),
 (360.5,1009,1036.5),(617.5,1010,1036.5),(777.5,1009,1036.5),
 (377.5,1086,1103),(665.5,1086,1103),
 (377.5,1126,1143.5),(426.5,1126,1143.5),(471.5,1126,1143.5),(518.5,1126,1143.5),(613.5,1126,1143.5),
 (446.5,1167,1184),(521,1167,1184),(596.5,1166,1184),(753.5,1167,1184),
 (472.5,1204,1222),(715.5,1205,1222),
 (362.5,1241,1259.5),(671.5,1242,1259.5),
 (356.5,1324,1341.5),(615.5,1324,1341.5),(705.5,1324,1341.5),(796.5,1325,1341.5),
 (430.5,1358,1375.5),(715.5,1358,1375.5),
 (360.5,1418,1520),(777.5,1418,1520),
 (780.5,204,222.5),(828,204,222.5),(892.5,204,222.5),
]
barras=[  # y0, y1, x0, x1
 (411,427,59,927),(561,578,58,927),(703,720,58,926),(857,873,57,925),
 (1057,1073,56,924),(1288,1303,55,923),(1391,1408,55,923),
]
cajas=[(59,388,74,402),(297,388,311,402),(403,388,417,402),(505,386,521,400),(653,388,667,401)]

def r(v): return round(v,1)
datos={
 'cabeza': {'x0':61,'x1':928,'y0':171,'y1':255, 'blanco':[X(687,212),198,X(905,212),228],
            'logo':[X(77,214),181,104,67], 'titulo':{'t':'SOLICITUD DE CRÉDITO','x0':X(210,214),'x1':X(439,214),'b':223,'h':15},
            'fecha':{'t':'FECHA','x0':X(699,218),'x1':X(726,218),'b':221,'h':7}},
 'lineas':[[r(y),X(a,y),X(b,y)] for y,a,b in lineas],
 'rayas':[[X(x,(a+b)/2),a,b] for x,a,b in rayas],
 'barras':[[a,b,X(c,(a+b)/2),X(d,(a+b)/2)] for a,b,c,d in barras],
 'cajas':[[X(a,b),b,X(c,b),d] for a,b,c,d in cajas],
 'textos':[{'t':re.sub(r'\s+',' ',i['t']),'x0':X(i['x0'],i['b']),'x1':X(i['x1']+1,i['b']),'b':i['b'],'h':i['h'],'p':i['p']} for i in T],
}
datos['cabeza']['x0']=X(61,213); datos['cabeza']['x1']=X(928,213)
def compacto(d):
    NL=chr(10)
    partes=[]
    for k,v in d.items():
        if isinstance(v,list):
            cuerpo=(','+NL).join('    '+json.dumps(e,ensure_ascii=False) for e in v)
            partes.append('  '+k+': ['+NL+cuerpo+','+NL+'  ]')
        else:
            partes.append('  '+k+': '+json.dumps(v,ensure_ascii=False))
    return '{'+NL+(','+NL).join(partes)+','+NL+'}'

js=("// Geometría de la solicitud de crédito de Dinamo, medida sobre el escaneo del\n"
    "// formato de papel (1006 × 1600 px, enderezado 0.36°). Todo está en píxeles del\n"
    "// escaneo: la hoja los lleva a 216 × 340 mm. Generado con un script de medición;\n"
    "// si se corrige a mano, que sea contra el escaneo.\n\n"
    "export const ANCHO = 1006;\nexport const ALTO = 1600;\n\n"
    "export const FORMATO = " + compacto(datos) + ";\n")
open(OUT,'w',encoding='utf-8').write(js)
print(len(datos['textos']),'textos')
