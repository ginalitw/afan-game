import asyncio
from playwright.async_api import async_playwright
HOOK="window.__t={st,POINTS,CHAPTERS,sAtX,atS,layer};"
SPOTS=[('stonewall',560),('bridge',1400),('bend',1790),('bend2',3020),('field',2300)]
async def run(b,name,w,h,mob):
    ctx=await b.new_context(viewport={'width':w,'height':h},device_scale_factor=3 if mob else 1,is_mobile=mob,has_touch=mob)
    pg=await ctx.new_page()
    async def rt(route):
        r=await route.fetch(); await route.fulfill(response=r,body=(await r.text()).replace('/*TEST_HOOK*/',HOOK))
    await pg.route('**/app.js',rt)
    await pg.goto('http://localhost:8811/'); await pg.wait_for_function('window.__t && __t.layer("rice_mid")',timeout=30000); await pg.wait_for_timeout(800)
    for nm,x in SPOTS:
        await pg.evaluate(f'(()=>{{__t.st.afanS=__t.sAtX({x});__t.st.follow=false;__t.st.camX={x}*__t.st.k-__t.st.vw*0.5;__t.st.fogX=1e6;}})()')
        await pg.wait_for_timeout(1200); await pg.screenshot(path=f'/workspace/afan/shots/v5-{name}-{nm}.png')
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); await run(b,'desktop',1280,800,False); await run(b,'phone',390,844,True); await b.close()
asyncio.run(main())
