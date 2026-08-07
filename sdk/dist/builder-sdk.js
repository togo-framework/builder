"use strict";var BuilderIssues=(()=>{var be=Object.defineProperty;var Rt=Object.getOwnPropertyDescriptor;var $t=Object.getOwnPropertyNames;var Mt=Object.prototype.hasOwnProperty;var It=(e,t)=>{for(var n in t)be(e,n,{get:t[n],enumerable:!0})},Dt=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of $t(t))!Mt.call(e,i)&&i!==n&&be(e,i,{get:()=>t[i],enumerable:!(r=Rt(t,i))||r.enumerable});return e};var Ht=e=>Dt(be({},"__esModule",{value:!0}),e);var In={};It(In,{highlightPin:()=>se,mount:()=>Pn});var M="data-builder-sdk";function te(e){return!!e?.closest?.(`[${M}]`)}function Oe(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,i={tag:e.tagName.toLowerCase(),hint:W(e),css:zt(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},o=e.getAttribute("data-testid")??e.getAttribute("data-test-id");o&&(i.testid=o),e.id&&!_e(e.id)&&(i.domId=e.id);let a=e.getAttribute("role")??Ot(e);a&&(i.role=a);let l=qe(e);l&&(i.name=l);for(let[c,d]of Ft(i))try{let p=document.querySelectorAll(d);p.length===1&&p[0]===e&&i.verified.push(c)}catch{}return i}function Ft(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${V(e.testid)}"]`]),e.domId&&t.push(["domId",`#${V(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var Be=.5;function Ue(e){if(e.testid){let t=ee(`[data-testid="${V(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=ze(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=ee(`[role="${V(e.role)}"]`).filter(n=>qe(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=ze(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=ee(e.css);if(t.length===1){let n=t[0],r=!e.hint||xe(W(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=ee(e.tag||"*").filter(n=>xe(W(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function ze(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,i=null,o=1/0;for(let a of e){let l=a.getBoundingClientRect(),c=l.left/n-t.rect.x,d=l.top/r-t.rect.y,p=Math.hypot(c,d);t.hint&&xe(W(a),t.hint)&&(p-=.5),p<o&&([i,o]=[a,p])}return i}function ee(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!te(t))}catch{return[]}}function zt(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!_e(n.id)){t.unshift(`#${V(n.id)}`);break}let i=n.tagName.toLowerCase(),o=n.parentElement;if(!o){t.unshift(i);break}let a=Array.from(o.children).filter(l=>l.tagName===n.tagName);t.unshift(a.length>1?`${i}:nth-of-type(${a.indexOf(n)+1})`:i),n=o}return t.join(" > ").slice(0,512)}function _e(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function W(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function xe(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function qe(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||W(e)).slice(0,80)}function Ot(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function V(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function We(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),i=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(i),t&&(r.href=t),i.href=e,i.href}var Ve=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function T(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var H=null;function re(e={}){return H||(e.includeStyleProperties?(H=e.includeStyleProperties,H):(H=T(window.getComputedStyle(document.documentElement)),H))}function ne(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function Bt(e){let t=ne(e,"border-left-width"),n=ne(e,"border-right-width");return e.clientWidth+t+n}function Ut(e){let t=ne(e,"border-top-width"),n=ne(e,"border-bottom-width");return e.clientHeight+t+n}function ye(e,t={}){let n=t.width||Bt(e),r=t.height||Ut(e);return{width:n,height:r}}function Ne(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var S=16384;function je(e){(e.width>S||e.height>S)&&(e.width>S&&e.height>S?e.width>e.height?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S):e.width>S?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S))}function Ge(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),i=r.length,o=new Uint8Array(i);for(let a=0;a<i;a+=1)o[a]=r.charCodeAt(a);n(new Blob([o],{type:t.type?t.type:"image/png"}))})}function F(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function _t(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function Ke(e,t,n){let r="http://www.w3.org/2000/svg",i=document.createElementNS(r,"svg"),o=document.createElementNS(r,"foreignObject");return i.setAttribute("width",`${t}`),i.setAttribute("height",`${n}`),i.setAttribute("viewBox",`0 0 ${t} ${n}`),o.setAttribute("width","100%"),o.setAttribute("height","100%"),o.setAttribute("x","0"),o.setAttribute("y","0"),o.setAttribute("externalResourcesRequired","true"),i.appendChild(o),o.appendChild(e),_t(i)}var E=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||E(n,t)};function qt(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function Wt(e,t){return re(t).map(n=>{let r=e.getPropertyValue(n),i=e.getPropertyPriority(n);return`${n}: ${r}${i?" !important":""};`}).join(" ")}function Vt(e,t,n,r){let i=`.${e}:${t}`,o=n.cssText?qt(n):Wt(n,r);return document.createTextNode(`${i}{${o}}`)}function Ye(e,t,n,r){let i=window.getComputedStyle(e,n),o=i.getPropertyValue("content");if(o===""||o==="none")return;let a=Ve();try{t.className=`${t.className} ${a}`}catch{return}let l=document.createElement("style");l.appendChild(Vt(a,n,i,r)),t.appendChild(l)}function Xe(e,t,n){Ye(e,t,":before",n),Ye(e,t,":after",n)}var Je="application/font-woff",Qe="image/jpeg",Nt={woff:Je,woff2:Je,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:Qe,jpeg:Qe,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function jt(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function z(e){let t=jt(e).toLowerCase();return Nt[t]||""}function Gt(e){return e.split(/,/)[1]}function N(e){return e.search(/^(data:)/)!==-1}function ve(e,t){return`data:${t};base64,${e}`}async function Ee(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let i=await r.blob();return new Promise((o,a)=>{let l=new FileReader;l.onerror=a,l.onloadend=()=>{try{o(n({res:r,result:l.result}))}catch(c){a(c)}},l.readAsDataURL(i)})}var we={};function Kt(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function O(e,t,n){let r=Kt(e,t,n.includeQueryParams);if(we[r]!=null)return we[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let i;try{let o=await Ee(e,n.fetchRequestInit,({res:a,result:l})=>(t||(t=a.headers.get("Content-Type")||""),Gt(l)));i=ve(o,t)}catch(o){i=n.imagePlaceholder||"";let a=`Failed to fetch resource: ${e}`;o&&(a=typeof o=="string"?o:o.message),a&&console.warn(a)}return we[r]=i,i}async function Yt(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):F(t)}async function Xt(e,t){if(e.currentSrc){let o=document.createElement("canvas"),a=o.getContext("2d");o.width=e.clientWidth,o.height=e.clientHeight,a?.drawImage(e,0,0,o.width,o.height);let l=o.toDataURL();return F(l)}let n=e.poster,r=z(n),i=await O(n,r,t);return F(i)}async function Jt(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await j(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function Qt(e,t){return E(e,HTMLCanvasElement)?Yt(e):E(e,HTMLVideoElement)?Xt(e,t):E(e,HTMLIFrameElement)?Jt(e,t):e.cloneNode(Ze(e))}var Zt=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",Ze=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function en(e,t,n){var r,i;if(Ze(t))return t;let o=[];return Zt(e)&&e.assignedNodes?o=T(e.assignedNodes()):E(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?o=T(e.contentDocument.body.childNodes):o=T(((i=e.shadowRoot)!==null&&i!==void 0?i:e).childNodes),o.length===0||E(e,HTMLVideoElement)||await o.reduce((a,l)=>a.then(()=>j(l,n)).then(c=>{c&&t.appendChild(c)}),Promise.resolve()),t}function tn(e,t,n){let r=t.style;if(!r)return;let i=window.getComputedStyle(e);i.cssText?(r.cssText=i.cssText,r.transformOrigin=i.transformOrigin):re(n).forEach(o=>{let a=i.getPropertyValue(o);o==="font-size"&&a.endsWith("px")&&(a=`${Math.floor(parseFloat(a.substring(0,a.length-2)))-.1}px`),E(e,HTMLIFrameElement)&&o==="display"&&a==="inline"&&(a="block"),o==="d"&&t.getAttribute("d")&&(a=`path(${t.getAttribute("d")})`),r.setProperty(o,a,i.getPropertyPriority(o))})}function nn(e,t){E(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),E(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function rn(e,t){if(E(e,HTMLSelectElement)){let r=Array.from(t.children).find(i=>e.value===i.getAttribute("value"));r&&r.setAttribute("selected","")}}function on(e,t,n){return E(t,Element)&&(tn(e,t,n),Xe(e,t,n),nn(e,t),rn(e,t)),t}async function an(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let o=0;o<n.length;o++){let l=n[o].getAttribute("xlink:href");if(l){let c=e.querySelector(l),d=document.querySelector(l);!c&&d&&!r[l]&&(r[l]=await j(d,t,!0))}}let i=Object.values(r);if(i.length){let o="http://www.w3.org/1999/xhtml",a=document.createElementNS(o,"svg");a.setAttribute("xmlns",o),a.style.position="absolute",a.style.width="0",a.style.height="0",a.style.overflow="hidden",a.style.display="none";let l=document.createElementNS(o,"defs");a.appendChild(l);for(let c=0;c<i.length;c++)l.appendChild(i[c]);e.appendChild(a)}return e}async function j(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>Qt(r,t)).then(r=>en(e,r,t)).then(r=>on(e,r,t)).then(r=>an(r,t))}var et=/url\((['"]?)([^'"]+?)\1\)/g,sn=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,ln=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function cn(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function dn(e){let t=[];return e.replace(et,(n,r,i)=>(t.push(i),n)),t.filter(n=>!N(n))}async function un(e,t,n,r,i){try{let o=n?We(t,n):t,a=z(t),l;if(i){let c=await i(o);l=ve(c,a)}else l=await O(o,a,r);return e.replace(cn(t),`$1${l}$3`)}catch{}return e}function pn(e,{preferredFontFormat:t}){return t?e.replace(ln,n=>{for(;;){let[r,,i]=sn.exec(n)||[];if(!i)return"";if(i===t)return`src: ${r};`}}):e}function Ce(e){return e.search(et)!==-1}async function ie(e,t,n){if(!Ce(e))return e;let r=pn(e,n);return dn(r).reduce((o,a)=>o.then(l=>un(l,a,t,n)),Promise.resolve(r))}async function B(e,t,n){var r;let i=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(i){let o=await ie(i,null,n);return t.style.setProperty(e,o,t.style.getPropertyPriority(e)),!0}return!1}async function mn(e,t){await B("background",e,t)||await B("background-image",e,t),await B("mask",e,t)||await B("-webkit-mask",e,t)||await B("mask-image",e,t)||await B("-webkit-mask-image",e,t)}async function fn(e,t){let n=E(e,HTMLImageElement);if(!(n&&!N(e.src))&&!(E(e,SVGImageElement)&&!N(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,i=await O(r,z(r),t);await new Promise((o,a)=>{e.onload=o,e.onerror=t.onImageErrorHandler?(...c)=>{try{o(t.onImageErrorHandler(...c))}catch(d){a(d)}}:a;let l=e;l.decode&&(l.decode=o),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=i):e.href.baseVal=i})}async function hn(e,t){let r=T(e.childNodes).map(i=>Se(i,t));await Promise.all(r).then(()=>e)}async function Se(e,t){E(e,Element)&&(await mn(e,t),await fn(e,t),await hn(e,t))}function tt(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(i=>{n[i]=r[i]}),e}var nt={};async function rt(e){let t=nt[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},nt[e]=t,t}async function it(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,o=(n.match(/url\([^)]+\)/g)||[]).map(async a=>{let l=a.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),Ee(l,t.fetchRequestInit,({result:c})=>(n=n.replace(a,`url(${c})`),[a,c]))});return Promise.all(o).then(()=>n)}function ot(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),i=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let c=i.exec(r);if(c===null)break;t.push(c[0])}r=r.replace(i,"");let o=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(a,"gi");for(;;){let c=o.exec(r);if(c===null){if(c=l.exec(r),c===null)break;o.lastIndex=l.lastIndex}else l.lastIndex=o.lastIndex;t.push(c[0])}return t}async function gn(e,t){let n=[],r=[];return e.forEach(i=>{if("cssRules"in i)try{T(i.cssRules||[]).forEach((o,a)=>{if(o.type===CSSRule.IMPORT_RULE){let l=a+1,c=o.href,d=rt(c).then(p=>it(p,t)).then(p=>ot(p).forEach(f=>{try{i.insertRule(f,f.startsWith("@import")?l+=1:i.cssRules.length)}catch(v){console.error("Error inserting rule from remote css",{rule:f,error:v})}})).catch(p=>{console.error("Error loading remote css",p.toString())});r.push(d)}})}catch(o){let a=e.find(l=>l.href==null)||document.styleSheets[0];i.href!=null&&r.push(rt(i.href).then(l=>it(l,t)).then(l=>ot(l).forEach(c=>{a.insertRule(c,a.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",o)}}),Promise.all(r).then(()=>(e.forEach(i=>{if("cssRules"in i)try{T(i.cssRules||[]).forEach(o=>{n.push(o)})}catch(o){console.error(`Error while reading CSS rules from ${i.href}`,o)}}),n))}function bn(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>Ce(t.style.getPropertyValue("src")))}async function xn(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=T(e.ownerDocument.styleSheets),r=await gn(n,t);return bn(r)}function at(e){return e.trim().replace(/["']/g,"")}function yn(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(o=>{t.add(at(o))}),Array.from(r.children).forEach(o=>{o instanceof HTMLElement&&n(o)})}return n(e),t}async function st(e,t){let n=await xn(e,t),r=yn(e);return(await Promise.all(n.filter(o=>r.has(at(o.style.fontFamily))).map(o=>{let a=o.parentStyleSheet?o.parentStyleSheet.href:null;return ie(o.cssText,a,t)}))).join(`
`)}async function lt(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await st(e,t);if(n){let r=document.createElement("style"),i=document.createTextNode(n);r.appendChild(i),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function wn(e,t={}){let{width:n,height:r}=ye(e,t),i=await j(e,t,!0);return await lt(i,t),await Se(i,t),tt(i,t),await Ke(i,n,r)}async function vn(e,t={}){let{width:n,height:r}=ye(e,t),i=await wn(e,t),o=await F(i),a=document.createElement("canvas"),l=a.getContext("2d"),c=t.pixelRatio||Ne(),d=t.canvasWidth||n,p=t.canvasHeight||r;return a.width=d*c,a.height=p*c,t.skipAutoScale||je(a),a.style.width=`${d}`,a.style.height=`${p}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,a.width,a.height)),l.drawImage(o,0,0,a.width,a.height),a}async function ct(e,t={}){let n=await vn(e,t);return await Ge(n)}var En="data-builder-hide",ke={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},dt=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function ut(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function pt(e){return e==="video"?ke.video:e==="image"?ke.image:ke.file}function oe(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function mt(e=15e3){let t=await Promise.race([ct(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(M)!==null&&r?.hasAttribute?.(M)||r?.hasAttribute?.(En))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${Cn()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function Cn(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function Le(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}var Sn={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",dir:"ltr"},kn={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",dir:"rtl"};function ae(e){return e.toLowerCase().startsWith("ar")?kn:Sn}function ft(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},i=c=>{let d=document.elementFromPoint(c.clientX,c.clientY);if(!d||te(d)||d===document.body||d===document.documentElement){r();return}d!==n&&(r(),n=d,d.classList.add("builder-pin-hover"))},o=c=>{let d=document.elementFromPoint(c.clientX,c.clientY);if(!d||te(d))return;c.preventDefault(),c.stopPropagation();let p=Oe(d);l(),e(p,d)},a=c=>{c.key==="Escape"&&(c.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",i,!0),document.removeEventListener("click",o,!0),document.removeEventListener("keydown",a,!0)}return document.addEventListener("mousemove",i,!0),document.addEventListener("click",o,!0),document.addEventListener("keydown",a,!0),l}function se(e){let t=Ue(e);if(!t.el||t.confidence<Be)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var ht="http://www.w3.org/2000/svg",Ln={pin:["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0","M12 8a2 2 0 1 0 0 4 2 2 0 1 0 0-4"],x:["M18 6 6 18","m6 6 12 12"],paperclip:["M13.234 20.252 21 12.3a3.53 3.53 0 0 0 0-5 3.53 3.53 0 0 0-5 0L4.32 18.98a5.3 5.3 0 0 0 0 7.5 5.3 5.3 0 0 0 7.5 0l8.49-8.49"],image:["M15 8h.01","M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","m3 16 5-5c.928-.893 2.072-.893 3 0l5 5","m14 14 1-1c.928-.893 2.072-.893 3 0l3 3"],pencil:["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","m15 5 4 4"],eye:["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0","M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6"],arrowRight:["M5 12h14","m12 5 7 7-7 7"]};function I(e,t=14){let n=document.createElementNS(ht,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let r of Ln[e]??[]){let i=document.createElementNS(ht,"path");i.setAttribute("d",r),n.appendChild(i)}return n}function R(e,t,n,r=14){e.replaceChildren(),e.appendChild(I(t,r));let i=document.createElement("span");i.textContent=n,e.appendChild(i)}function ce(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let i=n[r],o=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(i);if(o){let p=o[1][0],f=[];for(r++;r<n.length&&!new RegExp(`^\\s*${p}{3,}\\s*$`).test(n[r]);)f.push(n[r]),r++;r++;let v=document.createElement("pre");v.className="md-pre";let C=document.createElement("code");o[2]&&(C.className=`lang-${o[2]}`),C.textContent=f.join(`
`),v.appendChild(C),t.appendChild(v);continue}if(!i.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(i)){t.appendChild(document.createElement("hr")),r++;continue}let a=/^\s*(#{1,6})\s+(.*)$/.exec(i);if(a){let p=Math.min(6,3+a[1].length),f=document.createElement(`h${p}`);f.className="md-h",f.appendChild(le(a[2])),t.appendChild(f),r++;continue}if(/^\s*>\s?/.test(i)){let p=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)p.push(n[r].replace(/^\s*>\s?/,"")),r++;let f=document.createElement("blockquote");f.className="md-quote",f.appendChild(ce(p.join(`
`))),t.appendChild(f);continue}let l=/^\s*[-*+]\s+/,c=/^\s*\d+[.)]\s+/;if(l.test(i)||c.test(i)){let p=!l.test(i),f=p?c:l,v=document.createElement(p?"ol":"ul");for(v.className="md-list";r<n.length&&f.test(n[r]);){let C=document.createElement("li"),b=n[r].replace(f,"");for(r++;r<n.length&&n[r].trim()&&!f.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)b+=`
`+n[r].trim(),r++;C.appendChild(le(b)),v.appendChild(C)}t.appendChild(v);continue}let d=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r]);)d.push(n[r]),r++;if(d.length){let p=document.createElement("p");p.className="md-p",p.appendChild(le(d.join(`
`))),t.appendChild(p)}else r++}return t}var Tn=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function le(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=Tn.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&bt(t,n.slice(0,r.index)),r[1]){let i=document.createElement("code");i.className="md-code",i.textContent=r[2].trim(),t.appendChild(i)}else r[3]!==void 0?t.appendChild(gt(r[4],r[3]||r[4])):r[5]?t.appendChild(Te("strong","md-strong",r[6])):r[7]?t.appendChild(Te("del","md-del",r[8])):r[9]?t.appendChild(Te("em","md-em",r[10])):r[11]&&t.appendChild(gt(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&bt(t,n),t}function Te(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(le(n)),r}function gt(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function bt(e,t){t.split(`
`).forEach((r,i)=>{i&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function xt(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let i=await r.json();return{id:i.id,number:i.number,title:i.title,body:i.body??"",type:i.type,status:i.status,priority:i.priority,route:i.route??"",pageUrl:i.pageUrl??"",createdAt:i.createdAt??"",pins:i.pins??[],comments:i.comments??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function yt(e,t,n){let r=ae(e),i=document.createElement("div");i.className="detail hidden";let o=null;async function a(d){i.replaceChildren(x("p","empty",r.loading));try{o=await t.get(d),l()}catch(p){i.replaceChildren(x("p","note err",String(p.message)))}}function l(){if(!o)return;let d=o;i.replaceChildren();let p=x("div","d-head",""),f=de("ghost","\u2190 "+r.onThisPage);f.addEventListener("click",n);let v=de("ghost","\u2197");v.title=r.report,v.addEventListener("click",()=>window.open(`/issues/${d.number}`,"_blank","noopener")),p.append(f,v),i.appendChild(p);let C=x("div","d-meta","");if(C.append(x("span","num",`#${d.number}`),x("span",`chip ${d.type}`,r[d.type]??d.type),x("span","chip status",d.status.replace("_"," "))),i.append(C,x("h3","d-title",d.title)),d.body){let y=x("div","d-body","");y.appendChild(ce(d.body)),i.appendChild(y)}if(d.pins.length){i.appendChild(x("div","label",r.location));for(let y of d.pins){let u=x("div","d-pin","");u.appendChild(x("span","nm",`<${y.tag??"?"}>${y.name?` \u201C${y.name}\u201D`:""}`));let g=de("ghost","");g.appendChild(I("eye",14)),g.title=r.pin,g.addEventListener("click",()=>{let w=se(y);c(w.found?`Found via ${w.by} (${Math.round(w.confidence*100)}%)`:"The pinned element is not on this page any more.",w.found?"ok":"err")}),u.appendChild(g),i.appendChild(u)}}i.appendChild(x("div","label","Comments")),d.comments.length||i.appendChild(x("p","empty","No comments yet."));for(let y of d.comments){let u=x("div","d-comment",""),g=x("p","who",y.author||"someone");y.kind==="agent"&&g.appendChild(x("span","chip agent","agent"));let w=x("div","txt","");w.appendChild(ce(y.body)),u.append(g,w),i.appendChild(u)}let b=document.createElement("textarea");b.placeholder="Add a comment\u2026",b.rows=3;let k=de("primary","Comment");k.addEventListener("click",async()=>{let y=b.value.trim();if(y){k.disabled=!0;try{await t.comment(d.number,y),b.value="",await a(d.number)}catch(u){c(String(u.message),"err")}finally{k.disabled=!1}}}),i.append(b,k)}function c(d,p){let f=x("p",`note ${p}`,d);i.appendChild(f),setTimeout(()=>f.remove(),4e3)}return{el:i,load:a,destroy:()=>i.remove()}}function x(e,t,n){let r=document.createElement(e);return r.className=t,n&&(r.textContent=n),r}function de(e,t){let n=document.createElement("button");return n.type="button",n.className=e,n.textContent=t,n}var wt=`
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
.fab {
  position: fixed; z-index: 2147483645;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border: 0; border-radius: 999px;
  background: var(--accent); color: var(--accent-fg);
  font-size: 14px; font-weight: 600; line-height: 1;
  box-shadow: var(--shadow);
  touch-action: none;                 /* let pointer events drive the drag */
  user-select: none;
  transition: transform .12s ease, box-shadow .12s ease;
}
.fab:hover { transform: translateY(-1px); }
.fab:active { cursor: grabbing; }
.fab:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.fab .count {
  min-width: 18px; height: 18px; padding: 0 5px;
  border-radius: 999px; background: rgba(255,255,255,.24);
  font-size: 11px; display: grid; place-items: center;
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
  transition: transform .18s ease;
}
:host([dir="rtl"]) .panel { --slide: -100%; }
.panel[data-open="true"] { --slide: 0 !important; }

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
`,vt=`
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

`;function Et(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let i=await r.json().catch(()=>null);return Array.isArray(i?.issues)?i.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??""}));for(let a of n.attachments)r.append("attachments",a.blob,a.name),r.append("attachment_kinds",a.kind);let i=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!i.ok){let a=await i.text().catch(()=>"");throw new Error(a||`submit failed (${i.status})`)}let o=await i.json();return{id:String(o.id??""),number:Number(o.number??0)}}}}var Ct="builder.fab.position",An=["bug","feature","question","discussion"];function Pn(e={}){let t=ae(e.locale??document.documentElement.lang??"en"),n=e.transport??Et(e.apiBase),r=e.locale??"en",i=document.createElement("div");i.setAttribute(M,""),i.setAttribute("dir",t.dir),e.theme&&i.setAttribute("data-theme",e.theme),document.body.appendChild(i);let o=i.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=wt+(e.accent?`:host{--accent:${Mn(e.accent)}}`:""),o.appendChild(a);let l=document.createElement("style");l.setAttribute(M,""),l.textContent=vt,document.head.appendChild(l);let c=[],d=[],p=[],f="bug",v=!1,C=!1,b=null,k=null,y=document.createElement("div");y.innerHTML=`
    <button class="fab" part="fab" aria-haspopup="dialog" aria-expanded="false">
      <span class="fab-ico"></span><span class="fab-label"></span><span class="count hidden"></span>
    </button>
    <aside class="panel" role="dialog" aria-modal="false" data-open="false">
      <div class="head"><h2></h2><button class="x" aria-label=""></button></div>
      <div class="body">
        <p class="intro"></p>
        <button class="primary report"></button>

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

          <div class="label lbl-att"></div>
          <div class="btns">
            <button type="button" class="ghost addfile"></button>
            <button type="button" class="ghost shot"></button>
          </div>
          <div class="files"></div>
          <input type="file" class="filein hidden" multiple accept="${dt}">

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
    </aside>`,o.appendChild(y);let u=s=>o.querySelector(s),g=u(".fab"),w=u(".panel"),G=u(".form"),ue=u(".listing"),Ae=u(".foot"),K=u(".rows"),pe=u(".pills"),me=u(".note"),Pe=u(".files"),Y=u(".filein"),Re=u(".count"),X=u('input[name="title"]'),$e=u('textarea[name="body"]'),St=u('input[name="url"]'),A=u(".pin"),fe=u(".clearpin"),D=u(".send");u(".fab-label").textContent=t.fab,u("h2").textContent=t.title,u(".fab-ico").replaceChildren(I("pencil",15)),u(".x").replaceChildren(I("x",15)),u(".x").setAttribute("aria-label",t.close),u(".intro").textContent=t.intro,u(".report").textContent=t.report,u(".lbl-type").textContent=t.type,u(".lbl-title").textContent=t.titleLabel,u(".lbl-details").textContent=t.details,u(".lbl-url").textContent=t.pageUrl,u(".lbl-loc").textContent=t.location,u(".lbl-att").textContent=t.attachments,u(".lbl-page").textContent=t.onThisPage,R(u(".board-link"),"arrowRight",t.openBoard),X.placeholder=t.titlePlaceholder,$e.placeholder=t.detailsPlaceholder,R(A,"pin",t.pin),R(fe,"x",t.clear),R(u(".addfile"),"paperclip",t.addFile),R(u(".shot"),"image",t.screenshot),D.textContent=t.submit;for(let s of An){let m=document.createElement("button");m.type="button",m.className="pill",m.dataset.type=s,m.textContent=t[s],m.setAttribute("aria-pressed",String(s===f)),m.addEventListener("click",()=>{f=s,pe.querySelectorAll(".pill").forEach(h=>h.setAttribute("aria-pressed",String(h.dataset.type===s)))}),pe.appendChild(m)}let kt=4,L=null,he=(s,m)=>{let h=Math.max(8,Math.min(s,window.innerWidth-80)),_=Math.max(8,Math.min(m,window.innerHeight-48));g.style.insetInlineEnd=`${h}px`,g.style.insetBlockEnd=`${_}px`},Me=Rn();he(Me?.right??e.position?.right??24,Me?.bottom??e.position?.bottom??24),g.addEventListener("pointerdown",s=>{if(s.button!==0)return;let m=g.getBoundingClientRect();L={x:s.clientX,y:s.clientY,ox:window.innerWidth-m.right,oy:window.innerHeight-m.bottom,moved:!1},g.setPointerCapture(s.pointerId)}),g.addEventListener("pointermove",s=>{if(!L)return;let m=s.clientX-L.x,h=s.clientY-L.y;!L.moved&&Math.hypot(m,h)<kt||(L.moved=!0,he(L.ox-m,L.oy-h))}),g.addEventListener("pointerup",s=>{if(!L)return;let m=L.moved;if(L=null,g.releasePointerCapture(s.pointerId),m){let h=g.getBoundingClientRect();$n(window.innerWidth-h.right,window.innerHeight-h.bottom);return}Ie()}),g.addEventListener("keydown",s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),Ie())}),window.addEventListener("resize",()=>{let s=g.getBoundingClientRect();he(window.innerWidth-s.right,window.innerHeight-s.bottom)});function Ie(){w.dataset.open==="true"?J():De()}function De(){w.dataset.open="true",g.setAttribute("aria-expanded","true"),St.value=location.href,U()}function J(){w.dataset.open="false",g.setAttribute("aria-expanded","false"),ge(!1),b?.(),b=null}u(".x").addEventListener("click",J),o.addEventListener("keydown",s=>{s.key==="Escape"&&!b&&J()});function ge(s){v=s,G.classList.toggle("hidden",!s),ue.classList.toggle("hidden",s),Ae.classList.toggle("hidden",!s),u(".report").classList.toggle("hidden",s),s?setTimeout(()=>X.focus(),30):Lt()}u(".report").addEventListener("click",()=>ge(!0));function Lt(){G.reset(),d=[],p=[],f="bug",pe.querySelectorAll(".pill").forEach(s=>s.setAttribute("aria-pressed",String(s.dataset.type==="bug"))),Q(),Z(),P("")}function P(s,m=""){me.textContent=s,me.className=`note ${m}`.trim(),me.classList.toggle("hidden",!s)}A.addEventListener("click",()=>{if(b){b(),b=null,A.setAttribute("aria-pressed","false"),R(A,"pin",t.pin);return}w.dataset.open="false",A.setAttribute("aria-pressed","true"),A.textContent=t.pinning,b=ft(s=>{d=[s],b=null,w.dataset.open="true",Q()},()=>{b=null,w.dataset.open="true",Q()})}),fe.addEventListener("click",()=>{d=[],Q()});function Q(){let s=d.length>0;A.setAttribute("aria-pressed",String(s)),R(A,"pin",s?t.pinned(d[0].tag??"?"):t.pin),fe.classList.toggle("hidden",!s)}u(".addfile").addEventListener("click",()=>Y.click()),Y.addEventListener("change",()=>{for(let s of Array.from(Y.files??[]))Tt(s);Y.value=""});function Tt(s){let m=ut(s.type),h=pt(m);if(s.size>h){P(`${s.name} is ${oe(s.size)} \u2014 the limit is ${oe(h)}.`,"err");return}p.push({name:s.name,mime:s.type,size:s.size,kind:m,blob:s}),Z(),P("")}u(".shot").addEventListener("click",async()=>{let s=u(".shot");s.disabled=!0;let m=w.dataset.open;w.dataset.open="false",i.style.visibility="hidden";try{await new Promise(h=>setTimeout(h,120)),p.push(await mt()),Z(),P("")}catch(h){P(String(h.message||h),"err")}finally{i.style.visibility="",w.dataset.open=m??"true",s.disabled=!1}});function Z(){Pe.replaceChildren(),p.forEach((s,m)=>{let h=document.createElement("div");h.className="file";let _=document.createElement("span");_.className="nm",_.textContent=s.name;let Fe=document.createElement("span");Fe.textContent=oe(s.size);let q=document.createElement("button");q.type="button",q.replaceChildren(I("x",12)),q.setAttribute("aria-label",t.clear),q.addEventListener("click",()=>{p.splice(m,1),Z()}),h.append(_,Fe,q),Pe.appendChild(h)})}async function He(){if(C)return;let s=X.value.trim();if(!s){P(t.titleRequired,"err"),X.focus();return}C=!0,D.disabled=!0,D.textContent=t.submitting;try{let m=await n.create({type:f,title:s,body:$e.value,route:Le(),pageUrl:location.href,locale:r,pins:d,attachments:p});P(t.created(m.number),"ok"),e.onCreated?.(m),setTimeout(()=>{ge(!1),U()},900)}catch(m){P(String(m.message||t.failed),"err")}finally{C=!1,D.disabled=!1,D.textContent=t.submit}}D.addEventListener("click",He),G.addEventListener("submit",s=>{s.preventDefault(),He()});async function U(){if(!v){K.replaceChildren($("div","empty",t.loading));try{c=await n.listByRoute(Le())}catch{c=[]}if(Re.textContent=c.length>9?"9+":String(c.length),Re.classList.toggle("hidden",c.length===0),u(".lbl-page").textContent=c.length?t.issueCount(c.length):t.onThisPage,K.replaceChildren(),!c.length){K.appendChild($("div","empty",t.none));return}for(let s of c){let m=document.createElement("button");if(m.type="button",m.className="row",m.append($("span","num",`#${s.number}`),$("span",`chip ${s.type}`,t[s.type])),m.appendChild($("span","t",s.title)),s.busy){let h=$("span","agent-tag","");h.appendChild($("span","spin","")),h.appendChild($("span","who",s.agent||t.agentWorking)),h.setAttribute("title",s.agent?t.agentWorkingBy(s.agent):t.agentWorking),m.appendChild(h)}m.addEventListener("click",()=>void At(s.number)),K.appendChild(m)}}}async function At(s){k||(k=yt(r,xt(e.apiBase),()=>{k?.el.classList.add("hidden"),ue.classList.remove("hidden"),u(".report").classList.remove("hidden"),U()}),u(".body").appendChild(k.el)),ue.classList.add("hidden"),u(".report").classList.add("hidden"),G.classList.add("hidden"),Ae.classList.add("hidden"),k.el.classList.remove("hidden"),await k.load(s)}let Pt={open:De,close:J,refresh:()=>void U(),destroy(){b?.(),i.remove(),l.remove()}};return U(),Pt}function $(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function Rn(){try{let e=localStorage.getItem(Ct);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function $n(e,t){try{localStorage.setItem(Ct,JSON.stringify({right:e,bottom:t}))}catch{}}function Mn(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return Ht(In);})();
