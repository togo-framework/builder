"use strict";var BuilderIssues=(()=>{var he=Object.defineProperty;var Pt=Object.getOwnPropertyDescriptor;var At=Object.getOwnPropertyNames;var Rt=Object.prototype.hasOwnProperty;var $t=(e,t)=>{for(var r in t)he(e,r,{get:t[r],enumerable:!0})},It=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of At(t))!Rt.call(e,i)&&i!==r&&he(e,i,{get:()=>t[i],enumerable:!(n=Pt(t,i))||n.enumerable});return e};var Mt=e=>It(he({},"__esModule",{value:!0}),e);var Rn={};$t(Rn,{highlightPin:()=>oe,mount:()=>Ln});var $="data-builder-sdk";function Z(e){return!!e?.closest?.(`[${$}]`)}function ze(e){let t=e.getBoundingClientRect(),r=window.innerWidth||1,n=window.innerHeight||1,i={tag:e.tagName.toLowerCase(),hint:q(e),css:Ht(e),rect:{x:t.left/r,y:t.top/n,w:t.width/r,h:t.height/n},scrollY:window.scrollY,viewport:{w:r,h:n,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},o=e.getAttribute("data-testid")??e.getAttribute("data-test-id");o&&(i.testid=o),e.id&&!Ue(e.id)&&(i.domId=e.id);let a=e.getAttribute("role")??Ft(e);a&&(i.role=a);let l=_e(e);l&&(i.name=l);for(let[c,d]of Dt(i))try{let p=document.querySelectorAll(d);p.length===1&&p[0]===e&&i.verified.push(c)}catch{}return i}function Dt(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${W(e.testid)}"]`]),e.domId&&t.push(["domId",`#${W(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var Oe=.5;function Be(e){if(e.testid){let t=Q(`[data-testid="${W(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let r=Fe(t,e);if(r)return{el:r,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=Q(`[role="${W(e.role)}"]`).filter(r=>_e(r)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let r=Fe(t,e);if(r)return{el:r,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=Q(e.css);if(t.length===1){let r=t[0],n=!e.hint||ge(q(r),e.hint);return{el:r,by:"css",confidence:n?.6:.35}}}if(e.hint){let t=Q(e.tag||"*").filter(r=>ge(q(r),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function Fe(e,t){if(!t.rect)return null;let r=window.innerWidth||1,n=window.innerHeight||1,i=null,o=1/0;for(let a of e){let l=a.getBoundingClientRect(),c=l.left/r-t.rect.x,d=l.top/n-t.rect.y,p=Math.hypot(c,d);t.hint&&ge(q(a),t.hint)&&(p-=.5),p<o&&([i,o]=[a,p])}return i}function Q(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!Z(t))}catch{return[]}}function Ht(e){let t=[],r=e;for(let n=0;r&&n<6&&r!==document.body;n++){if(r.id&&!Ue(r.id)){t.unshift(`#${W(r.id)}`);break}let i=r.tagName.toLowerCase(),o=r.parentElement;if(!o){t.unshift(i);break}let a=Array.from(o.children).filter(l=>l.tagName===r.tagName);t.unshift(a.length>1?`${i}:nth-of-type(${a.indexOf(r)+1})`:i),r=o}return t.join(" > ").slice(0,512)}function Ue(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function q(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function ge(e,t){if(!e||!t)return!1;let r=e.toLowerCase(),n=t.toLowerCase();return r===n||r.includes(n)||n.includes(r)}function _e(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||q(e)).slice(0,80)}function Ft(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function W(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function qe(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let r=document.implementation.createHTMLDocument(),n=r.createElement("base"),i=r.createElement("a");return r.head.appendChild(n),r.body.appendChild(i),t&&(n.href=t),i.href=e,i.href}var We=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function T(e){let t=[];for(let r=0,n=e.length;r<n;r++)t.push(e[r]);return t}var M=null;function te(e={}){return M||(e.includeStyleProperties?(M=e.includeStyleProperties,M):(M=T(window.getComputedStyle(document.documentElement)),M))}function ee(e,t){let n=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return n?parseFloat(n.replace("px","")):0}function zt(e){let t=ee(e,"border-left-width"),r=ee(e,"border-right-width");return e.clientWidth+t+r}function Ot(e){let t=ee(e,"border-top-width"),r=ee(e,"border-bottom-width");return e.clientHeight+t+r}function be(e,t={}){let r=t.width||zt(e),n=t.height||Ot(e);return{width:r,height:n}}function Ve(){let e,t;try{t=process}catch{}let r=t&&t.env?t.env.devicePixelRatio:null;return r&&(e=parseInt(r,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var S=16384;function Ne(e){(e.width>S||e.height>S)&&(e.width>S&&e.height>S?e.width>e.height?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S):e.width>S?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S))}function je(e,t={}){return e.toBlob?new Promise(r=>{e.toBlob(r,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(r=>{let n=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),i=n.length,o=new Uint8Array(i);for(let a=0;a<i;a+=1)o[a]=n.charCodeAt(a);r(new Blob([o],{type:t.type?t.type:"image/png"}))})}function D(e){return new Promise((t,r)=>{let n=new Image;n.onload=()=>{n.decode().then(()=>{requestAnimationFrame(()=>t(n))})},n.onerror=r,n.crossOrigin="anonymous",n.decoding="async",n.src=e})}async function Bt(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function Ge(e,t,r){let n="http://www.w3.org/2000/svg",i=document.createElementNS(n,"svg"),o=document.createElementNS(n,"foreignObject");return i.setAttribute("width",`${t}`),i.setAttribute("height",`${r}`),i.setAttribute("viewBox",`0 0 ${t} ${r}`),o.setAttribute("width","100%"),o.setAttribute("height","100%"),o.setAttribute("x","0"),o.setAttribute("y","0"),o.setAttribute("externalResourcesRequired","true"),i.appendChild(o),o.appendChild(e),Bt(i)}var E=(e,t)=>{if(e instanceof t)return!0;let r=Object.getPrototypeOf(e);return r===null?!1:r.constructor.name===t.name||E(r,t)};function Ut(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function _t(e,t){return te(t).map(r=>{let n=e.getPropertyValue(r),i=e.getPropertyPriority(r);return`${r}: ${n}${i?" !important":""};`}).join(" ")}function qt(e,t,r,n){let i=`.${e}:${t}`,o=r.cssText?Ut(r):_t(r,n);return document.createTextNode(`${i}{${o}}`)}function Ke(e,t,r,n){let i=window.getComputedStyle(e,r),o=i.getPropertyValue("content");if(o===""||o==="none")return;let a=We();try{t.className=`${t.className} ${a}`}catch{return}let l=document.createElement("style");l.appendChild(qt(a,r,i,n)),t.appendChild(l)}function Ye(e,t,r){Ke(e,t,":before",r),Ke(e,t,":after",r)}var Xe="application/font-woff",Je="image/jpeg",Wt={woff:Xe,woff2:Xe,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:Je,jpeg:Je,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function Vt(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function H(e){let t=Vt(e).toLowerCase();return Wt[t]||""}function Nt(e){return e.split(/,/)[1]}function V(e){return e.search(/^(data:)/)!==-1}function ye(e,t){return`data:${t};base64,${e}`}async function we(e,t,r){let n=await fetch(e,t);if(n.status===404)throw new Error(`Resource "${n.url}" not found`);let i=await n.blob();return new Promise((o,a)=>{let l=new FileReader;l.onerror=a,l.onloadend=()=>{try{o(r({res:n,result:l.result}))}catch(c){a(c)}},l.readAsDataURL(i)})}var xe={};function jt(e,t,r){let n=e.replace(/\?.*/,"");return r&&(n=e),/ttf|otf|eot|woff2?/i.test(n)&&(n=n.replace(/.*\//,"")),t?`[${t}]${n}`:n}async function F(e,t,r){let n=jt(e,t,r.includeQueryParams);if(xe[n]!=null)return xe[n];r.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let i;try{let o=await we(e,r.fetchRequestInit,({res:a,result:l})=>(t||(t=a.headers.get("Content-Type")||""),Nt(l)));i=ye(o,t)}catch(o){i=r.imagePlaceholder||"";let a=`Failed to fetch resource: ${e}`;o&&(a=typeof o=="string"?o:o.message),a&&console.warn(a)}return xe[n]=i,i}async function Gt(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):D(t)}async function Kt(e,t){if(e.currentSrc){let o=document.createElement("canvas"),a=o.getContext("2d");o.width=e.clientWidth,o.height=e.clientHeight,a?.drawImage(e,0,0,o.width,o.height);let l=o.toDataURL();return D(l)}let r=e.poster,n=H(r),i=await F(r,n,t);return D(i)}async function Yt(e,t){var r;try{if(!((r=e?.contentDocument)===null||r===void 0)&&r.body)return await N(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function Xt(e,t){return E(e,HTMLCanvasElement)?Gt(e):E(e,HTMLVideoElement)?Kt(e,t):E(e,HTMLIFrameElement)?Yt(e,t):e.cloneNode(Qe(e))}var Jt=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",Qe=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function Qt(e,t,r){var n,i;if(Qe(t))return t;let o=[];return Jt(e)&&e.assignedNodes?o=T(e.assignedNodes()):E(e,HTMLIFrameElement)&&(!((n=e.contentDocument)===null||n===void 0)&&n.body)?o=T(e.contentDocument.body.childNodes):o=T(((i=e.shadowRoot)!==null&&i!==void 0?i:e).childNodes),o.length===0||E(e,HTMLVideoElement)||await o.reduce((a,l)=>a.then(()=>N(l,r)).then(c=>{c&&t.appendChild(c)}),Promise.resolve()),t}function Zt(e,t,r){let n=t.style;if(!n)return;let i=window.getComputedStyle(e);i.cssText?(n.cssText=i.cssText,n.transformOrigin=i.transformOrigin):te(r).forEach(o=>{let a=i.getPropertyValue(o);o==="font-size"&&a.endsWith("px")&&(a=`${Math.floor(parseFloat(a.substring(0,a.length-2)))-.1}px`),E(e,HTMLIFrameElement)&&o==="display"&&a==="inline"&&(a="block"),o==="d"&&t.getAttribute("d")&&(a=`path(${t.getAttribute("d")})`),n.setProperty(o,a,i.getPropertyPriority(o))})}function en(e,t){E(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),E(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function tn(e,t){if(E(e,HTMLSelectElement)){let n=Array.from(t.children).find(i=>e.value===i.getAttribute("value"));n&&n.setAttribute("selected","")}}function nn(e,t,r){return E(t,Element)&&(Zt(e,t,r),Ye(e,t,r),en(e,t),tn(e,t)),t}async function rn(e,t){let r=e.querySelectorAll?e.querySelectorAll("use"):[];if(r.length===0)return e;let n={};for(let o=0;o<r.length;o++){let l=r[o].getAttribute("xlink:href");if(l){let c=e.querySelector(l),d=document.querySelector(l);!c&&d&&!n[l]&&(n[l]=await N(d,t,!0))}}let i=Object.values(n);if(i.length){let o="http://www.w3.org/1999/xhtml",a=document.createElementNS(o,"svg");a.setAttribute("xmlns",o),a.style.position="absolute",a.style.width="0",a.style.height="0",a.style.overflow="hidden",a.style.display="none";let l=document.createElementNS(o,"defs");a.appendChild(l);for(let c=0;c<i.length;c++)l.appendChild(i[c]);e.appendChild(a)}return e}async function N(e,t,r){return!r&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(n=>Xt(n,t)).then(n=>Qt(e,n,t)).then(n=>nn(e,n,t)).then(n=>rn(n,t))}var Ze=/url\((['"]?)([^'"]+?)\1\)/g,on=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,an=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function sn(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function ln(e){let t=[];return e.replace(Ze,(r,n,i)=>(t.push(i),r)),t.filter(r=>!V(r))}async function cn(e,t,r,n,i){try{let o=r?qe(t,r):t,a=H(t),l;if(i){let c=await i(o);l=ye(c,a)}else l=await F(o,a,n);return e.replace(sn(t),`$1${l}$3`)}catch{}return e}function dn(e,{preferredFontFormat:t}){return t?e.replace(an,r=>{for(;;){let[n,,i]=on.exec(r)||[];if(!i)return"";if(i===t)return`src: ${n};`}}):e}function ve(e){return e.search(Ze)!==-1}async function ne(e,t,r){if(!ve(e))return e;let n=dn(e,r);return ln(n).reduce((o,a)=>o.then(l=>cn(l,a,t,r)),Promise.resolve(n))}async function z(e,t,r){var n;let i=(n=t.style)===null||n===void 0?void 0:n.getPropertyValue(e);if(i){let o=await ne(i,null,r);return t.style.setProperty(e,o,t.style.getPropertyPriority(e)),!0}return!1}async function un(e,t){await z("background",e,t)||await z("background-image",e,t),await z("mask",e,t)||await z("-webkit-mask",e,t)||await z("mask-image",e,t)||await z("-webkit-mask-image",e,t)}async function pn(e,t){let r=E(e,HTMLImageElement);if(!(r&&!V(e.src))&&!(E(e,SVGImageElement)&&!V(e.href.baseVal)))return;let n=r?e.src:e.href.baseVal,i=await F(n,H(n),t);await new Promise((o,a)=>{e.onload=o,e.onerror=t.onImageErrorHandler?(...c)=>{try{o(t.onImageErrorHandler(...c))}catch(d){a(d)}}:a;let l=e;l.decode&&(l.decode=o),l.loading==="lazy"&&(l.loading="eager"),r?(e.srcset="",e.src=i):e.href.baseVal=i})}async function mn(e,t){let n=T(e.childNodes).map(i=>Ee(i,t));await Promise.all(n).then(()=>e)}async function Ee(e,t){E(e,Element)&&(await un(e,t),await pn(e,t),await mn(e,t))}function et(e,t){let{style:r}=e;t.backgroundColor&&(r.backgroundColor=t.backgroundColor),t.width&&(r.width=`${t.width}px`),t.height&&(r.height=`${t.height}px`);let n=t.style;return n!=null&&Object.keys(n).forEach(i=>{r[i]=n[i]}),e}var tt={};async function nt(e){let t=tt[e];if(t!=null)return t;let n=await(await fetch(e)).text();return t={url:e,cssText:n},tt[e]=t,t}async function rt(e,t){let r=e.cssText,n=/url\(["']?([^"')]+)["']?\)/g,o=(r.match(/url\([^)]+\)/g)||[]).map(async a=>{let l=a.replace(n,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),we(l,t.fetchRequestInit,({result:c})=>(r=r.replace(a,`url(${c})`),[a,c]))});return Promise.all(o).then(()=>r)}function it(e){if(e==null)return[];let t=[],r=/(\/\*[\s\S]*?\*\/)/gi,n=e.replace(r,""),i=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let c=i.exec(n);if(c===null)break;t.push(c[0])}n=n.replace(i,"");let o=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(a,"gi");for(;;){let c=o.exec(n);if(c===null){if(c=l.exec(n),c===null)break;o.lastIndex=l.lastIndex}else l.lastIndex=o.lastIndex;t.push(c[0])}return t}async function fn(e,t){let r=[],n=[];return e.forEach(i=>{if("cssRules"in i)try{T(i.cssRules||[]).forEach((o,a)=>{if(o.type===CSSRule.IMPORT_RULE){let l=a+1,c=o.href,d=nt(c).then(p=>rt(p,t)).then(p=>it(p).forEach(f=>{try{i.insertRule(f,f.startsWith("@import")?l+=1:i.cssRules.length)}catch(v){console.error("Error inserting rule from remote css",{rule:f,error:v})}})).catch(p=>{console.error("Error loading remote css",p.toString())});n.push(d)}})}catch(o){let a=e.find(l=>l.href==null)||document.styleSheets[0];i.href!=null&&n.push(nt(i.href).then(l=>rt(l,t)).then(l=>it(l).forEach(c=>{a.insertRule(c,a.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",o)}}),Promise.all(n).then(()=>(e.forEach(i=>{if("cssRules"in i)try{T(i.cssRules||[]).forEach(o=>{r.push(o)})}catch(o){console.error(`Error while reading CSS rules from ${i.href}`,o)}}),r))}function hn(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>ve(t.style.getPropertyValue("src")))}async function gn(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let r=T(e.ownerDocument.styleSheets),n=await fn(r,t);return hn(n)}function ot(e){return e.trim().replace(/["']/g,"")}function bn(e){let t=new Set;function r(n){(n.style.fontFamily||getComputedStyle(n).fontFamily).split(",").forEach(o=>{t.add(ot(o))}),Array.from(n.children).forEach(o=>{o instanceof HTMLElement&&r(o)})}return r(e),t}async function at(e,t){let r=await gn(e,t),n=bn(e);return(await Promise.all(r.filter(o=>n.has(ot(o.style.fontFamily))).map(o=>{let a=o.parentStyleSheet?o.parentStyleSheet.href:null;return ne(o.cssText,a,t)}))).join(`
`)}async function st(e,t){let r=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await at(e,t);if(r){let n=document.createElement("style"),i=document.createTextNode(r);n.appendChild(i),e.firstChild?e.insertBefore(n,e.firstChild):e.appendChild(n)}}async function xn(e,t={}){let{width:r,height:n}=be(e,t),i=await N(e,t,!0);return await st(i,t),await Ee(i,t),et(i,t),await Ge(i,r,n)}async function yn(e,t={}){let{width:r,height:n}=be(e,t),i=await xn(e,t),o=await D(i),a=document.createElement("canvas"),l=a.getContext("2d"),c=t.pixelRatio||Ve(),d=t.canvasWidth||r,p=t.canvasHeight||n;return a.width=d*c,a.height=p*c,t.skipAutoScale||Ne(a),a.style.width=`${d}`,a.style.height=`${p}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,a.width,a.height)),l.drawImage(o,0,0,a.width,a.height),a}async function lt(e,t={}){let r=await yn(e,t);return await je(r)}var wn="data-builder-hide",Ce={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},ct=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function dt(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function ut(e){return e==="video"?Ce.video:e==="image"?Ce.image:Ce.file}function re(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function pt(e=15e3){let t=await Promise.race([lt(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:r=>{let n=r;return!(n?.getAttribute?.($)!==null&&n?.hasAttribute?.($)||n?.hasAttribute?.(wn))}}),new Promise((r,n)=>setTimeout(()=>n(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${vn()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function vn(){let e=new Date,t=r=>String(r).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function Se(e=location.href){try{let r=new URL(e).pathname.toLowerCase();return r.length>1&&r.endsWith("/")&&(r=r.slice(0,-1)),r.slice(0,512)}catch{return"/"}}var En={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",dir:"ltr"},Cn={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",dir:"rtl"};function ie(e){return e.toLowerCase().startsWith("ar")?Cn:En}function mt(e,t){let r=null;document.body.classList.add("builder-pin-armed");let n=()=>{r?.classList.remove("builder-pin-hover"),r=null},i=c=>{let d=document.elementFromPoint(c.clientX,c.clientY);if(!d||Z(d)||d===document.body||d===document.documentElement){n();return}d!==r&&(n(),r=d,d.classList.add("builder-pin-hover"))},o=c=>{let d=document.elementFromPoint(c.clientX,c.clientY);if(!d||Z(d))return;c.preventDefault(),c.stopPropagation();let p=ze(d);l(),e(p,d)},a=c=>{c.key==="Escape"&&(c.preventDefault(),l(),t())};function l(){n(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",i,!0),document.removeEventListener("click",o,!0),document.removeEventListener("keydown",a,!0)}return document.addEventListener("mousemove",i,!0),document.addEventListener("click",o,!0),document.addEventListener("keydown",a,!0),l}function oe(e){let t=Be(e);if(!t.el||t.confidence<Oe)return{found:!1,by:t.by,confidence:t.confidence};let r=t.el;return r.scrollIntoView({behavior:"smooth",block:"center"}),r.classList.add("builder-pin-found"),setTimeout(()=>r.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}function se(e){let t=document.createDocumentFragment(),r=(e??"").replace(/\r\n?/g,`
`).split(`
`),n=0;for(;n<r.length;){let i=r[n],o=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(i);if(o){let p=o[1][0],f=[];for(n++;n<r.length&&!new RegExp(`^\\s*${p}{3,}\\s*$`).test(r[n]);)f.push(r[n]),n++;n++;let v=document.createElement("pre");v.className="md-pre";let C=document.createElement("code");o[2]&&(C.className=`lang-${o[2]}`),C.textContent=f.join(`
`),v.appendChild(C),t.appendChild(v);continue}if(!i.trim()){n++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(i)){t.appendChild(document.createElement("hr")),n++;continue}let a=/^\s*(#{1,6})\s+(.*)$/.exec(i);if(a){let p=Math.min(6,3+a[1].length),f=document.createElement(`h${p}`);f.className="md-h",f.appendChild(ae(a[2])),t.appendChild(f),n++;continue}if(/^\s*>\s?/.test(i)){let p=[];for(;n<r.length&&/^\s*>\s?/.test(r[n]);)p.push(r[n].replace(/^\s*>\s?/,"")),n++;let f=document.createElement("blockquote");f.className="md-quote",f.appendChild(se(p.join(`
`))),t.appendChild(f);continue}let l=/^\s*[-*+]\s+/,c=/^\s*\d+[.)]\s+/;if(l.test(i)||c.test(i)){let p=!l.test(i),f=p?c:l,v=document.createElement(p?"ol":"ul");for(v.className="md-list";n<r.length&&f.test(r[n]);){let C=document.createElement("li"),b=r[n].replace(f,"");for(n++;n<r.length&&r[n].trim()&&!f.test(r[n])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(r[n]);)b+=`
`+r[n].trim(),n++;C.appendChild(ae(b)),v.appendChild(C)}t.appendChild(v);continue}let d=[];for(;n<r.length&&r[n].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(r[n]);)d.push(r[n]),n++;if(d.length){let p=document.createElement("p");p.className="md-p",p.appendChild(ae(d.join(`
`))),t.appendChild(p)}else n++}return t}var Sn=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function ae(e){let t=document.createDocumentFragment(),r=e;for(;;){let n=Sn.exec(r);if(!n||n.index===void 0)break;if(n.index>0&&ht(t,r.slice(0,n.index)),n[1]){let i=document.createElement("code");i.className="md-code",i.textContent=n[2].trim(),t.appendChild(i)}else n[3]!==void 0?t.appendChild(ft(n[4],n[3]||n[4])):n[5]?t.appendChild(ke("strong","md-strong",n[6])):n[7]?t.appendChild(ke("del","md-del",n[8])):n[9]?t.appendChild(ke("em","md-em",n[10])):n[11]&&t.appendChild(ft(n[11],n[11]));r=r.slice(n.index+n[0].length)}return r&&ht(t,r),t}function ke(e,t,r){let n=document.createElement(e);return n.className=t,n.appendChild(ae(r)),n}function ft(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let n=document.createElement("a");return n.className="md-a",n.href=e,n.target="_blank",n.rel="noopener noreferrer ugc",n.textContent=t,n}function ht(e,t){t.split(`
`).forEach((n,i)=>{i&&e.appendChild(document.createElement("br")),n&&e.appendChild(document.createTextNode(n))})}function gt(e=""){let t=e.replace(/\/$/,"");return{async get(r){let n=await fetch(`${t}/api/builder/issues/${r}`,{credentials:"include"});if(!n.ok)throw new Error(`could not load #${r}`);let i=await n.json();return{id:i.id,number:i.number,title:i.title,body:i.body??"",type:i.type,status:i.status,priority:i.priority,route:i.route??"",pageUrl:i.pageUrl??"",createdAt:i.createdAt??"",pins:i.pins??[],comments:i.comments??[]}},async comment(r,n){if(!(await fetch(`${t}/api/builder/issues/${r}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:n,author:""})})).ok)throw new Error("could not post the comment")}}}function bt(e,t,r){let n=ie(e),i=document.createElement("div");i.className="detail hidden";let o=null;async function a(d){i.replaceChildren(y("p","empty",n.loading));try{o=await t.get(d),l()}catch(p){i.replaceChildren(y("p","note err",String(p.message)))}}function l(){if(!o)return;let d=o;i.replaceChildren();let p=y("div","d-head",""),f=le("ghost","\u2190 "+n.onThisPage);f.addEventListener("click",r);let v=le("ghost","\u2197");v.title=n.report,v.addEventListener("click",()=>window.open(`/issues/${d.number}`,"_blank","noopener")),p.append(f,v),i.appendChild(p);let C=y("div","d-meta","");if(C.append(y("span","num",`#${d.number}`),y("span",`chip ${d.type}`,n[d.type]??d.type),y("span","chip status",d.status.replace("_"," "))),i.append(C,y("h3","d-title",d.title)),d.body){let w=y("div","d-body","");w.appendChild(se(d.body)),i.appendChild(w)}if(d.pins.length){i.appendChild(y("div","label",n.location));for(let w of d.pins){let u=y("div","d-pin","");u.appendChild(y("span","nm",`<${w.tag??"?"}>${w.name?` \u201C${w.name}\u201D`:""}`));let x=le("ghost","\u{1F441}");x.title=n.pin,x.addEventListener("click",()=>{let g=oe(w);c(g.found?`Found via ${g.by} (${Math.round(g.confidence*100)}%)`:"The pinned element is not on this page any more.",g.found?"ok":"err")}),u.appendChild(x),i.appendChild(u)}}i.appendChild(y("div","label","Comments")),d.comments.length||i.appendChild(y("p","empty","No comments yet."));for(let w of d.comments){let u=y("div","d-comment",""),x=y("p","who",w.author||"someone");w.kind==="agent"&&x.appendChild(y("span","chip agent","agent"));let g=y("div","txt","");g.appendChild(se(w.body)),u.append(x,g),i.appendChild(u)}let b=document.createElement("textarea");b.placeholder="Add a comment\u2026",b.rows=3;let k=le("primary","Comment");k.addEventListener("click",async()=>{let w=b.value.trim();if(w){k.disabled=!0;try{await t.comment(d.number,w),b.value="",await a(d.number)}catch(u){c(String(u.message),"err")}finally{k.disabled=!1}}}),i.append(b,k)}function c(d,p){let f=y("p",`note ${p}`,d);i.appendChild(f),setTimeout(()=>f.remove(),4e3)}return{el:i,load:a,destroy:()=>i.remove()}}function y(e,t,r){let n=document.createElement(e);return n.className=t,r&&(n.textContent=r),n}function le(e,t){let r=document.createElement("button");return r.type="button",r.className=e,r.textContent=t,r}var xt=`
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
`,yt=`
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

`;function wt(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(r){let n=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(r)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!n.ok)return[];let i=await n.json().catch(()=>null);return Array.isArray(i?.issues)?i.issues:[]},async create(r){let n=new FormData;n.set("issue",JSON.stringify({type:r.type,title:r.title,body:r.body,route:r.route,page_url:r.pageUrl,locale:r.locale,pins:r.pins,reporter_email:r.reporterEmail??""}));for(let a of r.attachments)n.append("attachments",a.blob,a.name),n.append("attachment_kinds",a.kind);let i=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:n});if(!i.ok){let a=await i.text().catch(()=>"");throw new Error(a||`submit failed (${i.status})`)}let o=await i.json();return{id:String(o.id??""),number:Number(o.number??0)}}}}var vt="builder.fab.position",kn=["bug","feature","question","discussion"];function Ln(e={}){let t=ie(e.locale??document.documentElement.lang??"en"),r=e.transport??wt(e.apiBase),n=e.locale??"en",i=document.createElement("div");i.setAttribute($,""),i.setAttribute("dir",t.dir),e.theme&&i.setAttribute("data-theme",e.theme),document.body.appendChild(i);let o=i.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=xt+(e.accent?`:host{--accent:${An(e.accent)}}`:""),o.appendChild(a);let l=document.createElement("style");l.setAttribute($,""),l.textContent=yt,document.head.appendChild(l);let c=[],d=[],p=[],f="bug",v=!1,C=!1,b=null,k=null,w=document.createElement("div");w.innerHTML=`
    <button class="fab" part="fab" aria-haspopup="dialog" aria-expanded="false">
      <span aria-hidden="true">\u270E</span><span class="fab-label"></span><span class="count hidden"></span>
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
          <input type="file" class="filein hidden" multiple accept="${ct}">

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
    </aside>`,o.appendChild(w);let u=s=>o.querySelector(s),x=u(".fab"),g=u(".panel"),j=u(".form"),ce=u(".listing"),Le=u(".foot"),G=u(".rows"),de=u(".pills"),ue=u(".note"),Te=u(".files"),K=u(".filein"),Pe=u(".count"),Y=u('input[name="title"]'),Ae=u('textarea[name="body"]'),Et=u('input[name="url"]'),P=u(".pin"),pe=u(".clearpin"),I=u(".send");u(".fab-label").textContent=t.fab,u("h2").textContent=t.title,u(".x").textContent="\u2715",u(".x").setAttribute("aria-label",t.close),u(".intro").textContent=t.intro,u(".report").textContent=t.report,u(".lbl-type").textContent=t.type,u(".lbl-title").textContent=t.titleLabel,u(".lbl-details").textContent=t.details,u(".lbl-url").textContent=t.pageUrl,u(".lbl-loc").textContent=t.location,u(".lbl-att").textContent=t.attachments,u(".lbl-page").textContent=t.onThisPage,u(".board-link").textContent=t.openBoard+" \u2192",Y.placeholder=t.titlePlaceholder,Ae.placeholder=t.detailsPlaceholder,P.textContent="\u{1F4CD} "+t.pin,pe.textContent="\u2715 "+t.clear,u(".addfile").textContent="\u{1F4CE} "+t.addFile,u(".shot").textContent="\u{1F5BC} "+t.screenshot,I.textContent=t.submit;for(let s of kn){let m=document.createElement("button");m.type="button",m.className="pill",m.dataset.type=s,m.textContent=t[s],m.setAttribute("aria-pressed",String(s===f)),m.addEventListener("click",()=>{f=s,de.querySelectorAll(".pill").forEach(h=>h.setAttribute("aria-pressed",String(h.dataset.type===s)))}),de.appendChild(m)}let Ct=4,L=null,me=(s,m)=>{let h=Math.max(8,Math.min(s,window.innerWidth-80)),U=Math.max(8,Math.min(m,window.innerHeight-48));x.style.insetInlineEnd=`${h}px`,x.style.insetBlockEnd=`${U}px`},Re=Tn();me(Re?.right??e.position?.right??24,Re?.bottom??e.position?.bottom??24),x.addEventListener("pointerdown",s=>{if(s.button!==0)return;let m=x.getBoundingClientRect();L={x:s.clientX,y:s.clientY,ox:window.innerWidth-m.right,oy:window.innerHeight-m.bottom,moved:!1},x.setPointerCapture(s.pointerId)}),x.addEventListener("pointermove",s=>{if(!L)return;let m=s.clientX-L.x,h=s.clientY-L.y;!L.moved&&Math.hypot(m,h)<Ct||(L.moved=!0,me(L.ox-m,L.oy-h))}),x.addEventListener("pointerup",s=>{if(!L)return;let m=L.moved;if(L=null,x.releasePointerCapture(s.pointerId),m){let h=x.getBoundingClientRect();Pn(window.innerWidth-h.right,window.innerHeight-h.bottom);return}$e()}),x.addEventListener("keydown",s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),$e())}),window.addEventListener("resize",()=>{let s=x.getBoundingClientRect();me(window.innerWidth-s.right,window.innerHeight-s.bottom)});function $e(){g.dataset.open==="true"?O():Ie()}function Ie(){g.dataset.open="true",x.setAttribute("aria-expanded","true"),Et.value=location.href,B()}function O(){g.dataset.open="false",g.dataset.detail="false",x.setAttribute("aria-expanded","false"),fe(!1),b?.(),b=null}u(".x").addEventListener("click",O),o.addEventListener("keydown",s=>{s.key==="Escape"&&!b&&O()});function Me(s){g.dataset.open!=="true"||b||s.composedPath().includes(i)||O()}document.addEventListener("click",Me,!0);function fe(s){v=s,j.classList.toggle("hidden",!s),ce.classList.toggle("hidden",s),Le.classList.toggle("hidden",!s),u(".report").classList.toggle("hidden",s),s?setTimeout(()=>Y.focus(),30):St()}u(".report").addEventListener("click",()=>fe(!0));function St(){j.reset(),d=[],p=[],f="bug",de.querySelectorAll(".pill").forEach(s=>s.setAttribute("aria-pressed",String(s.dataset.type==="bug"))),X(),J(),A("")}function A(s,m=""){ue.textContent=s,ue.className=`note ${m}`.trim(),ue.classList.toggle("hidden",!s)}P.addEventListener("click",()=>{if(b){b(),b=null,P.setAttribute("aria-pressed","false"),P.textContent="\u{1F4CD} "+t.pin;return}g.dataset.open="false",P.setAttribute("aria-pressed","true"),P.textContent=t.pinning,b=mt(s=>{d=[s],b=null,g.dataset.open="true",X()},()=>{b=null,g.dataset.open="true",X()})}),pe.addEventListener("click",()=>{d=[],X()});function X(){let s=d.length>0;P.setAttribute("aria-pressed",String(s)),P.textContent=s?"\u{1F4CD} "+t.pinned(d[0].tag??"?"):"\u{1F4CD} "+t.pin,pe.classList.toggle("hidden",!s)}u(".addfile").addEventListener("click",()=>K.click()),K.addEventListener("change",()=>{for(let s of Array.from(K.files??[]))kt(s);K.value=""});function kt(s){let m=dt(s.type),h=ut(m);if(s.size>h){A(`${s.name} is ${re(s.size)} \u2014 the limit is ${re(h)}.`,"err");return}p.push({name:s.name,mime:s.type,size:s.size,kind:m,blob:s}),J(),A("")}u(".shot").addEventListener("click",async()=>{let s=u(".shot");s.disabled=!0;let m=g.dataset.open;g.dataset.open="false",i.style.visibility="hidden";try{await new Promise(h=>setTimeout(h,120)),p.push(await pt()),J(),A("")}catch(h){A(String(h.message||h),"err")}finally{i.style.visibility="",g.dataset.open=m??"true",s.disabled=!1}});function J(){Te.replaceChildren(),p.forEach((s,m)=>{let h=document.createElement("div");h.className="file";let U=document.createElement("span");U.className="nm",U.textContent=s.name;let He=document.createElement("span");He.textContent=re(s.size);let _=document.createElement("button");_.type="button",_.textContent="\u2715",_.setAttribute("aria-label",t.clear),_.addEventListener("click",()=>{p.splice(m,1),J()}),h.append(U,He,_),Te.appendChild(h)})}async function De(){if(C)return;let s=Y.value.trim();if(!s){A(t.titleRequired,"err"),Y.focus();return}C=!0,I.disabled=!0,I.textContent=t.submitting;try{let m=await r.create({type:f,title:s,body:Ae.value,route:Se(),pageUrl:location.href,locale:n,pins:d,attachments:p});A(t.created(m.number),"ok"),e.onCreated?.(m),setTimeout(()=>{fe(!1),B()},900)}catch(m){A(String(m.message||t.failed),"err")}finally{C=!1,I.disabled=!1,I.textContent=t.submit}}I.addEventListener("click",De),j.addEventListener("submit",s=>{s.preventDefault(),De()});async function B(){if(!v){G.replaceChildren(R("div","empty",t.loading));try{c=await r.listByRoute(Se())}catch{c=[]}if(Pe.textContent=c.length>9?"9+":String(c.length),Pe.classList.toggle("hidden",c.length===0),u(".lbl-page").textContent=c.length?t.issueCount(c.length):t.onThisPage,G.replaceChildren(),!c.length){G.appendChild(R("div","empty",t.none));return}for(let s of c){let m=document.createElement("button");if(m.type="button",m.className="row",m.append(R("span","num",`#${s.number}`),R("span",`chip ${s.type}`,t[s.type])),m.appendChild(R("span","t",s.title)),s.busy){let h=R("span","agent-tag","");h.appendChild(R("span","spin","")),h.appendChild(R("span","who",s.agent||t.agentWorking)),h.setAttribute("title",s.agent?t.agentWorkingBy(s.agent):t.agentWorking),m.appendChild(h)}m.addEventListener("click",()=>void Lt(s.number)),G.appendChild(m)}}}async function Lt(s){k||(k=bt(n,gt(e.apiBase),()=>{k?.el.classList.add("hidden"),ce.classList.remove("hidden"),u(".report").classList.remove("hidden"),g.dataset.detail="false",B()}),u(".body").appendChild(k.el)),ce.classList.add("hidden"),u(".report").classList.add("hidden"),j.classList.add("hidden"),Le.classList.add("hidden"),k.el.classList.remove("hidden"),g.dataset.detail="true",await k.load(s)}let Tt={open:Ie,close:O,refresh:()=>void B(),destroy(){b?.(),document.removeEventListener("click",Me,!0),i.remove(),l.remove()}};return B(),Tt}function R(e,t,r){let n=document.createElement(e);return n.className=t,n.textContent=r,n}function Tn(){try{let e=localStorage.getItem(vt);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function Pn(e,t){try{localStorage.setItem(vt,JSON.stringify({right:e,bottom:t}))}catch{}}function An(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return Mt(Rn);})();
