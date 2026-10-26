import json,os,numpy as np,sys
from PIL import Image
from rcut import rcut
W='/workspace/afan/work'; OUT='/workspace/afan/proto-phaser-build/out/sprites'; os.makedirs(OUT,exist_ok=True)
JOBS=[('walk_right','v6',list(range(21,31)),0),
      ('walk_left','vL24',[19,22,24,26,28,31,34,36,38,40,43],0),
      ('crouch','v5',list(range(6,25)),0),
      ('get_onigiri','v5',list(range(1,34)),0)]
meta={}
for name,d,fr,ri in JOBS:
    cuts=[rcut(Image.open(f'{W}/{d}/{f:03d}.png')) for f in fr]
    rb=cuts[ri].getbbox(); sc=300/(rb[3]-rb[1])
    bx=[c.getbbox() for c in cuts]
    x0=min(b[0] for b in bx);y0=min(b[1] for b in bx);x1=max(b[2] for b in bx);y1=max(b[3] for b in bx)
    cx=(rb[0]+rb[2])/2; half=max(cx-x0,x1-cx)+4
    box=(int(cx-half),y0-4,int(cx+half),y1+4)
    FW=round((box[2]-box[0])*sc); FH=round((box[3]-box[1])*sc)
    sheet=Image.new('RGBA',(FW*len(cuts),FH))
    feet=[]
    for i,c in enumerate(cuts):
        r=c.crop(box).resize((FW,FH),Image.LANCZOS); sheet.paste(r,(i*FW,0))
        a=np.asarray(r)[...,3]; feet.append(int(np.where(a.any(1))[0][-1]))
    sheet.save(f'{OUT}/{name}.png',optimize=True)
    meta[name]=dict(fw=FW,fh=FH,n=len(cuts),baseline=int(np.median(feet)),src=f'{d}:{fr}')
    print(name,meta[name])
json.dump(meta,open(f'{OUT}/sprites.json','w'),indent=1)
