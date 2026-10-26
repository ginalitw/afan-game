import numpy as np, json, os, sys
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0,'.')
from rcut import sess
from rembg import remove
O='out/occ'; os.makedirs(O,exist_ok=True)
SIGNS=[(940,535,1030,655),(530,640,640,770),(2000,705,2100,825),(2835,685,2945,805),(4000,595,4110,715)]
RAIL=[[(1212,548),(1240,548),(1240,654),(1212,654)],[(1365,592),(1386,592),(1386,662),(1365,662)],[(1518,585),(1549,585),(1549,704),(1518,704)],
      [(1232,566),(1522,596),(1522,613),(1232,583)],[(1232,601),(1522,636),(1522,653),(1232,618)]]
meta={}
for s in ['autumn','spring','summer','winter']:
    mid=Image.open(f'/workspace/afan/gen/out/mid_{s}.jpeg').convert('RGB')
    # bridge rail (same composition across seasons assumed; verify per season)
    box=(1200,540,1560,712); m=Image.new('L',mid.size,0); d=ImageDraw.Draw(m)
    for p in RAIL: d.polygon(p,fill=255)
    m=m.filter(ImageFilter.GaussianBlur(0.7))
    im=mid.copy(); im.putalpha(m); im.crop(box).save(f'{O}/rail_{s}.png')
    meta[f'rail_{s}']=dict(x=box[0],y=box[1],base=700)
    for i,b in enumerate(SIGNS):
        c=mid.crop(b); big=c.resize((c.width*4,c.height*4),Image.LANCZOS); a=remove(big,session=sess('isnet-general-use'),only_mask=True).resize(c.size,Image.LANCZOS)
        a=a.point(lambda v:255 if v>110 else 0).filter(ImageFilter.GaussianBlur(0.6))
        from scipy import ndimage as nd
        ar=np.asarray(a)>127; ar=nd.binary_fill_holes(nd.binary_closing(ar,iterations=2))
        if i==3: ar[55:114,51:60]=True
        a=Image.fromarray((ar*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
        c=c.copy(); c.putalpha(a); c.save(f'{O}/sign{i}_{s}.png')
        arr=np.asarray(a); ys=np.where(arr.max(1)>0)[0]
        meta[f'sign{i}_{s}']=dict(x=b[0],y=b[1],base=int(b[1]+ys[-1]) if len(ys) else b[3])
json.dump(meta,open(f'{O}/occ.json','w'),indent=0)
print({k:v for k,v in meta.items() if 'autumn' in k})
