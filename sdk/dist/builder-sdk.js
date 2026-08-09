"use strict";var BuilderIssues=(()=>{var Ie=Object.defineProperty;var on=Object.getOwnPropertyDescriptor;var an=Object.getOwnPropertyNames;var sn=Object.prototype.hasOwnProperty;var ln=(e,t)=>{for(var n in t)Ie(e,n,{get:t[n],enumerable:!0})},cn=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of an(t))!sn.call(e,o)&&o!==n&&Ie(e,o,{get:()=>t[o],enumerable:!(r=on(t,o))||r.enumerable});return e};var dn=e=>cn(Ie({},"__esModule",{value:!0}),e);var Cr={};ln(Cr,{BRIDGE_MSG:()=>E,highlightPin:()=>ye,mount:()=>yr});var W="data-builder-sdk";function he(e){return!!e?.closest?.(`[${W}]`)}function it(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,o={tag:e.tagName.toLowerCase(),hint:te(e),css:un(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},i=e.getAttribute("data-testid")??e.getAttribute("data-test-id");i&&(o.testid=i),e.id&&!lt(e.id)&&(o.domId=e.id);let a=e.getAttribute("role")??hn(e);a&&(o.role=a);let l=ct(e);l&&(o.name=l);for(let[p,d]of pn(o))try{let h=document.querySelectorAll(d);h.length===1&&h[0]===e&&o.verified.push(p)}catch{}return o}function pn(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${ne(e.testid)}"]`]),e.domId&&t.push(["domId",`#${ne(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var at=.5;function st(e){if(e.testid){let t=ue(`[data-testid="${ne(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=ot(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=ue(`[role="${ne(e.role)}"]`).filter(n=>ct(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=ot(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=ue(e.css);if(t.length===1){let n=t[0],r=!e.hint||He(te(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=ue(e.tag||"*").filter(n=>He(te(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function ot(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,o=null,i=1/0;for(let a of e){let l=a.getBoundingClientRect(),p=l.left/n-t.rect.x,d=l.top/r-t.rect.y,h=Math.hypot(p,d);t.hint&&He(te(a),t.hint)&&(h-=.5),h<i&&([o,i]=[a,h])}return o}function ue(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!he(t))}catch{return[]}}function un(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!lt(n.id)){t.unshift(`#${ne(n.id)}`);break}let o=n.tagName.toLowerCase(),i=n.parentElement;if(!i){t.unshift(o);break}let a=Array.from(i.children).filter(l=>l.tagName===n.tagName);t.unshift(a.length>1?`${o}:nth-of-type(${a.indexOf(n)+1})`:o),n=i}return t.join(" > ").slice(0,512)}function lt(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function te(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function He(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function ct(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||te(e)).slice(0,80)}function hn(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function ne(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function dt(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),o=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(o),t&&(r.href=t),o.href=e,o.href}var pt=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function D(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var G=null;function fe(e={}){return G||(e.includeStyleProperties?(G=e.includeStyleProperties,G):(G=D(window.getComputedStyle(document.documentElement)),G))}function me(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function mn(e){let t=me(e,"border-left-width"),n=me(e,"border-right-width");return e.clientWidth+t+n}function fn(e){let t=me(e,"border-top-width"),n=me(e,"border-bottom-width");return e.clientHeight+t+n}function De(e,t={}){let n=t.width||mn(e),r=t.height||fn(e);return{width:n,height:r}}function ut(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var P=16384;function ht(e){(e.width>P||e.height>P)&&(e.width>P&&e.height>P?e.width>e.height?(e.height*=P/e.width,e.width=P):(e.width*=P/e.height,e.height=P):e.width>P?(e.height*=P/e.width,e.width=P):(e.width*=P/e.height,e.height=P))}function mt(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),o=r.length,i=new Uint8Array(o);for(let a=0;a<o;a+=1)i[a]=r.charCodeAt(a);n(new Blob([i],{type:t.type?t.type:"image/png"}))})}function Z(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function gn(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function ft(e,t,n){let r="http://www.w3.org/2000/svg",o=document.createElementNS(r,"svg"),i=document.createElementNS(r,"foreignObject");return o.setAttribute("width",`${t}`),o.setAttribute("height",`${n}`),o.setAttribute("viewBox",`0 0 ${t} ${n}`),i.setAttribute("width","100%"),i.setAttribute("height","100%"),i.setAttribute("x","0"),i.setAttribute("y","0"),i.setAttribute("externalResourcesRequired","true"),o.appendChild(i),i.appendChild(e),gn(o)}var L=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||L(n,t)};function bn(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function xn(e,t){return fe(t).map(n=>{let r=e.getPropertyValue(n),o=e.getPropertyPriority(n);return`${n}: ${r}${o?" !important":""};`}).join(" ")}function vn(e,t,n,r){let o=`.${e}:${t}`,i=n.cssText?bn(n):xn(n,r);return document.createTextNode(`${o}{${i}}`)}function gt(e,t,n,r){let o=window.getComputedStyle(e,n),i=o.getPropertyValue("content");if(i===""||i==="none")return;let a=pt();try{t.className=`${t.className} ${a}`}catch{return}let l=document.createElement("style");l.appendChild(vn(a,n,o,r)),t.appendChild(l)}function bt(e,t,n){gt(e,t,":before",n),gt(e,t,":after",n)}var xt="application/font-woff",vt="image/jpeg",yn={woff:xt,woff2:xt,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:vt,jpeg:vt,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function wn(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function Y(e){let t=wn(e).toLowerCase();return yn[t]||""}function En(e){return e.split(/,/)[1]}function re(e){return e.search(/^(data:)/)!==-1}function Be(e,t){return`data:${t};base64,${e}`}async function Fe(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let o=await r.blob();return new Promise((i,a)=>{let l=new FileReader;l.onerror=a,l.onloadend=()=>{try{i(n({res:r,result:l.result}))}catch(p){a(p)}},l.readAsDataURL(o)})}var ze={};function kn(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function K(e,t,n){let r=kn(e,t,n.includeQueryParams);if(ze[r]!=null)return ze[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let o;try{let i=await Fe(e,n.fetchRequestInit,({res:a,result:l})=>(t||(t=a.headers.get("Content-Type")||""),En(l)));o=Be(i,t)}catch(i){o=n.imagePlaceholder||"";let a=`Failed to fetch resource: ${e}`;i&&(a=typeof i=="string"?i:i.message),a&&console.warn(a)}return ze[r]=o,o}async function Cn(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):Z(t)}async function Sn(e,t){if(e.currentSrc){let i=document.createElement("canvas"),a=i.getContext("2d");i.width=e.clientWidth,i.height=e.clientHeight,a?.drawImage(e,0,0,i.width,i.height);let l=i.toDataURL();return Z(l)}let n=e.poster,r=Y(n),o=await K(n,r,t);return Z(o)}async function Ln(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await oe(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function An(e,t){return L(e,HTMLCanvasElement)?Cn(e):L(e,HTMLVideoElement)?Sn(e,t):L(e,HTMLIFrameElement)?Ln(e,t):e.cloneNode(yt(e))}var Tn=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",yt=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function Mn(e,t,n){var r,o;if(yt(t))return t;let i=[];return Tn(e)&&e.assignedNodes?i=D(e.assignedNodes()):L(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?i=D(e.contentDocument.body.childNodes):i=D(((o=e.shadowRoot)!==null&&o!==void 0?o:e).childNodes),i.length===0||L(e,HTMLVideoElement)||await i.reduce((a,l)=>a.then(()=>oe(l,n)).then(p=>{p&&t.appendChild(p)}),Promise.resolve()),t}function Rn(e,t,n){let r=t.style;if(!r)return;let o=window.getComputedStyle(e);o.cssText?(r.cssText=o.cssText,r.transformOrigin=o.transformOrigin):fe(n).forEach(i=>{let a=o.getPropertyValue(i);i==="font-size"&&a.endsWith("px")&&(a=`${Math.floor(parseFloat(a.substring(0,a.length-2)))-.1}px`),L(e,HTMLIFrameElement)&&i==="display"&&a==="inline"&&(a="block"),i==="d"&&t.getAttribute("d")&&(a=`path(${t.getAttribute("d")})`),r.setProperty(i,a,o.getPropertyPriority(i))})}function Pn(e,t){L(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),L(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function $n(e,t){if(L(e,HTMLSelectElement)){let r=Array.from(t.children).find(o=>e.value===o.getAttribute("value"));r&&r.setAttribute("selected","")}}function In(e,t,n){return L(t,Element)&&(Rn(e,t,n),bt(e,t,n),Pn(e,t),$n(e,t)),t}async function Hn(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let i=0;i<n.length;i++){let l=n[i].getAttribute("xlink:href");if(l){let p=e.querySelector(l),d=document.querySelector(l);!p&&d&&!r[l]&&(r[l]=await oe(d,t,!0))}}let o=Object.values(r);if(o.length){let i="http://www.w3.org/1999/xhtml",a=document.createElementNS(i,"svg");a.setAttribute("xmlns",i),a.style.position="absolute",a.style.width="0",a.style.height="0",a.style.overflow="hidden",a.style.display="none";let l=document.createElementNS(i,"defs");a.appendChild(l);for(let p=0;p<o.length;p++)l.appendChild(o[p]);e.appendChild(a)}return e}async function oe(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>An(r,t)).then(r=>Mn(e,r,t)).then(r=>In(e,r,t)).then(r=>Hn(r,t))}var wt=/url\((['"]?)([^'"]+?)\1\)/g,Dn=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,zn=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function Bn(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function Fn(e){let t=[];return e.replace(wt,(n,r,o)=>(t.push(o),n)),t.filter(n=>!re(n))}async function On(e,t,n,r,o){try{let i=n?dt(t,n):t,a=Y(t),l;if(o){let p=await o(i);l=Be(p,a)}else l=await K(i,a,r);return e.replace(Bn(t),`$1${l}$3`)}catch{}return e}function Un(e,{preferredFontFormat:t}){return t?e.replace(zn,n=>{for(;;){let[r,,o]=Dn.exec(n)||[];if(!o)return"";if(o===t)return`src: ${r};`}}):e}function Oe(e){return e.search(wt)!==-1}async function ge(e,t,n){if(!Oe(e))return e;let r=Un(e,n);return Fn(r).reduce((i,a)=>i.then(l=>On(l,a,t,n)),Promise.resolve(r))}async function J(e,t,n){var r;let o=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(o){let i=await ge(o,null,n);return t.style.setProperty(e,i,t.style.getPropertyPriority(e)),!0}return!1}async function _n(e,t){await J("background",e,t)||await J("background-image",e,t),await J("mask",e,t)||await J("-webkit-mask",e,t)||await J("mask-image",e,t)||await J("-webkit-mask-image",e,t)}async function Nn(e,t){let n=L(e,HTMLImageElement);if(!(n&&!re(e.src))&&!(L(e,SVGImageElement)&&!re(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,o=await K(r,Y(r),t);await new Promise((i,a)=>{e.onload=i,e.onerror=t.onImageErrorHandler?(...p)=>{try{i(t.onImageErrorHandler(...p))}catch(d){a(d)}}:a;let l=e;l.decode&&(l.decode=i),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=o):e.href.baseVal=o})}async function qn(e,t){let r=D(e.childNodes).map(o=>Ue(o,t));await Promise.all(r).then(()=>e)}async function Ue(e,t){L(e,Element)&&(await _n(e,t),await Nn(e,t),await qn(e,t))}function Et(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(o=>{n[o]=r[o]}),e}var kt={};async function Ct(e){let t=kt[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},kt[e]=t,t}async function St(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,i=(n.match(/url\([^)]+\)/g)||[]).map(async a=>{let l=a.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),Fe(l,t.fetchRequestInit,({result:p})=>(n=n.replace(a,`url(${p})`),[a,p]))});return Promise.all(i).then(()=>n)}function Lt(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),o=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let p=o.exec(r);if(p===null)break;t.push(p[0])}r=r.replace(o,"");let i=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(a,"gi");for(;;){let p=i.exec(r);if(p===null){if(p=l.exec(r),p===null)break;i.lastIndex=l.lastIndex}else l.lastIndex=i.lastIndex;t.push(p[0])}return t}async function Wn(e,t){let n=[],r=[];return e.forEach(o=>{if("cssRules"in o)try{D(o.cssRules||[]).forEach((i,a)=>{if(i.type===CSSRule.IMPORT_RULE){let l=a+1,p=i.href,d=Ct(p).then(h=>St(h,t)).then(h=>Lt(h).forEach(g=>{try{o.insertRule(g,g.startsWith("@import")?l+=1:o.cssRules.length)}catch(y){console.error("Error inserting rule from remote css",{rule:g,error:y})}})).catch(h=>{console.error("Error loading remote css",h.toString())});r.push(d)}})}catch(i){let a=e.find(l=>l.href==null)||document.styleSheets[0];o.href!=null&&r.push(Ct(o.href).then(l=>St(l,t)).then(l=>Lt(l).forEach(p=>{a.insertRule(p,a.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",i)}}),Promise.all(r).then(()=>(e.forEach(o=>{if("cssRules"in o)try{D(o.cssRules||[]).forEach(i=>{n.push(i)})}catch(i){console.error(`Error while reading CSS rules from ${o.href}`,i)}}),n))}function Vn(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>Oe(t.style.getPropertyValue("src")))}async function jn(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=D(e.ownerDocument.styleSheets),r=await Wn(n,t);return Vn(r)}function At(e){return e.trim().replace(/["']/g,"")}function Xn(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(i=>{t.add(At(i))}),Array.from(r.children).forEach(i=>{i instanceof HTMLElement&&n(i)})}return n(e),t}async function Tt(e,t){let n=await jn(e,t),r=Xn(e);return(await Promise.all(n.filter(i=>r.has(At(i.style.fontFamily))).map(i=>{let a=i.parentStyleSheet?i.parentStyleSheet.href:null;return ge(i.cssText,a,t)}))).join(`
`)}async function Mt(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await Tt(e,t);if(n){let r=document.createElement("style"),o=document.createTextNode(n);r.appendChild(o),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function Gn(e,t={}){let{width:n,height:r}=De(e,t),o=await oe(e,t,!0);return await Mt(o,t),await Ue(o,t),Et(o,t),await ft(o,n,r)}async function Zn(e,t={}){let{width:n,height:r}=De(e,t),o=await Gn(e,t),i=await Z(o),a=document.createElement("canvas"),l=a.getContext("2d"),p=t.pixelRatio||ut(),d=t.canvasWidth||n,h=t.canvasHeight||r;return a.width=d*p,a.height=h*p,t.skipAutoScale||ht(a),a.style.width=`${d}`,a.style.height=`${h}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,a.width,a.height)),l.drawImage(i,0,0,a.width,a.height),a}async function Rt(e,t={}){let n=await Zn(e,t);return await mt(n)}var Yn="data-builder-hide",_e={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},Pt=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function $t(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function It(e){return e==="video"?_e.video:e==="image"?_e.image:_e.file}function be(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function xe(e=15e3){let t=await Promise.race([Rt(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(W)!==null&&r?.hasAttribute?.(W)||r?.hasAttribute?.(Yn))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${Kn()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function Kn(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function ie(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}function ve(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},o=p=>{let d=document.elementFromPoint(p.clientX,p.clientY);if(!d||he(d)||d===document.body||d===document.documentElement){r();return}d!==n&&(r(),n=d,d.classList.add("builder-pin-hover"))},i=p=>{let d=document.elementFromPoint(p.clientX,p.clientY);if(!d||he(d))return;p.preventDefault(),p.stopPropagation();let h=it(d);l(),e(h,d)},a=p=>{p.key==="Escape"&&(p.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",o,!0),document.removeEventListener("click",i,!0),document.removeEventListener("keydown",a,!0)}return document.addEventListener("mousemove",o,!0),document.addEventListener("click",i,!0),document.addEventListener("keydown",a,!0),l}function ye(e){let t=st(e);if(!t.el||t.confidence<at)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var E={hello:"builder:hello",ready:"builder:ready",url:"builder:url",pinStart:"builder:pin:start",pinDone:"builder:pin:done",pinCancel:"builder:pin:cancel",shot:"builder:shot",shotDone:"builder:shot:done",context:"builder:context",contextDone:"builder:context:done"},Jn=200,Ht=100,Qn=1e3,er=512;function Dt(e={}){if(window.parent===window)return()=>{};let t=e.locale??"en",n=null,r=null,o=!1,i=null,a=[],l=[],p=[];function d(m){if(n)try{n.win.postMessage(m,n.origin)}catch{}}function h(){d({v:1,type:E.ready,url:location.href,title:document.title})}function g(){d({v:1,type:E.url,url:location.href,title:document.title})}function y(){i===null&&(i=window.setTimeout(()=>{i=null,g()},0))}function S(){let m=tr(a,l,t);d({v:1,type:E.contextDone,...m})}function b(){A(),r=ve((m,T)=>{r=null,T.classList.add("builder-pin-found"),setTimeout(()=>T.classList.remove("builder-pin-found"),3e3),d({v:1,type:E.pinDone,anchor:m}),S()},()=>{r=null,d({v:1,type:E.pinDone,anchor:null})})}function A(){r&&(r(),r=null)}async function w(){if(!o){o=!0;try{let m=await xe(),T=await hr(m.blob);d({v:1,type:E.shotDone,dataUrl:T}),S()}catch(m){d({v:1,type:E.shotDone,dataUrl:null,error:qe(String(m?.message||m)).slice(0,300)})}finally{o=!1}}}function M(){if(p.push(rr(m=>Ne(a,Jn,m)),ir(m=>Ne(l,Ht,m)),ar(m=>Ne(l,Ht,m)),sr(y)),document.readyState!=="complete"){let m=()=>g();window.addEventListener("load",m,{once:!0}),p.push(()=>window.removeEventListener("load",m))}try{e.onActivate?.(n.origin)}catch{}}function u(m){let T=m.data;if(!(!T||T.v!==1||typeof T.type!="string")){if(!n){if(T.type!==E.hello||window.parent===window||m.source!==window.parent||!m.origin||m.origin==="null"||T.shellOrigin!==m.origin||e.shellOrigins&&!e.shellOrigins.includes(m.origin))return;n={win:window.parent,origin:m.origin},M(),h();return}if(!(m.source!==n.win||m.origin!==n.origin))switch(T.type){case E.hello:h();return;case E.pinStart:b();return;case E.pinCancel:A();return;case E.shot:w();return;case E.context:S();return}}}window.addEventListener("message",u);let x=()=>y();return window.addEventListener("popstate",x),window.addEventListener("hashchange",x),()=>{window.removeEventListener("message",u),window.removeEventListener("popstate",x),window.removeEventListener("hashchange",x),i!==null&&(clearTimeout(i),i=null),A();for(let m of p.splice(0))try{m()}catch{}n=null}}function tr(e,t,n){return{console:e.slice(),network:t.slice(),viewport:{w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio||1},userAgent:navigator.userAgent,locale:n,url:location.href,title:document.title}}function Ne(e,t,n){e.push(n),e.length>t&&e.shift()}var nr=["log","info","warn","error","debug"];function rr(e){let t=new Map;for(let n of nr){let r=console[n];typeof r=="function"&&(t.set(n,r),console[n]=function(...o){try{e({level:n,text:or(o),ts:Date.now()})}catch{}r.apply(console,o)})}return()=>{for(let[n,r]of t)console[n]=r}}function or(e){let t=e.map(n=>{if(typeof n=="string")return n;if(n instanceof Error)return n.stack||`${n.name}: ${n.message}`;try{return JSON.stringify(n)??String(n)}catch{return String(n)}});return qe(t.join(" ").slice(0,Qn))}function ir(e){let t=window.fetch;return typeof t!="function"?()=>{}:(window.fetch=function(n,r){let o=Date.now(),i="GET",a="";try{typeof n=="string"?a=n:n instanceof URL?a=n.href:n&&(a=n.url,i=n.method||"GET"),r&&r.method&&(i=r.method)}catch{}let l=(d,h)=>{try{e({method:i.toUpperCase(),url:zt(a),status:d,ok:h,durationMs:Date.now()-o,ts:o})}catch{}},p=t.call(window,n,r);return p.then(d=>l(d.status,d.ok),()=>l(0,!1)),p},()=>{window.fetch=t})}function ar(e){let t=XMLHttpRequest.prototype,n=t.open,r=t.send,o=new WeakMap;return t.open=function(i,a){try{o.set(this,{method:String(i||"GET").toUpperCase(),url:String(a),started:0})}catch{}return n.apply(this,arguments)},t.send=function(i){let a=o.get(this);if(a){a.started=Date.now();let l=()=>{this.removeEventListener("loadend",l);try{e({method:a.method,url:zt(a.url),status:this.status,ok:this.status>=200&&this.status<400,durationMs:Date.now()-a.started,ts:a.started})}catch{}};try{this.addEventListener("loadend",l)}catch{}}return r.call(this,i)},()=>{t.open=n,t.send=r}}function zt(e){let t=e;try{t=new URL(e,location.href).href}catch{}return qe(t).slice(0,er)}function sr(e){let t=history.pushState,n=history.replaceState;return history.pushState=function(...r){t.apply(this,r),e()},history.replaceState=function(...r){n.apply(this,r),e()},()=>{history.pushState=t,history.replaceState=n}}var we="[redacted]",lr=/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/@\s]+):[^@\s]*@/g,cr=/\b(password|passwd|pwd|secret|token|api[_-]?key|auth|authorization|access[_-]?key|private[_-]?key|sslpassword)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&"']+)/gi,dr=/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g,pr=/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,ur=/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;function qe(e){return e&&(e=e.replace(ur,"[redacted private key]"),e=e.replace(lr,"$1:"+we+"@"),e=e.replace(cr,"$1$2"+we),e=e.replace(dr,we),e=e.replace(pr,we),e)}function hr(e){return new Promise((t,n)=>{let r=new FileReader;r.onload=()=>t(String(r.result)),r.onerror=()=>n(new Error("could not encode the screenshot")),r.readAsDataURL(e)})}var mr={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",cancel:"Cancel",markdownHint:"Markdown supported \u2014 **bold**, `code`, lists.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinAnother:"Pin another",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",apps:"Build",appAgents:"Agents",appSkills:"Skills",appIssues:"Issues",appVault:"Vault",appMcp:"MCP",appSources:"Sources",appDocs:"Library",appBrain:"Brain",appChat:"Chat",appTerminal:"Terminal",dir:"ltr"},fr={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",cancel:"\u0625\u0644\u063A\u0627\u0621",markdownHint:"\u064A\u062F\u0639\u0645 Markdown \u2014 **\u0639\u0631\u064A\u0636**\u060C `\u0634\u064A\u0641\u0631\u0629`\u060C \u0642\u0648\u0627\u0626\u0645.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinAnother:"\u062A\u062D\u062F\u064A\u062F \u0645\u0648\u0642\u0639 \u0622\u062E\u0631",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",apps:"\u0627\u0644\u0628\u0646\u0627\u0621",appAgents:"\u0627\u0644\u0648\u0643\u0644\u0627\u0621",appSkills:"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A",appIssues:"\u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",appVault:"\u0627\u0644\u062E\u0632\u0646\u0629",appMcp:"MCP",appSources:"\u0627\u0644\u0645\u0635\u0627\u062F\u0631",appDocs:"\u0627\u0644\u0645\u0643\u062A\u0628\u0629",appBrain:"\u0627\u0644\u062F\u0645\u0627\u063A",appChat:"\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",appTerminal:"\u0627\u0644\u0637\u0631\u0641\u064A\u0629",dir:"rtl"};function Ee(e){return e.toLowerCase().startsWith("ar")?fr:mr}var Bt="http://www.w3.org/2000/svg",gr={messageSquare:[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}],["path",{d:"M13 8H7"}],["path",{d:"M17 12H7"}]],x:[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]],plus:[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]],pin:[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{cx:"12",cy:"10",r:"3"}]],paperclip:[["path",{d:"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"}]],camera:[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}],["circle",{cx:"12",cy:"13",r:"3"}]],eye:[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]],arrowRight:[["path",{d:"M5 12h14"}],["path",{d:"m12 5 7 7-7 7"}]],chevronRight:[["path",{d:"m9 18 6-6-6-6"}]],agents:[["path",{d:"M12 8V4H8"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2"}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],skills:[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"}],["path",{d:"M22 10v6"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5"}]],issues:[["rect",{x:"3",y:"5",width:"6",height:"6",rx:"1"}],["path",{d:"m3 17 2 2 4-4"}],["path",{d:"M13 6h8"}],["path",{d:"M13 12h8"}],["path",{d:"M13 18h8"}]],vault:[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 7.9 2.7 2.7"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 10.6 2.7-2.7"}],["circle",{cx:"7.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 16.1 2.7-2.7"}],["circle",{cx:"16.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 13.4 2.7 2.7"}],["circle",{cx:"12",cy:"12",r:"2"}]],sources:[["path",{d:"M4 11a9 9 0 0 1 9 9"}],["path",{d:"M4 4a16 16 0 0 1 16 16"}],["circle",{cx:"5",cy:"19",r:"1"}]],docs:[["rect",{width:"8",height:"18",x:"3",y:"3",rx:"1"}],["path",{d:"M7 3v18"}],["path",{d:"M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"}]],brain:[["path",{d:"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"}],["path",{d:"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"}],["path",{d:"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"}],["path",{d:"M17.599 6.5a3 3 0 0 0 .399-1.375"}],["path",{d:"M6.003 5.125A3 3 0 0 0 6.401 6.5"}],["path",{d:"M3.477 10.896a4 4 0 0 1 .585-.396"}],["path",{d:"M19.938 10.5a4 4 0 0 1 .585.396"}],["path",{d:"M6 18a4 4 0 0 1-1.967-.516"}],["path",{d:"M19.967 17.484A4 4 0 0 1 18 18"}]],chat:[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],mcp:[["path",{d:"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"}],["path",{d:"m2 22 3-3"}],["path",{d:"M7.5 13.5 10 11"}],["path",{d:"M10.5 16.5 13 14"}],["path",{d:"m18 3-4 4h6l-4 4"}]],terminal:[["path",{d:"m7 11 2-2-2-2"}],["path",{d:"M11 13h4"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}]]};function I(e,t=14){let n=document.createElementNS(Bt,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let[r,o]of gr[e]){let i=document.createElementNS(Bt,r);for(let[a,l]of Object.entries(o))i.setAttribute(a,l);n.appendChild(i)}return n}function F(e,t,n,r=14){e.replaceChildren(),e.appendChild(I(t,r));let o=document.createElement("span");o.textContent=n,e.appendChild(o)}function Ce(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let o=n[r],i=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(o);if(i){let h=i[1][0],g=[];for(r++;r<n.length&&!new RegExp(`^\\s*${h}{3,}\\s*$`).test(n[r]);)g.push(n[r]),r++;r++;let y=document.createElement("pre");y.className="md-pre";let S=document.createElement("code");i[2]&&(S.className=`lang-${i[2]}`),S.textContent=g.join(`
`),y.appendChild(S),t.appendChild(y);continue}if(!o.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(o)){t.appendChild(document.createElement("hr")),r++;continue}let a=/^\s*(#{1,6})\s+(.*)$/.exec(o);if(a){let h=Math.min(6,3+a[1].length),g=document.createElement(`h${h}`);g.className="md-h",g.appendChild(ke(a[2])),t.appendChild(g),r++;continue}if(/^\s*>\s?/.test(o)){let h=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)h.push(n[r].replace(/^\s*>\s?/,"")),r++;let g=document.createElement("blockquote");g.className="md-quote",g.appendChild(Ce(h.join(`
`))),t.appendChild(g);continue}let l=/^\s*[-*+]\s+/,p=/^\s*\d+[.)]\s+/;if(l.test(o)||p.test(o)){let h=!l.test(o),g=h?p:l,y=document.createElement(h?"ol":"ul");for(y.className="md-list";r<n.length&&g.test(n[r]);){let S=document.createElement("li"),b=n[r].replace(g,"");for(r++;r<n.length&&n[r].trim()&&!g.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)b+=`
`+n[r].trim(),r++;S.appendChild(ke(b)),y.appendChild(S)}t.appendChild(y);continue}let d=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r]);)d.push(n[r]),r++;if(d.length){let h=document.createElement("p");h.className="md-p",h.appendChild(ke(d.join(`
`))),t.appendChild(h)}else r++}return t}var br=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function ke(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=br.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&Ot(t,n.slice(0,r.index)),r[1]){let o=document.createElement("code");o.className="md-code",o.textContent=r[2].trim(),t.appendChild(o)}else r[3]!==void 0?t.appendChild(Ft(r[4],r[3]||r[4])):r[5]?t.appendChild(We("strong","md-strong",r[6])):r[7]?t.appendChild(We("del","md-del",r[8])):r[9]?t.appendChild(We("em","md-em",r[10])):r[11]&&t.appendChild(Ft(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&Ot(t,n),t}function We(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(ke(n)),r}function Ft(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function Ot(e,t){t.split(`
`).forEach((r,o)=>{o&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function Ut(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let o=await r.json();return{id:o.id,number:o.number,title:o.title,body:o.body??"",type:o.type,status:o.status,priority:o.priority,route:o.route??"",pageUrl:o.pageUrl??"",createdAt:o.createdAt??"",pins:o.pins??[],comments:o.comments??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function _t(e,t,n){let r=Ee(e),o=document.createElement("div");o.className="detail hidden";let i=null;async function a(d){o.replaceChildren(k("p","empty",r.loading));try{i=await t.get(d),l()}catch(h){o.replaceChildren(k("p","note err",String(h.message)))}}function l(){if(!i)return;let d=i;o.replaceChildren();let h=k("div","d-head",""),g=Se("ghost","\u2190 "+r.onThisPage);g.addEventListener("click",n);let y=Se("ghost","\u2197");y.title=r.report,y.addEventListener("click",()=>window.open(`/issues/${d.number}`,"_blank","noopener")),h.append(g,y),o.appendChild(h);let S=k("div","d-meta","");if(S.append(k("span","num",`#${d.number}`),k("span",`chip ${d.type}`,r[d.type]??d.type),k("span","chip status",d.status.replace("_"," "))),o.append(S,k("h3","d-title",d.title)),d.body){let w=k("div","d-body","");w.appendChild(Ce(d.body)),o.appendChild(w)}if(d.pins.length){o.appendChild(k("div","label",r.location));for(let w of d.pins){let M=k("div","d-pin","");M.appendChild(k("span","nm",`<${w.tag??"?"}>${w.name?` \u201C${w.name}\u201D`:""}`));let u=Se("ghost","");u.appendChild(I("eye",14)),u.title=r.pin,u.addEventListener("click",()=>{let x=ye(w);p(x.found?`Found via ${x.by} (${Math.round(x.confidence*100)}%)`:"The pinned element is not on this page any more.",x.found?"ok":"err")}),M.appendChild(u),o.appendChild(M)}}o.appendChild(k("div","label","Comments")),d.comments.length||o.appendChild(k("p","empty","No comments yet."));for(let w of d.comments){let M=k("div","d-comment",""),u=k("p","who",w.author||"someone");w.kind==="agent"&&u.appendChild(k("span","chip agent","agent"));let x=k("div","txt","");x.appendChild(Ce(w.body)),M.append(u,x),o.appendChild(M)}let b=document.createElement("textarea");b.placeholder="Add a comment\u2026",b.rows=3;let A=Se("primary","Comment");A.addEventListener("click",async()=>{let w=b.value.trim();if(w){A.disabled=!0;try{await t.comment(d.number,w),b.value="",await a(d.number)}catch(M){p(String(M.message),"err")}finally{A.disabled=!1}}}),o.append(b,A)}function p(d,h){let g=k("p",`note ${h}`,d);o.appendChild(g),setTimeout(()=>g.remove(),4e3)}return{el:o,load:a,destroy:()=>o.remove()}}function k(e,t,n){let r=document.createElement(e);return r.className=t,n&&(r.textContent=n),r}function Se(e,t){let n=document.createElement("button");return n.type="button",n.className=e,n.textContent=t,n}var Nt=`
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
`,qt=`
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

`;function Wt(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let o=await r.json().catch(()=>null);return Array.isArray(o?.issues)?o.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??""}));for(let a of n.attachments)r.append("attachments",a.blob,a.name),r.append("attachment_kinds",a.kind);let o=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!o.ok){let a=await o.text().catch(()=>"");throw new Error(a||`submit failed (${o.status})`)}let i=await o.json();return{id:String(i.id??""),number:Number(i.number??0)}}}}var Vt="builder.fab.position",xr=["bug","feature","question","discussion"],vr=8;function yr(e={}){let t=Ee(e.locale??document.documentElement.lang??"en"),n=e.transport??Wt(e.apiBase),r=e.locale??"en",o=document.createElement("div");o.setAttribute(W,""),o.setAttribute("dir",t.dir),e.theme&&o.setAttribute("data-theme",e.theme),document.body.appendChild(o);let i=o.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=Nt+(e.accent?`:host{--accent:${kr(e.accent)}}`:""),i.appendChild(a);let l=document.createElement("style");l.setAttribute(W,""),l.textContent=qt,document.head.appendChild(l);let p=[],d=[],h=[],g="bug",y=!1,S=!1,b=null,A=null,w=!1,M=document.createElement("div");M.innerHTML=`
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

`,i.appendChild(M);let u=s=>i.querySelector(s),x=u(".fab"),m=u(".panel"),T=u(".form"),Ve=u(".listing"),ae=u(".modal"),$=u(".modal-card"),V=u(".modal-head"),Le=u(".modal-x"),je=u(".cancel"),se=u(".rows"),Ae=u(".pills"),Te=u(".note"),Xe=u(".files"),le=u(".filein"),Ge=u(".count"),jt=u(".appgrid"),ce=u('input[name="title"]'),Ze=u('textarea[name="body"]'),Xt=u('input[name="url"]'),O=u(".pin");if(e.framedHost){let s=C=>window.postMessage({v:1,type:C},location.origin),c=!1,f="The product has not loaded the builder script, so there is nothing inside the frame to read the page with. Add the script tag to enable pinning and screenshots.",v=u(".pin"),z=u(".shot");for(let C of[v,z])C.disabled=!0,C.title=f,C.setAttribute("aria-disabled","true");window.addEventListener("message",C=>{if(C.source!==window||C.origin!==location.origin)return;let R=C.data;if(!(!R||R.v!==1||typeof R.type!="string")&&R.type===E.ready){c=!0;for(let B of[v,z])B.disabled=!1,B.removeAttribute("aria-disabled"),B.title=""}}),v.addEventListener("click",()=>{c&&s(E.pinStart)}),z.addEventListener("click",()=>{c&&s(E.shot)})}let Me=u(".clearpin"),Re=u(".pin-preview"),j=u(".send"),de=new WeakMap;function Gt(s){let c=de.get(s);return c||(c=URL.createObjectURL(s.blob),de.set(s,c)),c}function Pe(s){let c=de.get(s);c&&(URL.revokeObjectURL(c),de.delete(s))}u(".fab-label").textContent=t.fab,u("h2").textContent=t.title,m.setAttribute("aria-label",t.title),u(".brand-ico").replaceChildren(I("messageSquare",16)),u(".brand-sub").textContent=ie(),u(".fab-ico").replaceChildren(I("messageSquare",14)),u(".x").replaceChildren(I("x",16)),u(".x").setAttribute("aria-label",t.close),u(".intro").textContent=t.intro,F(u(".report"),"plus",t.report,15),u(".lbl-type").textContent=t.type,u(".lbl-title").textContent=t.titleLabel,u(".lbl-details").textContent=t.details,u(".lbl-url").textContent=t.pageUrl,u(".lbl-loc").textContent=t.location,u(".lbl-att").textContent=t.attachments,u(".lbl-page").textContent=t.onThisPage,F(u(".board-link"),"arrowRight",t.openBoard),u(".lbl-apps").textContent=t.apps,u(".modal-title").textContent=t.reportTitle,Le.setAttribute("aria-label",t.close),Le.appendChild(I("x",16)),ae.setAttribute("aria-label",t.reportTitle),je.textContent=t.cancel,u(".lbl-md").textContent=t.markdownHint,ce.placeholder=t.titlePlaceholder,Ze.placeholder=t.detailsPlaceholder,F(O,"pin",t.pin),F(Me,"x",t.clear),F(u(".addfile"),"paperclip",t.addFile),F(u(".shot"),"camera",t.screenshot),j.textContent=t.submit;for(let s of xr){let c=document.createElement("button");c.type="button",c.className="pill",c.dataset.type=s,c.textContent=t[s],c.setAttribute("aria-pressed",String(s===g)),c.addEventListener("click",()=>{g=s,Ae.querySelectorAll(".pill").forEach(f=>f.setAttribute("aria-pressed",String(f.dataset.type===s)))}),Ae.appendChild(c)}let Zt=4,H=null,$e=(s,c)=>{let f=Math.max(8,Math.min(s,window.innerWidth-80)),v=Math.max(8,Math.min(c,window.innerHeight-48));x.style.insetInlineEnd=`${f}px`,x.style.insetBlockEnd=`${v}px`},Ye=wr();$e(Ye?.right??e.position?.right??24,Ye?.bottom??e.position?.bottom??24),x.addEventListener("pointerdown",s=>{if(s.button!==0)return;let c=x.getBoundingClientRect();H={x:s.clientX,y:s.clientY,ox:window.innerWidth-c.right,oy:window.innerHeight-c.bottom,moved:!1},x.setPointerCapture(s.pointerId)}),x.addEventListener("pointermove",s=>{if(!H)return;let c=s.clientX-H.x,f=s.clientY-H.y;!H.moved&&Math.hypot(c,f)<Zt||(H.moved=!0,$e(H.ox-c,H.oy-f))}),x.addEventListener("pointerup",s=>{if(!H)return;let c=H.moved;if(H=null,x.releasePointerCapture(s.pointerId),c){let f=x.getBoundingClientRect();Er(window.innerWidth-f.right,window.innerHeight-f.bottom);return}Ke()}),x.addEventListener("keydown",s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),Ke())}),window.addEventListener("resize",()=>{let s=x.getBoundingClientRect();$e(window.innerWidth-s.right,window.innerHeight-s.bottom)});function Ke(){m.dataset.open==="true"?U():Je()}function Je(){w||(m.dataset.open="true",x.setAttribute("aria-expanded","true"),Xt.value=location.href,u(".brand-sub").textContent=ie(),ee())}function U(){m.dataset.open="false",m.dataset.detail="false",x.setAttribute("aria-expanded","false"),q(!1),b?.(),b=null}let Yt=[{key:"agents",path:"/agents",color:"#8b5cf6",label:t.appAgents},{key:"skills",path:"/skills",color:"#06b6d4",label:t.appSkills},{key:"issues",path:"/issues",color:"#f59e0b",label:t.appIssues},{key:"vault",path:"/vault",color:"#10b981",label:t.appVault},{key:"sources",path:"/sources",color:"#3b82f6",label:t.appSources},{key:"docs",path:"/library",color:"#f43f5e",label:t.appDocs},{key:"brain",path:"/brain",color:"#a855f7",label:t.appBrain},{key:"chat",path:"/chat",color:"#14b8a6",label:t.appChat},{key:"mcp",path:"/mcp",color:"#ec4899",label:t.appMcp},{key:"terminal",path:"/terminal",color:"#64748b",label:t.appTerminal}];function Qe(){let s=(e.apiBase??"").trim();if(!s)return"";try{return new URL(s,location.href).origin}catch{return""}}let Kt=(s,c)=>`${Qe()}${s}${c?"?embed=1":""}`;for(let s of Yt){let c=document.createElement("button");c.type="button",c.className="app",c.dataset.app=s.key;let f=document.createElement("span");f.className="app-ico",f.style.background=s.color,f.appendChild(I(s.key,18));let v=document.createElement("span");v.textContent=s.label,c.append(f,v),c.addEventListener("click",()=>Jt(s)),jt.appendChild(c)}function Jt(s){let c=Qe(),f=Kt(s.path,!0);if(c&&c!==location.origin){window.open(f,"_blank","noopener"),U();return}try{sessionStorage.setItem("builder:standalone","1"),sessionStorage.setItem("builder:standalone:return",location.href)}catch{}U(),location.assign(f)}let X=null;V.addEventListener("pointerdown",s=>{if(s.target.closest(".modal-x"))return;let c=$.getBoundingClientRect();$.style.position="fixed",$.style.margin="0",$.style.left=`${c.left}px`,$.style.top=`${c.top}px`,X={dx:s.clientX-c.left,dy:s.clientY-c.top},V.setPointerCapture(s.pointerId)}),V.addEventListener("pointermove",s=>{if(!X)return;let c=$.getBoundingClientRect(),f=Math.min(Math.max(s.clientX-X.dx,8-c.width+80),innerWidth-80),v=Math.min(Math.max(s.clientY-X.dy,8),innerHeight-44);$.style.left=`${f}px`,$.style.top=`${v}px`});let et=s=>{if(X){X=null;try{V.releasePointerCapture(s.pointerId)}catch{}}};V.addEventListener("pointerup",et),V.addEventListener("pointercancel",et);function Qt(){$.style.position="",$.style.left="",$.style.top="",$.style.margin=""}Le.addEventListener("click",()=>q(!1)),je.addEventListener("click",()=>q(!1)),document.addEventListener("keydown",s=>{s.key==="Escape"&&y&&!b&&q(!1)}),u(".x").addEventListener("click",U),i.addEventListener("keydown",s=>{s.key==="Escape"&&!b&&U()});function tt(s){m.dataset.open!=="true"||b||s.composedPath().includes(o)||U()}document.addEventListener("click",tt,!0);function q(s){y=s,ae.dataset.open=s?"true":"false",s?(Qt(),setTimeout(()=>ce.focus(),30)):(en(),b?.(),b=null)}u(".report").addEventListener("click",()=>q(!0));function en(){T.reset(),d=[],h.forEach(Pe),h=[],g="bug",Ae.querySelectorAll(".pill").forEach(s=>s.setAttribute("aria-pressed",String(s.dataset.type==="bug"))),Q(),pe(),_("")}function _(s,c=""){Te.textContent=s,Te.className=`note ${c}`.trim(),Te.classList.toggle("hidden",!s)}O.addEventListener("click",()=>{if(b){b(),b=null,O.setAttribute("aria-pressed","false"),F(O,"pin",t.pin);return}m.dataset.open="false",ae.dataset.open="false",O.setAttribute("aria-pressed","true"),O.textContent=t.pinning;let s=()=>{y?ae.dataset.open="true":m.dataset.open="true"};b=ve((c,f)=>{d.length<vr&&(d=[...d,c]),b=null,s(),Q(),f.classList.add("builder-pin-found"),setTimeout(()=>f.classList.remove("builder-pin-found"),3e3)},()=>{b=null,s(),Q()})}),Me.addEventListener("click",()=>{d=[],Q()});function Q(){let s=d.length>0;O.setAttribute("aria-pressed",String(s)),F(O,"pin",s?t.pinAnother:t.pin),Me.classList.toggle("hidden",!s),Re.classList.toggle("hidden",!s),Re.textContent="",d.forEach((c,f)=>{let v=document.createElement("div");v.className="pinrow";let z=document.createElement("span");z.className="pinnum",z.textContent=String(f+1);let C=c.name||c.hint||"",R=document.createElement("span");R.className="pintxt",R.textContent=`<${c.tag??"?"}>${C?` \u201C${C}\u201D`:""}`;let B=document.createElement("button");B.type="button",B.className="pindel",B.setAttribute("aria-label",`${t.clear} ${f+1}`),B.appendChild(I("x",12)),B.addEventListener("click",()=>{d.splice(f,1),Q()}),v.append(z,R,B),Re.appendChild(v)})}u(".addfile").addEventListener("click",()=>le.click()),le.addEventListener("change",()=>{for(let s of Array.from(le.files??[]))tn(s);le.value=""});function tn(s){let c=$t(s.type),f=It(c);if(s.size>f){_(`${s.name} is ${be(s.size)} \u2014 the limit is ${be(f)}.`,"err");return}h.push({name:s.name,mime:s.type,size:s.size,kind:c,blob:s}),pe(),_("")}u(".shot").addEventListener("click",async()=>{let s=u(".shot");s.disabled=!0;let c=m.dataset.open;m.dataset.open="false",o.style.visibility="hidden";try{await new Promise(f=>setTimeout(f,120)),h.push(await xe()),pe(),_("")}catch(f){_(String(f.message||f),"err")}finally{o.style.visibility="",m.dataset.open=c??"true",s.disabled=!1}});function pe(){Xe.replaceChildren(),h.forEach((s,c)=>{let f=document.createElement("div");if(f.className="file",s.kind==="screenshot"||s.kind==="image"){let R=document.createElement("img");R.className="thumb",R.src=Gt(s),R.alt="",f.appendChild(R)}let v=document.createElement("span");v.className="nm",v.textContent=s.name;let z=document.createElement("span");z.textContent=be(s.size);let C=document.createElement("button");C.type="button",C.replaceChildren(I("x",12)),C.setAttribute("aria-label",t.clear),C.addEventListener("click",()=>{Pe(s),h.splice(c,1),pe()}),f.append(v,z,C),Xe.appendChild(f)})}async function nt(){if(S)return;let s=ce.value.trim();if(!s){_(t.titleRequired,"err"),ce.focus();return}S=!0,j.disabled=!0,j.textContent=t.submitting;try{let c=await n.create({type:g,title:s,body:Ze.value,route:ie(),pageUrl:location.href,locale:r,pins:d,attachments:h});_(t.created(c.number),"ok"),e.onCreated?.(c),setTimeout(()=>{q(!1),ee()},900)}catch(c){_(String(c.message||t.failed),"err")}finally{S=!1,j.disabled=!1,j.textContent=t.submit}}j.addEventListener("click",nt),T.addEventListener("submit",s=>{s.preventDefault(),nt()});async function ee(){if(!y){se.replaceChildren(N("div","empty",t.loading));try{p=await n.listByRoute(ie())}catch{p=[]}if(Ge.textContent=p.length>9?"9+":String(p.length),Ge.classList.toggle("hidden",p.length===0),u(".lbl-page").textContent=p.length?t.issueCount(p.length):t.onThisPage,se.replaceChildren(),!p.length){se.appendChild(N("div","empty",t.none));return}for(let s of p){let c=document.createElement("button");if(c.type="button",c.className="row",c.append(N("span","num",`#${s.number}`),N("span",`chip ${s.type}`,t[s.type])),c.appendChild(N("span","t",s.title)),s.busy){let v=N("span","agent-tag","");v.appendChild(N("span","spin","")),v.appendChild(N("span","who",s.agent||t.agentWorking)),v.setAttribute("title",s.agent?t.agentWorkingBy(s.agent):t.agentWorking),c.appendChild(v)}let f=I("chevronRight",14);f.classList.add("go"),c.appendChild(f),c.addEventListener("click",()=>void nn(s.number)),se.appendChild(c)}}}async function nn(s){A||(A=_t(r,Ut(e.apiBase),()=>{A?.el.classList.add("hidden"),Ve.classList.remove("hidden"),u(".report").classList.remove("hidden"),u(".apps").classList.remove("hidden"),m.dataset.detail="false",ee()}),u(".body").appendChild(A.el)),Ve.classList.add("hidden"),u(".report").classList.add("hidden"),u(".apps").classList.add("hidden"),q(!1),A.el.classList.remove("hidden"),m.dataset.detail="true",await A.load(s)}let rt=null;!e.framedHost&&e.bridge!==!1&&(rt=Dt({locale:r,shellOrigins:e.shellOrigins,onActivate:()=>{w=!0,b?.(),b=null,U(),o.style.display="none"}}));let rn={open:Je,close:U,refresh:()=>void ee(),destroy(){rt?.(),b?.(),h.forEach(Pe),document.removeEventListener("click",tt,!0),o.remove(),l.remove()}};return ee(),rn}function N(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function wr(){try{let e=localStorage.getItem(Vt);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function Er(e,t){try{localStorage.setItem(Vt,JSON.stringify({right:e,bottom:t}))}catch{}}function kr(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return dn(Cr);})();
