import numpy as np, sys
from PIL import Image
from scipy import ndimage as nd
from rembg import remove, new_session
S={}
def sess(m):
    if m not in S: S[m]=new_session(m)
    return S[m]
def rcut(img, model='isnet-general-use', drop_shadow=True):
    im=img.convert('RGB'); a=np.asarray(im).astype(float)
    m=np.asarray(remove(im,session=sess(model),only_mask=True)).astype(float)/255
    edge=np.concatenate([a[0],a[-1],a[:,0],a[:,-1]]); bg=np.median(edge,0)
    d=np.abs(a-bg).max(2)
    core=m>0.5
    if drop_shadow:
        # soft grey ground shadow: low saturation, bright-ish, not outline-dark
        sat=a.max(2)-a.min(2); lum=a.mean(2)
        sh=(sat<20)&(lum>110)&(lum<238)&(d<90)
        ys=np.where(core.any(1))[0]
        if len(ys):
            band=np.zeros_like(core); y0=int(ys[-1]-(ys[-1]-ys[0])*0.10); band[y0:]=True
            core&=~(sh&band)
    lab,n=nd.label(core)
    if n>1:
        s=nd.sum(core,lab,range(1,n+1)); core=np.isin(lab,1+np.where(s>=s.max()*0.03)[0])
    core=nd.binary_fill_holes(core)          # rice / white interior stays opaque
    core=nd.binary_opening(core,iterations=1)
    # alpha: hard core, 1px soft ramp computed from colour distance to bg (outline is dark => ~opaque)
    ring=nd.binary_dilation(core,iterations=1)&~core
    inner=core&~nd.binary_erosion(core,iterations=1)
    al=core.astype(float)
    al[ring]=np.clip(d[ring]/160,0,1)*0.8
    al[inner]=np.maximum(np.clip(d[inner]/120,0,1),0.6)
    A=al[...,None]
    rgb=np.where(A>0.02,(a-bg*(1-A))/np.maximum(A,0.02),0)
    # pull edge colours toward darkest neighbour (outline) to kill any light fringe
    mn=np.stack([nd.minimum_filter(a[...,c],3) for c in range(3)],-1)
    edgepx=(ring|inner)[...,None]
    rgb=np.where(edgepx,np.minimum(rgb,mn*0.5+rgb*0.5),rgb)
    out=np.dstack([np.clip(rgb,0,255),al*255]).astype(np.uint8)
    out[al==0]=0
    return Image.fromarray(out,'RGBA')
if __name__=='__main__':
    o=rcut(Image.open(sys.argv[1]),sys.argv[3] if len(sys.argv)>3 else 'isnet-general-use'); o.save(sys.argv[2])
