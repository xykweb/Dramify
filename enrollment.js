(async () => {
if (window.DRAMIFY_MOBILE_BLOCKED) {window.DramifySupport.ready();return;}
"use strict";

// The participant record and assignment are saved together in one local write.
// Assignment comes from the access code; the saved drama order is preserved.
const PARTICIPANT_STORAGE_KEY = "dramify.participant.v1";
const participantForm = document.querySelector("#enrollment-form");
const enrollmentError = document.querySelector("#enrollment-error");
// Keep completion functional even when the editable HTML omits its optional template.
if(!document.querySelector(".completion-screen")) {
  const screen=document.createElement("section");screen.className="completion-screen";screen.hidden=true;screen.setAttribute("aria-labelledby","completion-title");
  screen.innerHTML=`<div class="enrollment-card completion-card"><img class="completion-logo" src="assets/brand/Logo.jpg" alt="Dramify" width="194"><h1 id="completion-title" tabindex="-1"><span>We thank you for your time spent taking this survey.</span><span>Your response has been recorded.</span></h1><p></p><p class="completion-label">Completion code</p><div class="completion-code"></div><button class="copy-key-code enrollment-submit" type="button">Copy completion code</button><p class="copy-code-status" role="status"></p></div>`;
  document.body.append(screen);
}

let fullscreenState={requested:false,entered:false,exitedEarly:false,events:[]};
try {fullscreenState={...fullscreenState,...JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY)) || "null")?.fullscreen};}catch(error){}
function recordFullscreenEvent(type) {
  fullscreenState.events.push({type,at:new Date().toISOString()});
  try {
    const key=window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY);
    const record=JSON.parse(localStorage.getItem(key) || "null");
    if(record){record.fullscreen=fullscreenState;localStorage.setItem(key,JSON.stringify(record));window.DramifyCloud.changed();}
  }catch(error){console.warn("Fullscreen event could not be saved");}
}
function requestStudyFullscreen() {
  const element=document.documentElement;
  if(document.fullscreenElement || document.webkitFullscreenElement)return;
  fullscreenState.requested=true;
  recordFullscreenEvent("requested");
  const request=element.requestFullscreen || element.webkitRequestFullscreen;
  if(!request){recordFullscreenEvent("unsupported");return;}
  try {Promise.resolve(request.call(element)).catch(()=>recordFullscreenEvent("denied"));}
  catch(error){recordFullscreenEvent("denied");}
}
function fullscreenChanged() {
  if(document.querySelector(".completion-screen")?.hidden===false)return;
  const entered=Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  if(entered)fullscreenState.entered=true;
  else if(fullscreenState.entered)fullscreenState.exitedEarly=true;
  recordFullscreenEvent(entered?"entered":"exited");
}
document.addEventListener("fullscreenchange",fullscreenChanged);
document.addEventListener("webkitfullscreenchange",fullscreenChanged);
let siteStarted = false;
let siteStarting = false;
let releaseResponseLock = null;
async function acquireResponseLock() {
  if(releaseResponseLock || !navigator.locks)return true;
  return new Promise((resolve,reject)=>{
    navigator.locks.request(window.DRAMIFY_STORAGE_KEY("dramify.active-response"),{ifAvailable:true},lock=>{
      if(!lock){resolve(false);return;}
      return new Promise(release=>{releaseResponseLock=release;resolve(true);});
    }).catch(reject);
  });
}
window.addEventListener("pagehide",()=>{releaseResponseLock?.();releaseResponseLock=null;});
window.addEventListener("pageshow",event=>{if(event.persisted && siteStarted)window.location.reload();});
let activeParticipant = null;
let stayTimerFrame = null;

function formatStayDuration(seconds) {
  return Math.max(0, seconds).toFixed(2);
}
let enrollmentStep = 1;
let returningParticipant = null;
const ACCESS_SESSION_KEY = "dramify.access.v1";
const COMPLETION_SESSION_KEY = "dramify.completed.v1";
const accessCodes = window.DRAMIFY_CONFIG.accessCodes;
const RESPONSE_START_KEY="dramify.responseStart.v1";
try {
  if(!localStorage.getItem(window.DRAMIFY_STORAGE_KEY(RESPONSE_START_KEY)))localStorage.setItem(window.DRAMIFY_STORAGE_KEY(RESPONSE_START_KEY),new Date().toISOString());
} catch(error) {showEnrollmentError("Please allow browser storage to continue.");}
const ASSIGNMENT_STORAGE_KEY = "dramify.assignment.v1";
// Own the local response before reading or replacing it in another tab.
if(!await acquireResponseLock()) {
  showEnrollmentError("Dramify is already open in another tab. Please continue there or close it and try again.");
  document.querySelector(".enrollment-submit").disabled=true;
  window.DramifySupport.ready();
  return;
}
try {
  const navigation=performance.getEntriesByType("navigation")[0];
  const refresh=navigation?.type === "reload" && sessionStorage.getItem(window.DRAMIFY_STORAGE_KEY("dramify.visit.v1"));
  if(!refresh) {
    for(const key of [PARTICIPANT_STORAGE_KEY,ASSIGNMENT_STORAGE_KEY,RESPONSE_START_KEY,"dramify.supabase.auth"])
      localStorage.removeItem(window.DRAMIFY_STORAGE_KEY(key));
    for(const key of [ACCESS_SESSION_KEY,COMPLETION_SESSION_KEY])sessionStorage.removeItem(window.DRAMIFY_STORAGE_KEY(key));
    fullscreenState={requested:false,entered:false,exitedEarly:false,events:[]};
    localStorage.setItem(window.DRAMIFY_STORAGE_KEY(RESPONSE_START_KEY),new Date().toISOString());
  }
  sessionStorage.setItem(window.DRAMIFY_STORAGE_KEY("dramify.visit.v1"),"active");
} catch(error) {
  showEnrollmentError("Please allow browser storage, then refresh this page to continue.");
  document.querySelector(".enrollment-submit").disabled=true;
  window.DramifySupport.ready();
  return;
}
let assignedCode = null;
function prepareAssignment() {
  const saved=JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY)) || "null");
  const prior=saved?.accessCode || localStorage.getItem(window.DRAMIFY_STORAGE_KEY(ASSIGNMENT_STORAGE_KEY));
  const codes=Object.keys(accessCodes);
  const random=new Uint32Array(1);crypto.getRandomValues(random);
  assignedCode=Object.prototype.hasOwnProperty.call(accessCodes,prior)?prior:codes[Math.floor(random[0]/4294967296*codes.length)];
  localStorage.setItem(window.DRAMIFY_STORAGE_KEY(ASSIGNMENT_STORAGE_KEY),assignedCode);
}
const workerIdInput = document.querySelector("#participant-worker-id");
function hasValidWorkerId() {
  if (!workerIdInput.reportValidity() || !/^[A-Za-z0-9]{1,64}$/.test(workerIdInput.value.trim())) {
    showEnrollmentError("Please enter a valid Connect ID using letters and numbers.");
    workerIdInput.focus();
    return false;
  }
  return true;
}
function showEnrollmentStep(step) {
  enrollmentStep = step;
  for (const [id,number] of [["access-step",1],["task-step",4]]) {
    document.querySelector(`#${id}`).hidden=step!==number;
    document.querySelector(`#${id}`).disabled=step!==number;
  }
  const heading=document.querySelector("#welcome-title");
  heading.textContent=step===1?enrollmentWelcomeHeading:"";
  heading.hidden=step!==1;
  document.querySelector(".enrollment-intro").innerHTML=step===1?enrollmentWelcomeCopy:"";
  document.querySelector(".enrollment-intro").hidden=step!==1;
  document.querySelector(".enrollment-submit").textContent = "Next";
  document.querySelector(".task-time-limit").hidden = !["2006","2008"].includes(assignedCode);
  enrollmentError.hidden=true;
  if(step===1)heading.focus();else document.querySelector(".enrollment-submit").focus();
}
const enrollmentWelcomeHeading=document.querySelector("#welcome-title").textContent;
const enrollmentWelcomeCopy=document.querySelector(".enrollment-intro").innerHTML;
try {prepareAssignment();} catch(error) {showEnrollmentError("Please allow browser storage to continue.");}

function isValidParticipant(value) {
  return value && value.schemaVersion === 1
    && typeof value.id === "string" && value.id.length > 0
    && typeof value.gender === "string"
    && typeof value.country === "string"
    && typeof value.createdAt === "string"
    && (value.condition === "A" || value.condition === "B");
}

async function enterDramify(participant, code) {
  if (siteStarted || siteStarting) return;
  siteStarting = true;
  const button = document.querySelector(".enrollment-submit");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Loading…";
  try {
    if(!await acquireResponseLock()){showEnrollmentError("Dramify is already open in another tab. Please continue there or close it and try again.");return;}
    await window.DramifyContent.load(dramas);
    showDramify(participant, code);
  } catch (error) {
    if(!siteStarted){releaseResponseLock?.();releaseResponseLock=null;}
    showEnrollmentError(location.protocol === "file:"
      ? "Please open this website using 启动网站.command in the Dramify folder, then try again."
      : window.DramifySupport.describe(error,"content"));
    console.warn("Dramify content:", error.message);
  } finally {
    siteStarting = false;
    button.disabled = false;
    button.textContent = label;
  }
}

function showDramify(participant, code) {
  if (siteStarted) return;
  try {
    sessionStorage.setItem(window.DRAMIFY_STORAGE_KEY(ACCESS_SESSION_KEY), JSON.stringify({ participantId: participant.id, code, accessVersion: 3, workerId:participant.mturkWorkerId }));
  } catch (error) {
    showEnrollmentError("Please allow browser storage to continue.");
    return;
  }
  participant.accessCode ||= code;
  localStorage.setItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY), JSON.stringify(participant));
  activeParticipant = participant;
  try {
    initializeDramify(participant);
  } catch (error) {
    showEnrollmentError("We could not save your session. Please allow browser storage and try again.");
    return;
  }
  siteStarted = true;
  document.querySelector(".enrollment").hidden = true;
  document.querySelector("#dramify-app").hidden = false;
  document.body.classList.remove("enrolling");
  window.DramifyCloud.start(participant);
  const savedSurvey=JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY)) || "null")?.postSurvey;
  if(savedSurvey?.inProgress) {surveyPage=validSurveyPage(savedSurvey.page);renderSurvey();openSurveyPage();}
  const stayTimer = document.querySelector(".stay-timer");
  stayTimer.hidden = !["2006", "2008"].includes(participant.accessCode);
  if (!stayTimer.hidden && !savedSurvey?.inProgress) {
    const timerValue = document.querySelector(".stay-timer-value");
    const updateStayTimer = () => {
      if (!activeParticipant) return;
      const remaining = Math.max(0, 90 - window.DramifyCloud.getDurationSeconds());
      timerValue.textContent = formatStayDuration(remaining);
      stayTimer.classList.toggle("time-expired", remaining === 0);
      stayTimerFrame = requestAnimationFrame(updateStayTimer);
    };
    updateStayTimer();
  }
}

function showEnrollmentError(message) {
  enrollmentError.textContent = message;
  enrollmentError.hidden = false;
}

try {
  const saved = localStorage.getItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY));
  if (saved) {
    const participant = JSON.parse(saved);
    if (isValidParticipant(participant)) {
      if(window.DRAMIFY_CONTEXT.participantId && window.DRAMIFY_CONTEXT.participantId !== (participant.connectId || participant.mturkWorkerId)) throw new Error("Connect participant changed");
      returningParticipant = participant;
      workerIdInput.value = participant.connectId || participant.mturkWorkerId || "";
      // A changed configured code invalidates the previous browser session.
      let access = null;
      try { access = JSON.parse(sessionStorage.getItem(window.DRAMIFY_STORAGE_KEY(ACCESS_SESSION_KEY)) || "null"); } catch (error) { /* Show the code entry again. */ }
      if (access && participant.mturkWorkerId && access.participantId === participant.id && access.accessVersion === 3 && access.workerId === participant.mturkWorkerId && accessCodes[access.code] === participant.condition && (!participant.accessCode || participant.accessCode === access.code)) enterDramify(participant, access.code);
    }
    else showEnrollmentError("Your saved details could not be restored. Please complete the form again.");
  }
} catch (error) {
  showEnrollmentError("Your saved details could not be read. Please allow browser storage to keep your details when you return.");
}

function createResponseId() {
  if(typeof crypto.randomUUID === "function")return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

participantForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (siteStarted || siteStarting) return;
  try {
  if (enrollmentStep === 4) {
    if(!document.querySelector('.practice-action[data-action="watchlist"]').matches('[aria-pressed="true"]')) {showEnrollmentError("Please add the sample series to your Watchlist before continuing.");return;}
    if(document.querySelector("#practice-like").value!=="unlimited" || document.querySelector("#practice-save").value!=="unlimited") {showEnrollmentError("That answer is incorrect. You can Like and Save as many series as you wish. Please check your answers and try again.");return;}
    requestStudyFullscreen();
    if (returningParticipant) enterDramify(returningParticipant,returningParticipant.accessCode);
    return;
  }
  if (enrollmentStep === 1) {
    if (!hasValidWorkerId()) return;
    const completedIds=JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY("dramify.completedConnectIds.v1")) || "[]");
    if(!window.DRAMIFY_CONTEXT.isTest && (localStorage.getItem(window.DRAMIFY_STORAGE_KEY("dramify.deviceCompleted.v1")) || completedIds.includes(workerIdInput.value.trim()))) {showEnrollmentError("You have already completed this study. Please return to CloudResearch Connect.");return;}
    if (returningParticipant?.mturkWorkerId && returningParticipant.mturkWorkerId !== workerIdInput.value.trim()) {
      showEnrollmentError("Please use the Connect ID for your saved session, or start in a new private window.");return;
    }
  }
  if(!hasValidWorkerId())return;
  requestStudyFullscreen();
  const participant = {
    schemaVersion: 1,
    ...(returningParticipant || {}),
    fullscreen: fullscreenState,
    timeZone: returningParticipant?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    id: returningParticipant?.id || createResponseId(),
    gender: returningParticipant?.gender || "",
    age: returningParticipant?.age ?? null,
    country:"",
    mturkWorkerId: workerIdInput.value.trim(),
    connectId: workerIdInput.value.trim(),
    recruitmentSource: window.DRAMIFY_CONTEXT.source,
    isTest: window.DRAMIFY_CONTEXT.isTest,
    assignmentId: window.DRAMIFY_CONTEXT.assignmentId,
    projectId: window.DRAMIFY_CONTEXT.projectId,
    referrer: document.referrer,
    createdAt: returningParticipant?.createdAt || new Date().toISOString(),
    startDate: returningParticipant?.startDate || localStorage.getItem(window.DRAMIFY_STORAGE_KEY(RESPONSE_START_KEY)),
    accessCode: returningParticipant?.accessCode || assignedCode,
    condition: accessCodes[assignedCode]
  };
  delete participant.job;
  if (!isValidParticipant(participant)) {
    showEnrollmentError("Please check your details and try again.");
    return;
  }
  try {
    localStorage.setItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY), JSON.stringify(participant));
    returningParticipant = participant;
  } catch (error) {
    showEnrollmentError("We could not save your details. Please enable browser storage and try again.");
    return;
  }
  const button=document.querySelector("#enrollment-form .enrollment-submit");
  siteStarting=true;button.disabled=true;button.textContent="Preparing…";
  const connectionNotice=setTimeout(()=>showEnrollmentError("Connecting is taking longer than expected. Please check your network connection. You can refresh this page and try again; your details have been saved."),12000);
  try {
    returningParticipant=await window.DramifyCloud.allocateCondition(participant);
    assignedCode=returningParticipant.accessCode;
    localStorage.setItem(window.DRAMIFY_STORAGE_KEY(ASSIGNMENT_STORAGE_KEY),assignedCode);
    showEnrollmentStep(4);
  } catch(error) {
    showEnrollmentError(window.DramifySupport.describe(error,"session"));
    console.warn("Dramify assignment:",error.message);
  } finally {clearTimeout(connectionNotice);siteStarting=false;button.disabled=false;if(enrollmentStep===1)button.textContent="Next";}
  } catch(error) {
    showEnrollmentError("We could not start your session. Please allow browser storage and use an up-to-date Chrome or Edge browser, then refresh and try again.");
    console.warn("Dramify enrollment:",error.message);
  }
});


// The completion code is displayed only after confirmed local account deletion.
function showCompletionScreen() {
  const exit=document.exitFullscreen || document.webkitExitFullscreen;
  if(exit && (document.fullscreenElement || document.webkitFullscreenElement))try{Promise.resolve(exit.call(document)).catch(()=>{});}catch(error){}
  document.querySelector("#dramify-app").hidden = true;
  document.querySelector(".enrollment").hidden = true;
  document.querySelector(".completion-screen").hidden = false;
  const completion=window.DRAMIFY_CONTEXT.isTest ? {} : window.DRAMIFY_CONFIG.connect || {};
  const showCode=Boolean(completion.completionCode) && !completion.redirectUrl;
  document.querySelector(".completion-code").hidden=!showCode;
  document.querySelector(".completion-label").hidden=!showCode;
  document.querySelector(".copy-code-status").hidden=!showCode;
  document.querySelector(".completion-code").textContent = completion.completionCode || "Preview complete";
  document.querySelector(".copy-key-code").hidden = !showCode;
  document.querySelector(".completion-card p").textContent = completion.redirectUrl ? "Your responses have been saved. You will now be redirected to CloudResearch Connect to submit your participation." : completion.completionCode ? "Your responses have been saved. Copy the completion code below and return to CloudResearch Connect to submit it." : "";
  document.querySelector(".completion-card p").hidden = !completion.redirectUrl && !completion.completionCode;
  document.querySelector(".return-connect")?.remove();
  if(completion.redirectUrl && !window.DRAMIFY_CONTEXT.isTest) {const link=document.createElement("a");link.href=completion.redirectUrl;link.textContent="Return to Connect";link.className="enrollment-submit return-connect";document.querySelector(".completion-card").append(link);setTimeout(()=>window.location.assign(completion.redirectUrl),2500);}
  document.body.classList.add("enrolling");
  document.querySelector("#completion-title").focus();
}

const signoutDialog=document.querySelector(".experience-survey");
function openSurveyPage() {
  if(stayTimerFrame!==null)cancelAnimationFrame(stayTimerFrame);
  stayTimerFrame=null;
  document.querySelector("#dramify-app").hidden=true;
  signoutDialog.hidden=false;
  document.body.classList.add("surveying");
  window.history.replaceState(null,"",window.location.pathname+window.location.search+"#survey");
  window.scrollTo(0,0);
}
function closeSurveyPage() {
  signoutDialog.hidden=true;
  document.querySelector("#dramify-app").hidden=false;
  document.body.classList.remove("surveying");
  window.history.replaceState(null,"",window.location.pathname+window.location.search+"#home");
}

const surveyPages = [
  [
    [
      "imagery_events",
      "In making my selections, I preferred series that allow me to easily picture the events taking place.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "imagery_self",
      "In making my selections, I preferred series that allow me to picture myself in the scenes of the story.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "narrative_involvement",
      "In making my selections, I preferred series that allow me to be mentally involved in the narrative.",
      "Strongly disagree",
      "Strongly agree"
    ]
  ],
  [
    [
      "storyline_detail",
      "In making my selections, I preferred series with detailed and well-developed storylines.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "narrative_depth",
      "In making my selections, I preferred series with substantial narrative depth.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "story_richness",
      "In making my selections, I preferred series with rich story content.",
      "Strongly disagree",
      "Strongly agree"
    ]
  ],
  [
    [
      "telepresence_presence",
      "In making my selections, I preferred series that make me feel as if I am really there.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "telepresence_absorption",
      "In making my selections, I preferred series that take my mind off my surroundings and draw me into what is happening.",
      "Strongly disagree",
      "Strongly agree"
    ]
  ],
  [
    [
      "control_events",
      "Right now, I enjoy having control over what happens to me.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "control_life",
      "Right now, I like to be in control of most things that occur in my life.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "control_decisions",
      "Right now, I prefer to do things where I have a lot of control over what I do and when I do it.",
      "Strongly disagree",
      "Strongly agree"
    ]
  ],
  [
    [
      "time_pressure",
      "How much time pressure did you feel when making your selections?",
      "No pressure",
      "Very much pressure"
    ],
    [
      "decision_speed",
      "How fast did you need to make your decisions?",
      "Not at all fast",
      "Very fast"
    ]
  ],
  [
    [
      "drama_liking",
      "How much do you like watching AI-generated series?",
      "Not at all",
      "Very much"
    ],
    [
      "pleasure",
      "To what extent were your selection preferences motivated by the pursuit of pleasure?",
      "Not at all",
      "Very much"
    ],
    [
      "financial_constraint",
      "To what extent do you feel financially constrained?",
      "Not financially constrained at all",
      "Very financially constrained"
    ]
  ],
  []
];
function validSurveyPage(value){return Number.isInteger(value)&&value>=0&&value<surveyPages.length?value:0;}
let surveyPage = 0;
let surveySaving = false;
signoutDialog.classList.add("experience-survey");
signoutDialog.innerHTML = `<header class="survey-brand-header"><img src="assets/brand/Logo.jpg" alt="Dramify" width="186"><h1>Experience Survey</h1><span aria-hidden="true"></span></header><div class="survey-content"><p id="signout-description">In this section, we would like to hear about your thoughts during the experience. Please answer the following questions based on your true thoughts.</p>
<form id="experience-survey-form"><div class="survey-page"></div></form>
<p class="signout-error" role="alert" hidden></p><div class="survey-navigation"><button type="button" class="survey-next primary-action">Next</button><button type="button" class="signout-confirm primary-action" hidden>Submit</button></div></div>`;
function surveyRecord() {return JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY)) || "null");}
function saveSurvey(patch) {
  const record=surveyRecord();
  if (!record || record.id !== activeParticipant?.id) throw new Error("Participant changed");
  record.postSurvey = {...record.postSurvey,...patch,version:"post-experience-v4",updatedAt:new Date().toISOString()};
  localStorage.setItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY),JSON.stringify(record));
  window.DramifyCloud.changed();
}
function renderSurvey() {
  signoutDialog.querySelector("#signout-description").hidden=surveyPage!==0;
  const data=surveyRecord()?.postSurvey || {};
  const area=signoutDialog.querySelector(".survey-page");area.replaceChildren();
  for(const [key,text,low,high] of surveyPages[surveyPage]) {
    const field=document.createElement("div");field.className="survey-question";field.setAttribute("role","group");field.setAttribute("aria-labelledby",`question-${key}`);
    const legend=document.createElement("p");legend.className="survey-question-text";legend.id=`question-${key}`;legend.textContent=text;
    const endpoints=document.createElement("div");endpoints.className="survey-endpoints";
    const lowLabel=document.createElement("span"),highLabel=document.createElement("span");
    lowLabel.textContent=low;highLabel.textContent=high;endpoints.append(lowLabel,highLabel);
    const scale=document.createElement("div");scale.className="survey-scale";
    for(let i=1;i<=7;i++) {
      const label=document.createElement("label"),input=document.createElement("input"),number=document.createElement("span");
      input.type="radio";input.name=key;input.value=String(i);input.required=true;input.checked=data[key]===i;
      number.textContent=String(i);label.append(input,number);scale.append(label);
      input.addEventListener("change",()=>{try {saveSurvey({[key]:i});document.querySelector(".signout-error").hidden=true;} catch(error){surveyError("We could not save your response. Please try again.");}});
    }
    field.append(legend,endpoints,scale);area.append(field);
  }
  if(surveyPage===surveyPages.length-1) {
    const copy=document.createElement("p");copy.textContent="Finally, please tell us a little about yourself.";area.append(copy);
    const form=document.createElement("div");
    form.innerHTML=`<label for="survey-gender">Your gender:</label><select id="survey-gender" required><option value="">Select your gender</option><option value="male">Male</option><option value="female">Female</option><option value="nonbinary-other">Nonbinary/Other</option><option value="prefer-not-to-say">Prefer not to say</option></select>
<label for="survey-age">Your age:</label><input id="survey-age" type="number" min="1" max="120" step="1" required>
<label for="survey-income">What is your average monthly income before taxes, in US dollars?</label><input id="survey-income" type="number" min="0" step="any" required>
<label for="survey-comment">Is there anything you would like to tell us about Dramify? (Optional)</label><textarea id="survey-comment" rows="5" maxlength="3000"></textarea>`;
    const record=surveyRecord();
    for(const [name,property] of [["gender","gender"],["age","age"],["income","monthlyIncome"]]) {
      const input=form.querySelector(`#survey-${name}`);input.value=record[property] ?? "";
      input.addEventListener("input",()=>{try {const latest=surveyRecord();latest[property]=name==="gender"?input.value:input.value===""?null:Number(input.value);localStorage.setItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY),JSON.stringify(latest));window.DramifyCloud.changed();}catch(error){surveyError("We could not save your response. Please try again.");}});
    }
    const comment=form.querySelector("#survey-comment");comment.value=data.comment || "";
    comment.addEventListener("input",()=>{try{saveSurvey({comment:comment.value});}catch(error){surveyError("We could not save your comment. Please try again.");}});area.append(form);
  }
  signoutDialog.querySelector(".survey-next").hidden=surveyPage===surveyPages.length-1;
  signoutDialog.querySelector(".signout-confirm").hidden=surveyPage!==surveyPages.length-1;
  signoutDialog.querySelector(".signout-confirm").textContent="Submit";
  window.scrollTo(0,0);
}
function setSurveyDisabled(disabled) {
  for(const input of document.querySelectorAll("#experience-survey-form input, #experience-survey-form select, #experience-survey-form textarea"))input.disabled=disabled;
}
function surveyError(text) {const error=document.querySelector(".signout-error");error.textContent=text;error.hidden=false;}
function surveyComplete() {
  const data=surveyRecord()?.postSurvey || {};
  return surveyPages.flat().every(([key])=>Number.isInteger(data[key]) && data[key]>=1 && data[key]<=7);
}
signoutDialog.querySelector(".survey-next").addEventListener("click",()=>{
  if(!document.querySelector("#experience-survey-form").reportValidity())return;
  try {
    const next=Math.min(surveyPages.length-1,surveyPage+1);saveSurvey({page:next});surveyPage=next;renderSurvey();
  } catch(error){surveyError("We could not save your progress. Please try again.");}
});
signoutDialog.addEventListener("cancel",event=>{event.preventDefault();});
document.querySelector("#experience-survey-form").addEventListener("submit",event=>event.preventDefault());
function canFinishExperience() {
  const message = document.querySelector(".signout-error");
  try {
    const record = JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY)) || "null");
    if (!record || record.id !== activeParticipant?.id) throw new Error("Participant changed");
    const count = Object.entries(record.behaviors || {}).filter(([key, behavior]) => {
      const id = Number(key.slice(0,-1));
      return id >= 1 && id <= 16 && key === `${id}${(id % 2 === 1) === (record.condition === "A") ? "a" : "b"}` && behavior.watchlist;
    }).length;
    if (count === 6) return true;
    message.textContent = `Please select exactly 6 dramas for My Watchlist before finishing. You have selected ${count}.`;
  } catch (error) {
    message.textContent = "Your session could not be checked. Please refresh and try again.";
  }
  message.hidden = false;
  return false;
}
document.querySelector(".selection-next").addEventListener("click", () => {
  if (!activeParticipant) return;
  document.querySelector(".signout-error").hidden = true;
  document.querySelector(".signout-confirm").disabled = !canFinishExperience();
  if(!canFinishExperience()) {window.alert(document.querySelector(".signout-error").textContent);return;}
  surveyPage=validSurveyPage(surveyRecord()?.postSurvey?.page);
  window.DramifyCloud.changed();
  saveSurvey({inProgress:true});renderSurvey();openSurveyPage();
});
document.querySelector(".signout-confirm").addEventListener("click", async () => {
  if (!activeParticipant) return;
  const confirmButton = document.querySelector(".signout-confirm");
  if (confirmButton.disabled) return;
  if (!canFinishExperience()) return;
  document.querySelector(".signout-error").hidden=true;
  if(!document.querySelector("#experience-survey-form").reportValidity())return;
  if(!surveyComplete()) {surveyError("Please answer every rating question before submitting.");return;}
  try {saveSurvey({completedAt:new Date().toISOString()});} catch(error) {surveyError("We could not save your responses. Please try again.");return;}
  setSurveyDisabled(true);
  surveySaving=true;
  confirmButton.disabled = true;
  confirmButton.textContent = "Saving…";
  try {
    await window.DramifyCloud.complete();
  } catch (error) {
    const message = document.querySelector(".signout-error");
    message.textContent = "Your responses have not synced yet. " + window.DramifySupport.describe(error,"submit") + " Your data is still saved on this device. Please keep this page open and click Submit again to retry.";
    message.hidden = false;
    confirmButton.disabled = false;
    confirmButton.textContent = "Submit";
    surveySaving=false;
    setSurveyDisabled(false);
    return;
  }
  try {
    const stored = JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY)) || "null");
    if (stored && stored.id !== activeParticipant.id) throw new Error("Participant changed");
    sessionStorage.removeItem(window.DRAMIFY_STORAGE_KEY(ACCESS_SESSION_KEY));
    sessionStorage.removeItem(window.DRAMIFY_STORAGE_KEY(COMPLETION_SESSION_KEY));
    const completedIds=JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY("dramify.completedConnectIds.v1")) || "[]");
    localStorage.setItem(window.DRAMIFY_STORAGE_KEY("dramify.completedConnectIds.v1"),JSON.stringify([...new Set([...completedIds,activeParticipant.connectId || activeParticipant.mturkWorkerId])]));
    localStorage.setItem(window.DRAMIFY_STORAGE_KEY("dramify.deviceCompleted.v1"),new Date().toISOString());
    localStorage.removeItem(window.DRAMIFY_STORAGE_KEY(PARTICIPANT_STORAGE_KEY));
    localStorage.removeItem(window.DRAMIFY_STORAGE_KEY(ASSIGNMENT_STORAGE_KEY));
    localStorage.removeItem(window.DRAMIFY_STORAGE_KEY(RESPONSE_START_KEY));
  } catch (error) {
    const message = document.querySelector(".signout-error");
    message.textContent = "Your responses were saved, but this browser could not clear the session. Please allow browser storage and retry.";
    message.hidden = false;
    confirmButton.disabled = false;
    confirmButton.textContent = "Submit";
    surveySaving=false;
    setSurveyDisabled(false);
    return;
  }
  if (stayTimerFrame !== null) cancelAnimationFrame(stayTimerFrame);
  stayTimerFrame = null;
  await window.DramifyCloud.clearSession();
  activeParticipant = null;
  returningParticipant = null;
  closeSurveyPage();


  window.history.replaceState(null, "", window.location.pathname + window.location.search + "#home");
  showCompletionScreen();
});

document.querySelector(".copy-key-code").addEventListener("click", async () => {
  const status = document.querySelector(".copy-code-status");
  try {
    await navigator.clipboard.writeText(window.DRAMIFY_CONFIG.connect?.completionCode || "");
    status.textContent = "Finish Code copied.";
  } catch (error) {
    status.textContent = "Please select and copy the Finish Code above.";
  }
});


if(window.DRAMIFY_CONTEXT.participantId && !workerIdInput.value)workerIdInput.value=window.DRAMIFY_CONTEXT.participantId;

for(const button of document.querySelectorAll(".practice-action")) {
  const action=button.dataset.action;button.innerHTML=dramaIcon(action);
  button.addEventListener("click",()=>{
    const selected=button.getAttribute("aria-pressed")!=="true";button.setAttribute("aria-pressed",String(selected));
    button.innerHTML=dramaIcon(action==="watchlist" && selected?"check":action);
    if(action==="watchlist")document.querySelector("#practice-status").textContent=selected?"Sample series added to your Watchlist. This example does not count toward your 6 selections.":"Please click the “+” button to add the sample series.";
    enrollmentError.hidden=true;
  });
}
document.querySelector(".enrollment-submit").disabled=false;
window.DramifySupport.ready();
})().catch(function(error){console.warn("Dramify startup:",error);window.DramifySupport.fatal();});
