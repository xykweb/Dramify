"use strict";

// Only the public project key is shipped to the browser. RLS authenticates each
// participant through Supabase anonymous Auth; no service-role key is used.
window.DramifyCloud = (() => {
  const profileKey = "dramify.participant.v1";
  const authStorageKey = "dramify.supabase.auth";
  let participantId = null;
  let client = null;
  let authReady = null;
  let lastTick = 0;
  let interval = null;
  let timer = null;
  let queue = Promise.resolve();
  let finishing = false;
  let stopped = true;
  let syncFailed = false;
  let visible = true;
  function readParticipant() {
    const record = JSON.parse(localStorage.getItem(window.DRAMIFY_STORAGE_KEY(profileKey)) || "null");
    if (!record || record.id !== participantId) throw new Error("Participant changed");
    return record;
  }
  function showFailure(failed) {
    // Keep diagnostic state without showing backend messages to participants.
    syncFailed = failed;
  }
  function checkpoint() {
    if (stopped || finishing) return;
    const now = performance.now();
    const record = readParticipant();
    const elapsed = visible ? Math.max(0, (now - lastTick) / 1000) : 0;
    record.durationSeconds = Math.max(0, Number(record.durationSeconds) || 0) + elapsed;
    if(record.postSurvey?.inProgress) record.questionnaireDurationSeconds=(record.questionnaireDurationSeconds || 0)+elapsed;
    else record.browsingDurationSeconds=(record.browsingDurationSeconds || 0)+elapsed;
    record.durationMetric = "visible-seconds-v1";
    localStorage.setItem(window.DRAMIFY_STORAGE_KEY(profileKey), JSON.stringify(record));
    lastTick = now;
  }
  function requireSixWatchlist(record) {
    let count = 0;
    for (let id = 1; id <= 16; id++) {
      const key = `${id}${(id % 2 === 1) === (record.condition === "A") ? "a" : "b"}`;
      if (record.behaviors?.[key]?.watchlist) count++;
    }
    if (count !== 6) throw new Error("Please select exactly 6 dramas for My Watchlist before finishing.");
  }
  function buildSnapshot(record, userId, completed) {
    const code = record.accessCode || Object.entries(window.DRAMIFY_CONFIG.accessCodes).find(([, condition]) => condition === record.condition)?.[0];
    if (!code || window.DRAMIFY_CONFIG.accessCodes[code]!==record.condition || !Array.isArray(record.dramaOrder) || record.dramaOrder.length !== 16 || new Set(record.dramaOrder).size!==16 || !record.dramaOrder.every(id=>Number.isInteger(id)&&id>=1&&id<=16)) throw new Error("Invalid assignment");
    const stimuli = {};
    for (let id = 1; id <= 16; id++) for (const version of ["a", "b"]) {
      const key = `${id}${version}`;
      const exposed = version === ((id % 2 === 1) === (record.condition === "A") ? "a" : "b");
      const behavior=record.behaviors?.[key] || {};
      stimuli[key]={exposed,watchlist:exposed?Number(Boolean(behavior.watchlist)):null,liked:exposed?Number(Boolean(behavior.liked)):null,saved:exposed?Number(Boolean(behavior.saved)):null};
    }
    const behaviorCounts={watchlist:0,liked:0,saved:0};
    for(const item of Object.values(stimuli))if(item.exposed)for(const key of ["watchlist","liked","saved"])behaviorCounts[key]+=item[key];
    // Store added participant fields in existing JSON to avoid breaking uploads
    // on projects whose SQL export view has not been updated yet.
    // Reuse the existing Job storage slot for the Worker ID. The marker keeps
    // historical occupation answers from being exported as MTurk identifiers.
    behaviorCounts.job = record.mturkWorkerId || "";
    behaviorCounts.profile_field = "mturk_worker_id";
    behaviorCounts.monthly_income_usd = record.monthlyIncome ?? null;
    behaviorCounts.allocation_method = record.allocationMethod || "independent-legacy";
    behaviorCounts.fullscreen = record.fullscreen || null;
    behaviorCounts.is_test = Boolean(record.isTest);
    try {behaviorCounts.time_zone=record.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";} catch(error){behaviorCounts.time_zone="UTC";}

    const ua=navigator.userAgent || "";
    behaviorCounts.device_type=/iPad|Tablet/i.test(ua) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "Tablet" : /Mobi|iPhone|iPod|IEMobile/i.test(ua) ? "Mobile" : "Desktop/Laptop";
    behaviorCounts.browser_type=/Edg(?:e|A|iOS)?\//i.test(ua)?"Edge":/OPR\/|Opera/i.test(ua)?"Opera":/Firefox\/|FxiOS\//i.test(ua)?"Firefox":/Chrome\/|CriOS\//i.test(ua)?"Chrome":/Safari\//i.test(ua)?"Safari":"Other";

    behaviorCounts.assignment_id = record.assignmentId || "";
    behaviorCounts.project_id = record.projectId || "";
    behaviorCounts.referrer = record.referrer || "";
    behaviorCounts.connect_id = record.connectId || "";
    behaviorCounts.recruitment_source = record.recruitmentSource || "legacy";
    behaviorCounts.browsing_duration_seconds = record.browsingDurationSeconds || 0;
    behaviorCounts.questionnaire_duration_seconds = record.questionnaireDurationSeconds || 0;
    behaviorCounts.post_survey = record.postSurvey || null;
    const survey=record.postSurvey || {};
    const questionKeys=["imagery_events","imagery_self","narrative_involvement","storyline_detail","narrative_depth","story_richness","telepresence_presence","telepresence_absorption","control_events","control_life","control_decisions","pleasure","time_pressure","decision_speed","drama_liking","financial_constraint"];
    const selected=Object.values(stimuli).filter(item=>item.exposed && item.watchlist===1).length;
    const answered=questionKeys.filter(key=>Number.isInteger(survey[key]) && survey[key]>=1 && survey[key]<=7).length;
    const demographics=Number(Boolean(record.gender))+Number(Number.isInteger(record.age))+Number(Number.isFinite(record.monthlyIncome));
    const now=new Date().toISOString();
    const start=record.startDate || record.createdAt;
    behaviorCounts.response_metadata={
      StartDate:start,
      EndDate:completed?now:null,
      Progress:completed?100:Math.min(99,Math.round((1+Math.min(6,selected)+answered+demographics)/26*100)),
      Duration__in_seconds_:Math.max(0,Math.round((Date.parse(now)-Date.parse(start))/1000)),
      Finished:Boolean(completed),
      ResponseId:record.id,
      DistributionChannel:record.isTest?"preview":"cloudresearch"
    };
    behaviorCounts.duration_metric = record.durationMetric || "legacy";
    return {
      interface_version: record.interfaceVersion || "watch-v4",
      behavior_counts: behaviorCounts,
      behavior_events: [
        ...(record.behaviorEvents || []),
        ...(record.mturkWorkerId ? [{action:"profile_snapshot", mturk_worker_id:record.mturkWorkerId, at:record.updatedAt || record.createdAt}] : [])
      ],
      id: record.id,
      auth_user_id: userId,
      access_code: code,
      nickname: record.nickname || "Participant",
      gender: ({woman:"female", man:"male"})[record.gender] || record.gender,
      age: record.age,
      country: record.country,
      duration_seconds: Math.round((Number(record.durationSeconds) || 0) * 1000) / 1000,
      app_rating: null,
      comment: record.postSurvey?.comment || "",
      drama_order: record.dramaOrder,
      stimuli,
      completed: Boolean(completed),
      updated_at: new Date().toISOString()
    };
  }
  async function ensureAuth() {
    if (!authReady) {
      authReady = (async () => {
        if (!window.supabase?.createClient) throw new Error("Supabase client unavailable");
        if (!client) client = window.supabase.createClient(window.DRAMIFY_CONFIG.supabase.url, window.DRAMIFY_CONFIG.supabase.publishableKey, {
          global:{fetch:async (input,init={})=>{
            const controller=new AbortController();
            const timeout=setTimeout(()=>controller.abort(),20000);
            const parent=init.signal;
            const abort=()=>controller.abort();
            if(parent){if(parent.aborted)abort();else parent.addEventListener("abort",abort,{once:true});}
            try {return await fetch(input,{...init,signal:controller.signal});}
            finally {clearTimeout(timeout);if(parent)parent.removeEventListener("abort",abort);}
          }},
          auth:{storageKey:window.DRAMIFY_STORAGE_KEY(authStorageKey), persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}
        });
        const record = readParticipant();
        const {data:sessionData,error:sessionError} = await client.auth.getSession();
        if (sessionError) throw sessionError;
        let user = sessionData.session?.user;
        if (record.cloudAuthId && user?.id !== record.cloudAuthId) throw new Error("Saved authentication is unavailable; do not clear browser data");
        // A new local participant must not overwrite a previous participant's row.
        if (user && !record.cloudAuthId) {
          const {data,error} = await client.from("dramify_responses").select("id").eq("auth_user_id",user.id).maybeSingle();
          if (error) throw error;
          if (data && data.id !== record.id) {
            const {error:signoutError} = await client.auth.signOut({scope:"local"});
            if (signoutError) throw signoutError;
            user = null;
          }
        }
        if (!user) {
          const {data,error} = await client.auth.signInAnonymously();
          if (error) throw error;
          user = data.user;
        }
        if (!user) throw new Error("Anonymous sign-in did not return a user");
        const latest = readParticipant();
        localStorage.setItem(window.DRAMIFY_STORAGE_KEY(profileKey), JSON.stringify({...latest,cloudAuthId:user.id}));
        return user.id;
      })().catch(error => { authReady = null; throw error; });
    }
    return authReady;
  }
  async function allocateCondition(participant) {
    if(window.DRAMIFY_CONTEXT.isTest || participant.dramaOrder)return participant;
    participantId=participant.id;
    await ensureAuth();
    const {data,error}=await client.rpc("dramify_allocate",{p_response_id:participant.id,p_connect_id:participant.connectId});
    if(error)throw error;
    if(!Object.prototype.hasOwnProperty.call(window.DRAMIFY_CONFIG.accessCodes,data))throw new Error("Invalid server assignment");
    const record=readParticipant();
    record.accessCode=data;record.condition=window.DRAMIFY_CONFIG.accessCodes[data];record.allocationMethod="server-balanced-v1";
    localStorage.setItem(window.DRAMIFY_STORAGE_KEY(profileKey),JSON.stringify(record));
    return record;
  }
  function flush(completed = false) {
    if (stopped) return Promise.resolve();
    // Serialize writes. Read a fresh snapshot when a request actually executes,
    // so an earlier request cannot overwrite a more recent choice or rating.
    const work = queue.catch(() => {}).then(async () => {
      const userId = await ensureAuth();
      const record = readParticipant();
      if (completed) {
        requireSixWatchlist(record);
        if(!["male","female","nonbinary-other","prefer-not-to-say"].includes(record.gender) || !Number.isInteger(record.age) || record.age<1 || record.age>120 || !Number.isFinite(record.monthlyIncome) || record.monthlyIncome < 0) throw new Error("Please complete your demographic information.");
        const keys = ["imagery_events", "imagery_self", "narrative_involvement", "storyline_detail", "narrative_depth", "story_richness", "telepresence_presence", "telepresence_absorption", "control_events", "control_life", "control_decisions", "pleasure", "time_pressure", "decision_speed", "drama_liking", "financial_constraint"];
        if (!keys.every(key => Number.isInteger(record.postSurvey?.[key]) && record.postSurvey[key] >= 1 && record.postSurvey[key] <= 7)) throw new Error("Please complete the questionnaire before finishing.");
      }
      const row = buildSnapshot(record,userId,completed);
      const {error} = await client.from("dramify_responses").upsert(row,{onConflict:"id"});
      if (error) throw error;
      showFailure(false);
    });
    queue = work;
    return work.catch(error => {
      showFailure(true);
      console.warn("Dramify sync failed:",error.message || "Connection error");
      throw error;
    });
  }
  function changed() {
    if (stopped || finishing) return;
    try { checkpoint(); } catch (error) {showFailure(true);return;}
    clearTimeout(timer);
    timer = setTimeout(() => {flush().catch(() => {});},250);
  }
  function start(participant) {
    if (!stopped) return;
    participantId = participant.id;
    stopped = false;
    lastTick = performance.now();
    visible = document.visibilityState !== "hidden";
    interval = setInterval(() => {
      if (stopped || finishing) return;
      try {checkpoint();flush().catch(() => {});} catch (error) {showFailure(true);}
    },10000);
    flush().catch(() => {});
  }
  async function complete() {
    if (stopped && finishing) return;
    if (stopped) throw new Error("Cloud collection has not started");
    requireSixWatchlist(readParticipant());
    checkpoint();
    finishing = true;
    clearTimeout(timer);
    try {
      await flush(true);
    } catch (error) {
      finishing = false;
      lastTick = performance.now();
      throw error;
    }
    stopped = true;
    clearInterval(interval);
  }
  async function clearSession() {
    // The final row remains in the database. Only local authentication is reset.
    try {if(client)await client.auth.signOut({scope:"local"});} catch (error) { /* Data is already saved. */ }
    try {localStorage.removeItem(window.DRAMIFY_STORAGE_KEY(authStorageKey));} catch (error) { /* The upload remains complete even if storage cleanup is blocked. */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (stopped || finishing) return;
    try {checkpoint();} catch (error) {showFailure(true);}
    visible = document.visibilityState !== "hidden";
    changed();
  });
  window.addEventListener("hashchange", () => {
    if (stopped || finishing) return;
    try {checkpoint();} catch (error) {showFailure(true);}
    changed();
  });
  window.addEventListener("pagehide", () => {
    // Local checkpoint is synchronous. The regular heartbeats, rather than an
    // unreliable unload request, provide the primary cloud duration updates.
    if (!stopped && !finishing) {try {checkpoint();} catch (error) {showFailure(true);}}
  });
  window.addEventListener("pageshow",event => {if(event.persisted && !stopped){lastTick=performance.now();visible=document.visibilityState!=="hidden";}});
  window.addEventListener("online",changed);
  function getDurationSeconds() {
    const stored = Math.max(0, Number(readParticipant()?.browsingDurationSeconds) || 0);
    return stored + (!stopped && !finishing && visible && !readParticipant()?.postSurvey?.inProgress ? Math.max(0, (performance.now() - lastTick) / 1000) : 0);
  }
  return {allocateCondition,start,changed,complete,clearSession,getDurationSeconds,getSyncStatus:() => ({failed:syncFailed})};
})();
