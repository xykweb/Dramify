"use strict";

// Each drama shares one poster across the two title conditions.
const dramas = Array.from({length:16}, (_, index) => ({
  id: index + 1,
  a: {image:`assets/posters/幻灯片${index + 1}.jpeg`},
  b: {image:`assets/posters/幻灯片${index + 1}.jpeg`}
}));

function selectStimuli(condition) {
  return dramas.map(drama => {
    const version = (drama.id % 2 === 1) === (condition === "A") ? "a" : "b";
    return { id: drama.id, version, ...drama[version] };
  });
}

function shuffle(stimuli) {
  const result = [...stimuli];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// All behavioral fields are keyed by the complete image/title stimulus version.
const dramifyIcons = {
  play:'<path d="m9 5 11 7-11 7V5Z"/>',
  watchlist:'<path d="M12 4v16M4 12h16"/>',
  liked:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  saved:'<path d="M6 3h12v19l-6-4-6 4V3Z"/>',
  shared:'<path d="m14 3 8 7-8 7v-5C7 12 4 16 2 20c0-9 4-14 12-14V3Z"/>',
  lock:'<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3"/>',
  check:'<path d="m5 12 4 4L20 5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
};
// Anchor images to the script directory, including deployments under /Dramify/.
const dramifyScriptBase = typeof document !== "undefined" && document.currentScript?.src ? new URL(".", document.currentScript.src).href : "";
function setDramaImage(image, drama) {
  image.src = dramifyScriptBase ? new URL(drama.image, dramifyScriptBase).href : drama.image;

}
function dramaIcon(name) {return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">${dramifyIcons[name]}</svg>`;}

function initializeDramify(participant) {
  const key = "dramify.participant.v1";
  const grid = document.querySelector(".drama-grid");
  const detail = document.querySelector(".drama-detail");
  const walletView = document.querySelector(".wallet-view");
  const heading = document.querySelector("main h1");
  const search = document.querySelector("input[type=search]");
  const empty = document.querySelector(".empty-message");
  const notice = document.querySelector(".wallet-notice");
  const insufficientDialog = document.querySelector(".insufficient-coins-dialog");
  const nav = {home:document.querySelector(".browse-all"),watchlist:document.querySelector(".my-watchlist-button"),liked:document.querySelector(".liked-button"),saved:document.querySelector(".watchlist-filter")};
  let currentView = "home", currentDrama = null;
  if (dramas.some(drama => !drama.a.title || !drama.b.title)) throw new Error("Drama content must be loaded from Excel before rendering");
  const selected = selectStimuli(participant.condition);
  const validOrder = Array.isArray(participant.dramaOrder) && participant.dramaOrder.length === 16 && new Set(participant.dramaOrder).size === 16 && participant.dramaOrder.every(id => Number.isInteger(id) && id >= 1 && id <= 16);
  if (!validOrder) participant.dramaOrder = shuffle(selected).map(drama => drama.id);
  const byId = new Map(selected.map(drama => [drama.id,drama]));
  const displayed = participant.dramaOrder.map(id => byId.get(id));
  const stimulusKey = drama => `${drama.id}${drama.version}`;
  function read() {
    const record = JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY(key)) || "null");
    if (!record || record.id !== participant.id) throw new Error("Participant changed");
    return record;
  }
  // Migrate previous pre-orders to free saves, refunding their old coin cost.
  // Do not reinterpret a former pre-order as a paid unlock in the new study.
  if (participant.wallet?.policyVersion !== 3) {
    const legacySaved = participant.wallet?.watchlist || [];
    participant.behaviors = {...participant.behaviors};
    for (const id of legacySaved) {
      const drama = byId.get(id);
      if (drama) participant.behaviors[stimulusKey(drama)] = {...participant.behaviors[stimulusKey(drama)],saved:true};
    }
    participant.wallet = {policyVersion:3,balance:100,unlocked:[],transactions:[{type:"registration",amount:100,at:new Date().toISOString()}]};
  }
  participant.behaviors ||= {};
  participant.behaviorEvents ||= [];
  participant.interfaceVersion = "cards-v5";
  localStorage.setItem(window.DRAMIFY_STORAGE_KEY(key),JSON.stringify(participant));
  window.dramifyCondition = participant.condition;
  window.dramifyOrder = [...participant.dramaOrder];

  function state(record,drama) {return record.behaviors?.[stimulusKey(drama)] || {};}
  function notify(message) {notice.textContent=message;notice.hidden=false;}
  function save(change) {
    try {
      const record = read();
      change(record);
      localStorage.setItem(window.DRAMIFY_STORAGE_KEY(key),JSON.stringify(record));
      window.DramifyCloud.changed();
      return true;
    } catch (error) {notify("Your change could not be saved. Please refresh and try again.");return false;}
  }
  function event(record,drama,action,value) {
    record.behaviorEvents ||= [];
    record.behaviorEvents.push({dramaId:drama.id,version:drama.version,action,value,at:new Date().toISOString()});
  }
  function selectedWatchlistLabel(record,drama) {return state(record,drama).watchlist ? "Remove from my watchlist" : "Add to my watchlist";}
  function actionButton(drama,action,record) {
    const button = document.createElement("button");
    button.type="button";button.className=`drama-action action-${action}`;
    const labels={watchlist:selectedWatchlistLabel(record,drama),liked:"Like",saved:"Save"};
    const selected=Boolean(state(record,drama)[action]);
    button.innerHTML=dramaIcon(action==="watchlist" && selected ? "check" : action);
    button.setAttribute("aria-label",`${labels[action]}: ${drama.title}`);
    button.dataset.tooltip=labels[action];
    if(action!=="play")button.setAttribute("aria-pressed",String(Boolean(state(record,drama)[action])));
    button.addEventListener("click",()=>{
      if(action==="play") {go(`drama/${drama.id}`);return;}
      if(action==="watchlist") {
        const latest=read();
        const count=displayed.filter(item=>state(latest,item).watchlist).length;
        if(!state(latest,drama).watchlist && count>=6) {
          const message="You can add up to 6 dramas to My Watchlist. Remove one before adding another.";
          document.querySelector(".watchlist-limit-message").textContent=message;
          document.querySelector(".watchlist-limit-dialog").showModal();
          return;
        }
      }
      if(save(record=>{
        record.behaviors ||= {};
        const behavior={...state(record,drama)};
        behavior[action]=!behavior[action];
        if(behavior[action])behavior[`${action}Count`]=(behavior[`${action}Count`]||0)+1;
        record.behaviors[stimulusKey(drama)]=behavior;
        event(record,drama,action,behavior[action]);
      }))render();
    });
    return button;
  }
  function ratingWidget(drama,record) {
    const widget=document.createElement("div");widget.className="interest-rating";
    const label=document.createElement("span");label.className="rating-label";label.textContent="Want to watch";
    const stars=document.createElement("div");stars.className="rating-stars";stars.setAttribute("role","group");stars.setAttribute("aria-label",`Want to watch: ${drama.title}`);
    const status=document.createElement("span");status.className="rating-status";status.setAttribute("aria-live","polite");
    const value=record.dramaRatings?.[stimulusKey(drama)]||0;
    status.textContent=value?`${value} / 5`:"Not rated";
    for(let i=1;i<=5;i++) {
      const star=document.createElement("button");star.type="button";star.className="rating-star";star.textContent="★";star.dataset.filled=String(i<=value);star.setAttribute("aria-pressed",String(i===value));star.setAttribute("aria-label",`${i} out of 5 stars`);
      star.addEventListener("click",()=>{if(save(latest=>{latest.dramaRatings ||= {};const next=latest.dramaRatings[stimulusKey(drama)]===i?0:i;if(next)latest.dramaRatings[stimulusKey(drama)]=next;else delete latest.dramaRatings[stimulusKey(drama)];event(latest,drama,"rating",next||null);} ))render();});
      stars.append(star);
    }
    widget.append(label,stars,status);return widget;
  }
  function card(drama,record) {
    const card=document.createElement("article");card.className="drama-card poster-card";card.dataset.id=drama.id;card.dataset.version=drama.version;
    const artwork=document.createElement("div");artwork.className="artwork";
    const image=document.createElement("img");setDramaImage(image,drama);image.alt=drama.title;image.decoding="async";
    const title=document.createElement("h2");title.className="poster-title";title.textContent=drama.title;
    const badge=document.createElement("span");badge.className="badge";badge.textContent="NEW";
    title.title=drama.title;
    artwork.append(image,title,badge);
    const controls=document.createElement("div");controls.className="poster-actions";
    for(const action of ["watchlist","liked","saved"])controls.append(actionButton(drama,action,record));
    card.append(artwork,controls);return card;
  }
  function requestUnlock(drama) {
    const record=read();
    if(record.wallet.unlocked.includes(stimulusKey(drama)))return;
    if(record.wallet.balance<20){insufficientDialog.showModal();return;}
    unlockDrama(drama);
  }

  function renderDetail(drama,record) {
    const unlocked=record.wallet.unlocked.includes(stimulusKey(drama));
    detail.replaceChildren();
    const back=document.createElement("button");back.type="button";back.className="detail-back";back.textContent="← Back to Home";back.addEventListener("click",()=>go("home"));
    const layout=document.createElement("div");layout.className="detail-layout";
    const left=document.createElement("div");left.className="detail-left";
    const preview=document.createElement("button");preview.type="button";preview.className="locked-preview";preview.setAttribute("aria-label",unlocked?"Drama unlocked":`Unlock ${drama.title} for 20 coins`);
    const image=document.createElement("img");setDramaImage(image,drama);image.alt="";
    const overlay=document.createElement("span");overlay.className="preview-lock";overlay.innerHTML=dramaIcon(unlocked?"check":"lock");
    const caption=document.createElement("span");caption.textContent=unlocked?"All 50 episodes unlocked":"Unlock all 50 episodes · 20 coins";overlay.append(caption);preview.append(image,overlay);preview.addEventListener("click",()=>requestUnlock(drama));
    left.append(preview);
    if (unlocked) {
      const cancel=document.createElement("button");cancel.type="button";cancel.className="cancel-unlock-button";cancel.textContent="Cancel unlock";
      cancel.addEventListener("click",()=>cancelUnlock(drama));
      left.append(cancel);
    }
    left.append(ratingWidget(drama,record));
    const right=document.createElement("div");right.className="detail-right";
    const title=document.createElement("h2");title.className="detail-title";title.textContent=drama.title;
    const copy=document.createElement("div");copy.className="detail-copy";
    if (drama.abstract) {
      const abstract=document.createElement("p");abstract.className="detail-abstract";abstract.textContent=drama.abstract;copy.append(abstract);
    }
    if (drama.tags?.length) {
      const tags=document.createElement("div");tags.className="detail-tags";
      for (const tag of drama.tags) {const label=document.createElement("span");label.textContent=tag;tags.append(label);}
      copy.append(tags);
    }
    const actions=document.createElement("div");actions.className="detail-actions";
    for(const action of ["liked","saved","shared"])actions.append(actionButton(drama,action,record));
    const episodesTitle=document.createElement("h3");episodesTitle.textContent="Episodes 1–50";
    const episodes=document.createElement("div");episodes.className="episode-grid";
    for(let i=1;i<=50;i++){
      const episode=document.createElement("button");episode.type="button";episode.className="episode-button";episode.setAttribute("aria-label",`Episode ${i}${unlocked?", unlocked":", locked"}`);
      const number=document.createElement("span");number.textContent=String(i);episode.append(number);
      if(!unlocked)episode.insertAdjacentHTML("beforeend",dramaIcon("lock"));
      episode.addEventListener("click",()=>requestUnlock(drama));episodes.append(episode);
    }
    right.append(title,copy,actions,episodesTitle,episodes);layout.append(left,right);detail.append(back,layout);
  }
  function renderWallet(record) {
    const balanceLabel=document.querySelector(".sidebar-balance");
    if(balanceLabel)balanceLabel.textContent=`${record.wallet.balance} coins`;
    document.querySelector(".wallet-balance").textContent=String(record.wallet.balance);
    const rows=record.wallet.transactions.map(transaction=>{
      const row=document.createElement("div");row.className="wallet-transaction";
      const label=document.createElement("span");label.textContent=transaction.type==="registration"?"Registration bonus":`${transaction.type==="unlock_cancel"?"Unlock cancelled":"Unlocked"}: ${byId.get(transaction.dramaId)?.title||"Drama"}`;
      const amount=document.createElement("strong");amount.textContent=`${transaction.amount>0?"+":""}${transaction.amount} coins`;row.append(label,amount);return row;
    });
    document.querySelector(".wallet-transactions").replaceChildren(...rows);
  }
  function render() {
    const record=read();renderWallet(record);
    document.querySelector(".selection-complete-bar").hidden=displayed.filter(item=>state(record,item).watchlist).length!==6;
    document.querySelector(".home-promotion").hidden=currentView!=="home";
    for(const [view,button] of Object.entries(nav))button.setAttribute("aria-pressed",String(view===currentView));
    detail.hidden=currentView!=="detail";walletView.hidden=currentView!=="wallet";grid.hidden=["detail","wallet"].includes(currentView);
    document.querySelector(".section-heading").hidden=currentView==="detail"||currentView==="home";
    const headings={home:"",watchlist:"My Watchlist",unlocked:"Unlocked",saved:"Saved",liked:"Liked",shared:"Shared",history:"Browsing History",wallet:"Wallet"};
    heading.textContent=headings[currentView]||"";
    empty.hidden=true;
    if(currentView==="detail"){renderDetail(currentDrama,record);return;}
    if(currentView==="wallet")return;
    let list=displayed;
    if(["watchlist","saved","liked"].includes(currentView))list=list.filter(drama=>state(record,drama)[currentView]);
    if(currentView==="unlocked")list=list.filter(drama=>record.wallet.unlocked.includes(stimulusKey(drama)));
    if(currentView==="history")list=list.filter(drama=>state(record,drama).viewCount>0).sort((a,b)=>(state(record,b).lastViewedAt||"").localeCompare(state(record,a).lastViewedAt||""));
    const query=search.value.trim().toLowerCase();list=list.filter(drama=>drama.title.toLowerCase().includes(query));
    grid.className="drama-grid";
    grid.replaceChildren(...list.map(drama=>card(drama,record)));
    if(!list.length){empty.hidden=false;empty.textContent=query?"No dramas found.":currentView==="saved"?"No saved dramas yet. Save a drama from Dramify.":currentView==="history"?"You haven't visited any dramas yet.":`No ${currentView} dramas yet.`;}
  }
  function route() {
    const route=window.location.hash.slice(1)||"home";
    notice.hidden=true;
    currentView=Object.hasOwn(nav,route)?route:"home";currentDrama=null;
    render();window.scrollTo({top:0,behavior:"auto"});
  }
  function go(view) {if(window.location.hash===`#${view}`)return;window.location.hash=view;}
  for(const [view,button] of Object.entries(nav))button.addEventListener("click",()=>go(view));
  document.querySelector(".watchlist-limit-close").addEventListener("click",()=>document.querySelector(".watchlist-limit-dialog").close());
  search.addEventListener("input",render);
  window.addEventListener("hashchange",route);
  function unlockDrama(drama) {
    let charged=false;
    if(save(record=>{
      const id=stimulusKey(drama);
      if(record.wallet.unlocked.includes(id))return;
      if(record.wallet.balance<20)throw new Error("Insufficient coins");
      record.wallet.unlocked.push(id);record.wallet.balance-=20;
      record.wallet.transactions.push({type:"unlock",dramaId:drama.id,version:drama.version,amount:-20,at:new Date().toISOString()});
      record.behaviors ||= {};record.behaviors[id]={...state(record,drama),unlocked:true};event(record,drama,"unlock",true);charged=true;
    })) {render();if(charged)notify("Successfully unlocked. All 50 episodes are now unlocked.");}
    else if(!charged&&read().wallet.balance<20)insufficientDialog.showModal();
  }
  function cancelUnlock(drama) {
    let refunded=false;
    if(save(record=>{
      const id=stimulusKey(drama);const index=record.wallet.unlocked.indexOf(id);
      if(index<0)return;
      record.wallet.unlocked.splice(index,1);record.wallet.balance+=20;
      record.wallet.transactions.push({type:"unlock_cancel",dramaId:drama.id,version:drama.version,amount:20,at:new Date().toISOString()});
      record.behaviors ||= {};record.behaviors[id]={...state(record,drama),unlocked:false};
      event(record,drama,"unlock",false);refunded=true;
    })) {render();if(refunded)notify("Unlock cancelled. 20 coins have been returned to your wallet.");}
  }
  document.querySelector(".insufficient-coins-close").addEventListener("click",()=>insufficientDialog.close());
  // Entering a detail hash on reload is a new viewing-page visit, never a charge.
  route();
}
