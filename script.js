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
  watchlist:'<path d="M12 4v16M4 12h16"/>',
  liked:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  saved:'<path d="M6 3h12v19l-6-4-6 4V3Z"/>',
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
  const heading = document.querySelector("main h1");
  const empty = document.querySelector(".empty-message");
  const notice = document.querySelector(".action-notice");
  const nav = {home:document.querySelector(".browse-all"),watchlist:document.querySelector(".my-watchlist-button"),liked:document.querySelector(".liked-button"),saved:document.querySelector(".watchlist-filter")};
  let currentView = "home";
  const searchInput = document.querySelector("#drama-search");
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
    button.setAttribute("aria-pressed",String(Boolean(state(record,drama)[action])));
    button.addEventListener("click",()=>{
      try {
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
      } catch(error) {notify("Your session could not be updated. Please refresh and try again.");}
    });
    return button;
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
  function render() {
    const record=read();
    document.querySelector(".selection-complete-bar").hidden=displayed.filter(item=>state(record,item).watchlist).length!==6;
    document.querySelector(".home-promotion").hidden=currentView!=="home";
    for(const [view,button] of Object.entries(nav))button.setAttribute("aria-pressed",String(view===currentView));
    grid.hidden=false;
    document.querySelector(".section-heading").hidden=false;
    document.querySelector(".section-heading").classList.toggle("new-release-heading",currentView==="home");
    const headings={home:"New Release",watchlist:"My Watchlist",saved:"Saved",liked:"Liked"};
    heading.textContent=headings[currentView]||"";
    empty.hidden=true;
    let list=displayed;
    if(["watchlist","saved","liked"].includes(currentView))list=list.filter(drama=>state(record,drama)[currentView]);
    const query=searchInput.value.trim().toLocaleLowerCase();
    if(query)list=list.filter(drama=>drama.title.toLocaleLowerCase().includes(query));
    grid.className="drama-grid";
    grid.replaceChildren(...list.map(drama=>card(drama,record)));
    if(!list.length){empty.hidden=false;empty.textContent=query?"No series match your search.":currentView==="saved"?"No saved dramas yet. Save a drama from Dramify.":`No ${currentView} dramas yet.`;}
  }
  function route() {
    const route=window.location.hash.slice(1)||"home";
    notice.hidden=true;
    currentView=Object.hasOwn(nav,route)?route:"home";
    render();window.scrollTo({top:0,behavior:"auto"});
  }
  function go(view) {if(window.location.hash===`#${view}`)return;window.location.hash=view;}
  for(const [view,button] of Object.entries(nav))button.addEventListener("click",()=>go(view));
  document.querySelector(".watchlist-limit-close").addEventListener("click",()=>document.querySelector(".watchlist-limit-dialog").close());
  searchInput.addEventListener("input",render);
  window.addEventListener("hashchange",route);
  route();
}
