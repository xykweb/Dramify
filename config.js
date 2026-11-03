"use strict";

// Detect phones/tablets by device signals rather than desktop window width.
window.DRAMIFY_MOBILE_BLOCKED = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  || navigator.userAgentData?.mobile === true;
if (window.DRAMIFY_MOBILE_BLOCKED) document.documentElement.classList.add("mobile-device");

// Change these 4-digit codes, then redeploy to update access and assignment.
// This is a client-side gate, not server-enforced authentication.
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
window.DRAMIFY_CONTEXT=Object.freeze({
 isTest:contextParams.get("mode")==="test",
 source:contextParams.get("source") || (contextParams.has("participantId")?"connect":"direct"),
 participantId:contextParams.get("participantId") || "",
 assignmentId:contextParams.get("assignmentId") || "",
 projectId:contextParams.get("projectId") || ""
});
window.DRAMIFY_STORAGE_KEY=key=>window.DRAMIFY_CONTEXT.isTest?"test."+key:key;
