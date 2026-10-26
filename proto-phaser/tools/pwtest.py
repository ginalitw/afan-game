import asyncio, sys
from playwright.async_api import async_playwright
U='http://localhost:8811/proto-phaser/'+(sys.argv[1] if len(sys.argv)>1 else '')
SH='/workspace/afan/shots/'
SPOTS=[('stonewall','main',560),('bridge','main',1400),('bend','spur1',1790),('bend2','spur2',3020),('field','main',2300)]
async def run(b,name,w,h,mob):
    ctx=await b.new_context(viewport={'width':w,'height':h},device_scale_factor=3 if mob else 1,is_mobile=mob,has_touch=mob)
    pg=await ctx.new_page(); errs=[]
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror',lambda e: errs.append(str(e)))
    await pg.goto(U); await pg.wait_for_function('window.__afan && __afan.ready',timeout=60000); await pg.wait_for_timeout(500)
    for nm,line,x in SPOTS:
        await pg.evaluate(f'__afan.teleport("{line}",{x})'); await pg.wait_for_timeout(700)
        await pg.screenshot(path=f'{SH}phaser-{name}-{nm}.png')
    # walk test with keyboard / touch
    await pg.evaluate('__afan.teleport("main",1150)')
    if mob:
        await pg.mouse.move(w*0.9,h*0.5); await pg.mouse.down(); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{SH}phaser-{name}-walking.png'); await pg.mouse.up()
    else:
        await pg.keyboard.down('ArrowRight'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{SH}phaser-{name}-walking.png'); await pg.keyboard.up('ArrowRight')
        await pg.keyboard.down('ArrowLeft'); await pg.wait_for_timeout(600)
        print(name,'left key anim',await pg.evaluate('__afan.player.anims.currentAnim.key')); await pg.keyboard.up('ArrowLeft')
    print(name,'pos',await pg.evaluate('JSON.stringify(__afan.pos)'),'errs',errs)
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        await run(b,'desktop',1280,800,False); await run(b,'phone',390,844,True)
        await b.close()
asyncio.run(main())
