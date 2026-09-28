(() => {
  const realms = [
    ["Elementary Profound", ["#0d9488", "#14b8a6", "#5eead4"]], ["Nascent Profound", ["#059669", "#10b981", "#6ee7b7"]],
    ["True Profound", ["#1d4ed8", "#3b82f6", "#93c5fd"]], ["Spirit Profound", ["#06b6d4", "#22d3ee", "#a5f3fc"]],
    ["Earth Profound", ["#d97706", "#f59e0b", "#fde68a"]], ["Sky Profound", ["#0284c7", "#38bdf8", "#bae6fd"]],
    ["Emperor Profound", ["#dc2626", "#f97316", "#fef08a"]], ["Tyrant Profound", ["#7e22ce", "#a855f7", "#e9d5ff"]],
    ["Sovereign Profound", ["#94a3b8", "#e2e8f0", "#ffffff"]], ["Divine Origin", ["#06b6d4", "#67e8f9", "#ffffff"]],
    ["Divine Soul", ["#4f46e5", "#818cf8", "#c7d2fe"]], ["Divine Tribulation", ["#c026d3", "#e879f9", "#ffffff"]],
    ["Divine Spirit", ["#38bdf8", "#e0f2fe", "#ffffff"]], ["Divine King", ["#eab308", "#fde047", "#ffffff"]],
    ["Divine Sovereign", ["#7c3aed", "#a78bfa", "#f5d0fe"]], ["Divine Master", ["#ea580c", "#f97316", "#ffedd5"]],
    ["Divine Extinction", ["#3b0764", "#a855f7", "#ffffff"]], ["True God", ["#eab308", "#facc15", "#ffffff"]],
    ["Creation God", ["#ec4899", "#8b5cf6", "#06b6d4"]], ["Ancestor God", ["#fbbf24", "#f43f5e", "#38bdf8"]]
  ];
  const romanValues = [[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let badgeCounter = 0;
  const toRoman = (number) => { let value = Math.max(1, Math.min(10, Math.floor(Number(number) || 1))); let out = ""; for (const [n, glyph] of romanValues) while (value >= n) { out += glyph; value -= n; } return out; };
  const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const svgNS = "http://www.w3.org/2000/svg";
  function renderCultivationBadge(realmIndex, subLevelNumber, size = 45) {
    const index = Math.max(0, Math.min(19, Math.floor(Number(realmIndex) || 0)));
    const [name, colors] = realms[index]; const [base, energy, light] = colors; const idSuffix = `${index}-${++badgeCounter}`;
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size));
    svg.setAttribute("class", `cultivation-emblem emblem-${index + 1}`); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${name}, sub-level ${toRoman(subLevelNumber)}`);
    const title = document.createElementNS(svgNS, "title"); title.textContent = `${name} · ${toRoman(subLevelNumber)}`; svg.append(title);
    const center = `<path d="M50 32 65 41 65 59 50 68 35 59 35 41z" fill="url(#core${idSuffix})" stroke="${light}" stroke-width="2.2" stroke-linejoin="round"/><path d="m50 32 0 36m-15-27 15 9 15-9M35 59l15-9 15 9" fill="none" stroke="${light}" stroke-opacity=".72" stroke-width="1.15" stroke-linejoin="round"/><path d="m50 36 9 6-9 6-9-6z" fill="#fff" fill-opacity=".32"/>`;
    const numeralSize = toRoman(subLevelNumber).length > 2 ? 10 : 12;
    const roman = `<text class="badge-numeral" x="50" y="53" text-anchor="middle" dominant-baseline="middle" fill="#fff" stroke="#07141f" stroke-width="1.8" paint-order="stroke" font-family="ui-monospace, 'SFMono-Regular', monospace" font-size="${numeralSize}" font-weight="900" letter-spacing="-.7">${toRoman(subLevelNumber)}</text>`;
    const stars = (count, r1 = 43, r2 = 33) => Array.from({ length: count }, (_, i) => { const angle = Math.PI * 2 * i / count - Math.PI / 2; const x = 50 + Math.cos(angle) * r1, y = 50 + Math.sin(angle) * r1; return `<path d="M${x} ${y-r2/8} l1.8 5 5 1.2-5 1.8-1.8 5-1.7-5-5-1.8 5-1.2z" fill="${light}" opacity=".9"/>`; }).join("");
    const defs = `<defs><radialGradient id="core${idSuffix}"><stop stop-color="${light}"/><stop offset=".5" stop-color="${energy}"/><stop offset="1" stop-color="${base}" stop-opacity=".15"/></radialGradient><linearGradient id="metal${idSuffix}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".38" stop-color="${base}"/><stop offset="1" stop-color="#0b1424"/></linearGradient><filter id="glow${idSuffix}" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    const shapes = [
      `<path d="M50 4 87 19 78 59 50 94 22 59 13 19z" fill="url(#metal${idSuffix})" stroke="${light}" stroke-width="2.5"/><path d="m16 20-12-9 8 37 14 13zm68 0 12-9-8 37-14 13zM50 16 67 36 50 55 33 36z" fill="${base}" stroke="${energy}" stroke-width="2"/><path d="m31 59 19 24 19-24" fill="none" stroke="${light}" stroke-width="2"/>`,
      `<path d="M27 15C4 35 13 70 43 83L32 68C17 55 18 35 35 23zm46 0c23 20 14 55-16 68l11-15c15-13 14-33-3-45z" fill="${base}" stroke="${light}" stroke-width="2.5"/><path d="M31 22Q47 38 42 60M69 22Q53 38 58 60" fill="none" stroke="${light}" stroke-width="2"/><ellipse cx="50" cy="49" rx="13" ry="20" fill="url(#core${idSuffix})" stroke="${light}" stroke-width="2"/>`,
      `<path d="M50 5 72 12 94 27 88 61 50 95 12 61 6 27 28 12z" fill="url(#metal${idSuffix})" stroke="${light}" stroke-width="2.5"/><path d="m8 25-7-13 24 8 5 15zm84 0 7-13-24 8-5 15z" fill="${base}" stroke="${energy}" stroke-width="2"/><path d="M25 24 50 36 75 24 68 66 50 83 32 66z" fill="none" stroke="${energy}" stroke-width="2.5"/><path d="m50 30 12 19-12 19-12-19z" fill="url(#core${idSuffix})" stroke="${light}" stroke-width="2"/>`,
      `<path d="M48 49C29 3 9 13 15 42l18 10C8 43 10 69 38 66L50 94l12-28c28 3 30-23 5-14l18-10C91 13 71 3 52 49z" fill="${base}" fill-opacity=".62" stroke="${light}" stroke-width="2.5"/><path d="M38 40 18 23m44 17 20-17M35 57 15 58m50-1 20 1M50 25v15" stroke="${light}" stroke-width="2"/>`,
      `<path d="M50 4 68 15 91 15 85 39 96 55 77 67 72 91 50 82 28 91 23 67 4 55 15 39 9 15 32 15z" fill="url(#metal${idSuffix})" stroke="${light}" stroke-width="2.5"/><path d="M17 22h20v16H17zm46 0h20v16H63zM17 62h20v16H17zm46 0h20v16H63z" fill="${base}" stroke="${energy}" stroke-width="2"/><path d="m50 16 9 18-9 11-9-11zM50 55l11 12-11 16-11-16z" fill="none" stroke="${light}" stroke-width="3"/>`,
      `<path d="M48 53Q9 20 4 32q16 0 37 30L9 52l30 26-1-13 12 26 12-26-1 13 30-26-32 10q21-30 37-30-5-12-44 21z" fill="${base}" stroke="${light}" stroke-width="2.2"/><path d="M18 39 43 55M82 39 57 55M24 57 43 65M76 57 57 65" stroke="${energy}" stroke-width="2"/><circle cx="50" cy="49" r="25" fill="none" stroke="${light}" stroke-width="2"/>`,
      `<path d="M50 7 59 27 77 12 74 34 94 29 80 48 96 59 73 62 77 87 57 72 50 96 43 72 23 87 27 62 4 59 20 48 6 29 26 34 23 12 41 27z" fill="${base}" stroke="${light}" stroke-width="2.2"/><path d="M31 30 50 41 69 30 64 54 50 70 36 54z" fill="${energy}" stroke="${light}" stroke-width="2"/><path d="m50 17 8 20m-8-20-8 20M21 48l19 5m39-5-19 5" stroke="#fef08a" stroke-width="2.5"/>`,
      `<path d="m50 3 10 24 18-20-8 28 26-4-20 19 20 15-27-1 5 29-18-22-6 27-10-26-18 20 8-28-26 4 20-19L4 34l27 1-5-29 18 22z" fill="#17132c" stroke="${light}" stroke-width="2"/><path d="M50 10 59 38 85 35 64 52 75 78 51 63 30 83 38 56 14 43 41 41z" fill="${base}" stroke="${energy}" stroke-width="2.5"/><path d="m22 27 18 15-8 15m46-30L60 42l8 15M50 8v21" fill="none" stroke="${light}" stroke-width="2.5"/>`,
      `<path d="M50 3 59 38 94 14 67 47 98 50 67 56 94 86 59 63 50 98 41 63 6 86 33 56 2 50 33 47 6 14 41 38z" fill="url(#metal${idSuffix})" stroke="${light}" stroke-width="2"/><ellipse cx="50" cy="50" rx="30" ry="13" transform="rotate(-35 50 50)" fill="none" stroke="${energy}" stroke-width="3"/><ellipse cx="50" cy="50" rx="30" ry="13" transform="rotate(35 50 50)" fill="none" stroke="${light}" stroke-width="2"/>`,
      `<g fill="${base}" stroke="${light}" stroke-width="2">${Array.from({length:8},(_,i)=>`<path d="M50 17C37 29 37 39 50 49 63 39 63 29 50 17z" transform="rotate(${i*45} 50 50)"/>`).join("")}</g><circle cx="50" cy="50" r="13" fill="url(#core${idSuffix})" stroke="${light}" stroke-width="2"/>${stars(8,42,32)}`,
      `<path d="M50 9 57 39 85 20 66 46 94 50 66 55 84 81 57 62 50 92 43 62 16 81 34 55 6 50 34 46 15 20 43 39z" fill="none" stroke="${base}" stroke-width="4"/><path d="M50 17 77 50 50 83 23 50zM23 50 77 50M50 17v66" fill="none" stroke="${energy}" stroke-width="2"/><circle cx="50" cy="50" r="6" fill="${light}"/>${stars(6,40,30)}`,
      `<circle cx="50" cy="50" r="36" fill="#151020" stroke="${base}" stroke-width="3"/><path d="M50 8 59 37 83 19 67 44 94 50 67 56 83 81 59 63 50 92 41 63 17 81 33 56 6 50 33 44 17 19 41 37z" fill="none" stroke="${energy}" stroke-width="3"/><path d="M13 25 40 43M87 25 60 43M15 75l26-18m44 18L59 57" stroke="${light}" stroke-width="4"/>`,
      `<path d="M50 5 56 39 81 18 63 45 94 50 63 55 81 82 56 61 50 95 44 61 19 82 37 55 6 50 37 45 19 18 44 39z" fill="${base}" stroke="${light}" stroke-width="2.5"/><path d="M50 16 84 50 50 84 16 50z" fill="url(#core${idSuffix})" stroke="${energy}" stroke-width="2"/><path d="M25 20q-17 30 0 60m50-60q17 30 0 60" fill="none" stroke="${light}" stroke-width="3"/>`,
      `<circle cx="50" cy="50" r="35" fill="none" stroke="${base}" stroke-width="4"/><circle cx="50" cy="50" r="26" fill="none" stroke="${energy}" stroke-width="2"/><path d="M50 4 59 33 86 14 67 41 96 50 67 59 86 86 59 67 50 96 41 67 14 86 33 59 4 50 33 41 14 14 41 33z" fill="${base}" stroke="${light}" stroke-width="2"/><circle cx="50" cy="50" r="13" fill="url(#core${idSuffix})"/>`,
      `<path d="M50 5 58 36 85 18 67 45 96 50 67 56 85 83 58 65 50 96 42 65 15 83 33 56 4 50 33 45 15 18 42 36z" fill="#17142b" stroke="${base}" stroke-width="3"/><circle cx="50" cy="50" r="22" fill="none" stroke="${energy}" stroke-width="3"/><path d="M50 15v19m0 32v19M15 50h19m32 0h19M26 26l14 14m20 20 14 14m0-48L60 40M40 60 26 74" stroke="${light}" stroke-width="2"/>`,
      `<circle cx="50" cy="50" r="41" fill="none" stroke="${base}" stroke-width="7"/><circle cx="50" cy="50" r="32" fill="none" stroke="${light}" stroke-width="2"/><circle cx="50" cy="50" r="22" fill="url(#core${idSuffix})" stroke="${energy}" stroke-width="3"/><path d="M50 4v18m0 56v18M4 50h18m56 0h18M18 18l13 13m38 38 13 13m0-64L69 31M31 69 18 82" stroke="${light}" stroke-width="4"/>`,
      `<circle cx="50" cy="50" r="28" fill="#03040b" stroke="${light}" stroke-width="3"/><circle cx="50" cy="50" r="37" fill="none" stroke="${base}" stroke-width="4" stroke-dasharray="9 4"/><ellipse cx="50" cy="50" rx="45" ry="20" transform="rotate(-34 50 50)" fill="none" stroke="${energy}" stroke-width="2.5"/><ellipse cx="50" cy="50" rx="45" ry="20" transform="rotate(34 50 50)" fill="none" stroke="${light}" stroke-opacity=".6" stroke-width="1.5"/>`,
      `<path d="M50 7 60 24 77 14 75 34 94 40 78 51 91 69 69 68 63 91 50 76 37 91 31 68 9 69 22 51 6 40 25 34 23 14 40 24z" fill="${base}" stroke="${light}" stroke-width="2.5"/><path d="M50 23 70 50 50 77 30 50z" fill="url(#metal${idSuffix})" stroke="${energy}" stroke-width="2"/><path d="M37 53q13-26 26 0-13 23-26 0z" fill="${light}"/>`,
      `<g fill="${base}" stroke="${light}" stroke-width="1.5">${Array.from({length:12},(_,i)=>`<path d="M50 4 55 34 50 42 45 34z" transform="rotate(${i*30} 50 50)"/>`).join("")}</g><path d="M17 50a33 33 0 1 0 66 0 33 33 0 1 0-66 0M25 50a25 25 0 1 1 50 0 25 25 0 1 1-50 0" fill="none" stroke="${energy}" stroke-width="3"/><ellipse cx="50" cy="50" rx="17" ry="11" fill="${light}"/><circle cx="50" cy="50" r="7" fill="#09111d"/>`
    ];
    svg.innerHTML += `${defs}<g filter="url(#glow${idSuffix})">${shapes[index]}${center}${roman}</g>`;
    return svg;
  }
  const particles = Object.fromEntries(realms.map(([name, colors], i) => [i + 1, colors]));
  function playBreakthrough({ badge, level, realmName, incomingEmblem }) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { if (incomingEmblem) badge.replaceChildren(incomingEmblem); return; }
    const canvas = document.createElement("canvas"); canvas.id = "breakthroughCanvas";
    Object.assign(canvas.style, { position:"fixed", inset:"0", width:"100vw", height:"100vh", pointerEvents:"none", zIndex:"9999", mixBlendMode:"screen" });
    document.body.append(canvas); const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, devicePixelRatio || 1); let width, height;
    const resize = () => { width = canvas.width = innerWidth*dpr; height = canvas.height = innerHeight*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); };
    resize(); addEventListener("resize", resize, { once:true });
    const rect = badge.getBoundingClientRect(); const cx = rect.left+rect.width/2, cy = rect.top+rect.height/2;
    const colors = particles[level] || particles[1], embers = [];
    const vortex = Array.from({length:82},(_,i)=>({a:Math.random()*Math.PI*2,r:Math.max(innerWidth,innerHeight)*(.45+Math.random()*.38),speed:.003+Math.random()*.012,offset:i/82*Math.PI*2,color:colors[i%colors.length],size:1.5+Math.random()*3}));
    const start = performance.now(); badge.querySelector(".cultivation-emblem")?.classList.add("cultivator-tremble");
    const toast = document.createElement("div"); toast.className="breakthrough-toast"; toast.setAttribute("role","status"); toast.setAttribute("aria-live","polite"); toast.textContent=`✨ REALM BREAKTHROUGH: ASCENDED TO ${realmName.toUpperCase()} REALM ✨`; document.body.append(toast);
    let singularityStarted = false, manifested = false;
    const frame = (now) => {
      const t=(now-start)/1000; ctx.clearRect(0,0,innerWidth,innerHeight);
      if(t<1.2){ const p=t/1.2; for(const mote of vortex){ mote.a+=mote.speed; mote.r*=.989; const x=cx+Math.cos(mote.a+p*5+mote.offset)*mote.r*(1-p*.45); const y=cy+Math.sin(mote.a+p*5+mote.offset)*mote.r*(1-p*.45); ctx.globalAlpha=.35+p*.65; ctx.fillStyle=mote.color; ctx.shadowColor=mote.color;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(x,y,mote.size,0,Math.PI*2);ctx.fill(); } }
      if(t>=1.2&&t<1.65){ if(!singularityStarted){singularityStarted=true;badge.style.transform="scale(0)";} const p=(t-1.2)/.45; const radius=Math.max(innerWidth,innerHeight)*p*.9; const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(innerWidth,innerHeight)*.75);glow.addColorStop(0,`rgba(255,255,255,${.8*(1-p)})`);glow.addColorStop(.25,`rgba(94,234,212,${.38*(1-p)})`);glow.addColorStop(1,"rgba(255,255,255,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,innerWidth,innerHeight);ctx.strokeStyle=`rgba(255,255,255,${1-p})`;ctx.lineWidth=6*(1-p);ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke(); }
      if(t>=1.6&&!manifested){ manifested=true; if(incomingEmblem) badge.replaceChildren(incomingEmblem); badge.style.transform=""; badge.classList.add("realm-manifest"); }
      if(t>=1.6&&t<2.8){ const p=(t-1.6)/1.2; if(!embers.length) for(let i=0;i<32;i++){const a=Math.random()*Math.PI*2;embers.push({x:cx,y:cy,vx:Math.cos(a)*(2+Math.random()*5),vy:Math.sin(a)*(2+Math.random()*5),color:i%2?"#fbbf24":"#67e8f9",life:1,size:2+Math.random()*4});} for(const e of embers){e.x+=e.vx;e.y+=e.vy;e.vy+=.035;e.life-=.012;ctx.globalAlpha=Math.max(0,e.life);ctx.fillStyle=e.color;ctx.shadowColor=e.color;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(e.x,e.y,e.size*e.life,0,Math.PI*2);ctx.fill();} ctx.globalAlpha=1;ctx.strokeStyle=`rgba(103,232,249,${1-p})`;ctx.lineWidth=3*(1-p);ctx.beginPath();ctx.arc(cx,cy,p*Math.max(innerWidth,innerHeight)*.65,0,Math.PI*2);ctx.stroke(); }
      if(t<2.8) requestAnimationFrame(frame); else { badge.querySelector(".cultivation-emblem")?.classList.remove("cultivator-tremble"); badge.classList.remove("realm-manifest"); badge.style.transform=""; canvas.remove(); toast.remove(); }
    };
    badge.classList.add("realm-manifest"); requestAnimationFrame(frame); setTimeout(()=>toast.classList.add("shown"),25); setTimeout(()=>toast.classList.remove("shown"),2600);
  }
  window.CultivationVisuals = { realms, toRoman, renderCultivationBadge, playBreakthrough };
  window.toRoman = toRoman;
  window.renderCultivationBadge = renderCultivationBadge;
})();
