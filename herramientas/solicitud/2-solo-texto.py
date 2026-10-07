from PIL import Image
import numpy as np, sys
SP=sys.argv[1]
im=np.array(Image.open(SP+'/recto.png')).astype(int); H,W=im.shape
d=(im<135).copy()
# borrar lineas horizontales largas y verticales largas
for y in range(H):
    row=d[y]; x=0
    while x<W:
        if row[x]:
            s=x
            while x<W and row[x]: x+=1
            if x-s>=25: d[y,s:x]=False
        else: x+=1
for x in range(W):
    col=d[:,x]; y=0
    while y<H:
        if col[y]:
            s=y
            while y<H and col[y]: y+=1
            if y-s>=16: d[s:y,x]=False
        else: y+=1
Image.fromarray((~d*255).astype('uint8')).save(SP+'/solo_texto.png')
y0=int(sys.argv[2]); y1=int(sys.argv[3])
prof=d[y0:y1].sum(1)
y=0; lines=[]
while y<len(prof):
    if prof[y]>0:
        s=y
        while y<len(prof) and prof[y]>0: y+=1
        if y-s>=4: lines.append((s+y0,y+y0-1))
    else: y+=1
for a,b in lines:
    cp=d[a:b+1].sum(0); x=0; words=[]
    while x<W:
        if cp[x]>0:
            s=x
            while x<W and cp[x]>0: x+=1
            words.append([s,x-1])
        else: x+=1
    ph=[]
    for w in words:
        if ph and w[0]-ph[-1][1]<=7: ph[-1][1]=w[1]
        else: ph.append(list(w))
    print('L y=%d-%d:'%(a,b),' '.join('%d-%d'%tuple(p) for p in ph))
