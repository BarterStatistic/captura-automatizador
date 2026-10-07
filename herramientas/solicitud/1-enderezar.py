from PIL import Image
import numpy as np, sys
SP=sys.argv[1]; ang=float(sys.argv[2])
img=Image.open(SP+'/formato-escaneado.webp').convert('L').rotate(ang, resample=Image.BICUBIC, fillcolor=255)
img.save(SP+'/recto.png')
im=np.array(img).astype(int); H,W=im.shape
dark=im<130
def hsegs(minlen=60):
    out=[]
    for y in range(H):
        row=dark[y]; x=0
        while x<W:
            if row[x]:
                s=x
                while x<W and row[x]: x+=1
                if x-s>=minlen: out.append((y,s,x-1))
            else: x+=1
    m=[]
    for y,a,b in out:
        g=[o for o in m if o[1]>=y-1 and abs(o[2]-a)<10 and abs(o[3]-b)<10]
        if g: g[0][1]=y
        else: m.append([y,y,a,b])
    return m
for s in hsegs(): print('H',*s)
# gray bars: rows with >300 px in 150..225
gray=(im>140)&(im<228)
cnt=gray.sum(1)
y=0
while y<H:
    if cnt[y]>400:
        s=y
        while y<H and cnt[y]>400: y+=1
        cols=np.where(gray[s:y].sum(0)>(y-s)*0.5)[0]
        print('BAR',s,y-1,cols.min(),cols.max())
    else: y+=1

# recto2.png: además corregido el corrimiento horizontal (~5 px de arriba abajo),
# igual que X() en 4-generar.py. Es contra lo que compara 5-desfases.py.
a=np.array(img); b=np.full_like(a,255)
for y in range(H):
    s=5.5*(y-171)/1220
    b[y]=np.interp(np.arange(W)-s, np.arange(W), a[y].astype(float), left=255, right=255)
Image.fromarray(b).save(SP+'/recto2.png')
