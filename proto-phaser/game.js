(() => {
'use strict';
const WW = 4128, WH = 1024;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const touch = matchMedia('(pointer:coarse)').matches;
const qs = new URLSearchParams(location.search);
const DEBUG = qs.has('debug');
let season = qs.get('season') || 'autumn';
// 立牌：只放立牌與作品編號（作品編號依 x 排序）
const SIGNS = [ {k:'sign1', id:'01'}, {k:'sign0', id:'02'}, {k:'sign2', id:'03'}, {k:'sign3', id:'04'}, {k:'sign4', id:'05', boss:true} ];
const done = JSON.parse(localStorage.getItem('afanPhaserProto') || '{}');
const $ = id => document.getElementById(id);
const toast = (t, ms=1800) => { const e=$('toast'); e.textContent=t; e.classList.add('show'); clearTimeout(toast.h); toast.h=setTimeout(()=>e.classList.remove('show'),ms); };
$('tip').textContent = touch ? '按住畫面：阿飯往手指方向走｜點小徑可走進田裡｜點立牌餵飯糰' : '← → 走路｜↑ 在岔路走進小徑、↓ 退回｜空白鍵 在立牌前餵飯糰｜也可以用滑鼠點';

// 依腳的 y（深度）決定阿飯身高（世界像素）
// 以橋欄杆（約 1m）與立牌高度為比例尺：橋上約 125px，最前景約 150px，田間深處縮到約 40px
const heightAt = y => y >= 640 ? Math.min(160, 125 + (y - 640) * 0.12) : Math.max(40, 125 * (y - 330) / (640 - 330));

class Scene extends Phaser.Scene {
  constructor(){ super('tanada'); }
  preload(){
    this.load.json('path','path.json'); this.load.json('spr','sprites/sprites.json'); this.load.json('occ','occ/occ.json');
    this.loadSeason(season);
    this.load.image('oni','items/onigiri.png'); this.load.image('oniG','items/onigiri_golden.png');
    const prog = this.add.text(20,20,'載入中…',{color:'#fff',fontSize:'20px'}).setScrollFactor(0);
    const onp = p => { if (prog.active) prog.setText('載入中… ' + Math.round(p*100) + '%'); };
    this.load.on('progress', onp);
    this.load.once('complete', () => { this.load.off('progress', onp); prog.destroy(); });
  }
  loadSeason(s){
    ['a','b'].forEach(h => { this.load.image(`mid_${s}_${h}`,`bg/mid_${s}_${h}.webp`); this.load.image(`near_${s}_${h}`,`bg/near_${s}_${h}.webp`); });
    this.load.image(`far_${s}`,`bg/far_${s}.jpg`);
    this.load.image(`rail_${s}`,`occ/rail_${s}.png`);
    for (let i=0;i<5;i++) this.load.image(`sign${i}_${s}`,`occ/sign${i}_${s}.png`);
  }
  create(){
    const spr = this.cache.json.get('spr');
    // sprites (sheets were packed after json load, so add them now)
    this.sprMeta = spr;
    Object.entries(spr).forEach(([n,v]) => this.load.spritesheet(n,`sprites/${n}.webp`,{frameWidth:v.fw,frameHeight:v.fh}));
    this.load.once('complete', () => this.build());
    this.load.start();
  }
  build(){
    const spr = this.sprMeta;
    this.anims.create({key:'walk_right',frames:this.anims.generateFrameNumbers('walk_right',{start:0,end:spr.walk_right.n-1}),frameRate:12,repeat:-1});
    this.anims.create({key:'walk_left',frames:this.anims.generateFrameNumbers('walk_left',{start:0,end:spr.walk_left.n-1}),frameRate:12,repeat:-1});
    this.anims.create({key:'get',frames:this.anims.generateFrameNumbers('get_onigiri',{start:0,end:spr.get_onigiri.n-1}),frameRate:18,repeat:0});
    // --- path graph（沿著原圖上的路描出來的折線，再用樣條平滑）
    const P = this.cache.json.get('path');
    this.lines = {};
    for (const [k,pts] of Object.entries(P)) {
      const sp = new Phaser.Curves.Spline(pts.map(p => new Phaser.Math.Vector2(p[0],p[1])));
      const len = sp.getLength(); const n = Math.max(2, Math.round(len/3));
      const ps = sp.getSpacedPoints(n);
      const cum=[0]; for (let i=1;i<ps.length;i++) cum.push(cum[i-1]+ps[i].distance(ps[i-1]));
      this.lines[k] = {k, ps, cum, len:cum[cum.length-1]};
    }
    const nearestOn = (L, x, y) => { let b=1e18, bi=0; L.ps.forEach((p,i)=>{ const d=(p.x-x)**2+(p.y-y)**2; if(d<b){b=d;bi=i;} }); return {s:L.cum[bi], d:Math.sqrt(b)}; };
    this.nearestOn = nearestOn;
    for (const k of ['spur1','spur2']) { const p0=this.lines[k].ps[0]; this.lines[k].junction = nearestOn(this.lines.main,p0.x,p0.y).s; }
    // --- layers
    this.layers = {};
    this.cameras.main.setBackgroundColor('#efe6d6');
    this.makeSeasonLayers(season);
    // --- player
    this.pos = {line:'main', s: 60};
    this.dir = 1; this.busy = false;
    this.shadow = this.add.ellipse(0,0,10,4,0x2b1d10,0.28);
    this.player = this.add.sprite(0,0,'walk_right',0);
    this.target = null;
    // --- signs
    const occ = this.cache.json.get('occ');
    this.signs = SIGNS.map(S => {
      const m = occ[`${S.k}_${season}`];
      const tex = this.textures.get(`${S.k}_${season}`).getSourceImage();
      const sx = m.x + tex.width/2, base = m.base;
      const stop = nearestOn(this.lines.main, sx - tex.width*0.75, base); // 站在立牌旁邊，不躲在牌子後面
      const tagY = m.y + tex.height*0.33;
      const fs = Math.max(9, Math.round(tex.width*0.13));
      const tag = this.add.text(sx, tagY, `作品編號\n${S.id}`, {fontFamily:'"Noto Sans TC",sans-serif', fontSize:fs+'px', fontStyle:'bold', color:'#4a2f17', align:'center', lineSpacing:-3, resolution:3}).setOrigin(0.5).setDepth(base+0.6);
      const ring = this.add.text(sx, m.y-6, '', {fontSize:Math.round(fs*1.3)+'px', resolution:3}).setOrigin(0.5,1).setDepth(base+0.7);
      return {...S, sx, base, stop, tag, ring, m};
    });
    this.refreshSigns();
    // --- camera
    const cam = this.cameras.main;
    cam.setBounds(0,0,WW,WH);
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.place();
    cam.startFollow(this.player, true, 0.09, 0.09, 0, 60);
    // --- input
    this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE,ENTER');
    this.input.on('pointerdown', p => { this.holding = true; this.onPointer(p, true); });
    this.input.on('pointermove', p => { if (this.holding) this.onPointer(p, false); });
    this.input.on('pointerup', () => { this.holding = false; });
    document.querySelectorAll('#hud button').forEach(b => b.onclick = () => this.switchSeason(b.dataset.s));
    if (DEBUG) this.drawDebug();
    window.__afan = this; this.ready = true;
  }
  makeSeasonLayers(s){
    for (const o of Object.values(this.layers).flat()) o.destroy();
    const L = this.layers = {far:[],mid:[],near:[],occ:[]};
    L.far.push(this.add.image(0,0,`far_${s}`).setOrigin(0).setScale(2).setScrollFactor(0.55,0.85).setDepth(-20000));
    ['a','b'].forEach((h,i) => L.mid.push(this.add.image(i*2064,0,`mid_${s}_${h}`).setOrigin(0).setDepth(-10000)));
    // 前景草：只露出最底部，視差 1.15
    const ns = 0.62;
    for (let t=0;t<3;t++) ['a','b'].forEach((h,i) => L.near.push(this.add.image((t*2+i)*2064*ns - 200, WH - 1024*ns + 210, `near_${s}_${h}`).setOrigin(0).setScale(ns).setScrollFactor(1.15,1).setDepth(5000)));
    // 遮擋層：橋前欄杆、立牌 —— 依「底線 y」跟阿飯的腳 y 排序
    const occ = this.cache.json.get('occ');
    const r = occ[`rail_${s}`]; L.occ.push(this.add.image(r.x,r.y,`rail_${s}`).setOrigin(0).setDepth(r.base));
    for (let i=0;i<5;i++){ const m=occ[`sign${i}_${s}`]; L.occ.push(this.add.image(m.x,m.y,`sign${i}_${s}`).setOrigin(0).setDepth(m.base)); }
  }
  switchSeason(s){
    if (s===season || !this.ready) return;
    document.querySelectorAll('#hud button').forEach(b => b.classList.toggle('on', b.dataset.s===s));
    const go = () => { season = s; this.makeSeasonLayers(s); };
    if (this.textures.exists(`mid_${s}_a`)) go(); else { this.loadSeason(s); this.load.once('complete', go); this.load.start(); }
  }
  fitCamera(){
    const W = this.scale.width, H = this.scale.height;
    // 桌機：高度約看 620 世界像素；直式手機：至少看到 ~470 寬
    const z = Math.max(H/WH, Math.min(H/620, W/(700*DPR)*DPR));
    this.cameras.main.setZoom(z);
  }
  lineXY(k,s){ const L=this.lines[k]; s=Phaser.Math.Clamp(s,0,L.len); let lo=0,hi=L.cum.length-1; while(hi-lo>1){const m=(lo+hi)>>1; if(L.cum[m]<s) lo=m; else hi=m;} const a=L.ps[lo],b=L.ps[hi],t=(s-L.cum[lo])/((L.cum[hi]-L.cum[lo])||1); return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}; }
  onPointer(p, first){
    if (!this.ready || this.busy) return;
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    if (first) { // 點到立牌或飯糰
      for (const S of this.signs) if (Math.abs(w.x-S.sx)<45 && w.y>S.m.y-40 && w.y<S.base+10) { this.target={line:'main', s:S.stop.s, sign:S}; return; }
    }
    // 找最近的路（腳底下的位置大約在手指下方）
    let best=null; for (const L of Object.values(this.lines)) { const r=this.nearestOn(L,w.x,w.y+heightAt(w.y)*0.3); if(!best||r.d<best.d) best={line:L.k,s:r.s,d:r.d}; }
    if (best.d > 160) { const r=this.nearestOn(this.lines[this.pos.line], w.x, w.y); best={line:this.pos.line, s:r.s}; }
    this.target = {line:best.line, s:best.s};
  }
  // 回傳本 frame 要移動的 (line, 方向 ±1)；處理岔路
  stepToward(T){
    const P=this.pos;
    if (T.line===P.line) return {ds: Math.sign(T.s-P.s), arrived: Math.abs(T.s-P.s)<3};
    if (P.line!=='main') { // 先退回岔路口
      if (P.s<=2) { this.pos={line:'main', s:this.lines[P.line].junction}; return {ds:0}; }
      return {ds:-1};
    }
    const j=this.lines[T.line].junction;
    if (Math.abs(P.s-j)<3) { this.pos={line:T.line,s:0}; return {ds:0}; }
    return {ds: Math.sign(j-P.s)};
  }
  update(t, dtms){
    if (!this.ready) return;
    const dt=Math.min(dtms,50)/1000, K=this.keys;
    let ds=0;
    if (!this.busy) {
      const L=K.LEFT.isDown||K.A.isDown, R=K.RIGHT.isDown||K.D.isDown, U=K.UP.isDown||K.W.isDown, D=K.DOWN.isDown||K.S.isDown;
      if (L||R||U||D) {
        this.target=null; const P=this.pos;
        if (P.line==='main') {
          if (U) { for (const k of ['spur1','spur2']) if (Math.abs(P.s-this.lines[k].junction)<14) { this.pos={line:k,s:0}; } }
          if (this.pos.line==='main') ds = R?1:L?-1:0;
        } else {
          const a=this.lineXY(P.line,P.s), b=this.lineXY(P.line,P.s+4); const tx=Math.sign(b.x-a.x)||1;
          ds = U?1 : D?-1 : R?tx : L?-tx : 0;
          if (ds<0 && P.s<=1) { this.pos={line:'main',s:this.lines[P.line].junction}; ds = (L?-1:R?1:0); }
        }
        this.nearSign = null;
      } else if (this.target) {
        const r=this.stepToward(this.target); ds=r.ds||0;
        if (r.arrived) { const S=this.target.sign; this.target=null; ds=0; if (S) this.feed(S); }
      }
      if (Phaser.Input.Keyboard.JustDown(K.SPACE)||Phaser.Input.Keyboard.JustDown(K.ENTER)) { const S=this.signNear(); if (S) this.feed(S); else toast('走到立牌前再按空白鍵'); }
    }
    if (ds) {
      const a=this.lineXY(this.pos.line,this.pos.s);
      const H=heightAt(a.y); const v=0.95*H; // 速度隨遠近縮放，配合 12fps 步伐，不會「滑」
      this.pos.s = Phaser.Math.Clamp(this.pos.s + ds*v*dt, 0, this.lines[this.pos.line].len);
      const b=this.lineXY(this.pos.line,this.pos.s);
      if (Math.abs(b.x-a.x) > 0.25*Math.abs(b.y-a.y) && b.x!==a.x) this.dir = Math.sign(b.x-a.x);
      const key=this.dir>0?'walk_right':'walk_left';
      if (this.player.anims.currentAnim?.key!==key || !this.player.anims.isPlaying) this.player.play(key, true);
      this.player.anims.timeScale = 1;
    } else if (!this.busy && this.player.anims.isPlaying) {
      this.player.anims.stop(); this.player.setTexture(this.dir>0?'walk_right':'walk_left', 0);
    }
    this.place();
    const S=this.signNear(); this.signs.forEach(x => x.tag.setScale(x===S?1.12:1));
    const j=this.pos.line==='main' && ['spur1','spur2'].some(k=>Math.abs(this.pos.s-this.lines[k].junction)<14);
    if (j!==this._j){ this._j=j; if(j) toast(touch?'點上方的小徑可以走進田裡':'按 ↑ 走進小徑',1400); }
  }
  signNear(){ if (this.pos.line!=='main') return null; return this.signs.find(S => Math.abs(S.stop.s-this.pos.s) < 40) || null; }
  place(){
    const {x,y}=this.lineXY(this.pos.line,this.pos.s);
    const key=this.player.texture.key, m=this.sprMeta[key];
    const H=heightAt(y), sc=H/300;
    this.player.setOrigin(0.5, m.baseline/m.fh).setScale(sc).setPosition(x,y).setDepth(y);
    this.shadow.setPosition(x, y-1).setSize(H*0.42, H*0.08).setDepth(y-0.5);
    this.shadow.setDisplaySize(H*0.42, H*0.085);
  }
  refreshSigns(){ this.signs.forEach(S => { const d=done[S.id]; S.ring.setText(d?'🍙✓':''); S.tag.setColor(d?'#2e6b1f':'#4a2f17'); }); }
  feed(S){
    if (done[S.id]) { toast(`作品編號 ${S.id} 已經餵過了，阿飯吃得很飽`); return; }
    this.busy=true; this.target=null;
    const oni=this.add.image(S.sx, S.m.y-30, S.boss?'oniG':'oni').setScale(0.28).setDepth(S.base+1);
    this.tweens.add({targets:oni, y:S.m.y-50, duration:280, yoyo:true, repeat:0, ease:'Sine.inOut', onComplete:() => {
      this.tweens.add({targets:oni, x:this.player.x, y:this.player.y-heightAt(this.player.y)*0.4, scale:0.12, duration:450, onComplete:()=>oni.destroy()});
      this.player.setOrigin(0.5, this.sprMeta.get_onigiri.baseline/this.sprMeta.get_onigiri.fh);
      this.player.play('get');
      this.player.once('animationcomplete', () => { done[S.id]=1; localStorage.setItem('afanPhaserProto', JSON.stringify(done)); this.refreshSigns(); this.busy=false; this.player.setTexture(this.dir>0?'walk_right':'walk_left',0); toast(`作品編號 ${S.id}：阿飯吃到飯糰了！`); });
    }});
  }
  drawDebug(){
    const g=this.add.graphics().setDepth(9000);
    for (const L of Object.values(this.lines)) { g.lineStyle(3,0x0060ff,0.9); g.strokePoints(L.ps); }
  }
  // Playwright 用：直接跳到路上的某一點
  teleport(line, x){ const r=this.nearestOn(this.lines[line], x, 600); this.pos={line, s:r.s}; this.target=null; this.place(); this.cameras.main.centerOn(this.player.x, this.player.y-60); }
}
// 先載 JSON，sprite sheet 在 create() 補載
const game = new Phaser.Game({
  type: Phaser.AUTO, parent:'game', backgroundColor:'#efe6d6',
  scale:{ mode: Phaser.Scale.NONE, width: innerWidth*DPR, height: innerHeight*DPR, zoom: 1/DPR },
  render:{ antialias:true, roundPixels:false },
  scene: Scene,
});
addEventListener('resize', () => game.scale.resize(innerWidth*DPR, innerHeight*DPR));
})();
