"use strict";

// Detect phones/tablets by device signals rather than desktop window width.
window.DRAMIFY_MOBILE_BLOCKED = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  || navigator.userAgentData?.mobile === true;
if (window.DRAMIFY_MOBILE_BLOCKED) document.documentElement.classList.add("mobile-device");

// Internal cell identifiers only. Participants do not enter these values.
window.DRAMIFY_CONFIG = Object.freeze({
  accessCodes: Object.freeze({
    "2002": "A",
    "2004": "B",
    "2006": "A",
    "2008": "B"
  }),
  connect: Object.freeze({redirectUrl: "https://connect.cloudresearch.com/participant/project/8B361969E9/complete", completionCode: "8B361969E9"}),
  supabase: Object.freeze({
    url: "https://urhygljezvfxujzkmzfz.supabase.co",
    publishableKey: "sb_publishable_R3qNsaFSf9T0QX_DdGqhIw_zlRSsPtn"
  })
});

const contextParams=new URLSearchParams(window.location.search);
const connectParameters=["participantId","assignmentId","projectId"].map(key=>(contextParams.get(key)||"").trim());
const hasConnectParameters=["participantId","assignmentId","projectId"].some(key=>contextParams.has(key));
const validConnectEntry=connectParameters.every(value=>value && value.length<=256 && !/^(x+|undefined|null)$/i.test(value)) && /^[A-Za-z0-9]{1,64}$/.test(connectParameters[0]);
window.DRAMIFY_CONTEXT=Object.freeze({
 isConnect:validConnectEntry,
 invalidEntry:hasConnectParameters && !validConnectEntry,
 isTest:!validConnectEntry,
 source:validConnectEntry?"connect":"preview",
 participantId:connectParameters[0],
 assignmentId:connectParameters[1],
 projectId:connectParameters[2]
});
window.DRAMIFY_STORAGE_KEY=key=>window.DRAMIFY_CONTEXT.isTest?"test."+key:key;
