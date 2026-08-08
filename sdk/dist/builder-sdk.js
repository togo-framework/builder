"use strict";var BuilderIssues=(()=>{var Le=Object.defineProperty;var Yt=Object.getOwnPropertyDescriptor;var Xt=Object.getOwnPropertyNames;var Jt=Object.prototype.hasOwnProperty;var Qt=(e,t)=>{for(var n in t)Le(e,n,{get:t[n],enumerable:!0})},Zt=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of Xt(t))!Jt.call(e,o)&&o!==n&&Le(e,o,{get:()=>t[o],enumerable:!(r=Yt(t,o))||r.enumerable});return e};var en=e=>Zt(Le({},"__esModule",{value:!0}),e);var Qn={};Qt(Qn,{highlightPin:()=>pe,mount:()=>Kn});var H="data-builder-sdk";function ie(e){return!!e?.closest?.(`[${H}]`)}function Je(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,o={tag:e.tagName.toLowerCase(),hint:j(e),css:nn(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},i=e.getAttribute("data-testid")??e.getAttribute("data-test-id");i&&(o.testid=i),e.id&&!et(e.id)&&(o.domId=e.id);let s=e.getAttribute("role")??rn(e);s&&(o.role=s);let l=tt(e);l&&(o.name=l);for(let[d,u]of tn(o))try{let m=document.querySelectorAll(u);m.length===1&&m[0]===e&&o.verified.push(d)}catch{}return o}function tn(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${N(e.testid)}"]`]),e.domId&&t.push(["domId",`#${N(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var Qe=.5;function Ze(e){if(e.testid){let t=oe(`[data-testid="${N(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=Xe(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=oe(`[role="${N(e.role)}"]`).filter(n=>tt(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=Xe(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=oe(e.css);if(t.length===1){let n=t[0],r=!e.hint||Te(j(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=oe(e.tag||"*").filter(n=>Te(j(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function Xe(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,o=null,i=1/0;for(let s of e){let l=s.getBoundingClientRect(),d=l.left/n-t.rect.x,u=l.top/r-t.rect.y,m=Math.hypot(d,u);t.hint&&Te(j(s),t.hint)&&(m-=.5),m<i&&([o,i]=[s,m])}return o}function oe(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!ie(t))}catch{return[]}}function nn(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!et(n.id)){t.unshift(`#${N(n.id)}`);break}let o=n.tagName.toLowerCase(),i=n.parentElement;if(!i){t.unshift(o);break}let s=Array.from(i.children).filter(l=>l.tagName===n.tagName);t.unshift(s.length>1?`${o}:nth-of-type(${s.indexOf(n)+1})`:o),n=i}return t.join(" > ").slice(0,512)}function et(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function j(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function Te(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function tt(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||j(e)).slice(0,80)}function rn(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function N(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function nt(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),o=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(o),t&&(r.href=t),o.href=e,o.href}var rt=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function T(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var z=null;function se(e={}){return z||(e.includeStyleProperties?(z=e.includeStyleProperties,z):(z=T(window.getComputedStyle(document.documentElement)),z))}function ae(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function on(e){let t=ae(e,"border-left-width"),n=ae(e,"border-right-width");return e.clientWidth+t+n}function an(e){let t=ae(e,"border-top-width"),n=ae(e,"border-bottom-width");return e.clientHeight+t+n}function Ae(e,t={}){let n=t.width||on(e),r=t.height||an(e);return{width:n,height:r}}function ot(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var k=16384;function it(e){(e.width>k||e.height>k)&&(e.width>k&&e.height>k?e.width>e.height?(e.height*=k/e.width,e.width=k):(e.width*=k/e.height,e.height=k):e.width>k?(e.height*=k/e.width,e.width=k):(e.width*=k/e.height,e.height=k))}function at(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),o=r.length,i=new Uint8Array(o);for(let s=0;s<o;s+=1)i[s]=r.charCodeAt(s);n(new Blob([i],{type:t.type?t.type:"image/png"}))})}function O(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function sn(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function st(e,t,n){let r="http://www.w3.org/2000/svg",o=document.createElementNS(r,"svg"),i=document.createElementNS(r,"foreignObject");return o.setAttribute("width",`${t}`),o.setAttribute("height",`${n}`),o.setAttribute("viewBox",`0 0 ${t} ${n}`),i.setAttribute("width","100%"),i.setAttribute("height","100%"),i.setAttribute("x","0"),i.setAttribute("y","0"),i.setAttribute("externalResourcesRequired","true"),o.appendChild(i),i.appendChild(e),sn(o)}var E=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||E(n,t)};function ln(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function cn(e,t){return se(t).map(n=>{let r=e.getPropertyValue(n),o=e.getPropertyPriority(n);return`${n}: ${r}${o?" !important":""};`}).join(" ")}function dn(e,t,n,r){let o=`.${e}:${t}`,i=n.cssText?ln(n):cn(n,r);return document.createTextNode(`${o}{${i}}`)}function lt(e,t,n,r){let o=window.getComputedStyle(e,n),i=o.getPropertyValue("content");if(i===""||i==="none")return;let s=rt();try{t.className=`${t.className} ${s}`}catch{return}let l=document.createElement("style");l.appendChild(dn(s,n,o,r)),t.appendChild(l)}function ct(e,t,n){lt(e,t,":before",n),lt(e,t,":after",n)}var dt="application/font-woff",pt="image/jpeg",pn={woff:dt,woff2:dt,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:pt,jpeg:pt,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function un(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function U(e){let t=un(e).toLowerCase();return pn[t]||""}function mn(e){return e.split(/,/)[1]}function G(e){return e.search(/^(data:)/)!==-1}function Pe(e,t){return`data:${t};base64,${e}`}async function Re(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let o=await r.blob();return new Promise((i,s)=>{let l=new FileReader;l.onerror=s,l.onloadend=()=>{try{i(n({res:r,result:l.result}))}catch(d){s(d)}},l.readAsDataURL(o)})}var Me={};function hn(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function B(e,t,n){let r=hn(e,t,n.includeQueryParams);if(Me[r]!=null)return Me[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let o;try{let i=await Re(e,n.fetchRequestInit,({res:s,result:l})=>(t||(t=s.headers.get("Content-Type")||""),mn(l)));o=Pe(i,t)}catch(i){o=n.imagePlaceholder||"";let s=`Failed to fetch resource: ${e}`;i&&(s=typeof i=="string"?i:i.message),s&&console.warn(s)}return Me[r]=o,o}async function fn(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):O(t)}async function gn(e,t){if(e.currentSrc){let i=document.createElement("canvas"),s=i.getContext("2d");i.width=e.clientWidth,i.height=e.clientHeight,s?.drawImage(e,0,0,i.width,i.height);let l=i.toDataURL();return O(l)}let n=e.poster,r=U(n),o=await B(n,r,t);return O(o)}async function bn(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await K(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function xn(e,t){return E(e,HTMLCanvasElement)?fn(e):E(e,HTMLVideoElement)?gn(e,t):E(e,HTMLIFrameElement)?bn(e,t):e.cloneNode(ut(e))}var yn=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",ut=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function vn(e,t,n){var r,o;if(ut(t))return t;let i=[];return yn(e)&&e.assignedNodes?i=T(e.assignedNodes()):E(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?i=T(e.contentDocument.body.childNodes):i=T(((o=e.shadowRoot)!==null&&o!==void 0?o:e).childNodes),i.length===0||E(e,HTMLVideoElement)||await i.reduce((s,l)=>s.then(()=>K(l,n)).then(d=>{d&&t.appendChild(d)}),Promise.resolve()),t}function wn(e,t,n){let r=t.style;if(!r)return;let o=window.getComputedStyle(e);o.cssText?(r.cssText=o.cssText,r.transformOrigin=o.transformOrigin):se(n).forEach(i=>{let s=o.getPropertyValue(i);i==="font-size"&&s.endsWith("px")&&(s=`${Math.floor(parseFloat(s.substring(0,s.length-2)))-.1}px`),E(e,HTMLIFrameElement)&&i==="display"&&s==="inline"&&(s="block"),i==="d"&&t.getAttribute("d")&&(s=`path(${t.getAttribute("d")})`),r.setProperty(i,s,o.getPropertyPriority(i))})}function En(e,t){E(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),E(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function Cn(e,t){if(E(e,HTMLSelectElement)){let r=Array.from(t.children).find(o=>e.value===o.getAttribute("value"));r&&r.setAttribute("selected","")}}function kn(e,t,n){return E(t,Element)&&(wn(e,t,n),ct(e,t,n),En(e,t),Cn(e,t)),t}async function Sn(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let i=0;i<n.length;i++){let l=n[i].getAttribute("xlink:href");if(l){let d=e.querySelector(l),u=document.querySelector(l);!d&&u&&!r[l]&&(r[l]=await K(u,t,!0))}}let o=Object.values(r);if(o.length){let i="http://www.w3.org/1999/xhtml",s=document.createElementNS(i,"svg");s.setAttribute("xmlns",i),s.style.position="absolute",s.style.width="0",s.style.height="0",s.style.overflow="hidden",s.style.display="none";let l=document.createElementNS(i,"defs");s.appendChild(l);for(let d=0;d<o.length;d++)l.appendChild(o[d]);e.appendChild(s)}return e}async function K(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>xn(r,t)).then(r=>vn(e,r,t)).then(r=>kn(e,r,t)).then(r=>Sn(r,t))}var mt=/url\((['"]?)([^'"]+?)\1\)/g,Ln=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,Tn=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function An(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function Mn(e){let t=[];return e.replace(mt,(n,r,o)=>(t.push(o),n)),t.filter(n=>!G(n))}async function Pn(e,t,n,r,o){try{let i=n?nt(t,n):t,s=U(t),l;if(o){let d=await o(i);l=Pe(d,s)}else l=await B(i,s,r);return e.replace(An(t),`$1${l}$3`)}catch{}return e}function Rn(e,{preferredFontFormat:t}){return t?e.replace(Tn,n=>{for(;;){let[r,,o]=Ln.exec(n)||[];if(!o)return"";if(o===t)return`src: ${r};`}}):e}function $e(e){return e.search(mt)!==-1}async function le(e,t,n){if(!$e(e))return e;let r=Rn(e,n);return Mn(r).reduce((i,s)=>i.then(l=>Pn(l,s,t,n)),Promise.resolve(r))}async function _(e,t,n){var r;let o=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(o){let i=await le(o,null,n);return t.style.setProperty(e,i,t.style.getPropertyPriority(e)),!0}return!1}async function $n(e,t){await _("background",e,t)||await _("background-image",e,t),await _("mask",e,t)||await _("-webkit-mask",e,t)||await _("mask-image",e,t)||await _("-webkit-mask-image",e,t)}async function In(e,t){let n=E(e,HTMLImageElement);if(!(n&&!G(e.src))&&!(E(e,SVGImageElement)&&!G(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,o=await B(r,U(r),t);await new Promise((i,s)=>{e.onload=i,e.onerror=t.onImageErrorHandler?(...d)=>{try{i(t.onImageErrorHandler(...d))}catch(u){s(u)}}:s;let l=e;l.decode&&(l.decode=i),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=o):e.href.baseVal=o})}async function Hn(e,t){let r=T(e.childNodes).map(o=>Ie(o,t));await Promise.all(r).then(()=>e)}async function Ie(e,t){E(e,Element)&&(await $n(e,t),await In(e,t),await Hn(e,t))}function ht(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(o=>{n[o]=r[o]}),e}var ft={};async function gt(e){let t=ft[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},ft[e]=t,t}async function bt(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,i=(n.match(/url\([^)]+\)/g)||[]).map(async s=>{let l=s.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),Re(l,t.fetchRequestInit,({result:d})=>(n=n.replace(s,`url(${d})`),[s,d]))});return Promise.all(i).then(()=>n)}function xt(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),o=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let d=o.exec(r);if(d===null)break;t.push(d[0])}r=r.replace(o,"");let i=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,s="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(s,"gi");for(;;){let d=i.exec(r);if(d===null){if(d=l.exec(r),d===null)break;i.lastIndex=l.lastIndex}else l.lastIndex=i.lastIndex;t.push(d[0])}return t}async function Dn(e,t){let n=[],r=[];return e.forEach(o=>{if("cssRules"in o)try{T(o.cssRules||[]).forEach((i,s)=>{if(i.type===CSSRule.IMPORT_RULE){let l=s+1,d=i.href,u=gt(d).then(m=>bt(m,t)).then(m=>xt(m).forEach(f=>{try{o.insertRule(f,f.startsWith("@import")?l+=1:o.cssRules.length)}catch(w){console.error("Error inserting rule from remote css",{rule:f,error:w})}})).catch(m=>{console.error("Error loading remote css",m.toString())});r.push(u)}})}catch(i){let s=e.find(l=>l.href==null)||document.styleSheets[0];o.href!=null&&r.push(gt(o.href).then(l=>bt(l,t)).then(l=>xt(l).forEach(d=>{s.insertRule(d,s.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",i)}}),Promise.all(r).then(()=>(e.forEach(o=>{if("cssRules"in o)try{T(o.cssRules||[]).forEach(i=>{n.push(i)})}catch(i){console.error(`Error while reading CSS rules from ${o.href}`,i)}}),n))}function Fn(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>$e(t.style.getPropertyValue("src")))}async function zn(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=T(e.ownerDocument.styleSheets),r=await Dn(n,t);return Fn(r)}function yt(e){return e.trim().replace(/["']/g,"")}function On(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(i=>{t.add(yt(i))}),Array.from(r.children).forEach(i=>{i instanceof HTMLElement&&n(i)})}return n(e),t}async function vt(e,t){let n=await zn(e,t),r=On(e);return(await Promise.all(n.filter(i=>r.has(yt(i.style.fontFamily))).map(i=>{let s=i.parentStyleSheet?i.parentStyleSheet.href:null;return le(i.cssText,s,t)}))).join(`
`)}async function wt(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await vt(e,t);if(n){let r=document.createElement("style"),o=document.createTextNode(n);r.appendChild(o),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function Un(e,t={}){let{width:n,height:r}=Ae(e,t),o=await K(e,t,!0);return await wt(o,t),await Ie(o,t),ht(o,t),await st(o,n,r)}async function Bn(e,t={}){let{width:n,height:r}=Ae(e,t),o=await Un(e,t),i=await O(o),s=document.createElement("canvas"),l=s.getContext("2d"),d=t.pixelRatio||ot(),u=t.canvasWidth||n,m=t.canvasHeight||r;return s.width=u*d,s.height=m*d,t.skipAutoScale||it(s),s.style.width=`${u}`,s.style.height=`${m}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,s.width,s.height)),l.drawImage(i,0,0,s.width,s.height),s}async function Et(e,t={}){let n=await Bn(e,t);return await at(n)}var _n="data-builder-hide",He={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},Ct=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function kt(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function St(e){return e==="video"?He.video:e==="image"?He.image:He.file}function ce(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function Lt(e=15e3){let t=await Promise.race([Et(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(H)!==null&&r?.hasAttribute?.(H)||r?.hasAttribute?.(_n))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${qn()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function qn(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function De(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}var Wn={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",apps:"Build",appAgents:"Agents",appSkills:"Skills",appIssues:"Issues",appVault:"Vault",openInTab:"Open in a new tab",dir:"ltr"},Vn={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",apps:"\u0627\u0644\u0628\u0646\u0627\u0621",appAgents:"\u0627\u0644\u0648\u0643\u0644\u0627\u0621",appSkills:"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A",appIssues:"\u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",appVault:"\u0627\u0644\u062E\u0632\u0646\u0629",openInTab:"\u0641\u062A\u062D \u0641\u064A \u062A\u0628\u0648\u064A\u0628 \u062C\u062F\u064A\u062F",dir:"rtl"};function de(e){return e.toLowerCase().startsWith("ar")?Vn:Wn}function Tt(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},o=d=>{let u=document.elementFromPoint(d.clientX,d.clientY);if(!u||ie(u)||u===document.body||u===document.documentElement){r();return}u!==n&&(r(),n=u,u.classList.add("builder-pin-hover"))},i=d=>{let u=document.elementFromPoint(d.clientX,d.clientY);if(!u||ie(u))return;d.preventDefault(),d.stopPropagation();let m=Je(u);l(),e(m,u)},s=d=>{d.key==="Escape"&&(d.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",o,!0),document.removeEventListener("click",i,!0),document.removeEventListener("keydown",s,!0)}return document.addEventListener("mousemove",o,!0),document.addEventListener("click",i,!0),document.addEventListener("keydown",s,!0),l}function pe(e){let t=Ze(e);if(!t.el||t.confidence<Qe)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var At="http://www.w3.org/2000/svg",jn={pin:["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0","M12 8a2 2 0 1 0 0 4 2 2 0 1 0 0-4"],x:["M18 6 6 18","m6 6 12 12"],paperclip:["M13.234 20.252 21 12.3a3.53 3.53 0 0 0 0-5 3.53 3.53 0 0 0-5 0L4.32 18.98a5.3 5.3 0 0 0 0 7.5 5.3 5.3 0 0 0 7.5 0l8.49-8.49"],image:["M15 8h.01","M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","m3 16 5-5c.928-.893 2.072-.893 3 0l5 5","m14 14 1-1c.928-.893 2.072-.893 3 0l3 3"],pencil:["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","m15 5 4 4"],eye:["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0","M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6"],arrowRight:["M5 12h14","m12 5 7 7-7 7"],agents:["M12 8V4H8","M2 14h2","M20 14h2","M15 13v2","M9 13v2","M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2"],skills:["M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z","M22 10v6","M6 12.5V16a6 3 0 0 0 12 0v-3.5"],issues:["M13 5h8","M13 12h8","M13 19h8","m3 17 2 2 4-4","M3 7h6v-4H3z"],vault:["M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z","M16.5 7.5h.01"],external:["M15 3h6v6","M10 14 21 3","M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"]};function A(e,t=14){let n=document.createElementNS(At,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let r of jn[e]??[]){let o=document.createElementNS(At,"path");o.setAttribute("d",r),n.appendChild(o)}return n}function $(e,t,n,r=14){e.replaceChildren(),e.appendChild(A(t,r));let o=document.createElement("span");o.textContent=n,e.appendChild(o)}function me(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let o=n[r],i=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(o);if(i){let m=i[1][0],f=[];for(r++;r<n.length&&!new RegExp(`^\\s*${m}{3,}\\s*$`).test(n[r]);)f.push(n[r]),r++;r++;let w=document.createElement("pre");w.className="md-pre";let C=document.createElement("code");i[2]&&(C.className=`lang-${i[2]}`),C.textContent=f.join(`
`),w.appendChild(C),t.appendChild(w);continue}if(!o.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(o)){t.appendChild(document.createElement("hr")),r++;continue}let s=/^\s*(#{1,6})\s+(.*)$/.exec(o);if(s){let m=Math.min(6,3+s[1].length),f=document.createElement(`h${m}`);f.className="md-h",f.appendChild(ue(s[2])),t.appendChild(f),r++;continue}if(/^\s*>\s?/.test(o)){let m=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)m.push(n[r].replace(/^\s*>\s?/,"")),r++;let f=document.createElement("blockquote");f.className="md-quote",f.appendChild(me(m.join(`
`))),t.appendChild(f);continue}let l=/^\s*[-*+]\s+/,d=/^\s*\d+[.)]\s+/;if(l.test(o)||d.test(o)){let m=!l.test(o),f=m?d:l,w=document.createElement(m?"ol":"ul");for(w.className="md-list";r<n.length&&f.test(n[r]);){let C=document.createElement("li"),x=n[r].replace(f,"");for(r++;r<n.length&&n[r].trim()&&!f.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)x+=`
`+n[r].trim(),r++;C.appendChild(ue(x)),w.appendChild(C)}t.appendChild(w);continue}let u=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r]);)u.push(n[r]),r++;if(u.length){let m=document.createElement("p");m.className="md-p",m.appendChild(ue(u.join(`
`))),t.appendChild(m)}else r++}return t}var Nn=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function ue(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=Nn.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&Pt(t,n.slice(0,r.index)),r[1]){let o=document.createElement("code");o.className="md-code",o.textContent=r[2].trim(),t.appendChild(o)}else r[3]!==void 0?t.appendChild(Mt(r[4],r[3]||r[4])):r[5]?t.appendChild(Fe("strong","md-strong",r[6])):r[7]?t.appendChild(Fe("del","md-del",r[8])):r[9]?t.appendChild(Fe("em","md-em",r[10])):r[11]&&t.appendChild(Mt(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&Pt(t,n),t}function Fe(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(ue(n)),r}function Mt(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function Pt(e,t){t.split(`
`).forEach((r,o)=>{o&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function Rt(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let o=await r.json();return{id:o.id,number:o.number,title:o.title,body:o.body??"",type:o.type,status:o.status,priority:o.priority,route:o.route??"",pageUrl:o.pageUrl??"",createdAt:o.createdAt??"",pins:o.pins??[],comments:o.comments??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function $t(e,t,n){let r=de(e),o=document.createElement("div");o.className="detail hidden";let i=null;async function s(u){o.replaceChildren(y("p","empty",r.loading));try{i=await t.get(u),l()}catch(m){o.replaceChildren(y("p","note err",String(m.message)))}}function l(){if(!i)return;let u=i;o.replaceChildren();let m=y("div","d-head",""),f=he("ghost","\u2190 "+r.onThisPage);f.addEventListener("click",n);let w=he("ghost","\u2197");w.title=r.report,w.addEventListener("click",()=>window.open(`/issues/${u.number}`,"_blank","noopener")),m.append(f,w),o.appendChild(m);let C=y("div","d-meta","");if(C.append(y("span","num",`#${u.number}`),y("span",`chip ${u.type}`,r[u.type]??u.type),y("span","chip status",u.status.replace("_"," "))),o.append(C,y("h3","d-title",u.title)),u.body){let v=y("div","d-body","");v.appendChild(me(u.body)),o.appendChild(v)}if(u.pins.length){o.appendChild(y("div","label",r.location));for(let v of u.pins){let p=y("div","d-pin","");p.appendChild(y("span","nm",`<${v.tag??"?"}>${v.name?` \u201C${v.name}\u201D`:""}`));let g=he("ghost","");g.appendChild(A("eye",14)),g.title=r.pin,g.addEventListener("click",()=>{let b=pe(v);d(b.found?`Found via ${b.by} (${Math.round(b.confidence*100)}%)`:"The pinned element is not on this page any more.",b.found?"ok":"err")}),p.appendChild(g),o.appendChild(p)}}o.appendChild(y("div","label","Comments")),u.comments.length||o.appendChild(y("p","empty","No comments yet."));for(let v of u.comments){let p=y("div","d-comment",""),g=y("p","who",v.author||"someone");v.kind==="agent"&&g.appendChild(y("span","chip agent","agent"));let b=y("div","txt","");b.appendChild(me(v.body)),p.append(g,b),o.appendChild(p)}let x=document.createElement("textarea");x.placeholder="Add a comment\u2026",x.rows=3;let S=he("primary","Comment");S.addEventListener("click",async()=>{let v=x.value.trim();if(v){S.disabled=!0;try{await t.comment(u.number,v),x.value="",await s(u.number)}catch(p){d(String(p.message),"err")}finally{S.disabled=!1}}}),o.append(x,S)}function d(u,m){let f=y("p",`note ${m}`,u);o.appendChild(f),setTimeout(()=>f.remove(),4e3)}return{el:o,load:s,destroy:()=>o.remove()}}function y(e,t,n){let r=document.createElement(e);return r.className=t,n&&(r.textContent=n),r}function he(e,t){let n=document.createElement("button");return n.type="button",n.className=e,n.textContent=t,n}var It=`
:host {
  --bg: #ffffff;
  --surface: #f6f7f9;
  --border: #e2e5ea;
  --text: #16191d;
  --muted: #6b7280;
  --accent: #4f46e5;
  --accent-fg: #ffffff;
  --danger: #b42318;
  --radius: 10px;
  --shadow: 0 1px 2px rgba(0,0,0,.06), 0 12px 32px -12px rgba(0,0,0,.25);
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  all: initial;
  font-family: var(--font);
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --bg: #16181d; --surface: #1e2127; --border: #2c313a;
    --text: #e9ebef; --muted: #9099a6;
    --shadow: 0 1px 2px rgba(0,0,0,.5), 0 12px 32px -12px rgba(0,0,0,.7);
  }
}
:host([data-theme="dark"]) {
  --bg: #16181d; --surface: #1e2127; --border: #2c313a;
  --text: #e9ebef; --muted: #9099a6;
  --shadow: 0 1px 2px rgba(0,0,0,.5), 0 12px 32px -12px rgba(0,0,0,.7);
}

* { box-sizing: border-box; }
button { font: inherit; cursor: pointer; }

/* ---- floating action button ---- */
/* The launcher button.
   Trimmed from a 14px/10-16 pill to a compact one: this sits on top of
   somebody's product all day, so it should read as a tool at the edge of the
   screen rather than as a call to action in the middle of their design. */
.fab {
  position: fixed; z-index: 2147483645;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; border: 0; border-radius: 999px;
  background: var(--accent); color: var(--accent-fg);
  font-size: 12.5px; font-weight: 600; line-height: 1;
  box-shadow: var(--shadow);
  touch-action: none;                 /* let pointer events drive the drag */
  user-select: none;
  transition: transform .12s ease, box-shadow .12s ease;
}
.fab:hover { transform: translateY(-1px); }
.fab:active { cursor: grabbing; }
.fab:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
/* The count.
   place-items alone centred the box but not the digit: the badge inherited the
   button's line-height:1 and the glyph sat high in the circle. An explicit
   line-height and tabular figures put the number in the middle and keep it
   there when it goes from 9 to 10. */
.fab .count {
  min-width: 17px; height: 17px; padding: 0 4px;
  box-sizing: border-box;
  border-radius: 999px; background: rgba(255,255,255,.24);
  font-size: 10.5px; font-weight: 700;
  line-height: 17px;
  font-variant-numeric: tabular-nums;
  display: inline-flex; align-items: center; justify-content: center;
}
.fab-ico svg { width: 13px; height: 13px; }

/* ---- app launcher ---- */
.apps { margin-top: 14px; }
.appgrid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
}
.app {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 4px; border: 1px solid var(--border); border-radius: 12px;
  background: transparent; color: var(--text);
  font-size: 11px; font-weight: 500; line-height: 1.2; text-align: center;
  cursor: pointer;
  transition: transform .15s ease, border-color .15s ease, background .15s ease;
}
.app:hover { transform: translateY(-2px); border-color: var(--accent); }
.app:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* The tile's own colour, set per app from JS. Kept to the icon chip so four
   saturated tiles never compete with the panel's own content. */
.app-ico {
  width: 34px; height: 34px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
}
.app-ico svg { width: 18px; height: 18px; }

/* ---- full-screen overlay hosting a builder screen ---- */
.ov {
  position: fixed; inset: 0; z-index: 2147483646;   /* above the panel */
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  opacity: 0; pointer-events: none;
  transition: opacity .16s ease;
}
.ov[data-open="true"] { opacity: 1; pointer-events: auto; }
.ov-head {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.ov-ico { display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 8px; }
.ov-ico svg { width: 16px; height: 16px; }
.ov-title { margin: 0; font-size: 14px; font-weight: 600; }
.ov-tab, .ov-x {
  border: 0; background: transparent; color: var(--muted);
  cursor: pointer; padding: 6px; border-radius: 8px; display: inline-flex;
}
.ov-tab { margin-inline-start: auto; text-decoration: none; }
.ov-tab:hover, .ov-x:hover { color: var(--text); background: var(--border); }
.ov-frame { flex: 1 1 auto; width: 100%; border: 0; display: block; }

@media (prefers-reduced-motion: reduce) {
  .app, .ov { transition: none; }
  .app:hover { transform: none; }
}

/* ---- slide-over panel ---- */
.panel {
  position: fixed; inset-block: 0; inset-inline-end: 0; z-index: 2147483645;
  width: min(420px, 100vw);
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border-inline-start: 1px solid var(--border);
  box-shadow: var(--shadow);
  transform: translateX(var(--slide, 100%));
  transition: transform .18s ease, width .18s ease;
}
:host([dir="rtl"]) .panel { --slide: -100%; }
.panel[data-open="true"] { --slide: 0 !important; }
/* A single issue's title, body, pin and comment thread need more room to read
   and to type a reply into than the listing's scannable row of short titles. */
.panel[data-detail="true"] { width: min(640px, 100vw); }

.head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; border-bottom: 1px solid var(--border);
}
.head h2 { margin: 0; font-size: 15px; font-weight: 650; }
.x {
  border: 0; background: transparent; color: var(--muted);
  font-size: 18px; line-height: 1; padding: 4px 6px; border-radius: 6px;
}
.x:hover { background: var(--surface); color: var(--text); }

.body { padding: 18px; overflow-y: auto; flex: 1; }
.intro { margin: 0 0 16px; font-size: 13px; line-height: 1.55; color: var(--muted); }

.primary {
  width: 100%; padding: 11px 16px; border: 0; border-radius: var(--radius);
  background: var(--accent); color: var(--accent-fg);
  font-size: 14px; font-weight: 600;
}
.primary:disabled { opacity: .55; cursor: default; }

.label {
  margin: 22px 0 10px; font-size: 10.5px; font-weight: 650;
  letter-spacing: .09em; text-transform: uppercase; color: var(--muted);
}

/* ---- issue rows ---- */
.rows { display: flex; flex-direction: column; gap: 6px; }
.row {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 11px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--surface);
  font-size: 13px; text-align: start; color: var(--text); width: 100%;
}
.row:hover { border-color: var(--accent); }
.row .num { color: var(--muted); font-variant-numeric: tabular-nums; flex: none; }
.row .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip {
  flex: none; padding: 2px 7px; border-radius: 5px;
  font-size: 10.5px; font-weight: 650; text-transform: capitalize;
}
.chip.bug { background: #fde8e6; color: #b42318; }
.chip.feature { background: #e6edfd; color: #2c4fd6; }
.chip.question { background: #fdf3d7; color: #8a6100; }
.chip.discussion { background: #efe6fd; color: #6b34c8; }
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) .chip.bug { background: #3a1c19; color: #f5a79b; }
  :host(:not([data-theme="light"])) .chip.feature { background: #1a2547; color: #9db4f5; }
  :host(:not([data-theme="light"])) .chip.question { background: #3a2f13; color: #e8c66a; }
  :host(:not([data-theme="light"])) .chip.discussion { background: #2b1f42; color: #c4a4f2; }
}
/* An agent holds a lease on this issue. */
.spin {
  flex: none; width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid var(--border); border-top-color: var(--accent);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; border-top-color: var(--border); }
  .panel { transition: none; }
}
.empty { font-size: 13px; color: var(--muted); padding: 6px 0; }

/* ---- report form ---- */
.pills { display: flex; flex-wrap: wrap; gap: 7px; }
.pill {
  padding: 6px 13px; border-radius: 999px; font-size: 12.5px;
  border: 1px solid var(--border); background: var(--bg); color: var(--muted);
}
.pill[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); font-weight: 600; }

input[type="text"], textarea {
  width: 100%; padding: 9px 11px; font: inherit; font-size: 13.5px;
  color: var(--text); background: var(--bg);
  border: 1px solid var(--border); border-radius: 8px;
}
input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: var(--accent); }
input:disabled { color: var(--muted); background: var(--surface); }
textarea { min-height: 96px; resize: vertical; }

.btns { display: flex; flex-wrap: wrap; gap: 8px; }
.ghost {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 12.5px;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--text);
}
.ghost:hover { border-color: var(--accent); color: var(--accent); }
.ghost[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }

.files { display: flex; flex-direction: column; gap: 5px; margin-top: 9px; }
.file {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--muted);
  padding: 6px 9px; background: var(--surface);
  border: 1px solid var(--border); border-radius: 7px;
}
.file .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file button { border: 0; background: transparent; color: var(--muted); padding: 0 3px; }
.thumb { width: 32px; height: 32px; flex: none; border-radius: 5px; object-fit: cover; border: 1px solid var(--border); }

/* Confirms what got pinned, right under the button that captured it \u2014 the
   button's own label truncates the tag, this shows the accessible name too. */
.pin-preview {
  margin-top: 8px; padding: 7px 10px; font-size: 12px; color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--surface); border: 1px solid var(--border); border-radius: 7px;
  overflow-wrap: anywhere; word-break: break-word;
}

.note { font-size: 12px; margin-top: 10px; }
.note.err { color: var(--danger); }
.note.ok { color: var(--accent); }
.foot { padding: 14px 18px; border-top: 1px solid var(--border); }
.hidden { display: none !important; }

/* ---- in-panel issue detail ---- */
.detail { display: flex; flex-direction: column; gap: 10px; }
.d-head { display: flex; align-items: center; justify-content: space-between; }
.d-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.d-title { margin: 2px 0 0; font-size: 15.5px; font-weight: 650; line-height: 1.35; }
.d-body { margin: 0; font-size: 13.5px; line-height: 1.6;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 8px; padding: 10px 12px; }
.d-pin { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px;
         background: var(--surface); border: 1px solid var(--border);
         border-radius: 7px; padding: 7px 10px; }
/* min-width:0 lets the flex item shrink below its content width \u2014 without it
   a long accessible name (the pinned node's whole text) forces the panel wider
   and the WHOLE slide-over scrolls sideways. */
.d-pin .nm { flex: 1; min-width: 0; font-family: ui-monospace, monospace;
             overflow-wrap: anywhere; word-break: break-word; }
.d-comment { border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; }
.d-comment .who { margin: 0 0 4px; font-size: 11.5px; font-weight: 600; color: var(--muted);
                  display: flex; align-items: center; gap: 6px; }
.d-comment .txt { margin: 0; font-size: 13px; line-height: 1.55; white-space: pre-wrap; }
.chip.status { background: var(--surface-2, var(--surface)); color: var(--muted); }
.chip.agent { background: var(--accent); color: var(--accent-fg); }

/* \u2500\u2500 moved here from HOST_CSS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   These style elements INSIDE the shadow root, so they must live in CSS.
   Appending them to the end of this file put them in HOST_CSS, which is
   injected into the host document \u2014 where none of these selectors exist.
   The markdown still rendered (the DOM was right) but with UA styling only,
   which is exactly the kind of bug that looks fine in a screenshot. */
/* \u2500\u2500 rendered markdown (see markdown.ts) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
.md-p { margin: 0 0 8px; line-height: 1.55; }
.md-p:last-child { margin-bottom: 0; }
.md-h { margin: 12px 0 6px; font-size: 13px; font-weight: 600; line-height: 1.35; color: var(--text); }
.md-h:first-child { margin-top: 0; }
.md-list { margin: 0 0 8px; padding-inline-start: 20px; }
.md-list li { margin: 2px 0; line-height: 1.5; }
.md-list:last-child { margin-bottom: 0; }
.md-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 4px; padding: 1px 4px;
}
.md-pre {
  margin: 0 0 8px; padding: 9px 11px; overflow-x: auto;
  border-radius: 8px; background: var(--bg); border: 1px solid var(--border);
}
.md-pre:last-child { margin-bottom: 0; }
.md-pre code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px; line-height: 1.5; white-space: pre;
  background: none; border: 0; padding: 0;
}
.md-quote {
  margin: 0 0 8px; padding: 2px 0 2px 10px; color: var(--muted);
  border-inline-start: 2px solid var(--border);
}
.md-quote .md-p:last-child { margin-bottom: 0; }
.md-strong { font-weight: 600; }
.md-em { font-style: italic; }
.md-del { opacity: .65; }
.md-a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.d-body hr, .txt hr { margin: 10px 0; border: 0; border-top: 1px solid var(--border); }
.txt { margin: 0; font-size: 13px; }

/* Link out to the full board from the on-this-page listing. */
.board-link {
  display: inline-block; margin-top: 10px; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 8px;
  font-size: 12.5px; color: var(--text); text-decoration: none;
  background: var(--bg);
}
.board-link:hover { border-color: var(--accent); color: var(--accent); }

/* "who is working on this" \u2014 a spinner plus the agent's name. */
.agent-tag {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  max-width: 42%; padding: 2px 7px 2px 5px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--border);
}
.agent-tag .who {
  font-size: 11px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.agent-tag .spin { width: 10px; height: 10px; border-width: 1.5px; flex: none; }

/* Inline SVG icons (see icons.ts). Sized in em so they track the label they
   sit beside, and flex:none so a long label never squashes them. */
.ico { flex: none; width: 1em; height: 1em; }
button .ico, a .ico { margin-inline-end: 2px; vertical-align: -0.125em; }
.fab-ico { display: inline-flex; align-items: center; }
.board-link { display: inline-flex; align-items: center; gap: 6px; }
.pin-btn, .addfile, .shot, .clear-pin {
  display: inline-flex; align-items: center; gap: 6px;
}
`,Ht=`
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

`;function Dt(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let o=await r.json().catch(()=>null);return Array.isArray(o?.issues)?o.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??""}));for(let s of n.attachments)r.append("attachments",s.blob,s.name),r.append("attachment_kinds",s.kind);let o=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!o.ok){let s=await o.text().catch(()=>"");throw new Error(s||`submit failed (${o.status})`)}let i=await o.json();return{id:String(i.id??""),number:Number(i.number??0)}}}}var Ft="builder.fab.position",Gn=["bug","feature","question","discussion"];function Kn(e={}){let t=de(e.locale??document.documentElement.lang??"en"),n=e.transport??Dt(e.apiBase),r=e.locale??"en",o=document.createElement("div");o.setAttribute(H,""),o.setAttribute("dir",t.dir),e.theme&&o.setAttribute("data-theme",e.theme),document.body.appendChild(o);let i=o.attachShadow({mode:"open"}),s=document.createElement("style");s.textContent=It+(e.accent?`:host{--accent:${Jn(e.accent)}}`:""),i.appendChild(s);let l=document.createElement("style");l.setAttribute(H,""),l.textContent=Ht,document.head.appendChild(l);let d=[],u=[],m=[],f="bug",w=!1,C=!1,x=null,S=null,v=document.createElement("div");v.innerHTML=`
    <button class="fab" part="fab" aria-haspopup="dialog" aria-expanded="false">
      <span class="fab-ico"></span><span class="fab-label"></span><span class="count hidden"></span>
    </button>
    <aside class="panel" role="dialog" aria-modal="false" data-open="false">
      <div class="head"><h2></h2><button class="x" aria-label=""></button></div>
      <div class="body">
        <p class="intro"></p>
        <button class="primary report"></button>

        <!-- The builder's own screens, as an app launcher.
             These used to be four permanent items in the product's sidebar.
             They belong to the tooling, not to the app being built, so they
             live behind this button and open as a layer over the page. -->
        <div class="apps">
          <div class="label lbl-apps"></div>
          <div class="appgrid"></div>
        </div>

        <form class="form hidden" novalidate>
          <div class="label lbl-type"></div>
          <div class="pills"></div>

          <div class="label lbl-title"></div>
          <input type="text" name="title" maxlength="255" required>

          <div class="label lbl-details"></div>
          <textarea name="body"></textarea>

          <div class="label lbl-url"></div>
          <input type="text" name="url" disabled>

          <div class="label lbl-loc"></div>
          <div class="btns">
            <button type="button" class="ghost pin" aria-pressed="false"></button>
            <button type="button" class="ghost clearpin hidden"></button>
          </div>
          <div class="pin-preview hidden"></div>

          <div class="label lbl-att"></div>
          <div class="btns">
            <button type="button" class="ghost addfile"></button>
            <button type="button" class="ghost shot"></button>
          </div>
          <div class="files"></div>
          <input type="file" class="filein hidden" multiple accept="${Ct}">

          <p class="note hidden"></p>
        </form>

        <div class="listing">
          <div class="label lbl-page"></div>
          <div class="rows"></div>
          <!-- The panel shows only issues for THIS page. Getting to the full
               board previously meant knowing the /issues URL by heart. -->
          <a class="board-link" href="/issues" target="_blank" rel="noopener"></a>
        </div>
      </div>
      <div class="foot hidden"><button type="submit" class="primary send"></button></div>
    </aside>

    <!-- The overlay that hosts a builder screen.
         An iframe on the same origin rather than a re-implementation: these
         are the real pages, with the real session cookie, and keeping one copy
         of them is the entire point of moving them out of the sidebar. -->
    <div class="ov" data-open="false" role="dialog" aria-modal="true" aria-label="">
      <div class="ov-head">
        <span class="ov-ico"></span>
        <h2 class="ov-title"></h2>
        <a class="ov-tab" target="_blank" rel="noopener" aria-label=""></a>
        <button class="ov-x" aria-label=""></button>
      </div>
      <iframe class="ov-frame" title=""></iframe>
    </div>`,i.appendChild(v);let p=a=>i.querySelector(a),g=p(".fab"),b=p(".panel"),Y=p(".form"),fe=p(".listing"),ze=p(".foot"),X=p(".rows"),ge=p(".pills"),be=p(".note"),Oe=p(".files"),J=p(".filein"),Ue=p(".count"),zt=p(".appgrid"),xe=p(".ov"),ye=p(".ov-frame"),Ot=p(".ov-title"),Q=p(".ov-ico"),ve=p(".ov-tab"),we=p(".ov-x"),Z=p('input[name="title"]'),Be=p('textarea[name="body"]'),Ut=p('input[name="url"]'),M=p(".pin"),Ee=p(".clearpin"),_e=p(".pin-preview"),D=p(".send"),ee=new WeakMap;function Bt(a){let c=ee.get(a);return c||(c=URL.createObjectURL(a.blob),ee.set(a,c)),c}function Ce(a){let c=ee.get(a);c&&(URL.revokeObjectURL(c),ee.delete(a))}p(".fab-label").textContent=t.fab,p("h2").textContent=t.title,p(".fab-ico").replaceChildren(A("pencil",15)),p(".x").replaceChildren(A("x",15)),p(".x").setAttribute("aria-label",t.close),p(".intro").textContent=t.intro,p(".report").textContent=t.report,p(".lbl-type").textContent=t.type,p(".lbl-title").textContent=t.titleLabel,p(".lbl-details").textContent=t.details,p(".lbl-url").textContent=t.pageUrl,p(".lbl-loc").textContent=t.location,p(".lbl-att").textContent=t.attachments,p(".lbl-page").textContent=t.onThisPage,$(p(".board-link"),"arrowRight",t.openBoard),p(".lbl-apps").textContent=t.apps,we.setAttribute("aria-label",t.close),we.appendChild(A("x",16)),ve.setAttribute("aria-label",t.openInTab),ve.appendChild(A("external",15)),Z.placeholder=t.titlePlaceholder,Be.placeholder=t.detailsPlaceholder,$(M,"pin",t.pin),$(Ee,"x",t.clear),$(p(".addfile"),"paperclip",t.addFile),$(p(".shot"),"image",t.screenshot),D.textContent=t.submit;for(let a of Gn){let c=document.createElement("button");c.type="button",c.className="pill",c.dataset.type=a,c.textContent=t[a],c.setAttribute("aria-pressed",String(a===f)),c.addEventListener("click",()=>{f=a,ge.querySelectorAll(".pill").forEach(h=>h.setAttribute("aria-pressed",String(h.dataset.type===a)))}),ge.appendChild(c)}let _t=4,L=null,ke=(a,c)=>{let h=Math.max(8,Math.min(a,window.innerWidth-80)),R=Math.max(8,Math.min(c,window.innerHeight-48));g.style.insetInlineEnd=`${h}px`,g.style.insetBlockEnd=`${R}px`},qe=Yn();ke(qe?.right??e.position?.right??24,qe?.bottom??e.position?.bottom??24),g.addEventListener("pointerdown",a=>{if(a.button!==0)return;let c=g.getBoundingClientRect();L={x:a.clientX,y:a.clientY,ox:window.innerWidth-c.right,oy:window.innerHeight-c.bottom,moved:!1},g.setPointerCapture(a.pointerId)}),g.addEventListener("pointermove",a=>{if(!L)return;let c=a.clientX-L.x,h=a.clientY-L.y;!L.moved&&Math.hypot(c,h)<_t||(L.moved=!0,ke(L.ox-c,L.oy-h))}),g.addEventListener("pointerup",a=>{if(!L)return;let c=L.moved;if(L=null,g.releasePointerCapture(a.pointerId),c){let h=g.getBoundingClientRect();Xn(window.innerWidth-h.right,window.innerHeight-h.bottom);return}We()}),g.addEventListener("keydown",a=>{(a.key==="Enter"||a.key===" ")&&(a.preventDefault(),We())}),window.addEventListener("resize",()=>{let a=g.getBoundingClientRect();ke(window.innerWidth-a.right,window.innerHeight-a.bottom)});function We(){b.dataset.open==="true"?F():Ve()}function Ve(){b.dataset.open="true",g.setAttribute("aria-expanded","true"),Ut.value=location.href,W()}function F(){b.dataset.open="false",b.dataset.detail="false",g.setAttribute("aria-expanded","false"),Se(!1),x?.(),x=null}let qt=[{key:"agents",path:"/agents",color:"#8b5cf6",label:t.appAgents},{key:"skills",path:"/skills",color:"#06b6d4",label:t.appSkills},{key:"issues",path:"/issues",color:"#f59e0b",label:t.appIssues},{key:"vault",path:"/vault",color:"#10b981",label:t.appVault}];function Wt(){let a=(e.apiBase??"").trim();if(!a)return"";try{return new URL(a,location.href).origin}catch{return""}}let je=(a,c)=>`${Wt()}${a}${c?"?embed=1":""}`;for(let a of qt){let c=document.createElement("button");c.type="button",c.className="app",c.dataset.app=a.key;let h=document.createElement("span");h.className="app-ico",h.style.background=`${a.color}38`,h.style.color=a.color,h.appendChild(A(a.key,18));let R=document.createElement("span");R.textContent=a.label,c.append(h,R),c.addEventListener("click",()=>Vt(a)),zt.appendChild(c)}let q=null;function Vt(a){ye.src=je(a.path,!0),ye.title=a.label,Ot.textContent=a.label,ve.href=je(a.path,!1),xe.setAttribute("aria-label",a.label),Q.textContent="",Q.style.background=`${a.color}38`,Q.style.color=a.color,Q.appendChild(A(a.key,16)),xe.dataset.open="true",F(),q=c=>{c.key==="Escape"&&Ne()},document.addEventListener("keydown",q)}function Ne(){xe.dataset.open="false",ye.src="about:blank",q&&document.removeEventListener("keydown",q),q=null}we.addEventListener("click",Ne),p(".x").addEventListener("click",F),i.addEventListener("keydown",a=>{a.key==="Escape"&&!x&&F()});function Ge(a){b.dataset.open!=="true"||x||a.composedPath().includes(o)||F()}document.addEventListener("click",Ge,!0);function Se(a){w=a,Y.classList.toggle("hidden",!a),fe.classList.toggle("hidden",a),ze.classList.toggle("hidden",!a),p(".report").classList.toggle("hidden",a),a?setTimeout(()=>Z.focus(),30):jt()}p(".report").addEventListener("click",()=>Se(!0));function jt(){Y.reset(),u=[],m.forEach(Ce),m=[],f="bug",ge.querySelectorAll(".pill").forEach(a=>a.setAttribute("aria-pressed",String(a.dataset.type==="bug"))),te(),ne(),P("")}function P(a,c=""){be.textContent=a,be.className=`note ${c}`.trim(),be.classList.toggle("hidden",!a)}M.addEventListener("click",()=>{if(x){x(),x=null,M.setAttribute("aria-pressed","false"),$(M,"pin",t.pin);return}b.dataset.open="false",M.setAttribute("aria-pressed","true"),M.textContent=t.pinning,x=Tt((a,c)=>{u=[a],x=null,b.dataset.open="true",te(),c.classList.add("builder-pin-found"),setTimeout(()=>c.classList.remove("builder-pin-found"),3e3)},()=>{x=null,b.dataset.open="true",te()})}),Ee.addEventListener("click",()=>{u=[],te()});function te(){let a=u.length>0;if(M.setAttribute("aria-pressed",String(a)),$(M,"pin",a?t.pinned(u[0].tag??"?"):t.pin),Ee.classList.toggle("hidden",!a),_e.classList.toggle("hidden",!a),a){let c=u[0],h=c.name||c.hint||"";_e.textContent=`<${c.tag??"?"}>${h?` \u201C${h}\u201D`:""}`}}p(".addfile").addEventListener("click",()=>J.click()),J.addEventListener("change",()=>{for(let a of Array.from(J.files??[]))Nt(a);J.value=""});function Nt(a){let c=kt(a.type),h=St(c);if(a.size>h){P(`${a.name} is ${ce(a.size)} \u2014 the limit is ${ce(h)}.`,"err");return}m.push({name:a.name,mime:a.type,size:a.size,kind:c,blob:a}),ne(),P("")}p(".shot").addEventListener("click",async()=>{let a=p(".shot");a.disabled=!0;let c=b.dataset.open;b.dataset.open="false",o.style.visibility="hidden";try{await new Promise(h=>setTimeout(h,120)),m.push(await Lt()),ne(),P("")}catch(h){P(String(h.message||h),"err")}finally{o.style.visibility="",b.dataset.open=c??"true",a.disabled=!1}});function ne(){Oe.replaceChildren(),m.forEach((a,c)=>{let h=document.createElement("div");if(h.className="file",a.kind==="screenshot"||a.kind==="image"){let re=document.createElement("img");re.className="thumb",re.src=Bt(a),re.alt="",h.appendChild(re)}let R=document.createElement("span");R.className="nm",R.textContent=a.name;let Ye=document.createElement("span");Ye.textContent=ce(a.size);let V=document.createElement("button");V.type="button",V.replaceChildren(A("x",12)),V.setAttribute("aria-label",t.clear),V.addEventListener("click",()=>{Ce(a),m.splice(c,1),ne()}),h.append(R,Ye,V),Oe.appendChild(h)})}async function Ke(){if(C)return;let a=Z.value.trim();if(!a){P(t.titleRequired,"err"),Z.focus();return}C=!0,D.disabled=!0,D.textContent=t.submitting;try{let c=await n.create({type:f,title:a,body:Be.value,route:De(),pageUrl:location.href,locale:r,pins:u,attachments:m});P(t.created(c.number),"ok"),e.onCreated?.(c),setTimeout(()=>{Se(!1),W()},900)}catch(c){P(String(c.message||t.failed),"err")}finally{C=!1,D.disabled=!1,D.textContent=t.submit}}D.addEventListener("click",Ke),Y.addEventListener("submit",a=>{a.preventDefault(),Ke()});async function W(){if(!w){X.replaceChildren(I("div","empty",t.loading));try{d=await n.listByRoute(De())}catch{d=[]}if(Ue.textContent=d.length>9?"9+":String(d.length),Ue.classList.toggle("hidden",d.length===0),p(".lbl-page").textContent=d.length?t.issueCount(d.length):t.onThisPage,X.replaceChildren(),!d.length){X.appendChild(I("div","empty",t.none));return}for(let a of d){let c=document.createElement("button");if(c.type="button",c.className="row",c.append(I("span","num",`#${a.number}`),I("span",`chip ${a.type}`,t[a.type])),c.appendChild(I("span","t",a.title)),a.busy){let h=I("span","agent-tag","");h.appendChild(I("span","spin","")),h.appendChild(I("span","who",a.agent||t.agentWorking)),h.setAttribute("title",a.agent?t.agentWorkingBy(a.agent):t.agentWorking),c.appendChild(h)}c.addEventListener("click",()=>void Gt(a.number)),X.appendChild(c)}}}async function Gt(a){S||(S=$t(r,Rt(e.apiBase),()=>{S?.el.classList.add("hidden"),fe.classList.remove("hidden"),p(".report").classList.remove("hidden"),b.dataset.detail="false",W()}),p(".body").appendChild(S.el)),fe.classList.add("hidden"),p(".report").classList.add("hidden"),Y.classList.add("hidden"),ze.classList.add("hidden"),S.el.classList.remove("hidden"),b.dataset.detail="true",await S.load(a)}let Kt={open:Ve,close:F,refresh:()=>void W(),destroy(){x?.(),m.forEach(Ce),document.removeEventListener("click",Ge,!0),o.remove(),l.remove()}};return W(),Kt}function I(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function Yn(){try{let e=localStorage.getItem(Ft);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function Xn(e,t){try{localStorage.setItem(Ft,JSON.stringify({right:e,bottom:t}))}catch{}}function Jn(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return en(Qn);})();
