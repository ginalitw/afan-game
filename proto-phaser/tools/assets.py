import numpy as np, json, os
from PIL import Image, ImageDraw
from scipy import ndimage as nd
G='/workspace/afan/gen/out'; O='out/bg'; os.makedirs(O,exist_ok=True)
def key(path):
    a=np.asarray(Image.open(path).convert('RGB')).astype(float)
    r,g,b=a[...,0],a[...,1],a[...,2]
    k=np.minimum(r,b)-g            # magenta-ness
    bgm=k>140
    M=np.median(a[bgm],0) if bgm.sum()>1000 else np.array([255,0,255.])
    kb=min(M[0],M[2])-M[1]
    al=1-np.clip((k+2)/(kb-15+2),0,1)
    hard=al>0.25; hard=nd.binary_opening(hard,iterations=1)
    # shrink 1px off the matte edge and feather
    er=nd.binary_erosion(hard,iterations=1)
    al=np.where(er,al,np.where(hard,np.minimum(al,0.5),0.0))
    al=nd.gaussian_filter(al,0.6)*hard + 0  # soft but no outward spread
    A=np.maximum(al,1e-3)[...,None]
    rgb=(a-M*(1-A))/A
    # despill: clamp r and b so pixel isn't more magenta than its green allows
    lim=rgb[...,1]+np.maximum(0,(rgb[...,0]+rgb[...,2])/2-rgb[...,1])*0  # placeholder
    sp=np.minimum(rgb[...,0],rgb[...,2])-rgb[...,1]
    edge=(al<0.999)
    spill=np.clip(sp-4,0,None)
    rgb[...,0]-=spill; rgb[...,2]-=spill
    rgb=np.clip(rgb,0,255); mean=rgb.mean(2,keepdims=True); w=al[...,None]
    semi=(al<0.35)[...,None]
    solid=(al>=0.98)
    idx=nd.distance_transform_edt(~solid,return_distances=False,return_indices=True)
    near=rgb[idx[0],idx[1]]
    rgb=np.where(semi, near, rgb)
    gcap=np.maximum(rgb[...,0],rgb[...,2])+6; rgb[...,1]=np.where(al<0.98,np.minimum(rgb[...,1],gcap),rgb[...,1])
    out=np.dstack([np.clip(rgb,0,255),np.clip(al*255,0,255)]).astype(np.uint8); out[al<0.02]=0
    return Image.fromarray(out,'RGBA')
for s in ['autumn','spring','summer','winter']:
    for L in ['mid','near']:
        im=key(f'{G}/{L}_{s}.jpeg')
        im.crop((0,0,2064,1024)).save(f'{O}/{L}_{s}_a.webp',quality=88,alpha_quality=95,method=6)
        im.crop((2064,0,4128,1024)).save(f'{O}/{L}_{s}_b.webp',quality=88,alpha_quality=95,method=6)
    Image.open(f'{G}/far_{s}.jpeg').convert('RGB').resize((2064,512),Image.LANCZOS).save(f'{O}/far_{s}.jpg',quality=82)
    print(s)
