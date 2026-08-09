"use strict";var BuilderIssues=(()=>{var Te=Object.defineProperty;var Yt=Object.getOwnPropertyDescriptor;var Kt=Object.getOwnPropertyNames;var Jt=Object.prototype.hasOwnProperty;var Zt=(e,t)=>{for(var n in t)Te(e,n,{get:t[n],enumerable:!0})},Qt=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of Kt(t))!Jt.call(e,a)&&a!==n&&Te(e,a,{get:()=>t[a],enumerable:!(r=Yt(t,a))||r.enumerable});return e};var en=e=>Qt(Te({},"__esModule",{value:!0}),e);var Qn={};Zt(Qn,{highlightPin:()=>ge,mount:()=>Yn});var O="data-builder-sdk";function de(e){return!!e?.closest?.(`[${O}]`)}function Je(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,a={tag:e.tagName.toLowerCase(),hint:Z(e),css:nn(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},o=e.getAttribute("data-testid")??e.getAttribute("data-test-id");o&&(a.testid=o),e.id&&!et(e.id)&&(a.domId=e.id);let s=e.getAttribute("role")??rn(e);s&&(a.role=s);let l=tt(e);l&&(a.name=l);for(let[p,u]of tn(a))try{let m=document.querySelectorAll(u);m.length===1&&m[0]===e&&a.verified.push(p)}catch{}return a}function tn(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${Q(e.testid)}"]`]),e.domId&&t.push(["domId",`#${Q(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var Ze=.5;function Qe(e){if(e.testid){let t=ce(`[data-testid="${Q(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=Ke(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=ce(`[role="${Q(e.role)}"]`).filter(n=>tt(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=Ke(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=ce(e.css);if(t.length===1){let n=t[0],r=!e.hint||Ae(Z(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=ce(e.tag||"*").filter(n=>Ae(Z(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function Ke(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,a=null,o=1/0;for(let s of e){let l=s.getBoundingClientRect(),p=l.left/n-t.rect.x,u=l.top/r-t.rect.y,m=Math.hypot(p,u);t.hint&&Ae(Z(s),t.hint)&&(m-=.5),m<o&&([a,o]=[s,m])}return a}function ce(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!de(t))}catch{return[]}}function nn(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!et(n.id)){t.unshift(`#${Q(n.id)}`);break}let a=n.tagName.toLowerCase(),o=n.parentElement;if(!o){t.unshift(a);break}let s=Array.from(o.children).filter(l=>l.tagName===n.tagName);t.unshift(s.length>1?`${a}:nth-of-type(${s.indexOf(n)+1})`:a),n=o}return t.join(" > ").slice(0,512)}function et(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function Z(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function Ae(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function tt(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||Z(e)).slice(0,80)}function rn(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function Q(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function nt(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),a=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(a),t&&(r.href=t),a.href=e,a.href}var rt=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function P(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var j=null;function ue(e={}){return j||(e.includeStyleProperties?(j=e.includeStyleProperties,j):(j=P(window.getComputedStyle(document.documentElement)),j))}function pe(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function an(e){let t=pe(e,"border-left-width"),n=pe(e,"border-right-width");return e.clientWidth+t+n}function on(e){let t=pe(e,"border-top-width"),n=pe(e,"border-bottom-width");return e.clientHeight+t+n}function Me(e,t={}){let n=t.width||an(e),r=t.height||on(e);return{width:n,height:r}}function at(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var S=16384;function ot(e){(e.width>S||e.height>S)&&(e.width>S&&e.height>S?e.width>e.height?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S):e.width>S?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S))}function it(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),a=r.length,o=new Uint8Array(a);for(let s=0;s<a;s+=1)o[s]=r.charCodeAt(s);n(new Blob([o],{type:t.type?t.type:"image/png"}))})}function V(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function sn(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function st(e,t,n){let r="http://www.w3.org/2000/svg",a=document.createElementNS(r,"svg"),o=document.createElementNS(r,"foreignObject");return a.setAttribute("width",`${t}`),a.setAttribute("height",`${n}`),a.setAttribute("viewBox",`0 0 ${t} ${n}`),o.setAttribute("width","100%"),o.setAttribute("height","100%"),o.setAttribute("x","0"),o.setAttribute("y","0"),o.setAttribute("externalResourcesRequired","true"),a.appendChild(o),o.appendChild(e),sn(a)}var E=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||E(n,t)};function ln(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function cn(e,t){return ue(t).map(n=>{let r=e.getPropertyValue(n),a=e.getPropertyPriority(n);return`${n}: ${r}${a?" !important":""};`}).join(" ")}function dn(e,t,n,r){let a=`.${e}:${t}`,o=n.cssText?ln(n):cn(n,r);return document.createTextNode(`${a}{${o}}`)}function lt(e,t,n,r){let a=window.getComputedStyle(e,n),o=a.getPropertyValue("content");if(o===""||o==="none")return;let s=rt();try{t.className=`${t.className} ${s}`}catch{return}let l=document.createElement("style");l.appendChild(dn(s,n,a,r)),t.appendChild(l)}function ct(e,t,n){lt(e,t,":before",n),lt(e,t,":after",n)}var dt="application/font-woff",pt="image/jpeg",pn={woff:dt,woff2:dt,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:pt,jpeg:pt,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function un(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function X(e){let t=un(e).toLowerCase();return pn[t]||""}function mn(e){return e.split(/,/)[1]}function ee(e){return e.search(/^(data:)/)!==-1}function Re(e,t){return`data:${t};base64,${e}`}async function $e(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let a=await r.blob();return new Promise((o,s)=>{let l=new FileReader;l.onerror=s,l.onloadend=()=>{try{o(n({res:r,result:l.result}))}catch(p){s(p)}},l.readAsDataURL(a)})}var Pe={};function hn(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function G(e,t,n){let r=hn(e,t,n.includeQueryParams);if(Pe[r]!=null)return Pe[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let a;try{let o=await $e(e,n.fetchRequestInit,({res:s,result:l})=>(t||(t=s.headers.get("Content-Type")||""),mn(l)));a=Re(o,t)}catch(o){a=n.imagePlaceholder||"";let s=`Failed to fetch resource: ${e}`;o&&(s=typeof o=="string"?o:o.message),s&&console.warn(s)}return Pe[r]=a,a}async function fn(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):V(t)}async function gn(e,t){if(e.currentSrc){let o=document.createElement("canvas"),s=o.getContext("2d");o.width=e.clientWidth,o.height=e.clientHeight,s?.drawImage(e,0,0,o.width,o.height);let l=o.toDataURL();return V(l)}let n=e.poster,r=X(n),a=await G(n,r,t);return V(a)}async function bn(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await te(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function xn(e,t){return E(e,HTMLCanvasElement)?fn(e):E(e,HTMLVideoElement)?gn(e,t):E(e,HTMLIFrameElement)?bn(e,t):e.cloneNode(ut(e))}var vn=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",ut=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function yn(e,t,n){var r,a;if(ut(t))return t;let o=[];return vn(e)&&e.assignedNodes?o=P(e.assignedNodes()):E(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?o=P(e.contentDocument.body.childNodes):o=P(((a=e.shadowRoot)!==null&&a!==void 0?a:e).childNodes),o.length===0||E(e,HTMLVideoElement)||await o.reduce((s,l)=>s.then(()=>te(l,n)).then(p=>{p&&t.appendChild(p)}),Promise.resolve()),t}function wn(e,t,n){let r=t.style;if(!r)return;let a=window.getComputedStyle(e);a.cssText?(r.cssText=a.cssText,r.transformOrigin=a.transformOrigin):ue(n).forEach(o=>{let s=a.getPropertyValue(o);o==="font-size"&&s.endsWith("px")&&(s=`${Math.floor(parseFloat(s.substring(0,s.length-2)))-.1}px`),E(e,HTMLIFrameElement)&&o==="display"&&s==="inline"&&(s="block"),o==="d"&&t.getAttribute("d")&&(s=`path(${t.getAttribute("d")})`),r.setProperty(o,s,a.getPropertyPriority(o))})}function kn(e,t){E(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),E(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function En(e,t){if(E(e,HTMLSelectElement)){let r=Array.from(t.children).find(a=>e.value===a.getAttribute("value"));r&&r.setAttribute("selected","")}}function Cn(e,t,n){return E(t,Element)&&(wn(e,t,n),ct(e,t,n),kn(e,t),En(e,t)),t}async function Sn(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let o=0;o<n.length;o++){let l=n[o].getAttribute("xlink:href");if(l){let p=e.querySelector(l),u=document.querySelector(l);!p&&u&&!r[l]&&(r[l]=await te(u,t,!0))}}let a=Object.values(r);if(a.length){let o="http://www.w3.org/1999/xhtml",s=document.createElementNS(o,"svg");s.setAttribute("xmlns",o),s.style.position="absolute",s.style.width="0",s.style.height="0",s.style.overflow="hidden",s.style.display="none";let l=document.createElementNS(o,"defs");s.appendChild(l);for(let p=0;p<a.length;p++)l.appendChild(a[p]);e.appendChild(s)}return e}async function te(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>xn(r,t)).then(r=>yn(e,r,t)).then(r=>Cn(e,r,t)).then(r=>Sn(r,t))}var mt=/url\((['"]?)([^'"]+?)\1\)/g,Ln=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,Tn=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function An(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function Mn(e){let t=[];return e.replace(mt,(n,r,a)=>(t.push(a),n)),t.filter(n=>!ee(n))}async function Pn(e,t,n,r,a){try{let o=n?nt(t,n):t,s=X(t),l;if(a){let p=await a(o);l=Re(p,s)}else l=await G(o,s,r);return e.replace(An(t),`$1${l}$3`)}catch{}return e}function Rn(e,{preferredFontFormat:t}){return t?e.replace(Tn,n=>{for(;;){let[r,,a]=Ln.exec(n)||[];if(!a)return"";if(a===t)return`src: ${r};`}}):e}function Ie(e){return e.search(mt)!==-1}async function me(e,t,n){if(!Ie(e))return e;let r=Rn(e,n);return Mn(r).reduce((o,s)=>o.then(l=>Pn(l,s,t,n)),Promise.resolve(r))}async function Y(e,t,n){var r;let a=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(a){let o=await me(a,null,n);return t.style.setProperty(e,o,t.style.getPropertyPriority(e)),!0}return!1}async function $n(e,t){await Y("background",e,t)||await Y("background-image",e,t),await Y("mask",e,t)||await Y("-webkit-mask",e,t)||await Y("mask-image",e,t)||await Y("-webkit-mask-image",e,t)}async function In(e,t){let n=E(e,HTMLImageElement);if(!(n&&!ee(e.src))&&!(E(e,SVGImageElement)&&!ee(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,a=await G(r,X(r),t);await new Promise((o,s)=>{e.onload=o,e.onerror=t.onImageErrorHandler?(...p)=>{try{o(t.onImageErrorHandler(...p))}catch(u){s(u)}}:s;let l=e;l.decode&&(l.decode=o),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=a):e.href.baseVal=a})}async function Hn(e,t){let r=P(e.childNodes).map(a=>He(a,t));await Promise.all(r).then(()=>e)}async function He(e,t){E(e,Element)&&(await $n(e,t),await In(e,t),await Hn(e,t))}function ht(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(a=>{n[a]=r[a]}),e}var ft={};async function gt(e){let t=ft[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},ft[e]=t,t}async function bt(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,o=(n.match(/url\([^)]+\)/g)||[]).map(async s=>{let l=s.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),$e(l,t.fetchRequestInit,({result:p})=>(n=n.replace(s,`url(${p})`),[s,p]))});return Promise.all(o).then(()=>n)}function xt(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),a=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let p=a.exec(r);if(p===null)break;t.push(p[0])}r=r.replace(a,"");let o=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,s="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(s,"gi");for(;;){let p=o.exec(r);if(p===null){if(p=l.exec(r),p===null)break;o.lastIndex=l.lastIndex}else l.lastIndex=o.lastIndex;t.push(p[0])}return t}async function Dn(e,t){let n=[],r=[];return e.forEach(a=>{if("cssRules"in a)try{P(a.cssRules||[]).forEach((o,s)=>{if(o.type===CSSRule.IMPORT_RULE){let l=s+1,p=o.href,u=gt(p).then(m=>bt(m,t)).then(m=>xt(m).forEach(f=>{try{a.insertRule(f,f.startsWith("@import")?l+=1:a.cssRules.length)}catch(w){console.error("Error inserting rule from remote css",{rule:f,error:w})}})).catch(m=>{console.error("Error loading remote css",m.toString())});r.push(u)}})}catch(o){let s=e.find(l=>l.href==null)||document.styleSheets[0];a.href!=null&&r.push(gt(a.href).then(l=>bt(l,t)).then(l=>xt(l).forEach(p=>{s.insertRule(p,s.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",o)}}),Promise.all(r).then(()=>(e.forEach(a=>{if("cssRules"in a)try{P(a.cssRules||[]).forEach(o=>{n.push(o)})}catch(o){console.error(`Error while reading CSS rules from ${a.href}`,o)}}),n))}function Fn(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>Ie(t.style.getPropertyValue("src")))}async function zn(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=P(e.ownerDocument.styleSheets),r=await Dn(n,t);return Fn(r)}function vt(e){return e.trim().replace(/["']/g,"")}function Bn(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(o=>{t.add(vt(o))}),Array.from(r.children).forEach(o=>{o instanceof HTMLElement&&n(o)})}return n(e),t}async function yt(e,t){let n=await zn(e,t),r=Bn(e);return(await Promise.all(n.filter(o=>r.has(vt(o.style.fontFamily))).map(o=>{let s=o.parentStyleSheet?o.parentStyleSheet.href:null;return me(o.cssText,s,t)}))).join(`
`)}async function wt(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await yt(e,t);if(n){let r=document.createElement("style"),a=document.createTextNode(n);r.appendChild(a),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function On(e,t={}){let{width:n,height:r}=Me(e,t),a=await te(e,t,!0);return await wt(a,t),await He(a,t),ht(a,t),await st(a,n,r)}async function Un(e,t={}){let{width:n,height:r}=Me(e,t),a=await On(e,t),o=await V(a),s=document.createElement("canvas"),l=s.getContext("2d"),p=t.pixelRatio||at(),u=t.canvasWidth||n,m=t.canvasHeight||r;return s.width=u*p,s.height=m*p,t.skipAutoScale||ot(s),s.style.width=`${u}`,s.style.height=`${m}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,s.width,s.height)),l.drawImage(o,0,0,s.width,s.height),s}async function kt(e,t={}){let n=await Un(e,t);return await it(n)}var Nn="data-builder-hide",De={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},Et=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function Ct(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function St(e){return e==="video"?De.video:e==="image"?De.image:De.file}function he(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function Lt(e=15e3){let t=await Promise.race([kt(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(O)!==null&&r?.hasAttribute?.(O)||r?.hasAttribute?.(Nn))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${qn()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function qn(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function ne(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}var _n={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",cancel:"Cancel",markdownHint:"Markdown supported \u2014 **bold**, `code`, lists.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinAnother:"Pin another",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",apps:"Build",appAgents:"Agents",appSkills:"Skills",appIssues:"Issues",appVault:"Vault",appMcp:"MCP",appSources:"Sources",appDocs:"Library",appBrain:"Brain",appChat:"Chat",appTerminal:"Terminal",dir:"ltr"},Wn={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",cancel:"\u0625\u0644\u063A\u0627\u0621",markdownHint:"\u064A\u062F\u0639\u0645 Markdown \u2014 **\u0639\u0631\u064A\u0636**\u060C `\u0634\u064A\u0641\u0631\u0629`\u060C \u0642\u0648\u0627\u0626\u0645.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinAnother:"\u062A\u062D\u062F\u064A\u062F \u0645\u0648\u0642\u0639 \u0622\u062E\u0631",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",apps:"\u0627\u0644\u0628\u0646\u0627\u0621",appAgents:"\u0627\u0644\u0648\u0643\u0644\u0627\u0621",appSkills:"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A",appIssues:"\u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",appVault:"\u0627\u0644\u062E\u0632\u0646\u0629",appMcp:"MCP",appSources:"\u0627\u0644\u0645\u0635\u0627\u062F\u0631",appDocs:"\u0627\u0644\u0645\u0643\u062A\u0628\u0629",appBrain:"\u0627\u0644\u062F\u0645\u0627\u063A",appChat:"\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",appTerminal:"\u0627\u0644\u0637\u0631\u0641\u064A\u0629",dir:"rtl"};function fe(e){return e.toLowerCase().startsWith("ar")?Wn:_n}function Tt(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},a=p=>{let u=document.elementFromPoint(p.clientX,p.clientY);if(!u||de(u)||u===document.body||u===document.documentElement){r();return}u!==n&&(r(),n=u,u.classList.add("builder-pin-hover"))},o=p=>{let u=document.elementFromPoint(p.clientX,p.clientY);if(!u||de(u))return;p.preventDefault(),p.stopPropagation();let m=Je(u);l(),e(m,u)},s=p=>{p.key==="Escape"&&(p.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",a,!0),document.removeEventListener("click",o,!0),document.removeEventListener("keydown",s,!0)}return document.addEventListener("mousemove",a,!0),document.addEventListener("click",o,!0),document.addEventListener("keydown",s,!0),l}function ge(e){let t=Qe(e);if(!t.el||t.confidence<Ze)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var At="http://www.w3.org/2000/svg",jn={messageSquare:[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}],["path",{d:"M13 8H7"}],["path",{d:"M17 12H7"}]],x:[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]],plus:[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]],pin:[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{cx:"12",cy:"10",r:"3"}]],paperclip:[["path",{d:"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"}]],camera:[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}],["circle",{cx:"12",cy:"13",r:"3"}]],eye:[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]],arrowRight:[["path",{d:"M5 12h14"}],["path",{d:"m12 5 7 7-7 7"}]],chevronRight:[["path",{d:"m9 18 6-6-6-6"}]],agents:[["path",{d:"M12 8V4H8"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2"}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],skills:[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"}],["path",{d:"M22 10v6"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5"}]],issues:[["rect",{x:"3",y:"5",width:"6",height:"6",rx:"1"}],["path",{d:"m3 17 2 2 4-4"}],["path",{d:"M13 6h8"}],["path",{d:"M13 12h8"}],["path",{d:"M13 18h8"}]],vault:[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 7.9 2.7 2.7"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 10.6 2.7-2.7"}],["circle",{cx:"7.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 16.1 2.7-2.7"}],["circle",{cx:"16.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 13.4 2.7 2.7"}],["circle",{cx:"12",cy:"12",r:"2"}]],sources:[["path",{d:"M4 11a9 9 0 0 1 9 9"}],["path",{d:"M4 4a16 16 0 0 1 16 16"}],["circle",{cx:"5",cy:"19",r:"1"}]],docs:[["rect",{width:"8",height:"18",x:"3",y:"3",rx:"1"}],["path",{d:"M7 3v18"}],["path",{d:"M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"}]],brain:[["path",{d:"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"}],["path",{d:"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"}],["path",{d:"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"}],["path",{d:"M17.599 6.5a3 3 0 0 0 .399-1.375"}],["path",{d:"M6.003 5.125A3 3 0 0 0 6.401 6.5"}],["path",{d:"M3.477 10.896a4 4 0 0 1 .585-.396"}],["path",{d:"M19.938 10.5a4 4 0 0 1 .585.396"}],["path",{d:"M6 18a4 4 0 0 1-1.967-.516"}],["path",{d:"M19.967 17.484A4 4 0 0 1 18 18"}]],chat:[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],mcp:[["path",{d:"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"}],["path",{d:"m2 22 3-3"}],["path",{d:"M7.5 13.5 10 11"}],["path",{d:"M10.5 16.5 13 14"}],["path",{d:"m18 3-4 4h6l-4 4"}]],terminal:[["path",{d:"m7 11 2-2-2-2"}],["path",{d:"M11 13h4"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}]]};function T(e,t=14){let n=document.createElementNS(At,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let[r,a]of jn[e]){let o=document.createElementNS(At,r);for(let[s,l]of Object.entries(a))o.setAttribute(s,l);n.appendChild(o)}return n}function R(e,t,n,r=14){e.replaceChildren(),e.appendChild(T(t,r));let a=document.createElement("span");a.textContent=n,e.appendChild(a)}function xe(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let a=n[r],o=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(a);if(o){let m=o[1][0],f=[];for(r++;r<n.length&&!new RegExp(`^\\s*${m}{3,}\\s*$`).test(n[r]);)f.push(n[r]),r++;r++;let w=document.createElement("pre");w.className="md-pre";let C=document.createElement("code");o[2]&&(C.className=`lang-${o[2]}`),C.textContent=f.join(`
`),w.appendChild(C),t.appendChild(w);continue}if(!a.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(a)){t.appendChild(document.createElement("hr")),r++;continue}let s=/^\s*(#{1,6})\s+(.*)$/.exec(a);if(s){let m=Math.min(6,3+s[1].length),f=document.createElement(`h${m}`);f.className="md-h",f.appendChild(be(s[2])),t.appendChild(f),r++;continue}if(/^\s*>\s?/.test(a)){let m=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)m.push(n[r].replace(/^\s*>\s?/,"")),r++;let f=document.createElement("blockquote");f.className="md-quote",f.appendChild(xe(m.join(`
`))),t.appendChild(f);continue}let l=/^\s*[-*+]\s+/,p=/^\s*\d+[.)]\s+/;if(l.test(a)||p.test(a)){let m=!l.test(a),f=m?p:l,w=document.createElement(m?"ol":"ul");for(w.className="md-list";r<n.length&&f.test(n[r]);){let C=document.createElement("li"),g=n[r].replace(f,"");for(r++;r<n.length&&n[r].trim()&&!f.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)g+=`
`+n[r].trim(),r++;C.appendChild(be(g)),w.appendChild(C)}t.appendChild(w);continue}let u=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r]);)u.push(n[r]),r++;if(u.length){let m=document.createElement("p");m.className="md-p",m.appendChild(be(u.join(`
`))),t.appendChild(m)}else r++}return t}var Vn=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function be(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=Vn.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&Pt(t,n.slice(0,r.index)),r[1]){let a=document.createElement("code");a.className="md-code",a.textContent=r[2].trim(),t.appendChild(a)}else r[3]!==void 0?t.appendChild(Mt(r[4],r[3]||r[4])):r[5]?t.appendChild(Fe("strong","md-strong",r[6])):r[7]?t.appendChild(Fe("del","md-del",r[8])):r[9]?t.appendChild(Fe("em","md-em",r[10])):r[11]&&t.appendChild(Mt(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&Pt(t,n),t}function Fe(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(be(n)),r}function Mt(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function Pt(e,t){t.split(`
`).forEach((r,a)=>{a&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function Rt(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let a=await r.json();return{id:a.id,number:a.number,title:a.title,body:a.body??"",type:a.type,status:a.status,priority:a.priority,route:a.route??"",pageUrl:a.pageUrl??"",createdAt:a.createdAt??"",pins:a.pins??[],comments:a.comments??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function $t(e,t,n){let r=fe(e),a=document.createElement("div");a.className="detail hidden";let o=null;async function s(u){a.replaceChildren(y("p","empty",r.loading));try{o=await t.get(u),l()}catch(m){a.replaceChildren(y("p","note err",String(m.message)))}}function l(){if(!o)return;let u=o;a.replaceChildren();let m=y("div","d-head",""),f=ve("ghost","\u2190 "+r.onThisPage);f.addEventListener("click",n);let w=ve("ghost","\u2197");w.title=r.report,w.addEventListener("click",()=>window.open(`/issues/${u.number}`,"_blank","noopener")),m.append(f,w),a.appendChild(m);let C=y("div","d-meta","");if(C.append(y("span","num",`#${u.number}`),y("span",`chip ${u.type}`,r[u.type]??u.type),y("span","chip status",u.status.replace("_"," "))),a.append(C,y("h3","d-title",u.title)),u.body){let k=y("div","d-body","");k.appendChild(xe(u.body)),a.appendChild(k)}if(u.pins.length){a.appendChild(y("div","label",r.location));for(let k of u.pins){let d=y("div","d-pin","");d.appendChild(y("span","nm",`<${k.tag??"?"}>${k.name?` \u201C${k.name}\u201D`:""}`));let b=ve("ghost","");b.appendChild(T("eye",14)),b.title=r.pin,b.addEventListener("click",()=>{let x=ge(k);p(x.found?`Found via ${x.by} (${Math.round(x.confidence*100)}%)`:"The pinned element is not on this page any more.",x.found?"ok":"err")}),d.appendChild(b),a.appendChild(d)}}a.appendChild(y("div","label","Comments")),u.comments.length||a.appendChild(y("p","empty","No comments yet."));for(let k of u.comments){let d=y("div","d-comment",""),b=y("p","who",k.author||"someone");k.kind==="agent"&&b.appendChild(y("span","chip agent","agent"));let x=y("div","txt","");x.appendChild(xe(k.body)),d.append(b,x),a.appendChild(d)}let g=document.createElement("textarea");g.placeholder="Add a comment\u2026",g.rows=3;let A=ve("primary","Comment");A.addEventListener("click",async()=>{let k=g.value.trim();if(k){A.disabled=!0;try{await t.comment(u.number,k),g.value="",await s(u.number)}catch(d){p(String(d.message),"err")}finally{A.disabled=!1}}}),a.append(g,A)}function p(u,m){let f=y("p",`note ${m}`,u);a.appendChild(f),setTimeout(()=>f.remove(),4e3)}return{el:a,load:s,destroy:()=>a.remove()}}function y(e,t,n){let r=document.createElement(e);return r.className=t,n&&(r.textContent=n),r}function ve(e,t){let n=document.createElement("button");return n.type="button",n.className=e,n.textContent=t,n}var It=`
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
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --bg: #15171d; --surface: #1c1f27; --surface-2: #262a35;
    --border: #2b303c; --border-strong: #414957;
    --text: #edeef1; --text-2: #aab2c0; --muted: #8a93a5;
    --accent-ink: color-mix(in srgb, var(--accent) 55%, #ffffff);
    --ok: #75e0a7; --danger: #f97066;
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
  --ok: #75e0a7; --danger: #f97066;
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

.label {
  margin: var(--sp-5) 0 var(--sp-2);
  font-size: var(--fs-2xs); font-weight: 650;
  letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
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
/* Status and agent are badges, not types \u2014 pill treatment, no dot. */
.chip.status {
  padding: 2px 8px; border-radius: var(--r-full);
  background: var(--surface-2); color: var(--text-2);
}
.chip.status::before { display: none; }
.chip.agent {
  padding: 2px 8px; border-radius: var(--r-full);
  background: var(--accent); color: var(--accent-fg);
}
.chip.agent::before { display: none; }

/* An agent holds a lease on this issue. */
.spin {
  flex: none; width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid var(--border); border-top-color: var(--accent);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
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
.hidden { display: none !important; }

/* ---- in-panel issue detail ---- */
.detail { display: flex; flex-direction: column; gap: 10px; }
.d-head { display: flex; align-items: center; justify-content: space-between; }
.d-meta { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
.d-meta .num { color: var(--muted); font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.d-title {
  margin: 2px 0 0; font-size: var(--fs-xl); font-weight: 650;
  letter-spacing: -.01em; line-height: 1.35;
}
.d-body { margin: 0; font-size: var(--fs-md); line-height: var(--lh-body);
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--r-sm); padding: 10px var(--sp-3); }
.d-pin { display: flex; align-items: flex-start; gap: var(--sp-2); font-size: var(--fs-sm);
         background: var(--surface); border: 1px solid var(--border);
         border-radius: var(--r-sm); padding: 7px 10px; }
/* min-width:0 lets the flex item shrink below its content width \u2014 without it
   a long accessible name (the pinned node's whole text) forces the panel wider
   and the WHOLE slide-over scrolls sideways. */
.d-pin .nm { flex: 1; min-width: 0; font-family: var(--mono);
             overflow-wrap: anywhere; word-break: break-word; }
.d-comment { border: 1px solid var(--border); border-radius: var(--r-sm); padding: 9px var(--sp-3); }
.d-comment .who { margin: 0 0 var(--sp-1); font-size: var(--fs-xs); font-weight: 600; color: var(--muted);
                  display: flex; align-items: center; gap: 6px; }
.d-comment .txt { margin: 0; font-size: var(--fs-sm); line-height: var(--lh-body); white-space: pre-wrap; }

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
.d-body hr, .txt hr { margin: 10px 0; border: 0; border-top: 1px solid var(--border); }
.txt { margin: 0; font-size: var(--fs-sm); }

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
:host([dir="rtl"]) .row .go { transform: scaleX(-1); }
:host([dir="rtl"]) .board-link:hover .ico { transform: scaleX(-1) translateX(2px); }
:host([dir="rtl"]) .row:hover .go { transform: scaleX(-1) translateX(2px); }

@media (prefers-reduced-motion: reduce) {
  .panel, .modal, .fab, .primary, .app, .app-ico, .row, .row .go,
  .board-link .ico, .pill, .ghost, .x, .modal-x { transition: none; }
  .modal[data-open="true"] .modal-card { animation: none; }
  .fab:hover, .app:hover .app-ico, .row:hover .go { transform: none; }
  .spin { animation: none; border-top-color: var(--border); }
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

`;function Dt(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let a=await r.json().catch(()=>null);return Array.isArray(a?.issues)?a.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??""}));for(let s of n.attachments)r.append("attachments",s.blob,s.name),r.append("attachment_kinds",s.kind);let a=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!a.ok){let s=await a.text().catch(()=>"");throw new Error(s||`submit failed (${a.status})`)}let o=await a.json();return{id:String(o.id??""),number:Number(o.number??0)}}}}var Ft="builder.fab.position",Xn=["bug","feature","question","discussion"],Gn=8;function Yn(e={}){let t=fe(e.locale??document.documentElement.lang??"en"),n=e.transport??Dt(e.apiBase),r=e.locale??"en",a=document.createElement("div");a.setAttribute(O,""),a.setAttribute("dir",t.dir),e.theme&&a.setAttribute("data-theme",e.theme),document.body.appendChild(a);let o=a.attachShadow({mode:"open"}),s=document.createElement("style");s.textContent=It+(e.accent?`:host{--accent:${Zn(e.accent)}}`:""),o.appendChild(s);let l=document.createElement("style");l.setAttribute(O,""),l.textContent=Ht,document.head.appendChild(l);let p=[],u=[],m=[],f="bug",w=!1,C=!1,g=null,A=null,k=document.createElement("div");k.innerHTML=`
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
            <input type="file" class="filein hidden" multiple accept="${Et}">

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

`,o.appendChild(k);let d=i=>o.querySelector(i),b=d(".fab"),x=d(".panel"),ze=d(".form"),Be=d(".listing"),re=d(".modal"),L=d(".modal-card"),U=d(".modal-head"),ye=d(".modal-x"),Oe=d(".cancel"),ae=d(".rows"),we=d(".pills"),ke=d(".note"),Ue=d(".files"),oe=d(".filein"),Ne=d(".count"),zt=d(".appgrid"),ie=d('input[name="title"]'),qe=d('textarea[name="body"]'),Bt=d('input[name="url"]'),$=d(".pin");if(e.framedHost){let i="Not available here: this page frames your product on another origin, and the browser will not let one origin read another's pixels or elements. Load the widget inside the product for pinning and screenshots.";for(let c of[".pin",".shot"]){let h=d(c);h.disabled=!0,h.title=i,h.setAttribute("aria-disabled","true")}}let Ee=d(".clearpin"),Ce=d(".pin-preview"),N=d(".send"),se=new WeakMap;function Ot(i){let c=se.get(i);return c||(c=URL.createObjectURL(i.blob),se.set(i,c)),c}function Se(i){let c=se.get(i);c&&(URL.revokeObjectURL(c),se.delete(i))}d(".fab-label").textContent=t.fab,d("h2").textContent=t.title,x.setAttribute("aria-label",t.title),d(".brand-ico").replaceChildren(T("messageSquare",16)),d(".brand-sub").textContent=ne(),d(".fab-ico").replaceChildren(T("messageSquare",14)),d(".x").replaceChildren(T("x",16)),d(".x").setAttribute("aria-label",t.close),d(".intro").textContent=t.intro,R(d(".report"),"plus",t.report,15),d(".lbl-type").textContent=t.type,d(".lbl-title").textContent=t.titleLabel,d(".lbl-details").textContent=t.details,d(".lbl-url").textContent=t.pageUrl,d(".lbl-loc").textContent=t.location,d(".lbl-att").textContent=t.attachments,d(".lbl-page").textContent=t.onThisPage,R(d(".board-link"),"arrowRight",t.openBoard),d(".lbl-apps").textContent=t.apps,d(".modal-title").textContent=t.reportTitle,ye.setAttribute("aria-label",t.close),ye.appendChild(T("x",16)),re.setAttribute("aria-label",t.reportTitle),Oe.textContent=t.cancel,d(".lbl-md").textContent=t.markdownHint,ie.placeholder=t.titlePlaceholder,qe.placeholder=t.detailsPlaceholder,R($,"pin",t.pin),R(Ee,"x",t.clear),R(d(".addfile"),"paperclip",t.addFile),R(d(".shot"),"camera",t.screenshot),N.textContent=t.submit;for(let i of Xn){let c=document.createElement("button");c.type="button",c.className="pill",c.dataset.type=i,c.textContent=t[i],c.setAttribute("aria-pressed",String(i===f)),c.addEventListener("click",()=>{f=i,we.querySelectorAll(".pill").forEach(h=>h.setAttribute("aria-pressed",String(h.dataset.type===i)))}),we.appendChild(c)}let Ut=4,M=null,Le=(i,c)=>{let h=Math.max(8,Math.min(i,window.innerWidth-80)),v=Math.max(8,Math.min(c,window.innerHeight-48));b.style.insetInlineEnd=`${h}px`,b.style.insetBlockEnd=`${v}px`},_e=Kn();Le(_e?.right??e.position?.right??24,_e?.bottom??e.position?.bottom??24),b.addEventListener("pointerdown",i=>{if(i.button!==0)return;let c=b.getBoundingClientRect();M={x:i.clientX,y:i.clientY,ox:window.innerWidth-c.right,oy:window.innerHeight-c.bottom,moved:!1},b.setPointerCapture(i.pointerId)}),b.addEventListener("pointermove",i=>{if(!M)return;let c=i.clientX-M.x,h=i.clientY-M.y;!M.moved&&Math.hypot(c,h)<Ut||(M.moved=!0,Le(M.ox-c,M.oy-h))}),b.addEventListener("pointerup",i=>{if(!M)return;let c=M.moved;if(M=null,b.releasePointerCapture(i.pointerId),c){let h=b.getBoundingClientRect();Jn(window.innerWidth-h.right,window.innerHeight-h.bottom);return}We()}),b.addEventListener("keydown",i=>{(i.key==="Enter"||i.key===" ")&&(i.preventDefault(),We())}),window.addEventListener("resize",()=>{let i=b.getBoundingClientRect();Le(window.innerWidth-i.right,window.innerHeight-i.bottom)});function We(){x.dataset.open==="true"?z():je()}function je(){x.dataset.open="true",b.setAttribute("aria-expanded","true"),Bt.value=location.href,d(".brand-sub").textContent=ne(),J()}function z(){x.dataset.open="false",x.dataset.detail="false",b.setAttribute("aria-expanded","false"),B(!1),g?.(),g=null}let Nt=[{key:"agents",path:"/agents",color:"#8b5cf6",label:t.appAgents},{key:"skills",path:"/skills",color:"#06b6d4",label:t.appSkills},{key:"issues",path:"/issues",color:"#f59e0b",label:t.appIssues},{key:"vault",path:"/vault",color:"#10b981",label:t.appVault},{key:"sources",path:"/sources",color:"#3b82f6",label:t.appSources},{key:"docs",path:"/library",color:"#f43f5e",label:t.appDocs},{key:"brain",path:"/brain",color:"#a855f7",label:t.appBrain},{key:"chat",path:"/chat",color:"#14b8a6",label:t.appChat},{key:"mcp",path:"/mcp",color:"#ec4899",label:t.appMcp},{key:"terminal",path:"/terminal",color:"#64748b",label:t.appTerminal}];function Ve(){let i=(e.apiBase??"").trim();if(!i)return"";try{return new URL(i,location.href).origin}catch{return""}}let qt=(i,c)=>`${Ve()}${i}${c?"?embed=1":""}`;for(let i of Nt){let c=document.createElement("button");c.type="button",c.className="app",c.dataset.app=i.key;let h=document.createElement("span");h.className="app-ico",h.style.background=i.color,h.appendChild(T(i.key,18));let v=document.createElement("span");v.textContent=i.label,c.append(h,v),c.addEventListener("click",()=>_t(i)),zt.appendChild(c)}function _t(i){let c=Ve(),h=qt(i.path,!0);if(c&&c!==location.origin){window.open(h,"_blank","noopener"),z();return}try{sessionStorage.setItem("builder:standalone","1"),sessionStorage.setItem("builder:standalone:return",location.href)}catch{}z(),location.assign(h)}let q=null;U.addEventListener("pointerdown",i=>{if(i.target.closest(".modal-x"))return;let c=L.getBoundingClientRect();L.style.position="fixed",L.style.margin="0",L.style.left=`${c.left}px`,L.style.top=`${c.top}px`,q={dx:i.clientX-c.left,dy:i.clientY-c.top},U.setPointerCapture(i.pointerId)}),U.addEventListener("pointermove",i=>{if(!q)return;let c=L.getBoundingClientRect(),h=Math.min(Math.max(i.clientX-q.dx,8-c.width+80),innerWidth-80),v=Math.min(Math.max(i.clientY-q.dy,8),innerHeight-44);L.style.left=`${h}px`,L.style.top=`${v}px`});let Xe=i=>{if(q){q=null;try{U.releasePointerCapture(i.pointerId)}catch{}}};U.addEventListener("pointerup",Xe),U.addEventListener("pointercancel",Xe);function Wt(){L.style.position="",L.style.left="",L.style.top="",L.style.margin=""}ye.addEventListener("click",()=>B(!1)),Oe.addEventListener("click",()=>B(!1)),document.addEventListener("keydown",i=>{i.key==="Escape"&&w&&!g&&B(!1)}),d(".x").addEventListener("click",z),o.addEventListener("keydown",i=>{i.key==="Escape"&&!g&&z()});function Ge(i){x.dataset.open!=="true"||g||i.composedPath().includes(a)||z()}document.addEventListener("click",Ge,!0);function B(i){w=i,re.dataset.open=i?"true":"false",i?(Wt(),setTimeout(()=>ie.focus(),30)):(jt(),g?.(),g=null)}d(".report").addEventListener("click",()=>B(!0));function jt(){ze.reset(),u=[],m.forEach(Se),m=[],f="bug",we.querySelectorAll(".pill").forEach(i=>i.setAttribute("aria-pressed",String(i.dataset.type==="bug"))),K(),le(),I("")}function I(i,c=""){ke.textContent=i,ke.className=`note ${c}`.trim(),ke.classList.toggle("hidden",!i)}$.addEventListener("click",()=>{if(g){g(),g=null,$.setAttribute("aria-pressed","false"),R($,"pin",t.pin);return}x.dataset.open="false",re.dataset.open="false",$.setAttribute("aria-pressed","true"),$.textContent=t.pinning;let i=()=>{w?re.dataset.open="true":x.dataset.open="true"};g=Tt((c,h)=>{u.length<Gn&&(u=[...u,c]),g=null,i(),K(),h.classList.add("builder-pin-found"),setTimeout(()=>h.classList.remove("builder-pin-found"),3e3)},()=>{g=null,i(),K()})}),Ee.addEventListener("click",()=>{u=[],K()});function K(){let i=u.length>0;$.setAttribute("aria-pressed",String(i)),R($,"pin",i?t.pinAnother:t.pin),Ee.classList.toggle("hidden",!i),Ce.classList.toggle("hidden",!i),Ce.textContent="",u.forEach((c,h)=>{let v=document.createElement("div");v.className="pinrow";let _=document.createElement("span");_.className="pinnum",_.textContent=String(h+1);let H=c.name||c.hint||"",D=document.createElement("span");D.className="pintxt",D.textContent=`<${c.tag??"?"}>${H?` \u201C${H}\u201D`:""}`;let W=document.createElement("button");W.type="button",W.className="pindel",W.setAttribute("aria-label",`${t.clear} ${h+1}`),W.appendChild(T("x",12)),W.addEventListener("click",()=>{u.splice(h,1),K()}),v.append(_,D,W),Ce.appendChild(v)})}d(".addfile").addEventListener("click",()=>oe.click()),oe.addEventListener("change",()=>{for(let i of Array.from(oe.files??[]))Vt(i);oe.value=""});function Vt(i){let c=Ct(i.type),h=St(c);if(i.size>h){I(`${i.name} is ${he(i.size)} \u2014 the limit is ${he(h)}.`,"err");return}m.push({name:i.name,mime:i.type,size:i.size,kind:c,blob:i}),le(),I("")}d(".shot").addEventListener("click",async()=>{let i=d(".shot");i.disabled=!0;let c=x.dataset.open;x.dataset.open="false",a.style.visibility="hidden";try{await new Promise(h=>setTimeout(h,120)),m.push(await Lt()),le(),I("")}catch(h){I(String(h.message||h),"err")}finally{a.style.visibility="",x.dataset.open=c??"true",i.disabled=!1}});function le(){Ue.replaceChildren(),m.forEach((i,c)=>{let h=document.createElement("div");if(h.className="file",i.kind==="screenshot"||i.kind==="image"){let D=document.createElement("img");D.className="thumb",D.src=Ot(i),D.alt="",h.appendChild(D)}let v=document.createElement("span");v.className="nm",v.textContent=i.name;let _=document.createElement("span");_.textContent=he(i.size);let H=document.createElement("button");H.type="button",H.replaceChildren(T("x",12)),H.setAttribute("aria-label",t.clear),H.addEventListener("click",()=>{Se(i),m.splice(c,1),le()}),h.append(v,_,H),Ue.appendChild(h)})}async function Ye(){if(C)return;let i=ie.value.trim();if(!i){I(t.titleRequired,"err"),ie.focus();return}C=!0,N.disabled=!0,N.textContent=t.submitting;try{let c=await n.create({type:f,title:i,body:qe.value,route:ne(),pageUrl:location.href,locale:r,pins:u,attachments:m});I(t.created(c.number),"ok"),e.onCreated?.(c),setTimeout(()=>{B(!1),J()},900)}catch(c){I(String(c.message||t.failed),"err")}finally{C=!1,N.disabled=!1,N.textContent=t.submit}}N.addEventListener("click",Ye),ze.addEventListener("submit",i=>{i.preventDefault(),Ye()});async function J(){if(!w){ae.replaceChildren(F("div","empty",t.loading));try{p=await n.listByRoute(ne())}catch{p=[]}if(Ne.textContent=p.length>9?"9+":String(p.length),Ne.classList.toggle("hidden",p.length===0),d(".lbl-page").textContent=p.length?t.issueCount(p.length):t.onThisPage,ae.replaceChildren(),!p.length){ae.appendChild(F("div","empty",t.none));return}for(let i of p){let c=document.createElement("button");if(c.type="button",c.className="row",c.append(F("span","num",`#${i.number}`),F("span",`chip ${i.type}`,t[i.type])),c.appendChild(F("span","t",i.title)),i.busy){let v=F("span","agent-tag","");v.appendChild(F("span","spin","")),v.appendChild(F("span","who",i.agent||t.agentWorking)),v.setAttribute("title",i.agent?t.agentWorkingBy(i.agent):t.agentWorking),c.appendChild(v)}let h=T("chevronRight",14);h.classList.add("go"),c.appendChild(h),c.addEventListener("click",()=>void Xt(i.number)),ae.appendChild(c)}}}async function Xt(i){A||(A=$t(r,Rt(e.apiBase),()=>{A?.el.classList.add("hidden"),Be.classList.remove("hidden"),d(".report").classList.remove("hidden"),d(".apps").classList.remove("hidden"),x.dataset.detail="false",J()}),d(".body").appendChild(A.el)),Be.classList.add("hidden"),d(".report").classList.add("hidden"),d(".apps").classList.add("hidden"),B(!1),A.el.classList.remove("hidden"),x.dataset.detail="true",await A.load(i)}let Gt={open:je,close:z,refresh:()=>void J(),destroy(){g?.(),m.forEach(Se),document.removeEventListener("click",Ge,!0),a.remove(),l.remove()}};return J(),Gt}function F(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function Kn(){try{let e=localStorage.getItem(Ft);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function Jn(e,t){try{localStorage.setItem(Ft,JSON.stringify({right:e,bottom:t}))}catch{}}function Zn(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return en(Qn);})();
