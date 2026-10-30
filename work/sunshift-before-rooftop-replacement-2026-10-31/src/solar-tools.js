const ROOF_W = 800;
const ROOF_H = 500;
const FEET_PER_PIXEL = 0.125;
const BUFFER = 0.15;
const SQFT_PER_KW = 100;
const PANEL_WATTS = 540;
const YIELD_PER_KW_MONTH = 120;
const SYSTEM_COST_PER_KW = 60000;
const TARIFF = 7;
const SQUARE_FEET_TO_SQM = 0.092903;
const CFA_GENERAL = kw => Math.min(kw, 2) * 30000 + Math.max(0, Math.min(kw, 3) - 2) * 18000;
const ROOF_PRESETS = {
  'Small villa': [[250,150],[520,150],[520,250],[580,250],[580,360],[250,360]],
  'Apartment roof': [[180,110],[620,110],[620,390],[180,390]],
  'Independent house': [[260,140],[500,130],[560,230],[520,370],[290,360],[230,250]]
};
const ROOF_STEPS = ['Measuring the outlined area…','Applying a 15% roof-obstruction allowance…','Estimating panel capacity at 100 sq ft per kW…','Estimating monthly generation from a planning yield…','Estimate ready.'];
const inr = value => '₹' + Math.round(value).toLocaleString('en-IN');
const areaFt = points => {
  if (points.length < 3) return 0;
  let total = 0;
  points.forEach(([x,y],i) => { const [nx,ny] = points[(i+1)%points.length]; total += x*ny - nx*y; });
  return Math.abs(total)/2 * FEET_PER_PIXEL * FEET_PER_PIXEL;
};
const generalCfa = kw => CFA_GENERAL(Math.max(0,kw));

export function renderRooftopEstimator(root, onUseSize, settings = {}) {
  const currentTariff = Number(settings.tariff) || TARIFF;
  const presetButtons = Object.keys(ROOF_PRESETS).map(name => `<button class="roof-chip" type="button" data-preset="${name}">${name}</button>`).join('');
  root.innerHTML = `<div class="roof-tool"><div class="roof-tool-intro"><div><span class="roof-kicker">ROOF PLANNING · ILLUSTRATIVE TOOL</span><h2>Rooftop area &amp; solar capacity</h2><p>Trace a roof or choose a sample shape. This canvas is illustrative, not satellite imagery; area and output are planning estimates.</p></div><div class="roof-units" role="group" aria-label="Area units"><button type="button" data-unit="ft" class="active">sq ft</button><button type="button" data-unit="m">m²</button></div></div><div class="roof-layout"><div class="roof-map-column"><div class="roof-tools">${presetButtons}<button class="roof-chip" type="button" id="roof-undo">Undo</button><button class="roof-chip roof-clear" type="button" id="roof-clear">Clear</button></div><div class="roof-canvas-wrap"><canvas id="roof-canvas" width="${ROOF_W}" height="${ROOF_H}" role="img" aria-label="Illustrative roof drawing canvas. Click to place outline points, then click the first point to close the outline."></canvas><span class="roof-canvas-label">Illustrative grid · 100 ft wide</span><span class="roof-area-label" id="roof-area-label"></span><span class="roof-layout-label" id="roof-layout-label" hidden>Illustrative panel pattern · not an engineered layout</span></div><p id="roof-hint" aria-live="polite">Choose a roof preset or click to place at least three corners.</p><button id="roof-analyze" class="roof-primary" type="button" disabled>Estimate roof potential</button></div><div class="roof-results"><div class="roof-progress-head"><b>Roof estimate</b><span id="roof-progress">Waiting for outline</span></div><div class="roof-progress"><i id="roof-progress-bar"></i></div><ol id="roof-steps"><li>Outline a roof to begin.</li></ol><div class="roof-stats" id="roof-stats"><article><small>USABLE AREA</small><b>—</b><span>After obstruction allowance</span></article><article><small>ESTIMATED CAPACITY</small><b>—</b><span>100 sq ft per kW assumption</span></article><article><small>MONTHLY GENERATION</small><b>—</b><span>120 kWh per kW per month</span></article><article><small>PANEL COUNT</small><b>—</b><span>540 W panels assumed</span></article></div><button id="roof-use-size" class="roof-secondary" type="button" disabled>Use capacity in home settings · max 10 kWp</button><div class="roof-finance" id="roof-finance" hidden></div><p class="roof-disclaimer">Indicative only: final capacity depends on roof strength, orientation, shade, setbacks, equipment and installer survey. CFA is a general-category estimate; actual eligibility, state rules and approved system size may differ. Verify on the official <a href="https://pmsuryaghar.gov.in/" target="_blank" rel="noreferrer">PM Surya Ghar portal</a>.</p></div></div></div>`;

  const canvas = root.querySelector('#roof-canvas');
  const ctx = canvas.getContext('2d');
  const stats = root.querySelector('#roof-stats');
  const hint = root.querySelector('#roof-hint');
  const progressText = root.querySelector('#roof-progress');
  const progressBar = root.querySelector('#roof-progress-bar');
  const stepsEl = root.querySelector('#roof-steps');
  const areaLabel = root.querySelector('#roof-area-label');
  const analyzeBtn = root.querySelector('#roof-analyze');
  const useBtn = root.querySelector('#roof-use-size');
  let points = [];
  let closed = false;
  let unit = 'ft';
  let estimate = null;
  let timer = null;
  const gross = () => areaFt(points);
  const displayArea = value => unit === 'ft' ? `${Math.round(value).toLocaleString('en-IN')} sq ft` : `${(value*SQUARE_FEET_TO_SQM).toFixed(1)} m²`;
  const resetEstimate = () => {
    clearInterval(timer); timer = null; estimate = null;
    progressText.textContent = closed ? 'Ready to estimate' : 'Waiting for outline';
    progressBar.style.width = '0%'; stepsEl.innerHTML = '<li>Outline a roof to begin.</li>';
    stats.innerHTML = '<article><small>USABLE AREA</small><b>—</b><span>After obstruction allowance</span></article><article><small>ESTIMATED CAPACITY</small><b>—</b><span>100 sq ft per kW assumption</span></article><article><small>MONTHLY GENERATION</small><b>—</b><span>120 kWh per kW per month</span></article><article><small>PANEL COUNT</small><b>—</b><span>540 W panels assumed</span></article>';
    useBtn.disabled = true; root.querySelector('#roof-finance').hidden = true;
    analyzeBtn.disabled = !closed; analyzeBtn.textContent = 'Estimate roof potential';
  };
  const draw = () => {
    ctx.clearRect(0,0,ROOF_W,ROOF_H);
    const bg = ctx.createLinearGradient(0,0,ROOF_W,ROOF_H); bg.addColorStop(0,'#172e31'); bg.addColorStop(1,'#102126');
    ctx.fillStyle=bg;ctx.fillRect(0,0,ROOF_W,ROOF_H);
    ctx.strokeStyle='rgba(148,180,165,.12)';ctx.lineWidth=1;
    for(let x=0;x<=ROOF_W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ROOF_H);ctx.stroke()}
    for(let y=0;y<=ROOF_H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(ROOF_W,y);ctx.stroke()}
    if(points.length){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(closed)ctx.closePath();
      if(closed){ctx.fillStyle='rgba(81,197,143,.18)';ctx.fill();if(estimate){ctx.save();ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();for(let y=92;y<ROOF_H;y+=29)for(let x=65;x<ROOF_W;x+=48){ctx.fillStyle='rgba(49,153,164,.62)';ctx.fillRect(x,y,42,23);ctx.strokeStyle='rgba(165,225,215,.6)';ctx.lineWidth=1;ctx.strokeRect(x,y,42,23)}ctx.restore()}}
      ctx.strokeStyle='#78dba2';ctx.lineWidth=3;ctx.stroke();
      points.forEach(([x,y],i)=>{ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fillStyle=i===0?'#f1c66f':'#78dba2';ctx.fill();ctx.strokeStyle='#092018';ctx.lineWidth=2;ctx.stroke()});
    }
    areaLabel.textContent=closed?`Outlined area: ${displayArea(gross())}`:'';
    root.querySelector('#roof-layout-label').hidden=!estimate;
    analyzeBtn.disabled=!closed;
    hint.textContent=closed?'Roof outline closed. Run the estimate.':points.length>=3?'Click near the first point to close the roof outline.':'Click to place roof corners, or pick a preset.';
  };
  const setPreset = name => {points=ROOF_PRESETS[name].map(p=>[...p]);closed=true;root.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));resetEstimate();draw()};
  root.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>setPreset(button.dataset.preset));
  root.querySelector('#roof-clear').onclick=()=>{points=[];closed=false;root.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));resetEstimate();draw()};
  root.querySelector('#roof-undo').onclick=()=>{if(closed)closed=false;else points.pop();root.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));resetEstimate();draw()};
  root.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>{unit=button.dataset.unit;root.querySelectorAll('[data-unit]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button))});draw();if(estimate)showEstimate()});
  canvas.addEventListener('click',event=>{
    if(closed)return;
    const rect=canvas.getBoundingClientRect();const x=(event.clientX-rect.left)/rect.width*ROOF_W;const y=(event.clientY-rect.top)/rect.height*ROOF_H;
    if(points.length>=3&&Math.hypot(x-points[0][0],y-points[0][1])<18){closed=true;resetEstimate();draw();return}
    points.push([x,y]);root.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active'));resetEstimate();draw();
  });
  const showEstimate=()=>{
    const grossArea=gross();const usable=grossArea*(1-BUFFER);const kw=usable/SQFT_PER_KW;const panels=Math.floor(kw*1000/PANEL_WATTS);const monthlyKwh=kw*YIELD_PER_KW_MONTH;
    estimate={kw,usableSqFt:usable,panels,monthlyKwh};
    stats.innerHTML=`<article><small>USABLE AREA</small><b>${displayArea(usable)}</b><span>15% obstruction buffer</span></article><article><small>ESTIMATED CAPACITY</small><b>${kw.toFixed(2)} kW</b><span>${SQFT_PER_KW} sq ft per kW</span></article><article><small>MONTHLY GENERATION</small><b>${Math.round(monthlyKwh).toLocaleString('en-IN')} kWh</b><span>At ${YIELD_PER_KW_MONTH} kWh/kW/month</span></article><article><small>PANEL COUNT</small><b>${panels}</b><span>${PANEL_WATTS} W panels assumed</span></article>`;
    const cost=kw*SYSTEM_COST_PER_KW;const cfa=generalCfa(kw);const monthlySave=monthlyKwh*currentTariff;const payback=monthlySave>0?(cost-cfa)/(monthlySave*12):0;
    const finance=root.querySelector('#roof-finance');finance.hidden=false;finance.innerHTML=`<b>Indicative finances</b><div><span>Installed cost assumed</span><strong>${inr(cost)}</strong></div><div><span>Estimated central subsidy</span><strong>− ${inr(cfa)}</strong></div><div><span>Net estimate</span><strong>${inr(Math.max(0,cost-cfa))}</strong></div><div><span>Monthly bill offset at ₹${currentTariff}/unit</span><strong>${inr(monthlySave)}</strong></div><div><span>Simple payback estimate</span><strong>${payback.toFixed(1)} years</strong></div><small>₹60,000/kW and ₹${currentTariff}/unit are assumptions, not a vendor quote. Subsidy formula uses general-state residential CFA: ₹30,000/kW for first 2 kW, ₹18,000/kW for next 1 kW, capped at ₹78,000.</small>`;
    useBtn.disabled=false;
  };
  analyzeBtn.onclick=()=>{
    if(!closed||timer)return;
    analyzeBtn.disabled=true;analyzeBtn.textContent='Estimating…';progressText.textContent='Calculating from outline';stepsEl.innerHTML='';let step=0;
    const advance=()=>{const li=document.createElement('li');li.textContent=ROOF_STEPS[step];stepsEl.append(li);step++;progressBar.style.width=`${Math.round(step/ROOF_STEPS.length*100)}%`;progressText.textContent=step<ROOF_STEPS.length?'Estimating…':'Estimate complete';if(step>=ROOF_STEPS.length){clearInterval(timer);timer=null;analyzeBtn.disabled=false;analyzeBtn.textContent='Recalculate estimate';showEstimate()}};
    advance();timer=setInterval(advance,360);
  };
  useBtn.onclick=()=>{if(estimate)onUseSize(estimate.kw)};
  root.querySelectorAll('[data-unit]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.unit===unit)));
  draw();
}

export function renderSolarSavingsCalculator(root, onUseSize, settings = {}) {
  const sizes=[1,2,3,4,5,6,7.5,10];
  const initialRate=Math.max(4,Math.min(20,Number(settings.tariff)||8));
  const initialBill=Math.max(1000,Math.min(30000,Math.round(((Number(settings.dailyUseKwh)||15.63)*30*initialRate)/500)*500));
  root.innerHTML=`<div class="solar-calc"><header><span class="solar-kicker">SOLAR SAVINGS · PLANNING ESTIMATE</span><h2>Estimate system size, savings &amp; payback</h2><p>We prefilled your saved daily-use and tariff settings. Adjust the bill and rate to match your latest electricity bill.</p></header><div class="solar-calc-grid"><section class="solar-input-card"><label for="solar-bill-number">Average monthly bill</label><div class="solar-bill-wrap"><span>₹</span><input id="solar-bill-number" type="number" min="1000" max="30000" step="100" value="${initialBill}" inputmode="numeric"></div><input id="solar-bill" type="range" min="1000" max="30000" step="500" value="${initialBill}"><div class="solar-scale"><span>₹1,000</span><span>₹30,000</span></div><label for="solar-rate">Electricity rate</label><div class="solar-rate-label" id="solar-rate-label">₹${initialRate.toFixed(1)} / unit</div><input id="solar-rate" type="range" min="4" max="20" step="0.5" value="${initialRate}"><div class="solar-scale"><span>₹4</span><span>₹20</span></div><p class="solar-hint">Use the per-unit rate shown on your latest bill for a better estimate.</p><div class="solar-facts"><article><b id="solar-units">—</b><small>estimated units used/month</small></article><article><b id="solar-generation">—</b><small>estimated generation/month</small></article></div></section><section class="solar-result-card" aria-live="polite"><div class="solar-size"><b id="solar-kw">—</b><span>kW recommended system size</span></div><div class="solar-monthly"><b id="solar-monthly">—</b><span>estimated monthly bill offset (up to 85%)</span></div><div class="solar-result-stats"><article><b id="solar-annual">—</b><small>estimated savings/year</small></article><article><b id="solar-payback">—</b><small>simple payback estimate</small></article><article><b id="solar-co2">—</b><small>CO₂ avoided/year at 0.71 kg/kWh</small></article></div><div class="solar-cost-lines"><div><span>Indicative installed cost</span><b id="solar-gross">—</b></div><div><span>Estimated central subsidy (CFA)</span><b id="solar-subsidy">—</b></div><div class="solar-net"><span>Indicative cost after CFA</span><b id="solar-net">—</b></div><div class="solar-subsidy-bar"><i id="solar-subsidy-part"></i><i id="solar-net-part"></i></div></div><button id="solar-use-size" type="button" class="solar-action">Use system size in home settings</button><div class="solar-actions"><button id="solar-copy-quote" type="button">Copy installer quote request</button><button id="solar-print" type="button">Print / save proposal as PDF</button></div><p id="solar-message" class="solar-message" aria-live="polite"></p><p class="solar-disclaimer">Planning only: assumes 120 kWh per kW/month, ₹50,000/kW installed cost, general-state CFA slabs (₹30,000/kW for first 2 kW and ₹18,000/kW for next 1 kW, capped at ₹78,000), 85% bill-offset limit, and 0.71 kg CO₂/kWh. Actual tariffs, yield, vendor cost, shade, eligibility and state/category subsidy vary. Confirm CFA on the <a href="https://pmsuryaghar.gov.in/" target="_blank" rel="noreferrer">official PM Surya Ghar portal</a>. Payback excludes financing, maintenance and tariff changes.</p></section></div><div class="solar-print-sheet" id="solar-print-sheet"></div></div>`;
  const $=selector=>root.querySelector(selector);const billRange=$('#solar-bill');const billNumber=$('#solar-bill-number');const rateRange=$('#solar-rate');let current={};
  const update=()=>{
    const bill=Math.max(1000,Math.min(30000,Number(billNumber.value)||1000));const rate=Number(rateRange.value);billRange.value=String(Math.max(1000,Math.min(30000,Math.round(bill/500)*500)));
    const units=bill/rate;const raw=units/YIELD_PER_KW_MONTH;const kw=sizes.reduce((best,size)=>Math.abs(size-raw)<Math.abs(best-raw)?size:best,sizes[0]);const gen=kw*YIELD_PER_KW_MONTH;const gross=kw*50000;const cfa=generalCfa(kw);const net=Math.max(0,gross-cfa);const monthly=Math.min(bill*0.85,gen*rate);const annual=monthly*12;const years=annual?net/annual:null;const co2=gen*12*0.71/1000;
    const fmt=n=>inr(n);$('#solar-rate-label').textContent=`₹${rate.toFixed(1)} / unit`;$('#solar-units').textContent=Math.round(units).toLocaleString('en-IN');$('#solar-generation').textContent=Math.round(gen).toLocaleString('en-IN');$('#solar-kw').textContent=Number.isInteger(kw)?String(kw):kw.toFixed(1);$('#solar-monthly').textContent=fmt(monthly);$('#solar-annual').textContent=fmt(annual);$('#solar-payback').textContent=years==null?'—':`${years.toFixed(1)} years`;$('#solar-co2').textContent=`${co2.toFixed(2)} t`;
    $('#solar-gross').textContent=fmt(gross);$('#solar-subsidy').textContent='− '+fmt(cfa);$('#solar-net').textContent=fmt(net);$('#solar-subsidy-part').style.width=`${gross?cfa/gross*100:0}%`;$('#solar-net-part').style.width=`${gross?net/gross*100:0}%`;
    current={kw,bill,rate,units,gen,gross,cfa,net,monthly,annual,years,co2};
    $('#solar-print-sheet').innerHTML=`<h1>SunShift India · Rooftop solar estimate</h1><p>Generated ${new Date().toLocaleDateString('en-IN')}</p><h2>${kw} kW suggested system</h2><p>Bill ₹${Math.round(bill).toLocaleString('en-IN')}/month · Rate ₹${rate.toFixed(1)}/unit · Estimated use ${Math.round(units)} kWh/month · Generation ${Math.round(gen)} kWh/month</p><p>Indicative installed cost ${fmt(gross)} · Estimated central CFA − ${fmt(cfa)} · Indicative net ${fmt(net)} · Estimated bill offset ${fmt(monthly)}/month · Simple payback ${years==null?'—':years.toFixed(1)+' years'}</p><p>These are estimates, not a vendor quote or subsidy approval. Assumptions: 120 kWh/kW/month, ₹50,000/kW, general-state CFA slabs with ₹78,000 cap, bill offset capped at 85%. Confirm scheme terms on the official PM Surya Ghar portal. No financing, maintenance or tariff changes included.</p>`;
    billRange.style.setProperty('--p',`${(Number(billRange.value)-1000)/29000*100}%`);rateRange.style.setProperty('--p',`${(rate-4)/16*100}%`);
  };
  billRange.oninput=()=>{billNumber.value=billRange.value;update()};billNumber.oninput=update;billNumber.onblur=()=>{billNumber.value=String(Math.max(1000,Math.min(30000,Math.round((Number(billNumber.value)||1000)/100)*100)));update()};rateRange.oninput=update;
  $('#solar-use-size').onclick=()=>onUseSize(current.kw);
  $('#solar-copy-quote').onclick=async()=>{const msg=`Hello, I would like an installer quote and roof survey for an estimated ${current.kw} kW rooftop solar system. My average bill is ₹${Math.round(current.bill)}/month and my electricity rate is ₹${current.rate}/unit. Please confirm roof suitability, final generation, itemized installed cost and applicable CFA eligibility.`;try{await navigator.clipboard.writeText(msg);$('#solar-message').textContent='Quote request copied. Paste it into a message to an installer.'}catch{$('#solar-message').textContent=msg}};
  $('#solar-print').onclick=()=>window.print();update();
}
