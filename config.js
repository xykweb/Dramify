"use strict";

// Change these 4-digit codes, then redeploy to update access and assignment.
// This is a client-side gate, not server-enforced authentication.
window.DRAMIFY_CONFIG = Object.freeze({
  accessCodes: Object.freeze({
    "2002": "A",
    "2004": "B",
    "2006": "A",
    "2008": "B"
  }),
  connect: Object.freeze({redirectUrl: "https://connect.cloudresearch.com/participant/project/B20B7AE292/complete", completionCode: ""}),
  completionCode: "skmxbueo",
  supabase: Object.freeze({
    url: "https://urhygljezvfxujzkmzfz.supabase.co",
    publishableKey: "sb_publishable_R3qNsaFSf9T0QX_DdGqhIw_zlRSsPtn"
  })
});
