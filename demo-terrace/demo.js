(() => {
'use strict';
const WW = 1935, WH = 1080, GROUND = 872;
const I18N = { 'zh-Hant': { 'prompt.tree':'搖一搖樹', 'prompt.door':'進入農家', 'toast.enter':'阿飯進門了…', 'toast.back':'回到棚田' },
  en: { 'prompt.tree':'Shake the tree', 'prompt.door':'Enter farmhouse', 'toast.enter':'A-Fan goes inside…', 'toast.back':'Back to the terraces' },
  ja: { 'prompt.tree':'木をゆらす', 'prompt.door':'農家に入る', 'toast.enter':'アファン、家に入る…', 'toast.back':'棚田にもどる' } };
const lang = new URLSearchParams(location.search).get('lang') || (navigator.language.startsWith('ja')?'ja':navigator.language.startsWith('en')?'en':'zh-Hant');
const t = k => (I18N[lang]||I18N['zh-Hant'])[k] || I18N['zh-Hant'][k];
const input = { l:false, r:false, act:false };
const hold = (id, k) => { const b = document.getElementById(id);
  const on = e => { e.preventDefault(); input[k] = true; }, off = e => { e.preventDefault(); if (k!=='act') input[k] = false; };
  b.addEventListener('pointerdown', on); ['pointerup','pointercancel','pointerleave'].forEach(ev => b.addEventListener(ev, off)); };
hold('L','l'); hold('R','r'); hold('A','act');

class Terrace extends Phaser.Scene {
  preload() {
    ['bg','farmhouse','tree_left','tree_right','path_front'].forEach(n => this.load.image(n, `img/${n}.webp`));
    this.load.json('spr', 'img/sprites.json');
    this.load.once('filecomplete-json-spr', () => { const s = this.cache.json.get('spr');
      ['walk_right','walk_left'].forEach(n => this.load.spritesheet(n, `img/${n}.webp`, {frameWidth:s[n].fw, frameHeight:s[n].fh})); });
  }
  create() {
    const spr = this.cache.json.get('spr'); this.spr = spr;
    // bg 稍放大，視差 0.92；path_front 視差 1.08
    this.add.image(WW/2, WH/2, 'bg').setScale(1.08).setScrollFactor(0.92, 1).setDepth(0);
    this.add.image(0,0,'farmhouse').setOrigin(0).setDepth(10);
    // 樹：以樹幹底部為軸心
    this.trees = [ {k:'tree_left', bx:358, by:850}, {k:'tree_right', bx:1766, by:840} ].map(o => {
      const im = this.add.image(o.bx, o.by, o.k).setOrigin(o.bx/WW, o.by/WH).setDepth(20); return {...o, im, busy:false}; });
    this.door = {x:1240};
    ['walk_right','walk_left'].forEach(k => this.anims.create({key:k, frames:this.anims.generateFrameNumbers(k,{start:0,end:spr[k].n-1}), frameRate:12, repeat:-1}));
    this.dir = 1;
    this.player = this.add.sprite(700, GROUND, 'walk_right', 0).setScale(0.75).setDepth(30);
    this.setOrigin();
    this.path = this.add.image(WW/2, WH, 'path_front').setOrigin(0.5,1).setScale(1.08).setScrollFactor(1.08, 1).setDepth(40);
    this.prompt = this.add.text(0,0,'',{fontSize:'30px',fontStyle:'bold',color:'#fff',backgroundColor:'#0009',padding:{x:12,y:6},resolution:2}).setOrigin(0.5,1).setDepth(60).setVisible(false);
    this.fade = this.add.rectangle(0,0,10,10,0x000000).setOrigin(0).setScrollFactor(0).setDepth(100).setAlpha(0);
    this.cameras.main.setBounds(0,0,WW,WH).startFollow(this.player, true, 0.12, 0.12);
    this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,A,D,SPACE,UP,W,ENTER');
    this.scale.on('resize', () => this.fit()); this.fit();
    this.inside = false; window.__demo = this;
  }
  setOrigin() { const m = this.spr[this.player.texture.key]; this.player.setOrigin(0.5, m.baseline/m.fh); }
  fit() { const w = this.scale.width, h = this.scale.height, z = h / WH;
    this.cameras.main.setZoom(Math.max(z, w / WW)); this.fade.setSize(w*4, h*4); }
  near() {
    const x = this.player.x;
    const tr = this.trees.find(o => Math.abs(o.bx - x) < 170); if (tr) return {type:'tree', o:tr, x:tr.bx, y:tr.by-500};
    if (Math.abs(this.door.x - x) < 110) return {type:'door', x:this.door.x, y:540};
    return null;
  }
  act(n) {
    if (n.type === 'tree' && !n.o.busy) { n.o.busy = true;
      this.tweens.add({targets:n.o.im, angle:{from:0,to:3}, duration:90, yoyo:true, repeat:3, ease:'Sine.inOut',
        onYoyo:(tw)=>{}, onComplete:()=>{ this.tweens.add({targets:n.o.im, angle:{from:0,to:-2}, duration:110, yoyo:true, onComplete:()=>{ n.o.im.angle=0; n.o.busy=false; }}); }});
      this.cameras.main.shake(120, 0.002);
    } else if (n.type === 'door' && !this.inside) { this.inside = true;
      this.tweens.add({targets:this.player, alpha:0, scale:0.6, y:GROUND-30, duration:500});
      this.tweens.add({targets:this.fade, alpha:1, duration:700, onComplete:()=>{
        this.toast(t('toast.enter'));
        this.time.delayedCall(1400, () => { this.toast(t('toast.back'));
          this.tweens.add({targets:this.fade, alpha:0, duration:600});
          this.tweens.add({targets:this.player, alpha:1, scale:0.75, y:GROUND, duration:500, onComplete:()=>{ this.inside=false; }}); }); }});
    }
  }
  toast(s) { const h = document.getElementById('hint'); h.textContent = s; }
  update(_, dt) {
    const k = this.keys;
    const L = !this.inside && (k.LEFT.isDown || k.A.isDown || input.l), R = !this.inside && (k.RIGHT.isDown || k.D.isDown || input.r);
    const mv = (R?1:0) - (L?1:0);
    if (mv) { this.dir = mv; const key = mv>0?'walk_right':'walk_left';
      if (this.player.anims.currentAnim?.key !== key || !this.player.anims.isPlaying) { this.player.play(key, true); this.setOrigin(); }
      this.player.x = Phaser.Math.Clamp(this.player.x + mv * 0.26 * dt, 80, WW-80);
    } else if (this.player.anims.isPlaying) { this.player.anims.stop(); this.player.setTexture(this.dir>0?'walk_right':'walk_left', 0); this.setOrigin(); }
    const n = this.near();
    if (n && !this.inside) { this.prompt.setText((n.type==='tree'?'🌳 ':'🚪 ') + t('prompt.'+n.type)).setPosition(n.x, n.y).setVisible(true); }
    else this.prompt.setVisible(false);
    const pressed = Phaser.Input.Keyboard.JustDown(k.SPACE) || Phaser.Input.Keyboard.JustDown(k.UP) || Phaser.Input.Keyboard.JustDown(k.W) || Phaser.Input.Keyboard.JustDown(k.ENTER) || input.act;
    input.act = false;
    if (pressed && n) this.act(n);
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent:'game', backgroundColor:'#2b2a22',
  scale:{ mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight }, scene: Terrace });
})();
