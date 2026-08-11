"use strict";var BuilderIssues=(()=>{var Ye=Object.defineProperty;var Rn=Object.getOwnPropertyDescriptor;var Pn=Object.getOwnPropertyNames;var $n=Object.prototype.hasOwnProperty;var Hn=(e,t)=>{for(var n in t)Ye(e,n,{get:t[n],enumerable:!0})},In=(e,t,n,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of Pn(t))!$n.call(e,a)&&a!==n&&Ye(e,a,{get:()=>t[a],enumerable:!(r=Rn(t,a))||r.enumerable});return e};var Dn=e=>In(Ye({},"__esModule",{value:!0}),e);var Qr={};Hn(Qr,{BRIDGE_MSG:()=>S,hasIcon:()=>qe,highlightPin:()=>je,icon:()=>M,mount:()=>Gr});var ie="data-builder-sdk";function Ie(e){return!!e?.closest?.(`[${ie}]`)}function Lt(e){let t=e.getBoundingClientRect(),n=window.innerWidth||1,r=window.innerHeight||1,a={tag:e.tagName.toLowerCase(),hint:Ee(e),css:Bn(e),rect:{x:t.left/n,y:t.top/r,w:t.width/n,h:t.height/r},scrollY:window.scrollY,viewport:{w:n,h:r,dpr:window.devicePixelRatio||1},href:location.href.slice(0,2048),verified:[]},o=e.getAttribute("data-testid")??e.getAttribute("data-test-id");o&&(a.testid=o),e.id&&!Mt(e.id)&&(a.domId=e.id);let i=e.getAttribute("role")??On(e);i&&(a.role=i);let l=Rt(e);l&&(a.name=l);for(let[c,f]of zn(a))try{let y=document.querySelectorAll(f);y.length===1&&y[0]===e&&a.verified.push(c)}catch{}return a}function zn(e){let t=[];return e.testid&&t.push(["testid",`[data-testid="${Ce(e.testid)}"]`]),e.domId&&t.push(["domId",`#${Ce(e.domId)}`]),e.css&&t.push(["css",e.css]),t}var St=.5;function Tt(e){if(e.testid){let t=He(`[data-testid="${Ce(e.testid)}"]`);if(t.length===1)return{el:t[0],by:"testid",confidence:1};if(t.length>1){let n=At(t,e);if(n)return{el:n,by:"testid+geometry",confidence:.8}}}if(e.domId){let t=document.getElementById(e.domId);if(t)return{el:t,by:"id",confidence:.9}}if(e.role&&e.name){let t=He(`[role="${Ce(e.role)}"]`).filter(n=>Rt(n)===e.name);if(t.length===1)return{el:t[0],by:"role+name",confidence:.85};if(t.length>1){let n=At(t,e);if(n)return{el:n,by:"role+name+geometry",confidence:.65}}}if(e.css){let t=He(e.css);if(t.length===1){let n=t[0],r=!e.hint||Je(Ee(n),e.hint);return{el:n,by:"css",confidence:r?.6:.35}}}if(e.hint){let t=He(e.tag||"*").filter(n=>Je(Ee(n),e.hint));if(t.length===1)return{el:t[0],by:"text",confidence:.45}}return{el:null,by:"none",confidence:0}}function At(e,t){if(!t.rect)return null;let n=window.innerWidth||1,r=window.innerHeight||1,a=null,o=1/0;for(let i of e){let l=i.getBoundingClientRect(),c=l.left/n-t.rect.x,f=l.top/r-t.rect.y,y=Math.hypot(c,f);t.hint&&Je(Ee(i),t.hint)&&(y-=.5),y<o&&([a,o]=[i,y])}return a}function He(e){try{return Array.from(document.querySelectorAll(e)).filter(t=>!Ie(t))}catch{return[]}}function Bn(e){let t=[],n=e;for(let r=0;n&&r<6&&n!==document.body;r++){if(n.id&&!Mt(n.id)){t.unshift(`#${Ce(n.id)}`);break}let a=n.tagName.toLowerCase(),o=n.parentElement;if(!o){t.unshift(a);break}let i=Array.from(o.children).filter(l=>l.tagName===n.tagName);t.unshift(i.length>1?`${a}:nth-of-type(${i.indexOf(n)+1})`:a),n=o}return t.join(" > ").slice(0,512)}function Mt(e){return/^[:#]|^(mui|radix|headlessui|react|ember)[-:]?\d|\d{4,}$/i.test(e)}function Ee(e){return(e.textContent??"").replace(/\s+/g," ").trim().slice(0,120)}function Je(e,t){if(!e||!t)return!1;let n=e.toLowerCase(),r=t.toLowerCase();return n===r||n.includes(r)||r.includes(n)}function Rt(e){return((e.getAttribute("aria-label")??e.getAttribute("title")??e.placeholder??"")||Ee(e)).slice(0,80)}function On(e){let t=e.tagName.toLowerCase();return t==="button"?"button":t==="a"&&e.hasAttribute("href")?"link":t==="input"?e.type==="checkbox"?"checkbox":"textbox":t==="textarea"?"textbox":t==="select"?"combobox":/^h[1-6]$/.test(t)?"heading":""}function Ce(e){return(window.CSS?.escape??(t=>t.replace(/["\\\]]/g,"\\$&")))(e)}function Pt(e,t){if(e.match(/^[a-z]+:\/\//i))return e;if(e.match(/^\/\//))return window.location.protocol+e;if(e.match(/^[a-z]+:/i))return e;let n=document.implementation.createHTMLDocument(),r=n.createElement("base"),a=n.createElement("a");return n.head.appendChild(r),n.body.appendChild(a),t&&(r.href=t),a.href=e,a.href}var $t=(()=>{let e=0,t=()=>`0000${(Math.random()*36**4<<0).toString(36)}`.slice(-4);return()=>(e+=1,`u${t()}${e}`)})();function K(e){let t=[];for(let n=0,r=e.length;n<r;n++)t.push(e[n]);return t}var ue=null;function ze(e={}){return ue||(e.includeStyleProperties?(ue=e.includeStyleProperties,ue):(ue=K(window.getComputedStyle(document.documentElement)),ue))}function De(e,t){let r=(e.ownerDocument.defaultView||window).getComputedStyle(e).getPropertyValue(t);return r?parseFloat(r.replace("px","")):0}function Fn(e){let t=De(e,"border-left-width"),n=De(e,"border-right-width");return e.clientWidth+t+n}function Nn(e){let t=De(e,"border-top-width"),n=De(e,"border-bottom-width");return e.clientHeight+t+n}function Qe(e,t={}){let n=t.width||Fn(e),r=t.height||Nn(e);return{width:n,height:r}}function Ht(){let e,t;try{t=process}catch{}let n=t&&t.env?t.env.devicePixelRatio:null;return n&&(e=parseInt(n,10),Number.isNaN(e)&&(e=1)),e||window.devicePixelRatio||1}var W=16384;function It(e){(e.width>W||e.height>W)&&(e.width>W&&e.height>W?e.width>e.height?(e.height*=W/e.width,e.width=W):(e.width*=W/e.height,e.height=W):e.width>W?(e.height*=W/e.width,e.width=W):(e.width*=W/e.height,e.height=W))}function Dt(e,t={}){return e.toBlob?new Promise(n=>{e.toBlob(n,t.type?t.type:"image/png",t.quality?t.quality:1)}):new Promise(n=>{let r=window.atob(e.toDataURL(t.type?t.type:void 0,t.quality?t.quality:void 0).split(",")[1]),a=r.length,o=new Uint8Array(a);for(let i=0;i<a;i+=1)o[i]=r.charCodeAt(i);n(new Blob([o],{type:t.type?t.type:"image/png"}))})}function he(e){return new Promise((t,n)=>{let r=new Image;r.onload=()=>{r.decode().then(()=>{requestAnimationFrame(()=>t(r))})},r.onerror=n,r.crossOrigin="anonymous",r.decoding="async",r.src=e})}async function jn(e){return Promise.resolve().then(()=>new XMLSerializer().serializeToString(e)).then(encodeURIComponent).then(t=>`data:image/svg+xml;charset=utf-8,${t}`)}async function zt(e,t,n){let r="http://www.w3.org/2000/svg",a=document.createElementNS(r,"svg"),o=document.createElementNS(r,"foreignObject");return a.setAttribute("width",`${t}`),a.setAttribute("height",`${n}`),a.setAttribute("viewBox",`0 0 ${t} ${n}`),o.setAttribute("width","100%"),o.setAttribute("height","100%"),o.setAttribute("x","0"),o.setAttribute("y","0"),o.setAttribute("externalResourcesRequired","true"),a.appendChild(o),o.appendChild(e),jn(a)}var j=(e,t)=>{if(e instanceof t)return!0;let n=Object.getPrototypeOf(e);return n===null?!1:n.constructor.name===t.name||j(n,t)};function Un(e){let t=e.getPropertyValue("content");return`${e.cssText} content: '${t.replace(/'|"/g,"")}';`}function _n(e,t){return ze(t).map(n=>{let r=e.getPropertyValue(n),a=e.getPropertyPriority(n);return`${n}: ${r}${a?" !important":""};`}).join(" ")}function qn(e,t,n,r){let a=`.${e}:${t}`,o=n.cssText?Un(n):_n(n,r);return document.createTextNode(`${a}{${o}}`)}function Bt(e,t,n,r){let a=window.getComputedStyle(e,n),o=a.getPropertyValue("content");if(o===""||o==="none")return;let i=$t();try{t.className=`${t.className} ${i}`}catch{return}let l=document.createElement("style");l.appendChild(qn(i,n,a,r)),t.appendChild(l)}function Ot(e,t,n){Bt(e,t,":before",n),Bt(e,t,":after",n)}var Ft="application/font-woff",Nt="image/jpeg",Wn={woff:Ft,woff2:Ft,ttf:"application/font-truetype",eot:"application/vnd.ms-fontobject",png:"image/png",jpg:Nt,jpeg:Nt,gif:"image/gif",tiff:"image/tiff",svg:"image/svg+xml",webp:"image/webp"};function Vn(e){let t=/\.([^./]*?)$/g.exec(e);return t?t[1]:""}function me(e){let t=Vn(e).toLowerCase();return Wn[t]||""}function Xn(e){return e.split(/,/)[1]}function Ae(e){return e.search(/^(data:)/)!==-1}function tt(e,t){return`data:${t};base64,${e}`}async function nt(e,t,n){let r=await fetch(e,t);if(r.status===404)throw new Error(`Resource "${r.url}" not found`);let a=await r.blob();return new Promise((o,i)=>{let l=new FileReader;l.onerror=i,l.onloadend=()=>{try{o(n({res:r,result:l.result}))}catch(c){i(c)}},l.readAsDataURL(a)})}var et={};function Gn(e,t,n){let r=e.replace(/\?.*/,"");return n&&(r=e),/ttf|otf|eot|woff2?/i.test(r)&&(r=r.replace(/.*\//,"")),t?`[${t}]${r}`:r}async function fe(e,t,n){let r=Gn(e,t,n.includeQueryParams);if(et[r]!=null)return et[r];n.cacheBust&&(e+=(/\?/.test(e)?"&":"?")+new Date().getTime());let a;try{let o=await nt(e,n.fetchRequestInit,({res:i,result:l})=>(t||(t=i.headers.get("Content-Type")||""),Xn(l)));a=tt(o,t)}catch(o){a=n.imagePlaceholder||"";let i=`Failed to fetch resource: ${e}`;o&&(i=typeof o=="string"?o:o.message),i&&console.warn(i)}return et[r]=a,a}async function Zn(e){let t=e.toDataURL();return t==="data:,"?e.cloneNode(!1):he(t)}async function Kn(e,t){if(e.currentSrc){let o=document.createElement("canvas"),i=o.getContext("2d");o.width=e.clientWidth,o.height=e.clientHeight,i?.drawImage(e,0,0,o.width,o.height);let l=o.toDataURL();return he(l)}let n=e.poster,r=me(n),a=await fe(n,r,t);return he(a)}async function Yn(e,t){var n;try{if(!((n=e?.contentDocument)===null||n===void 0)&&n.body)return await Le(e.contentDocument.body,t,!0)}catch{}return e.cloneNode(!1)}async function Jn(e,t){return j(e,HTMLCanvasElement)?Zn(e):j(e,HTMLVideoElement)?Kn(e,t):j(e,HTMLIFrameElement)?Yn(e,t):e.cloneNode(jt(e))}var Qn=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SLOT",jt=e=>e.tagName!=null&&e.tagName.toUpperCase()==="SVG";async function er(e,t,n){var r,a;if(jt(t))return t;let o=[];return Qn(e)&&e.assignedNodes?o=K(e.assignedNodes()):j(e,HTMLIFrameElement)&&(!((r=e.contentDocument)===null||r===void 0)&&r.body)?o=K(e.contentDocument.body.childNodes):o=K(((a=e.shadowRoot)!==null&&a!==void 0?a:e).childNodes),o.length===0||j(e,HTMLVideoElement)||await o.reduce((i,l)=>i.then(()=>Le(l,n)).then(c=>{c&&t.appendChild(c)}),Promise.resolve()),t}function tr(e,t,n){let r=t.style;if(!r)return;let a=window.getComputedStyle(e);a.cssText?(r.cssText=a.cssText,r.transformOrigin=a.transformOrigin):ze(n).forEach(o=>{let i=a.getPropertyValue(o);o==="font-size"&&i.endsWith("px")&&(i=`${Math.floor(parseFloat(i.substring(0,i.length-2)))-.1}px`),j(e,HTMLIFrameElement)&&o==="display"&&i==="inline"&&(i="block"),o==="d"&&t.getAttribute("d")&&(i=`path(${t.getAttribute("d")})`),r.setProperty(o,i,a.getPropertyPriority(o))})}function nr(e,t){j(e,HTMLTextAreaElement)&&(t.innerHTML=e.value),j(e,HTMLInputElement)&&t.setAttribute("value",e.value)}function rr(e,t){if(j(e,HTMLSelectElement)){let r=Array.from(t.children).find(a=>e.value===a.getAttribute("value"));r&&r.setAttribute("selected","")}}function ar(e,t,n){return j(t,Element)&&(tr(e,t,n),Ot(e,t,n),nr(e,t),rr(e,t)),t}async function or(e,t){let n=e.querySelectorAll?e.querySelectorAll("use"):[];if(n.length===0)return e;let r={};for(let o=0;o<n.length;o++){let l=n[o].getAttribute("xlink:href");if(l){let c=e.querySelector(l),f=document.querySelector(l);!c&&f&&!r[l]&&(r[l]=await Le(f,t,!0))}}let a=Object.values(r);if(a.length){let o="http://www.w3.org/1999/xhtml",i=document.createElementNS(o,"svg");i.setAttribute("xmlns",o),i.style.position="absolute",i.style.width="0",i.style.height="0",i.style.overflow="hidden",i.style.display="none";let l=document.createElementNS(o,"defs");i.appendChild(l);for(let c=0;c<a.length;c++)l.appendChild(a[c]);e.appendChild(i)}return e}async function Le(e,t,n){return!n&&t.filter&&!t.filter(e)?null:Promise.resolve(e).then(r=>Jn(r,t)).then(r=>er(e,r,t)).then(r=>ar(e,r,t)).then(r=>or(r,t))}var Ut=/url\((['"]?)([^'"]+?)\1\)/g,ir=/url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g,sr=/src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;function lr(e){let t=e.replace(/([.*+?^${}()|\[\]\/\\])/g,"\\$1");return new RegExp(`(url\\(['"]?)(${t})(['"]?\\))`,"g")}function dr(e){let t=[];return e.replace(Ut,(n,r,a)=>(t.push(a),n)),t.filter(n=>!Ae(n))}async function cr(e,t,n,r,a){try{let o=n?Pt(t,n):t,i=me(t),l;if(a){let c=await a(o);l=tt(c,i)}else l=await fe(o,i,r);return e.replace(lr(t),`$1${l}$3`)}catch{}return e}function pr(e,{preferredFontFormat:t}){return t?e.replace(sr,n=>{for(;;){let[r,,a]=ir.exec(n)||[];if(!a)return"";if(a===t)return`src: ${r};`}}):e}function rt(e){return e.search(Ut)!==-1}async function Be(e,t,n){if(!rt(e))return e;let r=pr(e,n);return dr(r).reduce((o,i)=>o.then(l=>cr(l,i,t,n)),Promise.resolve(r))}async function ge(e,t,n){var r;let a=(r=t.style)===null||r===void 0?void 0:r.getPropertyValue(e);if(a){let o=await Be(a,null,n);return t.style.setProperty(e,o,t.style.getPropertyPriority(e)),!0}return!1}async function ur(e,t){await ge("background",e,t)||await ge("background-image",e,t),await ge("mask",e,t)||await ge("-webkit-mask",e,t)||await ge("mask-image",e,t)||await ge("-webkit-mask-image",e,t)}async function hr(e,t){let n=j(e,HTMLImageElement);if(!(n&&!Ae(e.src))&&!(j(e,SVGImageElement)&&!Ae(e.href.baseVal)))return;let r=n?e.src:e.href.baseVal,a=await fe(r,me(r),t);await new Promise((o,i)=>{e.onload=o,e.onerror=t.onImageErrorHandler?(...c)=>{try{o(t.onImageErrorHandler(...c))}catch(f){i(f)}}:i;let l=e;l.decode&&(l.decode=o),l.loading==="lazy"&&(l.loading="eager"),n?(e.srcset="",e.src=a):e.href.baseVal=a})}async function mr(e,t){let r=K(e.childNodes).map(a=>at(a,t));await Promise.all(r).then(()=>e)}async function at(e,t){j(e,Element)&&(await ur(e,t),await hr(e,t),await mr(e,t))}function _t(e,t){let{style:n}=e;t.backgroundColor&&(n.backgroundColor=t.backgroundColor),t.width&&(n.width=`${t.width}px`),t.height&&(n.height=`${t.height}px`);let r=t.style;return r!=null&&Object.keys(r).forEach(a=>{n[a]=r[a]}),e}var qt={};async function Wt(e){let t=qt[e];if(t!=null)return t;let r=await(await fetch(e)).text();return t={url:e,cssText:r},qt[e]=t,t}async function Vt(e,t){let n=e.cssText,r=/url\(["']?([^"')]+)["']?\)/g,o=(n.match(/url\([^)]+\)/g)||[]).map(async i=>{let l=i.replace(r,"$1");return l.startsWith("https://")||(l=new URL(l,e.url).href),nt(l,t.fetchRequestInit,({result:c})=>(n=n.replace(i,`url(${c})`),[i,c]))});return Promise.all(o).then(()=>n)}function Xt(e){if(e==null)return[];let t=[],n=/(\/\*[\s\S]*?\*\/)/gi,r=e.replace(n,""),a=new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})","gi");for(;;){let c=a.exec(r);if(c===null)break;t.push(c[0])}r=r.replace(a,"");let o=/@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi,i="((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})",l=new RegExp(i,"gi");for(;;){let c=o.exec(r);if(c===null){if(c=l.exec(r),c===null)break;o.lastIndex=l.lastIndex}else l.lastIndex=o.lastIndex;t.push(c[0])}return t}async function fr(e,t){let n=[],r=[];return e.forEach(a=>{if("cssRules"in a)try{K(a.cssRules||[]).forEach((o,i)=>{if(o.type===CSSRule.IMPORT_RULE){let l=i+1,c=o.href,f=Wt(c).then(y=>Vt(y,t)).then(y=>Xt(y).forEach(A=>{try{a.insertRule(A,A.startsWith("@import")?l+=1:a.cssRules.length)}catch(L){console.error("Error inserting rule from remote css",{rule:A,error:L})}})).catch(y=>{console.error("Error loading remote css",y.toString())});r.push(f)}})}catch(o){let i=e.find(l=>l.href==null)||document.styleSheets[0];a.href!=null&&r.push(Wt(a.href).then(l=>Vt(l,t)).then(l=>Xt(l).forEach(c=>{i.insertRule(c,i.cssRules.length)})).catch(l=>{console.error("Error loading remote stylesheet",l)})),console.error("Error inlining remote css file",o)}}),Promise.all(r).then(()=>(e.forEach(a=>{if("cssRules"in a)try{K(a.cssRules||[]).forEach(o=>{n.push(o)})}catch(o){console.error(`Error while reading CSS rules from ${a.href}`,o)}}),n))}function gr(e){return e.filter(t=>t.type===CSSRule.FONT_FACE_RULE).filter(t=>rt(t.style.getPropertyValue("src")))}async function br(e,t){if(e.ownerDocument==null)throw new Error("Provided element is not within a Document");let n=K(e.ownerDocument.styleSheets),r=await fr(n,t);return gr(r)}function Gt(e){return e.trim().replace(/["']/g,"")}function vr(e){let t=new Set;function n(r){(r.style.fontFamily||getComputedStyle(r).fontFamily).split(",").forEach(o=>{t.add(Gt(o))}),Array.from(r.children).forEach(o=>{o instanceof HTMLElement&&n(o)})}return n(e),t}async function Zt(e,t){let n=await br(e,t),r=vr(e);return(await Promise.all(n.filter(o=>r.has(Gt(o.style.fontFamily))).map(o=>{let i=o.parentStyleSheet?o.parentStyleSheet.href:null;return Be(o.cssText,i,t)}))).join(`
`)}async function Kt(e,t){let n=t.fontEmbedCSS!=null?t.fontEmbedCSS:t.skipFonts?null:await Zt(e,t);if(n){let r=document.createElement("style"),a=document.createTextNode(n);r.appendChild(a),e.firstChild?e.insertBefore(r,e.firstChild):e.appendChild(r)}}async function xr(e,t={}){let{width:n,height:r}=Qe(e,t),a=await Le(e,t,!0);return await Kt(a,t),await at(a,t),_t(a,t),await zt(a,n,r)}async function yr(e,t={}){let{width:n,height:r}=Qe(e,t),a=await xr(e,t),o=await he(a),i=document.createElement("canvas"),l=i.getContext("2d"),c=t.pixelRatio||Ht(),f=t.canvasWidth||n,y=t.canvasHeight||r;return i.width=f*c,i.height=y*c,t.skipAutoScale||It(i),i.style.width=`${f}`,i.style.height=`${y}`,t.backgroundColor&&(l.fillStyle=t.backgroundColor,l.fillRect(0,0,i.width,i.height)),l.drawImage(o,0,0,i.width,i.height),i}async function Yt(e,t={}){let n=await yr(e,t);return await Dt(n)}var wr="data-builder-hide",ot={image:10*1024*1024,video:100*1024*1024,file:25*1024*1024},Jt=["image/png","image/jpeg","image/webp","image/gif","video/mp4","video/webm","video/quicktime","application/pdf","text/plain"].join(",");function Qt(e){return e.startsWith("video/")?"video":e.startsWith("image/")?"image":"file"}function it(e){return e==="video"?ot.video:e==="image"?ot.image:ot.file}function Oe(e){return e<1024?`${e} B`:e<1024*1024?`${(e/1024).toFixed(0)} kB`:`${(e/1024/1024).toFixed(1)} MB`}async function Fe(e=15e3){let t=await Promise.race([Yt(document.body,{pixelRatio:Math.min(window.devicePixelRatio||1,1.5),backgroundColor:getComputedStyle(document.body).backgroundColor||"#ffffff",cacheBust:!0,filter:n=>{let r=n;return!(r?.getAttribute?.(ie)!==null&&r?.hasAttribute?.(ie)||r?.hasAttribute?.(wr))}}),new Promise((n,r)=>setTimeout(()=>r(new Error("screenshot timed out")),e))]);if(!t)throw new Error("screenshot produced no image");return{name:`screenshot-${kr()}.png`,mime:t.type||"image/png",size:t.size,kind:"screenshot",blob:t}}function kr(){let e=new Date,t=n=>String(n).padStart(2,"0");return`${e.getFullYear()}${t(e.getMonth()+1)}${t(e.getDate())}-${t(e.getHours())}${t(e.getMinutes())}${t(e.getSeconds())}`}function be(e=location.href){try{let n=new URL(e).pathname.toLowerCase();return n.length>1&&n.endsWith("/")&&(n=n.slice(0,-1)),n.slice(0,512)}catch{return"/"}}function Ne(e,t){let n=null;document.body.classList.add("builder-pin-armed");let r=()=>{n?.classList.remove("builder-pin-hover"),n=null},a=c=>{let f=document.elementFromPoint(c.clientX,c.clientY);if(!f||Ie(f)||f===document.body||f===document.documentElement){r();return}f!==n&&(r(),n=f,f.classList.add("builder-pin-hover"))},o=c=>{let f=document.elementFromPoint(c.clientX,c.clientY);if(!f||Ie(f))return;c.preventDefault(),c.stopPropagation();let y=Lt(f);l(),e(y,f)},i=c=>{c.key==="Escape"&&(c.preventDefault(),l(),t())};function l(){r(),document.body.classList.remove("builder-pin-armed"),document.removeEventListener("mousemove",a,!0),document.removeEventListener("click",o,!0),document.removeEventListener("keydown",i,!0)}return document.addEventListener("mousemove",a,!0),document.addEventListener("click",o,!0),document.addEventListener("keydown",i,!0),l}function je(e){let t=Tt(e);if(!t.el||t.confidence<St)return{found:!1,by:t.by,confidence:t.confidence};let n=t.el;return n.scrollIntoView({behavior:"smooth",block:"center"}),n.classList.add("builder-pin-found"),setTimeout(()=>n.classList.remove("builder-pin-found"),3e3),{found:!0,by:t.by,confidence:t.confidence}}var S={hello:"builder:hello",ready:"builder:ready",url:"builder:url",pinStart:"builder:pin:start",pinDone:"builder:pin:done",pinCancel:"builder:pin:cancel",shot:"builder:shot",shotDone:"builder:shot:done",context:"builder:context",contextDone:"builder:context:done"},Er=200,en=100,Cr=1e3,Ar=512;function tn(e={}){if(window.parent===window)return()=>{};let t=e.locale??"en",n=null,r=null,a=!1,o=null,i=[],l=[],c=[];function f(x){if(n)try{n.win.postMessage(x,n.origin)}catch{}}function y(){f({v:1,type:S.ready,url:location.href,title:document.title})}function A(){f({v:1,type:S.url,url:location.href,title:document.title})}function L(){o===null&&(o=window.setTimeout(()=>{o=null,A()},0))}function B(){let x=Lr(i,l,t);f({v:1,type:S.contextDone,...x})}function E(){F(),r=Ne((x,$)=>{r=null,$.classList.add("builder-pin-found"),setTimeout(()=>$.classList.remove("builder-pin-found"),3e3),f({v:1,type:S.pinDone,anchor:x}),B()},()=>{r=null,f({v:1,type:S.pinDone,anchor:null})})}function F(){r&&(r(),r=null)}async function le(){if(!a){a=!0;try{let x=await Fe(),$=await Or(x.blob);f({v:1,type:S.shotDone,dataUrl:$}),B()}catch(x){f({v:1,type:S.shotDone,dataUrl:null,error:lt(String(x?.message||x)).slice(0,300)})}finally{a=!1}}}function V(){if(c.push(Tr(x=>st(i,Er,x)),Rr(x=>st(l,en,x)),Pr(x=>st(l,en,x)),$r(L)),document.readyState!=="complete"){let x=()=>A();window.addEventListener("load",x,{once:!0}),c.push(()=>window.removeEventListener("load",x))}try{e.onActivate?.(n.origin)}catch{}}function _(x){let $=x.data;if(!(!$||$.v!==1||typeof $.type!="string")){if(!n){if($.type!==S.hello||window.parent===window||x.source!==window.parent||!x.origin||x.origin==="null"||$.shellOrigin!==x.origin||e.shellOrigins&&!e.shellOrigins.includes(x.origin))return;n={win:window.parent,origin:x.origin},V(),y();return}if(!(x.source!==n.win||x.origin!==n.origin))switch($.type){case S.hello:y();return;case S.pinStart:E();return;case S.pinCancel:F();return;case S.shot:le();return;case S.context:B();return}}}window.addEventListener("message",_);let T=()=>L();return window.addEventListener("popstate",T),window.addEventListener("hashchange",T),()=>{window.removeEventListener("message",_),window.removeEventListener("popstate",T),window.removeEventListener("hashchange",T),o!==null&&(clearTimeout(o),o=null),F();for(let x of c.splice(0))try{x()}catch{}n=null}}function Lr(e,t,n){return{console:e.slice(),network:t.slice(),viewport:{w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio||1},userAgent:navigator.userAgent,locale:n,url:location.href,title:document.title}}function st(e,t,n){e.push(n),e.length>t&&e.shift()}var Sr=["log","info","warn","error","debug"];function Tr(e){let t=new Map;for(let n of Sr){let r=console[n];typeof r=="function"&&(t.set(n,r),console[n]=function(...a){try{e({level:n,text:Mr(a),ts:Date.now()})}catch{}r.apply(console,a)})}return()=>{for(let[n,r]of t)console[n]=r}}function Mr(e){let t=e.map(n=>{if(typeof n=="string")return n;if(n instanceof Error)return n.stack||`${n.name}: ${n.message}`;try{return JSON.stringify(n)??String(n)}catch{return String(n)}});return lt(t.join(" ").slice(0,Cr))}function Rr(e){let t=window.fetch;return typeof t!="function"?()=>{}:(window.fetch=function(n,r){let a=Date.now(),o="GET",i="";try{typeof n=="string"?i=n:n instanceof URL?i=n.href:n&&(i=n.url,o=n.method||"GET"),r&&r.method&&(o=r.method)}catch{}let l=(f,y)=>{try{e({method:o.toUpperCase(),url:nn(i),status:f,ok:y,durationMs:Date.now()-a,ts:a})}catch{}},c=t.call(window,n,r);return c.then(f=>l(f.status,f.ok),()=>l(0,!1)),c},()=>{window.fetch=t})}function Pr(e){let t=XMLHttpRequest.prototype,n=t.open,r=t.send,a=new WeakMap;return t.open=function(o,i){try{a.set(this,{method:String(o||"GET").toUpperCase(),url:String(i),started:0})}catch{}return n.apply(this,arguments)},t.send=function(o){let i=a.get(this);if(i){i.started=Date.now();let l=()=>{this.removeEventListener("loadend",l);try{e({method:i.method,url:nn(i.url),status:this.status,ok:this.status>=200&&this.status<400,durationMs:Date.now()-i.started,ts:i.started})}catch{}};try{this.addEventListener("loadend",l)}catch{}}return r.call(this,o)},()=>{t.open=n,t.send=r}}function nn(e){let t=e;try{t=new URL(e,location.href).href}catch{}return lt(t).slice(0,Ar)}function $r(e){let t=history.pushState,n=history.replaceState;return history.pushState=function(...r){t.apply(this,r),e()},history.replaceState=function(...r){n.apply(this,r),e()},()=>{history.pushState=t,history.replaceState=n}}var Ue="[redacted]",Hr=/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:/@\s]+):[^@\s]*@/g,Ir=/\b(password|passwd|pwd|secret|token|api[_-]?key|auth|authorization|access[_-]?key|private[_-]?key|sslpassword)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&"']+)/gi,Dr=/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,})\b/g,zr=/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,Br=/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;function lt(e){return e&&(e=e.replace(Br,"[redacted private key]"),e=e.replace(Hr,"$1:"+Ue+"@"),e=e.replace(Ir,"$1$2"+Ue),e=e.replace(Dr,Ue),e=e.replace(zr,Ue),e)}function Or(e){return new Promise((t,n)=>{let r=new FileReader;r.onload=()=>t(String(r.result)),r.onerror=()=>n(new Error("could not encode the screenshot")),r.readAsDataURL(e)})}var Fr=e=>{let t=Date.now()-new Date(e).getTime();if(!e||!Number.isFinite(t))return"\u2014";let n=Math.round(t/6e4);if(n<1)return"just now";if(n<60)return`${n}m ago`;let r=Math.round(n/60);return r<48?`${r}h ago`:`${Math.round(r/24)}d ago`},Nr=e=>{let t=Date.now()-new Date(e).getTime();if(!e||!Number.isFinite(t))return"\u2014";let n=Math.round(t/6e4);if(n<1)return"\u0627\u0644\u0622\u0646";if(n<60)return`\u0642\u0628\u0644 ${n}\u062F`;let r=Math.round(n/60);return r<48?`\u0642\u0628\u0644 ${r}\u0633`:`\u0642\u0628\u0644 ${Math.round(r/24)}\u064A`},jr={fab:"Feedback",title:"Feedback",intro:"Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",report:"Report an issue",onThisPage:"On this page",issueCount:e=>`${e} issue${e===1?"":"s"} on this page`,none:"Nothing reported on this page yet.",loading:"Loading\u2026",close:"Close",reportTitle:"Report an issue",type:"Type",bug:"Bug",feature:"Feature",question:"Question",discussion:"Discussion",titleLabel:"Title",titlePlaceholder:"Brief description",details:"Details",detailsPlaceholder:"Steps to reproduce, expected vs actual, etc.",cancel:"Cancel",markdownHint:"Markdown supported \u2014 **bold**, `code`, lists.",pageUrl:"Page URL",location:"Location",pin:"Pin location",pinAnother:"Pin another",pinning:"Click an element on the page\u2026  (Esc to cancel)",pinned:e=>`Pinned <${e}>`,clear:"Clear",attachments:"Attachments",addFile:"Add file",screenshot:"Screenshot",submit:"Submit",submitting:"Submitting\u2026",ctxAttached:(e,t,n)=>`Console and network activity from ${e} will be attached (${t} console line${t===1?"":"s"}, ${n} request${n===1?"":"s"}).`,ctxOptOut:"Send without console & network activity",created:e=>`Reported as #${e}`,failed:"Could not submit. Try again.",titleRequired:"A title is required.",agentWorking:"An agent is working on this",agentWorkingBy:e=>`${e} is working on this`,openBoard:"Open the issue board",apps:"Build",appAgents:"Agents",appSkills:"Skills",appIssues:"Issues",appVault:"Vault",appMcp:"MCP",appSources:"Sources",appDocs:"Library",appBrain:"Brain",appChat:"Chat",appTerminal:"Terminal",back:"Back",openFull:"Open the full issue",opened:e=>`Opened ${e}`,ago:Fr,properties:"Properties",statusLabel:"Status",priorityLabel:"Priority",assigneeLabel:"Assignee",areaLabel:"Area",branchLabel:"Branch",attemptsLabel:"Attempts",routeLabel:"Route",notSet:"Not set",assigneeAnyArea:"Any area",assigneeHuman:"Human only",working:"An agent is working on it",statuses:{triage:"Triage",ready:"To do",in_progress:"In progress",blocked:"Blocked",in_review:"Review",done:"Done",rejected:"Rejected"},priorities:{low:"Low",normal:"Normal",high:"High",critical:"Critical"},enhancement:"Enhancement",chore:"Chore",pinnedHeading:"Pinned element",pinShow:"Show it on the page",pinNoStrategy:"No selector was captured, so this pin cannot be re-found.",pinFound:(e,t)=>`Found via ${e} (${t}%)`,pinLost:"The pinned element is not on this page any more.",activityHeading:"Activity",emptyThread:"Comments and agent activity land here as the work moves.",agentBadge:"Agent",commentPlaceholder:"Leave a comment\u2026",commentCta:"Comment",posting:"Posting\u2026",noDescription:"No description.",actions:{created:"filed it",moved:"moved it",assigned:"assigned it",commented:"commented",edited:"edited it",linked:"linked something",unlinked:"unlinked something",attached:"attached a file",pinned:"pinned an element",claimed:"claimed it",released:"released it",blocked:"blocked it",unblocked:"unblocked it",approved:"approved it",rejected:"rejected it",pushed:"pushed",pr_opened:"opened a pull request",reviewed:"reviewed it",parked:"parked it"},actors:{human:"Someone",agent:"An agent",system:"The system",anon:"A visitor"},dir:"ltr"},Ur={fab:"\u0645\u0644\u0627\u062D\u0638\u0627\u062A",title:"\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A",intro:"\u0648\u062C\u062F\u062A \u062E\u0637\u0623\u060C \u0623\u0648 \u0644\u062F\u064A\u0643 \u0641\u0643\u0631\u0629\u060C \u0623\u0648 \u0633\u0624\u0627\u0644 \u0639\u0646 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629\u061F \u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642\u0647\u0627 \u0628\u0627\u0644\u0635\u0641\u062D\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629.",report:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",onThisPage:"\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629",issueCount:e=>`${e} \u0645\u0634\u0643\u0644\u0629 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629`,none:"\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0644\u0627\u063A\u0627\u062A \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0628\u0639\u062F.",loading:"\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u0645\u064A\u0644\u2026",close:"\u0625\u063A\u0644\u0627\u0642",reportTitle:"\u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",type:"\u0627\u0644\u0646\u0648\u0639",bug:"\u062E\u0637\u0623",feature:"\u0645\u064A\u0632\u0629",question:"\u0633\u0624\u0627\u0644",discussion:"\u0646\u0642\u0627\u0634",titleLabel:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646",titlePlaceholder:"\u0648\u0635\u0641 \u0645\u062E\u062A\u0635\u0631",details:"\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644",detailsPlaceholder:"\u062E\u0637\u0648\u0627\u062A \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0646\u062A\u0627\u062C\u060C \u0627\u0644\u0645\u062A\u0648\u0642\u0639 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0641\u0639\u0644\u064A\u060C \u0625\u0644\u062E.",cancel:"\u0625\u0644\u063A\u0627\u0621",markdownHint:"\u064A\u062F\u0639\u0645 Markdown \u2014 **\u0639\u0631\u064A\u0636**\u060C `\u0634\u064A\u0641\u0631\u0629`\u060C \u0642\u0648\u0627\u0626\u0645.",pageUrl:"\u0631\u0627\u0628\u0637 \u0627\u0644\u0635\u0641\u062D\u0629",location:"\u0627\u0644\u0645\u0648\u0642\u0639",pin:"\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0645\u0648\u0642\u0639",pinAnother:"\u062A\u062D\u062F\u064A\u062F \u0645\u0648\u0642\u0639 \u0622\u062E\u0631",pinning:"\u0627\u062E\u062A\u0631 \u0639\u0646\u0635\u0631\u064B\u0627 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629\u2026  (Esc \u0644\u0644\u0625\u0644\u063A\u0627\u0621)",pinned:e=>`\u062A\u0645 \u0627\u0644\u062A\u062D\u062F\u064A\u062F <${e}>`,clear:"\u0645\u0633\u062D",attachments:"\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A",addFile:"\u0625\u0636\u0627\u0641\u0629 \u0645\u0644\u0641",screenshot:"\u0644\u0642\u0637\u0629 \u0634\u0627\u0634\u0629",submit:"\u0625\u0631\u0633\u0627\u0644",submitting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u2026",ctxAttached:(e,t,n)=>`\u0633\u064A\u062A\u0645 \u0625\u0631\u0641\u0627\u0642 \u0646\u0634\u0627\u0637 \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0634\u0628\u0643\u0629 \u0645\u0646 ${e} (${t} \u0633\u0637\u0631\u060C ${n} \u0637\u0644\u0628).`,ctxOptOut:"\u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u062F\u0648\u0646 \u0646\u0634\u0627\u0637 \u0648\u062D\u062F\u0629 \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0627\u0644\u0634\u0628\u0643\u0629",created:e=>`\u062A\u0645 \u0627\u0644\u0625\u0628\u0644\u0627\u063A \u0628\u0631\u0642\u0645 #${e}`,failed:"\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.",titleRequired:"\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0645\u0637\u0644\u0648\u0628.",agentWorking:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629",agentWorkingBy:e=>`${e} \u064A\u0639\u0645\u0644 \u0639\u0644\u0649 \u0647\u0630\u0647 \u0627\u0644\u0645\u0634\u0643\u0644\u0629`,openBoard:"\u0641\u062A\u062D \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",apps:"\u0627\u0644\u0628\u0646\u0627\u0621",appAgents:"\u0627\u0644\u0648\u0643\u0644\u0627\u0621",appSkills:"\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062A",appIssues:"\u0627\u0644\u0645\u0634\u0643\u0644\u0627\u062A",appVault:"\u0627\u0644\u062E\u0632\u0646\u0629",appMcp:"MCP",appSources:"\u0627\u0644\u0645\u0635\u0627\u062F\u0631",appDocs:"\u0627\u0644\u0645\u0643\u062A\u0628\u0629",appBrain:"\u0627\u0644\u062F\u0645\u0627\u063A",appChat:"\u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629",appTerminal:"\u0627\u0644\u0637\u0631\u0641\u064A\u0629",back:"\u0631\u062C\u0648\u0639",openFull:"\u0641\u062A\u062D \u0627\u0644\u0645\u0647\u0645\u0629 \u0643\u0627\u0645\u0644\u0629",opened:e=>`\u0641\u064F\u062A\u062D\u062A ${e}`,ago:Nr,properties:"\u0627\u0644\u062E\u0635\u0627\u0626\u0635",statusLabel:"\u0627\u0644\u062D\u0627\u0644\u0629",priorityLabel:"\u0627\u0644\u0623\u0648\u0644\u0648\u064A\u0629",assigneeLabel:"\u0627\u0644\u0645\u0643\u0644\u064E\u0651\u0641",areaLabel:"\u0627\u0644\u0646\u0637\u0627\u0642",branchLabel:"\u0627\u0644\u0641\u0631\u0639",attemptsLabel:"\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A",routeLabel:"\u0627\u0644\u0645\u0633\u0627\u0631",notSet:"\u063A\u064A\u0631 \u0645\u062D\u062F\u064E\u0651\u062F",assigneeAnyArea:"\u0623\u064A \u0645\u062C\u0627\u0644",assigneeHuman:"\u0628\u0634\u0631\u064A \u0641\u0642\u0637",working:"\u064A\u0639\u0645\u0644 \u0623\u062D\u062F \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0639\u0644\u064A\u0647\u0627",statuses:{triage:"\u0627\u0644\u0641\u0631\u0632",ready:"\u0644\u0644\u062A\u0646\u0641\u064A\u0630",in_progress:"\u0642\u064A\u062F \u0627\u0644\u062A\u0646\u0641\u064A\u0630",blocked:"\u0645\u062A\u0639\u062B\u0631\u0629",in_review:"\u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629",done:"\u0645\u0646\u062C\u0632\u0629",rejected:"\u0645\u0631\u0641\u0648\u0636\u0629"},priorities:{low:"\u0645\u0646\u062E\u0641\u0636\u0629",normal:"\u0639\u0627\u062F\u064A\u0629",high:"\u0639\u0627\u0644\u064A\u0629",critical:"\u062D\u0631\u062C\u0629"},enhancement:"\u062A\u062D\u0633\u064A\u0646",chore:"\u0645\u0647\u0645\u0629 \u0631\u0648\u062A\u064A\u0646\u064A\u0629",pinnedHeading:"\u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0645\u062B\u0628\u0651\u062A",pinShow:"\u0625\u0638\u0647\u0627\u0631\u0647 \u0641\u064A \u0627\u0644\u0635\u0641\u062D\u0629",pinNoStrategy:"\u0644\u0645 \u064A\u064F\u0644\u062A\u0642\u0637 \u0623\u064A \u0645\u062D\u062F\u0650\u0651\u062F\u060C \u0644\u0630\u0627 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u064A\u062C\u0627\u062F \u0647\u0630\u0627 \u0627\u0644\u062A\u062B\u0628\u064A\u062A \u0645\u062C\u062F\u062F\u064B\u0627.",pinFound:(e,t)=>`\u0639\u064F\u062B\u0631 \u0639\u0644\u064A\u0647 \u0639\u0628\u0631 ${e} (${t}%)`,pinLost:"\u0644\u0645 \u064A\u0639\u062F \u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0645\u062B\u0628\u0651\u062A \u0645\u0648\u062C\u0648\u062F\u064B\u0627 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629.",activityHeading:"\u0627\u0644\u0646\u0634\u0627\u0637",emptyThread:"\u062A\u0638\u0647\u0631 \u0627\u0644\u062A\u0639\u0644\u064A\u0642\u0627\u062A \u0648\u0646\u0634\u0627\u0637 \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0647\u0646\u0627 \u0645\u0639 \u062A\u0642\u062F\u0651\u0645 \u0627\u0644\u0639\u0645\u0644.",agentBadge:"\u0648\u0643\u064A\u0644",commentPlaceholder:"\u0627\u0643\u062A\u0628 \u062A\u0639\u0644\u064A\u0642\u064B\u0627\u2026",commentCta:"\u062A\u0639\u0644\u064A\u0642",posting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0646\u0634\u0631\u2026",noDescription:"\u0644\u0627 \u064A\u0648\u062C\u062F \u0648\u0635\u0641.",actions:{created:"\u0633\u062C\u0651\u0644\u0647\u0627",moved:"\u0646\u0642\u0644\u0647\u0627",assigned:"\u0623\u0633\u0646\u062F\u0647\u0627",commented:"\u0639\u0644\u0651\u0642",edited:"\u0639\u062F\u0651\u0644\u0647\u0627",linked:"\u0631\u0628\u0637 \u0634\u064A\u0626\u064B\u0627 \u0628\u0647\u0627",unlinked:"\u0623\u0644\u063A\u0649 \u0631\u0628\u0637 \u0634\u064A\u0621 \u0628\u0647\u0627",attached:"\u0623\u0631\u0641\u0642 \u0645\u0644\u0641\u064B\u0627",pinned:"\u062B\u0628\u0651\u062A \u0639\u0646\u0635\u0631\u064B\u0627",claimed:"\u0627\u0633\u062A\u0644\u0645\u0647\u0627",released:"\u062A\u0631\u0643\u0647\u0627",blocked:"\u0639\u0637\u0651\u0644\u0647\u0627",unblocked:"\u0623\u0632\u0627\u0644 \u062A\u0639\u0637\u064A\u0644\u0647\u0627",approved:"\u0648\u0627\u0641\u0642 \u0639\u0644\u064A\u0647\u0627",rejected:"\u0631\u0641\u0636\u0647\u0627",pushed:"\u062F\u0641\u0639 \u0627\u0644\u062A\u063A\u064A\u064A\u0631\u0627\u062A",pr_opened:"\u0641\u062A\u062D \u0637\u0644\u0628 \u062F\u0645\u062C",reviewed:"\u0631\u0627\u062C\u0639\u0647\u0627",parked:"\u0639\u0644\u0651\u0642\u0647\u0627 \u062C\u0627\u0646\u0628\u064B\u0627"},actors:{human:"\u0623\u062D\u062F\u0647\u0645",agent:"\u0648\u0643\u064A\u0644",system:"\u0627\u0644\u0646\u0638\u0627\u0645",anon:"\u0632\u0627\u0626\u0631"},dir:"rtl"};function _e(e){return e.toLowerCase().startsWith("ar")?Ur:jr}var rn="http://www.w3.org/2000/svg",an={messageSquare:[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}],["path",{d:"M13 8H7"}],["path",{d:"M17 12H7"}]],x:[["path",{d:"M18 6 6 18"}],["path",{d:"m6 6 12 12"}]],plus:[["path",{d:"M5 12h14"}],["path",{d:"M12 5v14"}]],pin:[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"}],["circle",{cx:"12",cy:"10",r:"3"}]],paperclip:[["path",{d:"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"}]],camera:[["path",{d:"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}],["circle",{cx:"12",cy:"13",r:"3"}]],eye:[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{cx:"12",cy:"12",r:"3"}]],arrowRight:[["path",{d:"M5 12h14"}],["path",{d:"m12 5 7 7-7 7"}]],chevronRight:[["path",{d:"m9 18 6-6-6-6"}]],chevronLeft:[["path",{d:"m15 18-6-6 6-6"}]],flag:[["path",{d:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"}],["line",{x1:"4",x2:"4",y1:"22",y2:"15"}]],user:[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"}],["circle",{cx:"12",cy:"7",r:"4"}]],gitBranch:[["line",{x1:"6",x2:"6",y1:"3",y2:"15"}],["circle",{cx:"18",cy:"6",r:"3"}],["circle",{cx:"6",cy:"18",r:"3"}],["path",{d:"M18 9a9 9 0 0 1-9 9"}]],history:[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{d:"M3 3v5h5"}],["path",{d:"M12 7v5l4 2"}]],route:[["circle",{cx:"6",cy:"19",r:"3"}],["path",{d:"M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"}],["circle",{cx:"18",cy:"5",r:"3"}]],externalLink:[["path",{d:"M15 3h6v6"}],["path",{d:"M10 14 21 3"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]],send:[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"}],["path",{d:"m21.854 2.147-10.94 10.939"}]],crosshair:[["circle",{cx:"12",cy:"12",r:"10"}],["line",{x1:"22",x2:"18",y1:"12",y2:"12"}],["line",{x1:"6",x2:"2",y1:"12",y2:"12"}],["line",{x1:"12",x2:"12",y1:"6",y2:"2"}],["line",{x1:"12",x2:"12",y1:"22",y2:"18"}]],agents:[["path",{d:"M12 8V4H8"}],["rect",{width:"16",height:"12",x:"4",y:"8",rx:"2"}],["path",{d:"M2 14h2"}],["path",{d:"M20 14h2"}],["path",{d:"M15 13v2"}],["path",{d:"M9 13v2"}]],skills:[["path",{d:"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"}],["path",{d:"M22 10v6"}],["path",{d:"M6 12.5V16a6 3 0 0 0 12 0v-3.5"}]],issues:[["rect",{x:"3",y:"5",width:"6",height:"6",rx:"1"}],["path",{d:"m3 17 2 2 4-4"}],["path",{d:"M13 6h8"}],["path",{d:"M13 12h8"}],["path",{d:"M13 18h8"}]],vault:[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 7.9 2.7 2.7"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 10.6 2.7-2.7"}],["circle",{cx:"7.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m7.9 16.1 2.7-2.7"}],["circle",{cx:"16.5",cy:"16.5",r:".5",fill:"currentColor"}],["path",{d:"m13.4 13.4 2.7 2.7"}],["circle",{cx:"12",cy:"12",r:"2"}]],sources:[["path",{d:"M4 11a9 9 0 0 1 9 9"}],["path",{d:"M4 4a16 16 0 0 1 16 16"}],["circle",{cx:"5",cy:"19",r:"1"}]],docs:[["rect",{width:"8",height:"18",x:"3",y:"3",rx:"1"}],["path",{d:"M7 3v18"}],["path",{d:"M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"}]],brain:[["path",{d:"M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"}],["path",{d:"M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"}],["path",{d:"M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"}],["path",{d:"M17.599 6.5a3 3 0 0 0 .399-1.375"}],["path",{d:"M6.003 5.125A3 3 0 0 0 6.401 6.5"}],["path",{d:"M3.477 10.896a4 4 0 0 1 .585-.396"}],["path",{d:"M19.938 10.5a4 4 0 0 1 .585.396"}],["path",{d:"M6 18a4 4 0 0 1-1.967-.516"}],["path",{d:"M19.967 17.484A4 4 0 0 1 18 18"}]],chat:[["path",{d:"M7.9 20A9 9 0 1 0 4 16.1L2 22Z"}]],mcp:[["path",{d:"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"}],["path",{d:"m2 22 3-3"}],["path",{d:"M7.5 13.5 10 11"}],["path",{d:"M10.5 16.5 13 14"}],["path",{d:"m18 3-4 4h6l-4 4"}]],terminal:[["path",{d:"m7 11 2-2-2-2"}],["path",{d:"M11 13h4"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",ry:"2"}]],layers:[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]],app:[["rect",{width:"7",height:"7",x:"3",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"3",rx:"1"}],["rect",{width:"7",height:"7",x:"14",y:"14",rx:"1"}],["rect",{width:"7",height:"7",x:"3",y:"14",rx:"1"}]]};function qe(e){return Object.prototype.hasOwnProperty.call(an,e)}function M(e,t=14){let n=document.createElementNS(rn,"svg");n.setAttribute("viewBox","0 0 24 24"),n.setAttribute("width",String(t)),n.setAttribute("height",String(t)),n.setAttribute("fill","none"),n.setAttribute("stroke","currentColor"),n.setAttribute("stroke-width","2"),n.setAttribute("stroke-linecap","round"),n.setAttribute("stroke-linejoin","round"),n.setAttribute("aria-hidden","true"),n.setAttribute("focusable","false"),n.classList.add("ico");for(let[r,a]of an[e]){let o=document.createElementNS(rn,r);for(let[i,l]of Object.entries(a))o.setAttribute(i,l);n.appendChild(o)}return n}function J(e,t,n,r=14){e.replaceChildren(),e.appendChild(M(t,r));let a=document.createElement("span");a.textContent=n,e.appendChild(a)}function Ve(e){let t=document.createDocumentFragment(),n=(e??"").replace(/\r\n?/g,`
`).split(`
`),r=0;for(;r<n.length;){let a=n[r],o=/^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(a);if(o){let A=o[1][0],L=[];for(r++;r<n.length&&!new RegExp(`^\\s*${A}{3,}\\s*$`).test(n[r]);)L.push(n[r]),r++;r++;let B=document.createElement("pre");B.className="md-pre";let E=document.createElement("code");o[2]&&(E.className=`lang-${o[2]}`),E.textContent=L.join(`
`),B.appendChild(E),t.appendChild(B);continue}if(!a.trim()){r++;continue}if(/^\s*([-*_])\s*(\1\s*){2,}$/.test(a)){t.appendChild(document.createElement("hr")),r++;continue}let i=/^\s*(#{1,6})\s+(.*)$/.exec(a);if(i){let A=Math.min(6,3+i[1].length),L=document.createElement(`h${A}`);L.className="md-h",L.appendChild(se(i[2])),t.appendChild(L),r++;continue}if(/^\s*>\s?/.test(a)){let A=[];for(;r<n.length&&/^\s*>\s?/.test(n[r]);)A.push(n[r].replace(/^\s*>\s?/,"")),r++;let L=document.createElement("blockquote");L.className="md-quote",L.appendChild(Ve(A.join(`
`))),t.appendChild(L);continue}let l=/^\s*[-*+]\s+/,c=/^\s*\d+[.)]\s+/;if(l.test(a)||c.test(a)){let A=!l.test(a),L=A?c:l,B=document.createElement(A?"ol":"ul");for(B.className="md-list";r<n.length&&L.test(n[r]);){let E=document.createElement("li"),F=n[r].replace(L,"");for(r++;r<n.length&&n[r].trim()&&!L.test(n[r])&&!/^\s*(#{1,6}\s|>|`{3}|~{3})/.test(n[r]);)F+=`
`+n[r].trim(),r++;E.appendChild(se(F)),B.appendChild(E)}t.appendChild(B);continue}let f=qr(n,r);if(f){t.appendChild(Wr(f)),r=f.next;continue}let y=[];for(;r<n.length&&n[r].trim()&&!/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|`{3}|~{3})/.test(n[r])&&!dn(n,r);)y.push(n[r]),r++;if(y.length){let A=document.createElement("p");A.className="md-p",A.appendChild(se(y.join(`
`))),t.appendChild(A)}else r++}return t}var on="\0";function We(e){let t=e.trim().replace(/\\\|/g,on);return t.startsWith("|")&&(t=t.slice(1)),t.endsWith("|")&&(t=t.slice(0,-1)),t.split("|").map(n=>n.split(on).join("|").trim())}function _r(e){if(!e||e.indexOf("-")<0||e.indexOf("|")<0)return!1;let t=We(e);return t.length>0&&t.every(n=>/^:?-+:?$/.test(n))}function dn(e,t){return t+1<e.length&&e[t].indexOf("|")>=0&&_r(e[t+1])}function qr(e,t){if(!dn(e,t))return null;let n=We(e[t]),r=We(e[t+1]).map(i=>i.startsWith(":")&&i.endsWith(":")?"center":i.endsWith(":")?"end":i.startsWith(":")?"start":""),a=t+2,o=[];for(;a<e.length&&e[a].trim()&&e[a].indexOf("|")>=0;)o.push(We(e[a])),a++;return{head:n,align:r,body:o,cols:o.reduce((i,l)=>Math.max(i,l.length),n.length),headless:n.every(i=>i===""),next:a}}function Wr(e){if(e.headless&&e.cols===2){let o=document.createElement("dl");o.className="md-kv";for(let i of e.body){let l=document.createElement("dt");l.setAttribute("dir","auto"),l.appendChild(se(i[0]??""));let c=document.createElement("dd");c.setAttribute("dir","auto"),c.appendChild(se(i[1]??"")),o.append(l,c)}return o}let t=document.createElement("div");t.className="md-tablewrap";let n=document.createElement("table");n.className="md-table";let r=(o,i,l)=>{let c=document.createElement(o);return c.setAttribute("dir","auto"),e.align[l]&&(c.style.textAlign=e.align[l]),c.appendChild(se(i)),c};if(!e.headless){let o=document.createElement("thead"),i=document.createElement("tr");for(let l=0;l<e.cols;l++)i.appendChild(r("th",e.head[l]??"",l));o.appendChild(i),n.appendChild(o)}let a=document.createElement("tbody");for(let o of e.body){let i=document.createElement("tr");for(let l=0;l<e.cols;l++)i.appendChild(r("td",o[l]??"",l));a.appendChild(i)}return n.appendChild(a),t.appendChild(n),t}var Vr=/(`+)([\s\S]*?)\1|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)([\s\S]+?)\5|(~~)([\s\S]+?)\7|(\*|_)([^\s*_][\s\S]*?)\9|(https?:\/\/[^\s<>()]+)/;function se(e){let t=document.createDocumentFragment(),n=e;for(;;){let r=Vr.exec(n);if(!r||r.index===void 0)break;if(r.index>0&&ln(t,n.slice(0,r.index)),r[1]){let a=document.createElement("code");a.className="md-code",a.textContent=r[2].trim(),t.appendChild(a)}else r[3]!==void 0?t.appendChild(sn(r[4],r[3]||r[4])):r[5]?t.appendChild(dt("strong","md-strong",r[6])):r[7]?t.appendChild(dt("del","md-del",r[8])):r[9]?t.appendChild(dt("em","md-em",r[10])):r[11]&&t.appendChild(sn(r[11],r[11]));n=n.slice(r.index+r[0].length)}return n&&ln(t,n),t}function dt(e,t,n){let r=document.createElement(e);return r.className=t,r.appendChild(se(n)),r}function sn(e,t){if(!(/^(https?:|mailto:)/i.test(e)||/^[/#]/.test(e)))return document.createTextNode(t);let r=document.createElement("a");return r.className="md-a",r.href=e,r.target="_blank",r.rel="noopener noreferrer ugc",r.textContent=t,r}function ln(e,t){t.split(`
`).forEach((r,a)=>{a&&e.appendChild(document.createElement("br")),r&&e.appendChild(document.createTextNode(r))})}function pn(e=""){let t=e.replace(/\/$/,"");return{async get(n){let r=await fetch(`${t}/api/builder/issues/${n}`,{credentials:"include"});if(!r.ok)throw new Error(`could not load #${n}`);let a=await r.json();return{id:a.id,number:a.number,title:a.title,body:a.body??"",type:a.type,status:a.status,priority:a.priority,route:a.route??"",pageUrl:a.pageUrl??"",createdAt:a.createdAt??"",assignee:a.assignee??"",humanOnly:!!a.humanOnly,area:a.area??"",branch:a.branch??"",attempts:typeof a.attempts=="number"?a.attempts:0,busy:!!a.busy,pins:a.pins??[],comments:a.comments??[],activity:a.activity??[]}},async comment(n,r){if(!(await fetch(`${t}/api/builder/issues/${n}/comments`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({body:r,author:""})})).ok)throw new Error("could not post the comment")}}}function un(e,t,n,r=a=>`/builder/issues/${a}`){let a=_e(e),o=document.createElement("div");o.className="detail hidden";let i=null,l="",c=null;async function f(d){o.replaceChildren(b("p","empty",a.loading));try{i=await t.get(d),y()}catch(u){o.replaceChildren(b("p","note err",String(u.message)))}}function y(){if(!i)return;let d=i;o.replaceChildren(),o.append(A(d),L(d),Se(d))}function A(d){let u=b("div","d-nav",""),h=document.createElement("button");h.type="button",h.className="d-back",h.append(M("chevronLeft",14),b("span","",a.back)),h.addEventListener("click",n);let w=b("span","d-num",`#${d.number}`);w.setAttribute("dir","ltr");let k=document.createElement("button");return k.type="button",k.className="d-iconbtn d-open",k.title=a.openFull,k.setAttribute("aria-label",a.openFull),k.appendChild(M("externalLink",14)),k.addEventListener("click",()=>window.open(r(d.number),"_blank","noopener")),u.append(h,w,k),u}function L(d){let u=b("div","d-main",""),h=b("h3","d-title",d.title);h.setAttribute("dir","auto"),u.appendChild(h);let w=b("p","d-sub","");if(w.appendChild(b("span","",a.opened(a.ago(d.createdAt)))),d.busy){let R=b("span","d-live","");R.appendChild(b("span","d-pulse","")),R.appendChild(b("span","",a.working)),w.append(O(),R)}u.appendChild(w),u.appendChild(B(d));let k=b("div","d-body","");if(k.setAttribute("dir","auto"),d.body?k.appendChild(Ve(d.body)):k.appendChild(b("p","d-empty",a.noDescription)),u.appendChild(k),d.pins.length){u.appendChild(ye(a.pinnedHeading,d.pins.length));let R=b("div","d-objs","");for(let U of d.pins)R.appendChild(le(U));u.appendChild(R)}let I=V(d);return u.appendChild(ye(a.activityHeading,I.length||void 0)),u.appendChild(_(I)),u}function B(d){let u=b("div","d-props","");u.appendChild(E(F("status",d.status),a.statusLabel,ve(a.statuses[d.status]??d.status))),u.appendChild(E(F("priority",d.priority),a.priorityLabel,ve(a.priorities[d.priority]??d.priority))),u.appendChild(E(M("flag",13),a.type,ve(a[d.type]??d.type)));let h=d.humanOnly?a.assigneeHuman:d.assignee||a.assigneeAnyArea;return u.appendChild(E(M("user",13),a.assigneeLabel,d.assignee&&!d.humanOnly?xe(h):ve(h),!d.assignee&&!d.humanOnly)),u.appendChild(E(M("layers",13),a.areaLabel,d.area?xe(d.area):ve(a.notSet),!d.area)),u.appendChild(E(M("gitBranch",13),a.branchLabel,d.branch?xe(d.branch):ve(a.notSet),!d.branch)),u.appendChild(E(M("history",13),a.attemptsLabel,xe(String(d.attempts)))),d.route&&u.appendChild(E(M("route",13),a.routeLabel,xe(d.route))),u}function E(d,u,h,w=!1){let k=b("div","d-prop",""),I=b("span","d-prop-k","");I.append(d,b("span","",u));let R=b("span",`d-prop-v${w?" muted":""}`,"");return R.appendChild(h),k.append(I,R),k}function F(d,u){let h=document.createElement("span");return h.className="d-dot",h.dataset[d]=u,h}function le(d){let u=b("div","d-obj",""),h=b("span","d-obj-ico","");h.setAttribute("aria-hidden","true"),h.appendChild(M("crosshair",15));let w=b("div","d-obj-txt",""),k=b("p","d-obj-nm",""),I=b("bdi","",`<${d.tag??"?"}>`);I.setAttribute("dir","ltr"),k.appendChild(I),d.name&&(k.appendChild(b("span",""," \u2014 ")),k.appendChild(b("bdi","",`\u201C${d.name}\u201D`)));let R=b("p","d-obj-meta","");d.verified&&d.verified.length?R.appendChild(xe(d.verified.join(", "))):R.textContent=a.pinNoStrategy,w.append(k,R);let U=document.createElement("button");return U.type="button",U.className="d-iconbtn",U.title=a.pinShow,U.setAttribute("aria-label",a.pinShow),U.appendChild(M("eye",14)),U.addEventListener("click",()=>{let Q=je(d);m(Q.found?a.pinFound(Q.by,Math.round(Q.confidence*100)):a.pinLost,Q.found?"ok":"err")}),u.append(h,w,U),u}function V(d){return[...d.comments.map(u=>({at:cn(u.createdAt),kind:"comment",comment:u})),...d.activity.filter(u=>u.action!=="commented").map(u=>({at:cn(u.createdAt),kind:"event",event:u}))].sort((u,h)=>u.at-h.at)}function _(d){if(!d.length)return b("p","d-empty",a.emptyThread);let u=document.createElement("ol");u.className="d-thread";for(let h of d)u.appendChild(h.kind==="comment"?T(h.comment):x(h.event));return u}function T(d){let u=document.createElement("li");u.className="d-item",u.appendChild(H()),u.appendChild($(d.author,d.kind));let h=document.createElement("article");h.className="d-card";let w=b("p","d-card-h",""),k=b("span","d-who","");k.appendChild(b("bdi","",d.author||"\u2014")),w.appendChild(k),d.kind==="agent"&&w.appendChild(b("span","d-badge",a.agentBadge)),w.appendChild(O()),w.appendChild(b("span","",a.ago(d.createdAt)));let I=b("div","d-card-b","");return I.setAttribute("dir","auto"),I.appendChild(Ve(d.body)),h.append(w,I),u.appendChild(h),u}function x(d){let u=document.createElement("li");u.className="d-item d-evt",u.appendChild(H());let h=b("span","d-knot","");h.setAttribute("aria-hidden","true"),h.appendChild(document.createElement("span")),u.appendChild(h);let w=b("p","d-evt-t",""),k=b("span","d-evt-w","");return k.appendChild(b("span","d-who",a.actors[d.actorKind]??d.actorKind)),k.appendChild(document.createTextNode(" "+(a.actions[d.action]??d.action))),w.append(k,O(),b("span","d-evt-at",a.ago(d.createdAt))),u.appendChild(w),u}function $(d,u){let h=b("span","d-avatar","");return h.setAttribute("aria-hidden","true"),u==="agent"?h.appendChild(M("agents",13)):u==="system"?h.appendChild(M("messageSquare",12)):h.appendChild(b("bdi","",(d.trim()[0]||"?").toUpperCase())),h}function Se(d){let u=b("div","d-composer","");c=b("p","note hidden","");let h=document.createElement("textarea");h.className="d-draft",h.placeholder=a.commentPlaceholder,h.rows=2,h.value=l,h.addEventListener("input",()=>{l=h.value});let w=document.createElement("button");w.type="button",w.className="primary d-send";let k=R=>{w.replaceChildren(M("send",13),b("span","",R))};k(a.commentCta),w.addEventListener("click",async()=>{let R=h.value.trim();if(R){w.disabled=!0,k(a.posting);try{await t.comment(d.number,R),l="",await f(d.number)}catch(U){m(String(U.message),"err"),w.disabled=!1,k(a.commentCta)}}});let I=b("div","d-composer-act","");return I.appendChild(w),u.append(c,h,I),u}function m(d,u){let h=c;h&&(h.textContent=d,h.className=`note ${u}`,setTimeout(()=>{h.textContent===d&&(h.className="note hidden")},4e3))}let O=()=>{let d=b("span","d-sep","\xB7");return d.setAttribute("aria-hidden","true"),d},H=()=>{let d=b("span","d-line","");return d.setAttribute("aria-hidden","true"),d};function ye(d,u){let h=b("div","d-sect","");if(h.appendChild(b("h4","d-sect-t",d)),u!==void 0){let w=b("span","d-sect-n",String(u));w.setAttribute("dir","ltr"),h.appendChild(w)}return h}return{el:o,load:f,destroy:()=>o.remove()}}function ve(e){return b("bdi","",e)}function xe(e){let t=b("bdi","mono",e);return t.setAttribute("dir","ltr"),t}function cn(e){let t=Date.parse(e);return Number.isFinite(t)?t:0}function b(e,t,n){let r=document.createElement(e);return t&&(r.className=t),n&&(r.textContent=n),r}var hn=`
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
   header, not this sheet's uppercase .label, which is a form idiom. */
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
`,mn=`
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

`;function fn(e=""){let t=e.replace(/\/$/,"");return{async listByRoute(n){let r=await fetch(`${t}/api/builder/issues?route=${encodeURIComponent(n)}`,{credentials:"include",headers:{Accept:"application/json"}});if(!r.ok)return[];let a=await r.json().catch(()=>null);return Array.isArray(a?.issues)?a.issues:[]},async create(n){let r=new FormData;r.set("issue",JSON.stringify({type:n.type,title:n.title,body:n.body,route:n.route,page_url:n.pageUrl,locale:n.locale,pins:n.pins,reporter_email:n.reporterEmail??"",context:n.context??void 0}));for(let i of n.attachments)r.append("attachments",i.blob,i.name),r.append("attachment_kinds",i.kind);let a=await fetch(`${t}/api/builder/feedback`,{method:"POST",credentials:"include",body:r});if(!a.ok){let i=await a.text().catch(()=>"");throw new Error(i||`submit failed (${a.status})`)}let o=await a.json();return{id:String(o.id??""),number:Number(o.number??0)}}}}var bn="builder.fab.position",Xr=["bug","feature","question","discussion"],gn=8;function Gr(e={}){let t=_e(e.locale??document.documentElement.lang??"en"),n=e.transport??fn(e.apiBase),r=e.locale??"en",a=document.createElement("div");a.setAttribute(ie,""),a.setAttribute("dir",t.dir),e.theme&&a.setAttribute("data-theme",e.theme),document.body.appendChild(a);let o=a.attachShadow({mode:"open"}),i=document.createElement("style");i.textContent=hn+(e.accent?`:host{--accent:${Jr(e.accent)}}`:""),o.appendChild(i);let l=document.createElement("style");l.setAttribute(ie,""),l.textContent=mn,document.head.appendChild(l);let c=[],f=[],y=[],A="bug",L=!1,B=!1,E=null,F=null,le=!1,V=null,_=null,T=null,x=null,$=()=>{},Se=document.createElement("div");Se.innerHTML=`
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
            <input type="file" class="filein hidden" multiple accept="${Jt}">

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

`,o.appendChild(Se);let m=s=>o.querySelector(s),O=m(".fab"),H=m(".panel"),ye=m(".form"),d=m(".listing"),u=m(".modal"),h=m(".modal-card"),w=m(".modal-head"),k=m(".modal-x"),I=m(".cancel"),R=m(".rows"),U=m(".pills"),Q=m(".note"),ct=m(".files"),Te=m(".filein"),pt=m(".count"),vn=m(".appgrid"),Me=m('input[name="title"]'),ut=m('textarea[name="body"]'),ht=m('input[name="url"]'),ee=m(".pin");if(e.framedHost){let s=new Map,p=z=>{let g=s.get(z.id);return g?g.app=z:(g={app:z,ready:!1,page:null,ctx:null},s.set(z.id,g)),g},v=z=>{let g=z;return!g||typeof g.id!="string"||!g.id?null:{id:g.id,name:typeof g.name=="string"&&g.name?g.name:g.id,origin:typeof g.origin=="string"?g.origin:""}},C=(z,g)=>{g&&window.postMessage({v:1,type:z,appId:g},location.origin)},X=z=>C(z,T?.id),P="This app has not loaded the builder script, so there is nothing inside the frame to read the page with. Add the script tag to enable pinning and screenshots.",D=m(".pin"),q=m(".shot"),Pe=m(".ctxrow"),Mn=m(".ctx-note");m(".ctx-opt-txt").textContent=t.ctxOptOut;let ke=()=>{let z=T?s.get(T.id):void 0;V=z?.page??null,_=z?.ctx??null;let g=!!z?.ready;for(let $e of[D,q])$e.disabled=!g,$e.title=g?"":P,g?$e.removeAttribute("aria-disabled"):$e.setAttribute("aria-disabled","true");ht.value=V?.url??"";let N=be(V?.url),oe=m(".brand-sub");oe.setAttribute("dir","auto"),oe.textContent=T?`${T.name} \xB7 ${N}`:N;let Y=!!_&&(_.console.length>0||_.network.length>0);Pe.classList.toggle("hidden",!Y),_&&T&&(Mn.textContent=t.ctxAttached(T.name,_.console.length,_.network.length))},Ct=()=>{x=null,L?u.dataset.open="true":H.dataset.open="true",pe()};$=()=>{C(S.pinCancel,x??void 0),Ct()},window.addEventListener("message",z=>{if(z.source!==window||z.origin!==location.origin)return;let g=z.data;if(!g||g.v!==1||typeof g.type!="string")return;let N=v(g.app);if(!N)return;if(g.type==="builder:app:active"){x&&x!==N.id&&$(),T=N,p(N),ke(),C(S.context,N.id),ne();return}let oe=p(N);switch(g.type){case S.ready:oe.ready=!0,typeof g.url=="string"&&g.url&&(oe.page={url:g.url,title:typeof g.title=="string"?g.title:""}),C(S.context,N.id),N.id===T?.id&&(ke(),ne());return;case S.url:typeof g.url=="string"&&g.url&&(oe.page={url:g.url,title:typeof g.title=="string"?g.title:""}),N.id===T?.id&&(ke(),ne());return;case S.pinDone:{if(x!==N.id)return;let Y=g.anchor;Y&&typeof Y=="object"&&f.length<gn&&(f=[...f,Y]),Ct();return}case S.shotDone:{if(N.id!==T?.id)return;if(q.disabled=!1,typeof g.dataUrl=="string"&&g.dataUrl.startsWith("data:")){let Y=Zr(g.dataUrl);Y&&Y.size<=it("image")?(y.push(Y),we(),Z("")):Z(t.failed,"err")}else Z(typeof g.error=="string"&&g.error?g.error:t.failed,"err");return}case S.contextDone:{oe.ctx={console:Array.isArray(g.console)?g.console:[],network:Array.isArray(g.network)?g.network:[],viewport:g.viewport&&typeof g.viewport=="object"?g.viewport:{w:0,h:0,dpr:1},userAgent:typeof g.userAgent=="string"?g.userAgent:"",locale:typeof g.locale=="string"?g.locale:"",url:typeof g.url=="string"?g.url:"",title:typeof g.title=="string"?g.title:"",app:N},N.id===T?.id&&ke();return}}}),D.addEventListener("click",()=>{if(!(!T||!s.get(T.id)?.ready)){if(x){$();return}x=T.id,H.dataset.open="false",u.dataset.open="false",D.setAttribute("aria-pressed","true"),D.textContent=t.pinning,X(S.pinStart)}}),q.addEventListener("click",()=>{!T||!s.get(T.id)?.ready||(q.disabled=!0,X(S.shot))}),m(".report").addEventListener("click",()=>X(S.context)),ke()}let Xe=m(".clearpin"),Ge=m(".pin-preview"),de=m(".send"),Re=new WeakMap;function xn(s){let p=Re.get(s);return p||(p=URL.createObjectURL(s.blob),Re.set(s,p)),p}function Ze(s){let p=Re.get(s);p&&(URL.revokeObjectURL(p),Re.delete(s))}m(".fab-label").textContent=t.fab,m("h2").textContent=t.title,H.setAttribute("aria-label",t.title),m(".brand-ico").replaceChildren(M("messageSquare",16)),m(".brand-sub").textContent=be(),m(".fab-ico").replaceChildren(M("messageSquare",14)),m(".x").replaceChildren(M("x",16)),m(".x").setAttribute("aria-label",t.close),m(".intro").textContent=t.intro,J(m(".report"),"plus",t.report,15),m(".lbl-type").textContent=t.type,m(".lbl-title").textContent=t.titleLabel,m(".lbl-details").textContent=t.details,m(".lbl-url").textContent=t.pageUrl,m(".lbl-loc").textContent=t.location,m(".lbl-att").textContent=t.attachments,m(".lbl-page").textContent=t.onThisPage,J(m(".board-link"),"arrowRight",t.openBoard),m(".lbl-apps").textContent=t.apps,m(".modal-title").textContent=t.reportTitle,k.setAttribute("aria-label",t.close),k.appendChild(M("x",16)),u.setAttribute("aria-label",t.reportTitle),I.textContent=t.cancel,m(".lbl-md").textContent=t.markdownHint,Me.placeholder=t.titlePlaceholder,ut.placeholder=t.detailsPlaceholder,J(ee,"pin",t.pin),J(Xe,"x",t.clear),J(m(".addfile"),"paperclip",t.addFile),J(m(".shot"),"camera",t.screenshot),de.textContent=t.submit;for(let s of Xr){let p=document.createElement("button");p.type="button",p.className="pill",p.dataset.type=s,p.textContent=t[s],p.setAttribute("aria-pressed",String(s===A)),p.addEventListener("click",()=>{A=s,U.querySelectorAll(".pill").forEach(v=>v.setAttribute("aria-pressed",String(v.dataset.type===s)))}),U.appendChild(p)}let yn=4,G=null,Ke=(s,p)=>{let v=Math.max(8,Math.min(s,window.innerWidth-80)),C=Math.max(8,Math.min(p,window.innerHeight-48));O.style.insetInlineEnd=`${v}px`,O.style.insetBlockEnd=`${C}px`},mt=Kr();Ke(mt?.right??e.position?.right??24,mt?.bottom??e.position?.bottom??24),O.addEventListener("pointerdown",s=>{if(s.button!==0)return;let p=O.getBoundingClientRect();G={x:s.clientX,y:s.clientY,ox:window.innerWidth-p.right,oy:window.innerHeight-p.bottom,moved:!1},O.setPointerCapture(s.pointerId)}),O.addEventListener("pointermove",s=>{if(!G)return;let p=s.clientX-G.x,v=s.clientY-G.y;!G.moved&&Math.hypot(p,v)<yn||(G.moved=!0,Ke(G.ox-p,G.oy-v))}),O.addEventListener("pointerup",s=>{if(!G)return;let p=G.moved;if(G=null,O.releasePointerCapture(s.pointerId),p){let v=O.getBoundingClientRect();Yr(window.innerWidth-v.right,window.innerHeight-v.bottom);return}ft()}),O.addEventListener("keydown",s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),ft())}),window.addEventListener("resize",()=>{let s=O.getBoundingClientRect();Ke(window.innerWidth-s.right,window.innerHeight-s.bottom)});function ft(){H.dataset.open==="true"?te():gt()}function gt(){le||(H.dataset.open="true",O.setAttribute("aria-expanded","true"),e.framedHost||(ht.value=location.href,m(".brand-sub").textContent=be()),ne())}function te(){H.dataset.open="false",H.dataset.detail="false",O.setAttribute("aria-expanded","false"),ae(!1),E?.(),E=null}let wn=[{key:"agents",path:"/agents",color:"#8b5cf6",label:t.appAgents},{key:"skills",path:"/skills",color:"#06b6d4",label:t.appSkills},{key:"issues",path:"/issues",color:"#f59e0b",label:t.appIssues},{key:"vault",path:"/vault",color:"#10b981",label:t.appVault},{key:"sources",path:"/sources",color:"#3b82f6",label:t.appSources},{key:"docs",path:"/library",color:"#f43f5e",label:t.appDocs},{key:"brain",path:"/brain",color:"#a855f7",label:t.appBrain},{key:"chat",path:"/chat",color:"#14b8a6",label:t.appChat},{key:"mcp",path:"/mcp",color:"#ec4899",label:t.appMcp},{key:"terminal",path:"/terminal",color:"#64748b",label:t.appTerminal}];function bt(){let s=(e.apiBase??"").trim();if(!s)return"";try{return new URL(s,location.href).origin}catch{return""}}let kn=(e.screensBase??"/builder").replace(/\/+$/,""),vt=(s,p)=>`${bt()}${kn}${s}${p?"?embed=1":""}`;function xt(s){let p=document.createElement("button");p.type="button",p.className="app",p.dataset.app=s.key;let v=document.createElement("span");v.className="app-ico",v.style.background=s.color,v.appendChild(M(qe(s.key)?s.key:"app",18));let C=document.createElement("span");C.textContent=s.label,p.append(v,C),p.addEventListener("click",()=>En(s)),vn.appendChild(p)}for(let s of wn)xt(s);(async()=>{try{let s=(e.apiBase??"").replace(/\/$/,""),p=await fetch(`${s}/api/builder/apps`,{credentials:"include",headers:{Accept:"application/json"}});if(!p.ok)return;let v=await p.json(),C=Array.isArray(v?.apps)?v.apps:[],X=t.dir==="rtl";for(let P of C){let D=typeof P?.slug=="string"?P.slug:"";if(!D)continue;let q=typeof P?.title?.en=="string"?P.title.en:D,Pe=typeof P?.title?.ar=="string"?P.title.ar:"";xt({key:D,path:`/apps/${D}`,color:typeof P?.color=="string"&&P.color?P.color:"#64748b",label:X&&Pe?Pe:q})}}catch{}})();function En(s){let p=bt(),v=vt(s.path,!0);if(p&&p!==location.origin){window.open(v,"_blank","noopener"),te();return}try{sessionStorage.setItem("builder:standalone","1"),sessionStorage.setItem("builder:standalone:return",location.href)}catch{}te(),location.assign(v)}let ce=null;w.addEventListener("pointerdown",s=>{if(s.target.closest(".modal-x"))return;let p=h.getBoundingClientRect();h.style.position="fixed",h.style.margin="0",h.style.left=`${p.left}px`,h.style.top=`${p.top}px`,ce={dx:s.clientX-p.left,dy:s.clientY-p.top},w.setPointerCapture(s.pointerId)}),w.addEventListener("pointermove",s=>{if(!ce)return;let p=h.getBoundingClientRect(),v=Math.min(Math.max(s.clientX-ce.dx,8-p.width+80),innerWidth-80),C=Math.min(Math.max(s.clientY-ce.dy,8),innerHeight-44);h.style.left=`${v}px`,h.style.top=`${C}px`});let yt=s=>{if(ce){ce=null;try{w.releasePointerCapture(s.pointerId)}catch{}}};w.addEventListener("pointerup",yt),w.addEventListener("pointercancel",yt);function Cn(){h.style.position="",h.style.left="",h.style.top="",h.style.margin=""}k.addEventListener("click",()=>ae(!1)),I.addEventListener("click",()=>ae(!1)),document.addEventListener("keydown",s=>{if(s.key==="Escape"){if(x){$();return}L&&!E&&ae(!1)}}),m(".x").addEventListener("click",te),o.addEventListener("keydown",s=>{s.key==="Escape"&&!E&&te()});function wt(s){H.dataset.open!=="true"||E||s.composedPath().includes(a)||te()}document.addEventListener("click",wt,!0);function ae(s){L=s,u.dataset.open=s?"true":"false",s?(Cn(),setTimeout(()=>Me.focus(),30)):(An(),E?.(),E=null)}m(".report").addEventListener("click",()=>ae(!0));function An(){ye.reset(),f=[],y.forEach(Ze),y=[],A="bug",U.querySelectorAll(".pill").forEach(s=>s.setAttribute("aria-pressed",String(s.dataset.type==="bug"))),pe(),we(),Z("")}function Z(s,p=""){Q.textContent=s,Q.className=`note ${p}`.trim(),Q.classList.toggle("hidden",!s)}e.framedHost||ee.addEventListener("click",()=>{if(E){E(),E=null,ee.setAttribute("aria-pressed","false"),J(ee,"pin",t.pin);return}H.dataset.open="false",u.dataset.open="false",ee.setAttribute("aria-pressed","true"),ee.textContent=t.pinning;let s=()=>{L?u.dataset.open="true":H.dataset.open="true"};E=Ne((p,v)=>{f.length<gn&&(f=[...f,p]),E=null,s(),pe(),v.classList.add("builder-pin-found"),setTimeout(()=>v.classList.remove("builder-pin-found"),3e3)},()=>{E=null,s(),pe()})}),Xe.addEventListener("click",()=>{f=[],pe()});function pe(){let s=f.length>0;ee.setAttribute("aria-pressed",String(s)),J(ee,"pin",s?t.pinAnother:t.pin),Xe.classList.toggle("hidden",!s),Ge.classList.toggle("hidden",!s),Ge.textContent="",f.forEach((p,v)=>{let C=document.createElement("div");C.className="pinrow";let X=document.createElement("span");X.className="pinnum",X.textContent=String(v+1);let P=p.name||p.hint||"",D=document.createElement("span");D.className="pintxt",D.textContent=`<${p.tag??"?"}>${P?` \u201C${P}\u201D`:""}`;let q=document.createElement("button");q.type="button",q.className="pindel",q.setAttribute("aria-label",`${t.clear} ${v+1}`),q.appendChild(M("x",12)),q.addEventListener("click",()=>{f.splice(v,1),pe()}),C.append(X,D,q),Ge.appendChild(C)})}m(".addfile").addEventListener("click",()=>Te.click()),Te.addEventListener("change",()=>{for(let s of Array.from(Te.files??[]))Ln(s);Te.value=""});function Ln(s){let p=Qt(s.type),v=it(p);if(s.size>v){Z(`${s.name} is ${Oe(s.size)} \u2014 the limit is ${Oe(v)}.`,"err");return}y.push({name:s.name,mime:s.type,size:s.size,kind:p,blob:s}),we(),Z("")}e.framedHost||m(".shot").addEventListener("click",async()=>{let s=m(".shot");s.disabled=!0;let p=H.dataset.open;H.dataset.open="false",a.style.visibility="hidden";try{await new Promise(v=>setTimeout(v,120)),y.push(await Fe()),we(),Z("")}catch(v){Z(String(v.message||v),"err")}finally{a.style.visibility="",H.dataset.open=p??"true",s.disabled=!1}});function we(){ct.replaceChildren(),y.forEach((s,p)=>{let v=document.createElement("div");if(v.className="file",s.kind==="screenshot"||s.kind==="image"){let D=document.createElement("img");D.className="thumb",D.src=xn(s),D.alt="",v.appendChild(D)}let C=document.createElement("span");C.className="nm",C.textContent=s.name;let X=document.createElement("span");X.textContent=Oe(s.size);let P=document.createElement("button");P.type="button",P.replaceChildren(M("x",12)),P.setAttribute("aria-label",t.clear),P.addEventListener("click",()=>{Ze(s),y.splice(p,1),we()}),v.append(C,X,P),ct.appendChild(v)})}async function kt(){if(B)return;let s=Me.value.trim();if(!s){Z(t.titleRequired,"err"),Me.focus();return}B=!0,de.disabled=!0,de.textContent=t.submitting;try{let p=m(".ctx-optout"),v=T?{console:[],network:[],viewport:{w:0,h:0,dpr:1},userAgent:"",locale:"",url:V?.url??"",title:V?.title??"",app:T}:void 0,C=await n.create({type:A,title:s,body:ut.value,route:be(V?.url),pageUrl:V?.url??location.href,locale:r,pins:f,attachments:y,context:_&&!p?.checked?_:v});Z(t.created(C.number),"ok"),e.onCreated?.(C),setTimeout(()=>{ae(!1),ne()},900)}catch(p){Z(String(p.message||t.failed),"err")}finally{B=!1,de.disabled=!1,de.textContent=t.submit}}de.addEventListener("click",kt),ye.addEventListener("submit",s=>{s.preventDefault(),kt()});async function ne(){if(!L){R.replaceChildren(re("div","empty",t.loading));try{c=await n.listByRoute(be(V?.url))}catch{c=[]}if(pt.textContent=c.length>9?"9+":String(c.length),pt.classList.toggle("hidden",c.length===0),m(".lbl-page").textContent=c.length?t.issueCount(c.length):t.onThisPage,R.replaceChildren(),!c.length){R.appendChild(re("div","empty",t.none));return}for(let s of c){let p=document.createElement("button");if(p.type="button",p.className="row",p.append(re("span","num",`#${s.number}`),re("span",`chip ${s.type}`,t[s.type])),p.appendChild(re("span","t",s.title)),s.busy){let C=re("span","agent-tag","");C.appendChild(re("span","spin","")),C.appendChild(re("span","who",s.agent||t.agentWorking)),C.setAttribute("title",s.agent?t.agentWorkingBy(s.agent):t.agentWorking),p.appendChild(C)}let v=M("chevronRight",14);v.classList.add("go"),p.appendChild(v),p.addEventListener("click",()=>void Sn(s.number)),R.appendChild(p)}}}async function Sn(s){F||(F=un(r,pn(e.apiBase),()=>{F?.el.classList.add("hidden"),d.classList.remove("hidden"),m(".report").classList.remove("hidden"),m(".apps").classList.remove("hidden"),H.dataset.detail="false",ne()},p=>vt(`/issues/${p}`,!0)),m(".body").appendChild(F.el)),d.classList.add("hidden"),m(".report").classList.add("hidden"),m(".apps").classList.add("hidden"),ae(!1),F.el.classList.remove("hidden"),H.dataset.detail="true",await F.load(s)}let Et=null;!e.framedHost&&e.bridge!==!1&&(Et=tn({locale:r,shellOrigins:e.shellOrigins,onActivate:()=>{le=!0,E?.(),E=null,te(),a.style.display="none"}}));let Tn={open:gt,close:te,refresh:()=>void ne(),destroy(){Et?.(),E?.(),y.forEach(Ze),document.removeEventListener("click",wt,!0),a.remove(),l.remove()}};return ne(),Tn}function Zr(e){try{let t=e.indexOf(",");if(t<0)return null;let n=/^data:([^;,]+)/.exec(e.slice(0,t))?.[1]||"image/png",r=atob(e.slice(t+1)),a=new Uint8Array(r.length);for(let f=0;f<r.length;f++)a[f]=r.charCodeAt(f);let o=new Blob([a],{type:n}),i=new Date,l=f=>String(f).padStart(2,"0");return{name:`screenshot-${`${i.getFullYear()}${l(i.getMonth()+1)}${l(i.getDate())}-${l(i.getHours())}${l(i.getMinutes())}${l(i.getSeconds())}`}.png`,mime:n,size:o.size,kind:"screenshot",blob:o}}catch{return null}}function re(e,t,n){let r=document.createElement(e);return r.className=t,r.textContent=n,r}function Kr(){try{let e=localStorage.getItem(bn);if(!e)return null;let t=JSON.parse(e);return typeof t?.right=="number"&&typeof t?.bottom=="number"?t:null}catch{return null}}function Yr(e,t){try{localStorage.setItem(bn,JSON.stringify({right:e,bottom:t}))}catch{}}function Jr(e){return/^#[0-9a-f]{3,8}$|^[a-z]+$|^(rgb|hsl)a?\([\d\s.,%/]+\)$/i.test(e.trim())?e.trim():""}return Dn(Qr);})();
