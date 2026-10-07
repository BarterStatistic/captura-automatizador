import sys, json, re, numpy as np, pymupdf
from PIL import Image
SP=sys.argv[1]
d=pymupdf.open(sys.argv[3]); d[0].get_pixmap(dpi=300).save(SP+'/tmp3.png')
mio=np.array(Image.open(SP+'/tmp3.png').convert('L').resize((1006,1600), Image.LANCZOS))<140
scan=np.array(Image.open(SP+'/recto2.png').convert('L'))<140
src=open(sys.argv[2],encoding='utf-8').read()
textos=[json.loads(l.strip().rstrip(',')) for l in src.split('textos: [')[1].split(']')[0].strip().split('\n')]
res=[]
for i,t in enumerate(textos):
    x0,x1,b=int(t['x0']),int(t['x1']),t['b']; y0=b-t['h']-1; y1=b+1
    if x1-x0<4: continue
    m=mio[y0-1:y1+2, x0-1:x1+2].astype(int)
    best=None
    for dy in range(-5,6):
        for dx in range(-5,6):
            s=scan[y0-1+dy:y1+2+dy, x0-1+dx:x1+2+dx].astype(int)
            v=(m*s).sum()
            if best is None or v>best[0]: best=(v,dx,dy)
    v,dx,dy=best
    if abs(dx)>=2 or abs(dy)>=2: res.append((i,t['t'],dx,dy,int(v),int(m.sum())))
for r in res: print(r)
json.dump([[r[0],r[2],r[3]] for r in res], open(SP+'/desfases.json','w'))
