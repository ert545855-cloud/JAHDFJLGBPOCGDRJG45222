const SAVE_KEY = 'swipeup-city-mercan-web-v1';
const JOB_NAMES = { Barista:'Barista', Courier:'Kurye', Taxi:'Taksici', Photographer:'Fotoğrafçı' };
const JOB_ACTIONS = {
  Barista: ['Kahveyi hazırla','Kahveyi teslim et'],
  Courier: ['Paketi teslim al','Paketi teslim et'],
  Taxi: ['İlk yolcuyu al','Parktan ikinci yolcuyu al','Yolcuları indir'],
  Photographer: ['Fotoğrafı çek','Fotoğrafı çek','Albümü teslim et'],
};
const RUN_ROUTE = ['Stage','Overlook','Marina'];
const BASE = { cash:280, cafeLevel:0, supplies:0, keys:3, community:0, shifts:0, orders:0, job:null, step:0, open:false };
const asInt = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? Math.trunc(v) : min));
const capacity = level => level ? 6 + level * 6 : 0;

export class CityLife {
  constructor(world, storage = null) {
    this.world = world;
    this.store = storage;
    this.jobs = new Map(world.jobs.map(job => [job.id, job]));
    this.state = { ...BASE };
    this.clock = 0;
    this.orderAt = 8;
    this.lastActivity = -30;
    this.activity = null;
    this.notice = '';
    this.noticeUntil = 0;
    if (storage) {
      try {
        const raw = JSON.parse(storage.getItem(SAVE_KEY));
        if (raw?.version === 1) {
          const job = this.jobs.get(raw.job);
          this.state = {
            cash:asInt(raw.cash,0,1e8), cafeLevel:asInt(raw.cafeLevel,0,3),
            supplies:asInt(raw.supplies,0,capacity(asInt(raw.cafeLevel,0,3))), keys:asInt(raw.keys,0,63)|3,
            community:asInt(raw.community,0,1e8), shifts:asInt(raw.shifts,0,1e8), orders:asInt(raw.orders,0,1e8),
            job:job?.id ?? null, step:job ? asInt(raw.step,0,job.steps.length-1) : 0, open:false,
          };
          this.state.open = !!(raw.open && this.state.cafeLevel && this.state.supplies);
        }
      } catch { /* A new session remains available if browser storage is inaccessible. */ }
    }
  }

  notify(text) {
    this.notice = text;
    this.noticeUntil = this.clock + 5;
  }

  commit(next, message) {
    if (this.store) {
      try { this.store.setItem(SAVE_KEY, JSON.stringify({ ...next, version:1 })); }
      catch { this.notify('Tarayıcı kaydı yazılamadı. İşlem uygulanmadı.'); return false; }
    }
    this.state = next;
    this.notify(message);
    return true;
  }

  ownsCar(index) { return index >= 0 && index < this.world.vehicles.length && !!(this.state.keys & (1 << index)); }

  choices(place, car, speed = 0) {
    const s = this.state;
    const choices = [];
    const add = (id,label) => choices.push({id,label});
    const active = this.jobs.get(s.job);
    const step = active?.steps[s.step];
    if (step?.station === place && step.vehicle === car) add('work', JOB_ACTIONS[s.job][s.step]);
    if (active?.employer === place) add('quit','Vardiyayı bırak');
    if (car) return s.job === 'Taxi' && Math.abs(speed) <= 1.12 ? choices : [];

    if (place === 'Cafe') {
      if (!s.cafeLevel) add('buyCafe','Mercan Kafe’yi devral · 850 kredi');
      else {
        if (s.open) add('serve', this.clock >= this.orderAt ? 'Kahveyi servis et' : 'Yeni sipariş bekleniyor');
        add('open',s.open ? 'Kafeyi kapat' : 'Kafeyi aç');
        if (s.supplies < capacity(s.cafeLevel)) {
          const amount = Math.min(5,capacity(s.cafeLevel)-s.supplies);
          add('stock',amount+' malzeme al · '+amount*15+' kredi');
        }
        if (s.cafeLevel < 3) add('upgrade','Kafeyi yükselt · '+(s.cafeLevel===1 ? 460 : 820)+' kredi');
      }
    }
    if (!active) {
      const assignment = this.world.jobs.find(job => job.employer === place);
      if (assignment) add('job-'+assignment.id,JOB_NAMES[assignment.id]+' vardiyası · '+assignment.pay+' kredi');
    }
    if (place === 'Stage') add('dance','Ritim dansına katıl');
    if (place === 'Training') { add('yoga','Kıyı yogasına katıl'); add('run','Sahil koşusuna katıl'); }
    if (place === 'Garage') {
      for (const [index,item] of this.world.vehicles.entries()) {
        add('car-'+index,item.name+' · '+(this.ownsCar(index) ? 'Sende' : item.price+' kredi'));
      }
    }
    return choices;
  }

  select(id, place, car, speed = 0) {
    if (!this.choices(place,car,speed).some(item => item.id === id)) return false;
    if (id === 'dance' || id === 'yoga' || id === 'run') return this.startActivity(id);
    const s = { ...this.state };
    const pay = amount => {
      if (s.cash < amount) { this.notify('Bu işlem için kredin yetmiyor.'); return false; }
      s.cash -= amount;
      return true;
    };
    let result = 'Görev güncellendi.';
    if (id.startsWith('job-')) {
      s.job = id.slice(4); s.step = 0;
    } else if (id.startsWith('car-')) {
      const index = Number(id.slice(4)), vehicle = this.world.vehicles[index];
      if (this.ownsCar(index)) { this.notify('Bu aracın anahtarı sende.'); return false; }
      if (!pay(vehicle.price)) return false;
      s.keys |= 1 << index;
      result = vehicle.name+' anahtarların arasına eklendi.';
    } else if (id === 'work') {
      const job = this.jobs.get(s.job);
      if (++s.step === job.steps.length) {
        s.cash = Math.min(1e8,s.cash+job.pay); s.shifts++; s.job = null; s.step = 0;
        result = 'Vardiya bitti. +'+job.pay+' kredi';
      }
    } else if (id === 'quit') {
      s.job = null; s.step = 0; result = 'Vardiya bırakıldı.';
    } else if (id === 'buyCafe') {
      if (!pay(850)) return false;
      s.cafeLevel = 1; s.supplies = 4; result = 'Mercan Kafe artık senin.';
    } else if (id === 'open') {
      if (!s.open && !s.supplies) { this.notify('Önce malzeme al.'); return false; }
      s.open = !s.open; result = s.open ? 'Kafe açıldı. İlk sipariş birazdan hazır.' : 'Kafe kapandı.';
    } else if (id === 'stock') {
      const amount = Math.min(5,capacity(s.cafeLevel)-s.supplies);
      if (!pay(amount*15)) return false;
      s.supplies += amount; result = 'Kafe malzemeleri yenilendi.';
    } else if (id === 'upgrade') {
      if (!pay(s.cafeLevel===1 ? 460 : 820)) return false;
      s.cafeLevel++; result = 'Yeni dekor ve daha geniş stok alanı eklendi.';
    } else if (id === 'serve') {
      if (this.clock < this.orderAt) { this.notify('Yeni müşteri birazdan gelecek.'); return false; }
      const price = 40+s.cafeLevel*16;
      s.supplies--; s.orders++; s.cash = Math.min(1e8,s.cash+price);
      if (!s.supplies) s.open = false;
      result = 'Kahve servis edildi. +'+price+' kredi';
    }
    if (!this.commit(s,result)) return false;
    if (id==='open' || id==='serve') this.orderAt = this.clock+8;
    return true;
  }

  startActivity(type) {
    if (this.activity) { this.notify('Bir etkinlik zaten devam ediyor.'); return false; }
    if (this.clock-this.lastActivity<12) { this.notify('Bir sonraki grup birazdan başlıyor.'); return false; }
    this.activity = { type, started:this.clock, progress:0 };
    return true;
  }

  danceBeat(place) {
    const a=this.activity;
    if (a?.type!=='dance' || place!=='Stage') return false;
    const delta = this.clock-a.started-(a.progress+1)*1.13;
    if (Math.abs(delta)<=.28 && ++a.progress===4) this.finish(85);
    return true;
  }

  finish(reward) {
    this.activity=null;
    this.lastActivity=this.clock;
    this.commit({...this.state,cash:Math.min(1e8,this.state.cash+reward),community:this.state.community+1},
      'Etkinlik tamamlandı. +'+reward+' kredi ve 1 sosyal puan.');
  }

  tick(dt, place, car, speed) {
    this.clock+=dt;
    if (this.clock>=this.noticeUntil) this.notice='';
    const a=this.activity;
    if (!a) return;
    const elapsed=this.clock-a.started;
    if (car || (a.type==='dance'&&place!=='Stage') || (a.type==='yoga'&&place!=='Training')) {
      this.activity=null; this.notify('Etkinlik alanından ayrıldın.');
    } else if (a.type==='dance' && elapsed>(a.progress+1)*1.13+.28) {
      this.activity=null; this.notify('Ritmi kaçırdın. Yeniden katılabilirsin.');
    } else if (a.type==='yoga') {
      if (speed>.65) a.started=this.clock;
      else if (elapsed>=12) this.finish(65);
    } else if (a.type==='run') {
      if (elapsed>=42) { this.activity=null; this.notify('Koşu süresi doldu.'); }
      else if (place===RUN_ROUTE[a.progress] && ++a.progress===RUN_ROUTE.length) this.finish(115);
    }
  }

  objective() {
    const a=this.activity;
    if (a?.type==='dance') {
      const time=(a.progress+1)*1.13-(this.clock-a.started);
      return { text:(Math.abs(time)<=.28 ? 'Şimdi bas!' : 'Ritme '+Math.max(0,time).toFixed(1)+' sn')+' · '+a.progress+'/4' };
    }
    if (a?.type==='yoga') return { text:'Hareketsiz dur · '+Math.ceil(Math.max(0,12-(this.clock-a.started)))+' sn' };
    if (a?.type==='run') return {text:'Koşu '+a.progress+'/3 · '+Math.ceil(42-(this.clock-a.started))+' sn',station:RUN_ROUTE[a.progress]};
    const job=this.jobs.get(this.state.job);
    if (job) return {text:JOB_ACTIONS[job.id][this.state.step],station:job.steps[this.state.step].station};
    return null;
  }
}
