"use strict";var BuilderIssues=(()=>{var We=Object.defineProperty;var Sn=Object.getOwnPropertyDescriptor;var An=Object.getOwnPropertyNames;var Ln=Object.prototype.hasOwnProperty;var Tn=(e,t)=>{for(var n in t)We(e,n,{get:t[n],enumerable:!0})},Mn=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of An(t))!Ln.call(e,o)&&o!==n&&We(e,o,{get:()=>t[o],enumerable:!(r=Sn(t,o))||r.enumerable});return e};var Rn=e=>Mn(We({},"__esModule",{value:!0}),e);var qr={};Tn(qr,{BRIDGE_MSG:()=>y,hasIcon:()=>He,highlightPin:()=>Pe,icon:()=>D,mount:()=>Or});var Q="data-builder-sdk";function Ce(e){return!!e?.closest?.(`[${Q}]`)}function Ct(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,o={tag:e.tagName.toLowerCase(),hint:he(e),css:$n(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},i=e.getAttribute("data-testid")??e.getAttribute("data-test-id");i&&(o.testid=i),e.id&&!Lt(e.id)&&(o.domId=e.id);let a=e.getAttribute("role")??In(e);a&&(o.role=a);let l=Tt(e);l&&(o.name=l);for(let[d,p]of Pn(o))try{let u=document.querySelectorAll(p);u.length===1&&u[0]===e&&o.verified.push(d)}catch{}return o}function Pn(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${me(e.testid)}"]`]),e.domId&&t.push(["domId",`#${me(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var St=.5;function At(e){if(e.testid){let t=Ee(`[data-testid="${me(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=Et(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=Ee(`[role="${me(e.role)}"]`).filter(n=>Tt(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=Et(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=Ee(e.css);if(t.length===1){let n=t[0],r=!e.hint||Ve(he(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=Ee(e.tag||"*").filter(n=>Ve(he(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function Et(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,o=null,i=1/0;for(let a of e){let l=a.getBoundingClientRect(),d=l.left/n-t.rect.x,p=l.top/r-t.rect.y,u=Math.hypot(d,p);t.hint&&Ve(he(a),t.hint)&&(u-=.5),u<i&&([o,i]=[a,u])}return o}function Ee(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!Ce(t))}catch{return[]}}function $n(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!Lt(n.id)){t.unshift(`#${me(n.id)}`);break}let o=n.tagName.toLowerCase(),i=n.parentElement;if(!i){t.unshift(o);break}let a=Array.from(i.children).filter(l=>l.tagName===n.tagName);t.unshift(a.length>1?`${o}:nth-of-type(${a.indexOf(n)+1})`:o),n=i}return t.join(" > ").slice(0,512)}function Lt(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function he(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function Ve(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function Tt(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||he(e)).slice(0,80)}function In(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function me(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function Mt(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),o=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(o),t&&(r.href=t),o.href=e,o.href}var Rt=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function q(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var ie=null;function Ae(e={}){return ie||(e.includeStyleProperties?(ie=e.includeStyleProperties,ie):(ie=q(window.getComputedStyle(document.documentElement)),ie))}function Se(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function Hn(e){let t=Se(e,"border-left-width"),n=Se(e,"border-right-width");return e.clientWidth+t+n}function Dn(e){let t=Se(e,"border-top-width"),n=Se(e,"border-bottom-width");return e.clientHeight+t+n}function Xe(e,t={}){let n=t.width||Hn(e),r=t.height||Dn(e);return{width:n,height:r}}function Pt(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var O=16384;function $t(e){(e.width>O||e.height>O)&&(e.width>O&&e.height>O?e.width>e.height?(e.height*=O/e.width,e.width=O):(e.width*=O/e.height,e.height=O):e.width>O?(e.height*=O/e.width,e.width=O):(e.width*=O/e.height,e.height=O))}function It(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),o=r.length,i=new Uint8Array(o);for(let a=0;a<o;a+=1)i[a]=r.charCodeAt(a);n(new Blob([i],{type:t.type?t.type:"image/png"}))})}function ae(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function Bn(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function Ht(e,t,n){let r="http://www.w3.org/2000/svg",o=document.createElementNS(r,"svg"),i=document.createElementNS(r,"foreignObject");return o.setAttribute("width",`${t}`),o.setAttribute("height",`${n}`),o.setAttribute("viewBox",`0 0 ${t} ${n}`),i.setAttribute("width","100%"),i.setAttribute("height","100%"),i.setAttribute("x","0"),i.setAttribute("y","0"),i.setAttribute("externalResourcesRequired","true"),o.appendChild(i),i.appendChild(e),Bn(o)}var I=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||I(n,t)};function zn(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function On(e,t){return Ae(t).map(n=>{let r=e.getPropertyValue(n),o=e.getPropertyPriority(n);return`${n}: ${r}${o?" !important":""};`}).join(" ")}function Fn(e,t,n,r){let o=`.${e}:${t}`,i=n.cssText?zn(n):On(n,r);return document.createTextNode(`${o}{${i}}`)}function Dt(e,t,n,r){let o=window.getComputedStyle(e,n),i=o.getPropertyValue("content");if(i===""||i==="none")return;let a=Rt();try{t.className=`${t.className} ${a}`}catch{return}let l=document.createElement("style");l.appendChild(Fn(a,n,o,r)),t.appendChild(l)}function Bt(e,t,n){Dt(e,t,":before",n),Dt(e,t,":after",n)}var zt="application/font-woff",Ot="image/jpeg",Un={woff:zt,woff2:zt,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:Ot,jpeg:Ot,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function _n(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function se(e){let t=_n(e).toLowerCase();return Un[t]||""}function Nn(e){return e.split(/,/)[1]}function fe(e){return e.search(/^(data:)/)!==-1}function Ze(e,t){return`data:${t};base64,${e}`}async function Ye(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let o=await r.blob();return new Promise((i,a)=>{let l=new FileReader;l.onerror=a,l.onloadend=()=>{try{i(n({res:r,result:l.result}))}catch(d){a(d)}},l.readAsDataURL(o)})}var Ge={};function qn(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function le(e,t,n){let r=qn(e,t,n.includeQueryParams);if(Ge[r]!=null)return Ge[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let o;try{let i=await Ye(e,n.fetchRequestInit,({res:a,result:l})=>(t||(t=a.headers.get("Content-Type")||""),Nn(l)));o=Ze(i,t)}catch(i){o=n.imagePlaceholder||"";let a=`Failed to fetch resource: ${e}`;i&&(a=typeof i=="string"?i:i.message),a&&console.warn(a)}return Ge[r]=o,o}async function jn(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):ae(t)}async function Wn(e,t){if(e.currentSrc){let i=document.createElement("canvas"),a=i.getContext("2d");i.width=e.clientWidth,i.height=e.clientHeight,a?.drawImage(e,0,0,i.width,i.height);let l=i.toDataURL();return ae(l)}let n=e.poster,r=se(n),o=await le(n,r,t);return ae(o)}async function Vn(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await ge(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function Xn(e,t){return I(e,HTMLCanvasElement)?jn(e):I(e,HTMLVideoElement)?Wn(e,t):I(e,HTMLIFrameElement)?Vn(e,t):e.cloneNode(Ft(e))}var Gn=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",Ft=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function Zn(e,t,n){var r,o;if(Ft(t))return t;let i=[];return Gn(e)&&e.assignedNodes?i=q(e.assignedNodes()):I(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?i=q(e.contentDocument.body.childNodes):i=q(((o=e.shadowRoot)!==null&&o!==void 0?o:e).childNodes),i.length===0||I(e,HTMLVideoElement)||await i.reduce((a,l)=>a.then(()=>ge(l,n)).then(d=>{d&&t.appendChild(d)}),Promise.resolve()),t}function Yn(e,t,n){let r=t.style;if(!r)return;let o=window.getComputedStyle(e);o.cssText?(r.cssText=o.cssText,r.transformOrigin=o.transformOrigin):Ae(n).forEach(i=>{let a=o.getPropertyValue(i);i==="font-size"&&a.endsWith("px")&&(a=`${Math.floor(parseFloat(a.substring(0,a.length-2)))-.1}px`),I(e,HTMLIFrameElement)&&i==="display"&&a==="inline"&&(a="block"),i==="d"&&t.getAttribute("d")&&(a=`path(${t.getAttribute("d")})`),r.setProperty(i,a,o.getPropertyPriority(i))})}function Kn(e,t){I(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),I(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function Jn(e,t){if(I(e,HTMLSelectElement)){let r=Array.from(t.children).find(o=>e.value===o.getAttribute("value"));r&&r.setAttribute("selected","")}}function Qn(e,t,n){return I(t,Element)&&(Yn(e,t,n),Bt(e,t,n),Kn(e,t),Jn(e,t)),t}async function er(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let i=0;i<n.length;i++){let l=n[i].getAttribute("xlink:href");if(l){let d=e.querySelector(l),p=document.querySelector(l);!d&&p&&!r[l]&&(r[l]=await ge(p,t,!0))}}let o=Object.values(r);if(o.length){let i="http://www.w3.org/1999/xhtml",a=document.createElementNS(i,"svg");a.setAttribute("xmlns",i),a.style.position="absolute",a.style.width="0",a.style.height="0",a.style.overflow="hidden",a.style.display="none";let l=document.createElementNS(i,"defs");a.appendChild(l);for(let d=0;d<o.length;d++)l.appendChild(o[d]);e.appendChild(a)}return e}async function ge(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>Xn(r,t)).then(r=>Zn(e,r,t)).then(r=>Qn(e,r,t)).then(r=>er(r,t))}var Ut=/url\((['"]?)([^'"]+?)\1\)/g,tr=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,nr=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function rr(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function or(e){let t=[];return e.replace(Ut,(n,r,o)=>(t.push(o),n)),t.filter(n=>!fe(n))}async function ir(e,t,n,r,o){try{let i=n?Mt(t,n):t,a=se(t),l;if(o){let d=await o(i);l=Ze(d,a)}else l=await le(i,a,r);return e.replace(rr(t),`$1${l}$3`)}catch{}return e}function ar(e,{preferredFontFormat:t}){return t?e.replace(nr,n=>{for(;;){let[r,,o]=tr.exec(n)||[];if(!o)return"";if(o===t)return`src: ${r};`}}):e}function Ke(e){return e.search(Ut)!==-1}async function Le(e,t,n){if(!Ke(e))return e;let r=ar(e,n);return or(r).reduce((i,a)=>i.then(l=>ir(l,a,t,n)),Promise.resolve(r))}async function ce(e,t,n){var r;let o=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(o){let i=await Le(o,null,n);return t.style.setProperty(e,i,t.style.getPropertyPriority(e)),!0}return!1}async function sr(e,t){await ce("background",e,t)||await ce("background-image",e,t),await ce("mask",e,t)||await ce("-webkit-mask",e,t)||await ce("mask-image",e,t)||await ce("-webkit-mask-image",e,t)}async function lr(e,t){let n=I(e,HTMLImageElement);if(!(n&&!fe(e.src))&&!(I(e,SVGImageElement)&&!fe(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,o=await le(r,se(r),t);await new Promise((i,a)=>{e.onload=i,e.onerror=t.onImageErrorHandler?(...d)=>{try{i(t.onImageErrorHandler(...d))}catch(p){a(p)}}:a;let l=e;l.decode&&(l.decode=i),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=o):e.href.baseVal=o})}async function cr(e,t){let r=q(e.childNodes).map(o=>Je(o,t));await Promise.all(r).then(()=>e)}async function Je(e,t){I(e,Element)&&(await sr(e,t),await lr(e,t),await cr(e,t))}function _t(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(o=>{n[o]=r[o]}),e}var Nt={};async function qt(e){let t=Nt[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},Nt[e]=t,t}async function jt(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,i=(n.match(/url\([^)]+\)/g)||[]).map(async a=>{let l=a.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),Ye(l,t.fetchRequestInit,({result:d})=>(n=n.replace(a,`url(${d})`),[a,d]))});return Promise.all(i).then(()=>n)}function Wt(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),o=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let d=o.exec(r);if(d===null)break;t.push(d[0])}r=r.replace(o,"");let i=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(a,"gi");for(;;){let d=i.exec(r);if(d===null){if(d=l.exec(r),d===null)break;i.lastIndex=l.lastIndex}else l.lastIndex=i.lastIndex;t.push(d[0])}return t}async function dr(e,t){let n=[],r=[];return e.forEach(o=>{if("cssRules"in o)try{q(o.cssRules||[]).forEach((i,a)=>{if(i.type===CSSRule.IMPORT_RULE){let l=a+1,d=i.href,p=qt(d).then(u=>jt(u,t)).then(u=>Wt(u).forEach(b=>{try{o.insertRule(b,b.startsWith("@import")?l+=1:o.cssRules.length)}catch(k){console.error("Error inserting rule from remote css",{rule:b,error:k})}})).catch(u=>{console.error("Error loading remote css",u.toString())});r.push(p)}})}catch(i){let a=e.find(l=>l.href==null)||document.styleSheets[0];o.href!=null&&r.push(qt(o.href).then(l=>jt(l,t)).then(l=>Wt(l).forEach(d=>{a.insertRule(d,a.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",i)}}),Promise.all(r).then(()=>(e.forEach(o=>{if("cssRules"in o)try{q(o.cssRules||[]).forEach(i=>{n.push(i)})}catch(i){console.error(`Error while reading CSS rules from ${o.href}`,i)}}),n))}function pr(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>Ke(t.style.getPropertyValue("src")))}async function ur(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=q(e.ownerDocument.styleSheets),r=await dr(n,t);return pr(r)}function Vt(e){return e.trim().replace(/["']/g,"")}function hr(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(i=>{t.add(Vt(i))}),Array.from(r.children).forEach(i=>{i instanceof HTMLElement&&n(i)})}return n(e),t}async function Xt(e,t){let n=await ur(e,t),r=hr(e);return(await Promise.all(n.filter(i=>r.has(Vt(i.style.fontFamily))).map(i=>{let a=i.parentStyleSheet?i.parentStyleSheet.href:null;return Le(i.cssText,a,t)}))).join(`
`)}async function Gt(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await Xt(e,t);if(n){let r=document.createElement("style"),o=document.createTextNode(n);r.appendChild(o),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function mr(e,t={}){let{width:n,height:r}=Xe(e,t),o=await ge(e,t,!0);return await Gt(o,t),await Je(o,t),_t(o,t),await Ht(o,n,r)}async function fr(e,t={}){let{width:n,height:r}=Xe(e,t),o=await mr(e,t),i=await ae(o),a=document.createElement("canvas"),l=a.getContext("2d"),d=t.pixelRatio||Pt(),p=t.canvasWidth||n,u=t.canvasHeight||r;return a.width=p*d,a.height=u*d,t.skipAutoScale||$t(a),a.style.width=`${p}`,a.style.height=`${u}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,a.width,a.height)),l.drawImage(i,0,0,a.width,a.height),a}async function Zt(e,t={}){let n=await fr(e,t);return await It(n)}var gr="data-builder-hide",Qe={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},Yt=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function Kt(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function et(e){return e==="video"?Qe.video:e==="image"?Qe.image:Qe.file}function Te(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function Me(e=15e3){let t=await Promise.race([Zt(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(Q)!==null&&r?.hasAttribute?.(Q)||r?.hasAttribute?.(gr))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${br()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function br(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function de(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}function Re(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},o=d=>{let p=document.elementFromPoint(d.clientX,d.clientY);if(!p||Ce(p)||p===document.body||p===document.documentElement){r();return}p!==n&&(r(),n=p,p.classList.add("builder-pin-hover"))},i=d=>{let p=document.elementFromPoint(d.clientX,d.clientY);if(!p||Ce(p))return;d.preventDefault(),d.stopPropagation();let u=Ct(p);l(),e(u,p)},a=d=>{d.key==="Escape"&&(d.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",o,!0),document.removeEventListener("click",i,!0),document.removeEventListener("keydown",a,!0)}return document.addEventListener("mousemove",o,!0),document.addEventListener("click",i,!0),document.addEventListener("keydown",a,!0),l}function Pe(e){let t=At(e);if(!t.el||t.confidence<St)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var y={hello:"builder:hello",ready:"builder:ready",url:"builder:url",pinStart:"builder:pin:start",pinDone:"builder:pin:done",pinCancel:"builder:pin:cancel",shot:"builder:shot",shotDone:"builder:shot:done",context:"builder:context",contextDone:"builder:context:done"},xr=200,Jt=100,vr=1e3,yr=512;function Qt(e={}){if(window.parent===window)return()=>{};let t=e.locale??"en",n=null,r=null,o=!1,i=null,a=[],l=[],d=[];function p(g){if(n)try{n.win.postMessage(g,n.origin)}catch{}}function u(){p({v:1,type:y.ready,url:location.href,title:document.title})}function b(){p({v:1,type:y.url,url:location.href,title:document.title})}function k(){i===null&&(i=window.setTimeout(()=>{i=null,b()},0))}function L(){let g=wr(a,l,t);p({v:1,type:y.contextDone,...g})}function E(){R(),r=Re((g,P)=>{r=null,P.classList.add("builder-pin-found"),setTimeout(()=>P.classList.remove("builder-pin-found"),3e3),p({v:1,type:y.pinDone,anchor:g}),L()},()=>{r=null,p({v:1,type:y.pinDone,anchor:null})})}function R(){r&&(r(),r=null)}async function j(){if(!o){o=!0;try{let g=await Me(),P=await Ir(g.blob);p({v:1,type:y.shotDone,dataUrl:P}),L()}catch(g){p({v:1,type:y.shotDone,dataUrl:null,error:nt(String(g?.message||g)).slice(0,300)})}finally{o=!1}}}function w(){if(d.push(Er(g=>tt(a,xr,g)),Sr(g=>tt(l,Jt,g)),Ar(g=>tt(l,Jt,g)),Lr(k)),document.readyState!=="complete"){let g=()=>b();window.addEventListener("load",g,{once:!0}),d.push(()=>window.removeEventListener("load",g))}try{e.onActivate?.(n.origin)}catch{}}function C(g){let P=g.data;if(!(!P||P.v!==1||typeof P.type!="string")){if(!n){if(P.type!==y.hello||window.parent===window||g.source!==window.parent||!g.origin||g.origin==="null"||P.shellOrigin!==g.origin||e.shellOrigins&&!e.shellOrigins.includes(g.origin))return;n={win:window.parent,origin:g.origin},w(),u();return}if(!(g.source!==n.win||g.origin!==n.origin))switch(P.type){case y.hello:u();return;case y.pinStart:E();return;case y.pinCancel:R();return;case y.shot:j();return;case y.context:L();return}}}window.addEventListener("message",C);let x=()=>k();return window.addEventListener("popstate",x),window.addEventListener("hashchange",x),()=>{window.removeEventListener("message",C),window.removeEventListener("popstate",x),window.removeEventListener("hashchange",x),i!==null&&(clearTimeout(i),i=null),R();for(let g of d.splice(0))try{g()}catch{}n=null}}function wr(e,t,n){return{console:e.slice(),network:t.slice(),viewport:{w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio||1},userAgent:navigator.userAgent,locale:n,url:location.href,title:document.title}}function tt(e,t,n){e.push(n),e.length>t&&e.shift()}var kr=["log","info","warn","error","debug"];function Er(e){let t=new Map;for(let n of kr){let r=console[n];typeof r=="function"&&(t.set(n,r),console[n]=function(...o){try{e({level:n,text:Cr(o),ts:Date.now()})}catch{}r.apply(console,o)})}return()=>{for(let[n,r]of t)console[n]=r}}function Cr(e){let t=e.map(n=>{if(typeof n=="string")return n;if(n instanceof Error)return n.stack||`${n.name}: ${n.message}`;try{return JSON.stringify(n)??String(n)}catch{return String(n)}});return nt(t.join(" ").slice(0,vr))}function Sr(e){let t=window.fetch;return typeof t!="function"?()=>{}:(window.fetch=function(n,r){let o=Date.now(),i="GET",a="";try{typeof n=="string"?a=n:n instanceof URL?a=n.href:n&&(a=n.url,i=n.method||"GET"),r&&r.method&&(i=r.method)}catch{}let l=(p,u)=>{try{e({method:i.toUpperCase(),url:en(a),status:p,ok:u,durationMs:Date.now()-o,ts:o})}catch{}},d=t.call(window,n,r);return d.then(p=>l(p.status,p.ok),()=>l(0,!1)),d},()=>{window.fetch=t})}function Ar(e){let t=XMLHttpRequest.prototype,n=t.open,r=t.send,o=new WeakMap;return t.open=function(i,a){try{o.set(this,{method:String(i||"GET").toUpperCase(),url:String(a),started:0})}catch{}return n.apply(this,arguments)},t.send=function(i){let a=o.get(this);if(a){a.started=Date.now();let l=()=>{this.removeEventListener("loadend",l);try{e({method:a.method,url:en(a.url),status:this.status,ok:this.status>=200&&this.status<400,durationMs:Date.now()-a.started,ts:a.started})}catch{}};try{this.addEventListener("loadend",l)}catch{}}return r.call(this,i)},()=>{t.open=n,t.send=r}}function en(e){let t=e;try{t=new URL(e,location.href).href}catch{}return nt(t).slice(0,yr)}function Lr(e){let t=history.pushState,n=history.replaceState;return history.pushState=function(...r){t.apply(this,r),e()},history.replaceState=function(...r){n.apply(this,r),e()},()=>{history.pushState=t,history.replaceState=n}}var $e="[redacted]",Tr=/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/@\s]+):[^@\s]*@/g,Mr=/\b(password|passwd|pwd|secret|token|api[_-]?key|auth|authorization|access[_-]?key|private[_-]?key|sslpassword)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&"']+)/gi,Rr=/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g,Pr=/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,$r=/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;function nt(e){return e&&(e=e.replace($r,"[redacted private key]"),e=e.replace(Tr,"$1:"+$e+"@"),e=e.replace(Mr,"$1$2"+$e),e=e.replace(Rr,$e),e=e.replace(Pr,$e),e)}function Ir(e){return new Promise((t,n)=>{let r=new FileReader;r.onload=()=>t(String(r.result)),r.onerror=()=>n(new Error("could not encode the screenshot")),r.readAsDataURL(e)})}var Hr={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",cancel:"Cancel",markdownHint:"Markdown supported \u2014 **bold**, `code`, lists.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinAnother:"Pin another",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",ctxAttached:(e,t,n)=>`Console and network activity from ${e} will be attached (${t} console line${t===1?"":"s"}, ${n} request${n===1?"":"s"}).`,ctxOptOut:"Send without console & network activity",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",apps:"Build",appAgents:"Agents",appSkills:"Skills",appIssues:"Issues",appVault:"Vault",appMcp:"MCP",appSources:"Sources",appDocs:"Library",appBrain:"Brain",appChat:"Chat",appTerminal:"Terminal",dir:"ltr"},Dr={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",cancel:"\u0625\u0644\u063A\u0627\u0621",markdownHint:"\u064A\u062F\u0639\u0645 Markdown \u2014 **\u0639\u0631\u064A\u0636**\u060C `\u0634\u064A\u0641\u0631\u0629`\u060C \u0642\u0648\u0627\u0626\u0645.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinAnother:"\u062A\u062D\u062F\u064A\u062F \u0645\u0648\u0642\u0639 \u0622\u062E\u0631",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",ctxAttached:(e,t,n)=>`\u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642 \u0646\u0634\u0627\u0637 \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0634\u0628\u0643\u0629 \u0645\u0646 ${e} (${t} \u0633\u0637\u0631\u060C ${n} \u0637\u0644\u0628).`,ctxOptOut:"\u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u062F\u0648\u0646 \u0646\u0634\u0627\u0637 \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0634\u0628\u0643\u0629",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",apps:"\u0627\u0644\u0628\u0646\u0627\u0621",appAgents:"\u0627\u0644\u0648\u0643\u0644\u0627\u0621",appSkills:"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A",appIssues:"\u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",appVault:"\u0627\u0644\u062E\u0632\u0646\u0629",appMcp:"MCP",appSources:"\u0627\u0644\u0645\u0635\u0627\u062F\u0631",appDocs:"\u0627\u0644\u0645\u0643\u062A\u0628\u0629",appBrain:"\u0627\u0644\u062F\u0645\u0627\u063A",appChat:"\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",appTerminal:"\u0627\u0644\u0637\u0631\u0641\u064A\u0629",dir:"rtl"};function Ie(e){return e.toLowerCase().startsWith("ar")?Dr:Hr}var tn="http://www.w3.org/2000/svg",nn={messageSquare:[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}],["path",{d:"M13 8H7"}],["path",{d:"M17 12H7"}]],x:[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]],plus:[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]],pin:[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{cx:"12",cy:"10",r:"3"}]],paperclip:[["path",{d:"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"}]],camera:[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}],["circle",{cx:"12",cy:"13",r:"3"}]],eye:[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]],arrowRight:[["path",{d:"M5 12h14"}],["path",{d:"m12 5 7 7-7 7"}]],chevronRight:[["path",{d:"m9 18 6-6-6-6"}]],agents:[["path",{d:"M12 8V4H8"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2"}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],skills:[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"}],["path",{d:"M22 10v6"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5"}]],issues:[["rect",{x:"3",y:"5",width:"6",height:"6",rx:"1"}],["path",{d:"m3 17 2 2 4-4"}],["path",{d:"M13 6h8"}],["path",{d:"M13 12h8"}],["path",{d:"M13 18h8"}]],vault:[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 7.9 2.7 2.7"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 10.6 2.7-2.7"}],["circle",{cx:"7.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 16.1 2.7-2.7"}],["circle",{cx:"16.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 13.4 2.7 2.7"}],["circle",{cx:"12",cy:"12",r:"2"}]],sources:[["path",{d:"M4 11a9 9 0 0 1 9 9"}],["path",{d:"M4 4a16 16 0 0 1 16 16"}],["circle",{cx:"5",cy:"19",r:"1"}]],docs:[["rect",{width:"8",height:"18",x:"3",y:"3",rx:"1"}],["path",{d:"M7 3v18"}],["path",{d:"M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"}]],brain:[["path",{d:"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"}],["path",{d:"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"}],["path",{d:"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"}],["path",{d:"M17.599 6.5a3 3 0 0 0 .399-1.375"}],["path",{d:"M6.003 5.125A3 3 0 0 0 6.401 6.5"}],["path",{d:"M3.477 10.896a4 4 0 0 1 .585-.396"}],["path",{d:"M19.938 10.5a4 4 0 0 1 .585.396"}],["path",{d:"M6 18a4 4 0 0 1-1.967-.516"}],["path",{d:"M19.967 17.484A4 4 0 0 1 18 18"}]],chat:[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],mcp:[["path",{d:"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"}],["path",{d:"m2 22 3-3"}],["path",{d:"M7.5 13.5 10 11"}],["path",{d:"M10.5 16.5 13 14"}],["path",{d:"m18 3-4 4h6l-4 4"}]],terminal:[["path",{d:"m7 11 2-2-2-2"}],["path",{d:"M11 13h4"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}]],layers:[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]],app:[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1"}]]};function He(e){return Object.prototype.hasOwnProperty.call(nn,e)}function D(e,t=14){let n=document.createElementNS(tn,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let[r,o]of nn[e]){let i=document.createElementNS(tn,r);for(let[a,l]of Object.entries(o))i.setAttribute(a,l);n.appendChild(i)}return n}function V(e,t,n,r=14){e.replaceChildren(),e.appendChild(D(t,r));let o=document.createElement("span");o.textContent=n,e.appendChild(o)}function Be(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let o=n[r],i=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(o);if(i){let u=i[1][0],b=[];for(r++;r<n.length&&!new RegExp(`^\\s*${u}{3,}\\s*$`).test(n[r]);)b.push(n[r]),r++;r++;let k=document.createElement("pre");k.className="md-pre";let L=document.createElement("code");i[2]&&(L.className=`lang-${i[2]}`),L.textContent=b.join(`
`),k.appendChild(L),t.appendChild(k);continue}if(!o.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(o)){t.appendChild(document.createElement("hr")),r++;continue}let a=/^\s*(#{1,6})\s+(.*)$/.exec(o);if(a){let u=Math.min(6,3+a[1].length),b=document.createElement(`h${u}`);b.className="md-h",b.appendChild(De(a[2])),t.appendChild(b),r++;continue}if(/^\s*>\s?/.test(o)){let u=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)u.push(n[r].replace(/^\s*>\s?/,"")),r++;let b=document.createElement("blockquote");b.className="md-quote",b.appendChild(Be(u.join(`
`))),t.appendChild(b);continue}let l=/^\s*[-*+]\s+/,d=/^\s*\d+[.)]\s+/;if(l.test(o)||d.test(o)){let u=!l.test(o),b=u?d:l,k=document.createElement(u?"ol":"ul");for(k.className="md-list";r<n.length&&b.test(n[r]);){let L=document.createElement("li"),E=n[r].replace(b,"");for(r++;r<n.length&&n[r].trim()&&!b.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)E+=`
`+n[r].trim(),r++;L.appendChild(De(E)),k.appendChild(L)}t.appendChild(k);continue}let p=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r]);)p.push(n[r]),r++;if(p.length){let u=document.createElement("p");u.className="md-p",u.appendChild(De(p.join(`
`))),t.appendChild(u)}else r++}return t}var Br=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function De(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=Br.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&on(t,n.slice(0,r.index)),r[1]){let o=document.createElement("code");o.className="md-code",o.textContent=r[2].trim(),t.appendChild(o)}else r[3]!==void 0?t.appendChild(rn(r[4],r[3]||r[4])):r[5]?t.appendChild(rt("strong","md-strong",r[6])):r[7]?t.appendChild(rt("del","md-del",r[8])):r[9]?t.appendChild(rt("em","md-em",r[10])):r[11]&&t.appendChild(rn(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&on(t,n),t}function rt(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(De(n)),r}function rn(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function on(e,t){t.split(`
`).forEach((r,o)=>{o&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function an(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let o=await r.json();return{id:o.id,number:o.number,title:o.title,body:o.body??"",type:o.type,status:o.status,priority:o.priority,route:o.route??"",pageUrl:o.pageUrl??"",createdAt:o.createdAt??"",pins:o.pins??[],comments:o.comments??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function sn(e,t,n,r=o=>`/builder/issues/${o}`){let o=Ie(e),i=document.createElement("div");i.className="detail hidden";let a=null;async function l(u){i.replaceChildren(A("p","empty",o.loading));try{a=await t.get(u),d()}catch(b){i.replaceChildren(A("p","note err",String(b.message)))}}function d(){if(!a)return;let u=a;i.replaceChildren();let b=A("div","d-head",""),k=ze("ghost","\u2190 "+o.onThisPage);k.addEventListener("click",n);let L=ze("ghost","\u2197");L.title=o.report,L.addEventListener("click",()=>window.open(r(u.number),"_blank","noopener")),b.append(k,L),i.appendChild(b);let E=A("div","d-meta","");if(E.append(A("span","num",`#${u.number}`),A("span",`chip ${u.type}`,o[u.type]??u.type),A("span","chip status",u.status.replace("_"," "))),i.append(E,A("h3","d-title",u.title)),u.body){let w=A("div","d-body","");w.appendChild(Be(u.body)),i.appendChild(w)}if(u.pins.length){i.appendChild(A("div","label",o.location));for(let w of u.pins){let C=A("div","d-pin","");C.appendChild(A("span","nm",`<${w.tag??"?"}>${w.name?` \u201C${w.name}\u201D`:""}`));let x=ze("ghost","");x.appendChild(D("eye",14)),x.title=o.pin,x.addEventListener("click",()=>{let g=Pe(w);p(g.found?`Found via ${g.by} (${Math.round(g.confidence*100)}%)`:"The pinned element is not on this page any more.",g.found?"ok":"err")}),C.appendChild(x),i.appendChild(C)}}i.appendChild(A("div","label","Comments")),u.comments.length||i.appendChild(A("p","empty","No comments yet."));for(let w of u.comments){let C=A("div","d-comment",""),x=A("p","who",w.author||"someone");w.kind==="agent"&&x.appendChild(A("span","chip agent","agent"));let g=A("div","txt","");g.appendChild(Be(w.body)),C.append(x,g),i.appendChild(C)}let R=document.createElement("textarea");R.placeholder="Add a comment\u2026",R.rows=3;let j=ze("primary","Comment");j.addEventListener("click",async()=>{let w=R.value.trim();if(w){j.disabled=!0;try{await t.comment(u.number,w),R.value="",await l(u.number)}catch(C){p(String(C.message),"err")}finally{j.disabled=!1}}}),i.append(R,j)}function p(u,b){let k=A("p",`note ${b}`,u);i.appendChild(k),setTimeout(()=>k.remove(),4e3)}return{el:i,load:l,destroy:()=>i.remove()}}function A(e,t,n){let r=document.createElement(e);return r.className=t,n&&(r.textContent=n),r}function ze(e,t){let n=document.createElement("button");return n.type="button",n.className=e,n.textContent=t,n}var ln=`
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

/* Bridge-mode context disclosure (framedHost). Flex + logical gap, so the
   checkbox row reads correctly in RTL without direction-specific rules. */
.ctxrow { margin-top: 10px; }
.ctx-opt {
  display: flex; align-items: center; gap: 6px; margin-top: 6px;
  font-size: var(--fs-xs); color: var(--muted); cursor: pointer;
}
.ctx-opt input { accent-color: var(--accent); margin: 0; }
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
`,cn=`
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

`;function dn(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let o=await r.json().catch(()=>null);return Array.isArray(o?.issues)?o.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??"",context:n.context??void 0}));for(let a of n.attachments)r.append("attachments",a.blob,a.name),r.append("attachment_kinds",a.kind);let o=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!o.ok){let a=await o.text().catch(()=>"");throw new Error(a||`submit failed (${o.status})`)}let i=await o.json();return{id:String(i.id??""),number:Number(i.number??0)}}}}var un="builder.fab.position",zr=["bug","feature","question","discussion"],pn=8;function Or(e={}){let t=Ie(e.locale??document.documentElement.lang??"en"),n=e.transport??dn(e.apiBase),r=e.locale??"en",o=document.createElement("div");o.setAttribute(Q,""),o.setAttribute("dir",t.dir),e.theme&&o.setAttribute("data-theme",e.theme),document.body.appendChild(o);let i=o.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=ln+(e.accent?`:host{--accent:${Nr(e.accent)}}`:""),i.appendChild(a);let l=document.createElement("style");l.setAttribute(Q,""),l.textContent=cn,document.head.appendChild(l);let d=[],p=[],u=[],b="bug",k=!1,L=!1,E=null,R=null,j=!1,w=null,C=null,x=null,g=null,P=()=>{},ot=document.createElement("div");ot.innerHTML=`
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
            <input type="file" class="filein hidden" multiple accept="${Yt}">

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

`,i.appendChild(ot);let h=s=>i.querySelector(s),B=h(".fab"),H=h(".panel"),it=h(".form"),at=h(".listing"),ee=h(".modal"),F=h(".modal-card"),te=h(".modal-head"),Oe=h(".modal-x"),st=h(".cancel"),be=h(".rows"),Fe=h(".pills"),Ue=h(".note"),lt=h(".files"),xe=h(".filein"),ct=h(".count"),hn=h(".appgrid"),ve=h('input[name="title"]'),dt=h('textarea[name="body"]'),pt=h('input[name="url"]'),X=h(".pin");if(e.framedHost){let s=new Map,c=M=>{let m=s.get(M.id);return m?m.app=M:(m={app:M,ready:!1,page:null,ctx:null},s.set(M.id,m)),m},f=M=>{let m=M;return!m||typeof m.id!="string"||!m.id?null:{id:m.id,name:typeof m.name=="string"&&m.name?m.name:m.id,origin:typeof m.origin=="string"?m.origin:""}},v=(M,m)=>{m&&window.postMessage({v:1,type:M,appId:m},location.origin)},U=M=>v(M,x?.id),S="This app has not loaded the builder script, so there is nothing inside the frame to read the page with. Add the script tag to enable pinning and screenshots.",T=h(".pin"),z=h(".shot"),we=h(".ctxrow"),Cn=h(".ctx-note");h(".ctx-opt-txt").textContent=t.ctxOptOut;let ue=()=>{let M=x?s.get(x.id):void 0;w=M?.page??null,C=M?.ctx??null;let m=!!M?.ready;for(let ke of[T,z])ke.disabled=!m,ke.title=m?"":S,m?ke.removeAttribute("aria-disabled"):ke.setAttribute("aria-disabled","true");pt.value=w?.url??"";let $=de(w?.url),J=h(".brand-sub");J.setAttribute("dir","auto"),J.textContent=x?`${x.name} \xB7 ${$}`:$;let W=!!C&&(C.console.length>0||C.network.length>0);we.classList.toggle("hidden",!W),C&&x&&(Cn.textContent=t.ctxAttached(x.name,C.console.length,C.network.length))},kt=()=>{g=null,k?ee.dataset.open="true":H.dataset.open="true",oe()};P=()=>{v(y.pinCancel,g??void 0),kt()},window.addEventListener("message",M=>{if(M.source!==window||M.origin!==location.origin)return;let m=M.data;if(!m||m.v!==1||typeof m.type!="string")return;let $=f(m.app);if(!$)return;if(m.type==="builder:app:active"){g&&g!==$.id&&P(),x=$,c($),ue(),v(y.context,$.id),Z();return}let J=c($);switch(m.type){case y.ready:J.ready=!0,typeof m.url=="string"&&m.url&&(J.page={url:m.url,title:typeof m.title=="string"?m.title:""}),v(y.context,$.id),$.id===x?.id&&(ue(),Z());return;case y.url:typeof m.url=="string"&&m.url&&(J.page={url:m.url,title:typeof m.title=="string"?m.title:""}),$.id===x?.id&&(ue(),Z());return;case y.pinDone:{if(g!==$.id)return;let W=m.anchor;W&&typeof W=="object"&&p.length<pn&&(p=[...p,W]),kt();return}case y.shotDone:{if($.id!==x?.id)return;if(z.disabled=!1,typeof m.dataUrl=="string"&&m.dataUrl.startsWith("data:")){let W=Fr(m.dataUrl);W&&W.size<=et("image")?(u.push(W),pe(),N("")):N(t.failed,"err")}else N(typeof m.error=="string"&&m.error?m.error:t.failed,"err");return}case y.contextDone:{J.ctx={console:Array.isArray(m.console)?m.console:[],network:Array.isArray(m.network)?m.network:[],viewport:m.viewport&&typeof m.viewport=="object"?m.viewport:{w:0,h:0,dpr:1},userAgent:typeof m.userAgent=="string"?m.userAgent:"",locale:typeof m.locale=="string"?m.locale:"",url:typeof m.url=="string"?m.url:"",title:typeof m.title=="string"?m.title:"",app:$},$.id===x?.id&&ue();return}}}),T.addEventListener("click",()=>{if(!(!x||!s.get(x.id)?.ready)){if(g){P();return}g=x.id,H.dataset.open="false",ee.dataset.open="false",T.setAttribute("aria-pressed","true"),T.textContent=t.pinning,U(y.pinStart)}}),z.addEventListener("click",()=>{!x||!s.get(x.id)?.ready||(z.disabled=!0,U(y.shot))}),h(".report").addEventListener("click",()=>U(y.context)),ue()}let _e=h(".clearpin"),Ne=h(".pin-preview"),ne=h(".send"),ye=new WeakMap;function mn(s){let c=ye.get(s);return c||(c=URL.createObjectURL(s.blob),ye.set(s,c)),c}function qe(s){let c=ye.get(s);c&&(URL.revokeObjectURL(c),ye.delete(s))}h(".fab-label").textContent=t.fab,h("h2").textContent=t.title,H.setAttribute("aria-label",t.title),h(".brand-ico").replaceChildren(D("messageSquare",16)),h(".brand-sub").textContent=de(),h(".fab-ico").replaceChildren(D("messageSquare",14)),h(".x").replaceChildren(D("x",16)),h(".x").setAttribute("aria-label",t.close),h(".intro").textContent=t.intro,V(h(".report"),"plus",t.report,15),h(".lbl-type").textContent=t.type,h(".lbl-title").textContent=t.titleLabel,h(".lbl-details").textContent=t.details,h(".lbl-url").textContent=t.pageUrl,h(".lbl-loc").textContent=t.location,h(".lbl-att").textContent=t.attachments,h(".lbl-page").textContent=t.onThisPage,V(h(".board-link"),"arrowRight",t.openBoard),h(".lbl-apps").textContent=t.apps,h(".modal-title").textContent=t.reportTitle,Oe.setAttribute("aria-label",t.close),Oe.appendChild(D("x",16)),ee.setAttribute("aria-label",t.reportTitle),st.textContent=t.cancel,h(".lbl-md").textContent=t.markdownHint,ve.placeholder=t.titlePlaceholder,dt.placeholder=t.detailsPlaceholder,V(X,"pin",t.pin),V(_e,"x",t.clear),V(h(".addfile"),"paperclip",t.addFile),V(h(".shot"),"camera",t.screenshot),ne.textContent=t.submit;for(let s of zr){let c=document.createElement("button");c.type="button",c.className="pill",c.dataset.type=s,c.textContent=t[s],c.setAttribute("aria-pressed",String(s===b)),c.addEventListener("click",()=>{b=s,Fe.querySelectorAll(".pill").forEach(f=>f.setAttribute("aria-pressed",String(f.dataset.type===s)))}),Fe.appendChild(c)}let fn=4,_=null,je=(s,c)=>{let f=Math.max(8,Math.min(s,window.innerWidth-80)),v=Math.max(8,Math.min(c,window.innerHeight-48));B.style.insetInlineEnd=`${f}px`,B.style.insetBlockEnd=`${v}px`},ut=Ur();je(ut?.right??e.position?.right??24,ut?.bottom??e.position?.bottom??24),B.addEventListener("pointerdown",s=>{if(s.button!==0)return;let c=B.getBoundingClientRect();_={x:s.clientX,y:s.clientY,ox:window.innerWidth-c.right,oy:window.innerHeight-c.bottom,moved:!1},B.setPointerCapture(s.pointerId)}),B.addEventListener("pointermove",s=>{if(!_)return;let c=s.clientX-_.x,f=s.clientY-_.y;!_.moved&&Math.hypot(c,f)<fn||(_.moved=!0,je(_.ox-c,_.oy-f))}),B.addEventListener("pointerup",s=>{if(!_)return;let c=_.moved;if(_=null,B.releasePointerCapture(s.pointerId),c){let f=B.getBoundingClientRect();_r(window.innerWidth-f.right,window.innerHeight-f.bottom);return}ht()}),B.addEventListener("keydown",s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),ht())}),window.addEventListener("resize",()=>{let s=B.getBoundingClientRect();je(window.innerWidth-s.right,window.innerHeight-s.bottom)});function ht(){H.dataset.open==="true"?G():mt()}function mt(){j||(H.dataset.open="true",B.setAttribute("aria-expanded","true"),e.framedHost||(pt.value=location.href,h(".brand-sub").textContent=de()),Z())}function G(){H.dataset.open="false",H.dataset.detail="false",B.setAttribute("aria-expanded","false"),K(!1),E?.(),E=null}let gn=[{key:"agents",path:"/agents",color:"#8b5cf6",label:t.appAgents},{key:"skills",path:"/skills",color:"#06b6d4",label:t.appSkills},{key:"issues",path:"/issues",color:"#f59e0b",label:t.appIssues},{key:"vault",path:"/vault",color:"#10b981",label:t.appVault},{key:"sources",path:"/sources",color:"#3b82f6",label:t.appSources},{key:"docs",path:"/library",color:"#f43f5e",label:t.appDocs},{key:"brain",path:"/brain",color:"#a855f7",label:t.appBrain},{key:"chat",path:"/chat",color:"#14b8a6",label:t.appChat},{key:"mcp",path:"/mcp",color:"#ec4899",label:t.appMcp},{key:"terminal",path:"/terminal",color:"#64748b",label:t.appTerminal}];function ft(){let s=(e.apiBase??"").trim();if(!s)return"";try{return new URL(s,location.href).origin}catch{return""}}let bn=(e.screensBase??"/builder").replace(/\/+$/,""),gt=(s,c)=>`${ft()}${bn}${s}${c?"?embed=1":""}`;function bt(s){let c=document.createElement("button");c.type="button",c.className="app",c.dataset.app=s.key;let f=document.createElement("span");f.className="app-ico",f.style.background=s.color,f.appendChild(D(He(s.key)?s.key:"app",18));let v=document.createElement("span");v.textContent=s.label,c.append(f,v),c.addEventListener("click",()=>xn(s)),hn.appendChild(c)}for(let s of gn)bt(s);(async()=>{try{let s=(e.apiBase??"").replace(/\/$/,""),c=await fetch(`${s}/api/builder/apps`,{credentials:"include",headers:{Accept:"application/json"}});if(!c.ok)return;let f=await c.json(),v=Array.isArray(f?.apps)?f.apps:[],U=t.dir==="rtl";for(let S of v){let T=typeof S?.slug=="string"?S.slug:"";if(!T)continue;let z=typeof S?.title?.en=="string"?S.title.en:T,we=typeof S?.title?.ar=="string"?S.title.ar:"";bt({key:T,path:`/apps/${T}`,color:typeof S?.color=="string"&&S.color?S.color:"#64748b",label:U&&we?we:z})}}catch{}})();function xn(s){let c=ft(),f=gt(s.path,!0);if(c&&c!==location.origin){window.open(f,"_blank","noopener"),G();return}try{sessionStorage.setItem("builder:standalone","1"),sessionStorage.setItem("builder:standalone:return",location.href)}catch{}G(),location.assign(f)}let re=null;te.addEventListener("pointerdown",s=>{if(s.target.closest(".modal-x"))return;let c=F.getBoundingClientRect();F.style.position="fixed",F.style.margin="0",F.style.left=`${c.left}px`,F.style.top=`${c.top}px`,re={dx:s.clientX-c.left,dy:s.clientY-c.top},te.setPointerCapture(s.pointerId)}),te.addEventListener("pointermove",s=>{if(!re)return;let c=F.getBoundingClientRect(),f=Math.min(Math.max(s.clientX-re.dx,8-c.width+80),innerWidth-80),v=Math.min(Math.max(s.clientY-re.dy,8),innerHeight-44);F.style.left=`${f}px`,F.style.top=`${v}px`});let xt=s=>{if(re){re=null;try{te.releasePointerCapture(s.pointerId)}catch{}}};te.addEventListener("pointerup",xt),te.addEventListener("pointercancel",xt);function vn(){F.style.position="",F.style.left="",F.style.top="",F.style.margin=""}Oe.addEventListener("click",()=>K(!1)),st.addEventListener("click",()=>K(!1)),document.addEventListener("keydown",s=>{if(s.key==="Escape"){if(g){P();return}k&&!E&&K(!1)}}),h(".x").addEventListener("click",G),i.addEventListener("keydown",s=>{s.key==="Escape"&&!E&&G()});function vt(s){H.dataset.open!=="true"||E||s.composedPath().includes(o)||G()}document.addEventListener("click",vt,!0);function K(s){k=s,ee.dataset.open=s?"true":"false",s?(vn(),setTimeout(()=>ve.focus(),30)):(yn(),E?.(),E=null)}h(".report").addEventListener("click",()=>K(!0));function yn(){it.reset(),p=[],u.forEach(qe),u=[],b="bug",Fe.querySelectorAll(".pill").forEach(s=>s.setAttribute("aria-pressed",String(s.dataset.type==="bug"))),oe(),pe(),N("")}function N(s,c=""){Ue.textContent=s,Ue.className=`note ${c}`.trim(),Ue.classList.toggle("hidden",!s)}e.framedHost||X.addEventListener("click",()=>{if(E){E(),E=null,X.setAttribute("aria-pressed","false"),V(X,"pin",t.pin);return}H.dataset.open="false",ee.dataset.open="false",X.setAttribute("aria-pressed","true"),X.textContent=t.pinning;let s=()=>{k?ee.dataset.open="true":H.dataset.open="true"};E=Re((c,f)=>{p.length<pn&&(p=[...p,c]),E=null,s(),oe(),f.classList.add("builder-pin-found"),setTimeout(()=>f.classList.remove("builder-pin-found"),3e3)},()=>{E=null,s(),oe()})}),_e.addEventListener("click",()=>{p=[],oe()});function oe(){let s=p.length>0;X.setAttribute("aria-pressed",String(s)),V(X,"pin",s?t.pinAnother:t.pin),_e.classList.toggle("hidden",!s),Ne.classList.toggle("hidden",!s),Ne.textContent="",p.forEach((c,f)=>{let v=document.createElement("div");v.className="pinrow";let U=document.createElement("span");U.className="pinnum",U.textContent=String(f+1);let S=c.name||c.hint||"",T=document.createElement("span");T.className="pintxt",T.textContent=`<${c.tag??"?"}>${S?` \u201C${S}\u201D`:""}`;let z=document.createElement("button");z.type="button",z.className="pindel",z.setAttribute("aria-label",`${t.clear} ${f+1}`),z.appendChild(D("x",12)),z.addEventListener("click",()=>{p.splice(f,1),oe()}),v.append(U,T,z),Ne.appendChild(v)})}h(".addfile").addEventListener("click",()=>xe.click()),xe.addEventListener("change",()=>{for(let s of Array.from(xe.files??[]))wn(s);xe.value=""});function wn(s){let c=Kt(s.type),f=et(c);if(s.size>f){N(`${s.name} is ${Te(s.size)} \u2014 the limit is ${Te(f)}.`,"err");return}u.push({name:s.name,mime:s.type,size:s.size,kind:c,blob:s}),pe(),N("")}e.framedHost||h(".shot").addEventListener("click",async()=>{let s=h(".shot");s.disabled=!0;let c=H.dataset.open;H.dataset.open="false",o.style.visibility="hidden";try{await new Promise(f=>setTimeout(f,120)),u.push(await Me()),pe(),N("")}catch(f){N(String(f.message||f),"err")}finally{o.style.visibility="",H.dataset.open=c??"true",s.disabled=!1}});function pe(){lt.replaceChildren(),u.forEach((s,c)=>{let f=document.createElement("div");if(f.className="file",s.kind==="screenshot"||s.kind==="image"){let T=document.createElement("img");T.className="thumb",T.src=mn(s),T.alt="",f.appendChild(T)}let v=document.createElement("span");v.className="nm",v.textContent=s.name;let U=document.createElement("span");U.textContent=Te(s.size);let S=document.createElement("button");S.type="button",S.replaceChildren(D("x",12)),S.setAttribute("aria-label",t.clear),S.addEventListener("click",()=>{qe(s),u.splice(c,1),pe()}),f.append(v,U,S),lt.appendChild(f)})}async function yt(){if(L)return;let s=ve.value.trim();if(!s){N(t.titleRequired,"err"),ve.focus();return}L=!0,ne.disabled=!0,ne.textContent=t.submitting;try{let c=h(".ctx-optout"),f=x?{console:[],network:[],viewport:{w:0,h:0,dpr:1},userAgent:"",locale:"",url:w?.url??"",title:w?.title??"",app:x}:void 0,v=await n.create({type:b,title:s,body:dt.value,route:de(w?.url),pageUrl:w?.url??location.href,locale:r,pins:p,attachments:u,context:C&&!c?.checked?C:f});N(t.created(v.number),"ok"),e.onCreated?.(v),setTimeout(()=>{K(!1),Z()},900)}catch(c){N(String(c.message||t.failed),"err")}finally{L=!1,ne.disabled=!1,ne.textContent=t.submit}}ne.addEventListener("click",yt),it.addEventListener("submit",s=>{s.preventDefault(),yt()});async function Z(){if(!k){be.replaceChildren(Y("div","empty",t.loading));try{d=await n.listByRoute(de(w?.url))}catch{d=[]}if(ct.textContent=d.length>9?"9+":String(d.length),ct.classList.toggle("hidden",d.length===0),h(".lbl-page").textContent=d.length?t.issueCount(d.length):t.onThisPage,be.replaceChildren(),!d.length){be.appendChild(Y("div","empty",t.none));return}for(let s of d){let c=document.createElement("button");if(c.type="button",c.className="row",c.append(Y("span","num",`#${s.number}`),Y("span",`chip ${s.type}`,t[s.type])),c.appendChild(Y("span","t",s.title)),s.busy){let v=Y("span","agent-tag","");v.appendChild(Y("span","spin","")),v.appendChild(Y("span","who",s.agent||t.agentWorking)),v.setAttribute("title",s.agent?t.agentWorkingBy(s.agent):t.agentWorking),c.appendChild(v)}let f=D("chevronRight",14);f.classList.add("go"),c.appendChild(f),c.addEventListener("click",()=>void kn(s.number)),be.appendChild(c)}}}async function kn(s){R||(R=sn(r,an(e.apiBase),()=>{R?.el.classList.add("hidden"),at.classList.remove("hidden"),h(".report").classList.remove("hidden"),h(".apps").classList.remove("hidden"),H.dataset.detail="false",Z()},c=>gt(`/issues/${c}`,!0)),h(".body").appendChild(R.el)),at.classList.add("hidden"),h(".report").classList.add("hidden"),h(".apps").classList.add("hidden"),K(!1),R.el.classList.remove("hidden"),H.dataset.detail="true",await R.load(s)}let wt=null;!e.framedHost&&e.bridge!==!1&&(wt=Qt({locale:r,shellOrigins:e.shellOrigins,onActivate:()=>{j=!0,E?.(),E=null,G(),o.style.display="none"}}));let En={open:mt,close:G,refresh:()=>void Z(),destroy(){wt?.(),E?.(),u.forEach(qe),document.removeEventListener("click",vt,!0),o.remove(),l.remove()}};return Z(),En}function Fr(e){try{let t=e.indexOf(",");if(t<0)return null;let n=/^data:([^;,]+)/.exec(e.slice(0,t))?.[1]||"image/png",r=atob(e.slice(t+1)),o=new Uint8Array(r.length);for(let p=0;p<r.length;p++)o[p]=r.charCodeAt(p);let i=new Blob([o],{type:n}),a=new Date,l=p=>String(p).padStart(2,"0");return{name:`screenshot-${`${a.getFullYear()}${l(a.getMonth()+1)}${l(a.getDate())}-${l(a.getHours())}${l(a.getMinutes())}${l(a.getSeconds())}`}.png`,mime:n,size:i.size,kind:"screenshot",blob:i}}catch{return null}}function Y(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function Ur(){try{let e=localStorage.getItem(un);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function _r(e,t){try{localStorage.setItem(un,JSON.stringify({right:e,bottom:t}))}catch{}}function Nr(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return Rn(qr);})();
