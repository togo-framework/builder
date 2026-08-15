"use strict";var BuilderIssues=(()=>{var _e=Object.defineProperty;var lr=Object.getOwnPropertyDescriptor;var dr=Object.getOwnPropertyNames;var cr=Object.prototype.hasOwnProperty;var pr=(e,t,n)=>t in e?_e(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n;var ur=(e,t)=>{for(var n in t)_e(e,n,{get:t[n],enumerable:!0})},hr=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of dr(t))!cr.call(e,o)&&o!==n&&_e(e,o,{get:()=>t[o],enumerable:!(r=lr(t,o))||r.enumerable});return e};var mr=e=>hr(_e({},"__esModule",{value:!0}),e);var j=(e,t,n)=>pr(e,typeof t!="symbol"?t+"":t,n);var Uo={};ur(Uo,{BRIDGE_MSG:()=>L,hasIcon:()=>at,highlightPin:()=>Ge,icon:()=>T,mount:()=>Zn,setApps:()=>zo,toggleDock:()=>_o});var le="data-builder-sdk";function Ne(e){return!!e?.closest?.(`[${le}]`)}function Vt(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,o={tag:e.tagName.toLowerCase(),hint:Te(e),css:gr(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},i=e.getAttribute("data-testid")??e.getAttribute("data-test-id");i&&(o.testid=i),e.id&&!Gt(e.id)&&(o.domId=e.id);let a=e.getAttribute("role")??br(e);a&&(o.role=a);let s=Zt(e);s&&(o.name=s);for(let[c,u]of fr(o))try{let y=document.querySelectorAll(u);y.length===1&&y[0]===e&&o.verified.push(c)}catch{}return o}function fr(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${Me(e.testid)}"]`]),e.domId&&t.push(["domId",`#${Me(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var Ue=.5;function je(e){if(e.testid){let t=ze(`[data-testid="${Me(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=Xt(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=ze(`[role="${Me(e.role)}"]`).filter(n=>Zt(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=Xt(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=ze(e.css);if(t.length===1){let n=t[0],r=!e.hint||mt(Te(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=ze(e.tag||"*").filter(n=>mt(Te(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function Xt(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,o=null,i=1/0;for(let a of e){let s=a.getBoundingClientRect(),c=s.left/n-t.rect.x,u=s.top/r-t.rect.y,y=Math.hypot(c,u);t.hint&&mt(Te(a),t.hint)&&(y-=.5),y<i&&([o,i]=[a,y])}return o}function ze(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!Ne(t))}catch{return[]}}function gr(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!Gt(n.id)){t.unshift(`#${Me(n.id)}`);break}let o=n.tagName.toLowerCase(),i=n.parentElement;if(!i){t.unshift(o);break}let a=Array.from(i.children).filter(s=>s.tagName===n.tagName);t.unshift(a.length>1?`${o}:nth-of-type(${a.indexOf(n)+1})`:o),n=i}return t.join(" > ").slice(0,512)}function Gt(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function Te(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function mt(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function Zt(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||Te(e)).slice(0,80)}function br(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function Me(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function ft(e){return e.length?`path("${e.map(n=>{let r=Math.floor(n.x),o=Math.floor(n.y),i=Math.ceil(n.x+n.w),a=Math.ceil(n.y+n.h);return`M${r} ${o} H${i} V${a} H${r} Z`}).join(" ")}")`:'path("M0 0 Z")'}var oe='path("M0 0 Z")';function Yt(e,t){if(e.length!==t.length)return!1;for(let n=0;n<e.length;n++){let r=e[n],o=t[n];if(r.x!==o.x||r.y!==o.y||r.w!==o.w||r.h!==o.h)return!1}return!0}function Kt(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),o=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(o),t&&(r.href=t),o.href=e,o.href}var Jt=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function Y(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var ge=null;function qe(e={}){return ge||(e.includeStyleProperties?(ge=e.includeStyleProperties,ge):(ge=Y(window.getComputedStyle(document.documentElement)),ge))}function We(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function vr(e){let t=We(e,"border-left-width"),n=We(e,"border-right-width");return e.clientWidth+t+n}function xr(e){let t=We(e,"border-top-width"),n=We(e,"border-bottom-width");return e.clientHeight+t+n}function gt(e,t={}){let n=t.width||vr(e),r=t.height||xr(e);return{width:n,height:r}}function Qt(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var X=16384;function en(e){(e.width>X||e.height>X)&&(e.width>X&&e.height>X?e.width>e.height?(e.height*=X/e.width,e.width=X):(e.width*=X/e.height,e.height=X):e.width>X?(e.height*=X/e.width,e.width=X):(e.width*=X/e.height,e.height=X))}function tn(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),o=r.length,i=new Uint8Array(o);for(let a=0;a<o;a+=1)i[a]=r.charCodeAt(a);n(new Blob([i],{type:t.type?t.type:"image/png"}))})}function be(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function yr(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function nn(e,t,n){let r="http://www.w3.org/2000/svg",o=document.createElementNS(r,"svg"),i=document.createElementNS(r,"foreignObject");return o.setAttribute("width",`${t}`),o.setAttribute("height",`${n}`),o.setAttribute("viewBox",`0 0 ${t} ${n}`),i.setAttribute("width","100%"),i.setAttribute("height","100%"),i.setAttribute("x","0"),i.setAttribute("y","0"),i.setAttribute("externalResourcesRequired","true"),o.appendChild(i),i.appendChild(e),yr(o)}var U=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||U(n,t)};function wr(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function kr(e,t){return qe(t).map(n=>{let r=e.getPropertyValue(n),o=e.getPropertyPriority(n);return`${n}: ${r}${o?" !important":""};`}).join(" ")}function Er(e,t,n,r){let o=`.${e}:${t}`,i=n.cssText?wr(n):kr(n,r);return document.createTextNode(`${o}{${i}}`)}function rn(e,t,n,r){let o=window.getComputedStyle(e,n),i=o.getPropertyValue("content");if(i===""||i==="none")return;let a=Jt();try{t.className=`${t.className} ${a}`}catch{return}let s=document.createElement("style");s.appendChild(Er(a,n,o,r)),t.appendChild(s)}function on(e,t,n){rn(e,t,":before",n),rn(e,t,":after",n)}var an="application/font-woff",sn="image/jpeg",Cr={woff:an,woff2:an,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:sn,jpeg:sn,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function Ar(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function ve(e){let t=Ar(e).toLowerCase();return Cr[t]||""}function Lr(e){return e.split(/,/)[1]}function Re(e){return e.search(/^(data:)/)!==-1}function vt(e,t){return`data:${t};base64,${e}`}async function xt(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let o=await r.blob();return new Promise((i,a)=>{let s=new FileReader;s.onerror=a,s.onloadend=()=>{try{i(n({res:r,result:s.result}))}catch(c){a(c)}},s.readAsDataURL(o)})}var bt={};function Sr(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function xe(e,t,n){let r=Sr(e,t,n.includeQueryParams);if(bt[r]!=null)return bt[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let o;try{let i=await xt(e,n.fetchRequestInit,({res:a,result:s})=>(t||(t=a.headers.get("Content-Type")||""),Lr(s)));o=vt(i,t)}catch(i){o=n.imagePlaceholder||"";let a=`Failed to fetch resource: ${e}`;i&&(a=typeof i=="string"?i:i.message),a&&console.warn(a)}return bt[r]=o,o}async function Tr(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):be(t)}async function Mr(e,t){if(e.currentSrc){let i=document.createElement("canvas"),a=i.getContext("2d");i.width=e.clientWidth,i.height=e.clientHeight,a?.drawImage(e,0,0,i.width,i.height);let s=i.toDataURL();return be(s)}let n=e.poster,r=ve(n),o=await xe(n,r,t);return be(o)}async function Rr(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await Pe(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function Pr(e,t){return U(e,HTMLCanvasElement)?Tr(e):U(e,HTMLVideoElement)?Mr(e,t):U(e,HTMLIFrameElement)?Rr(e,t):e.cloneNode(ln(e))}var $r=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",ln=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function Hr(e,t,n){var r,o;if(ln(t))return t;let i=[];return $r(e)&&e.assignedNodes?i=Y(e.assignedNodes()):U(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?i=Y(e.contentDocument.body.childNodes):i=Y(((o=e.shadowRoot)!==null&&o!==void 0?o:e).childNodes),i.length===0||U(e,HTMLVideoElement)||await i.reduce((a,s)=>a.then(()=>Pe(s,n)).then(c=>{c&&t.appendChild(c)}),Promise.resolve()),t}function Ir(e,t,n){let r=t.style;if(!r)return;let o=window.getComputedStyle(e);o.cssText?(r.cssText=o.cssText,r.transformOrigin=o.transformOrigin):qe(n).forEach(i=>{let a=o.getPropertyValue(i);i==="font-size"&&a.endsWith("px")&&(a=`${Math.floor(parseFloat(a.substring(0,a.length-2)))-.1}px`),U(e,HTMLIFrameElement)&&i==="display"&&a==="inline"&&(a="block"),i==="d"&&t.getAttribute("d")&&(a=`path(${t.getAttribute("d")})`),r.setProperty(i,a,o.getPropertyPriority(i))})}function Dr(e,t){U(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),U(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function Or(e,t){if(U(e,HTMLSelectElement)){let r=Array.from(t.children).find(o=>e.value===o.getAttribute("value"));r&&r.setAttribute("selected","")}}function Fr(e,t,n){return U(t,Element)&&(Ir(e,t,n),on(e,t,n),Dr(e,t),Or(e,t)),t}async function Br(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let i=0;i<n.length;i++){let s=n[i].getAttribute("xlink:href");if(s){let c=e.querySelector(s),u=document.querySelector(s);!c&&u&&!r[s]&&(r[s]=await Pe(u,t,!0))}}let o=Object.values(r);if(o.length){let i="http://www.w3.org/1999/xhtml",a=document.createElementNS(i,"svg");a.setAttribute("xmlns",i),a.style.position="absolute",a.style.width="0",a.style.height="0",a.style.overflow="hidden",a.style.display="none";let s=document.createElementNS(i,"defs");a.appendChild(s);for(let c=0;c<o.length;c++)s.appendChild(o[c]);e.appendChild(a)}return e}async function Pe(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>Pr(r,t)).then(r=>Hr(e,r,t)).then(r=>Fr(e,r,t)).then(r=>Br(r,t))}var dn=/url\((['"]?)([^'"]+?)\1\)/g,_r=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,zr=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function Nr(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function Ur(e){let t=[];return e.replace(dn,(n,r,o)=>(t.push(o),n)),t.filter(n=>!Re(n))}async function jr(e,t,n,r,o){try{let i=n?Kt(t,n):t,a=ve(t),s;if(o){let c=await o(i);s=vt(c,a)}else s=await xe(i,a,r);return e.replace(Nr(t),`$1${s}$3`)}catch{}return e}function Wr(e,{preferredFontFormat:t}){return t?e.replace(zr,n=>{for(;;){let[r,,o]=_r.exec(n)||[];if(!o)return"";if(o===t)return`src: ${r};`}}):e}function yt(e){return e.search(dn)!==-1}async function Xe(e,t,n){if(!yt(e))return e;let r=Wr(e,n);return Ur(r).reduce((i,a)=>i.then(s=>jr(s,a,t,n)),Promise.resolve(r))}async function ye(e,t,n){var r;let o=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(o){let i=await Xe(o,null,n);return t.style.setProperty(e,i,t.style.getPropertyPriority(e)),!0}return!1}async function qr(e,t){await ye("background",e,t)||await ye("background-image",e,t),await ye("mask",e,t)||await ye("-webkit-mask",e,t)||await ye("mask-image",e,t)||await ye("-webkit-mask-image",e,t)}async function Xr(e,t){let n=U(e,HTMLImageElement);if(!(n&&!Re(e.src))&&!(U(e,SVGImageElement)&&!Re(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,o=await xe(r,ve(r),t);await new Promise((i,a)=>{e.onload=i,e.onerror=t.onImageErrorHandler?(...c)=>{try{i(t.onImageErrorHandler(...c))}catch(u){a(u)}}:a;let s=e;s.decode&&(s.decode=i),s.loading==="lazy"&&(s.loading="eager"),n?(e.srcset="",e.src=o):e.href.baseVal=o})}async function Vr(e,t){let r=Y(e.childNodes).map(o=>wt(o,t));await Promise.all(r).then(()=>e)}async function wt(e,t){U(e,Element)&&(await qr(e,t),await Xr(e,t),await Vr(e,t))}function cn(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(o=>{n[o]=r[o]}),e}var pn={};async function un(e){let t=pn[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},pn[e]=t,t}async function hn(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,i=(n.match(/url\([^)]+\)/g)||[]).map(async a=>{let s=a.replace(r,"$1");return s.startsWith("https://")||(s=new URL(s,e.url).href),xt(s,t.fetchRequestInit,({result:c})=>(n=n.replace(a,`url(${c})`),[a,c]))});return Promise.all(i).then(()=>n)}function mn(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),o=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let c=o.exec(r);if(c===null)break;t.push(c[0])}r=r.replace(o,"");let i=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",s=new RegExp(a,"gi");for(;;){let c=i.exec(r);if(c===null){if(c=s.exec(r),c===null)break;i.lastIndex=s.lastIndex}else s.lastIndex=i.lastIndex;t.push(c[0])}return t}async function Gr(e,t){let n=[],r=[];return e.forEach(o=>{if("cssRules"in o)try{Y(o.cssRules||[]).forEach((i,a)=>{if(i.type===CSSRule.IMPORT_RULE){let s=a+1,c=i.href,u=un(c).then(y=>hn(y,t)).then(y=>mn(y).forEach(g=>{try{o.insertRule(g,g.startsWith("@import")?s+=1:o.cssRules.length)}catch(C){console.error("Error inserting rule from remote css",{rule:g,error:C})}})).catch(y=>{console.error("Error loading remote css",y.toString())});r.push(u)}})}catch(i){let a=e.find(s=>s.href==null)||document.styleSheets[0];o.href!=null&&r.push(un(o.href).then(s=>hn(s,t)).then(s=>mn(s).forEach(c=>{a.insertRule(c,a.cssRules.length)})).catch(s=>{console.error("Error loading remote stylesheet",s)})),console.error("Error inlining remote css file",i)}}),Promise.all(r).then(()=>(e.forEach(o=>{if("cssRules"in o)try{Y(o.cssRules||[]).forEach(i=>{n.push(i)})}catch(i){console.error(`Error while reading CSS rules from ${o.href}`,i)}}),n))}function Zr(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>yt(t.style.getPropertyValue("src")))}async function Yr(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=Y(e.ownerDocument.styleSheets),r=await Gr(n,t);return Zr(r)}function fn(e){return e.trim().replace(/["']/g,"")}function Kr(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(i=>{t.add(fn(i))}),Array.from(r.children).forEach(i=>{i instanceof HTMLElement&&n(i)})}return n(e),t}async function gn(e,t){let n=await Yr(e,t),r=Kr(e);return(await Promise.all(n.filter(i=>r.has(fn(i.style.fontFamily))).map(i=>{let a=i.parentStyleSheet?i.parentStyleSheet.href:null;return Xe(i.cssText,a,t)}))).join(`
`)}async function bn(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await gn(e,t);if(n){let r=document.createElement("style"),o=document.createTextNode(n);r.appendChild(o),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function Jr(e,t={}){let{width:n,height:r}=gt(e,t),o=await Pe(e,t,!0);return await bn(o,t),await wt(o,t),cn(o,t),await nn(o,n,r)}async function Qr(e,t={}){let{width:n,height:r}=gt(e,t),o=await Jr(e,t),i=await be(o),a=document.createElement("canvas"),s=a.getContext("2d"),c=t.pixelRatio||Qt(),u=t.canvasWidth||n,y=t.canvasHeight||r;return a.width=u*c,a.height=y*c,t.skipAutoScale||en(a),a.style.width=`${u}`,a.style.height=`${y}`,t.backgroundColor&&(s.fillStyle=t.backgroundColor,s.fillRect(0,0,a.width,a.height)),s.drawImage(i,0,0,a.width,a.height),a}async function vn(e,t={}){let n=await Qr(e,t);return await tn(n)}var eo="data-builder-hide",kt={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},xn=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function yn(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function Et(e){return e==="video"?kt.video:e==="image"?kt.image:kt.file}function Ve(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function de(e=2e4){let t=await Promise.race([vn(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!1,skipFonts:!0,imagePlaceholder:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",filter:n=>{let r=n;return!(r?.getAttribute?.(le)!==null&&r?.hasAttribute?.(le)||r?.hasAttribute?.(eo))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${to()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function to(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function we(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}function ke(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},o=c=>{let u=document.elementFromPoint(c.clientX,c.clientY);if(!u||Ne(u)||u===document.body||u===document.documentElement){r();return}u!==n&&(r(),n=u,u.classList.add("builder-pin-hover"))},i=c=>{let u=document.elementFromPoint(c.clientX,c.clientY);if(!u||Ne(u))return;c.preventDefault(),c.stopPropagation();let y=Vt(u);s(),e(y,u)},a=c=>{c.key==="Escape"&&(c.preventDefault(),s(),t())};function s(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",o,!0),document.removeEventListener("click",i,!0),document.removeEventListener("keydown",a,!0)}return document.addEventListener("mousemove",o,!0),document.addEventListener("click",i,!0),document.addEventListener("keydown",a,!0),s}function Ge(e){let t=je(e);if(!t.el||t.confidence<Ue)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}function wn(){return new Promise(e=>{let t=document.createElement("div");t.style.cssText=["position:fixed","inset:0","z-index:2147483600","cursor:crosshair","background:rgba(0,0,0,0.28)","touch-action:none","user-select:none"].join(";"),t.setAttribute("data-builder-hide","");let n=document.createElement("div");n.style.cssText=["position:fixed","border:2px solid #6366f1","background:rgba(99,102,241,0.14)","box-shadow:0 0 0 9999px rgba(0,0,0,0.28)","pointer-events:none","display:none"].join(";");let r=document.createElement("div");r.textContent="Drag to select an area \xB7 Esc to cancel",r.style.cssText=["position:fixed","top:16px","left:50%","transform:translateX(-50%)","padding:6px 12px","border-radius:8px","background:rgba(17,17,20,0.92)","color:#fff","font:500 12px/1.4 system-ui,sans-serif","pointer-events:none","white-space:nowrap"].join(";"),t.appendChild(n),t.appendChild(r),document.body.appendChild(t);let o=0,i=0,a=!1,s=g=>{window.removeEventListener("keydown",y,!0),t.remove(),e(g)},c=(g,C)=>({x:Math.min(o,g),y:Math.min(i,C),w:Math.abs(g-o),h:Math.abs(C-i)}),u=g=>{n.style.display="block",n.style.left=`${g.x}px`,n.style.top=`${g.y}px`,n.style.width=`${g.w}px`,n.style.height=`${g.h}px`,r.textContent=`${Math.round(g.w)} \xD7 ${Math.round(g.h)}`},y=g=>{g.key==="Escape"&&(g.preventDefault(),g.stopPropagation(),s(null))};t.addEventListener("pointerdown",g=>{if(g.button!==0){s(null);return}a=!0,o=g.clientX,i=g.clientY,t.setPointerCapture(g.pointerId),u(c(o,i))}),t.addEventListener("pointermove",g=>{a&&u(c(g.clientX,g.clientY))}),t.addEventListener("pointerup",g=>{if(!a)return;a=!1;let C=c(g.clientX,g.clientY);s(C.w>=8&&C.h>=8?C:null)}),t.addEventListener("pointercancel",()=>s(null)),t.addEventListener("contextmenu",g=>{g.preventDefault(),s(null)}),window.addEventListener("keydown",y,!0)})}async function kn(e,t,n=0){let r=await createImageBitmap(e),o=r.width/Math.max(document.documentElement.clientWidth,1),i=Math.round(t.x*o),a=Math.round((t.y+n)*o),s=Math.round(t.w*o),c=Math.round(t.h*o),u=document.createElement("canvas");u.width=Math.max(s,1),u.height=Math.max(c,1);let y=u.getContext("2d");return y?(y.drawImage(r,i,a,s,c,0,0,u.width,u.height),r.close?.(),await new Promise(C=>u.toBlob(C,"image/png"))??e):e}var no=["error","warn"],Ze=[],An=[],En=!1;function Ln(){return{console:[...Ze],network:[...An]}}function Ye(e,t,n){e.push(t),e.length>n&&e.shift()}function Cn(e){if(typeof e=="string")return e;if(e instanceof Error)return`${e.name}: ${e.message}`;try{return JSON.stringify(e)??String(e)}catch{return Object.prototype.toString.call(e)}}function Ct(e){return e.length>500?e.slice(0,500)+"\u2026":e}function Sn(){if(!(En||typeof window>"u")){En=!0;for(let e of no){let t=console[e];typeof t=="function"&&(console[e]=function(...n){return Ye(Ze,{level:e,text:Ct(n.map(Cn).join(" ")),at:Date.now()},50),t.apply(this,n)})}window.addEventListener("error",e=>{Ye(Ze,{level:"error",text:Ct(e.message||"uncaught error"),at:Date.now()},50)}),window.addEventListener("unhandledrejection",e=>{Ye(Ze,{level:"error",text:Ct("unhandled rejection: "+Cn(e.reason)),at:Date.now()},50)}),ro(),oo()}}function ro(){if(typeof window.fetch!="function")return;let e=window.fetch;window.fetch=async function(...t){let n=Date.now(),[r,o]=t,i=(o?.method||(r instanceof Request?r.method:"GET")).toUpperCase(),a=typeof r=="string"?r:r instanceof URL?r.href:r.url;try{let s=await e.apply(this,t);return At(i,a,s.status,Date.now()-n),s}catch(s){throw At(i,a,0,Date.now()-n),s}}}function oo(){if(typeof XMLHttpRequest>"u")return;let e=XMLHttpRequest.prototype.open,t=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(n,r,...o){return this.__fosMethod=String(n||"GET").toUpperCase(),this.__fosUrl=String(r),e.call(this,n,r,...o)},XMLHttpRequest.prototype.send=function(...n){return this.__fosAt=Date.now(),this.addEventListener("loadend",()=>{At(this.__fosMethod||"GET",this.__fosUrl||"",this.status,Date.now()-(this.__fosAt||Date.now()))}),t.apply(this,n)}}function At(e,t,n,r){(n===0||n>=400||r>2e3)&&Ye(An,{method:e,url:io(t),status:n,ms:Math.round(r)},50)}function io(e){let t=e.indexOf("?"),n=t===-1?e:e.slice(0,t);return n.length>200?n.slice(0,200)+"\u2026":n}function $e(){let e={faces:[]};if(typeof document>"u")return e;try{let n=getComputedStyle(document.body).fontFamily;n&&!/^(?:-webkit-)?(?:standard|serif|sans-serif|monospace)$/i.test(n.trim())&&(e.family=n)}catch{}let t=0;for(let n of Array.from(document.styleSheets)){let r;try{r=n.cssRules}catch{continue}for(let o of Array.from(r)){if(e.faces.length>=40||t>12e4)return e;if(!(o.constructor?.name==="CSSFontFaceRule"||o.type===5))continue;let a=ao(o.cssText,n.href);t+=a.length,e.faces.push(a)}}return e}function ao(e,t){let n=t||document.baseURI;return e.replace(/url\((['"]?)([^'")]+)\1\)/g,(r,o,i)=>{if(/^(?:data:|https?:|blob:|\/\/)/i.test(i))return r;try{return`url(${o}${new URL(i,n).href}${o})`}catch{return r}})}var Tn=`
:host {
  /* ---- palette ---- */
  --bg: #ffffff;
  --surface: #f8f9fb;
  --surface-2: #eef1f4;
  --border: #e6e9ee;
  --border-strong: #cdd3dc;
  --text: #14181f;
  --text-2: #4b5565;
  --muted: #6c7686;
  --accent: #4f46e5;
  --accent-fg: #ffffff;
  /* accent-ink is accent AS TEXT \u2014 overridden in dark, where #4f46e5 on a
     near-black panel fails contrast. Derived, so a custom accent tracks. */
  --accent-ink: var(--accent);
  --accent-soft: color-mix(in srgb, var(--accent) 9%, transparent);
  --danger: #d92d20;
  --ok: #087443;
  /* The third state colour. Review and high priority are neither a failure nor
     a success, and borrowing --danger for them was reading as "broken". */
  --warn: #b54708;
  /* issue-type colours: one hue per type, re-tuned per theme below */
  --c-bug: #d92d20;
  --c-feature: #1570ef;
  --c-question: #b54708;
  --c-discussion: #6938ef;

  /* ---- type scale ---- */
  /* px, not rem: rem resolves against the HOST document's root font size, and
     the whole point of the explicit stack below is that the widget looks the
     same on every site it is embedded in. */
  --fs-2xs: 10.5px;
  --fs-xs: 11.5px;
  --fs-sm: 12.5px;
  --fs-md: 13.5px;
  --fs-lg: 15px;
  --fs-xl: 16.5px;
  --lh-tight: 1.25;
  --lh-body: 1.55;

  /* ---- spacing rhythm (4px base) ---- */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;

  /* ---- radii ---- */
  --r-sm: 8px;
  --r-md: 10px;
  --r-lg: 16px;
  --r-full: 999px;

  /* ---- motion ---- */
  --ease: cubic-bezier(.32, .72, 0, 1);
  --t-1: .13s;
  --t-2: .26s;

  /* ---- elevation ---- */
  --shadow-1: 0 1px 2px rgba(16,24,40,.07), 0 8px 24px -8px rgba(16,24,40,.16);
  --shadow-2: 0 2px 6px rgba(16,24,40,.08), 0 24px 64px -16px rgba(16,24,40,.30);

  /* ---- fonts ---- */
  /* Explicit system stack: inheriting the host's font means the widget looks
     different on every site it is embedded in. Tabular numerals are applied
     per-element (counts, issue numbers) rather than globally. */
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI",
          Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas,
          "Liberation Mono", monospace;

  all: initial;
  font-family: var(--font);
  font-size: var(--fs-md);
  -webkit-font-smoothing: antialiased;

/* Built-in screen accents.
   Tokens rather than hex literals in index.ts, which is where they used to
   live \u2014 ten of them, invisible to the theme layer, identical in every project
   that installs the widget. A colour a project cannot change is not a default,
   it is a decision made on its behalf. Custom apps already supply their own
   via the manifest; these are the compiled-in screens, which have to declare
   theirs somewhere, so it is here where a theme can reach them. */
  /* Kept in step with src/shell/tokens.css.
     Eight of these ten differed between the panel and the windowed shell, so
     an app was amber in one and red in the other \u2014 and the two can be seen in
     the same session, because the shell falls back to the panel. An identity
     colour that changes with the renderer is not an identity. */
  --app-agents: #8b5cf6;
  --app-skills: #ec4899;
  --app-issues: #ef4444;
  --app-vault: #64748b;
  --app-sources: #f59e0b;
  --app-docs: #0ea5e9;
  --app-brain: #14b8a6;
  --app-chat: #3b82f6;
  --app-mcp: #22c55e;
  --app-terminal: #475569;
  /* Fallback for an app that declares no colour. */
  --app-default: #64748b;

}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --bg: #15171d; --surface: #1c1f27; --surface-2: #262a35;
    --border: #2b303c; --border-strong: #414957;
    --text: #edeef1; --text-2: #aab2c0; --muted: #8a93a5;
    --accent-ink: color-mix(in srgb, var(--accent) 55%, #ffffff);
    --ok: #75e0a7; --danger: #f97066; --warn: #fdb022;
    --c-bug: #f97066; --c-feature: #84adff; --c-question: #fdb022; --c-discussion: #b692f6;
    --shadow-1: 0 1px 2px rgba(0,0,0,.5), 0 8px 24px -8px rgba(0,0,0,.6);
    --shadow-2: 0 2px 6px rgba(0,0,0,.5), 0 24px 64px -16px rgba(0,0,0,.75);
  }
}
:host([data-theme="dark"]) {
  --bg: #15171d; --surface: #1c1f27; --surface-2: #262a35;
  --border: #2b303c; --border-strong: #414957;
  --text: #edeef1; --text-2: #aab2c0; --muted: #8a93a5;
  --accent-ink: color-mix(in srgb, var(--accent) 55%, #ffffff);
  --ok: #75e0a7; --danger: #f97066; --warn: #fdb022;
  --c-bug: #f97066; --c-feature: #84adff; --c-question: #fdb022; --c-discussion: #b692f6;
  --shadow-1: 0 1px 2px rgba(0,0,0,.5), 0 8px 24px -8px rgba(0,0,0,.6);
  --shadow-2: 0 2px 6px rgba(0,0,0,.5), 0 24px 64px -16px rgba(0,0,0,.75);
}

* { box-sizing: border-box; }
button { font: inherit; cursor: pointer; }
/* One focus treatment for every control. :focus-visible, not :focus \u2014 the
   ring is for keyboard users, and painting it on every click reads as a bug. */
button:focus-visible, a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---- floating action button ---- */
/* The launcher button. Compact: this sits on top of somebody's product all
   day, so it should read as a tool at the edge of the screen rather than as a
   call to action in the middle of their design. */
.fab {
  position: fixed; z-index: 2147483645;
  display: inline-flex; align-items: center; gap: 7px;
  height: 36px; padding: 0 14px; border: 0; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-fg);
  font-family: var(--font);
  font-size: var(--fs-sm); font-weight: 600; letter-spacing: .01em; line-height: 1;
  box-shadow: var(--shadow-1);
  /* accent-tinted glow; browsers without color-mix keep the neutral shadow */
  box-shadow: 0 1px 2px rgba(16,24,40,.12),
              0 6px 20px -6px color-mix(in srgb, var(--accent) 55%, transparent);
  touch-action: none;                 /* let pointer events drive the drag */
  user-select: none;
  transition: transform var(--t-1) var(--ease), box-shadow var(--t-1) var(--ease);
}
.fab:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(16,24,40,.12),
              0 10px 28px -6px color-mix(in srgb, var(--accent) 60%, transparent);
}
.fab:active { cursor: grabbing; transform: translateY(0); }
.fab:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
/* The count.
   place-items alone centred the box but not the digit: the badge inherited the
   button's line-height:1 and the glyph sat high in the circle. An explicit
   line-height and tabular figures put the number in the middle and keep it
   there when it goes from 9 to 10. */
.fab .count {
  min-width: 18px; height: 18px; padding: 0 5px;
  box-sizing: border-box;
  border-radius: var(--r-full); background: rgba(255,255,255,.25);
  font-size: var(--fs-2xs); font-weight: 700;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: center; justify-content: center;
}
.fab-ico { display: inline-flex; align-items: center; }
.fab-ico svg { width: 14px; height: 14px; }

/* ---- slide-over panel ---- */
.panel {
  position: fixed; inset-block: 0; inset-inline-end: 0; z-index: 2147483645;
  width: min(420px, 100vw);
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border-inline-start: 1px solid var(--border);
  box-shadow: var(--shadow-2);
  transform: translateX(var(--slide, 100%));
  transition: transform var(--t-2) var(--ease), width var(--t-2) var(--ease);
}
:host([dir="rtl"]) .panel { --slide: -100%; }
.panel[data-open="true"] { --slide: 0 !important; }
/* A single issue's title, body, pin and comment thread need more room to read
   and to type a reply into than the listing's scannable row of short titles. */
.panel[data-detail="true"] { width: min(640px, 100vw); }

/* Header: names the product surface, carries the close control. The route
   subline is live context \u2014 this panel only ever shows THIS page's issues. */
.head {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: 14px var(--sp-4); border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 auto; }
.brand-ico {
  flex: none; width: 32px; height: 32px; border-radius: var(--r-md);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--accent-fg);
}
.brand-ico svg { width: 16px; height: 16px; }
.brand-txt { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.head h2 {
  margin: 0; font-size: var(--fs-lg); font-weight: 650;
  letter-spacing: -.01em; line-height: var(--lh-tight);
}
.brand-sub {
  font-size: var(--fs-xs); color: var(--muted);
  font-family: var(--mono); font-variant-numeric: tabular-nums;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  direction: ltr; text-align: start;   /* a route is LTR text even in RTL UI */
}
.x {
  flex: none; width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--r-sm);
  background: transparent; color: var(--muted);
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.x:hover { background: var(--surface-2); color: var(--text); }

.body {
  padding: var(--sp-4); overflow-y: auto; flex: 1 1 auto;
  display: flex; flex-direction: column;
  scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
}
.intro {
  margin: 0 0 var(--sp-4);
  font-size: var(--fs-sm); line-height: var(--lh-body); color: var(--muted);
}

.primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; height: 38px; padding: 0 var(--sp-4);
  border: 0; border-radius: var(--r-md);
  background: var(--accent); color: var(--accent-fg);
  font-size: var(--fs-md); font-weight: 600; letter-spacing: .01em;
  transition: filter var(--t-1) var(--ease), box-shadow var(--t-1) var(--ease);
}
.primary:hover {
  filter: brightness(1.07);
  box-shadow: 0 4px 14px -4px color-mix(in srgb, var(--accent) 50%, transparent);
}
.primary:disabled { opacity: .55; cursor: default; filter: none; box-shadow: none; }

/* Sentence case, not UPPERCASE + letter-spacing.
   The uppercase micro-label is the most reliable "this is a 2016 admin theme"
   typographic tell there is, and this sheet already knew: the detail view's
   own comment calls it "a form idiom" and uses .d-sect-t instead. This is the
   rest of that migration \u2014 same weight and colour as .d-sect-t so a form
   heading and a section heading finally look like the same system. */
.label {
  margin: var(--sp-5) 0 var(--sp-2);
  font-size: var(--fs-xs); font-weight: 600; color: var(--text-2);
}

/* ---- issue rows ---- */
/* One grouped card, hairline dividers, hover per row. Uniform bordered slabs
   made every row shout at the same volume; a grouped list lets the number,
   type and title carry the hierarchy instead of the chrome. */
.rows {
  display: flex; flex-direction: column;
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--bg); overflow: hidden;
}
.rows > * + * { border-top: 1px solid var(--border); }
.row {
  display: flex; align-items: center; gap: 10px;
  min-height: 40px; padding: 9px var(--sp-3);
  border: 0; background: transparent;
  font-size: var(--fs-md); text-align: start; color: var(--text); width: 100%;
  transition: background var(--t-1) var(--ease);
}
.row:hover { background: var(--surface); }
.row:focus-visible { outline-offset: -2px; }  /* overflow:hidden clips an outer ring */
.row .num {
  flex: none; color: var(--muted); font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
}
.row .t {
  flex: 1 1 auto; min-width: 0; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row .go {
  flex: none; color: var(--border-strong);
  transition: color var(--t-1) var(--ease), transform var(--t-1) var(--ease);
}
.row:hover .go { color: var(--muted); transform: translateX(2px); }

/* Type as a coloured dot + word, not a filled chip: ten tinted pills in a
   list is decoration, one dot per row is information. */
.chip {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  font-size: var(--fs-2xs); font-weight: 650; letter-spacing: .01em;
  text-transform: capitalize; color: var(--text-2);
}
.chip::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
}
.chip.bug { color: var(--c-bug); }
.chip.feature { color: var(--c-feature); }
.chip.question { color: var(--c-question); }
.chip.discussion { color: var(--c-discussion); }
/* Status and agent keep the dot too.
   They used to be filled pills \u2014 directly under the comment above explaining
   why filled pills in a list are decoration. Two idioms for "a fact about this
   row", one of them contradicting the rule stated two lines earlier, and the
   detail view had already settled on dots (.d-dot). One language now. */
.chip.status { color: var(--text-2); }
.chip.agent { color: var(--accent); }

/* An agent holds a lease on this issue.
   A presence indicator, not a spinner. A rotating spinner promises imminent
   completion \u2014 a lease can be held for hours, so the promise is false and the
   motion is just noise in a list. This is the same treatment the detail view
   already uses (.d-pulse), and under prefers-reduced-motion it stops animating
   but stays VISIBLE: the information is "an agent is on this", which a reader
   who cannot tolerate motion still needs. */
.spin {
  flex: none; width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent);
  animation: d-pulse 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) { .spin { animation: none; opacity: .7; } }
.empty {
  font-size: var(--fs-sm); color: var(--muted); padding: var(--sp-2) 0;
}
.rows .empty { padding: var(--sp-4); text-align: center; }

/* "who is working on this" \u2014 a spinner plus the agent's name. */
.agent-tag {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  max-width: 42%; padding: 2px 8px 2px 6px; border-radius: var(--r-full);
  background: var(--surface); border: 1px solid var(--border);
}
.agent-tag .who {
  font-size: var(--fs-2xs); font-family: var(--mono);
  color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agent-tag .spin { width: 10px; height: 10px; border-width: 1.5px; flex: none; }

/* Link out to the full board from the on-this-page listing. */
.board-link {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: var(--sp-3); padding: 5px 2px;
  font-size: var(--fs-sm); font-weight: 500;
  color: var(--accent-ink); text-decoration: none;
  border-radius: var(--r-sm);
}
.board-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.board-link .ico { transition: transform var(--t-1) var(--ease); }
.board-link:hover .ico { transform: translateX(2px); }

/* ---- app launcher ---- */
/* Pushed to the bottom of the panel: page feedback is the panel's job, the
   launcher is its second function. margin-top:auto keeps it anchored there
   even when the issue list is short. */
.apps {
  margin-top: auto; padding-top: var(--sp-2);
}
.apps .label { margin-top: var(--sp-5); }
.appgrid {
  /* auto-fill, not a fixed column count: the launcher grew from four items to
     ten, and a hard count either squeezes them or strands one alone. */
  display: grid; gap: 2px;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
}
.app {
  display: flex; flex-direction: column; align-items: center; gap: 7px;
  padding: 10px 4px 8px; border: 0; border-radius: var(--r-md);
  background: transparent; color: var(--text-2);
  font-size: var(--fs-xs); font-weight: 500; line-height: 1.2; text-align: center;
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.app:hover { background: var(--surface); color: var(--text); }
/* Solid app-colour tile, white glyph \u2014 reads as a real launcher. The washed
   22%-alpha version made ten distinct surfaces look like one grey smear. The
   inset highlight is what keeps a flat colour square from looking printed. */
.app-ico {
  width: 38px; height: 38px; border-radius: 11px;
  display: inline-flex; align-items: center; justify-content: center;
  color: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 1px 2px rgba(16,24,40,.18);
  transition: transform var(--t-1) var(--ease);
}
.app:hover .app-ico { transform: translateY(-1px); }
.app-ico svg { width: 18px; height: 18px; }

/* ---- the report modal ---- */
.modal {
  position: fixed; inset: 0; z-index: 2147483646;
  display: grid; place-items: center;
  /* No backdrop fill.
     The whole point of dragging this out of the way is to keep looking at the
     page underneath \u2014 dimming it would defeat that, and a modal you can move
     is not one that should be blocking the view in the first place. */
  background: transparent;
  opacity: 0; pointer-events: none;
  transition: opacity var(--t-1) var(--ease);
}
.modal[data-open="true"] { opacity: 1; pointer-events: auto; }
.modal-card {
  /* Positioned rather than centred once dragging starts; place-items handles
     the first paint and JS takes over from there. */
  width: min(440px, calc(100vw - 24px));
  max-height: min(86vh, 720px);
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}
.modal[data-open="true"] .modal-card { animation: modal-in var(--t-2) var(--ease); }
@keyframes modal-in {
  from { opacity: 0; transform: translateY(6px) scale(.985); }
}
.modal-head {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border);
  cursor: grab; user-select: none;
  touch-action: none;                 /* pointer events drive the drag */
  flex: 0 0 auto;
}
.modal-head:active { cursor: grabbing; }
/* The form is a flex item AND a flex container.
   The card is a column with a max-height, but the scrollable body is not its
   child \u2014 the form element is, and the body sits inside that. An ordinary block
   form grows to fit its content, so the body inherited unlimited height and its
   overflow-y never had anything to overflow: the footer holding Submit was
   pushed off the bottom of the screen and could not be reached at all.
   min-height:0 is the other half \u2014 a flex child defaults to min-height:auto,
   which refuses to shrink below its content and defeats the scroll on its own.
   (No backticks in this file: the whole stylesheet is a template literal, and
   one closes it. esbuild caught that; it is the reason for this note.) */
.modal-card > .form {
  display: flex; flex-direction: column;
  flex: 1 1 auto; min-height: 0;
}
.modal-title { margin: 0; font-size: var(--fs-md); font-weight: 650; }
.modal-x {
  margin-inline-start: auto;
  flex: none; width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--r-sm);
  background: transparent; color: var(--muted);
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.modal-x:hover { color: var(--text); background: var(--surface-2); }
.modal-body {
  padding: var(--sp-4); overflow-y: auto; flex: 1 1 auto; min-height: 0;
  scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
}
.modal-body .label:first-child { margin-top: 0; }
.modal-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border); flex: 0 0 auto;
  background: var(--surface);
}
.modal-foot .primary { width: auto; }
.row2 { display: grid; gap: var(--sp-2); }
.hint { margin: var(--sp-1) 0 0; font-size: var(--fs-xs); color: var(--muted); }
/* One row per pin, each removable on its own. */
.pinrow {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: 5px var(--sp-2); border: 1px solid var(--border); border-radius: var(--r-sm);
  margin-bottom: 5px; font-size: var(--fs-xs);
}
.pinnum {
  flex: 0 0 auto; width: 16px; height: 16px; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-fg);
  font-size: 9.5px; font-weight: 700; line-height: 16px; text-align: center;
  font-variant-numeric: tabular-nums;
}
.pintxt { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pindel {
  flex: 0 0 auto; min-width: 32px; min-height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; color: var(--muted); border-radius: var(--r-sm);
}
.pindel:hover { color: var(--text); background: var(--surface-2); }

/* ---- report form ---- */
.pills { display: flex; flex-wrap: wrap; gap: 7px; }
.pill {
  min-height: 32px; padding: 6px 14px; border-radius: var(--r-full);
  font-size: var(--fs-sm); font-weight: 500;
  border: 1px solid var(--border); background: var(--bg); color: var(--text-2);
  transition: border-color var(--t-1) var(--ease), background var(--t-1) var(--ease),
              color var(--t-1) var(--ease);
}
.pill:hover { border-color: var(--border-strong); }
.pill[aria-pressed="true"] {
  border-color: var(--accent); color: var(--accent-ink); font-weight: 600;
  background: var(--accent-soft);
}

input[type="text"], textarea {
  width: 100%; min-height: 36px; padding: 8px var(--sp-3);
  font: inherit; font-size: var(--fs-md); line-height: var(--lh-body);
  color: var(--text); background: var(--bg);
  border: 1px solid var(--border); border-radius: var(--r-sm);
  transition: border-color var(--t-1) var(--ease);
}
input:hover, textarea:hover { border-color: var(--border-strong); }
input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: var(--accent); }
input:disabled { color: var(--muted); background: var(--surface); }
textarea { min-height: 96px; resize: vertical; }
::placeholder { color: var(--muted); opacity: .8; }

.btns { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.ghost {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 32px; padding: 6px var(--sp-3); font-size: var(--fs-sm); font-weight: 500;
  border: 1px solid var(--border); border-radius: var(--r-sm);
  background: transparent; color: var(--text);
  transition: border-color var(--t-1) var(--ease), background var(--t-1) var(--ease),
              color var(--t-1) var(--ease);
}
.ghost:hover { border-color: var(--border-strong); background: var(--surface); }
.ghost[aria-pressed="true"] {
  border-color: var(--accent); color: var(--accent-ink); background: var(--accent-soft);
}

.files { display: flex; flex-direction: column; gap: 5px; margin-top: var(--sp-2); }
.file {
  display: flex; align-items: center; gap: var(--sp-2);
  font-size: var(--fs-xs); color: var(--muted);
  padding: 6px var(--sp-2); background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--r-sm);
}
.file .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file button {
  flex: none; min-width: 32px; min-height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; color: var(--muted); border-radius: var(--r-sm);
}
.file button:hover { color: var(--text); background: var(--surface-2); }
.thumb { width: 32px; height: 32px; flex: none; border-radius: 5px; object-fit: cover; border: 1px solid var(--border); }

/* Confirms what got pinned, right under the button that captured it \u2014 the
   button's own label truncates the tag, this shows the accessible name too. */
.pin-preview {
  margin-top: var(--sp-2); padding: 7px 10px; font-size: var(--fs-xs); color: var(--muted);
  font-family: var(--mono);
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-sm);
  overflow-wrap: anywhere; word-break: break-word;
}

.note { font-size: var(--fs-xs); margin-top: 10px; }
.note.err { color: var(--danger); }
.note.ok { color: var(--ok); }

/* Bridge-mode context disclosure (framedHost). Flex + logical gap, so the
   checkbox row reads correctly in RTL without direction-specific rules. */
.ctxrow { margin-top: 10px; }
.ctx-opt {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
  font-size: var(--fs-xs); color: var(--muted); cursor: pointer;
}
.ctx-opt input { accent-color: var(--accent); margin: 0; }
.hidden { display: none !important; }

/* ---- in-panel issue detail ----
   The same object as the dashboard's issue page, in a column a third of the
   width. Matched: plain title, quiet labelled properties, state as a dot, one
   activity stream at two weights, hairline borders and fills a few percent
   apart. Adapted: the 264px properties rail lies DOWN under the title and
   wraps into as many columns as the panel is wide, because beside the content
   it would leave nothing readable to sit next to. */

/* Three bands: a fixed top bar, a scrolling document, a pinned composer. The
   panel body stops padding and stops scrolling in detail mode so the bar and
   the composer can reach the panel's own edges \u2014 a sticky footer inset by the
   body's 16px leaves content sliding through the gap beneath it. */
.panel[data-detail="true"] .body { padding: 0; overflow: hidden; }
/* The panel's standing intro ("Found a bug\u2026?") belongs to the report flow. It
   was left showing above the detail view, where it reads as a caption on
   somebody else's issue \u2014 and with the body's padding gone it went full-bleed
   and looked broken. */
.panel[data-detail="true"] .intro { display: none; }
.detail { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }

.d-nav {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: 9px var(--sp-3) 9px 10px;
  border-bottom: 1px solid var(--border); flex: 0 0 auto;
}
.d-back {
  display: inline-flex; align-items: center; gap: 5px;
  min-height: 28px; padding: 4px 8px; border: 0; border-radius: var(--r-sm);
  background: transparent; color: var(--muted);
  font-size: var(--fs-xs); font-weight: 500;
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.d-back:hover { background: var(--surface-2); color: var(--text); }
.d-num {
  font-size: var(--fs-xs); font-weight: 600; color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.d-iconbtn {
  flex: none; width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--r-sm); background: transparent; color: var(--muted);
  transition: background var(--t-1) var(--ease), color var(--t-1) var(--ease);
}
.d-iconbtn:hover { background: var(--surface-2); color: var(--text); }
.d-open { margin-inline-start: auto; }

/* The document. One scroll context \u2014 the nav and the composer sit outside it. */
.d-main {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  padding: var(--sp-4);
  scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
}

/* Large and plain: no box, no chip beside it, nothing competing. */
.d-title {
  margin: 0; font-size: var(--fs-xl); font-weight: 650;
  letter-spacing: -.015em; line-height: 1.3;
  overflow-wrap: anywhere;
}
.d-sub {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  margin: 6px 0 0; font-size: var(--fs-xs); color: var(--muted);
}
.d-sep { color: var(--border-strong); }
.d-live { display: inline-flex; align-items: center; gap: 5px; }
.d-pulse {
  width: 6px; height: 6px; border-radius: 50%;
  background: color-mix(in srgb, var(--text) 70%, transparent);
  animation: d-pulse 1.6s ease-in-out infinite;
}
@keyframes d-pulse { 50% { opacity: .35; } }

/* ---- properties ----
   auto-fit, not a fixed count: two columns at the panel's full 640px, one on
   a phone, without a media query that would have to know the panel's width. */
.d-props {
  display: grid; gap: 1px var(--sp-4);
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  margin-top: var(--sp-4);
}
.d-prop { display: flex; align-items: baseline; gap: var(--sp-2); min-height: 24px; }
/* A fixed key column so the values line up into a column of their own \u2014 the
   block reads as a table of facts, never as a form. */
.d-prop-k {
  flex: 0 0 auto; width: 84px;
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--fs-xs); color: var(--muted);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.d-prop-k .ico { flex: none; color: var(--muted); }
.d-prop-v {
  flex: 1 1 auto; min-width: 0;
  font-size: var(--fs-xs); color: var(--text);
  overflow-wrap: anywhere; word-break: break-word;
}
.d-prop-v.muted { color: var(--muted); }
.d-prop-v .mono { font-family: var(--mono); font-size: var(--fs-2xs); }

/* State is a dot. Never a coloured word \u2014 that is the one rule every
   reference shares, and a row of tinted pills is decoration, not information.
   Both scales are the issue page's, so the same state is the same colour on
   both surfaces. */
.d-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.d-dot[data-status="triage"]      { background: color-mix(in srgb, var(--muted) 60%, transparent); }
.d-dot[data-status="ready"]       { background: color-mix(in srgb, var(--accent) 70%, transparent); }
.d-dot[data-status="in_progress"] { background: var(--accent); }
.d-dot[data-status="blocked"]     { background: var(--danger); }
.d-dot[data-status="in_review"]   { background: var(--warn); }
.d-dot[data-status="done"]        { background: var(--ok); }
.d-dot[data-status="rejected"]    { background: color-mix(in srgb, var(--muted) 40%, transparent); }
.d-dot[data-priority="low"]      { background: color-mix(in srgb, var(--muted) 40%, transparent); }
.d-dot[data-priority="normal"]   { background: color-mix(in srgb, var(--muted) 70%, transparent); }
.d-dot[data-priority="high"]     { background: var(--warn); }
.d-dot[data-priority="critical"] { background: var(--danger); }

/* ---- description ---- */
.d-body {
  margin-top: var(--sp-4);
  font-size: var(--fs-sm); line-height: var(--lh-body); color: var(--text);
}
.d-empty { margin: 0; font-size: var(--fs-sm); color: var(--muted); }

/* ---- section headers ----
   Sentence case and quiet, with the count trailing and muted \u2014 the reference's
   header. .label now matches it. */
.d-sect {
  display: flex; align-items: center; gap: 6px;
  margin: var(--sp-5) 0 var(--sp-2);
  padding-top: var(--sp-4); border-top: 1px solid var(--border);
}
.d-sect-t { margin: 0; font-size: var(--fs-xs); font-weight: 600; color: var(--text-2); }
.d-sect-n { font-size: var(--fs-xs); color: var(--muted); font-variant-numeric: tabular-nums; }

/* ---- captured objects (the pins) ----
   A tile, a name, and the one fact that says whether it can be found again.
   Deliberately an object rather than a link: it is a thing the report carries. */
.d-objs { display: flex; flex-direction: column; gap: 6px; }
.d-obj {
  display: flex; align-items: center; gap: 10px;
  padding: 8px; border: 1px solid var(--border); border-radius: var(--r-sm);
}
.d-obj-ico {
  flex: none; width: 32px; height: 32px; border-radius: var(--r-sm);
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); background: var(--surface); color: var(--muted);
}
/* min-width:0 lets the flex item shrink below its content width \u2014 without it
   a long accessible name (the pinned node's whole text) forces the panel wider
   and the WHOLE slide-over scrolls sideways. */
.d-obj-txt { flex: 1 1 auto; min-width: 0; }
.d-obj-nm {
  margin: 0; font-size: var(--fs-sm); font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-obj-meta {
  margin: 1px 0 0; font-size: var(--fs-2xs); color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-obj-meta .mono { font-family: var(--mono); }

/* ---- activity: one stream, two weights ---- */
.d-thread { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.d-item { position: relative; display: flex; gap: 10px; padding-bottom: var(--sp-4); }
.d-evt { align-items: center; }
.d-item:last-child { padding-bottom: 0; }
/* The faint thread. Inline-start so it runs down the avatars in both
   directions, and behind them \u2014 the avatar's own fill is what breaks it. */
.d-line {
  position: absolute; inset-block: 0; inset-inline-start: 11px;
  width: 1px; background: var(--border);
}
.d-item:last-child .d-line { block-size: 12px; }
.d-avatar {
  position: relative; z-index: 1; flex: none;
  width: 23px; height: 23px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); background: var(--bg); color: var(--muted);
  font-size: var(--fs-2xs); font-weight: 600;
}
/* An event is a fact: a knot on the thread, not a face. The wrapper stays
   transparent and the DOT carries the ring that breaks the line \u2014 a 23px
   filled circle erased almost the whole segment and left the thread reading
   as a dashed rule rather than one continuous line. */
.d-knot {
  position: relative; z-index: 1; flex: none;
  width: 23px; height: 23px;
  display: inline-flex; align-items: center; justify-content: center;
}
.d-knot span {
  width: 5px; height: 5px; border-radius: 50%;
  background: color-mix(in srgb, var(--muted) 55%, transparent);
  box-shadow: 0 0 0 3px var(--bg);
}

/* A comment carries reasoning, so it keeps card weight. */
.d-card {
  flex: 1 1 auto; min-width: 0;
  border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--bg);
}
.d-card-h {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px;
  margin: 0; padding: 6px 10px; border-bottom: 1px solid var(--border);
  font-size: var(--fs-2xs); color: var(--muted);
}
.d-card-h .d-who { font-weight: 600; color: var(--text); }
.d-badge {
  padding: 1px 6px; border-radius: var(--r-full);
  border: 1px solid var(--border); background: var(--surface);
  font-size: var(--fs-2xs); font-weight: 600; color: var(--text-2);
}
.d-card-b {
  padding: 8px 10px; font-size: var(--fs-sm); line-height: var(--lh-body);
  overflow-wrap: anywhere;
}

/* An event is one quiet line. */
.d-evt-t {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  margin: 0; font-size: var(--fs-xs); color: var(--muted);
}
.d-evt-w { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.d-evt-t .d-who { color: var(--text-2); }
.d-evt-at { flex: none; }

/* ---- composer ----
   Pinned, so answering never means finding the end of the thread first. */
.d-composer {
  flex: 0 0 auto; padding: 10px var(--sp-4) var(--sp-3);
  border-top: 1px solid var(--border); background: var(--bg);
}
.d-draft { min-height: 60px; font-size: var(--fs-sm); }
.d-composer-act { display: flex; justify-content: flex-end; margin-top: var(--sp-2); }
.d-send { width: auto; height: 32px; padding: 0 var(--sp-3); font-size: var(--fs-sm); }
.d-composer .note { margin: 0 0 var(--sp-2); }

/* ---- rendered markdown (see markdown.ts) ----
   These style elements INSIDE the shadow root, so they must live in CSS \u2014
   appended to HOST_CSS they would be injected into the host document, where
   none of these selectors exist. */
.md-p { margin: 0 0 var(--sp-2); line-height: var(--lh-body); }
.md-p:last-child { margin-bottom: 0; }
.md-h { margin: var(--sp-3) 0 6px; font-size: var(--fs-md); font-weight: 600; line-height: 1.35; color: var(--text); }
.md-h:first-child { margin-top: 0; }
.md-list { margin: 0 0 var(--sp-2); padding-inline-start: 20px; }
.md-list li { margin: 2px 0; line-height: 1.5; }
.md-list:last-child { margin-bottom: 0; }
.md-code {
  font-family: var(--mono); font-size: var(--fs-xs);
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 4px;
}
.md-pre {
  margin: 0 0 var(--sp-2); padding: 9px var(--sp-3); overflow-x: auto;
  border-radius: var(--r-sm); background: var(--bg); border: 1px solid var(--border);
}
.md-pre:last-child { margin-bottom: 0; }
.md-pre code {
  font-family: var(--mono);
  font-size: var(--fs-xs); line-height: 1.5; white-space: pre;
  background: none; border: 0; padding: 0;
}
.md-quote {
  margin: 0 0 var(--sp-2); padding: 2px 0; padding-inline-start: 10px; color: var(--muted);
  border-inline-start: 2px solid var(--border);
}
.md-quote .md-p:last-child { margin-bottom: 0; }
.md-strong { font-weight: 600; }
.md-em { font-style: italic; }
.md-del { opacity: .65; }
.md-a { color: var(--accent-ink); text-decoration: underline; text-underline-offset: 2px; }
.d-body hr, .d-card-b hr { margin: 10px 0; border: 0; border-top: 1px solid var(--border); }

/* ---- markdown tables ----
   Agents write these on every run and the panel used to print the pipes. Two
   shapes, decided in markdown.ts: a headerless two-column table is a list of
   labelled facts and renders as one, which survives a 640px column; anything
   else is a real table and scrolls sideways inside its own box rather than
   widening the panel. */
.md-kv {
  display: grid; grid-template-columns: minmax(0, 96px) minmax(0, 1fr);
  gap: 3px var(--sp-3);
  margin: 0 0 var(--sp-2); padding: 9px 10px;
  border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface);
  font-size: var(--fs-xs);
}
.md-kv:last-child { margin-bottom: 0; }
.md-kv dt { color: var(--muted); overflow-wrap: anywhere; }
.md-kv dd { margin: 0; color: var(--text); overflow-wrap: anywhere; }
.md-tablewrap {
  margin: 0 0 var(--sp-2); overflow-x: auto;
  border: 1px solid var(--border); border-radius: var(--r-sm);
  scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
}
.md-tablewrap:last-child { margin-bottom: 0; }
.md-table { border-collapse: collapse; width: 100%; font-size: var(--fs-xs); }
.md-table th, .md-table td {
  padding: 6px 10px; text-align: start; vertical-align: top;
  border-bottom: 1px solid var(--border); overflow-wrap: anywhere;
}
.md-table thead th { background: var(--surface); font-weight: 600; color: var(--text-2); white-space: nowrap; }
.md-table tbody tr:last-child td { border-bottom: 0; }
/* A code span is machine text sitting inside prose that may run the other way;
   isolating it stops a branch name from reordering the sentence around it. */
.md-code { unicode-bidi: isolate; }

/* Inline SVG icons (see icons.ts). Sized in em so they track the label they
   sit beside, and flex:none so a long label never squashes them. */
.ico { flex: none; width: 1em; height: 1em; }
button .ico, a .ico { margin-inline-end: 2px; vertical-align: -0.125em; }
.pin-btn, .addfile, .shot, .clear-pin {
  display: inline-flex; align-items: center; gap: 6px;
}
/* Directional glyphs flip with the layout; translate direction flips with the
   scaleX so the hover nudge still points "forward". */
:host([dir="rtl"]) .board-link .ico,
:host([dir="rtl"]) .d-back .ico,
:host([dir="rtl"]) .d-send .ico,
:host([dir="rtl"]) .row .go { transform: scaleX(-1); }
:host([dir="rtl"]) .board-link:hover .ico { transform: scaleX(-1) translateX(2px); }
:host([dir="rtl"]) .row:hover .go { transform: scaleX(-1) translateX(2px); }

@media (prefers-reduced-motion: reduce) {
  .panel, .modal, .fab, .primary, .app, .app-ico, .row, .row .go,
  .board-link .ico, .pill, .ghost, .x, .modal-x { transition: none; }
  .modal[data-open="true"] .modal-card { animation: none; }
  .fab:hover, .app:hover .app-ico, .row:hover .go { transform: none; }
  .spin { animation: none; border-top-color: var(--border); }
  .d-back, .d-iconbtn { transition: none; }
  /* The pulse is the only signal that an agent is live, so it stays visible \u2014
     it stops moving rather than disappearing. */
  .d-pulse { animation: none; opacity: .7; }
}
`,Ke=`
.builder-pin-hover {
  outline: 2px solid #4f46e5 !important;
  outline-offset: 2px !important;
  cursor: crosshair !important;
}
.builder-pin-armed, .builder-pin-armed * { cursor: crosshair !important; }
.builder-pin-found {
  outline: 2px solid #4f46e5 !important;
  outline-offset: 2px !important;
  animation: builder-pin-flash 1.4s ease-out 2;
}
@keyframes builder-pin-flash {
  0%, 100% { outline-color: #4f46e5; }
  50% { outline-color: transparent; }
}

`;var Rn="fos-pin-marks",Je=[],He=0;function Pn(e){if(Qe(),!e.length||typeof document>"u")return;let t=document.createElement("div");if(t.id=Rn,t.setAttribute("data-builder-hide",""),t.style.cssText="position:absolute;inset:0;pointer-events:none;z-index:2147482500;",document.body.appendChild(t),e.forEach((r,o)=>{let i=je(r);if(!i.el||i.confidence<Ue)return;let a=document.createElement("div");a.style.cssText=["position:absolute","border:2px solid #6366f1","border-radius:6px","background:rgba(99,102,241,0.10)","box-shadow:0 0 0 1px rgba(255,255,255,0.35)","pointer-events:none","transition:opacity .15s"].join(";");let s=document.createElement("span");s.textContent=String(o+1),s.style.cssText=["position:absolute","top:-9px","inset-inline-start:-9px","min-width:18px","height:18px","display:grid","place-items:center","padding:0 5px","border-radius:9px","background:#6366f1","color:#fff","font:600 11px/1 system-ui,sans-serif"].join(";"),a.appendChild(s),t.appendChild(a),Je.push({anchor:r,el:i.el,box:a})}),!Je.length){Qe();return}Mn();let n=()=>{Mn(),He=requestAnimationFrame(n)};He=requestAnimationFrame(n)}function Qe(){He&&cancelAnimationFrame(He),He=0,Je=[],document.getElementById(Rn)?.remove()}function Mn(){let e=window.scrollX,t=window.scrollY;for(let n of Je){let r=n.el.getBoundingClientRect(),o=r.width===0&&r.height===0;n.box.style.opacity=o?"0":"1",!o&&(n.box.style.transform=`translate(${r.left+e}px, ${r.top+t}px)`,n.box.style.width=`${r.width}px`,n.box.style.height=`${r.height}px`)}}var $n="fos:hittest";function Hn(){try{let t=sessionStorage.getItem($n);if(t){let[n,r]=t.split("\0");if(n===navigator.userAgent&&(r==="pass"||r==="fail"))return r}}catch{}let e=so();try{sessionStorage.setItem($n,`${navigator.userAgent}\0${e}`)}catch{}return e}function so(){if(typeof document>"u")return"fail";let e=document.createElement("div"),t=document.createElement("iframe"),n="position:fixed;left:0;top:0;width:100px;height:100px;margin:0;border:0;opacity:0;";e.style.cssText=n+"background:#000;z-index:2147482000;",t.style.cssText=n+"z-index:2147483000;",t.style.clipPath='path("M50 0 H100 V100 H50 Z")',document.body.appendChild(e),document.body.appendChild(t);try{t.getBoundingClientRect();let r=document.elementFromPoint(75,50),o=document.elementFromPoint(25,50);return!r||!o?"fail":r===t&&o!==t?"pass":"fail"}catch{return"fail"}finally{e.remove(),t.remove()}}var et=class{constructor(t){this.opts=t;j(this,"lastBeat",Date.now());j(this,"capturingSince",null);j(this,"releases",0);j(this,"timer",null);j(this,"dead",!1);j(this,"bound",[])}start(){this.lastBeat=Date.now();let t=n=>()=>{this.capturingSince!==null&&this.release(n)};this.on(window,"pointerup",t("pointerup")),this.on(window,"pointercancel",t("pointercancel")),this.on(window,"blur",t("blur")),this.on(document,"visibilitychange",()=>{document.hidden&&this.release("tab hidden")}),this.on(window,"keydown",n=>{n.key==="Escape"&&this.release("escape")}),this.timer=window.setInterval(()=>this.tick(),250)}beat(){this.lastBeat=Date.now()}captureAll(){this.dead||(this.capturingSince=Date.now())}captureEnded(){this.capturingSince=null}stop(){this.timer!==null&&window.clearInterval(this.timer),this.timer=null;for(let[t,n,r,o]of this.bound)t.removeEventListener(n,r,o);this.bound.length=0}on(t,n,r){t.addEventListener(n,r,!0),this.bound.push([t,n,r,!0])}release(t){this.capturingSince!==null&&(this.capturingSince=null,this.releases+=1,this.opts.onRelease(t),this.releases>=3&&(this.dead=!0,this.stop(),this.opts.onFallback(`released ${this.releases} times`)))}tick(){if(this.dead)return;let t=Date.now()-this.lastBeat;if(this.capturingSince!==null&&Date.now()-this.capturingSince>1500){this.release("capture exceeded its cap");return}if(t>4e3){this.dead=!0,this.stop(),this.opts.onTeardown(`no heartbeat for ${t}ms`);return}t>1500&&this.capturingSince!==null&&this.release(`no heartbeat for ${t}ms`)}};var Lt="fos-host-css",tt=class{constructor(t){this.opts=t;j(this,"el",null);j(this,"watchdog",null);j(this,"themeObserver",null);j(this,"booted",!1);j(this,"lastRects",[]);j(this,"onMessage",null);j(this,"loadTimer",null)}mount(){if(Hn()!=="pass")return this.opts.onFallback("clip-path does not exclude regions from hit-testing"),!1;if(Sn(),!document.getElementById(Lt)){let n=document.createElement("style");n.id=Lt,n.setAttribute("data-builder-hide",""),n.textContent=Ke,document.head.appendChild(n)}let t=document.createElement("iframe");return t.setAttribute("data-builder-sdk",""),t.setAttribute("title","FeedbackOS"),t.setAttribute("tabindex","-1"),t.inert=!0,t.style.cssText=["position:fixed","inset:0","width:100%","height:100%","border:0","background:transparent","color-scheme:normal",`z-index:${this.opts.zIndex??2147483e3}`,"pointer-events:none"].join(";"),t.style.clipPath=oe,t.src="about:blank",document.body.appendChild(t),this.el=t,this.watchdog=new et({onRelease:()=>this.setRects(this.lastRects),onTeardown:n=>this.teardown(n),onFallback:n=>{this.teardown(n),this.opts.onFallback(n)}}),this.watchdog.start(),this.onMessage=n=>this.handle(n),window.addEventListener("message",this.onMessage),this.loadTimer=window.setTimeout(()=>{this.teardown("shell did not load within 3s"),this.opts.onFallback("frame blocked or unreachable (CSP frame-src?)")},3e3),t.src=this.opts.src,document.fonts?.ready.then(()=>this.syncHost()).catch(()=>{}),this.themeObserver=new MutationObserver(()=>this.syncHost()),this.themeObserver.observe(document.documentElement,{attributes:!0,attributeFilter:["class","data-theme","lang","dir"]}),!0}setHostApps(t){this.opts.boot.hostApps=t,!(!this.booted||!this.el)&&this.el.contentWindow?.postMessage({t:"fos:boot",boot:this.opts.boot},this.opts.origin)}syncHost(){if(!this.booted||!this.el)return;let t=nt(),n=rt(this.opts.boot.locale),r=$e(),o=this.opts.boot.fonts,i=o?.family!==r.family||(o?.faces?.length??0)!==r.faces.length;this.opts.boot.dark===t&&this.opts.boot.locale===n&&!i||(this.opts.boot.dark=t,this.opts.boot.locale=n,this.opts.boot.fonts=r,this.el.contentWindow?.postMessage({t:"fos:boot",boot:this.opts.boot},this.opts.origin))}handle(t){if(!this.el||t.source!==this.el.contentWindow||t.origin!==this.opts.origin)return;let n=t.data;switch(n?.t){case"fos:ready":this.loadTimer!==null&&window.clearTimeout(this.loadTimer),this.loadTimer=null,this.opts.boot.dark=nt(),this.opts.boot.locale=rt(this.opts.boot.locale),this.opts.boot.fonts=$e(),this.booted=!0,this.el.contentWindow?.postMessage({t:"fos:boot",boot:this.opts.boot},this.opts.origin);break;case"fos:capture":this.capture(n);break;case"fos:context":this.el.contentWindow?.postMessage({t:"fos:context:result",id:n.id,...Ln()},this.opts.origin);break;case"fos:pins":Pn(n.pins??[]);break;case"fos:dockwidth":this.setDockWidth(Number(n.width)||0);break;case"fos:heartbeat":this.watchdog?.beat();break;case"fos:regions":this.watchdog?.beat(),n.capture?(this.watchdog?.captureAll(),this.el.style.clipPath="none"):(this.watchdog?.captureEnded(),this.setRects(n.rects??[]));break}}async capture(t){let n=r=>this.el?.contentWindow?.postMessage({t:"fos:capture:result",id:t.id,...r},this.opts.origin);try{if(t.kind==="region"){let r=this.el,o=r?.style.clipPath??oe,i=r?.style.pointerEvents??"none";r&&(r.style.pointerEvents="none",r.style.clipPath=oe);let a=null;try{a=await wn()}finally{r&&(r.style.clipPath=o,r.style.pointerEvents=i)}if(!a){n({cancelled:!0});return}let s=window.scrollY,c=r?.style.visibility??"";r&&(r.style.visibility="hidden");try{let u=await de(),y=await kn(u.blob,a,s);n({attachment:{...u,blob:y,size:y.size,name:u.name.replace(/\.png$/,`-${Math.round(a.w)}x${Math.round(a.h)}.png`)}})}finally{r&&(r.style.visibility=c)}return}if(t.kind==="screenshot"){let r=this.el,o=r?.style.visibility??"";r&&(r.style.visibility="hidden");try{n({attachment:await de()})}finally{r&&(r.style.visibility=o)}return}if(t.kind==="pin"){let r=this.el,o=()=>{r&&(r.style.pointerEvents=this.lastRects.length?"auto":"none",r.style.clipPath=this.lastRects.length?ft(this.lastRects):oe)};r&&(r.style.pointerEvents="none",r.style.clipPath=oe),ke(i=>{o(),n({anchor:i})},()=>{o(),n({cancelled:!0})});return}n({error:`unknown capture kind: ${String(t.kind)}`})}catch(r){n({error:lo(r)})}}setDockWidth(t){let n=document.documentElement;t>0?n.style.setProperty("--fos-dock-w",`${t}px`):n.style.removeProperty("--fos-dock-w")}toggleDock(t){!this.booted||!this.el||this.el.contentWindow?.postMessage({t:"fos:dock",...typeof t=="boolean"?{open:t}:{}},this.opts.origin)}setRects(t){if(!this.el)return;let n=t.length>0;this.el.style.pointerEvents=n?"auto":"none",this.el.setAttribute("tabindex",n?"0":"-1"),this.el.inert=!n,!Yt(t,this.lastRects)&&(this.lastRects=t,this.el.style.clipPath=n?ft(t):oe)}teardown(t){Qe(),document.getElementById(Lt)?.remove(),this.setDockWidth(0),this.themeObserver?.disconnect(),this.themeObserver=null,this.loadTimer!==null&&window.clearTimeout(this.loadTimer),this.watchdog?.stop(),this.onMessage&&window.removeEventListener("message",this.onMessage),this.el&&(this.el.style.pointerEvents="none",this.el.style.clipPath=oe,this.el.remove()),this.el=null}};function nt(){if(typeof document>"u")return!1;let e=document.documentElement,t=(e.getAttribute("data-theme")||"").toLowerCase();return t==="dark"?!0:t==="light"?!1:e.classList.contains("dark")?!0:e.classList.contains("light")?!1:typeof matchMedia=="function"&&matchMedia("(prefers-color-scheme: dark)").matches}function lo(e){if(e instanceof Error)return e.message;if(typeof Event<"u"&&e instanceof Event){let t=e.target,n=t?.src?` (${t.src})`:"";return`failed to load ${t?.tagName?.toLowerCase()||"a resource"}${n}`}return String(e)}function rt(e){if(typeof document>"u")return e||"en";let t=(document.documentElement.getAttribute("lang")||"").toLowerCase();return t.startsWith("ar")?"ar":t.startsWith("en")?"en":e||"en"}var L={hello:"builder:hello",ready:"builder:ready",url:"builder:url",pinStart:"builder:pin:start",pinDone:"builder:pin:done",pinCancel:"builder:pin:cancel",shot:"builder:shot",shotDone:"builder:shot:done",context:"builder:context",contextDone:"builder:context:done"},co=200,In=100,po=1e3,uo=512;function Dn(e={}){if(window.parent===window)return()=>{};let t=e.locale??"en",n=null,r=null,o=!1,i=null,a=[],s=[],c=[];function u(v){if(n)try{n.win.postMessage(v,n.origin)}catch{}}function y(){u({v:1,type:L.ready,url:location.href,title:document.title})}function g(){u({v:1,type:L.url,url:location.href,title:document.title})}function C(){i===null&&(i=window.setTimeout(()=>{i=null,g()},0))}function H(){let v=ho(a,s,t);u({v:1,type:L.contextDone,...v})}function R(){S(),r=ke((v,M)=>{r=null,M.classList.add("builder-pin-found"),setTimeout(()=>M.classList.remove("builder-pin-found"),3e3),u({v:1,type:L.pinDone,anchor:v}),H()},()=>{r=null,u({v:1,type:L.pinDone,anchor:null})})}function S(){r&&(r(),r=null)}async function K(){if(!o){o=!0;try{let v=await de(),M=await Ao(v.blob);u({v:1,type:L.shotDone,dataUrl:M}),H()}catch(v){u({v:1,type:L.shotDone,dataUrl:null,error:Tt(String(v?.message||v)).slice(0,300)})}finally{o=!1}}}function pe(){if(c.push(fo(v=>St(a,co,v)),bo(v=>St(s,In,v)),vo(v=>St(s,In,v)),xo(C)),document.readyState!=="complete"){let v=()=>g();window.addEventListener("load",v,{once:!0}),c.push(()=>window.removeEventListener("load",v))}try{e.onActivate?.(n.origin)}catch{}}function W(v){let M=v.data;if(!(!M||M.v!==1||typeof M.type!="string")){if(!n){if(M.type!==L.hello||window.parent===window||v.source!==window.parent||!v.origin||v.origin==="null"||M.shellOrigin!==v.origin||e.shellOrigins&&!e.shellOrigins.includes(v.origin))return;n={win:window.parent,origin:v.origin},pe(),y();return}if(!(v.source!==n.win||v.origin!==n.origin))switch(M.type){case L.hello:y();return;case L.pinStart:R();return;case L.pinCancel:S();return;case L.shot:K();return;case L.context:H();return}}}window.addEventListener("message",W);let B=()=>C();return window.addEventListener("popstate",B),window.addEventListener("hashchange",B),()=>{window.removeEventListener("message",W),window.removeEventListener("popstate",B),window.removeEventListener("hashchange",B),i!==null&&(clearTimeout(i),i=null),S();for(let v of c.splice(0))try{v()}catch{}n=null}}function ho(e,t,n){return{console:e.slice(),network:t.slice(),viewport:{w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio||1},userAgent:navigator.userAgent,locale:n,url:location.href,title:document.title}}function St(e,t,n){e.push(n),e.length>t&&e.shift()}var mo=["log","info","warn","error","debug"];function fo(e){let t=new Map;for(let n of mo){let r=console[n];typeof r=="function"&&(t.set(n,r),console[n]=function(...o){try{e({level:n,text:go(o),ts:Date.now()})}catch{}r.apply(console,o)})}return()=>{for(let[n,r]of t)console[n]=r}}function go(e){let t=e.map(n=>{if(typeof n=="string")return n;if(n instanceof Error)return n.stack||`${n.name}: ${n.message}`;try{return JSON.stringify(n)??String(n)}catch{return String(n)}});return Tt(t.join(" ").slice(0,po))}function bo(e){let t=window.fetch;return typeof t!="function"?()=>{}:(window.fetch=function(n,r){let o=Date.now(),i="GET",a="";try{typeof n=="string"?a=n:n instanceof URL?a=n.href:n&&(a=n.url,i=n.method||"GET"),r&&r.method&&(i=r.method)}catch{}let s=(u,y)=>{try{e({method:i.toUpperCase(),url:On(a),status:u,ok:y,durationMs:Date.now()-o,ts:o})}catch{}},c=t.call(window,n,r);return c.then(u=>s(u.status,u.ok),()=>s(0,!1)),c},()=>{window.fetch=t})}function vo(e){let t=XMLHttpRequest.prototype,n=t.open,r=t.send,o=new WeakMap;return t.open=function(i,a){try{o.set(this,{method:String(i||"GET").toUpperCase(),url:String(a),started:0})}catch{}return n.apply(this,arguments)},t.send=function(i){let a=o.get(this);if(a){a.started=Date.now();let s=()=>{this.removeEventListener("loadend",s);try{e({method:a.method,url:On(a.url),status:this.status,ok:this.status>=200&&this.status<400,durationMs:Date.now()-a.started,ts:a.started})}catch{}};try{this.addEventListener("loadend",s)}catch{}}return r.call(this,i)},()=>{t.open=n,t.send=r}}function On(e){let t=e;try{t=new URL(e,location.href).href}catch{}return Tt(t).slice(0,uo)}function xo(e){let t=history.pushState,n=history.replaceState;return history.pushState=function(...r){t.apply(this,r),e()},history.replaceState=function(...r){n.apply(this,r),e()},()=>{history.pushState=t,history.replaceState=n}}var ot="[redacted]",yo=/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/@\s]+):[^@\s]*@/g,wo=/\b(password|passwd|pwd|secret|token|api[_-]?key|auth|authorization|access[_-]?key|private[_-]?key|sslpassword)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&"']+)/gi,ko=/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g,Eo=/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,Co=/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;function Tt(e){return e&&(e=e.replace(Co,"[redacted private key]"),e=e.replace(yo,"$1:"+ot+"@"),e=e.replace(wo,"$1$2"+ot),e=e.replace(ko,ot),e=e.replace(Eo,ot),e)}function Ao(e){return new Promise((t,n)=>{let r=new FileReader;r.onload=()=>t(String(r.result)),r.onerror=()=>n(new Error("could not encode the screenshot")),r.readAsDataURL(e)})}var Lo=e=>{let t=Date.now()-new Date(e).getTime();if(!e||!Number.isFinite(t))return"\u2014";let n=Math.round(t/6e4);if(n<1)return"just now";if(n<60)return`${n}m ago`;let r=Math.round(n/60);return r<48?`${r}h ago`:`${Math.round(r/24)}d ago`},So=e=>{let t=Date.now()-new Date(e).getTime();if(!e||!Number.isFinite(t))return"\u2014";let n=Math.round(t/6e4);if(n<1)return"\u0627\u0644\u0622\u0646";if(n<60)return`\u0642\u0628\u0644 ${n}\u062F`;let r=Math.round(n/60);return r<48?`\u0642\u0628\u0644 ${r}\u0633`:`\u0642\u0628\u0644 ${Math.round(r/24)}\u064A`},To={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",cancel:"Cancel",markdownHint:"Markdown supported \u2014 **bold**, `code`, lists.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinAnother:"Pin another",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",ctxAttached:(e,t,n)=>`Console and network activity from ${e} will be attached (${t} console line${t===1?"":"s"}, ${n} request${n===1?"":"s"}).`,ctxOptOut:"Send without console & network activity",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",apps:"Build",appAgents:"Agents",appSkills:"Skills",appIssues:"Issues",appVault:"Vault",appMcp:"MCP",appSources:"Sources",appDocs:"Library",appBrain:"Brain",appChat:"Chat",appTerminal:"Terminal",back:"Back",openFull:"Open the full issue",opened:e=>`Opened ${e}`,ago:Lo,properties:"Properties",statusLabel:"Status",priorityLabel:"Priority",assigneeLabel:"Assignee",areaLabel:"Area",branchLabel:"Branch",attemptsLabel:"Attempts",routeLabel:"Route",notSet:"Not set",assigneeAnyArea:"Any area",assigneeHuman:"Human only",working:"An agent is working on it",statuses:{triage:"Triage",ready:"To do",in_progress:"In progress",blocked:"Blocked",in_review:"Review",done:"Done",rejected:"Rejected"},priorities:{low:"Low",normal:"Normal",high:"High",critical:"Critical"},enhancement:"Enhancement",chore:"Chore",pinnedHeading:"Pinned element",pinShow:"Show it on the page",pinNoStrategy:"No selector was captured, so this pin cannot be re-found.",pinFound:(e,t)=>`Found via ${e} (${t}%)`,pinLost:"The pinned element is not on this page any more.",activityHeading:"Activity",emptyThread:"Comments and agent activity land here as the work moves.",agentBadge:"Agent",commentPlaceholder:"Leave a comment\u2026",commentCta:"Comment",posting:"Posting\u2026",noDescription:"No description.",actions:{created:"filed it",moved:"moved it",assigned:"assigned it",commented:"commented",edited:"edited it",linked:"linked something",unlinked:"unlinked something",attached:"attached a file",pinned:"pinned an element",claimed:"claimed it",released:"released it",blocked:"blocked it",unblocked:"unblocked it",approved:"approved it",rejected:"rejected it",pushed:"pushed",pr_opened:"opened a pull request",reviewed:"reviewed it",parked:"parked it"},actors:{human:"Someone",agent:"An agent",system:"The system",anon:"A visitor"},dir:"ltr"},Mo={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",cancel:"\u0625\u0644\u063A\u0627\u0621",markdownHint:"\u064A\u062F\u0639\u0645 Markdown \u2014 **\u0639\u0631\u064A\u0636**\u060C `\u0634\u064A\u0641\u0631\u0629`\u060C \u0642\u0648\u0627\u0626\u0645.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinAnother:"\u062A\u062D\u062F\u064A\u062F \u0645\u0648\u0642\u0639 \u0622\u062E\u0631",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",ctxAttached:(e,t,n)=>`\u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642 \u0646\u0634\u0627\u0637 \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0634\u0628\u0643\u0629 \u0645\u0646 ${e} (${t} \u0633\u0637\u0631\u060C ${n} \u0637\u0644\u0628).`,ctxOptOut:"\u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u062F\u0648\u0646 \u0646\u0634\u0627\u0637 \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0634\u0628\u0643\u0629",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",apps:"\u0627\u0644\u0628\u0646\u0627\u0621",appAgents:"\u0627\u0644\u0648\u0643\u0644\u0627\u0621",appSkills:"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A",appIssues:"\u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",appVault:"\u0627\u0644\u062E\u0632\u0646\u0629",appMcp:"MCP",appSources:"\u0627\u0644\u0645\u0635\u0627\u062F\u0631",appDocs:"\u0627\u0644\u0645\u0643\u062A\u0628\u0629",appBrain:"\u0627\u0644\u062F\u0645\u0627\u063A",appChat:"\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",appTerminal:"\u0627\u0644\u0637\u0631\u0641\u064A\u0629",back:"\u0631\u062C\u0648\u0639",openFull:"\u0641\u062A\u062D \u0627\u0644\u0645\u0647\u0645\u0629 \u0643\u0627\u0645\u0644\u0629",opened:e=>`\u0641\u064F\u062A\u062D\u062A ${e}`,ago:So,properties:"\u0627\u0644\u062E\u0635\u0627\u0626\u0635",statusLabel:"\u0627\u0644\u062D\u0627\u0644\u0629",priorityLabel:"\u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629",assigneeLabel:"\u0627\u0644\u0645\u0643\u0644\u064E\u0651\u0641",areaLabel:"\u0627\u0644\u0646\u0637\u0627\u0642",branchLabel:"\u0627\u0644\u0641\u0631\u0639",attemptsLabel:"\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A",routeLabel:"\u0627\u0644\u0645\u0633\u0627\u0631",notSet:"\u063A\u064A\u0631 \u0645\u062D\u062F\u064E\u0651\u062F",assigneeAnyArea:"\u0623\u064A \u0645\u062C\u0627\u0644",assigneeHuman:"\u0628\u0634\u0631\u064A \u0641\u0642\u0637",working:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u064A\u0647\u0627",statuses:{triage:"\u0627\u0644\u0641\u0631\u0632",ready:"\u0644\u0644\u062A\u0646\u0641\u064A\u0630",in_progress:"\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630",blocked:"\u0645\u062A\u0639\u062B\u0631\u0629",in_review:"\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629",done:"\u0645\u0646\u062C\u0632\u0629",rejected:"\u0645\u0631\u0641\u0648\u0636\u0629"},priorities:{low:"\u0645\u0646\u062E\u0641\u0636\u0629",normal:"\u0639\u0627\u062F\u064A\u0629",high:"\u0639\u0627\u0644\u064A\u0629",critical:"\u062D\u0631\u062C\u0629"},enhancement:"\u062A\u062D\u0633\u064A\u0646",chore:"\u0645\u0647\u0645\u0629 \u0631\u0648\u062A\u064A\u0646\u064A\u0629",pinnedHeading:"\u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0645\u062B\u0628\u0651\u062A",pinShow:"\u0625\u0638\u0647\u0627\u0631\u0647 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629",pinNoStrategy:"\u0644\u0645 \u064A\u064F\u0644\u062A\u0642\u0637 \u0623\u064A \u0645\u062D\u062F\u0650\u0651\u062F\u060C \u0644\u0630\u0627 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u064A\u062C\u0627\u062F \u0647\u0630\u0627 \u0627\u0644\u062A\u062B\u0628\u064A\u062A \u0645\u062C\u062F\u062F\u064B\u0627.",pinFound:(e,t)=>`\u0639\u064F\u062B\u0631 \u0639\u0644\u064A\u0647 \u0639\u0628\u0631 ${e} (${t}%)`,pinLost:"\u0644\u0645 \u064A\u0639\u062F \u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0645\u062B\u0628\u0651\u062A \u0645\u0648\u062C\u0648\u062F\u064B\u0627 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629.",activityHeading:"\u0627\u0644\u0646\u0634\u0627\u0637",emptyThread:"\u062A\u0638\u0647\u0631 \u0627\u0644\u062A\u0639\u0644\u064A\u0642\u0627\u062A \u0648\u0646\u0634\u0627\u0637 \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0647\u0646\u0627 \u0645\u0639 \u062A\u0642\u062F\u0651\u0645 \u0627\u0644\u0639\u0645\u0644.",agentBadge:"\u0648\u0643\u064A\u0644",commentPlaceholder:"\u0627\u0643\u062A\u0628 \u062A\u0639\u0644\u064A\u0642\u064B\u0627\u2026",commentCta:"\u062A\u0639\u0644\u064A\u0642",posting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0646\u0634\u0631\u2026",noDescription:"\u0644\u0627 \u064A\u0648\u062C\u062F \u0648\u0635\u0641.",actions:{created:"\u0633\u062C\u0651\u0644\u0647\u0627",moved:"\u0646\u0642\u0644\u0647\u0627",assigned:"\u0623\u0633\u0646\u062F\u0647\u0627",commented:"\u0639\u0644\u0651\u0642",edited:"\u0639\u062F\u0651\u0644\u0647\u0627",linked:"\u0631\u0628\u0637 \u0634\u064A\u0626\u064B\u0627 \u0628\u0647\u0627",unlinked:"\u0623\u0644\u063A\u0649 \u0631\u0628\u0637 \u0634\u064A\u0621 \u0628\u0647\u0627",attached:"\u0623\u0631\u0641\u0642 \u0645\u0644\u0641\u064B\u0627",pinned:"\u062B\u0628\u0651\u062A \u0639\u0646\u0635\u0631\u064B\u0627",claimed:"\u0627\u0633\u062A\u0644\u0645\u0647\u0627",released:"\u062A\u0631\u0643\u0647\u0627",blocked:"\u0639\u0637\u0651\u0644\u0647\u0627",unblocked:"\u0623\u0632\u0627\u0644 \u062A\u0639\u0637\u064A\u0644\u0647\u0627",approved:"\u0648\u0627\u0641\u0642 \u0639\u0644\u064A\u0647\u0627",rejected:"\u0631\u0641\u0636\u0647\u0627",pushed:"\u062F\u0641\u0639 \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A",pr_opened:"\u0641\u062A\u062D \u0637\u0644\u0628 \u062F\u0645\u062C",reviewed:"\u0631\u0627\u062C\u0639\u0647\u0627",parked:"\u0639\u0644\u0651\u0642\u0647\u0627 \u062C\u0627\u0646\u0628\u064B\u0627"},actors:{human:"\u0623\u062D\u062F\u0647\u0645",agent:"\u0648\u0643\u064A\u0644",system:"\u0627\u0644\u0646\u0638\u0627\u0645",anon:"\u0632\u0627\u0626\u0631"},dir:"rtl"};function it(e){return e.toLowerCase().startsWith("ar")?Mo:To}var Fn="http://www.w3.org/2000/svg",Bn={messageSquare:[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}],["path",{d:"M13 8H7"}],["path",{d:"M17 12H7"}]],x:[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]],plus:[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]],pin:[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{cx:"12",cy:"10",r:"3"}]],paperclip:[["path",{d:"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"}]],camera:[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}],["circle",{cx:"12",cy:"13",r:"3"}]],eye:[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]],arrowRight:[["path",{d:"M5 12h14"}],["path",{d:"m12 5 7 7-7 7"}]],chevronRight:[["path",{d:"m9 18 6-6-6-6"}]],chevronLeft:[["path",{d:"m15 18-6-6 6-6"}]],flag:[["path",{d:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"}],["line",{x1:"4",x2:"4",y1:"22",y2:"15"}]],user:[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{cx:"12",cy:"7",r:"4"}]],gitBranch:[["line",{x1:"6",x2:"6",y1:"3",y2:"15"}],["circle",{cx:"18",cy:"6",r:"3"}],["circle",{cx:"6",cy:"18",r:"3"}],["path",{d:"M18 9a9 9 0 0 1-9 9"}]],history:[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}],["path",{d:"M12 7v5l4 2"}]],route:[["circle",{cx:"6",cy:"19",r:"3"}],["path",{d:"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"}],["circle",{cx:"18",cy:"5",r:"3"}]],externalLink:[["path",{d:"M15 3h6v6"}],["path",{d:"M10 14 21 3"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]],send:[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"}],["path",{d:"m21.854 2.147-10.94 10.939"}]],crosshair:[["circle",{cx:"12",cy:"12",r:"10"}],["line",{x1:"22",x2:"18",y1:"12",y2:"12"}],["line",{x1:"6",x2:"2",y1:"12",y2:"12"}],["line",{x1:"12",x2:"12",y1:"6",y2:"2"}],["line",{x1:"12",x2:"12",y1:"22",y2:"18"}]],agents:[["path",{d:"M12 8V4H8"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2"}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],skills:[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"}],["path",{d:"M22 10v6"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5"}]],issues:[["rect",{x:"3",y:"5",width:"6",height:"6",rx:"1"}],["path",{d:"m3 17 2 2 4-4"}],["path",{d:"M13 6h8"}],["path",{d:"M13 12h8"}],["path",{d:"M13 18h8"}]],vault:[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 7.9 2.7 2.7"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 10.6 2.7-2.7"}],["circle",{cx:"7.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 16.1 2.7-2.7"}],["circle",{cx:"16.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 13.4 2.7 2.7"}],["circle",{cx:"12",cy:"12",r:"2"}]],sources:[["path",{d:"M4 11a9 9 0 0 1 9 9"}],["path",{d:"M4 4a16 16 0 0 1 16 16"}],["circle",{cx:"5",cy:"19",r:"1"}]],docs:[["rect",{width:"8",height:"18",x:"3",y:"3",rx:"1"}],["path",{d:"M7 3v18"}],["path",{d:"M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"}]],brain:[["path",{d:"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"}],["path",{d:"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"}],["path",{d:"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"}],["path",{d:"M17.599 6.5a3 3 0 0 0 .399-1.375"}],["path",{d:"M6.003 5.125A3 3 0 0 0 6.401 6.5"}],["path",{d:"M3.477 10.896a4 4 0 0 1 .585-.396"}],["path",{d:"M19.938 10.5a4 4 0 0 1 .585.396"}],["path",{d:"M6 18a4 4 0 0 1-1.967-.516"}],["path",{d:"M19.967 17.484A4 4 0 0 1 18 18"}]],chat:[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],mcp:[["path",{d:"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"}],["path",{d:"m2 22 3-3"}],["path",{d:"M7.5 13.5 10 11"}],["path",{d:"M10.5 16.5 13 14"}],["path",{d:"m18 3-4 4h6l-4 4"}]],terminal:[["path",{d:"m7 11 2-2-2-2"}],["path",{d:"M11 13h4"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}]],layers:[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]],app:[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1"}]]};function at(e){return Object.prototype.hasOwnProperty.call(Bn,e)}function T(e,t=14){let n=document.createElementNS(Fn,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let[r,o]of Bn[e]){let i=document.createElementNS(Fn,r);for(let[a,s]of Object.entries(o))i.setAttribute(a,s);n.appendChild(i)}return n}function Q(e,t,n,r=14){e.replaceChildren(),e.appendChild(T(t,r));let o=document.createElement("span");o.textContent=n,e.appendChild(o)}function lt(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let o=n[r],i=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(o);if(i){let g=i[1][0],C=[];for(r++;r<n.length&&!new RegExp(`^\\s*${g}{3,}\\s*$`).test(n[r]);)C.push(n[r]),r++;r++;let H=document.createElement("pre");H.className="md-pre";let R=document.createElement("code");i[2]&&(R.className=`lang-${i[2]}`),R.textContent=C.join(`
`),H.appendChild(R),t.appendChild(H);continue}if(!o.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(o)){t.appendChild(document.createElement("hr")),r++;continue}let a=/^\s*(#{1,6})\s+(.*)$/.exec(o);if(a){let g=Math.min(6,3+a[1].length),C=document.createElement(`h${g}`);C.className="md-h",C.appendChild(ce(a[2])),t.appendChild(C),r++;continue}if(/^\s*>\s?/.test(o)){let g=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)g.push(n[r].replace(/^\s*>\s?/,"")),r++;let C=document.createElement("blockquote");C.className="md-quote",C.appendChild(lt(g.join(`
`))),t.appendChild(C);continue}let s=/^\s*[-*+]\s+/,c=/^\s*\d+[.)]\s+/;if(s.test(o)||c.test(o)){let g=!s.test(o),C=g?c:s,H=document.createElement(g?"ol":"ul");for(H.className="md-list";r<n.length&&C.test(n[r]);){let R=document.createElement("li"),S=n[r].replace(C,"");for(r++;r<n.length&&n[r].trim()&&!C.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)S+=`
`+n[r].trim(),r++;R.appendChild(ce(S)),H.appendChild(R)}t.appendChild(H);continue}let u=Po(n,r);if(u){t.appendChild($o(u)),r=u.next;continue}let y=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r])&&!Un(n,r);)y.push(n[r]),r++;if(y.length){let g=document.createElement("p");g.className="md-p",g.appendChild(ce(y.join(`
`))),t.appendChild(g)}else r++}return t}var _n="\0";function st(e){let t=e.trim().replace(/\\\|/g,_n);return t.startsWith("|")&&(t=t.slice(1)),t.endsWith("|")&&(t=t.slice(0,-1)),t.split("|").map(n=>n.split(_n).join("|").trim())}function Ro(e){if(!e||e.indexOf("-")<0||e.indexOf("|")<0)return!1;let t=st(e);return t.length>0&&t.every(n=>/^:?-+:?$/.test(n))}function Un(e,t){return t+1<e.length&&e[t].indexOf("|")>=0&&Ro(e[t+1])}function Po(e,t){if(!Un(e,t))return null;let n=st(e[t]),r=st(e[t+1]).map(a=>a.startsWith(":")&&a.endsWith(":")?"center":a.endsWith(":")?"end":a.startsWith(":")?"start":""),o=t+2,i=[];for(;o<e.length&&e[o].trim()&&e[o].indexOf("|")>=0;)i.push(st(e[o])),o++;return{head:n,align:r,body:i,cols:i.reduce((a,s)=>Math.max(a,s.length),n.length),headless:n.every(a=>a===""),next:o}}function $o(e){if(e.headless&&e.cols===2){let i=document.createElement("dl");i.className="md-kv";for(let a of e.body){let s=document.createElement("dt");s.setAttribute("dir","auto"),s.appendChild(ce(a[0]??""));let c=document.createElement("dd");c.setAttribute("dir","auto"),c.appendChild(ce(a[1]??"")),i.append(s,c)}return i}let t=document.createElement("div");t.className="md-tablewrap";let n=document.createElement("table");n.className="md-table";let r=(i,a,s)=>{let c=document.createElement(i);return c.setAttribute("dir","auto"),e.align[s]&&(c.style.textAlign=e.align[s]),c.appendChild(ce(a)),c};if(!e.headless){let i=document.createElement("thead"),a=document.createElement("tr");for(let s=0;s<e.cols;s++)a.appendChild(r("th",e.head[s]??"",s));i.appendChild(a),n.appendChild(i)}let o=document.createElement("tbody");for(let i of e.body){let a=document.createElement("tr");for(let s=0;s<e.cols;s++)a.appendChild(r("td",i[s]??"",s));o.appendChild(a)}return n.appendChild(o),t.appendChild(n),t}var Ho=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function ce(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=Ho.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&Nn(t,n.slice(0,r.index)),r[1]){let o=document.createElement("code");o.className="md-code",o.textContent=r[2].trim(),t.appendChild(o)}else r[3]!==void 0?t.appendChild(zn(r[4],r[3]||r[4])):r[5]?t.appendChild(Mt("strong","md-strong",r[6])):r[7]?t.appendChild(Mt("del","md-del",r[8])):r[9]?t.appendChild(Mt("em","md-em",r[10])):r[11]&&t.appendChild(zn(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&Nn(t,n),t}function Mt(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(ce(n)),r}function zn(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function Nn(e,t){t.split(`
`).forEach((r,o)=>{o&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function Wn(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let o=await r.json();return{id:o.id,number:o.number,title:o.title,body:o.body??"",type:o.type,status:o.status,priority:o.priority,route:o.route??"",pageUrl:o.pageUrl??"",createdAt:o.createdAt??"",assignee:o.assignee??"",humanOnly:!!o.humanOnly,area:o.area??"",branch:o.branch??"",attempts:typeof o.attempts=="number"?o.attempts:0,busy:!!o.busy,pins:o.pins??[],comments:o.comments??[],activity:o.activity??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function qn(e,t,n,r=o=>`/builder/issues/${o}`){let o=it(e),i=document.createElement("div");i.className="detail hidden";let a=null,s="",c=null;async function u(d){i.replaceChildren(x("p","empty",o.loading));try{a=await t.get(d),y()}catch(h){i.replaceChildren(x("p","note err",String(h.message)))}}function y(){if(!a)return;let d=a;i.replaceChildren(),i.append(g(d),C(d),ue(d))}function g(d){let h=x("div","d-nav",""),f=document.createElement("button");f.type="button",f.className="d-back",f.append(T("chevronLeft",14),x("span","",o.back)),f.addEventListener("click",n);let k=x("span","d-num",`#${d.number}`);k.setAttribute("dir","ltr");let E=document.createElement("button");return E.type="button",E.className="d-iconbtn d-open",E.title=o.openFull,E.setAttribute("aria-label",o.openFull),E.appendChild(T("externalLink",14)),E.addEventListener("click",()=>window.open(r(d.number),"_blank","noopener")),h.append(f,k,E),h}function C(d){let h=x("div","d-main",""),f=x("h3","d-title",d.title);f.setAttribute("dir","auto"),h.appendChild(f);let k=x("p","d-sub","");if(k.appendChild(x("span","",o.opened(o.ago(d.createdAt)))),d.busy){let P=x("span","d-live","");P.appendChild(x("span","d-pulse","")),P.appendChild(x("span","",o.working)),k.append(m(),P)}h.appendChild(k),h.appendChild(H(d));let E=x("div","d-body","");if(E.setAttribute("dir","auto"),d.body?E.appendChild(lt(d.body)):E.appendChild(x("p","d-empty",o.noDescription)),h.appendChild(E),d.pins.length){h.appendChild(D(o.pinnedHeading,d.pins.length));let P=x("div","d-objs","");for(let z of d.pins)P.appendChild(K(z));h.appendChild(P)}let I=pe(d);return h.appendChild(D(o.activityHeading,I.length||void 0)),h.appendChild(W(I)),h}function H(d){let h=x("div","d-props","");h.appendChild(R(S("status",d.status),o.statusLabel,Ee(o.statuses[d.status]??d.status))),h.appendChild(R(S("priority",d.priority),o.priorityLabel,Ee(o.priorities[d.priority]??d.priority))),h.appendChild(R(T("flag",13),o.type,Ee(o[d.type]??d.type)));let f=d.humanOnly?o.assigneeHuman:d.assignee||o.assigneeAnyArea;return h.appendChild(R(T("user",13),o.assigneeLabel,d.assignee&&!d.humanOnly?Ce(f):Ee(f),!d.assignee&&!d.humanOnly)),h.appendChild(R(T("layers",13),o.areaLabel,d.area?Ce(d.area):Ee(o.notSet),!d.area)),h.appendChild(R(T("gitBranch",13),o.branchLabel,d.branch?Ce(d.branch):Ee(o.notSet),!d.branch)),h.appendChild(R(T("history",13),o.attemptsLabel,Ce(String(d.attempts)))),d.route&&h.appendChild(R(T("route",13),o.routeLabel,Ce(d.route))),h}function R(d,h,f,k=!1){let E=x("div","d-prop",""),I=x("span","d-prop-k","");I.append(d,x("span","",h));let P=x("span",`d-prop-v${k?" muted":""}`,"");return P.appendChild(f),E.append(I,P),E}function S(d,h){let f=document.createElement("span");return f.className="d-dot",f.dataset[d]=h,f}function K(d){let h=x("div","d-obj",""),f=x("span","d-obj-ico","");f.setAttribute("aria-hidden","true"),f.appendChild(T("crosshair",15));let k=x("div","d-obj-txt",""),E=x("p","d-obj-nm",""),I=x("bdi","",`<${d.tag??"?"}>`);I.setAttribute("dir","ltr"),E.appendChild(I),d.name&&(E.appendChild(x("span",""," \u2014 ")),E.appendChild(x("bdi","",`\u201C${d.name}\u201D`)));let P=x("p","d-obj-meta","");d.verified&&d.verified.length?P.appendChild(Ce(d.verified.join(", "))):P.textContent=o.pinNoStrategy,k.append(E,P);let z=document.createElement("button");return z.type="button",z.className="d-iconbtn",z.title=o.pinShow,z.setAttribute("aria-label",o.pinShow),z.appendChild(T("eye",14)),z.addEventListener("click",()=>{let ee=Ge(d);Ae(ee.found?o.pinFound(ee.by,Math.round(ee.confidence*100)):o.pinLost,ee.found?"ok":"err")}),h.append(f,k,z),h}function pe(d){return[...d.comments.map(h=>({at:jn(h.createdAt),kind:"comment",comment:h})),...d.activity.filter(h=>h.action!=="commented").map(h=>({at:jn(h.createdAt),kind:"event",event:h}))].sort((h,f)=>h.at-f.at)}function W(d){if(!d.length)return x("p","d-empty",o.emptyThread);let h=document.createElement("ol");h.className="d-thread";for(let f of d)h.appendChild(f.kind==="comment"?B(f.comment):v(f.event));return h}function B(d){let h=document.createElement("li");h.className="d-item",h.appendChild(_()),h.appendChild(M(d.author,d.kind));let f=document.createElement("article");f.className="d-card";let k=x("p","d-card-h",""),E=x("span","d-who","");E.appendChild(x("bdi","",d.author||"\u2014")),k.appendChild(E),d.kind==="agent"&&k.appendChild(x("span","d-badge",o.agentBadge)),k.appendChild(m()),k.appendChild(x("span","",o.ago(d.createdAt)));let I=x("div","d-card-b","");return I.setAttribute("dir","auto"),I.appendChild(lt(d.body)),f.append(k,I),h.appendChild(f),h}function v(d){let h=document.createElement("li");h.className="d-item d-evt",h.appendChild(_());let f=x("span","d-knot","");f.setAttribute("aria-hidden","true"),f.appendChild(document.createElement("span")),h.appendChild(f);let k=x("p","d-evt-t",""),E=x("span","d-evt-w","");return E.appendChild(x("span","d-who",o.actors[d.actorKind]??d.actorKind)),E.appendChild(document.createTextNode(" "+(o.actions[d.action]??d.action))),k.append(E,m(),x("span","d-evt-at",o.ago(d.createdAt))),h.appendChild(k),h}function M(d,h){let f=x("span","d-avatar","");return f.setAttribute("aria-hidden","true"),h==="agent"?f.appendChild(T("agents",13)):h==="system"?f.appendChild(T("messageSquare",12)):f.appendChild(x("bdi","",(d.trim()[0]||"?").toUpperCase())),f}function ue(d){let h=x("div","d-composer","");c=x("p","note hidden","");let f=document.createElement("textarea");f.className="d-draft",f.placeholder=o.commentPlaceholder,f.rows=2,f.value=s,f.addEventListener("input",()=>{s=f.value});let k=document.createElement("button");k.type="button",k.className="primary d-send";let E=P=>{k.replaceChildren(T("send",13),x("span","",P))};E(o.commentCta),k.addEventListener("click",async()=>{let P=f.value.trim();if(P){k.disabled=!0,E(o.posting);try{await t.comment(d.number,P),s="",await u(d.number)}catch(z){Ae(String(z.message),"err"),k.disabled=!1,E(o.commentCta)}}});let I=x("div","d-composer-act","");return I.appendChild(k),h.append(c,f,I),h}function Ae(d,h){let f=c;f&&(f.textContent=d,f.className=`note ${h}`,setTimeout(()=>{f.textContent===d&&(f.className="note hidden")},4e3))}let m=()=>{let d=x("span","d-sep","\xB7");return d.setAttribute("aria-hidden","true"),d},_=()=>{let d=x("span","d-line","");return d.setAttribute("aria-hidden","true"),d};function D(d,h){let f=x("div","d-sect","");if(f.appendChild(x("h4","d-sect-t",d)),h!==void 0){let k=x("span","d-sect-n",String(h));k.setAttribute("dir","ltr"),f.appendChild(k)}return f}return{el:i,load:u,destroy:()=>i.remove()}}function Ee(e){return x("bdi","",e)}function Ce(e){let t=x("bdi","mono",e);return t.setAttribute("dir","ltr"),t}function jn(e){let t=Date.parse(e);return Number.isFinite(t)?t:0}function x(e,t,n){let r=document.createElement(e);return t&&(r.className=t),n&&(r.textContent=n),r}function Xn(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let o=await r.json().catch(()=>null);return Array.isArray(o?.issues)?o.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??"",context:n.context??void 0}));for(let a of n.attachments)r.append("attachments",a.blob,a.name),r.append("attachment_kinds",a.kind);let o=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!o.ok){let a=await o.text().catch(()=>"");throw new Error(a||`submit failed (${o.status})`)}let i=await o.json();return{id:String(i.id??""),number:Number(i.number??0)}}}}var Gn="builder.fab.position",Io=["bug","feature","question","discussion"],Vn=8;function Zn(e={}){let t=e.shell??"panel";if(t==="os"||t==="auto"){let l=No(e);if(l)return l}let n=it(e.locale??document.documentElement.lang??"en"),r=e.transport??Xn(e.apiBase),o=e.locale??"en",i=document.createElement("div");i.setAttribute(le,""),i.setAttribute("dir",n.dir),e.theme&&i.setAttribute("data-theme",e.theme),document.body.appendChild(i);let a=i.attachShadow({mode:"open"}),s=document.createElement("style");s.textContent=Tn+(e.accent?`:host{--accent:${Bo(e.accent)}}`:""),a.appendChild(s);let c=document.createElement("style");c.setAttribute(le,""),c.textContent=Ke,document.head.appendChild(c);let u=[],y=[],g=[],C="bug",H=!1,R=!1,S=null,K=null,pe=!1,W=null,B=null,v=null,M=null,ue=()=>{},Ae=document.createElement("div");Ae.innerHTML=`
    <button class="fab" part="fab" aria-haspopup="dialog" aria-expanded="false">
      <span class="fab-ico"></span><span class="fab-label"></span><span class="count hidden"></span>
    </button>
    <aside class="panel" role="dialog" aria-modal="false" data-open="false">
      <!-- The brand row names the surface and shows the route the panel is
           scoped to \u2014 the subline is the answer to "issues on WHICH page?",
           which a bare "Feedback" title left implicit. -->
      <div class="head">
        <div class="brand">
          <span class="brand-ico"></span>
          <div class="brand-txt"><h2></h2><span class="brand-sub"></span></div>
        </div>
        <button class="x" aria-label=""></button>
      </div>
      <div class="body">
        <p class="intro"></p>
        <button class="primary report"></button>

        <div class="listing">
          <div class="label lbl-page"></div>
          <div class="rows"></div>
          <!-- The panel shows only issues for THIS page. Getting to the full
               board previously meant knowing the /issues URL by heart. -->
          <a class="board-link" href="/issues" target="_blank" rel="noopener"></a>
        </div>

        <!-- The builder's own screens, as an app launcher.
             These used to be four permanent items in the product's sidebar.
             They belong to the tooling, not to the app being built, so they
             live behind this button and open as a layer over the page.
             Last in the column (and anchored to the bottom by CSS): the page's
             issues are what this panel is FOR; the launcher is its side door. -->
        <div class="apps">
          <div class="label lbl-apps"></div>
          <div class="appgrid"></div>
        </div>
      </div>
    </aside>

    <!-- The report form, as a draggable modal.
         It used to live inline in the slide-over, which meant filling it in
         covered the right-hand third of the page you were reporting on \u2014 and
         pinning an element or taking a screenshot needs you to SEE that page.
         A modal you can drag out of the way solves both: the form stays put
         while you work around it. -->
    <div class="modal" data-open="false" role="dialog" aria-modal="true" aria-label="">
      <div class="modal-card">
        <div class="modal-head">
          <h2 class="modal-title"></h2>
          <button type="button" class="modal-x" aria-label=""></button>
        </div>
        <form class="form" novalidate>
          <div class="modal-body">
            <div class="label lbl-title"></div>
            <input type="text" name="title" maxlength="255" required>

            <div class="row2">
              <div>
                <div class="label lbl-type"></div>
                <div class="pills"></div>
              </div>
            </div>

            <div class="label lbl-loc"></div>
            <div class="btns">
              <button type="button" class="ghost pin" aria-pressed="false"></button>
              <button type="button" class="ghost clearpin hidden"></button>
            </div>
            <div class="pin-preview hidden"></div>

            <div class="label lbl-details"></div>
            <textarea name="body"></textarea>
            <p class="hint lbl-md"></p>

            <div class="label lbl-att"></div>
            <div class="btns">
              <button type="button" class="ghost addfile"></button>
              <button type="button" class="ghost shot"></button>
            </div>
            <div class="files"></div>
            <input type="file" class="filein hidden" multiple accept="${xn}">

            <!-- Bridge-mode disclosure. Hidden until the framed product has
                 volunteered console/network context; then it says exactly what
                 will ride along with the report and offers the way out. A tool
                 that quietly harvests session activity is not a feedback
                 widget. -->
            <div class="ctxrow hidden">
              <p class="hint ctx-note"></p>
              <label class="ctx-opt"><input type="checkbox" class="ctx-optout"><span class="ctx-opt-txt"></span></label>
            </div>

            <div class="label lbl-url"></div>
            <input type="text" name="url" disabled>

            <p class="note hidden"></p>
          </div>
          <div class="modal-foot">
            <button type="button" class="ghost cancel"></button>
            <button type="submit" class="primary send"></button>
          </div>
        </form>
      </div>
    </div>

`,a.appendChild(Ae);let m=l=>a.querySelector(l),_=m(".fab"),D=m(".panel"),d=m(".form"),h=m(".listing"),f=m(".modal"),k=m(".modal-card"),E=m(".modal-head"),I=m(".modal-x"),P=m(".cancel"),z=m(".rows"),ee=m(".pills"),dt=m(".note"),Pt=m(".files"),Ie=m(".filein"),$t=m(".count"),Yn=m(".appgrid"),De=m('input[name="title"]'),Ht=m('textarea[name="body"]'),It=m('input[name="url"]'),te=m(".pin");if(e.framedHost){let l=new Map,p=F=>{let b=l.get(F.id);return b?b.app=F:(b={app:F,ready:!1,page:null,ctx:null},l.set(F.id,b)),b},w=F=>{let b=F;return!b||typeof b.id!="string"||!b.id?null:{id:b.id,name:typeof b.name=="string"&&b.name?b.name:b.id,origin:typeof b.origin=="string"?b.origin:""}},A=(F,b)=>{b&&window.postMessage({v:1,type:F,appId:b},location.origin)},V=F=>A(F,v?.id),$="This app has not loaded the builder script, so there is nothing inside the frame to read the page with. Add the script tag to enable pinning and screenshots.",O=m(".pin"),q=m(".shot"),Fe=m(".ctxrow"),sr=m(".ctx-note");m(".ctx-opt-txt").textContent=n.ctxOptOut;let Se=()=>{let F=v?l.get(v.id):void 0;W=F?.page??null,B=F?.ctx??null;let b=!!F?.ready;for(let Be of[O,q])Be.disabled=!b,Be.title=b?"":$,b?Be.removeAttribute("aria-disabled"):Be.setAttribute("aria-disabled","true");It.value=W?.url??"";let N=we(W?.url),se=m(".brand-sub");se.setAttribute("dir","auto"),se.textContent=v?`${v.name} \xB7 ${N}`:N;let J=!!B&&(B.console.length>0||B.network.length>0);Fe.classList.toggle("hidden",!J),B&&v&&(sr.textContent=n.ctxAttached(v.name,B.console.length,B.network.length))},qt=()=>{M=null,H?f.dataset.open="true":D.dataset.open="true",fe()};ue=()=>{A(L.pinCancel,M??void 0),qt()},window.addEventListener("message",F=>{if(F.source!==window||F.origin!==location.origin)return;let b=F.data;if(!b||b.v!==1||typeof b.type!="string")return;let N=w(b.app);if(!N)return;if(b.type==="builder:app:active"){M&&M!==N.id&&ue(),v=N,p(N),Se(),A(L.context,N.id),re();return}let se=p(N);switch(b.type){case L.ready:se.ready=!0,typeof b.url=="string"&&b.url&&(se.page={url:b.url,title:typeof b.title=="string"?b.title:""}),A(L.context,N.id),N.id===v?.id&&(Se(),re());return;case L.url:typeof b.url=="string"&&b.url&&(se.page={url:b.url,title:typeof b.title=="string"?b.title:""}),N.id===v?.id&&(Se(),re());return;case L.pinDone:{if(M!==N.id)return;let J=b.anchor;J&&typeof J=="object"&&y.length<Vn&&(y=[...y,J]),qt();return}case L.shotDone:{if(N.id!==v?.id)return;if(q.disabled=!1,typeof b.dataUrl=="string"&&b.dataUrl.startsWith("data:")){let J=Do(b.dataUrl);J&&J.size<=Et("image")?(g.push(J),Le(),Z("")):Z(n.failed,"err")}else Z(typeof b.error=="string"&&b.error?b.error:n.failed,"err");return}case L.contextDone:{se.ctx={console:Array.isArray(b.console)?b.console:[],network:Array.isArray(b.network)?b.network:[],viewport:b.viewport&&typeof b.viewport=="object"?b.viewport:{w:0,h:0,dpr:1},userAgent:typeof b.userAgent=="string"?b.userAgent:"",locale:typeof b.locale=="string"?b.locale:"",url:typeof b.url=="string"?b.url:"",title:typeof b.title=="string"?b.title:"",app:N},N.id===v?.id&&Se();return}}}),O.addEventListener("click",()=>{if(!(!v||!l.get(v.id)?.ready)){if(M){ue();return}M=v.id,D.dataset.open="false",f.dataset.open="false",O.setAttribute("aria-pressed","true"),O.textContent=n.pinning,V(L.pinStart)}}),q.addEventListener("click",()=>{!v||!l.get(v.id)?.ready||(q.disabled=!0,V(L.shot))}),m(".report").addEventListener("click",()=>V(L.context)),Se()}let ct=m(".clearpin"),pt=m(".pin-preview"),he=m(".send"),Oe=new WeakMap;function Kn(l){let p=Oe.get(l);return p||(p=URL.createObjectURL(l.blob),Oe.set(l,p)),p}function ut(l){let p=Oe.get(l);p&&(URL.revokeObjectURL(p),Oe.delete(l))}m(".fab-label").textContent=n.fab,m("h2").textContent=n.title,D.setAttribute("aria-label",n.title),m(".brand-ico").replaceChildren(T("messageSquare",16)),m(".brand-sub").textContent=we(),m(".fab-ico").replaceChildren(T("messageSquare",14)),m(".x").replaceChildren(T("x",16)),m(".x").setAttribute("aria-label",n.close),m(".intro").textContent=n.intro,Q(m(".report"),"plus",n.report,15),m(".lbl-type").textContent=n.type,m(".lbl-title").textContent=n.titleLabel,m(".lbl-details").textContent=n.details,m(".lbl-url").textContent=n.pageUrl,m(".lbl-loc").textContent=n.location,m(".lbl-att").textContent=n.attachments,m(".lbl-page").textContent=n.onThisPage,Q(m(".board-link"),"arrowRight",n.openBoard),m(".lbl-apps").textContent=n.apps,m(".modal-title").textContent=n.reportTitle,I.setAttribute("aria-label",n.close),I.appendChild(T("x",16)),f.setAttribute("aria-label",n.reportTitle),P.textContent=n.cancel,m(".lbl-md").textContent=n.markdownHint,De.placeholder=n.titlePlaceholder,Ht.placeholder=n.detailsPlaceholder,Q(te,"pin",n.pin),Q(ct,"x",n.clear),Q(m(".addfile"),"paperclip",n.addFile),Q(m(".shot"),"camera",n.screenshot),he.textContent=n.submit;for(let l of Io){let p=document.createElement("button");p.type="button",p.className="pill",p.dataset.type=l,p.textContent=n[l],p.setAttribute("aria-pressed",String(l===C)),p.addEventListener("click",()=>{C=l,ee.querySelectorAll(".pill").forEach(w=>w.setAttribute("aria-pressed",String(w.dataset.type===l)))}),ee.appendChild(p)}let Jn=4,G=null,ht=(l,p)=>{let w=Math.max(8,Math.min(l,window.innerWidth-80)),A=Math.max(8,Math.min(p,window.innerHeight-48));_.style.insetInlineEnd=`${w}px`,_.style.insetBlockEnd=`${A}px`},Dt=Oo();ht(Dt?.right??e.position?.right??24,Dt?.bottom??e.position?.bottom??24),_.addEventListener("pointerdown",l=>{if(l.button!==0)return;let p=_.getBoundingClientRect();G={x:l.clientX,y:l.clientY,ox:window.innerWidth-p.right,oy:window.innerHeight-p.bottom,moved:!1},_.setPointerCapture(l.pointerId)}),_.addEventListener("pointermove",l=>{if(!G)return;let p=l.clientX-G.x,w=l.clientY-G.y;!G.moved&&Math.hypot(p,w)<Jn||(G.moved=!0,ht(G.ox-p,G.oy-w))}),_.addEventListener("pointerup",l=>{if(!G)return;let p=G.moved;if(G=null,_.releasePointerCapture(l.pointerId),p){let w=_.getBoundingClientRect();Fo(window.innerWidth-w.right,window.innerHeight-w.bottom);return}Ot()}),_.addEventListener("keydown",l=>{(l.key==="Enter"||l.key===" ")&&(l.preventDefault(),Ot())}),window.addEventListener("resize",()=>{let l=_.getBoundingClientRect();ht(window.innerWidth-l.right,window.innerHeight-l.bottom)});function Ot(){D.dataset.open==="true"?ne():Ft()}function Ft(){pe||(D.dataset.open="true",_.setAttribute("aria-expanded","true"),e.framedHost||(It.value=location.href,m(".brand-sub").textContent=we()),re())}function ne(){D.dataset.open="false",D.dataset.detail="false",_.setAttribute("aria-expanded","false"),ae(!1),S?.(),S=null}let Qn=[{key:"agents",path:"/agents",color:"var(--app-agents)",label:n.appAgents},{key:"skills",path:"/skills",color:"var(--app-skills)",label:n.appSkills},{key:"issues",path:"/issues",color:"var(--app-issues)",label:n.appIssues},{key:"vault",path:"/vault",color:"var(--app-vault)",label:n.appVault},{key:"sources",path:"/sources",color:"var(--app-sources)",label:n.appSources},{key:"docs",path:"/library",color:"var(--app-docs)",label:n.appDocs},{key:"brain",path:"/brain",color:"var(--app-brain)",label:n.appBrain},{key:"chat",path:"/chat",color:"var(--app-chat)",label:n.appChat},{key:"mcp",path:"/mcp",color:"var(--app-mcp)",label:n.appMcp},{key:"terminal",path:"/terminal",color:"var(--app-terminal)",label:n.appTerminal}];function Bt(){let l=(e.apiBase??"").trim();if(!l)return"";try{return new URL(l,location.href).origin}catch{return""}}let er=(e.screensBase??"/builder").replace(/\/+$/,""),_t=(l,p)=>`${Bt()}${er}${l}${p?"?embed=1":""}`;function zt(l){let p=document.createElement("button");p.type="button",p.className="app",p.dataset.app=l.key;let w=document.createElement("span");w.className="app-ico",w.style.background=l.color,w.appendChild(T(at(l.key)?l.key:"app",18));let A=document.createElement("span");A.textContent=l.label,p.append(w,A),p.addEventListener("click",()=>tr(l)),Yn.appendChild(p)}for(let l of Qn)zt(l);(async()=>{try{let l=(e.apiBase??"").replace(/\/$/,""),p=await fetch(`${l}/api/builder/apps`,{credentials:"include",headers:{Accept:"application/json"}});if(!p.ok)return;let w=await p.json(),A=Array.isArray(w?.apps)?w.apps:[],V=n.dir==="rtl";for(let $ of A){let O=typeof $?.slug=="string"?$.slug:"";if(!O)continue;let q=typeof $?.title?.en=="string"?$.title.en:O,Fe=typeof $?.title?.ar=="string"?$.title.ar:"";zt({key:O,path:`/apps/${O}`,color:typeof $?.color=="string"&&$.color?$.color:"var(--app-default)",label:V&&Fe?Fe:q})}}catch{}})();function tr(l){let p=Bt(),w=_t(l.path,!0);if(p&&p!==location.origin){window.open(w,"_blank","noopener"),ne();return}try{sessionStorage.setItem("builder:standalone","1"),sessionStorage.setItem("builder:standalone:return",location.href)}catch{}ne(),location.assign(w)}let me=null;E.addEventListener("pointerdown",l=>{if(l.target.closest(".modal-x"))return;let p=k.getBoundingClientRect();k.style.position="fixed",k.style.margin="0",k.style.left=`${p.left}px`,k.style.top=`${p.top}px`,me={dx:l.clientX-p.left,dy:l.clientY-p.top},E.setPointerCapture(l.pointerId)}),E.addEventListener("pointermove",l=>{if(!me)return;let p=k.getBoundingClientRect(),w=Math.min(Math.max(l.clientX-me.dx,8-p.width+80),innerWidth-80),A=Math.min(Math.max(l.clientY-me.dy,8),innerHeight-44);k.style.left=`${w}px`,k.style.top=`${A}px`});let Nt=l=>{if(me){me=null;try{E.releasePointerCapture(l.pointerId)}catch{}}};E.addEventListener("pointerup",Nt),E.addEventListener("pointercancel",Nt);function nr(){k.style.position="",k.style.left="",k.style.top="",k.style.margin=""}I.addEventListener("click",()=>ae(!1)),P.addEventListener("click",()=>ae(!1)),document.addEventListener("keydown",l=>{if(l.key==="Escape"){if(M){ue();return}H&&!S&&ae(!1)}}),m(".x").addEventListener("click",ne),a.addEventListener("keydown",l=>{l.key==="Escape"&&!S&&ne()});function Ut(l){D.dataset.open!=="true"||S||l.composedPath().includes(i)||ne()}document.addEventListener("click",Ut,!0);function ae(l){H=l,f.dataset.open=l?"true":"false",l?(nr(),setTimeout(()=>De.focus(),30)):(rr(),S?.(),S=null)}m(".report").addEventListener("click",()=>ae(!0));function rr(){d.reset(),y=[],g.forEach(ut),g=[],C="bug",ee.querySelectorAll(".pill").forEach(l=>l.setAttribute("aria-pressed",String(l.dataset.type==="bug"))),fe(),Le(),Z("")}function Z(l,p=""){dt.textContent=l,dt.className=`note ${p}`.trim(),dt.classList.toggle("hidden",!l)}e.framedHost||te.addEventListener("click",()=>{if(S){S(),S=null,te.setAttribute("aria-pressed","false"),Q(te,"pin",n.pin);return}D.dataset.open="false",f.dataset.open="false",te.setAttribute("aria-pressed","true"),te.textContent=n.pinning;let l=()=>{H?f.dataset.open="true":D.dataset.open="true"};S=ke((p,w)=>{y.length<Vn&&(y=[...y,p]),S=null,l(),fe(),w.classList.add("builder-pin-found"),setTimeout(()=>w.classList.remove("builder-pin-found"),3e3)},()=>{S=null,l(),fe()})}),ct.addEventListener("click",()=>{y=[],fe()});function fe(){let l=y.length>0;te.setAttribute("aria-pressed",String(l)),Q(te,"pin",l?n.pinAnother:n.pin),ct.classList.toggle("hidden",!l),pt.classList.toggle("hidden",!l),pt.textContent="",y.forEach((p,w)=>{let A=document.createElement("div");A.className="pinrow";let V=document.createElement("span");V.className="pinnum",V.textContent=String(w+1);let $=p.name||p.hint||"",O=document.createElement("span");O.className="pintxt",O.textContent=`<${p.tag??"?"}>${$?` \u201C${$}\u201D`:""}`;let q=document.createElement("button");q.type="button",q.className="pindel",q.setAttribute("aria-label",`${n.clear} ${w+1}`),q.appendChild(T("x",12)),q.addEventListener("click",()=>{y.splice(w,1),fe()}),A.append(V,O,q),pt.appendChild(A)})}m(".addfile").addEventListener("click",()=>Ie.click()),Ie.addEventListener("change",()=>{for(let l of Array.from(Ie.files??[]))or(l);Ie.value=""});function or(l){let p=yn(l.type),w=Et(p);if(l.size>w){Z(`${l.name} is ${Ve(l.size)} \u2014 the limit is ${Ve(w)}.`,"err");return}g.push({name:l.name,mime:l.type,size:l.size,kind:p,blob:l}),Le(),Z("")}e.framedHost||m(".shot").addEventListener("click",async()=>{let l=m(".shot");l.disabled=!0;let p=D.dataset.open;D.dataset.open="false",i.style.visibility="hidden";try{await new Promise(w=>setTimeout(w,120)),g.push(await de()),Le(),Z("")}catch(w){Z(String(w.message||w),"err")}finally{i.style.visibility="",D.dataset.open=p??"true",l.disabled=!1}});function Le(){Pt.replaceChildren(),g.forEach((l,p)=>{let w=document.createElement("div");if(w.className="file",l.kind==="screenshot"||l.kind==="image"){let O=document.createElement("img");O.className="thumb",O.src=Kn(l),O.alt="",w.appendChild(O)}let A=document.createElement("span");A.className="nm",A.textContent=l.name;let V=document.createElement("span");V.textContent=Ve(l.size);let $=document.createElement("button");$.type="button",$.replaceChildren(T("x",12)),$.setAttribute("aria-label",n.clear),$.addEventListener("click",()=>{ut(l),g.splice(p,1),Le()}),w.append(A,V,$),Pt.appendChild(w)})}async function jt(){if(R)return;let l=De.value.trim();if(!l){Z(n.titleRequired,"err"),De.focus();return}R=!0,he.disabled=!0,he.textContent=n.submitting;try{let p=m(".ctx-optout"),w=v?{console:[],network:[],viewport:{w:0,h:0,dpr:1},userAgent:"",locale:"",url:W?.url??"",title:W?.title??"",app:v}:void 0,A=await r.create({type:C,title:l,body:Ht.value,route:we(W?.url),pageUrl:W?.url??location.href,locale:o,pins:y,attachments:g,context:B&&!p?.checked?B:w});Z(n.created(A.number),"ok"),e.onCreated?.(A),setTimeout(()=>{ae(!1),re()},900)}catch(p){Z(String(p.message||n.failed),"err")}finally{R=!1,he.disabled=!1,he.textContent=n.submit}}he.addEventListener("click",jt),d.addEventListener("submit",l=>{l.preventDefault(),jt()});async function re(){if(!H){z.replaceChildren(ie("div","empty",n.loading));try{u=await r.listByRoute(we(W?.url))}catch{u=[]}if($t.textContent=u.length>9?"9+":String(u.length),$t.classList.toggle("hidden",u.length===0),m(".lbl-page").textContent=u.length?n.issueCount(u.length):n.onThisPage,z.replaceChildren(),!u.length){z.appendChild(ie("div","empty",n.none));return}for(let l of u){let p=document.createElement("button");if(p.type="button",p.className="row",p.append(ie("span","num",`#${l.number}`),ie("span",`chip ${l.type}`,n[l.type])),p.appendChild(ie("span","t",l.title)),l.busy){let A=ie("span","agent-tag","");A.appendChild(ie("span","spin","")),A.appendChild(ie("span","who",l.agent||n.agentWorking)),A.setAttribute("title",l.agent?n.agentWorkingBy(l.agent):n.agentWorking),p.appendChild(A)}let w=T("chevronRight",14);w.classList.add("go"),p.appendChild(w),p.addEventListener("click",()=>void ir(l.number)),z.appendChild(p)}}}async function ir(l){K||(K=qn(o,Wn(e.apiBase),()=>{K?.el.classList.add("hidden"),h.classList.remove("hidden"),m(".report").classList.remove("hidden"),m(".apps").classList.remove("hidden"),D.dataset.detail="false",re()},p=>_t(`/issues/${p}`,!0)),m(".body").appendChild(K.el)),h.classList.add("hidden"),m(".report").classList.add("hidden"),m(".apps").classList.add("hidden"),ae(!1),K.el.classList.remove("hidden"),D.dataset.detail="true",await K.load(l)}let Wt=null;!e.framedHost&&e.bridge!==!1&&(Wt=Dn({locale:o,shellOrigins:e.shellOrigins,onActivate:()=>{pe=!0,S?.(),S=null,ne(),i.style.display="none"}}));let ar={open:Ft,close:ne,refresh:()=>void re(),destroy(){Wt?.(),S?.(),g.forEach(ut),document.removeEventListener("click",Ut,!0),i.remove(),c.remove()}};return re(),ar}function Do(e){try{let t=e.indexOf(",");if(t<0)return null;let n=/^data:([^;,]+)/.exec(e.slice(0,t))?.[1]||"image/png",r=atob(e.slice(t+1)),o=new Uint8Array(r.length);for(let u=0;u<r.length;u++)o[u]=r.charCodeAt(u);let i=new Blob([o],{type:n}),a=new Date,s=u=>String(u).padStart(2,"0");return{name:`screenshot-${`${a.getFullYear()}${s(a.getMonth()+1)}${s(a.getDate())}-${s(a.getHours())}${s(a.getMinutes())}${s(a.getSeconds())}`}.png`,mime:n,size:i.size,kind:"screenshot",blob:i}}catch{return null}}function ie(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function Oo(){try{let e=localStorage.getItem(Gn);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function Fo(e,t){try{localStorage.setItem(Gn,JSON.stringify({right:e,bottom:t}))}catch{}}function Bo(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}var Rt=null;function _o(e){Rt?.toggleDock?.(e)}function zo(e){Rt?.setApps?.(e??[])}function No(e){try{let t=(e.apiBase??"").replace(/\/$/,""),n=`${t}/sdk/shell.html`,r=t?new URL(t,location.href).origin:location.origin,o=!1,i=new tt({src:n,origin:r,zIndex:e.zIndex,boot:{apiBase:t,locale:e.locale?e.locale==="ar"?"ar":"en":rt(),theme:"default",dark:e.theme?e.theme==="dark":nt(),hostHref:location.href,hostTitle:document.title,fonts:$e(),hostApps:e.apps??[],accent:e.accent,hotkey:e.hotkey??(r===location.origin?"mod+k":!1)},onFallback:()=>{o||(o=!0,Zn({...e,shell:"panel"}))}});if(!i.mount())return null;let a={open:()=>{},close:()=>{},refresh:()=>{},setApps:s=>i.setHostApps(s??[]),toggleDock:s=>i.toggleDock(s),destroy:()=>i.teardown("destroyed by the host")};return Rt=a,a}catch{return null}}return mr(Uo);})();
