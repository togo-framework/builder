"use strict";var BuilderIssues=(()=>{var we=Object.defineProperty;var Ft=Object.getOwnPropertyDescriptor;var zt=Object.getOwnPropertyNames;var Ot=Object.prototype.hasOwnProperty;var Ut=(e,t)=>{for(var n in t)we(e,n,{get:t[n],enumerable:!0})},Bt=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of zt(t))!Ot.call(e,i)&&i!==n&&we(e,i,{get:()=>t[i],enumerable:!(r=Ft(t,i))||r.enumerable});return e};var _t=e=>Bt(we({},"__esModule",{value:!0}),e);var Un={};Ut(Un,{highlightPin:()=>ce,mount:()=>Hn});var M="data-builder-sdk";function re(e){return!!e?.closest?.(`[${M}]`)}function We(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,i={tag:e.tagName.toLowerCase(),hint:N(e),css:Wt(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},o=e.getAttribute("data-testid")??e.getAttribute("data-test-id");o&&(i.testid=o),e.id&&!je(e.id)&&(i.domId=e.id);let a=e.getAttribute("role")??Nt(e);a&&(i.role=a);let l=Ge(e);l&&(i.name=l);for(let[c,d]of qt(i))try{let m=document.querySelectorAll(d);m.length===1&&m[0]===e&&i.verified.push(c)}catch{}return i}function qt(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${V(e.testid)}"]`]),e.domId&&t.push(["domId",`#${V(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var Ne=.5;function Ve(e){if(e.testid){let t=ne(`[data-testid="${V(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=qe(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=ne(`[role="${V(e.role)}"]`).filter(n=>Ge(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=qe(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=ne(e.css);if(t.length===1){let n=t[0],r=!e.hint||ve(N(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=ne(e.tag||"*").filter(n=>ve(N(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function qe(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,i=null,o=1/0;for(let a of e){let l=a.getBoundingClientRect(),c=l.left/n-t.rect.x,d=l.top/r-t.rect.y,m=Math.hypot(c,d);t.hint&&ve(N(a),t.hint)&&(m-=.5),m<o&&([i,o]=[a,m])}return i}function ne(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!re(t))}catch{return[]}}function Wt(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!je(n.id)){t.unshift(`#${V(n.id)}`);break}let i=n.tagName.toLowerCase(),o=n.parentElement;if(!o){t.unshift(i);break}let a=Array.from(o.children).filter(l=>l.tagName===n.tagName);t.unshift(a.length>1?`${i}:nth-of-type(${a.indexOf(n)+1})`:i),n=o}return t.join(" > ").slice(0,512)}function je(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function N(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function ve(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function Ge(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||N(e)).slice(0,80)}function Nt(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function V(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function Ke(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),i=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(i),t&&(r.href=t),i.href=e,i.href}var Ye=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function T(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var H=null;function oe(e={}){return H||(e.includeStyleProperties?(H=e.includeStyleProperties,H):(H=T(window.getComputedStyle(document.documentElement)),H))}function ie(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function Vt(e){let t=ie(e,"border-left-width"),n=ie(e,"border-right-width");return e.clientWidth+t+n}function jt(e){let t=ie(e,"border-top-width"),n=ie(e,"border-bottom-width");return e.clientHeight+t+n}function Ee(e,t={}){let n=t.width||Vt(e),r=t.height||jt(e);return{width:n,height:r}}function Xe(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var S=16384;function Je(e){(e.width>S||e.height>S)&&(e.width>S&&e.height>S?e.width>e.height?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S):e.width>S?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S))}function Qe(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),i=r.length,o=new Uint8Array(i);for(let a=0;a<i;a+=1)o[a]=r.charCodeAt(a);n(new Blob([o],{type:t.type?t.type:"image/png"}))})}function F(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function Gt(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function Ze(e,t,n){let r="http://www.w3.org/2000/svg",i=document.createElementNS(r,"svg"),o=document.createElementNS(r,"foreignObject");return i.setAttribute("width",`${t}`),i.setAttribute("height",`${n}`),i.setAttribute("viewBox",`0 0 ${t} ${n}`),o.setAttribute("width","100%"),o.setAttribute("height","100%"),o.setAttribute("x","0"),o.setAttribute("y","0"),o.setAttribute("externalResourcesRequired","true"),i.appendChild(o),o.appendChild(e),Gt(i)}var E=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||E(n,t)};function Kt(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function Yt(e,t){return oe(t).map(n=>{let r=e.getPropertyValue(n),i=e.getPropertyPriority(n);return`${n}: ${r}${i?" !important":""};`}).join(" ")}function Xt(e,t,n,r){let i=`.${e}:${t}`,o=n.cssText?Kt(n):Yt(n,r);return document.createTextNode(`${i}{${o}}`)}function et(e,t,n,r){let i=window.getComputedStyle(e,n),o=i.getPropertyValue("content");if(o===""||o==="none")return;let a=Ye();try{t.className=`${t.className} ${a}`}catch{return}let l=document.createElement("style");l.appendChild(Xt(a,n,i,r)),t.appendChild(l)}function tt(e,t,n){et(e,t,":before",n),et(e,t,":after",n)}var nt="application/font-woff",rt="image/jpeg",Jt={woff:nt,woff2:nt,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:rt,jpeg:rt,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function Qt(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function z(e){let t=Qt(e).toLowerCase();return Jt[t]||""}function Zt(e){return e.split(/,/)[1]}function j(e){return e.search(/^(data:)/)!==-1}function Se(e,t){return`data:${t};base64,${e}`}async function ke(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let i=await r.blob();return new Promise((o,a)=>{let l=new FileReader;l.onerror=a,l.onloadend=()=>{try{o(n({res:r,result:l.result}))}catch(c){a(c)}},l.readAsDataURL(i)})}var Ce={};function en(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function O(e,t,n){let r=en(e,t,n.includeQueryParams);if(Ce[r]!=null)return Ce[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let i;try{let o=await ke(e,n.fetchRequestInit,({res:a,result:l})=>(t||(t=a.headers.get("Content-Type")||""),Zt(l)));i=Se(o,t)}catch(o){i=n.imagePlaceholder||"";let a=`Failed to fetch resource: ${e}`;o&&(a=typeof o=="string"?o:o.message),a&&console.warn(a)}return Ce[r]=i,i}async function tn(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):F(t)}async function nn(e,t){if(e.currentSrc){let o=document.createElement("canvas"),a=o.getContext("2d");o.width=e.clientWidth,o.height=e.clientHeight,a?.drawImage(e,0,0,o.width,o.height);let l=o.toDataURL();return F(l)}let n=e.poster,r=z(n),i=await O(n,r,t);return F(i)}async function rn(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await G(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function on(e,t){return E(e,HTMLCanvasElement)?tn(e):E(e,HTMLVideoElement)?nn(e,t):E(e,HTMLIFrameElement)?rn(e,t):e.cloneNode(it(e))}var an=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",it=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function sn(e,t,n){var r,i;if(it(t))return t;let o=[];return an(e)&&e.assignedNodes?o=T(e.assignedNodes()):E(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?o=T(e.contentDocument.body.childNodes):o=T(((i=e.shadowRoot)!==null&&i!==void 0?i:e).childNodes),o.length===0||E(e,HTMLVideoElement)||await o.reduce((a,l)=>a.then(()=>G(l,n)).then(c=>{c&&t.appendChild(c)}),Promise.resolve()),t}function ln(e,t,n){let r=t.style;if(!r)return;let i=window.getComputedStyle(e);i.cssText?(r.cssText=i.cssText,r.transformOrigin=i.transformOrigin):oe(n).forEach(o=>{let a=i.getPropertyValue(o);o==="font-size"&&a.endsWith("px")&&(a=`${Math.floor(parseFloat(a.substring(0,a.length-2)))-.1}px`),E(e,HTMLIFrameElement)&&o==="display"&&a==="inline"&&(a="block"),o==="d"&&t.getAttribute("d")&&(a=`path(${t.getAttribute("d")})`),r.setProperty(o,a,i.getPropertyPriority(o))})}function cn(e,t){E(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),E(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function dn(e,t){if(E(e,HTMLSelectElement)){let r=Array.from(t.children).find(i=>e.value===i.getAttribute("value"));r&&r.setAttribute("selected","")}}function un(e,t,n){return E(t,Element)&&(ln(e,t,n),tt(e,t,n),cn(e,t),dn(e,t)),t}async function pn(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let o=0;o<n.length;o++){let l=n[o].getAttribute("xlink:href");if(l){let c=e.querySelector(l),d=document.querySelector(l);!c&&d&&!r[l]&&(r[l]=await G(d,t,!0))}}let i=Object.values(r);if(i.length){let o="http://www.w3.org/1999/xhtml",a=document.createElementNS(o,"svg");a.setAttribute("xmlns",o),a.style.position="absolute",a.style.width="0",a.style.height="0",a.style.overflow="hidden",a.style.display="none";let l=document.createElementNS(o,"defs");a.appendChild(l);for(let c=0;c<i.length;c++)l.appendChild(i[c]);e.appendChild(a)}return e}async function G(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>on(r,t)).then(r=>sn(e,r,t)).then(r=>un(e,r,t)).then(r=>pn(r,t))}var ot=/url\((['"]?)([^'"]+?)\1\)/g,mn=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,fn=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function hn(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function gn(e){let t=[];return e.replace(ot,(n,r,i)=>(t.push(i),n)),t.filter(n=>!j(n))}async function bn(e,t,n,r,i){try{let o=n?Ke(t,n):t,a=z(t),l;if(i){let c=await i(o);l=Se(c,a)}else l=await O(o,a,r);return e.replace(hn(t),`$1${l}$3`)}catch{}return e}function xn(e,{preferredFontFormat:t}){return t?e.replace(fn,n=>{for(;;){let[r,,i]=mn.exec(n)||[];if(!i)return"";if(i===t)return`src: ${r};`}}):e}function Le(e){return e.search(ot)!==-1}async function ae(e,t,n){if(!Le(e))return e;let r=xn(e,n);return gn(r).reduce((o,a)=>o.then(l=>bn(l,a,t,n)),Promise.resolve(r))}async function U(e,t,n){var r;let i=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(i){let o=await ae(i,null,n);return t.style.setProperty(e,o,t.style.getPropertyPriority(e)),!0}return!1}async function yn(e,t){await U("background",e,t)||await U("background-image",e,t),await U("mask",e,t)||await U("-webkit-mask",e,t)||await U("mask-image",e,t)||await U("-webkit-mask-image",e,t)}async function wn(e,t){let n=E(e,HTMLImageElement);if(!(n&&!j(e.src))&&!(E(e,SVGImageElement)&&!j(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,i=await O(r,z(r),t);await new Promise((o,a)=>{e.onload=o,e.onerror=t.onImageErrorHandler?(...c)=>{try{o(t.onImageErrorHandler(...c))}catch(d){a(d)}}:a;let l=e;l.decode&&(l.decode=o),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=i):e.href.baseVal=i})}async function vn(e,t){let r=T(e.childNodes).map(i=>Te(i,t));await Promise.all(r).then(()=>e)}async function Te(e,t){E(e,Element)&&(await yn(e,t),await wn(e,t),await vn(e,t))}function at(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(i=>{n[i]=r[i]}),e}var st={};async function lt(e){let t=st[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},st[e]=t,t}async function ct(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,o=(n.match(/url\([^)]+\)/g)||[]).map(async a=>{let l=a.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),ke(l,t.fetchRequestInit,({result:c})=>(n=n.replace(a,`url(${c})`),[a,c]))});return Promise.all(o).then(()=>n)}function dt(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),i=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let c=i.exec(r);if(c===null)break;t.push(c[0])}r=r.replace(i,"");let o=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(a,"gi");for(;;){let c=o.exec(r);if(c===null){if(c=l.exec(r),c===null)break;o.lastIndex=l.lastIndex}else l.lastIndex=o.lastIndex;t.push(c[0])}return t}async function En(e,t){let n=[],r=[];return e.forEach(i=>{if("cssRules"in i)try{T(i.cssRules||[]).forEach((o,a)=>{if(o.type===CSSRule.IMPORT_RULE){let l=a+1,c=o.href,d=lt(c).then(m=>ct(m,t)).then(m=>dt(m).forEach(h=>{try{i.insertRule(h,h.startsWith("@import")?l+=1:i.cssRules.length)}catch(v){console.error("Error inserting rule from remote css",{rule:h,error:v})}})).catch(m=>{console.error("Error loading remote css",m.toString())});r.push(d)}})}catch(o){let a=e.find(l=>l.href==null)||document.styleSheets[0];i.href!=null&&r.push(lt(i.href).then(l=>ct(l,t)).then(l=>dt(l).forEach(c=>{a.insertRule(c,a.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",o)}}),Promise.all(r).then(()=>(e.forEach(i=>{if("cssRules"in i)try{T(i.cssRules||[]).forEach(o=>{n.push(o)})}catch(o){console.error(`Error while reading CSS rules from ${i.href}`,o)}}),n))}function Cn(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>Le(t.style.getPropertyValue("src")))}async function Sn(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=T(e.ownerDocument.styleSheets),r=await En(n,t);return Cn(r)}function ut(e){return e.trim().replace(/["']/g,"")}function kn(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(o=>{t.add(ut(o))}),Array.from(r.children).forEach(o=>{o instanceof HTMLElement&&n(o)})}return n(e),t}async function pt(e,t){let n=await Sn(e,t),r=kn(e);return(await Promise.all(n.filter(o=>r.has(ut(o.style.fontFamily))).map(o=>{let a=o.parentStyleSheet?o.parentStyleSheet.href:null;return ae(o.cssText,a,t)}))).join(`
`)}async function mt(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await pt(e,t);if(n){let r=document.createElement("style"),i=document.createTextNode(n);r.appendChild(i),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function Ln(e,t={}){let{width:n,height:r}=Ee(e,t),i=await G(e,t,!0);return await mt(i,t),await Te(i,t),at(i,t),await Ze(i,n,r)}async function Tn(e,t={}){let{width:n,height:r}=Ee(e,t),i=await Ln(e,t),o=await F(i),a=document.createElement("canvas"),l=a.getContext("2d"),c=t.pixelRatio||Xe(),d=t.canvasWidth||n,m=t.canvasHeight||r;return a.width=d*c,a.height=m*c,t.skipAutoScale||Je(a),a.style.width=`${d}`,a.style.height=`${m}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,a.width,a.height)),l.drawImage(o,0,0,a.width,a.height),a}async function ft(e,t={}){let n=await Tn(e,t);return await Qe(n)}var An="data-builder-hide",Ae={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},ht=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function gt(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function bt(e){return e==="video"?Ae.video:e==="image"?Ae.image:Ae.file}function se(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function xt(e=15e3){let t=await Promise.race([ft(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(M)!==null&&r?.hasAttribute?.(M)||r?.hasAttribute?.(An))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${Rn()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function Rn(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function Re(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}var Pn={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",dir:"ltr"},$n={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",dir:"rtl"};function le(e){return e.toLowerCase().startsWith("ar")?$n:Pn}function yt(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},i=c=>{let d=document.elementFromPoint(c.clientX,c.clientY);if(!d||re(d)||d===document.body||d===document.documentElement){r();return}d!==n&&(r(),n=d,d.classList.add("builder-pin-hover"))},o=c=>{let d=document.elementFromPoint(c.clientX,c.clientY);if(!d||re(d))return;c.preventDefault(),c.stopPropagation();let m=We(d);l(),e(m,d)},a=c=>{c.key==="Escape"&&(c.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",i,!0),document.removeEventListener("click",o,!0),document.removeEventListener("keydown",a,!0)}return document.addEventListener("mousemove",i,!0),document.addEventListener("click",o,!0),document.addEventListener("keydown",a,!0),l}function ce(e){let t=Ve(e);if(!t.el||t.confidence<Ne)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var wt="http://www.w3.org/2000/svg",Mn={pin:["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0","M12 8a2 2 0 1 0 0 4 2 2 0 1 0 0-4"],x:["M18 6 6 18","m6 6 12 12"],paperclip:["M13.234 20.252 21 12.3a3.53 3.53 0 0 0 0-5 3.53 3.53 0 0 0-5 0L4.32 18.98a5.3 5.3 0 0 0 0 7.5 5.3 5.3 0 0 0 7.5 0l8.49-8.49"],image:["M15 8h.01","M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","m3 16 5-5c.928-.893 2.072-.893 3 0l5 5","m14 14 1-1c.928-.893 2.072-.893 3 0l3 3"],pencil:["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","m15 5 4 4"],eye:["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0","M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6"],arrowRight:["M5 12h14","m12 5 7 7-7 7"]};function I(e,t=14){let n=document.createElementNS(wt,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let r of Mn[e]??[]){let i=document.createElementNS(wt,"path");i.setAttribute("d",r),n.appendChild(i)}return n}function P(e,t,n,r=14){e.replaceChildren(),e.appendChild(I(t,r));let i=document.createElement("span");i.textContent=n,e.appendChild(i)}function ue(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let i=n[r],o=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(i);if(o){let m=o[1][0],h=[];for(r++;r<n.length&&!new RegExp(`^\\s*${m}{3,}\\s*$`).test(n[r]);)h.push(n[r]),r++;r++;let v=document.createElement("pre");v.className="md-pre";let C=document.createElement("code");o[2]&&(C.className=`lang-${o[2]}`),C.textContent=h.join(`
`),v.appendChild(C),t.appendChild(v);continue}if(!i.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(i)){t.appendChild(document.createElement("hr")),r++;continue}let a=/^\s*(#{1,6})\s+(.*)$/.exec(i);if(a){let m=Math.min(6,3+a[1].length),h=document.createElement(`h${m}`);h.className="md-h",h.appendChild(de(a[2])),t.appendChild(h),r++;continue}if(/^\s*>\s?/.test(i)){let m=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)m.push(n[r].replace(/^\s*>\s?/,"")),r++;let h=document.createElement("blockquote");h.className="md-quote",h.appendChild(ue(m.join(`
`))),t.appendChild(h);continue}let l=/^\s*[-*+]\s+/,c=/^\s*\d+[.)]\s+/;if(l.test(i)||c.test(i)){let m=!l.test(i),h=m?c:l,v=document.createElement(m?"ol":"ul");for(v.className="md-list";r<n.length&&h.test(n[r]);){let C=document.createElement("li"),x=n[r].replace(h,"");for(r++;r<n.length&&n[r].trim()&&!h.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)x+=`
`+n[r].trim(),r++;C.appendChild(de(x)),v.appendChild(C)}t.appendChild(v);continue}let d=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r]);)d.push(n[r]),r++;if(d.length){let m=document.createElement("p");m.className="md-p",m.appendChild(de(d.join(`
`))),t.appendChild(m)}else r++}return t}var In=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function de(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=In.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&Et(t,n.slice(0,r.index)),r[1]){let i=document.createElement("code");i.className="md-code",i.textContent=r[2].trim(),t.appendChild(i)}else r[3]!==void 0?t.appendChild(vt(r[4],r[3]||r[4])):r[5]?t.appendChild(Pe("strong","md-strong",r[6])):r[7]?t.appendChild(Pe("del","md-del",r[8])):r[9]?t.appendChild(Pe("em","md-em",r[10])):r[11]&&t.appendChild(vt(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&Et(t,n),t}function Pe(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(de(n)),r}function vt(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function Et(e,t){t.split(`
`).forEach((r,i)=>{i&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function Ct(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let i=await r.json();return{id:i.id,number:i.number,title:i.title,body:i.body??"",type:i.type,status:i.status,priority:i.priority,route:i.route??"",pageUrl:i.pageUrl??"",createdAt:i.createdAt??"",pins:i.pins??[],comments:i.comments??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function St(e,t,n){let r=le(e),i=document.createElement("div");i.className="detail hidden";let o=null;async function a(d){i.replaceChildren(y("p","empty",r.loading));try{o=await t.get(d),l()}catch(m){i.replaceChildren(y("p","note err",String(m.message)))}}function l(){if(!o)return;let d=o;i.replaceChildren();let m=y("div","d-head",""),h=pe("ghost","\u2190 "+r.onThisPage);h.addEventListener("click",n);let v=pe("ghost","\u2197");v.title=r.report,v.addEventListener("click",()=>window.open(`/issues/${d.number}`,"_blank","noopener")),m.append(h,v),i.appendChild(m);let C=y("div","d-meta","");if(C.append(y("span","num",`#${d.number}`),y("span",`chip ${d.type}`,r[d.type]??d.type),y("span","chip status",d.status.replace("_"," "))),i.append(C,y("h3","d-title",d.title)),d.body){let w=y("div","d-body","");w.appendChild(ue(d.body)),i.appendChild(w)}if(d.pins.length){i.appendChild(y("div","label",r.location));for(let w of d.pins){let u=y("div","d-pin","");u.appendChild(y("span","nm",`<${w.tag??"?"}>${w.name?` \u201C${w.name}\u201D`:""}`));let g=pe("ghost","");g.appendChild(I("eye",14)),g.title=r.pin,g.addEventListener("click",()=>{let b=ce(w);c(b.found?`Found via ${b.by} (${Math.round(b.confidence*100)}%)`:"The pinned element is not on this page any more.",b.found?"ok":"err")}),u.appendChild(g),i.appendChild(u)}}i.appendChild(y("div","label","Comments")),d.comments.length||i.appendChild(y("p","empty","No comments yet."));for(let w of d.comments){let u=y("div","d-comment",""),g=y("p","who",w.author||"someone");w.kind==="agent"&&g.appendChild(y("span","chip agent","agent"));let b=y("div","txt","");b.appendChild(ue(w.body)),u.append(g,b),i.appendChild(u)}let x=document.createElement("textarea");x.placeholder="Add a comment\u2026",x.rows=3;let k=pe("primary","Comment");k.addEventListener("click",async()=>{let w=x.value.trim();if(w){k.disabled=!0;try{await t.comment(d.number,w),x.value="",await a(d.number)}catch(u){c(String(u.message),"err")}finally{k.disabled=!1}}}),i.append(x,k)}function c(d,m){let h=y("p",`note ${m}`,d);i.appendChild(h),setTimeout(()=>h.remove(),4e3)}return{el:i,load:a,destroy:()=>i.remove()}}function y(e,t,n){let r=document.createElement(e);return r.className=t,n&&(r.textContent=n),r}function pe(e,t){let n=document.createElement("button");return n.type="button",n.className=e,n.textContent=t,n}var kt=`
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
`,Lt=`
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

`;function Tt(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let i=await r.json().catch(()=>null);return Array.isArray(i?.issues)?i.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??""}));for(let a of n.attachments)r.append("attachments",a.blob,a.name),r.append("attachment_kinds",a.kind);let i=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!i.ok){let a=await i.text().catch(()=>"");throw new Error(a||`submit failed (${i.status})`)}let o=await i.json();return{id:String(o.id??""),number:Number(o.number??0)}}}}var At="builder.fab.position",Dn=["bug","feature","question","discussion"];function Hn(e={}){let t=le(e.locale??document.documentElement.lang??"en"),n=e.transport??Tt(e.apiBase),r=e.locale??"en",i=document.createElement("div");i.setAttribute(M,""),i.setAttribute("dir",t.dir),e.theme&&i.setAttribute("data-theme",e.theme),document.body.appendChild(i);let o=i.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=kt+(e.accent?`:host{--accent:${On(e.accent)}}`:""),o.appendChild(a);let l=document.createElement("style");l.setAttribute(M,""),l.textContent=Lt,document.head.appendChild(l);let c=[],d=[],m=[],h="bug",v=!1,C=!1,x=null,k=null,w=document.createElement("div");w.innerHTML=`
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
          <div class="pin-preview hidden"></div>

          <div class="label lbl-att"></div>
          <div class="btns">
            <button type="button" class="ghost addfile"></button>
            <button type="button" class="ghost shot"></button>
          </div>
          <div class="files"></div>
          <input type="file" class="filein hidden" multiple accept="${ht}">

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
    </aside>`,o.appendChild(w);let u=s=>o.querySelector(s),g=u(".fab"),b=u(".panel"),K=u(".form"),me=u(".listing"),$e=u(".foot"),Y=u(".rows"),fe=u(".pills"),he=u(".note"),Me=u(".files"),X=u(".filein"),Ie=u(".count"),J=u('input[name="title"]'),De=u('textarea[name="body"]'),Rt=u('input[name="url"]'),A=u(".pin"),ge=u(".clearpin"),He=u(".pin-preview"),D=u(".send"),Q=new WeakMap;function Pt(s){let p=Q.get(s);return p||(p=URL.createObjectURL(s.blob),Q.set(s,p)),p}function be(s){let p=Q.get(s);p&&(URL.revokeObjectURL(p),Q.delete(s))}u(".fab-label").textContent=t.fab,u("h2").textContent=t.title,u(".fab-ico").replaceChildren(I("pencil",15)),u(".x").replaceChildren(I("x",15)),u(".x").setAttribute("aria-label",t.close),u(".intro").textContent=t.intro,u(".report").textContent=t.report,u(".lbl-type").textContent=t.type,u(".lbl-title").textContent=t.titleLabel,u(".lbl-details").textContent=t.details,u(".lbl-url").textContent=t.pageUrl,u(".lbl-loc").textContent=t.location,u(".lbl-att").textContent=t.attachments,u(".lbl-page").textContent=t.onThisPage,P(u(".board-link"),"arrowRight",t.openBoard),J.placeholder=t.titlePlaceholder,De.placeholder=t.detailsPlaceholder,P(A,"pin",t.pin),P(ge,"x",t.clear),P(u(".addfile"),"paperclip",t.addFile),P(u(".shot"),"image",t.screenshot),D.textContent=t.submit;for(let s of Dn){let p=document.createElement("button");p.type="button",p.className="pill",p.dataset.type=s,p.textContent=t[s],p.setAttribute("aria-pressed",String(s===h)),p.addEventListener("click",()=>{h=s,fe.querySelectorAll(".pill").forEach(f=>f.setAttribute("aria-pressed",String(f.dataset.type===s)))}),fe.appendChild(p)}let $t=4,L=null,xe=(s,p)=>{let f=Math.max(8,Math.min(s,window.innerWidth-80)),q=Math.max(8,Math.min(p,window.innerHeight-48));g.style.insetInlineEnd=`${f}px`,g.style.insetBlockEnd=`${q}px`},Fe=Fn();xe(Fe?.right??e.position?.right??24,Fe?.bottom??e.position?.bottom??24),g.addEventListener("pointerdown",s=>{if(s.button!==0)return;let p=g.getBoundingClientRect();L={x:s.clientX,y:s.clientY,ox:window.innerWidth-p.right,oy:window.innerHeight-p.bottom,moved:!1},g.setPointerCapture(s.pointerId)}),g.addEventListener("pointermove",s=>{if(!L)return;let p=s.clientX-L.x,f=s.clientY-L.y;!L.moved&&Math.hypot(p,f)<$t||(L.moved=!0,xe(L.ox-p,L.oy-f))}),g.addEventListener("pointerup",s=>{if(!L)return;let p=L.moved;if(L=null,g.releasePointerCapture(s.pointerId),p){let f=g.getBoundingClientRect();zn(window.innerWidth-f.right,window.innerHeight-f.bottom);return}ze()}),g.addEventListener("keydown",s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),ze())}),window.addEventListener("resize",()=>{let s=g.getBoundingClientRect();xe(window.innerWidth-s.right,window.innerHeight-s.bottom)});function ze(){b.dataset.open==="true"?B():Oe()}function Oe(){b.dataset.open="true",g.setAttribute("aria-expanded","true"),Rt.value=location.href,_()}function B(){b.dataset.open="false",b.dataset.detail="false",g.setAttribute("aria-expanded","false"),ye(!1),x?.(),x=null}u(".x").addEventListener("click",B),o.addEventListener("keydown",s=>{s.key==="Escape"&&!x&&B()});function Ue(s){b.dataset.open!=="true"||x||s.composedPath().includes(i)||B()}document.addEventListener("click",Ue,!0);function ye(s){v=s,K.classList.toggle("hidden",!s),me.classList.toggle("hidden",s),$e.classList.toggle("hidden",!s),u(".report").classList.toggle("hidden",s),s?setTimeout(()=>J.focus(),30):Mt()}u(".report").addEventListener("click",()=>ye(!0));function Mt(){K.reset(),d=[],m.forEach(be),m=[],h="bug",fe.querySelectorAll(".pill").forEach(s=>s.setAttribute("aria-pressed",String(s.dataset.type==="bug"))),Z(),ee(),R("")}function R(s,p=""){he.textContent=s,he.className=`note ${p}`.trim(),he.classList.toggle("hidden",!s)}A.addEventListener("click",()=>{if(x){x(),x=null,A.setAttribute("aria-pressed","false"),P(A,"pin",t.pin);return}b.dataset.open="false",A.setAttribute("aria-pressed","true"),A.textContent=t.pinning,x=yt((s,p)=>{d=[s],x=null,b.dataset.open="true",Z(),p.classList.add("builder-pin-found"),setTimeout(()=>p.classList.remove("builder-pin-found"),3e3)},()=>{x=null,b.dataset.open="true",Z()})}),ge.addEventListener("click",()=>{d=[],Z()});function Z(){let s=d.length>0;if(A.setAttribute("aria-pressed",String(s)),P(A,"pin",s?t.pinned(d[0].tag??"?"):t.pin),ge.classList.toggle("hidden",!s),He.classList.toggle("hidden",!s),s){let p=d[0],f=p.name||p.hint||"";He.textContent=`<${p.tag??"?"}>${f?` \u201C${f}\u201D`:""}`}}u(".addfile").addEventListener("click",()=>X.click()),X.addEventListener("change",()=>{for(let s of Array.from(X.files??[]))It(s);X.value=""});function It(s){let p=gt(s.type),f=bt(p);if(s.size>f){R(`${s.name} is ${se(s.size)} \u2014 the limit is ${se(f)}.`,"err");return}m.push({name:s.name,mime:s.type,size:s.size,kind:p,blob:s}),ee(),R("")}u(".shot").addEventListener("click",async()=>{let s=u(".shot");s.disabled=!0;let p=b.dataset.open;b.dataset.open="false",i.style.visibility="hidden";try{await new Promise(f=>setTimeout(f,120)),m.push(await xt()),ee(),R("")}catch(f){R(String(f.message||f),"err")}finally{i.style.visibility="",b.dataset.open=p??"true",s.disabled=!1}});function ee(){Me.replaceChildren(),m.forEach((s,p)=>{let f=document.createElement("div");if(f.className="file",s.kind==="screenshot"||s.kind==="image"){let te=document.createElement("img");te.className="thumb",te.src=Pt(s),te.alt="",f.appendChild(te)}let q=document.createElement("span");q.className="nm",q.textContent=s.name;let _e=document.createElement("span");_e.textContent=se(s.size);let W=document.createElement("button");W.type="button",W.replaceChildren(I("x",12)),W.setAttribute("aria-label",t.clear),W.addEventListener("click",()=>{be(s),m.splice(p,1),ee()}),f.append(q,_e,W),Me.appendChild(f)})}async function Be(){if(C)return;let s=J.value.trim();if(!s){R(t.titleRequired,"err"),J.focus();return}C=!0,D.disabled=!0,D.textContent=t.submitting;try{let p=await n.create({type:h,title:s,body:De.value,route:Re(),pageUrl:location.href,locale:r,pins:d,attachments:m});R(t.created(p.number),"ok"),e.onCreated?.(p),setTimeout(()=>{ye(!1),_()},900)}catch(p){R(String(p.message||t.failed),"err")}finally{C=!1,D.disabled=!1,D.textContent=t.submit}}D.addEventListener("click",Be),K.addEventListener("submit",s=>{s.preventDefault(),Be()});async function _(){if(!v){Y.replaceChildren($("div","empty",t.loading));try{c=await n.listByRoute(Re())}catch{c=[]}if(Ie.textContent=c.length>9?"9+":String(c.length),Ie.classList.toggle("hidden",c.length===0),u(".lbl-page").textContent=c.length?t.issueCount(c.length):t.onThisPage,Y.replaceChildren(),!c.length){Y.appendChild($("div","empty",t.none));return}for(let s of c){let p=document.createElement("button");if(p.type="button",p.className="row",p.append($("span","num",`#${s.number}`),$("span",`chip ${s.type}`,t[s.type])),p.appendChild($("span","t",s.title)),s.busy){let f=$("span","agent-tag","");f.appendChild($("span","spin","")),f.appendChild($("span","who",s.agent||t.agentWorking)),f.setAttribute("title",s.agent?t.agentWorkingBy(s.agent):t.agentWorking),p.appendChild(f)}p.addEventListener("click",()=>void Dt(s.number)),Y.appendChild(p)}}}async function Dt(s){k||(k=St(r,Ct(e.apiBase),()=>{k?.el.classList.add("hidden"),me.classList.remove("hidden"),u(".report").classList.remove("hidden"),b.dataset.detail="false",_()}),u(".body").appendChild(k.el)),me.classList.add("hidden"),u(".report").classList.add("hidden"),K.classList.add("hidden"),$e.classList.add("hidden"),k.el.classList.remove("hidden"),b.dataset.detail="true",await k.load(s)}let Ht={open:Oe,close:B,refresh:()=>void _(),destroy(){x?.(),m.forEach(be),document.removeEventListener("click",Ue,!0),i.remove(),l.remove()}};return _(),Ht}function $(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function Fn(){try{let e=localStorage.getItem(At);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function zn(e,t){try{localStorage.setItem(At,JSON.stringify({right:e,bottom:t}))}catch{}}function On(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return _t(Un);})();
