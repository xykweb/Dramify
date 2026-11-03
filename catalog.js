"use strict";

// The deployed Excel file is the single source of drama titles and metadata.
window.DramifyContent = (() => {
  const base = new URL(".", document.currentScript.src);
  let pending = null;
  const headers = ["ItemNumber", "标题", "abstract", "标签1", "标签2", "标签3", "标签4"];

  function validateRows(rows) {
    if (!Array.isArray(rows) || rows.length < 2) throw new Error("The content workbook is empty.");
    const first = rows[0].map(value => String(value ?? "").trim());
    const columns = headers.map(header => first.indexOf(header));
    if (columns.slice(0,2).some(index => index < 0)) throw new Error("The content workbook must retain the ItemNumber and 标题 column headers.");
    const records = new Map();
    for (const row of rows.slice(1)) {
      if (!row.some(value => value !== null && value !== undefined && String(value).trim() !== "")) continue;
      const values = columns.map(index => String(row[index] ?? "").trim());
      const [number, title, abstract, ...tags] = values;
      const id = number.toLowerCase();
      if (!/^(?:[1-9]|1[0-6])[ab]$/.test(id)) throw new Error(`Invalid ItemNumber: ${number}`);
      if (records.has(id)) throw new Error(`Duplicate ItemNumber: ${number}`);
      if (!title) throw new Error(`Missing title for ${number}`);
      records.set(id, {title, abstract, tags: tags.filter(Boolean)});
    }
    if (records.size !== 32) throw new Error("The content workbook must contain exactly 32 unique items: 1a through 16b.");
    return records;
  }

  async function load(dramas) {
    if (!pending) {
      pending = (async () => {
        if (base.protocol === "file:") throw new Error("Please open Dramify using 启动网站.command so the browser can read the Excel workbook.");
        if (!window.XLSX?.read) throw new Error("Excel reader is unavailable.");
        const url = new URL("content/dramas.xlsx", base);
        url.searchParams.set("updated", String(Date.now()));
        let bytes;
        for(let attempt=0;attempt<2;attempt++) {
          const controller=new AbortController();
          const timeout=setTimeout(()=>controller.abort(),12000);
          try {
            const response=await fetch(url,{cache:"no-store",signal:controller.signal});
            if(!response.ok)throw new Error(`Content workbook could not be loaded (HTTP ${response.status}).`);
            bytes=await response.arrayBuffer();
            break;
          } catch(error) {
            if(attempt===1 || /HTTP 4\d\d/.test(error.message))throw error;
          } finally {clearTimeout(timeout);}
        }
        const workbook = window.XLSX.read(bytes, {type:"array", cellHTML:false, cellFormula:false});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(worksheet, {header:1, defval:"", blankrows:false});
        return validateRows(rows);
      })().catch(error => {pending = null; throw error;});
    }
    const records = await pending;
    // Apply only after every record passed validation; never mix old/new titles.
    for (const drama of dramas) for (const version of ["a", "b"]) Object.assign(drama[version], records.get(`${drama.id}${version}`));
  }
  async function preload(dramas) {
    await Promise.all([...dramas.map(drama=>new URL(drama.a.image,base).href),new URL("assets/brand/home-banner.png",base).href].map(src=>new Promise((resolve,reject)=>{
      const image=new Image();
      const timer=setTimeout(()=>{image.onload=image.onerror=null;reject(new Error("Series images timed out"));},30000);
      image.onload=()=>{clearTimeout(timer);resolve();};
      image.onerror=()=>{clearTimeout(timer);reject(new Error("A required series image is missing"));};
      image.src=src;
    })));
  }
  return {load, validateRows, preload};
})();
