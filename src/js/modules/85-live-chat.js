(function () {
  'use strict';
  var S=window.SWK;
  function post(path,data){return fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),credentials:'same-origin'}).then(function(r){return r.json().catch(function(){return {error:'Live chat is not available on this host. Please use WhatsApp.'};}).then(function(v){if(!r.ok)throw Object.assign(new Error(v.error||'Please try again.'),{status:r.status});return v;});});}
  function draw(log,messages){
    var signature=JSON.stringify(messages);if(log.dataset.signature===signature)return;log.dataset.signature=signature;
    log.replaceChildren();messages.forEach(function(m){var p=document.createElement('p');p.className='swk-chat__message'+(m.author==='visitor'?' swk-chat__message--user':'');var label=document.createElement('strong');label.textContent=m.author==='operator'?'SWK team':'Visitor';var text=document.createElement('span');text.textContent=m.text;p.append(label,document.createElement('br'),text);log.append(p);});log.scrollTop=log.scrollHeight;
  }
  S.reg('swk-live',function(){
    var view=S.$('[data-live-view]');if(!view)return;
    var live=false,pending=false,session=null,timer,input=S.$('#swk-live-message'),status=S.$('[data-live-status]'),form=S.$('[data-live-form]'),log=S.$('[data-live-log]'),start=S.$('[data-live-start]'),restart=S.$('[data-live-restart]');
    try{session=JSON.parse(sessionStorage.getItem('swk_live_session')||'null');}catch(e){}
    function save(){try{if(session)sessionStorage.setItem('swk_live_session',JSON.stringify(session));else sessionStorage.removeItem('swk_live_session');}catch(e){}}
    function render(data){draw(log,data.messages||[]);status.textContent=data.closed?'This conversation is closed. You can start a new chat.':data.online?'An SWK operator is available. Your message is in the inbox.':'The team is currently offline. Your messages are saved for the next available operator.';form.hidden=!!data.closed;restart.hidden=!data.closed;start.hidden=!!session;}
    function fail(e){status.textContent=e.message||'Connection interrupted. Please try again.';if(e.status===404||e.status===403){session=null;save();start.hidden=false;form.hidden=false;restart.hidden=false;}}
    function refresh(){if(!live||document.hidden||S.$('#swk-chat-panel').hidden||pending)return;
      if(session){post('/api/chat',{action:'messages',id:session.id,token:session.token}).then(render).catch(fail);}
      else post('/api/chat',{action:'status'}).then(function(d){status.textContent=!d.configured?'SWK Live Chat is being set up. Reach our team on WhatsApp below.':d.online?'An SWK operator is available. Send a message to begin.':'SWK is offline. Leave a message for the team, or contact us on WhatsApp.';}).catch(fail);
    }
    S.$$('[data-chat-tab]').forEach(function(b){b.addEventListener('click',function(){live=b.dataset.chatTab==='live';view.hidden=!live;S.$('[data-assistant-view]').hidden=live;S.$$('[data-chat-tab]').forEach(function(t){t.setAttribute('aria-pressed',String(t===b));});clearInterval(timer);if(live){start.hidden=!!session;refresh();timer=setInterval(refresh,7000);}});});
    form.addEventListener('submit',function(e){e.preventDefault();if(pending)return;var text=input.value.trim();if(!text)return;
      if(!session&&!S.$('[data-live-consent]').checked){status.textContent='Please agree to share this conversation with SWK before sending.';return;}
      pending=true;var button=S.$('button[type=submit]',form);button.disabled=true;
      var data=session?{action:'send',id:session.id,token:session.token,text:text}:{action:'start',name:S.$('#swk-live-name').value.trim(),text:text,consent:true};
      post('/api/chat',data).then(function(d){if(d.id){session={id:d.id,token:d.token};save();}input.value='';render(d);}).catch(fail).finally(function(){pending=false;button.disabled=false;});
    });
    restart.addEventListener('click',function(){session=null;save();log.replaceChildren();log.dataset.signature='';start.hidden=false;form.hidden=false;restart.hidden=true;refresh();});
    document.addEventListener('visibilitychange',refresh);
  });
  S.reg('swk-inbox',function(){
    var login=S.$('[data-inbox-login]');if(!login)return;
    var workspace=S.$('[data-inbox-workspace]'),status=S.$('[data-inbox-status]'),threads=S.$('[data-inbox-threads]'),log=S.$('[data-inbox-messages]'),reply=S.$('[data-inbox-reply]'),available=S.$('[data-inbox-online]');
    var active=null,timer=null,busy=false,signedIn=false;
    function request(data){return post('/api/chat-admin',data);}
    function fail(e){status.textContent=e.message;if(e.status===401){signedIn=false;clearInterval(timer);workspace.hidden=true;login.hidden=false;available.checked=false;}}
    function select(t){active=t;S.$('[data-inbox-name]').textContent=t.name;reply.hidden=!!t.closed;request({action:'messages',id:t.id}).then(function(d){draw(log,d.messages);reply.hidden=d.closed;}).catch(fail);}
    function refresh(){if(!signedIn||document.hidden||busy)return;busy=true;request({action:'threads'}).then(function(d){threads.replaceChildren();if(!d.threads.length){threads.textContent='No conversations yet.';}d.threads.forEach(function(t){var b=document.createElement('button');b.type='button';b.className='inbox-thread';b.setAttribute('aria-pressed',String(active&&active.id===t.id));var name=document.createElement('strong');name.textContent=t.name+(t.closed?' · Closed':t.lastAuthor==='visitor'?' · Needs reply':'');var preview=document.createElement('span');preview.textContent=t.preview||'';b.append(name,preview);b.addEventListener('click',function(){select(t);});threads.append(b);});if(active){var current=d.threads.find(function(t){return t.id===active.id;});if(current)select(current);}}).catch(fail).finally(function(){busy=false;});if(available.checked)request({action:'presence',online:true}).catch(fail);}
    function enter(){signedIn=true;workspace.hidden=false;login.hidden=true;status.textContent='Signed in. Turn on availability when you are ready to reply.';clearInterval(timer);timer=setInterval(refresh,10000);refresh();}
    login.addEventListener('submit',function(e){e.preventDefault();var password=S.$('#inbox-password'),value=password.value;password.value='';request({action:'login',password:value}).then(enter).catch(fail);});
    available.addEventListener('change',function(){request({action:'presence',online:available.checked}).then(function(d){status.textContent=d.online?'You are available for live chat.':'You are offline. Customers can still leave messages.';}).catch(fail);});
    S.$('[data-inbox-logout]').addEventListener('click',function(){request({action:'logout'}).then(function(){signedIn=false;clearInterval(timer);workspace.hidden=true;login.hidden=false;available.checked=false;threads.replaceChildren();log.replaceChildren();active=null;status.textContent='Signed out.';}).catch(fail);});
    reply.addEventListener('submit',function(e){e.preventDefault();if(!active)return;var input=S.$('#inbox-reply'),button=S.$('button[type=submit]',reply),text=input.value.trim();if(!text)return;button.disabled=true;request({action:'reply',id:active.id,text:text}).then(function(d){input.value='';draw(log,d.messages);status.textContent='Reply sent.';refresh();}).catch(fail).finally(function(){button.disabled=false;});});
    S.$('[data-inbox-close]').addEventListener('click',function(){if(!active)return;request({action:'close',id:active.id}).then(function(){reply.hidden=true;refresh();}).catch(fail);});
    document.addEventListener('visibilitychange',function(){if(document.hidden&&signedIn&&available.checked)request({action:'presence',online:false}).catch(function(){});else refresh();});
    request({action:'threads'}).then(enter).catch(fail);
  });
})();
