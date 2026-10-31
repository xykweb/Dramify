"use strict";

// The participant record and assignment are saved together in one local write.
// Assignment comes from the access code; the saved drama order is preserved.
const PARTICIPANT_STORAGE_KEY = "dramify.participant.v1";
const participantForm = document.querySelector("#enrollment-form");
const enrollmentError = document.querySelector("#enrollment-error");
let siteStarted = false;
let siteStarting = false;
let activeParticipant = null;
let stayTimerFrame = null;

function formatStayDuration(seconds) {
  const ms = Math.max(0, Math.floor(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2,"0")}:${String(Math.floor(ms / 60000) % 60).padStart(2,"0")}:${String(Math.floor(ms / 1000) % 60).padStart(2,"0")}.${String(ms % 1000).padStart(3,"0")}`;
}
let enrollmentStep = 1;
let returningParticipant = null;
const ACCESS_SESSION_KEY = "dramify.access.v1";
const COMPLETION_SESSION_KEY = "dramify.completed.v1";
const accessCodeInput = document.querySelector("#access-code");
const accessCodes = window.DRAMIFY_CONFIG.accessCodes;

const VERIFICATION_STORAGE_KEY = "dramify.verification.v1";
let verificationCode = null;
function prepareVerification() {
  const savedParticipant = JSON.parse(localStorage.getItem(PARTICIPANT_STORAGE_KEY) || "null");
  const savedCode = savedParticipant?.accessCode || localStorage.getItem(VERIFICATION_STORAGE_KEY);
  const codes = Object.keys(accessCodes);
  if (Object.hasOwn(accessCodes,savedCode)) verificationCode = savedCode;
  else {
    const random = new Uint32Array(1);crypto.getRandomValues(random);
    verificationCode = codes[Math.floor(random[0] / 4294967296 * codes.length)];
  }
  localStorage.setItem(VERIFICATION_STORAGE_KEY,verificationCode);
  document.querySelector(".verification-number").textContent = verificationCode;
}
function hasValidAccessCode() {
  if (!/^[0-9]{4}$/.test(accessCodeInput.value) || (!Object.hasOwn(accessCodes, accessCodeInput.value) || accessCodeInput.value !== verificationCode)) {
    showEnrollmentError("That number does not match. Please enter the number shown above.");
    accessCodeInput.focus();
    return false;
  }
  return true;
}
const nicknameInput = document.querySelector("#participant-nickname");
const workerIdInput = document.querySelector("#participant-worker-id");
function hasValidWorkerId() {
  if (!workerIdInput.reportValidity() || !/^[A-Za-z0-9]{1,64}$/.test(workerIdInput.value.trim())) {
    showEnrollmentError("Please enter a valid MTurk Connect ID using letters and numbers.");
    workerIdInput.focus();
    return false;
  }
  return true;
}
function showEnrollmentStep(step) {
  enrollmentStep = step;
  for (const [id,number] of [["access-step",1],["verification-step",2],["details-step",3],["task-step",4]]) {
    document.querySelector(`#${id}`).hidden = step !== number;
    document.querySelector(`#${id}`).disabled = step !== number;
  }
  const heading=document.querySelector("#welcome-title");
  heading.textContent = ["Welcome to the Dramify Survey","Human Verification","A little about you","Your task"][step-1];
  document.querySelector(".enrollment-intro").innerHTML = step === 1 ? enrollmentWelcomeCopy : step === 2
    ? "Please enter the number shown below to continue."
    : step === 3 ? "Help us get to know you so we can recommend dramas that suit you." : "Please read the instructions below before you begin.";
  document.querySelector("#enrollment-back").hidden = step === 1;
  document.querySelector(".enrollment-submit").textContent = ["Next","Continue","Next","Okay, I got it."][step-1];
  document.querySelector(".task-time-limit").hidden = !["2006","2008"].includes(verificationCode);
  enrollmentError.hidden=true;heading.focus();
}
const enrollmentWelcomeCopy=document.querySelector(".enrollment-intro").innerHTML;
document.querySelector("#enrollment-back").addEventListener("click",()=>showEnrollmentStep(enrollmentStep===4?1:Math.max(1,enrollmentStep-1)));
try {prepareVerification();} catch(error) {showEnrollmentError("Please allow browser storage to continue.");}

function isValidParticipant(value) {
  return value && value.schemaVersion === 1
    && typeof value.id === "string" && value.id.length > 0
    && typeof value.nickname === "string" && value.nickname.trim().length > 0
    && typeof value.gender === "string"
    && (value.age === null || Number.isInteger(value.age) && value.age >= 1 && value.age <= 120)
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
    await window.DramifyContent.load(dramas);
    showDramify(participant, code);
  } catch (error) {
    showEnrollmentError(location.protocol === "file:"
      ? "Please open this website using 启动网站.command in the Dramify folder, then try again."
      : "We could not load the drama content. Please check the Excel file and your connection, then try again.");
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
    sessionStorage.setItem(ACCESS_SESSION_KEY, JSON.stringify({ participantId: participant.id, code, accessVersion: 3, workerId:participant.mturkWorkerId }));
  } catch (error) {
    showEnrollmentError("Please allow browser storage to continue.");
    return;
  }
  participant.accessCode ||= code;
  localStorage.setItem(PARTICIPANT_STORAGE_KEY, JSON.stringify(participant));
  activeParticipant = participant;
  document.querySelector(".user-nickname").textContent = participant.nickname;
  document.querySelector(".user-profile").title = "Participant";
  document.querySelector(".user-profile").hidden = true;
  try {
    initializeDramify(participant);
  } catch (error) {
    showEnrollmentError("We could not save your profile or wallet. Please allow browser storage and try again.");
    return;
  }
  siteStarted = true;
  document.querySelector(".enrollment").hidden = true;
  document.querySelector("#dramify-app").hidden = false;
  document.body.classList.remove("enrolling");
  window.DramifyCloud.start(participant);
  const savedSurvey=JSON.parse(localStorage.getItem(PARTICIPANT_STORAGE_KEY) || "null")?.postSurvey;
  if(savedSurvey?.inProgress) {surveyPage=Math.min(3,Math.max(0,savedSurvey.page || 0));renderSurvey();openSurveyPage();}
  const stayTimer = document.querySelector(".stay-timer");
  stayTimer.hidden = !["2006", "2008"].includes(participant.accessCode);
  if (!stayTimer.hidden) {
    const timerValue = document.querySelector(".stay-timer-value");
    const updateStayTimer = () => {
      if (!activeParticipant) return;
      timerValue.textContent = formatStayDuration(Math.max(0, 180 - window.DramifyCloud.getDurationSeconds()));
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
  const saved = localStorage.getItem(PARTICIPANT_STORAGE_KEY);
  if (saved) {
    const participant = JSON.parse(saved);
    if (isValidParticipant(participant)) {
      returningParticipant = participant;
      nicknameInput.value = participant.nickname;
      workerIdInput.value = participant.mturkWorkerId || "";
      document.querySelector("#participant-gender").value = ({woman:"female",man:"male"})[participant.gender] || participant.gender;
      document.querySelector("#participant-age").value = participant.age;
      document.querySelector("#participant-country").value = participant.country;
      // A changed configured code invalidates the previous browser session.
      let access = null;
      try { access = JSON.parse(sessionStorage.getItem(ACCESS_SESSION_KEY) || "null"); } catch (error) { /* Show the code entry again. */ }
      if (access && participant.mturkWorkerId && access.participantId === participant.id && access.accessVersion === 3 && access.workerId === participant.mturkWorkerId && accessCodes[access.code] === participant.condition && (!participant.accessCode || participant.accessCode === access.code)) enterDramify(participant, access.code);
    }
    else showEnrollmentError("Your saved details could not be restored. Please complete the form again.");
  }
} catch (error) {
  showEnrollmentError("Your saved details could not be read. Please allow browser storage to keep your details when you return.");
}

participantForm.addEventListener("submit", event => {
  event.preventDefault();
  if (siteStarted || siteStarting) return;
  if (enrollmentStep === 4) {
    if (returningParticipant) enterDramify(returningParticipant,returningParticipant.accessCode);
    return;
  }
  if (enrollmentStep === 1) {
    if (!hasValidWorkerId()) return;
    const completedIds=JSON.parse(localStorage.getItem("dramify.completedConnectIds.v1") || "[]");
    if(localStorage.getItem("dramify.deviceCompleted.v1") || completedIds.includes(workerIdInput.value.trim())) {showEnrollmentError("You have already completed this study. Please return to CloudResearch Connect.");return;}
    if (returningParticipant?.mturkWorkerId && returningParticipant.mturkWorkerId !== workerIdInput.value.trim()) {
      showEnrollmentError("Please use the Connect ID for your saved session, or start in a new private window.");return;
    }
    accessCodeInput.value=verificationCode;
    if(localStorage.getItem("dramify.deviceCompleted.v1")){showEnrollmentError("This browser has already completed this study. Please return to Connect.");return;}
  }
  if (enrollmentStep === 2) {
    if (!hasValidAccessCode()) return;
    if (returningParticipant) {
      if ((returningParticipant.mturkWorkerId && returningParticipant.mturkWorkerId !== workerIdInput.value.trim()) || (returningParticipant.accessCode && returningParticipant.accessCode !== accessCodeInput.value) || returningParticipant.condition !== accessCodes[accessCodeInput.value]) {
        showEnrollmentError("Please use the Connect ID and access code for your saved session, or start in a new private window.");
        return;
      }
    }
  }
  if (!hasValidAccessCode() || !hasValidWorkerId()) return;
  const nickname = "Participant";
  const country = "";
  const participant = {
    schemaVersion: 1,
    ...(returningParticipant || {}),
    id: returningParticipant?.id || crypto.randomUUID(),
    nickname,
    gender: "",
    age: null,
    country,
    mturkWorkerId: workerIdInput.value.trim(),
    connectId: workerIdInput.value.trim(),
    recruitmentSource: "cloudresearch_connect",
    createdAt: returningParticipant?.createdAt || new Date().toISOString(),
    accessCode: returningParticipant?.accessCode || accessCodeInput.value,
    condition: accessCodes[accessCodeInput.value]
  };
  delete participant.job;
  if (!isValidParticipant(participant)) {
    showEnrollmentError("Please check your details and try again.");
    return;
  }
  try {
    localStorage.setItem(PARTICIPANT_STORAGE_KEY, JSON.stringify(participant));
    returningParticipant = participant;
  } catch (error) {
    showEnrollmentError("We could not save your details. Please enable browser storage and try again.");
    return;
  }
  showEnrollmentStep(4);
});


const feedbackDialog = document.querySelector(".feedback-workspace");
const feedbackForm = document.querySelector("#feedback-form");
const feedbackText = document.querySelector("#feedback-text");
const feedbackStatus = document.querySelector(".feedback-status");
const platformRatingForm = document.querySelector("#platform-rating-form");
const platformRatingStatus = document.querySelector(".platform-rating-status");
const ratingFieldset = document.querySelector(".platform-rating-fieldset");
let currentFeedbackId = null;

function setFeedbackSection(section, confirmed) {
  document.querySelector(`.${section}-confirm`).hidden = confirmed;
  document.querySelector(`.${section}-confirmed`).hidden = !confirmed;
  document.querySelector(`.${section}-edit`).hidden = !confirmed;
  if (section === "rating") ratingFieldset.disabled = confirmed;
  else feedbackText.readOnly = confirmed;
}
function readFeedbackEntries() {
  const entries = JSON.parse(localStorage.getItem("dramify.feedback.v1") || "[]");
  if (!Array.isArray(entries)) throw new Error("Invalid feedback records");
  return entries;
}
function saveFeedbackSection(patch) {
  const entries = readFeedbackEntries();
  let index = entries.findIndex(entry => entry.id === currentFeedbackId && entry.participantId === activeParticipant.id);
  const now = new Date().toISOString();
  if (index < 0) {
    entries.push({id:crypto.randomUUID(),participantId:activeParticipant.id,condition:activeParticipant.condition,text:"",createdAt:now});
    index = entries.length - 1;
  }
  entries[index] = { ...entries[index], ...patch, updatedAt:now };
  localStorage.setItem("dramify.feedback.v1", JSON.stringify(entries));
  currentFeedbackId = entries[index].id;
  window.DramifyCloud.changed();
}
document.querySelector(".feedback-open")?.addEventListener("click", () => {
  if (!activeParticipant) return;
  currentFeedbackId = null;
  platformRatingForm.reset();
  platformRatingStatus.hidden = true;
  feedbackStatus.hidden = true;
  feedbackText.value = "";
  setFeedbackSection("rating", false);
  setFeedbackSection("comment", false);
  try {
    const saved = readFeedbackEntries().filter(entry => entry.participantId === activeParticipant.id).at(-1);
    if (saved) {
      currentFeedbackId = saved.id;
      const hasRating = Number.isInteger(saved.rating) && saved.rating >= 1 && saved.rating <= 10;
      if (hasRating) document.querySelector(`#platform-rating-form input[value="${saved.rating}"]`).checked = true;
      feedbackText.value = typeof saved.text === "string" ? saved.text : "";
      setFeedbackSection("rating", hasRating);
      setFeedbackSection("comment", feedbackText.value.trim().length > 0);
    }
  } catch (error) {
    feedbackStatus.textContent = "Your saved feedback could not be loaded. Please try again.";
    feedbackStatus.hidden = false;
  }
  feedbackDialog.showModal();
});
document.querySelector(".feedback-workspace .feedback-close").addEventListener("click", () => feedbackDialog.close());
feedbackDialog.addEventListener("cancel", event => event.preventDefault());
document.querySelector(".rating-edit").addEventListener("click", () => {
  setFeedbackSection("rating", false);
  platformRatingStatus.hidden = true;
});
document.querySelector(".comment-edit").addEventListener("click", () => {
  setFeedbackSection("comment", false);
  feedbackStatus.hidden = true;
  feedbackText.focus();
});
platformRatingForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!activeParticipant || ratingFieldset.disabled || !platformRatingForm.reportValidity()) return;
  const rating = Number(new FormData(platformRatingForm).get("platformRating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return;
  try {
    saveFeedbackSection({rating, ratingConfirmedAt:new Date().toISOString()});
    platformRatingStatus.hidden = true;
    setFeedbackSection("rating", true);
  } catch (error) {
    platformRatingStatus.textContent = "Your rating could not be saved. Please try again.";
    platformRatingStatus.hidden = false;
  }
});
feedbackForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!activeParticipant || feedbackText.readOnly || !feedbackForm.reportValidity()) return;
  const text = feedbackText.value.trim();
  if (!text) {
    feedbackStatus.textContent = "Please enter a comment before confirming.";
    feedbackStatus.hidden = false;
    return;
  }
  try {
    saveFeedbackSection({text, commentConfirmedAt:new Date().toISOString()});
    feedbackText.value = text;
    feedbackStatus.hidden = true;
    setFeedbackSection("comment", true);
  } catch (error) {
    feedbackStatus.textContent = "Your comment could not be saved. Please try again.";
    feedbackStatus.hidden = false;
  }
});


// The completion code is displayed only after confirmed local account deletion.
function showCompletionScreen() {
  document.querySelector("#dramify-app").hidden = true;
  document.querySelector(".enrollment").hidden = true;
  document.querySelector(".completion-screen").hidden = false;
  const completion=window.DRAMIFY_CONFIG.connect || {};
  const showCode=Boolean(completion.completionCode) && !completion.redirectUrl;
  document.querySelector(".completion-code").hidden=!showCode;
  document.querySelector(".completion-label").hidden=!showCode;
  document.querySelector(".copy-code-status").hidden=!showCode;
  document.querySelector(".completion-code").textContent = completion.completionCode || "Preview complete";
  document.querySelector(".copy-key-code").hidden = !showCode;
  document.querySelector(".completion-card p").textContent = completion.redirectUrl ? "Your responses have been saved. You will now be redirected to CloudResearch Connect to submit your participation." : completion.completionCode ? "Your responses have been saved. Copy the completion code below and return to CloudResearch Connect to submit it." : "Your responses have been saved. This is a preview; the CloudResearch Connect completion link has not been configured yet.";
  document.querySelector(".return-connect")?.remove();
  if(completion.redirectUrl) {const link=document.createElement("a");link.href=completion.redirectUrl;link.textContent="Return to Connect";link.className="enrollment-submit return-connect";document.querySelector(".completion-card").append(link);setTimeout(()=>window.location.assign(completion.redirectUrl),2500);}
  document.body.classList.add("enrolling");
  document.querySelector("#completion-title").focus();
}

const oldSignoutDialog = document.querySelector(".signout-dialog");
const signoutDialog = document.createElement("section");
signoutDialog.className="signout-dialog experience-survey";
signoutDialog.hidden=true;
signoutDialog.setAttribute("aria-labelledby","signout-title");
oldSignoutDialog.replaceWith(signoutDialog);
function openSurveyPage() {
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
    ],
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
    ],
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
      "Right now, I want to have control over what happens to me.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "control_life",
      "Right now, I want to be in control of the things happening in my life.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "control_decisions",
      "Right now, I want to decide for myself what to do and when to do it.",
      "Strongly disagree",
      "Strongly agree"
    ],
    [
      "pleasure",
      "To what extent were your selection preferences motivated by the pursuit of pleasure?",
      "Not at all",
      "Very much"
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
    ],
    [
      "drama_liking",
      "How much do you like watching AI-generated dramas?",
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
let surveyPage = 0;
let surveySaving = false;
signoutDialog.classList.add("experience-survey");
signoutDialog.innerHTML = `<div class="survey-heading"><h2 id="signout-title">Thank you for trying Dramify!</h2><button type="button" class="signout-dismiss" hidden disabled aria-label="Close questionnaire">×</button></div>
<p id="signout-description">Before you finish, we would like to hear about your thoughts during the experience. Please answer the following questions based on the selections you just made.</p>
<form id="experience-survey-form"><div class="survey-page"></div></form>
<p class="signout-error" role="alert" hidden></p><div class="survey-navigation"><button type="button" class="survey-back">Back</button><button type="button" class="survey-next preorder-confirm">Next</button><button type="button" class="signout-confirm preorder-confirm" hidden>Submit and finish</button></div>`;
function surveyRecord() {return JSON.parse(localStorage.getItem(PARTICIPANT_STORAGE_KEY) || "null");}
function saveSurvey(patch) {
  const record=surveyRecord();
  if (!record || record.id !== activeParticipant?.id) throw new Error("Participant changed");
  record.postSurvey = {...record.postSurvey,...patch,version:"post-experience-v1",updatedAt:new Date().toISOString()};
  localStorage.setItem(PARTICIPANT_STORAGE_KEY,JSON.stringify(record));
  window.DramifyCloud.changed();
}
function renderSurvey() {
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
  if(surveyPage===3) {
    const copy=document.createElement("p");copy.textContent="Finally, please tell us a little about yourself.";area.append(copy);
    const form=document.createElement("div");
    form.innerHTML=`<label for="survey-gender">Your gender:</label><select id="survey-gender" required><option value="">Select your gender</option><option value="male">Male</option><option value="female">Female</option><option value="nonbinary-other">Nonbinary/Other</option><option value="prefer-not-to-say">Prefer not to say</option></select>
<label for="survey-age">Your age:</label><input id="survey-age" type="number" min="1" max="120" step="1" required>
<label for="survey-income">What is your average monthly income before taxes, in US dollars?</label><input id="survey-income" type="number" min="0" step="any" required>
<label for="survey-comment">Is there anything you would like to tell us about Dramify? (Optional)</label><textarea id="survey-comment" rows="5" maxlength="3000"></textarea>`;
    const record=surveyRecord();
    for(const [name,property] of [["gender","gender"],["age","age"],["income","monthlyIncome"]]) {
      const input=form.querySelector(`#survey-${name}`);input.value=record[property] ?? "";
      input.addEventListener("change",()=>{const latest=surveyRecord();latest[property]=name==="gender"?input.value:input.value===""?null:Number(input.value);localStorage.setItem(PARTICIPANT_STORAGE_KEY,JSON.stringify(latest));window.DramifyCloud.changed();});
    }
    const comment=form.querySelector("#survey-comment");comment.value=data.comment || "";
    comment.addEventListener("input",()=>saveSurvey({comment:comment.value}));area.append(form);
  }
  signoutDialog.querySelector(".survey-back").hidden=true;
  signoutDialog.querySelector(".survey-next").hidden=surveyPage===3;
  signoutDialog.querySelector(".signout-confirm").hidden=surveyPage!==3;
  signoutDialog.querySelector(".signout-confirm").textContent="Submit";
  window.scrollTo(0,0);
}
function surveyError(text) {const error=document.querySelector(".signout-error");error.textContent=text;error.hidden=false;}
function surveyComplete() {
  const data=surveyRecord()?.postSurvey || {};
  return surveyPages.flat().every(([key])=>Number.isInteger(data[key]) && data[key]>=1 && data[key]<=7);
}
signoutDialog.querySelector(".survey-next").addEventListener("click",()=>{
  if(!document.querySelector("#experience-survey-form").reportValidity())return;
  surveyPage++;saveSurvey({page:surveyPage});renderSurvey();
});
signoutDialog.querySelector(".survey-back").addEventListener("click",()=>{if(!surveySaving){surveyPage--;saveSurvey({page:surveyPage});renderSurvey();}});
signoutDialog.addEventListener("cancel",event=>{event.preventDefault();});
document.querySelector("#experience-survey-form").addEventListener("submit",event=>event.preventDefault());
function canFinishExperience() {
  const message = document.querySelector(".signout-error");
  try {
    const record = JSON.parse(localStorage.getItem(PARTICIPANT_STORAGE_KEY) || "null");
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
document.querySelector(".sign-out").addEventListener("click", () => {
  if (!activeParticipant) return;
  document.querySelector(".signout-error").hidden = true;
  document.querySelector(".signout-confirm").disabled = !canFinishExperience();
  if(!canFinishExperience()) {window.alert(document.querySelector(".signout-error").textContent);return;}
  surveyPage=Math.min(3,Math.max(0,surveyRecord()?.postSurvey?.page || 0));
  window.DramifyCloud.changed();
  saveSurvey({inProgress:true});renderSurvey();openSurveyPage();
});
document.querySelector(".signout-dismiss").addEventListener("click", () => {if(!surveySaving){saveSurvey({inProgress:false});closeSurveyPage();}});
document.querySelector(".signout-confirm").addEventListener("click", async () => {
  if (!activeParticipant) return;
  const confirmButton = document.querySelector(".signout-confirm");
  if (confirmButton.disabled) return;
  if (!canFinishExperience()) return;
  if(!document.querySelector("#experience-survey-form").reportValidity() || !surveyComplete()) {surveyError("Please answer every rating question before submitting.");return;}
  saveSurvey({completedAt:new Date().toISOString()});
  surveySaving=true;
  signoutDialog.querySelector(".survey-back").disabled=true;
  confirmButton.disabled = true;
  confirmButton.textContent = "Saving…";
  try {
    await window.DramifyCloud.complete();
  } catch (error) {
    const message = document.querySelector(".signout-error");
    message.textContent = "Your responses have not synced yet. Please check your connection and try again. Your data is still saved on this device.";
    message.hidden = false;
    confirmButton.disabled = false;
    confirmButton.textContent = "Submit";
    surveySaving=false;
    signoutDialog.querySelector(".survey-back").disabled=false;
    return;
  }
  try {
    const stored = JSON.parse(localStorage.getItem(PARTICIPANT_STORAGE_KEY) || "null");
    if (stored && stored.id !== activeParticipant.id) throw new Error("Participant changed");
    const feedbackKey = "dramify.feedback.v1";
    const entries = JSON.parse(localStorage.getItem(feedbackKey) || "[]");
    if (!Array.isArray(entries)) throw new Error("Invalid feedback records");
    const remaining = entries.filter(entry => entry.participantId !== activeParticipant.id);
    if (remaining.length) localStorage.setItem(feedbackKey, JSON.stringify(remaining));
    else localStorage.removeItem(feedbackKey);
    sessionStorage.removeItem(ACCESS_SESSION_KEY);
    sessionStorage.removeItem(COMPLETION_SESSION_KEY);
    const completedIds=JSON.parse(localStorage.getItem("dramify.completedConnectIds.v1") || "[]");
    localStorage.setItem("dramify.completedConnectIds.v1",JSON.stringify([...new Set([...completedIds,activeParticipant.connectId || activeParticipant.mturkWorkerId])]));
    localStorage.setItem("dramify.deviceCompleted.v1",new Date().toISOString());
    localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
    localStorage.removeItem(VERIFICATION_STORAGE_KEY);
  } catch (error) {
    const message = document.querySelector(".signout-error");
    message.textContent = "We could not delete your saved data. Please allow browser storage and try again.";
    message.hidden = false;
    confirmButton.disabled = false;
    confirmButton.textContent = "Submit";
    surveySaving=false;
    signoutDialog.querySelector(".survey-back").disabled=false;
    return;
  }
  if (stayTimerFrame !== null) cancelAnimationFrame(stayTimerFrame);
  stayTimerFrame = null;
  await window.DramifyCloud.clearSession();
  activeParticipant = null;
  returningParticipant = null;
  closeSurveyPage();
  if (feedbackDialog.open) feedbackDialog.close();
  const profileModal = document.querySelector(".profile-dialog");
  if (profileModal.open) profileModal.close();
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

const profileDialog = document.querySelector(".profile-dialog");
const profileForm = document.querySelector("#profile-form");
const profileCountry = document.querySelector("#profile-country");
const profileStatus = document.querySelector(".profile-status");
document.querySelector(".user-profile").addEventListener("click", () => {
  if (!activeParticipant) return;
  document.querySelector("#profile-nickname").value = activeParticipant.nickname;
  document.querySelector("#profile-gender").value = ({woman:"female", man:"male"})[activeParticipant.gender] || activeParticipant.gender;
  document.querySelector("#profile-age").value = activeParticipant.age;
  profileCountry.value = activeParticipant.country || "";
  document.querySelector("#profile-worker-id").value = activeParticipant.mturkWorkerId || "";
  profileStatus.hidden = true;
  profileDialog.showModal();
});
document.querySelector(".profile-close").addEventListener("click", () => profileDialog.close());
profileForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!activeParticipant || !profileForm.reportValidity()) return;
  const country = profileCountry.value.trim();
  if (!country) {
    profileStatus.textContent = "Please enter your country.";
    profileStatus.hidden = false;
    return;
  }
  let latestParticipant;
  try {
    latestParticipant = JSON.parse(localStorage.getItem(PARTICIPANT_STORAGE_KEY));
    if (!latestParticipant || latestParticipant.id !== activeParticipant.id) throw new Error("Participant changed");
  } catch (error) {
    profileStatus.textContent = "Your profile could not be read. Please refresh and try again.";
    profileStatus.hidden = false;
    return;
  }
  const updated = {
    ...latestParticipant,
    nickname: document.querySelector("#profile-nickname").value.trim(),
    gender: document.querySelector("#profile-gender").value,
    age: Number(document.querySelector("#profile-age").value),
    country,
    countryCode: "",
    updatedAt: new Date().toISOString()
  };
  if (!isValidParticipant(updated)) {
    profileStatus.textContent = "Please check your details and try again.";
    profileStatus.hidden = false;
    return;
  }
  try {
    localStorage.setItem(PARTICIPANT_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    profileStatus.textContent = "Your changes could not be saved. Please allow browser storage and try again.";
    profileStatus.hidden = false;
    return;
  }
  activeParticipant = updated;
  returningParticipant = updated;
  nicknameInput.value = updated.nickname;
  document.querySelector(".user-nickname").textContent = updated.nickname;
  document.querySelector(".user-profile").title = updated.nickname;
  window.DramifyCloud.changed();
  profileDialog.close();
});
