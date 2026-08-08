"use strict";var BuilderIssues=(()=>{var $e=Object.defineProperty;var rn=Object.getOwnPropertyDescriptor;var on=Object.getOwnPropertyNames;var an=Object.prototype.hasOwnProperty;var sn=(e,t)=>{for(var n in t)$e(e,n,{get:t[n],enumerable:!0})},ln=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of on(t))!an.call(e,o)&&o!==n&&$e(e,o,{get:()=>t[o],enumerable:!(r=rn(t,o))||r.enumerable});return e};var cn=e=>ln($e({},"__esModule",{value:!0}),e);var sr={};sn(sr,{highlightPin:()=>be,mount:()=>rr});var B="data-builder-sdk";function pe(e){return!!e?.closest?.(`[${B}]`)}function ot(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,o={tag:e.tagName.toLowerCase(),hint:Z(e),css:pn(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},a=e.getAttribute("data-testid")??e.getAttribute("data-test-id");a&&(o.testid=a),e.id&&!st(e.id)&&(o.domId=e.id);let s=e.getAttribute("role")??un(e);s&&(o.role=s);let l=lt(e);l&&(o.name=l);for(let[p,u]of dn(o))try{let m=document.querySelectorAll(u);m.length===1&&m[0]===e&&o.verified.push(p)}catch{}return o}function dn(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${ee(e.testid)}"]`]),e.domId&&t.push(["domId",`#${ee(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var it=.5;function at(e){if(e.testid){let t=de(`[data-testid="${ee(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=rt(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=de(`[role="${ee(e.role)}"]`).filter(n=>lt(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=rt(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=de(e.css);if(t.length===1){let n=t[0],r=!e.hint||Ie(Z(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=de(e.tag||"*").filter(n=>Ie(Z(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function rt(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,o=null,a=1/0;for(let s of e){let l=s.getBoundingClientRect(),p=l.left/n-t.rect.x,u=l.top/r-t.rect.y,m=Math.hypot(p,u);t.hint&&Ie(Z(s),t.hint)&&(m-=.5),m<a&&([o,a]=[s,m])}return o}function de(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!pe(t))}catch{return[]}}function pn(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!st(n.id)){t.unshift(`#${ee(n.id)}`);break}let o=n.tagName.toLowerCase(),a=n.parentElement;if(!a){t.unshift(o);break}let s=Array.from(a.children).filter(l=>l.tagName===n.tagName);t.unshift(s.length>1?`${o}:nth-of-type(${s.indexOf(n)+1})`:o),n=a}return t.join(" > ").slice(0,512)}function st(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function Z(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function Ie(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function lt(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||Z(e)).slice(0,80)}function un(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function ee(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function ct(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),o=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(o),t&&(r.href=t),o.href=e,o.href}var dt=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function P(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var V=null;function me(e={}){return V||(e.includeStyleProperties?(V=e.includeStyleProperties,V):(V=P(window.getComputedStyle(document.documentElement)),V))}function ue(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function mn(e){let t=ue(e,"border-left-width"),n=ue(e,"border-right-width");return e.clientWidth+t+n}function hn(e){let t=ue(e,"border-top-width"),n=ue(e,"border-bottom-width");return e.clientHeight+t+n}function He(e,t={}){let n=t.width||mn(e),r=t.height||hn(e);return{width:n,height:r}}function pt(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var S=16384;function ut(e){(e.width>S||e.height>S)&&(e.width>S&&e.height>S?e.width>e.height?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S):e.width>S?(e.height*=S/e.width,e.width=S):(e.width*=S/e.height,e.height=S))}function mt(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),o=r.length,a=new Uint8Array(o);for(let s=0;s<o;s+=1)a[s]=r.charCodeAt(s);n(new Blob([a],{type:t.type?t.type:"image/png"}))})}function j(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function fn(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function ht(e,t,n){let r="http://www.w3.org/2000/svg",o=document.createElementNS(r,"svg"),a=document.createElementNS(r,"foreignObject");return o.setAttribute("width",`${t}`),o.setAttribute("height",`${n}`),o.setAttribute("viewBox",`0 0 ${t} ${n}`),a.setAttribute("width","100%"),a.setAttribute("height","100%"),a.setAttribute("x","0"),a.setAttribute("y","0"),a.setAttribute("externalResourcesRequired","true"),o.appendChild(a),a.appendChild(e),fn(o)}var E=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||E(n,t)};function gn(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function bn(e,t){return me(t).map(n=>{let r=e.getPropertyValue(n),o=e.getPropertyPriority(n);return`${n}: ${r}${o?" !important":""};`}).join(" ")}function xn(e,t,n,r){let o=`.${e}:${t}`,a=n.cssText?gn(n):bn(n,r);return document.createTextNode(`${o}{${a}}`)}function ft(e,t,n,r){let o=window.getComputedStyle(e,n),a=o.getPropertyValue("content");if(a===""||a==="none")return;let s=dt();try{t.className=`${t.className} ${s}`}catch{return}let l=document.createElement("style");l.appendChild(xn(s,n,o,r)),t.appendChild(l)}function gt(e,t,n){ft(e,t,":before",n),ft(e,t,":after",n)}var bt="application/font-woff",xt="image/jpeg",yn={woff:bt,woff2:bt,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:xt,jpeg:xt,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function vn(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function G(e){let t=vn(e).toLowerCase();return yn[t]||""}function wn(e){return e.split(/,/)[1]}function te(e){return e.search(/^(data:)/)!==-1}function Fe(e,t){return`data:${t};base64,${e}`}async function ze(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let o=await r.blob();return new Promise((a,s)=>{let l=new FileReader;l.onerror=s,l.onloadend=()=>{try{a(n({res:r,result:l.result}))}catch(p){s(p)}},l.readAsDataURL(o)})}var De={};function En(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function X(e,t,n){let r=En(e,t,n.includeQueryParams);if(De[r]!=null)return De[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let o;try{let a=await ze(e,n.fetchRequestInit,({res:s,result:l})=>(t||(t=s.headers.get("Content-Type")||""),wn(l)));o=Fe(a,t)}catch(a){o=n.imagePlaceholder||"";let s=`Failed to fetch resource: ${e}`;a&&(s=typeof a=="string"?a:a.message),s&&console.warn(s)}return De[r]=o,o}async function kn(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):j(t)}async function Cn(e,t){if(e.currentSrc){let a=document.createElement("canvas"),s=a.getContext("2d");a.width=e.clientWidth,a.height=e.clientHeight,s?.drawImage(e,0,0,a.width,a.height);let l=a.toDataURL();return j(l)}let n=e.poster,r=G(n),o=await X(n,r,t);return j(o)}async function Sn(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await ne(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function Ln(e,t){return E(e,HTMLCanvasElement)?kn(e):E(e,HTMLVideoElement)?Cn(e,t):E(e,HTMLIFrameElement)?Sn(e,t):e.cloneNode(yt(e))}var Tn=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",yt=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function An(e,t,n){var r,o;if(yt(t))return t;let a=[];return Tn(e)&&e.assignedNodes?a=P(e.assignedNodes()):E(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?a=P(e.contentDocument.body.childNodes):a=P(((o=e.shadowRoot)!==null&&o!==void 0?o:e).childNodes),a.length===0||E(e,HTMLVideoElement)||await a.reduce((s,l)=>s.then(()=>ne(l,n)).then(p=>{p&&t.appendChild(p)}),Promise.resolve()),t}function Mn(e,t,n){let r=t.style;if(!r)return;let o=window.getComputedStyle(e);o.cssText?(r.cssText=o.cssText,r.transformOrigin=o.transformOrigin):me(n).forEach(a=>{let s=o.getPropertyValue(a);a==="font-size"&&s.endsWith("px")&&(s=`${Math.floor(parseFloat(s.substring(0,s.length-2)))-.1}px`),E(e,HTMLIFrameElement)&&a==="display"&&s==="inline"&&(s="block"),a==="d"&&t.getAttribute("d")&&(s=`path(${t.getAttribute("d")})`),r.setProperty(a,s,o.getPropertyPriority(a))})}function Pn(e,t){E(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),E(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function Rn(e,t){if(E(e,HTMLSelectElement)){let r=Array.from(t.children).find(o=>e.value===o.getAttribute("value"));r&&r.setAttribute("selected","")}}function $n(e,t,n){return E(t,Element)&&(Mn(e,t,n),gt(e,t,n),Pn(e,t),Rn(e,t)),t}async function In(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let a=0;a<n.length;a++){let l=n[a].getAttribute("xlink:href");if(l){let p=e.querySelector(l),u=document.querySelector(l);!p&&u&&!r[l]&&(r[l]=await ne(u,t,!0))}}let o=Object.values(r);if(o.length){let a="http://www.w3.org/1999/xhtml",s=document.createElementNS(a,"svg");s.setAttribute("xmlns",a),s.style.position="absolute",s.style.width="0",s.style.height="0",s.style.overflow="hidden",s.style.display="none";let l=document.createElementNS(a,"defs");s.appendChild(l);for(let p=0;p<o.length;p++)l.appendChild(o[p]);e.appendChild(s)}return e}async function ne(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>Ln(r,t)).then(r=>An(e,r,t)).then(r=>$n(e,r,t)).then(r=>In(r,t))}var vt=/url\((['"]?)([^'"]+?)\1\)/g,Hn=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,Dn=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function Fn(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function zn(e){let t=[];return e.replace(vt,(n,r,o)=>(t.push(o),n)),t.filter(n=>!te(n))}async function Bn(e,t,n,r,o){try{let a=n?ct(t,n):t,s=G(t),l;if(o){let p=await o(a);l=Fe(p,s)}else l=await X(a,s,r);return e.replace(Fn(t),`$1${l}$3`)}catch{}return e}function On(e,{preferredFontFormat:t}){return t?e.replace(Dn,n=>{for(;;){let[r,,o]=Hn.exec(n)||[];if(!o)return"";if(o===t)return`src: ${r};`}}):e}function Be(e){return e.search(vt)!==-1}async function he(e,t,n){if(!Be(e))return e;let r=On(e,n);return zn(r).reduce((a,s)=>a.then(l=>Bn(l,s,t,n)),Promise.resolve(r))}async function K(e,t,n){var r;let o=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(o){let a=await he(o,null,n);return t.style.setProperty(e,a,t.style.getPropertyPriority(e)),!0}return!1}async function Un(e,t){await K("background",e,t)||await K("background-image",e,t),await K("mask",e,t)||await K("-webkit-mask",e,t)||await K("mask-image",e,t)||await K("-webkit-mask-image",e,t)}async function _n(e,t){let n=E(e,HTMLImageElement);if(!(n&&!te(e.src))&&!(E(e,SVGImageElement)&&!te(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,o=await X(r,G(r),t);await new Promise((a,s)=>{e.onload=a,e.onerror=t.onImageErrorHandler?(...p)=>{try{a(t.onImageErrorHandler(...p))}catch(u){s(u)}}:s;let l=e;l.decode&&(l.decode=a),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=o):e.href.baseVal=o})}async function qn(e,t){let r=P(e.childNodes).map(o=>Oe(o,t));await Promise.all(r).then(()=>e)}async function Oe(e,t){E(e,Element)&&(await Un(e,t),await _n(e,t),await qn(e,t))}function wt(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(o=>{n[o]=r[o]}),e}var Et={};async function kt(e){let t=Et[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},Et[e]=t,t}async function Ct(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,a=(n.match(/url\([^)]+\)/g)||[]).map(async s=>{let l=s.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),ze(l,t.fetchRequestInit,({result:p})=>(n=n.replace(s,`url(${p})`),[s,p]))});return Promise.all(a).then(()=>n)}function St(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),o=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let p=o.exec(r);if(p===null)break;t.push(p[0])}r=r.replace(o,"");let a=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,s="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(s,"gi");for(;;){let p=a.exec(r);if(p===null){if(p=l.exec(r),p===null)break;a.lastIndex=l.lastIndex}else l.lastIndex=a.lastIndex;t.push(p[0])}return t}async function Nn(e,t){let n=[],r=[];return e.forEach(o=>{if("cssRules"in o)try{P(o.cssRules||[]).forEach((a,s)=>{if(a.type===CSSRule.IMPORT_RULE){let l=s+1,p=a.href,u=kt(p).then(m=>Ct(m,t)).then(m=>St(m).forEach(f=>{try{o.insertRule(f,f.startsWith("@import")?l+=1:o.cssRules.length)}catch(v){console.error("Error inserting rule from remote css",{rule:f,error:v})}})).catch(m=>{console.error("Error loading remote css",m.toString())});r.push(u)}})}catch(a){let s=e.find(l=>l.href==null)||document.styleSheets[0];o.href!=null&&r.push(kt(o.href).then(l=>Ct(l,t)).then(l=>St(l).forEach(p=>{s.insertRule(p,s.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",a)}}),Promise.all(r).then(()=>(e.forEach(o=>{if("cssRules"in o)try{P(o.cssRules||[]).forEach(a=>{n.push(a)})}catch(a){console.error(`Error while reading CSS rules from ${o.href}`,a)}}),n))}function Wn(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>Be(t.style.getPropertyValue("src")))}async function Vn(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=P(e.ownerDocument.styleSheets),r=await Nn(n,t);return Wn(r)}function Lt(e){return e.trim().replace(/["']/g,"")}function jn(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(a=>{t.add(Lt(a))}),Array.from(r.children).forEach(a=>{a instanceof HTMLElement&&n(a)})}return n(e),t}async function Tt(e,t){let n=await Vn(e,t),r=jn(e);return(await Promise.all(n.filter(a=>r.has(Lt(a.style.fontFamily))).map(a=>{let s=a.parentStyleSheet?a.parentStyleSheet.href:null;return he(a.cssText,s,t)}))).join(`
`)}async function At(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await Tt(e,t);if(n){let r=document.createElement("style"),o=document.createTextNode(n);r.appendChild(o),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function Gn(e,t={}){let{width:n,height:r}=He(e,t),o=await ne(e,t,!0);return await At(o,t),await Oe(o,t),wt(o,t),await ht(o,n,r)}async function Xn(e,t={}){let{width:n,height:r}=He(e,t),o=await Gn(e,t),a=await j(o),s=document.createElement("canvas"),l=s.getContext("2d"),p=t.pixelRatio||pt(),u=t.canvasWidth||n,m=t.canvasHeight||r;return s.width=u*p,s.height=m*p,t.skipAutoScale||ut(s),s.style.width=`${u}`,s.style.height=`${m}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,s.width,s.height)),l.drawImage(a,0,0,s.width,s.height),s}async function Mt(e,t={}){let n=await Xn(e,t);return await mt(n)}var Kn="data-builder-hide",Ue={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},Pt=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function Rt(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function $t(e){return e==="video"?Ue.video:e==="image"?Ue.image:Ue.file}function fe(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function It(e=15e3){let t=await Promise.race([Mt(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(B)!==null&&r?.hasAttribute?.(B)||r?.hasAttribute?.(Kn))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${Yn()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function Yn(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function _e(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}var Jn={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",cancel:"Cancel",markdownHint:"Markdown supported \u2014 **bold**, `code`, lists.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinAnother:"Pin another",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",apps:"Build",appAgents:"Agents",appSkills:"Skills",appIssues:"Issues",appVault:"Vault",appMcp:"MCP",appTerminal:"Terminal",openInTab:"Open in a new tab",dir:"ltr"},Qn={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",cancel:"\u0625\u0644\u063A\u0627\u0621",markdownHint:"\u064A\u062F\u0639\u0645 Markdown \u2014 **\u0639\u0631\u064A\u0636**\u060C `\u0634\u064A\u0641\u0631\u0629`\u060C \u0642\u0648\u0627\u0626\u0645.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinAnother:"\u062A\u062D\u062F\u064A\u062F \u0645\u0648\u0642\u0639 \u0622\u062E\u0631",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",apps:"\u0627\u0644\u0628\u0646\u0627\u0621",appAgents:"\u0627\u0644\u0648\u0643\u0644\u0627\u0621",appSkills:"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A",appIssues:"\u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",appVault:"\u0627\u0644\u062E\u0632\u0646\u0629",appMcp:"MCP",appTerminal:"\u0627\u0644\u0637\u0631\u0641\u064A\u0629",openInTab:"\u0641\u062A\u062D \u0641\u064A \u062A\u0628\u0648\u064A\u0628 \u062C\u062F\u064A\u062F",dir:"rtl"};function ge(e){return e.toLowerCase().startsWith("ar")?Qn:Jn}function Ht(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},o=p=>{let u=document.elementFromPoint(p.clientX,p.clientY);if(!u||pe(u)||u===document.body||u===document.documentElement){r();return}u!==n&&(r(),n=u,u.classList.add("builder-pin-hover"))},a=p=>{let u=document.elementFromPoint(p.clientX,p.clientY);if(!u||pe(u))return;p.preventDefault(),p.stopPropagation();let m=ot(u);l(),e(m,u)},s=p=>{p.key==="Escape"&&(p.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",o,!0),document.removeEventListener("click",a,!0),document.removeEventListener("keydown",s,!0)}return document.addEventListener("mousemove",o,!0),document.addEventListener("click",a,!0),document.addEventListener("keydown",s,!0),l}function be(e){let t=at(e);if(!t.el||t.confidence<it)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var Dt="http://www.w3.org/2000/svg",Zn={pin:["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0","M12 8a2 2 0 1 0 0 4 2 2 0 1 0 0-4"],x:["M18 6 6 18","m6 6 12 12"],paperclip:["M13.234 20.252 21 12.3a3.53 3.53 0 0 0 0-5 3.53 3.53 0 0 0-5 0L4.32 18.98a5.3 5.3 0 0 0 0 7.5 5.3 5.3 0 0 0 7.5 0l8.49-8.49"],image:["M15 8h.01","M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z","m3 16 5-5c.928-.893 2.072-.893 3 0l5 5","m14 14 1-1c.928-.893 2.072-.893 3 0l3 3"],pencil:["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z","m15 5 4 4"],eye:["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0","M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6"],arrowRight:["M5 12h14","m12 5 7 7-7 7"],agents:["M12 8V4H8","M2 14h2","M20 14h2","M15 13v2","M9 13v2","M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2"],skills:["M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z","M22 10v6","M6 12.5V16a6 3 0 0 0 12 0v-3.5"],issues:["M13 5h8","M13 12h8","M13 19h8","m3 17 2 2 4-4","M3 7h6v-4H3z"],vault:["M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z","M16.5 7.5h.01"],mcp:["M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z","m2 22 3-3","M7.5 13.5 10 11","M10.5 16.5 13 14","m18 3-4 4h6l-4 4","M22 2 12 12"],terminal:["m7 11 2-2-2-2","M11 13h4","M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],external:["M15 3h6v6","M10 14 21 3","M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"]};function L(e,t=14){let n=document.createElementNS(Dt,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let r of Zn[e]??[]){let o=document.createElementNS(Dt,"path");o.setAttribute("d",r),n.appendChild(o)}return n}function D(e,t,n,r=14){e.replaceChildren(),e.appendChild(L(t,r));let o=document.createElement("span");o.textContent=n,e.appendChild(o)}function ye(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let o=n[r],a=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(o);if(a){let m=a[1][0],f=[];for(r++;r<n.length&&!new RegExp(`^\\s*${m}{3,}\\s*$`).test(n[r]);)f.push(n[r]),r++;r++;let v=document.createElement("pre");v.className="md-pre";let C=document.createElement("code");a[2]&&(C.className=`lang-${a[2]}`),C.textContent=f.join(`
`),v.appendChild(C),t.appendChild(v);continue}if(!o.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(o)){t.appendChild(document.createElement("hr")),r++;continue}let s=/^\s*(#{1,6})\s+(.*)$/.exec(o);if(s){let m=Math.min(6,3+s[1].length),f=document.createElement(`h${m}`);f.className="md-h",f.appendChild(xe(s[2])),t.appendChild(f),r++;continue}if(/^\s*>\s?/.test(o)){let m=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)m.push(n[r].replace(/^\s*>\s?/,"")),r++;let f=document.createElement("blockquote");f.className="md-quote",f.appendChild(ye(m.join(`
`))),t.appendChild(f);continue}let l=/^\s*[-*+]\s+/,p=/^\s*\d+[.)]\s+/;if(l.test(o)||p.test(o)){let m=!l.test(o),f=m?p:l,v=document.createElement(m?"ol":"ul");for(v.className="md-list";r<n.length&&f.test(n[r]);){let C=document.createElement("li"),g=n[r].replace(f,"");for(r++;r<n.length&&n[r].trim()&&!f.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)g+=`
`+n[r].trim(),r++;C.appendChild(xe(g)),v.appendChild(C)}t.appendChild(v);continue}let u=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r]);)u.push(n[r]),r++;if(u.length){let m=document.createElement("p");m.className="md-p",m.appendChild(xe(u.join(`
`))),t.appendChild(m)}else r++}return t}var er=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function xe(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=er.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&zt(t,n.slice(0,r.index)),r[1]){let o=document.createElement("code");o.className="md-code",o.textContent=r[2].trim(),t.appendChild(o)}else r[3]!==void 0?t.appendChild(Ft(r[4],r[3]||r[4])):r[5]?t.appendChild(qe("strong","md-strong",r[6])):r[7]?t.appendChild(qe("del","md-del",r[8])):r[9]?t.appendChild(qe("em","md-em",r[10])):r[11]&&t.appendChild(Ft(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&zt(t,n),t}function qe(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(xe(n)),r}function Ft(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function zt(e,t){t.split(`
`).forEach((r,o)=>{o&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function Bt(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let o=await r.json();return{id:o.id,number:o.number,title:o.title,body:o.body??"",type:o.type,status:o.status,priority:o.priority,route:o.route??"",pageUrl:o.pageUrl??"",createdAt:o.createdAt??"",pins:o.pins??[],comments:o.comments??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function Ot(e,t,n){let r=ge(e),o=document.createElement("div");o.className="detail hidden";let a=null;async function s(u){o.replaceChildren(y("p","empty",r.loading));try{a=await t.get(u),l()}catch(m){o.replaceChildren(y("p","note err",String(m.message)))}}function l(){if(!a)return;let u=a;o.replaceChildren();let m=y("div","d-head",""),f=ve("ghost","\u2190 "+r.onThisPage);f.addEventListener("click",n);let v=ve("ghost","\u2197");v.title=r.report,v.addEventListener("click",()=>window.open(`/issues/${u.number}`,"_blank","noopener")),m.append(f,v),o.appendChild(m);let C=y("div","d-meta","");if(C.append(y("span","num",`#${u.number}`),y("span",`chip ${u.type}`,r[u.type]??u.type),y("span","chip status",u.status.replace("_"," "))),o.append(C,y("h3","d-title",u.title)),u.body){let w=y("div","d-body","");w.appendChild(ye(u.body)),o.appendChild(w)}if(u.pins.length){o.appendChild(y("div","label",r.location));for(let w of u.pins){let d=y("div","d-pin","");d.appendChild(y("span","nm",`<${w.tag??"?"}>${w.name?` \u201C${w.name}\u201D`:""}`));let b=ve("ghost","");b.appendChild(L("eye",14)),b.title=r.pin,b.addEventListener("click",()=>{let x=be(w);p(x.found?`Found via ${x.by} (${Math.round(x.confidence*100)}%)`:"The pinned element is not on this page any more.",x.found?"ok":"err")}),d.appendChild(b),o.appendChild(d)}}o.appendChild(y("div","label","Comments")),u.comments.length||o.appendChild(y("p","empty","No comments yet."));for(let w of u.comments){let d=y("div","d-comment",""),b=y("p","who",w.author||"someone");w.kind==="agent"&&b.appendChild(y("span","chip agent","agent"));let x=y("div","txt","");x.appendChild(ye(w.body)),d.append(b,x),o.appendChild(d)}let g=document.createElement("textarea");g.placeholder="Add a comment\u2026",g.rows=3;let A=ve("primary","Comment");A.addEventListener("click",async()=>{let w=g.value.trim();if(w){A.disabled=!0;try{await t.comment(u.number,w),g.value="",await s(u.number)}catch(d){p(String(d.message),"err")}finally{A.disabled=!1}}}),o.append(g,A)}function p(u,m){let f=y("p",`note ${m}`,u);o.appendChild(f),setTimeout(()=>f.remove(),4e3)}return{el:o,load:s,destroy:()=>o.remove()}}function y(e,t,n){let r=document.createElement(e);return r.className=t,n&&(r.textContent=n),r}function ve(e,t){let n=document.createElement("button");return n.type="button",n.className=e,n.textContent=t,n}var Ut=`
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
  /* auto-fill, not a fixed four. The launcher grew to five and a hard column
     count either squeezes them or strands one alone on a second row. */
  display: grid; gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
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
  transition: opacity .14s ease;
}
.modal[data-open="true"] { opacity: 1; pointer-events: auto; }
.modal-card {
  /* Positioned rather than centred once dragging starts; place-items handles
     the first paint and JS takes over from there. */
  width: min(440px, calc(100vw - 24px));
  max-height: min(86vh, 720px);
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0,0,0,.35);
  overflow: hidden;
}
.modal-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; border-bottom: 1px solid var(--border);
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
.modal-title { margin: 0; font-size: 14px; font-weight: 600; }
.modal-x {
  margin-inline-start: auto;
  border: 0; background: transparent; color: var(--muted);
  cursor: pointer; padding: 5px; border-radius: 8px; display: inline-flex;
}
.modal-x:hover { color: var(--text); background: var(--border); }
.modal-body { padding: 14px; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
.modal-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 12px 14px; border-top: 1px solid var(--border); flex: 0 0 auto;
}
.modal-foot .primary { width: auto; }
.row2 { display: grid; gap: 10px; }
.hint { margin: 4px 0 0; font-size: 11px; color: var(--muted); }
/* One row per pin, each removable on its own. */
.pinrow {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 8px; border: 1px solid var(--border); border-radius: 8px;
  margin-bottom: 5px; font-size: 11px;
}
.pinnum {
  flex: 0 0 auto; width: 16px; height: 16px; border-radius: 999px;
  background: var(--accent); color: var(--accent-fg);
  font-size: 9.5px; font-weight: 700; line-height: 16px; text-align: center;
  font-variant-numeric: tabular-nums;
}
.pintxt { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pindel {
  flex: 0 0 auto; border: 0; background: transparent; color: var(--muted);
  padding: 2px; border-radius: 6px; display: inline-flex; cursor: pointer;
}
.pindel:hover { color: var(--text); background: var(--border); }

@media (prefers-reduced-motion: reduce) {
  .modal { transition: none; }
}

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
`,_t=`
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

`;function qt(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let o=await r.json().catch(()=>null);return Array.isArray(o?.issues)?o.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??""}));for(let s of n.attachments)r.append("attachments",s.blob,s.name),r.append("attachment_kinds",s.kind);let o=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!o.ok){let s=await o.text().catch(()=>"");throw new Error(s||`submit failed (${o.status})`)}let a=await o.json();return{id:String(a.id??""),number:Number(a.number??0)}}}}var Nt="builder.fab.position",tr=["bug","feature","question","discussion"],nr=8;function rr(e={}){let t=ge(e.locale??document.documentElement.lang??"en"),n=e.transport??qt(e.apiBase),r=e.locale??"en",o=document.createElement("div");o.setAttribute(B,""),o.setAttribute("dir",t.dir),e.theme&&o.setAttribute("data-theme",e.theme),document.body.appendChild(o);let a=o.attachShadow({mode:"open"}),s=document.createElement("style");s.textContent=Ut+(e.accent?`:host{--accent:${ar(e.accent)}}`:""),a.appendChild(s);let l=document.createElement("style");l.setAttribute(B,""),l.textContent=_t,document.head.appendChild(l);let p=[],u=[],m=[],f="bug",v=!1,C=!1,g=null,A=null,w=document.createElement("div");w.innerHTML=`
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

        <div class="listing">
          <div class="label lbl-page"></div>
          <div class="rows"></div>
          <!-- The panel shows only issues for THIS page. Getting to the full
               board previously meant knowing the /issues URL by heart. -->
          <a class="board-link" href="/issues" target="_blank" rel="noopener"></a>
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
            <input type="file" class="filein hidden" multiple accept="${Pt}">

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
    </div>`,a.appendChild(w);let d=i=>a.querySelector(i),b=d(".fab"),x=d(".panel"),Ne=d(".form"),We=d(".listing"),re=d(".modal"),T=d(".modal-card"),O=d(".modal-head"),we=d(".modal-x"),Ve=d(".cancel"),oe=d(".rows"),Ee=d(".pills"),ke=d(".note"),je=d(".files"),ie=d(".filein"),Ge=d(".count"),Wt=d(".appgrid"),Ce=d(".ov"),Se=d(".ov-frame"),Vt=d(".ov-title"),ae=d(".ov-ico"),Le=d(".ov-tab"),Te=d(".ov-x"),se=d('input[name="title"]'),Xe=d('textarea[name="body"]'),jt=d('input[name="url"]'),R=d(".pin"),Ae=d(".clearpin"),Me=d(".pin-preview"),U=d(".send"),le=new WeakMap;function Gt(i){let c=le.get(i);return c||(c=URL.createObjectURL(i.blob),le.set(i,c)),c}function Pe(i){let c=le.get(i);c&&(URL.revokeObjectURL(c),le.delete(i))}d(".fab-label").textContent=t.fab,d("h2").textContent=t.title,d(".fab-ico").replaceChildren(L("pencil",15)),d(".x").replaceChildren(L("x",15)),d(".x").setAttribute("aria-label",t.close),d(".intro").textContent=t.intro,d(".report").textContent=t.report,d(".lbl-type").textContent=t.type,d(".lbl-title").textContent=t.titleLabel,d(".lbl-details").textContent=t.details,d(".lbl-url").textContent=t.pageUrl,d(".lbl-loc").textContent=t.location,d(".lbl-att").textContent=t.attachments,d(".lbl-page").textContent=t.onThisPage,D(d(".board-link"),"arrowRight",t.openBoard),d(".lbl-apps").textContent=t.apps,d(".modal-title").textContent=t.reportTitle,we.setAttribute("aria-label",t.close),we.appendChild(L("x",15)),re.setAttribute("aria-label",t.reportTitle),Ve.textContent=t.cancel,d(".lbl-md").textContent=t.markdownHint,Te.setAttribute("aria-label",t.close),Te.appendChild(L("x",16)),Le.setAttribute("aria-label",t.openInTab),Le.appendChild(L("external",15)),se.placeholder=t.titlePlaceholder,Xe.placeholder=t.detailsPlaceholder,D(R,"pin",t.pin),D(Ae,"x",t.clear),D(d(".addfile"),"paperclip",t.addFile),D(d(".shot"),"image",t.screenshot),U.textContent=t.submit;for(let i of tr){let c=document.createElement("button");c.type="button",c.className="pill",c.dataset.type=i,c.textContent=t[i],c.setAttribute("aria-pressed",String(i===f)),c.addEventListener("click",()=>{f=i,Ee.querySelectorAll(".pill").forEach(h=>h.setAttribute("aria-pressed",String(h.dataset.type===i)))}),Ee.appendChild(c)}let Xt=4,M=null,Re=(i,c)=>{let h=Math.max(8,Math.min(i,window.innerWidth-80)),k=Math.max(8,Math.min(c,window.innerHeight-48));b.style.insetInlineEnd=`${h}px`,b.style.insetBlockEnd=`${k}px`},Ke=or();Re(Ke?.right??e.position?.right??24,Ke?.bottom??e.position?.bottom??24),b.addEventListener("pointerdown",i=>{if(i.button!==0)return;let c=b.getBoundingClientRect();M={x:i.clientX,y:i.clientY,ox:window.innerWidth-c.right,oy:window.innerHeight-c.bottom,moved:!1},b.setPointerCapture(i.pointerId)}),b.addEventListener("pointermove",i=>{if(!M)return;let c=i.clientX-M.x,h=i.clientY-M.y;!M.moved&&Math.hypot(c,h)<Xt||(M.moved=!0,Re(M.ox-c,M.oy-h))}),b.addEventListener("pointerup",i=>{if(!M)return;let c=M.moved;if(M=null,b.releasePointerCapture(i.pointerId),c){let h=b.getBoundingClientRect();ir(window.innerWidth-h.right,window.innerHeight-h.bottom);return}Ye()}),b.addEventListener("keydown",i=>{(i.key==="Enter"||i.key===" ")&&(i.preventDefault(),Ye())}),window.addEventListener("resize",()=>{let i=b.getBoundingClientRect();Re(window.innerWidth-i.right,window.innerHeight-i.bottom)});function Ye(){x.dataset.open==="true"?_():Je()}function Je(){x.dataset.open="true",b.setAttribute("aria-expanded","true"),jt.value=location.href,Q()}function _(){x.dataset.open="false",x.dataset.detail="false",b.setAttribute("aria-expanded","false"),z(!1),g?.(),g=null}let Kt=[{key:"agents",path:"/agents",color:"#8b5cf6",label:t.appAgents},{key:"skills",path:"/skills",color:"#06b6d4",label:t.appSkills},{key:"issues",path:"/issues",color:"#f59e0b",label:t.appIssues},{key:"vault",path:"/vault",color:"#10b981",label:t.appVault},{key:"mcp",path:"/mcp",color:"#ec4899",label:t.appMcp},{key:"terminal",path:"/terminal",color:"#64748b",label:t.appTerminal}];function Yt(){let i=(e.apiBase??"").trim();if(!i)return"";try{return new URL(i,location.href).origin}catch{return""}}let Qe=(i,c)=>`${Yt()}${i}${c?"?embed=1":""}`;for(let i of Kt){let c=document.createElement("button");c.type="button",c.className="app",c.dataset.app=i.key;let h=document.createElement("span");h.className="app-ico",h.style.background=`${i.color}38`,h.style.color=i.color,h.appendChild(L(i.key,18));let k=document.createElement("span");k.textContent=i.label,c.append(h,k),c.addEventListener("click",()=>Jt(i)),Wt.appendChild(c)}let Y=null;function Jt(i){Se.src=Qe(i.path,!0),Se.title=i.label,Vt.textContent=i.label,Le.href=Qe(i.path,!1),Ce.setAttribute("aria-label",i.label),ae.textContent="",ae.style.background=`${i.color}38`,ae.style.color=i.color,ae.appendChild(L(i.key,16)),Ce.dataset.open="true",_(),Y=c=>{c.key==="Escape"&&Ze()},document.addEventListener("keydown",Y)}function Ze(){Ce.dataset.open="false",Se.src="about:blank",Y&&document.removeEventListener("keydown",Y),Y=null}Te.addEventListener("click",Ze);let q=null;O.addEventListener("pointerdown",i=>{if(i.target.closest(".modal-x"))return;let c=T.getBoundingClientRect();T.style.position="fixed",T.style.margin="0",T.style.left=`${c.left}px`,T.style.top=`${c.top}px`,q={dx:i.clientX-c.left,dy:i.clientY-c.top},O.setPointerCapture(i.pointerId)}),O.addEventListener("pointermove",i=>{if(!q)return;let c=T.getBoundingClientRect(),h=Math.min(Math.max(i.clientX-q.dx,8-c.width+80),innerWidth-80),k=Math.min(Math.max(i.clientY-q.dy,8),innerHeight-44);T.style.left=`${h}px`,T.style.top=`${k}px`});let et=i=>{if(q){q=null;try{O.releasePointerCapture(i.pointerId)}catch{}}};O.addEventListener("pointerup",et),O.addEventListener("pointercancel",et);function Qt(){T.style.position="",T.style.left="",T.style.top="",T.style.margin=""}we.addEventListener("click",()=>z(!1)),Ve.addEventListener("click",()=>z(!1)),document.addEventListener("keydown",i=>{i.key==="Escape"&&v&&!g&&z(!1)}),d(".x").addEventListener("click",_),a.addEventListener("keydown",i=>{i.key==="Escape"&&!g&&_()});function tt(i){x.dataset.open!=="true"||g||i.composedPath().includes(o)||_()}document.addEventListener("click",tt,!0);function z(i){v=i,re.dataset.open=i?"true":"false",i?(Qt(),setTimeout(()=>se.focus(),30)):(Zt(),g?.(),g=null)}d(".report").addEventListener("click",()=>z(!0));function Zt(){Ne.reset(),u=[],m.forEach(Pe),m=[],f="bug",Ee.querySelectorAll(".pill").forEach(i=>i.setAttribute("aria-pressed",String(i.dataset.type==="bug"))),J(),ce(),$("")}function $(i,c=""){ke.textContent=i,ke.className=`note ${c}`.trim(),ke.classList.toggle("hidden",!i)}R.addEventListener("click",()=>{if(g){g(),g=null,R.setAttribute("aria-pressed","false"),D(R,"pin",t.pin);return}x.dataset.open="false",re.dataset.open="false",R.setAttribute("aria-pressed","true"),R.textContent=t.pinning;let i=()=>{v?re.dataset.open="true":x.dataset.open="true"};g=Ht((c,h)=>{u.length<nr&&(u=[...u,c]),g=null,i(),J(),h.classList.add("builder-pin-found"),setTimeout(()=>h.classList.remove("builder-pin-found"),3e3)},()=>{g=null,i(),J()})}),Ae.addEventListener("click",()=>{u=[],J()});function J(){let i=u.length>0;R.setAttribute("aria-pressed",String(i)),D(R,"pin",i?t.pinAnother:t.pin),Ae.classList.toggle("hidden",!i),Me.classList.toggle("hidden",!i),Me.textContent="",u.forEach((c,h)=>{let k=document.createElement("div");k.className="pinrow";let N=document.createElement("span");N.className="pinnum",N.textContent=String(h+1);let I=c.name||c.hint||"",H=document.createElement("span");H.className="pintxt",H.textContent=`<${c.tag??"?"}>${I?` \u201C${I}\u201D`:""}`;let W=document.createElement("button");W.type="button",W.className="pindel",W.setAttribute("aria-label",`${t.clear} ${h+1}`),W.appendChild(L("x",12)),W.addEventListener("click",()=>{u.splice(h,1),J()}),k.append(N,H,W),Me.appendChild(k)})}d(".addfile").addEventListener("click",()=>ie.click()),ie.addEventListener("change",()=>{for(let i of Array.from(ie.files??[]))en(i);ie.value=""});function en(i){let c=Rt(i.type),h=$t(c);if(i.size>h){$(`${i.name} is ${fe(i.size)} \u2014 the limit is ${fe(h)}.`,"err");return}m.push({name:i.name,mime:i.type,size:i.size,kind:c,blob:i}),ce(),$("")}d(".shot").addEventListener("click",async()=>{let i=d(".shot");i.disabled=!0;let c=x.dataset.open;x.dataset.open="false",o.style.visibility="hidden";try{await new Promise(h=>setTimeout(h,120)),m.push(await It()),ce(),$("")}catch(h){$(String(h.message||h),"err")}finally{o.style.visibility="",x.dataset.open=c??"true",i.disabled=!1}});function ce(){je.replaceChildren(),m.forEach((i,c)=>{let h=document.createElement("div");if(h.className="file",i.kind==="screenshot"||i.kind==="image"){let H=document.createElement("img");H.className="thumb",H.src=Gt(i),H.alt="",h.appendChild(H)}let k=document.createElement("span");k.className="nm",k.textContent=i.name;let N=document.createElement("span");N.textContent=fe(i.size);let I=document.createElement("button");I.type="button",I.replaceChildren(L("x",12)),I.setAttribute("aria-label",t.clear),I.addEventListener("click",()=>{Pe(i),m.splice(c,1),ce()}),h.append(k,N,I),je.appendChild(h)})}async function nt(){if(C)return;let i=se.value.trim();if(!i){$(t.titleRequired,"err"),se.focus();return}C=!0,U.disabled=!0,U.textContent=t.submitting;try{let c=await n.create({type:f,title:i,body:Xe.value,route:_e(),pageUrl:location.href,locale:r,pins:u,attachments:m});$(t.created(c.number),"ok"),e.onCreated?.(c),setTimeout(()=>{z(!1),Q()},900)}catch(c){$(String(c.message||t.failed),"err")}finally{C=!1,U.disabled=!1,U.textContent=t.submit}}U.addEventListener("click",nt),Ne.addEventListener("submit",i=>{i.preventDefault(),nt()});async function Q(){if(!v){oe.replaceChildren(F("div","empty",t.loading));try{p=await n.listByRoute(_e())}catch{p=[]}if(Ge.textContent=p.length>9?"9+":String(p.length),Ge.classList.toggle("hidden",p.length===0),d(".lbl-page").textContent=p.length?t.issueCount(p.length):t.onThisPage,oe.replaceChildren(),!p.length){oe.appendChild(F("div","empty",t.none));return}for(let i of p){let c=document.createElement("button");if(c.type="button",c.className="row",c.append(F("span","num",`#${i.number}`),F("span",`chip ${i.type}`,t[i.type])),c.appendChild(F("span","t",i.title)),i.busy){let h=F("span","agent-tag","");h.appendChild(F("span","spin","")),h.appendChild(F("span","who",i.agent||t.agentWorking)),h.setAttribute("title",i.agent?t.agentWorkingBy(i.agent):t.agentWorking),c.appendChild(h)}c.addEventListener("click",()=>void tn(i.number)),oe.appendChild(c)}}}async function tn(i){A||(A=Ot(r,Bt(e.apiBase),()=>{A?.el.classList.add("hidden"),We.classList.remove("hidden"),d(".report").classList.remove("hidden"),x.dataset.detail="false",Q()}),d(".body").appendChild(A.el)),We.classList.add("hidden"),d(".report").classList.add("hidden"),d(".apps").classList.add("hidden"),z(!1),A.el.classList.remove("hidden"),x.dataset.detail="true",await A.load(i)}let nn={open:Je,close:_,refresh:()=>void Q(),destroy(){g?.(),m.forEach(Pe),document.removeEventListener("click",tt,!0),o.remove(),l.remove()}};return Q(),nn}function F(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function or(){try{let e=localStorage.getItem(Nt);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function ir(e,t){try{localStorage.setItem(Nt,JSON.stringify({right:e,bottom:t}))}catch{}}function ar(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return cn(sr);})();
