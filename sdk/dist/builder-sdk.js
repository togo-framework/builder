"use strict";var BuilderIssues=(()=>{var Fe=Object.defineProperty;var fn=Object.getOwnPropertyDescriptor;var gn=Object.getOwnPropertyNames;var bn=Object.prototype.hasOwnProperty;var xn=(e,t)=>{for(var n in t)Fe(e,n,{get:t[n],enumerable:!0})},vn=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of gn(t))!bn.call(e,o)&&o!==n&&Fe(e,o,{get:()=>t[o],enumerable:!(r=fn(t,o))||r.enumerable});return e};var yn=e=>vn(Fe({},"__esModule",{value:!0}),e);var Hr={};xn(Hr,{BRIDGE_MSG:()=>v,highlightPin:()=>Le,mount:()=>Mr});var K="data-builder-sdk";function ve(e){return!!e?.closest?.(`[${K}]`)}function gt(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,o={tag:e.tagName.toLowerCase(),hint:de(e),css:kn(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},i=e.getAttribute("data-testid")??e.getAttribute("data-test-id");i&&(o.testid=i),e.id&&!vt(e.id)&&(o.domId=e.id);let a=e.getAttribute("role")??En(e);a&&(o.role=a);let l=yt(e);l&&(o.name=l);for(let[p,c]of wn(o))try{let h=document.querySelectorAll(c);h.length===1&&h[0]===e&&o.verified.push(p)}catch{}return o}function wn(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${pe(e.testid)}"]`]),e.domId&&t.push(["domId",`#${pe(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var bt=.5;function xt(e){if(e.testid){let t=xe(`[data-testid="${pe(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=ft(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=xe(`[role="${pe(e.role)}"]`).filter(n=>yt(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=ft(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=xe(e.css);if(t.length===1){let n=t[0],r=!e.hint||Ue(de(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=xe(e.tag||"*").filter(n=>Ue(de(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function ft(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,o=null,i=1/0;for(let a of e){let l=a.getBoundingClientRect(),p=l.left/n-t.rect.x,c=l.top/r-t.rect.y,h=Math.hypot(p,c);t.hint&&Ue(de(a),t.hint)&&(h-=.5),h<i&&([o,i]=[a,h])}return o}function xe(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!ve(t))}catch{return[]}}function kn(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!vt(n.id)){t.unshift(`#${pe(n.id)}`);break}let o=n.tagName.toLowerCase(),i=n.parentElement;if(!i){t.unshift(o);break}let a=Array.from(i.children).filter(l=>l.tagName===n.tagName);t.unshift(a.length>1?`${o}:nth-of-type(${a.indexOf(n)+1})`:o),n=i}return t.join(" > ").slice(0,512)}function vt(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function de(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function Ue(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function yt(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||de(e)).slice(0,80)}function En(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function pe(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function wt(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),o=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(o),t&&(r.href=t),o.href=e,o.href}var kt=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function _(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var re=null;function we(e={}){return re||(e.includeStyleProperties?(re=e.includeStyleProperties,re):(re=_(window.getComputedStyle(document.documentElement)),re))}function ye(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function Cn(e){let t=ye(e,"border-left-width"),n=ye(e,"border-right-width");return e.clientWidth+t+n}function Sn(e){let t=ye(e,"border-top-width"),n=ye(e,"border-bottom-width");return e.clientHeight+t+n}function _e(e,t={}){let n=t.width||Cn(e),r=t.height||Sn(e);return{width:n,height:r}}function Et(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var H=16384;function Ct(e){(e.width>H||e.height>H)&&(e.width>H&&e.height>H?e.width>e.height?(e.height*=H/e.width,e.width=H):(e.width*=H/e.height,e.height=H):e.width>H?(e.height*=H/e.width,e.width=H):(e.width*=H/e.height,e.height=H))}function St(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),o=r.length,i=new Uint8Array(o);for(let a=0;a<o;a+=1)i[a]=r.charCodeAt(a);n(new Blob([i],{type:t.type?t.type:"image/png"}))})}function oe(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function Ln(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function Lt(e,t,n){let r="http://www.w3.org/2000/svg",o=document.createElementNS(r,"svg"),i=document.createElementNS(r,"foreignObject");return o.setAttribute("width",`${t}`),o.setAttribute("height",`${n}`),o.setAttribute("viewBox",`0 0 ${t} ${n}`),i.setAttribute("width","100%"),i.setAttribute("height","100%"),i.setAttribute("x","0"),i.setAttribute("y","0"),i.setAttribute("externalResourcesRequired","true"),o.appendChild(i),i.appendChild(e),Ln(o)}var M=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||M(n,t)};function An(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function Tn(e,t){return we(t).map(n=>{let r=e.getPropertyValue(n),o=e.getPropertyPriority(n);return`${n}: ${r}${o?" !important":""};`}).join(" ")}function Mn(e,t,n,r){let o=`.${e}:${t}`,i=n.cssText?An(n):Tn(n,r);return document.createTextNode(`${o}{${i}}`)}function At(e,t,n,r){let o=window.getComputedStyle(e,n),i=o.getPropertyValue("content");if(i===""||i==="none")return;let a=kt();try{t.className=`${t.className} ${a}`}catch{return}let l=document.createElement("style");l.appendChild(Mn(a,n,o,r)),t.appendChild(l)}function Tt(e,t,n){At(e,t,":before",n),At(e,t,":after",n)}var Mt="application/font-woff",Rt="image/jpeg",Rn={woff:Mt,woff2:Mt,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:Rt,jpeg:Rt,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function Pn(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function ie(e){let t=Pn(e).toLowerCase();return Rn[t]||""}function $n(e){return e.split(/,/)[1]}function ue(e){return e.search(/^(data:)/)!==-1}function qe(e,t){return`data:${t};base64,${e}`}async function We(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let o=await r.blob();return new Promise((i,a)=>{let l=new FileReader;l.onerror=a,l.onloadend=()=>{try{i(n({res:r,result:l.result}))}catch(p){a(p)}},l.readAsDataURL(o)})}var Ne={};function In(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function ae(e,t,n){let r=In(e,t,n.includeQueryParams);if(Ne[r]!=null)return Ne[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let o;try{let i=await We(e,n.fetchRequestInit,({res:a,result:l})=>(t||(t=a.headers.get("Content-Type")||""),$n(l)));o=qe(i,t)}catch(i){o=n.imagePlaceholder||"";let a=`Failed to fetch resource: ${e}`;i&&(a=typeof i=="string"?i:i.message),a&&console.warn(a)}return Ne[r]=o,o}async function Hn(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):oe(t)}async function Dn(e,t){if(e.currentSrc){let i=document.createElement("canvas"),a=i.getContext("2d");i.width=e.clientWidth,i.height=e.clientHeight,a?.drawImage(e,0,0,i.width,i.height);let l=i.toDataURL();return oe(l)}let n=e.poster,r=ie(n),o=await ae(n,r,t);return oe(o)}async function zn(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await he(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function Bn(e,t){return M(e,HTMLCanvasElement)?Hn(e):M(e,HTMLVideoElement)?Dn(e,t):M(e,HTMLIFrameElement)?zn(e,t):e.cloneNode(Pt(e))}var On=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",Pt=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function Fn(e,t,n){var r,o;if(Pt(t))return t;let i=[];return On(e)&&e.assignedNodes?i=_(e.assignedNodes()):M(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?i=_(e.contentDocument.body.childNodes):i=_(((o=e.shadowRoot)!==null&&o!==void 0?o:e).childNodes),i.length===0||M(e,HTMLVideoElement)||await i.reduce((a,l)=>a.then(()=>he(l,n)).then(p=>{p&&t.appendChild(p)}),Promise.resolve()),t}function Un(e,t,n){let r=t.style;if(!r)return;let o=window.getComputedStyle(e);o.cssText?(r.cssText=o.cssText,r.transformOrigin=o.transformOrigin):we(n).forEach(i=>{let a=o.getPropertyValue(i);i==="font-size"&&a.endsWith("px")&&(a=`${Math.floor(parseFloat(a.substring(0,a.length-2)))-.1}px`),M(e,HTMLIFrameElement)&&i==="display"&&a==="inline"&&(a="block"),i==="d"&&t.getAttribute("d")&&(a=`path(${t.getAttribute("d")})`),r.setProperty(i,a,o.getPropertyPriority(i))})}function _n(e,t){M(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),M(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function Nn(e,t){if(M(e,HTMLSelectElement)){let r=Array.from(t.children).find(o=>e.value===o.getAttribute("value"));r&&r.setAttribute("selected","")}}function qn(e,t,n){return M(t,Element)&&(Un(e,t,n),Tt(e,t,n),_n(e,t),Nn(e,t)),t}async function Wn(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let i=0;i<n.length;i++){let l=n[i].getAttribute("xlink:href");if(l){let p=e.querySelector(l),c=document.querySelector(l);!p&&c&&!r[l]&&(r[l]=await he(c,t,!0))}}let o=Object.values(r);if(o.length){let i="http://www.w3.org/1999/xhtml",a=document.createElementNS(i,"svg");a.setAttribute("xmlns",i),a.style.position="absolute",a.style.width="0",a.style.height="0",a.style.overflow="hidden",a.style.display="none";let l=document.createElementNS(i,"defs");a.appendChild(l);for(let p=0;p<o.length;p++)l.appendChild(o[p]);e.appendChild(a)}return e}async function he(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>Bn(r,t)).then(r=>Fn(e,r,t)).then(r=>qn(e,r,t)).then(r=>Wn(r,t))}var $t=/url\((['"]?)([^'"]+?)\1\)/g,jn=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,Vn=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function Xn(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function Gn(e){let t=[];return e.replace($t,(n,r,o)=>(t.push(o),n)),t.filter(n=>!ue(n))}async function Zn(e,t,n,r,o){try{let i=n?wt(t,n):t,a=ie(t),l;if(o){let p=await o(i);l=qe(p,a)}else l=await ae(i,a,r);return e.replace(Xn(t),`$1${l}$3`)}catch{}return e}function Yn(e,{preferredFontFormat:t}){return t?e.replace(Vn,n=>{for(;;){let[r,,o]=jn.exec(n)||[];if(!o)return"";if(o===t)return`src: ${r};`}}):e}function je(e){return e.search($t)!==-1}async function ke(e,t,n){if(!je(e))return e;let r=Yn(e,n);return Gn(r).reduce((i,a)=>i.then(l=>Zn(l,a,t,n)),Promise.resolve(r))}async function se(e,t,n){var r;let o=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(o){let i=await ke(o,null,n);return t.style.setProperty(e,i,t.style.getPropertyPriority(e)),!0}return!1}async function Kn(e,t){await se("background",e,t)||await se("background-image",e,t),await se("mask",e,t)||await se("-webkit-mask",e,t)||await se("mask-image",e,t)||await se("-webkit-mask-image",e,t)}async function Jn(e,t){let n=M(e,HTMLImageElement);if(!(n&&!ue(e.src))&&!(M(e,SVGImageElement)&&!ue(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,o=await ae(r,ie(r),t);await new Promise((i,a)=>{e.onload=i,e.onerror=t.onImageErrorHandler?(...p)=>{try{i(t.onImageErrorHandler(...p))}catch(c){a(c)}}:a;let l=e;l.decode&&(l.decode=i),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=o):e.href.baseVal=o})}async function Qn(e,t){let r=_(e.childNodes).map(o=>Ve(o,t));await Promise.all(r).then(()=>e)}async function Ve(e,t){M(e,Element)&&(await Kn(e,t),await Jn(e,t),await Qn(e,t))}function It(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(o=>{n[o]=r[o]}),e}var Ht={};async function Dt(e){let t=Ht[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},Ht[e]=t,t}async function zt(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,i=(n.match(/url\([^)]+\)/g)||[]).map(async a=>{let l=a.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),We(l,t.fetchRequestInit,({result:p})=>(n=n.replace(a,`url(${p})`),[a,p]))});return Promise.all(i).then(()=>n)}function Bt(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),o=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let p=o.exec(r);if(p===null)break;t.push(p[0])}r=r.replace(o,"");let i=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,a="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(a,"gi");for(;;){let p=i.exec(r);if(p===null){if(p=l.exec(r),p===null)break;i.lastIndex=l.lastIndex}else l.lastIndex=i.lastIndex;t.push(p[0])}return t}async function er(e,t){let n=[],r=[];return e.forEach(o=>{if("cssRules"in o)try{_(o.cssRules||[]).forEach((i,a)=>{if(i.type===CSSRule.IMPORT_RULE){let l=a+1,p=i.href,c=Dt(p).then(h=>zt(h,t)).then(h=>Bt(h).forEach(g=>{try{o.insertRule(g,g.startsWith("@import")?l+=1:o.cssRules.length)}catch(w){console.error("Error inserting rule from remote css",{rule:g,error:w})}})).catch(h=>{console.error("Error loading remote css",h.toString())});r.push(c)}})}catch(i){let a=e.find(l=>l.href==null)||document.styleSheets[0];o.href!=null&&r.push(Dt(o.href).then(l=>zt(l,t)).then(l=>Bt(l).forEach(p=>{a.insertRule(p,a.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",i)}}),Promise.all(r).then(()=>(e.forEach(o=>{if("cssRules"in o)try{_(o.cssRules||[]).forEach(i=>{n.push(i)})}catch(i){console.error(`Error while reading CSS rules from ${o.href}`,i)}}),n))}function tr(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>je(t.style.getPropertyValue("src")))}async function nr(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=_(e.ownerDocument.styleSheets),r=await er(n,t);return tr(r)}function Ot(e){return e.trim().replace(/["']/g,"")}function rr(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(i=>{t.add(Ot(i))}),Array.from(r.children).forEach(i=>{i instanceof HTMLElement&&n(i)})}return n(e),t}async function Ft(e,t){let n=await nr(e,t),r=rr(e);return(await Promise.all(n.filter(i=>r.has(Ot(i.style.fontFamily))).map(i=>{let a=i.parentStyleSheet?i.parentStyleSheet.href:null;return ke(i.cssText,a,t)}))).join(`
`)}async function Ut(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await Ft(e,t);if(n){let r=document.createElement("style"),o=document.createTextNode(n);r.appendChild(o),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function or(e,t={}){let{width:n,height:r}=_e(e,t),o=await he(e,t,!0);return await Ut(o,t),await Ve(o,t),It(o,t),await Lt(o,n,r)}async function ir(e,t={}){let{width:n,height:r}=_e(e,t),o=await or(e,t),i=await oe(o),a=document.createElement("canvas"),l=a.getContext("2d"),p=t.pixelRatio||Et(),c=t.canvasWidth||n,h=t.canvasHeight||r;return a.width=c*p,a.height=h*p,t.skipAutoScale||Ct(a),a.style.width=`${c}`,a.style.height=`${h}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,a.width,a.height)),l.drawImage(i,0,0,a.width,a.height),a}async function _t(e,t={}){let n=await ir(e,t);return await St(n)}var ar="data-builder-hide",Xe={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},Nt=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function qt(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function Ge(e){return e==="video"?Xe.video:e==="image"?Xe.image:Xe.file}function Ee(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function Ce(e=15e3){let t=await Promise.race([_t(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(K)!==null&&r?.hasAttribute?.(K)||r?.hasAttribute?.(ar))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${sr()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function sr(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function le(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}function Se(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},o=p=>{let c=document.elementFromPoint(p.clientX,p.clientY);if(!c||ve(c)||c===document.body||c===document.documentElement){r();return}c!==n&&(r(),n=c,c.classList.add("builder-pin-hover"))},i=p=>{let c=document.elementFromPoint(p.clientX,p.clientY);if(!c||ve(c))return;p.preventDefault(),p.stopPropagation();let h=gt(c);l(),e(h,c)},a=p=>{p.key==="Escape"&&(p.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",o,!0),document.removeEventListener("click",i,!0),document.removeEventListener("keydown",a,!0)}return document.addEventListener("mousemove",o,!0),document.addEventListener("click",i,!0),document.addEventListener("keydown",a,!0),l}function Le(e){let t=xt(e);if(!t.el||t.confidence<bt)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var v={hello:"builder:hello",ready:"builder:ready",url:"builder:url",pinStart:"builder:pin:start",pinDone:"builder:pin:done",pinCancel:"builder:pin:cancel",shot:"builder:shot",shotDone:"builder:shot:done",context:"builder:context",contextDone:"builder:context:done"},lr=200,Wt=100,cr=1e3,dr=512;function jt(e={}){if(window.parent===window)return()=>{};let t=e.locale??"en",n=null,r=null,o=!1,i=null,a=[],l=[],p=[];function c(f){if(n)try{n.win.postMessage(f,n.origin)}catch{}}function h(){c({v:1,type:v.ready,url:location.href,title:document.title})}function g(){c({v:1,type:v.url,url:location.href,title:document.title})}function w(){i===null&&(i=window.setTimeout(()=>{i=null,g()},0))}function A(){let f=pr(a,l,t);c({v:1,type:v.contextDone,...f})}function x(){R(),r=Se((f,$)=>{r=null,$.classList.add("builder-pin-found"),setTimeout(()=>$.classList.remove("builder-pin-found"),3e3),c({v:1,type:v.pinDone,anchor:f}),A()},()=>{r=null,c({v:1,type:v.pinDone,anchor:null})})}function R(){r&&(r(),r=null)}async function E(){if(!o){o=!0;try{let f=await Ce(),$=await Er(f.blob);c({v:1,type:v.shotDone,dataUrl:$}),A()}catch(f){c({v:1,type:v.shotDone,dataUrl:null,error:Ye(String(f?.message||f)).slice(0,300)})}finally{o=!1}}}function T(){if(p.push(hr(f=>Ze(a,lr,f)),fr(f=>Ze(l,Wt,f)),gr(f=>Ze(l,Wt,f)),br(w)),document.readyState!=="complete"){let f=()=>g();window.addEventListener("load",f,{once:!0}),p.push(()=>window.removeEventListener("load",f))}try{e.onActivate?.(n.origin)}catch{}}function k(f){let $=f.data;if(!(!$||$.v!==1||typeof $.type!="string")){if(!n){if($.type!==v.hello||window.parent===window||f.source!==window.parent||!f.origin||f.origin==="null"||$.shellOrigin!==f.origin||e.shellOrigins&&!e.shellOrigins.includes(f.origin))return;n={win:window.parent,origin:f.origin},T(),h();return}if(!(f.source!==n.win||f.origin!==n.origin))switch($.type){case v.hello:h();return;case v.pinStart:x();return;case v.pinCancel:R();return;case v.shot:E();return;case v.context:A();return}}}window.addEventListener("message",k);let L=()=>w();return window.addEventListener("popstate",L),window.addEventListener("hashchange",L),()=>{window.removeEventListener("message",k),window.removeEventListener("popstate",L),window.removeEventListener("hashchange",L),i!==null&&(clearTimeout(i),i=null),R();for(let f of p.splice(0))try{f()}catch{}n=null}}function pr(e,t,n){return{console:e.slice(),network:t.slice(),viewport:{w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio||1},userAgent:navigator.userAgent,locale:n,url:location.href,title:document.title}}function Ze(e,t,n){e.push(n),e.length>t&&e.shift()}var ur=["log","info","warn","error","debug"];function hr(e){let t=new Map;for(let n of ur){let r=console[n];typeof r=="function"&&(t.set(n,r),console[n]=function(...o){try{e({level:n,text:mr(o),ts:Date.now()})}catch{}r.apply(console,o)})}return()=>{for(let[n,r]of t)console[n]=r}}function mr(e){let t=e.map(n=>{if(typeof n=="string")return n;if(n instanceof Error)return n.stack||`${n.name}: ${n.message}`;try{return JSON.stringify(n)??String(n)}catch{return String(n)}});return Ye(t.join(" ").slice(0,cr))}function fr(e){let t=window.fetch;return typeof t!="function"?()=>{}:(window.fetch=function(n,r){let o=Date.now(),i="GET",a="";try{typeof n=="string"?a=n:n instanceof URL?a=n.href:n&&(a=n.url,i=n.method||"GET"),r&&r.method&&(i=r.method)}catch{}let l=(c,h)=>{try{e({method:i.toUpperCase(),url:Vt(a),status:c,ok:h,durationMs:Date.now()-o,ts:o})}catch{}},p=t.call(window,n,r);return p.then(c=>l(c.status,c.ok),()=>l(0,!1)),p},()=>{window.fetch=t})}function gr(e){let t=XMLHttpRequest.prototype,n=t.open,r=t.send,o=new WeakMap;return t.open=function(i,a){try{o.set(this,{method:String(i||"GET").toUpperCase(),url:String(a),started:0})}catch{}return n.apply(this,arguments)},t.send=function(i){let a=o.get(this);if(a){a.started=Date.now();let l=()=>{this.removeEventListener("loadend",l);try{e({method:a.method,url:Vt(a.url),status:this.status,ok:this.status>=200&&this.status<400,durationMs:Date.now()-a.started,ts:a.started})}catch{}};try{this.addEventListener("loadend",l)}catch{}}return r.call(this,i)},()=>{t.open=n,t.send=r}}function Vt(e){let t=e;try{t=new URL(e,location.href).href}catch{}return Ye(t).slice(0,dr)}function br(e){let t=history.pushState,n=history.replaceState;return history.pushState=function(...r){t.apply(this,r),e()},history.replaceState=function(...r){n.apply(this,r),e()},()=>{history.pushState=t,history.replaceState=n}}var Ae="[redacted]",xr=/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/@\s]+):[^@\s]*@/g,vr=/\b(password|passwd|pwd|secret|token|api[_-]?key|auth|authorization|access[_-]?key|private[_-]?key|sslpassword)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&"']+)/gi,yr=/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g,wr=/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,kr=/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;function Ye(e){return e&&(e=e.replace(kr,"[redacted private key]"),e=e.replace(xr,"$1:"+Ae+"@"),e=e.replace(vr,"$1$2"+Ae),e=e.replace(yr,Ae),e=e.replace(wr,Ae),e)}function Er(e){return new Promise((t,n)=>{let r=new FileReader;r.onload=()=>t(String(r.result)),r.onerror=()=>n(new Error("could not encode the screenshot")),r.readAsDataURL(e)})}var Cr={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",cancel:"Cancel",markdownHint:"Markdown supported \u2014 **bold**, `code`, lists.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinAnother:"Pin another",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",ctxAttached:(e,t)=>`Console and network activity from the product page will be attached (${e} console line${e===1?"":"s"}, ${t} request${t===1?"":"s"}).`,ctxOptOut:"Send without console & network activity",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",apps:"Build",appAgents:"Agents",appSkills:"Skills",appIssues:"Issues",appVault:"Vault",appMcp:"MCP",appSources:"Sources",appDocs:"Library",appBrain:"Brain",appChat:"Chat",appTerminal:"Terminal",dir:"ltr"},Sr={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",cancel:"\u0625\u0644\u063A\u0627\u0621",markdownHint:"\u064A\u062F\u0639\u0645 Markdown \u2014 **\u0639\u0631\u064A\u0636**\u060C `\u0634\u064A\u0641\u0631\u0629`\u060C \u0642\u0648\u0627\u0626\u0645.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinAnother:"\u062A\u062D\u062F\u064A\u062F \u0645\u0648\u0642\u0639 \u0622\u062E\u0631",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",ctxAttached:(e,t)=>`\u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642 \u0646\u0634\u0627\u0637 \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0634\u0628\u0643\u0629 \u0645\u0646 \u0635\u0641\u062D\u0629 \u0627\u0644\u0645\u0646\u062A\u062C (${e} \u0633\u0637\u0631\u060C ${t} \u0637\u0644\u0628).`,ctxOptOut:"\u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u062F\u0648\u0646 \u0646\u0634\u0627\u0637 \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0634\u0628\u0643\u0629",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",apps:"\u0627\u0644\u0628\u0646\u0627\u0621",appAgents:"\u0627\u0644\u0648\u0643\u0644\u0627\u0621",appSkills:"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A",appIssues:"\u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",appVault:"\u0627\u0644\u062E\u0632\u0646\u0629",appMcp:"MCP",appSources:"\u0627\u0644\u0645\u0635\u0627\u062F\u0631",appDocs:"\u0627\u0644\u0645\u0643\u062A\u0628\u0629",appBrain:"\u0627\u0644\u062F\u0645\u0627\u063A",appChat:"\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",appTerminal:"\u0627\u0644\u0637\u0631\u0641\u064A\u0629",dir:"rtl"};function Te(e){return e.toLowerCase().startsWith("ar")?Sr:Cr}var Xt="http://www.w3.org/2000/svg",Lr={messageSquare:[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}],["path",{d:"M13 8H7"}],["path",{d:"M17 12H7"}]],x:[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]],plus:[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]],pin:[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{cx:"12",cy:"10",r:"3"}]],paperclip:[["path",{d:"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"}]],camera:[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}],["circle",{cx:"12",cy:"13",r:"3"}]],eye:[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]],arrowRight:[["path",{d:"M5 12h14"}],["path",{d:"m12 5 7 7-7 7"}]],chevronRight:[["path",{d:"m9 18 6-6-6-6"}]],agents:[["path",{d:"M12 8V4H8"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2"}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],skills:[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"}],["path",{d:"M22 10v6"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5"}]],issues:[["rect",{x:"3",y:"5",width:"6",height:"6",rx:"1"}],["path",{d:"m3 17 2 2 4-4"}],["path",{d:"M13 6h8"}],["path",{d:"M13 12h8"}],["path",{d:"M13 18h8"}]],vault:[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 7.9 2.7 2.7"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 10.6 2.7-2.7"}],["circle",{cx:"7.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 16.1 2.7-2.7"}],["circle",{cx:"16.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 13.4 2.7 2.7"}],["circle",{cx:"12",cy:"12",r:"2"}]],sources:[["path",{d:"M4 11a9 9 0 0 1 9 9"}],["path",{d:"M4 4a16 16 0 0 1 16 16"}],["circle",{cx:"5",cy:"19",r:"1"}]],docs:[["rect",{width:"8",height:"18",x:"3",y:"3",rx:"1"}],["path",{d:"M7 3v18"}],["path",{d:"M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"}]],brain:[["path",{d:"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"}],["path",{d:"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"}],["path",{d:"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"}],["path",{d:"M17.599 6.5a3 3 0 0 0 .399-1.375"}],["path",{d:"M6.003 5.125A3 3 0 0 0 6.401 6.5"}],["path",{d:"M3.477 10.896a4 4 0 0 1 .585-.396"}],["path",{d:"M19.938 10.5a4 4 0 0 1 .585.396"}],["path",{d:"M6 18a4 4 0 0 1-1.967-.516"}],["path",{d:"M19.967 17.484A4 4 0 0 1 18 18"}]],chat:[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],mcp:[["path",{d:"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"}],["path",{d:"m2 22 3-3"}],["path",{d:"M7.5 13.5 10 11"}],["path",{d:"M10.5 16.5 13 14"}],["path",{d:"m18 3-4 4h6l-4 4"}]],terminal:[["path",{d:"m7 11 2-2-2-2"}],["path",{d:"M11 13h4"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}]]};function B(e,t=14){let n=document.createElementNS(Xt,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let[r,o]of Lr[e]){let i=document.createElementNS(Xt,r);for(let[a,l]of Object.entries(o))i.setAttribute(a,l);n.appendChild(i)}return n}function W(e,t,n,r=14){e.replaceChildren(),e.appendChild(B(t,r));let o=document.createElement("span");o.textContent=n,e.appendChild(o)}function Re(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let o=n[r],i=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(o);if(i){let h=i[1][0],g=[];for(r++;r<n.length&&!new RegExp(`^\\s*${h}{3,}\\s*$`).test(n[r]);)g.push(n[r]),r++;r++;let w=document.createElement("pre");w.className="md-pre";let A=document.createElement("code");i[2]&&(A.className=`lang-${i[2]}`),A.textContent=g.join(`
`),w.appendChild(A),t.appendChild(w);continue}if(!o.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(o)){t.appendChild(document.createElement("hr")),r++;continue}let a=/^\s*(#{1,6})\s+(.*)$/.exec(o);if(a){let h=Math.min(6,3+a[1].length),g=document.createElement(`h${h}`);g.className="md-h",g.appendChild(Me(a[2])),t.appendChild(g),r++;continue}if(/^\s*>\s?/.test(o)){let h=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)h.push(n[r].replace(/^\s*>\s?/,"")),r++;let g=document.createElement("blockquote");g.className="md-quote",g.appendChild(Re(h.join(`
`))),t.appendChild(g);continue}let l=/^\s*[-*+]\s+/,p=/^\s*\d+[.)]\s+/;if(l.test(o)||p.test(o)){let h=!l.test(o),g=h?p:l,w=document.createElement(h?"ol":"ul");for(w.className="md-list";r<n.length&&g.test(n[r]);){let A=document.createElement("li"),x=n[r].replace(g,"");for(r++;r<n.length&&n[r].trim()&&!g.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)x+=`
`+n[r].trim(),r++;A.appendChild(Me(x)),w.appendChild(A)}t.appendChild(w);continue}let c=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r]);)c.push(n[r]),r++;if(c.length){let h=document.createElement("p");h.className="md-p",h.appendChild(Me(c.join(`
`))),t.appendChild(h)}else r++}return t}var Ar=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function Me(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=Ar.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&Zt(t,n.slice(0,r.index)),r[1]){let o=document.createElement("code");o.className="md-code",o.textContent=r[2].trim(),t.appendChild(o)}else r[3]!==void 0?t.appendChild(Gt(r[4],r[3]||r[4])):r[5]?t.appendChild(Ke("strong","md-strong",r[6])):r[7]?t.appendChild(Ke("del","md-del",r[8])):r[9]?t.appendChild(Ke("em","md-em",r[10])):r[11]&&t.appendChild(Gt(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&Zt(t,n),t}function Ke(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(Me(n)),r}function Gt(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function Zt(e,t){t.split(`
`).forEach((r,o)=>{o&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function Yt(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let o=await r.json();return{id:o.id,number:o.number,title:o.title,body:o.body??"",type:o.type,status:o.status,priority:o.priority,route:o.route??"",pageUrl:o.pageUrl??"",createdAt:o.createdAt??"",pins:o.pins??[],comments:o.comments??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function Kt(e,t,n){let r=Te(e),o=document.createElement("div");o.className="detail hidden";let i=null;async function a(c){o.replaceChildren(S("p","empty",r.loading));try{i=await t.get(c),l()}catch(h){o.replaceChildren(S("p","note err",String(h.message)))}}function l(){if(!i)return;let c=i;o.replaceChildren();let h=S("div","d-head",""),g=Pe("ghost","\u2190 "+r.onThisPage);g.addEventListener("click",n);let w=Pe("ghost","\u2197");w.title=r.report,w.addEventListener("click",()=>window.open(`/issues/${c.number}`,"_blank","noopener")),h.append(g,w),o.appendChild(h);let A=S("div","d-meta","");if(A.append(S("span","num",`#${c.number}`),S("span",`chip ${c.type}`,r[c.type]??c.type),S("span","chip status",c.status.replace("_"," "))),o.append(A,S("h3","d-title",c.title)),c.body){let E=S("div","d-body","");E.appendChild(Re(c.body)),o.appendChild(E)}if(c.pins.length){o.appendChild(S("div","label",r.location));for(let E of c.pins){let T=S("div","d-pin","");T.appendChild(S("span","nm",`<${E.tag??"?"}>${E.name?` \u201C${E.name}\u201D`:""}`));let k=Pe("ghost","");k.appendChild(B("eye",14)),k.title=r.pin,k.addEventListener("click",()=>{let L=Le(E);p(L.found?`Found via ${L.by} (${Math.round(L.confidence*100)}%)`:"The pinned element is not on this page any more.",L.found?"ok":"err")}),T.appendChild(k),o.appendChild(T)}}o.appendChild(S("div","label","Comments")),c.comments.length||o.appendChild(S("p","empty","No comments yet."));for(let E of c.comments){let T=S("div","d-comment",""),k=S("p","who",E.author||"someone");E.kind==="agent"&&k.appendChild(S("span","chip agent","agent"));let L=S("div","txt","");L.appendChild(Re(E.body)),T.append(k,L),o.appendChild(T)}let x=document.createElement("textarea");x.placeholder="Add a comment\u2026",x.rows=3;let R=Pe("primary","Comment");R.addEventListener("click",async()=>{let E=x.value.trim();if(E){R.disabled=!0;try{await t.comment(c.number,E),x.value="",await a(c.number)}catch(T){p(String(T.message),"err")}finally{R.disabled=!1}}}),o.append(x,R)}function p(c,h){let g=S("p",`note ${h}`,c);o.appendChild(g),setTimeout(()=>g.remove(),4e3)}return{el:o,load:a,destroy:()=>o.remove()}}function S(e,t,n){let r=document.createElement(e);return r.className=t,n&&(r.textContent=n),r}function Pe(e,t){let n=document.createElement("button");return n.type="button",n.className=e,n.textContent=t,n}var Jt=`
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
`,Qt=`
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

`;function en(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let o=await r.json().catch(()=>null);return Array.isArray(o?.issues)?o.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??"",context:n.context??void 0}));for(let a of n.attachments)r.append("attachments",a.blob,a.name),r.append("attachment_kinds",a.kind);let o=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!o.ok){let a=await o.text().catch(()=>"");throw new Error(a||`submit failed (${o.status})`)}let i=await o.json();return{id:String(i.id??""),number:Number(i.number??0)}}}}var nn="builder.fab.position",Tr=["bug","feature","question","discussion"],tn=8;function Mr(e={}){let t=Te(e.locale??document.documentElement.lang??"en"),n=e.transport??en(e.apiBase),r=e.locale??"en",o=document.createElement("div");o.setAttribute(K,""),o.setAttribute("dir",t.dir),e.theme&&o.setAttribute("data-theme",e.theme),document.body.appendChild(o);let i=o.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=Jt+(e.accent?`:host{--accent:${Ir(e.accent)}}`:""),i.appendChild(a);let l=document.createElement("style");l.setAttribute(K,""),l.textContent=Qt,document.head.appendChild(l);let p=[],c=[],h=[],g="bug",w=!1,A=!1,x=null,R=null,E=!1,T=null,k=null,L=!1,f=()=>{},$=document.createElement("div");$.innerHTML=`
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
            <input type="file" class="filein hidden" multiple accept="${Nt}">

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

`,i.appendChild($);let u=s=>i.querySelector(s),I=u(".fab"),P=u(".panel"),Je=u(".form"),Qe=u(".listing"),J=u(".modal"),D=u(".modal-card"),Q=u(".modal-head"),$e=u(".modal-x"),et=u(".cancel"),me=u(".rows"),Ie=u(".pills"),He=u(".note"),tt=u(".files"),fe=u(".filein"),nt=u(".count"),rn=u(".appgrid"),ge=u('input[name="title"]'),rt=u('textarea[name="body"]'),ot=u('input[name="url"]'),j=u(".pin");if(e.framedHost){let s=C=>window.postMessage({v:1,type:C},location.origin),d=!1,m="The product has not loaded the builder script, so there is nothing inside the frame to read the page with. Add the script tag to enable pinning and screenshots.",y=u(".pin"),z=u(".shot");for(let C of[y,z])C.disabled=!0,C.title=m,C.setAttribute("aria-disabled","true");let N=u(".ctxrow"),q=u(".ctx-note");u(".ctx-opt-txt").textContent=t.ctxOptOut;let X=()=>{let C=!!k&&(k.console.length>0||k.network.length>0);N.classList.toggle("hidden",!C),k&&(q.textContent=t.ctxAttached(k.console.length,k.network.length))},ht=C=>{typeof C.url!="string"||!C.url||(T={url:C.url,title:typeof C.title=="string"?C.title:""},ot.value=C.url,u(".brand-sub").textContent=le(C.url))},mt=()=>{L=!1,w?J.dataset.open="true":P.dataset.open="true",ne()};f=()=>{s(v.pinCancel),mt()},window.addEventListener("message",C=>{if(C.source!==window||C.origin!==location.origin)return;let b=C.data;if(!(!b||b.v!==1||typeof b.type!="string"))switch(b.type){case v.ready:d=!0;for(let U of[y,z])U.disabled=!1,U.removeAttribute("aria-disabled"),U.title="";ht(b),s(v.context),Y();return;case v.url:ht(b),Y();return;case v.pinDone:{if(!L)return;let U=b.anchor;U&&typeof U=="object"&&c.length<tn&&(c=[...c,U]),mt();return}case v.shotDone:{if(z.disabled=!1,typeof b.dataUrl=="string"&&b.dataUrl.startsWith("data:")){let U=Rr(b.dataUrl);U&&U.size<=Ge("image")?(h.push(U),ce(),F("")):F(t.failed,"err")}else F(typeof b.error=="string"&&b.error?b.error:t.failed,"err");return}case v.contextDone:{k={console:Array.isArray(b.console)?b.console:[],network:Array.isArray(b.network)?b.network:[],viewport:b.viewport&&typeof b.viewport=="object"?b.viewport:{w:0,h:0,dpr:1},userAgent:typeof b.userAgent=="string"?b.userAgent:"",locale:typeof b.locale=="string"?b.locale:"",url:typeof b.url=="string"?b.url:"",title:typeof b.title=="string"?b.title:""},X();return}}}),y.addEventListener("click",()=>{if(d){if(L){f();return}L=!0,P.dataset.open="false",J.dataset.open="false",y.setAttribute("aria-pressed","true"),y.textContent=t.pinning,s(v.pinStart)}}),z.addEventListener("click",()=>{d&&(z.disabled=!0,s(v.shot))}),u(".report").addEventListener("click",()=>{d&&s(v.context)})}let De=u(".clearpin"),ze=u(".pin-preview"),ee=u(".send"),be=new WeakMap;function on(s){let d=be.get(s);return d||(d=URL.createObjectURL(s.blob),be.set(s,d)),d}function Be(s){let d=be.get(s);d&&(URL.revokeObjectURL(d),be.delete(s))}u(".fab-label").textContent=t.fab,u("h2").textContent=t.title,P.setAttribute("aria-label",t.title),u(".brand-ico").replaceChildren(B("messageSquare",16)),u(".brand-sub").textContent=le(),u(".fab-ico").replaceChildren(B("messageSquare",14)),u(".x").replaceChildren(B("x",16)),u(".x").setAttribute("aria-label",t.close),u(".intro").textContent=t.intro,W(u(".report"),"plus",t.report,15),u(".lbl-type").textContent=t.type,u(".lbl-title").textContent=t.titleLabel,u(".lbl-details").textContent=t.details,u(".lbl-url").textContent=t.pageUrl,u(".lbl-loc").textContent=t.location,u(".lbl-att").textContent=t.attachments,u(".lbl-page").textContent=t.onThisPage,W(u(".board-link"),"arrowRight",t.openBoard),u(".lbl-apps").textContent=t.apps,u(".modal-title").textContent=t.reportTitle,$e.setAttribute("aria-label",t.close),$e.appendChild(B("x",16)),J.setAttribute("aria-label",t.reportTitle),et.textContent=t.cancel,u(".lbl-md").textContent=t.markdownHint,ge.placeholder=t.titlePlaceholder,rt.placeholder=t.detailsPlaceholder,W(j,"pin",t.pin),W(De,"x",t.clear),W(u(".addfile"),"paperclip",t.addFile),W(u(".shot"),"camera",t.screenshot),ee.textContent=t.submit;for(let s of Tr){let d=document.createElement("button");d.type="button",d.className="pill",d.dataset.type=s,d.textContent=t[s],d.setAttribute("aria-pressed",String(s===g)),d.addEventListener("click",()=>{g=s,Ie.querySelectorAll(".pill").forEach(m=>m.setAttribute("aria-pressed",String(m.dataset.type===s)))}),Ie.appendChild(d)}let an=4,O=null,Oe=(s,d)=>{let m=Math.max(8,Math.min(s,window.innerWidth-80)),y=Math.max(8,Math.min(d,window.innerHeight-48));I.style.insetInlineEnd=`${m}px`,I.style.insetBlockEnd=`${y}px`},it=Pr();Oe(it?.right??e.position?.right??24,it?.bottom??e.position?.bottom??24),I.addEventListener("pointerdown",s=>{if(s.button!==0)return;let d=I.getBoundingClientRect();O={x:s.clientX,y:s.clientY,ox:window.innerWidth-d.right,oy:window.innerHeight-d.bottom,moved:!1},I.setPointerCapture(s.pointerId)}),I.addEventListener("pointermove",s=>{if(!O)return;let d=s.clientX-O.x,m=s.clientY-O.y;!O.moved&&Math.hypot(d,m)<an||(O.moved=!0,Oe(O.ox-d,O.oy-m))}),I.addEventListener("pointerup",s=>{if(!O)return;let d=O.moved;if(O=null,I.releasePointerCapture(s.pointerId),d){let m=I.getBoundingClientRect();$r(window.innerWidth-m.right,window.innerHeight-m.bottom);return}at()}),I.addEventListener("keydown",s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),at())}),window.addEventListener("resize",()=>{let s=I.getBoundingClientRect();Oe(window.innerWidth-s.right,window.innerHeight-s.bottom)});function at(){P.dataset.open==="true"?V():st()}function st(){E||(P.dataset.open="true",I.setAttribute("aria-expanded","true"),ot.value=T?.url??location.href,u(".brand-sub").textContent=le(T?.url),Y())}function V(){P.dataset.open="false",P.dataset.detail="false",I.setAttribute("aria-expanded","false"),Z(!1),x?.(),x=null}let sn=[{key:"agents",path:"/agents",color:"#8b5cf6",label:t.appAgents},{key:"skills",path:"/skills",color:"#06b6d4",label:t.appSkills},{key:"issues",path:"/issues",color:"#f59e0b",label:t.appIssues},{key:"vault",path:"/vault",color:"#10b981",label:t.appVault},{key:"sources",path:"/sources",color:"#3b82f6",label:t.appSources},{key:"docs",path:"/library",color:"#f43f5e",label:t.appDocs},{key:"brain",path:"/brain",color:"#a855f7",label:t.appBrain},{key:"chat",path:"/chat",color:"#14b8a6",label:t.appChat},{key:"mcp",path:"/mcp",color:"#ec4899",label:t.appMcp},{key:"terminal",path:"/terminal",color:"#64748b",label:t.appTerminal}];function lt(){let s=(e.apiBase??"").trim();if(!s)return"";try{return new URL(s,location.href).origin}catch{return""}}let ln=(s,d)=>`${lt()}${s}${d?"?embed=1":""}`;for(let s of sn){let d=document.createElement("button");d.type="button",d.className="app",d.dataset.app=s.key;let m=document.createElement("span");m.className="app-ico",m.style.background=s.color,m.appendChild(B(s.key,18));let y=document.createElement("span");y.textContent=s.label,d.append(m,y),d.addEventListener("click",()=>cn(s)),rn.appendChild(d)}function cn(s){let d=lt(),m=ln(s.path,!0);if(d&&d!==location.origin){window.open(m,"_blank","noopener"),V();return}try{sessionStorage.setItem("builder:standalone","1"),sessionStorage.setItem("builder:standalone:return",location.href)}catch{}V(),location.assign(m)}let te=null;Q.addEventListener("pointerdown",s=>{if(s.target.closest(".modal-x"))return;let d=D.getBoundingClientRect();D.style.position="fixed",D.style.margin="0",D.style.left=`${d.left}px`,D.style.top=`${d.top}px`,te={dx:s.clientX-d.left,dy:s.clientY-d.top},Q.setPointerCapture(s.pointerId)}),Q.addEventListener("pointermove",s=>{if(!te)return;let d=D.getBoundingClientRect(),m=Math.min(Math.max(s.clientX-te.dx,8-d.width+80),innerWidth-80),y=Math.min(Math.max(s.clientY-te.dy,8),innerHeight-44);D.style.left=`${m}px`,D.style.top=`${y}px`});let ct=s=>{if(te){te=null;try{Q.releasePointerCapture(s.pointerId)}catch{}}};Q.addEventListener("pointerup",ct),Q.addEventListener("pointercancel",ct);function dn(){D.style.position="",D.style.left="",D.style.top="",D.style.margin=""}$e.addEventListener("click",()=>Z(!1)),et.addEventListener("click",()=>Z(!1)),document.addEventListener("keydown",s=>{if(s.key==="Escape"){if(L){f();return}w&&!x&&Z(!1)}}),u(".x").addEventListener("click",V),i.addEventListener("keydown",s=>{s.key==="Escape"&&!x&&V()});function dt(s){P.dataset.open!=="true"||x||s.composedPath().includes(o)||V()}document.addEventListener("click",dt,!0);function Z(s){w=s,J.dataset.open=s?"true":"false",s?(dn(),setTimeout(()=>ge.focus(),30)):(pn(),x?.(),x=null)}u(".report").addEventListener("click",()=>Z(!0));function pn(){Je.reset(),c=[],h.forEach(Be),h=[],g="bug",Ie.querySelectorAll(".pill").forEach(s=>s.setAttribute("aria-pressed",String(s.dataset.type==="bug"))),ne(),ce(),F("")}function F(s,d=""){He.textContent=s,He.className=`note ${d}`.trim(),He.classList.toggle("hidden",!s)}e.framedHost||j.addEventListener("click",()=>{if(x){x(),x=null,j.setAttribute("aria-pressed","false"),W(j,"pin",t.pin);return}P.dataset.open="false",J.dataset.open="false",j.setAttribute("aria-pressed","true"),j.textContent=t.pinning;let s=()=>{w?J.dataset.open="true":P.dataset.open="true"};x=Se((d,m)=>{c.length<tn&&(c=[...c,d]),x=null,s(),ne(),m.classList.add("builder-pin-found"),setTimeout(()=>m.classList.remove("builder-pin-found"),3e3)},()=>{x=null,s(),ne()})}),De.addEventListener("click",()=>{c=[],ne()});function ne(){let s=c.length>0;j.setAttribute("aria-pressed",String(s)),W(j,"pin",s?t.pinAnother:t.pin),De.classList.toggle("hidden",!s),ze.classList.toggle("hidden",!s),ze.textContent="",c.forEach((d,m)=>{let y=document.createElement("div");y.className="pinrow";let z=document.createElement("span");z.className="pinnum",z.textContent=String(m+1);let N=d.name||d.hint||"",q=document.createElement("span");q.className="pintxt",q.textContent=`<${d.tag??"?"}>${N?` \u201C${N}\u201D`:""}`;let X=document.createElement("button");X.type="button",X.className="pindel",X.setAttribute("aria-label",`${t.clear} ${m+1}`),X.appendChild(B("x",12)),X.addEventListener("click",()=>{c.splice(m,1),ne()}),y.append(z,q,X),ze.appendChild(y)})}u(".addfile").addEventListener("click",()=>fe.click()),fe.addEventListener("change",()=>{for(let s of Array.from(fe.files??[]))un(s);fe.value=""});function un(s){let d=qt(s.type),m=Ge(d);if(s.size>m){F(`${s.name} is ${Ee(s.size)} \u2014 the limit is ${Ee(m)}.`,"err");return}h.push({name:s.name,mime:s.type,size:s.size,kind:d,blob:s}),ce(),F("")}e.framedHost||u(".shot").addEventListener("click",async()=>{let s=u(".shot");s.disabled=!0;let d=P.dataset.open;P.dataset.open="false",o.style.visibility="hidden";try{await new Promise(m=>setTimeout(m,120)),h.push(await Ce()),ce(),F("")}catch(m){F(String(m.message||m),"err")}finally{o.style.visibility="",P.dataset.open=d??"true",s.disabled=!1}});function ce(){tt.replaceChildren(),h.forEach((s,d)=>{let m=document.createElement("div");if(m.className="file",s.kind==="screenshot"||s.kind==="image"){let q=document.createElement("img");q.className="thumb",q.src=on(s),q.alt="",m.appendChild(q)}let y=document.createElement("span");y.className="nm",y.textContent=s.name;let z=document.createElement("span");z.textContent=Ee(s.size);let N=document.createElement("button");N.type="button",N.replaceChildren(B("x",12)),N.setAttribute("aria-label",t.clear),N.addEventListener("click",()=>{Be(s),h.splice(d,1),ce()}),m.append(y,z,N),tt.appendChild(m)})}async function pt(){if(A)return;let s=ge.value.trim();if(!s){F(t.titleRequired,"err"),ge.focus();return}A=!0,ee.disabled=!0,ee.textContent=t.submitting;try{let d=u(".ctx-optout"),m=await n.create({type:g,title:s,body:rt.value,route:le(T?.url),pageUrl:T?.url??location.href,locale:r,pins:c,attachments:h,context:k&&!d?.checked?k:void 0});F(t.created(m.number),"ok"),e.onCreated?.(m),setTimeout(()=>{Z(!1),Y()},900)}catch(d){F(String(d.message||t.failed),"err")}finally{A=!1,ee.disabled=!1,ee.textContent=t.submit}}ee.addEventListener("click",pt),Je.addEventListener("submit",s=>{s.preventDefault(),pt()});async function Y(){if(!w){me.replaceChildren(G("div","empty",t.loading));try{p=await n.listByRoute(le(T?.url))}catch{p=[]}if(nt.textContent=p.length>9?"9+":String(p.length),nt.classList.toggle("hidden",p.length===0),u(".lbl-page").textContent=p.length?t.issueCount(p.length):t.onThisPage,me.replaceChildren(),!p.length){me.appendChild(G("div","empty",t.none));return}for(let s of p){let d=document.createElement("button");if(d.type="button",d.className="row",d.append(G("span","num",`#${s.number}`),G("span",`chip ${s.type}`,t[s.type])),d.appendChild(G("span","t",s.title)),s.busy){let y=G("span","agent-tag","");y.appendChild(G("span","spin","")),y.appendChild(G("span","who",s.agent||t.agentWorking)),y.setAttribute("title",s.agent?t.agentWorkingBy(s.agent):t.agentWorking),d.appendChild(y)}let m=B("chevronRight",14);m.classList.add("go"),d.appendChild(m),d.addEventListener("click",()=>void hn(s.number)),me.appendChild(d)}}}async function hn(s){R||(R=Kt(r,Yt(e.apiBase),()=>{R?.el.classList.add("hidden"),Qe.classList.remove("hidden"),u(".report").classList.remove("hidden"),u(".apps").classList.remove("hidden"),P.dataset.detail="false",Y()}),u(".body").appendChild(R.el)),Qe.classList.add("hidden"),u(".report").classList.add("hidden"),u(".apps").classList.add("hidden"),Z(!1),R.el.classList.remove("hidden"),P.dataset.detail="true",await R.load(s)}let ut=null;!e.framedHost&&e.bridge!==!1&&(ut=jt({locale:r,shellOrigins:e.shellOrigins,onActivate:()=>{E=!0,x?.(),x=null,V(),o.style.display="none"}}));let mn={open:st,close:V,refresh:()=>void Y(),destroy(){ut?.(),x?.(),h.forEach(Be),document.removeEventListener("click",dt,!0),o.remove(),l.remove()}};return Y(),mn}function Rr(e){try{let t=e.indexOf(",");if(t<0)return null;let n=/^data:([^;,]+)/.exec(e.slice(0,t))?.[1]||"image/png",r=atob(e.slice(t+1)),o=new Uint8Array(r.length);for(let c=0;c<r.length;c++)o[c]=r.charCodeAt(c);let i=new Blob([o],{type:n}),a=new Date,l=c=>String(c).padStart(2,"0");return{name:`screenshot-${`${a.getFullYear()}${l(a.getMonth()+1)}${l(a.getDate())}-${l(a.getHours())}${l(a.getMinutes())}${l(a.getSeconds())}`}.png`,mime:n,size:i.size,kind:"screenshot",blob:i}}catch{return null}}function G(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function Pr(){try{let e=localStorage.getItem(nn);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function $r(e,t){try{localStorage.setItem(nn,JSON.stringify({right:e,bottom:t}))}catch{}}function Ir(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return yn(Hr);})();
