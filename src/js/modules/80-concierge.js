(function () {
  'use strict';
  var S = window.SWK;
  S.reg('concierge', function () {
    var toggle=S.$('[data-chat-toggle]'), panel=S.$('#swk-chat-panel');
    if(!toggle || !panel) return;
    var input=S.$('#swk-chat-input'), log=S.$('[data-chat-log]'), transcript=[];
    function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}
    toggle.addEventListener('click',function(){panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden) input.focus();});
    S.$('[data-chat-close]').addEventListener('click',close);
    panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close();}});
    function add(text,user){var p=document.createElement('p');p.className='swk-chat__message'+(user?' swk-chat__message--user':'');p.textContent=text;log.appendChild(p);log.scrollTop=log.scrollHeight;while(log.children.length>30)log.firstElementChild.remove();}
    function reply(text){
      var q=text.toLowerCase(), answer;
      if(/human|speak|agent|person|live|contact/.test(q))answer='Our team can pick this up on WhatsApp. Use the button below to share this conversation. Availability depends on the team; this assistant cannot confirm that an agent is online.';
      else if(/off.?plan|payment|developer/.test(q))answer='For an off-plan shortlist, tell SWK your budget, preferred area and target handover date. Ask for the payment schedule, project registration details and what is included in the price. Explore current options on our Properties page, then confirm availability with a consultant.';
      else if(/sell|valuation/.test(q))answer='Selling in Dubai? Share the community, building, property type and whether it is tenanted with our team. A useful valuation compares similar homes and their condition. Use WhatsApp below to request a property-specific conversation; please do not post identity documents here.';
      else if(/rent|yield|invest|roi/.test(q))answer='Start with the purchase price, realistic rent, service charges, maintenance and expected vacancy. Our mortgage calculator can help with financing estimates. Returns are not guaranteed; SWK can help you compare the assumptions behind a shortlist.';
      else if(/mortgage|loan|financ/.test(q))answer='Our Mortgage page includes a calculator for monthly payment estimates. Share your purchase budget and whether you are a resident with the SWK team for a personal discussion. Rates and eligibility need confirmation with a lender.';
      else if(/buy|home|villa|apartment|budget|bedroom/.test(q))answer='To build a useful shortlist, tell us your budget in AED, preferred neighbourhood, number of bedrooms and whether you want to move in or invest. Browse the Properties page or use the WhatsApp button to send your brief directly to SWK.';
      else answer='I can help with buying, off-plan homes, selling and the next steps in a Dubai property search. For current prices, availability or a question specific to you, send your brief to the SWK team using the WhatsApp button below.';
      add(text,true);add(answer,false);transcript.push('You: '+text,'SWK assistant: '+answer);transcript=transcript.slice(-12);
      S.$('[data-chat-handoff]').href='https://wa.me/971564330448?text='+encodeURIComponent('Hello SWK, I would like a consultant to help.\n\n'+transcript.join('\n'));
    }
    S.$('[data-chat-form]').addEventListener('submit',function(e){e.preventDefault();var text=input.value.trim();if(!text)return;reply(text.slice(0,1000));input.value='';});
    S.$$('[data-chat-topic]').forEach(function(b){b.addEventListener('click',function(){reply(b.textContent);});});
  });
  S.reg('review-stories',function(){
    var root=S.$('[data-review-carousel]');if(!root)return;
    var slides=S.$$('[data-review-slide]',root),i=0,paused=S.reduced,timer,pause=S.$('[data-review-pause]',root);
    function show(n){i=(n+slides.length)%slides.length;slides.forEach(function(s,k){s.hidden=k!==i;});S.$('[data-review-count]',root).textContent=(i+1)+' / '+slides.length;}
    function stop(){clearInterval(timer);}
    function start(){stop();if(!paused&&!document.hidden)timer=setInterval(function(){show(i+1);},8000);}
    S.$('[data-review-prev]',root).addEventListener('click',function(){show(i-1);start();});
    S.$('[data-review-next]',root).addEventListener('click',function(){show(i+1);start();});
    function label(){pause.textContent=paused?'Play':'Pause';pause.setAttribute('aria-pressed',String(paused));}
    pause.addEventListener('click',function(){paused=!paused;label();start();});
    root.addEventListener('mouseenter',stop);root.addEventListener('mouseleave',start);
    root.addEventListener('focusin',stop);root.addEventListener('focusout',function(e){if(!root.contains(e.relatedTarget))start();});
    document.addEventListener('visibilitychange',start);label();start();
  });
  S.reg('premium-pointer',function(){
    if(S.reduced||!S.fine)return;
    S.$$('.fan-card,.service-card').forEach(function(card){
      var point={clientX:0,clientY:0}; var update=S.raf(function(){var e=point;var r=card.getBoundingClientRect();card.style.setProperty('--image-x',((e.clientX-r.left)/r.width-.5)*-12+'px');card.style.setProperty('--image-y',((e.clientY-r.top)/r.height-.5)*-12+'px');card.style.setProperty('--spot-x',e.clientX-r.left+'px');card.style.setProperty('--spot-y',e.clientY-r.top+'px');}); card.addEventListener('pointermove',function(e){point.clientX=e.clientX;point.clientY=e.clientY;update();});
      card.addEventListener('pointerleave',function(){card.style.setProperty('--image-x','0px');card.style.setProperty('--image-y','0px');});
    });
  });
})();
