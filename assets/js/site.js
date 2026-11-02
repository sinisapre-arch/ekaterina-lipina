/* ============================================================
   CONFIG
   ============================================================ */
var SITE = {
  // Set the showreel video id to embed it in-page (YouTube).
  // Leave empty and the facade links out to the channel instead.
  reelVideoId: 'E5tqiFIlmmo',
  reelChannel: 'https://youtube.com/@esyasosnovaya',
  // Primary endpoint: Cloudflare worker holding the bot token server-side.
  // Same contract as the PlanoLand2 site.
  telegramWorker: 'https://mscw-esya-bot.sinisapre.workers.dev',
  // Same-origin fallback, identical contract.
  contactEndpoint: '/api/contact'
};

/* If a video id is set the facade embeds it in-page; without one it hands the
   visitor over to the channel, so the label follows the behaviour. */
if (SITE.reelVideoId) {
  var reelNote = document.querySelector('.reel__note');
  if (reelNote) {
    reelNote.setAttribute('data-en', 'Click to load from YouTube');
    reelNote.setAttribute('data-ru', 'Нажмите — загрузка с YouTube');
  }
}

/* ---------- scroll progress ---------- */
var prog = document.getElementById('prog');
function onScroll(){
  if(!prog) return;
  var h = document.documentElement;
  var max = h.scrollHeight - h.clientHeight;
  prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
}
window.addEventListener('scroll', onScroll, {passive:true});
onScroll();

/* ---------- reveal on enter ---------- */
var rv = new IntersectionObserver(function(entries){
  entries.forEach(function(e){
    if(e.isIntersecting){ e.target.classList.add('in'); rv.unobserve(e.target); }
  });
},{threshold:.12, rootMargin:'0px 0px -6% 0px'});
document.querySelectorAll('.sec__head, .format, .about__art, .about__copy, .facts, .brandgroup, .brands__art, .philo > div, .comp, .reel__head > div, .reel__frame, .contact__copy, .contact__links, .contact__art, .foot__grid > div, .hero__copy, .pf__head > div, .pf__stats > div, .pf__block, .pf__row, .pf__media, .pf__tile, .pf__note').forEach(function(el){
  el.classList.add('rv'); rv.observe(el);
});

/* ---------- EN / RU toggle ---------- */
var TITLES = {
  ru: document.documentElement.getAttribute('data-title-ru') || 'Екатерина Сосноватая — Ведущая шоу и мероприятий',
  en: document.documentElement.getAttribute('data-title-en') || 'Ekaterina Sosnovaya — Show Host & Presenter'
};
function setLang(lang){
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-en][data-ru]').forEach(function(el){
    el.innerHTML = el.getAttribute('data-' + lang);
  });
  document.querySelectorAll('[data-lang]').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-lang') === lang);
  });
  document.title = TITLES[lang];
  try{ localStorage.setItem('el-lang', lang); }catch(e){}
}
document.querySelectorAll('[data-lang]').forEach(function(b){
  b.addEventListener('click', function(){ setLang(b.getAttribute('data-lang')); });
});
var saved = null;
try{ saved = localStorage.getItem('el-lang'); }catch(e){}
setLang(saved || 'ru');

/* ---------- showreel facade ---------- */
var reelbox = document.getElementById('reelbox');
var reelFrame = document.querySelector('[data-reel-frame]');

function openReel(){
  if(!reelbox || !reelFrame) return;
  if(!SITE.reelVideoId){
    window.open(SITE.reelChannel, '_blank', 'noopener');
    return;
  }
  reelFrame.innerHTML =
    '<iframe src="https://www.youtube-nocookie.com/embed/' + SITE.reelVideoId +
    '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="Showreel" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
  reelbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeReel(){
  if(!reelbox || !reelFrame) return;
  reelbox.classList.remove('open');
  reelFrame.innerHTML = '';
  document.body.style.overflow = '';
}
document.querySelectorAll('[data-open-reel]').forEach(function(b){ b.addEventListener('click', openReel); });
var reelClose = document.querySelector('[data-close-reel]');
if(reelClose) reelClose.addEventListener('click', closeReel);
if(reelbox) reelbox.addEventListener('click', function(e){ if(e.target === reelbox) closeReel(); });

/* ---------- booking modal ---------- */
var booking = document.getElementById('booking');
var bkForm = document.getElementById('bk-form');
var bkStatus = document.getElementById('bk-status');
var bkSubmit = document.getElementById('bk-submit');
var lastFocus = null;

function openBooking(){
  if(!booking) return;
  lastFocus = document.activeElement;
  booking.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(function(){ document.getElementById('bk-name').focus(); }, 60);
}
function closeBooking(){
  if(!booking) return;
  booking.classList.remove('open');
  document.body.style.overflow = '';
  bkStatus.textContent = '';
  bkStatus.className = 'modal__status';
  if(lastFocus && lastFocus.focus) lastFocus.focus();
}
document.querySelectorAll('[data-open-booking]').forEach(function(b){ b.addEventListener('click', openBooking); });
var bkClose = document.querySelector('[data-close-booking]');
if(bkClose) bkClose.addEventListener('click', closeBooking);
if(booking) booking.addEventListener('click', function(e){ if(e.target === booking) closeBooking(); });

if(bkForm) bkForm.addEventListener('submit', function(e){
  e.preventDefault();
  var name = document.getElementById('bk-name');
  var phone = document.getElementById('bk-phone');
  var email = document.getElementById('bk-email');
  var company = document.getElementById('bk-company');
  var callback = document.getElementById('bk-callback');
  var ok = true;

  [name, phone].forEach(function(f){ f.classList.remove('err'); });
  if(!name.value.trim()){ name.classList.add('err'); ok = false; }
  if(!phone.value.trim()){ phone.classList.add('err'); ok = false; }
  if(!ok){
    bkStatus.className = 'modal__status err';
    bkStatus.textContent = document.documentElement.lang === 'ru'
      ? 'Заполните имя и номер телефона.'
      : 'Please fill in your name and phone number.';
    return;
  }
  if(company.value){ return; }  // honeypot — pretend it went through

  bkSubmit.disabled = true;
  bkStatus.className = 'modal__status';
  bkStatus.textContent = document.documentElement.lang === 'ru' ? 'Отправляю…' : 'Sending…';

  // Same body shape as the PlanoLand2 worker: the client formats the message
  // with emoji markers, the worker only relays it to Telegram.
  var lines = ['📞 ' + phone.value.trim()];
  if(email.value.trim()) lines.push('✉️ ' + email.value.trim());
  if(callback.checked) lines.push('🔔 ' + (document.documentElement.lang === 'ru'
    ? 'Запрошен обратный звонок'
    : 'Callback requested'));
  var payload = {
    name: name.value.trim(),
    message: lines.join('\n'),
    projectType: 'booking',
    company: company.value
  };

  function post(url){
    return fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    }).then(function(r){
      return r.json().then(function(d){ return {ok:r.ok, data:d}; })
                   .catch(function(){ return {ok:r.ok, data:{}}; });
    });
  }

  // Worker first; if it is unreachable or refuses, fall back to the
  // same-origin endpoint. Both hold the token server-side.
  post(SITE.telegramWorker)
    .then(function(res){
      if(res.ok && res.data && res.data.success) return res;
      return post(SITE.contactEndpoint);
    })
    .catch(function(){
      return post(SITE.contactEndpoint);
    })
    .then(function(res){
      bkSubmit.disabled = false;
      if(res && res.ok && res.data && res.data.success){
        bkStatus.className = 'modal__status ok';
        bkStatus.textContent = document.documentElement.lang === 'ru'
          ? 'Спасибо! Запрос отправлен — я свяжусь с вами.'
          : 'Thank you! Your enquiry is in — I will be in touch.';
        bkForm.reset();
      }else{
        bkStatus.className = 'modal__status err';
        var msg = (res && res.data && res.data.error) ? res.data.error : 'error';
        bkStatus.textContent = document.documentElement.lang === 'ru'
          ? 'Не удалось отправить. Напишите, пожалуйста, в Telegram: ' + msg
          : 'Could not send. Please write on Telegram instead: ' + msg;
      }
    })
    .catch(function(){
      bkSubmit.disabled = false;
      bkStatus.className = 'modal__status err';
      bkStatus.textContent = document.documentElement.lang === 'ru'
        ? 'Нет соединения. Напишите, пожалуйста, в Telegram или WhatsApp.'
        : 'No connection. Please write on Telegram or WhatsApp instead.';
    });
});

/* ---------- mobile menu ---------- */
var mnav = document.getElementById('mnav');
var burger = document.querySelector('[data-menu-toggle]');
function setMenu(open){
  if(!mnav || !burger) return;
  if(open){
    mnav.removeAttribute('hidden');
    burger.classList.add('on');
    burger.setAttribute('aria-expanded','true');
    document.body.style.overflow = 'hidden';
  }else{
    mnav.setAttribute('hidden','');
    burger.classList.remove('on');
    burger.setAttribute('aria-expanded','false');
    document.body.style.overflow = '';
  }
}
if(burger && mnav){
  burger.addEventListener('click', function(){ setMenu(mnav.hasAttribute('hidden')); });
  mnav.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ setMenu(false); }); });
  mnav.querySelectorAll('[data-open-booking]').forEach(function(b){
    b.addEventListener('click', function(){ setMenu(false); });
  });
}

/* ---------- carousel ---------- */
var car = document.querySelector('[data-carousel]');
document.querySelectorAll('[data-car]').forEach(function(b){
  if(!car) return;
  b.addEventListener('click', function(){
    var dir = parseInt(b.getAttribute('data-car'), 10);
    var item = car.querySelector('.carousel__item');
    var step = item ? item.offsetWidth + 18 : 320;
    car.scrollBy({left: dir * step, behavior:'smooth'});
  });
});

/* ---------- esc closes overlays ---------- */
document.addEventListener('keydown', function(e){
  if(e.key !== 'Escape') return;
  if(reelbox && reelbox.classList.contains('open')) closeReel();
  if(booking && booking.classList.contains('open')) closeBooking();
  if(mnav && !mnav.hasAttribute('hidden')) setMenu(false);
});

/* ---------- print / save as PDF (portfolio page) ---------- */
document.querySelectorAll('[data-print]').forEach(function(b){
  b.addEventListener('click', function(){ window.print(); });
});

/* ---------- reduced motion ---------- */
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  document.querySelectorAll('.rv').forEach(function(el){ el.classList.add('in'); });
}
