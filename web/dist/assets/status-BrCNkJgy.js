import{au as u,j as n,aw as d,av as m,ax as g,ay as f,e as s}from"./index-CidsbO-M.js";/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c={name:"circle",size:24,node:[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]]};c.node;const p=u(c),y={neutral:p,info:f,success:g,warning:m,danger:d},a={neutral:"text-muted-foreground",info:"text-nq-info-text",success:"text-nq-success-text",warning:"text-nq-warning-text",danger:"text-nq-danger-text"};function j({tone:e="neutral",icon:r,tinted:i=!1,className:o,children:t,...x}){const l=r??y[e];return n.jsxs("span",{"data-slot":"status","data-tone":e,className:s("inline-flex min-w-0 items-center gap-1.5 text-body-sm",i?a[e]:"text-foreground",o),...x,children:[n.jsx(l,{"aria-hidden":!0,className:s("size-3.5 shrink-0",a[e])}),n.jsx("span",{className:"truncate",title:typeof t=="string"?t:void 0,children:t})]})}export{j as S};
