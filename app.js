/* Tax Calculator — Year-aware + Import/Export + Mobile typing fix */
(function(){
  const STORAGE_NS = 'taxcalc-v2';
  const OLD_KEY = 'taxcalc-v1';
  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const CATS = ["DDV IN","DDV OPD","BFD IN","BFD OPD","NGH","TMCP","OTHERS","PROJECTS"];
  const QUARTERS = [
    { name:"Q1 • JAN–MAR", months:[0,1,2] },
    { name:"Q2 • APR–JUN", months:[3,4,5] },
    { name:"Q3 • JUL–SEP", months:[6,7,8] },
    { name:"Q4 • OCT–DEC", months:[9,10,11] }
  ];

  function emptyYear(){ return { months: MONTHS.map(()=>({remarks:"",categories:Object.fromEntries(CATS.map(c=>[c,Array(7).fill("")]))})) }; }

  function loadStore(){
    let store=null;
    try{ store = JSON.parse(localStorage.getItem(STORAGE_NS) || 'null'); }catch{ store=null; }
    if (!store){
      const legacy = localStorage.getItem(OLD_KEY);
      const y = new Date().getFullYear().toString();
      store = { currentYear: y, years: {} };
      store.years[y] = legacy ? JSON.parse(legacy) : emptyYear();
      localStorage.setItem(STORAGE_NS, JSON.stringify(store));
      if (legacy) localStorage.removeItem(OLD_KEY);
    }
    return store;
  }
  function saveStore(){ localStorage.setItem(STORAGE_NS, JSON.stringify(store)); }

  let store = loadStore();
  let activeQ = 0;

  const tabs = document.getElementById('quarterTabs');
  const table = document.getElementById('qTable');
  const btnSaveQuarter = document.getElementById('btnSaveQuarter');
  const btnPNG = document.getElementById('btnPNG');
  const btnGrandTotal = document.getElementById('btnGrandTotal');
  const grandSpan = document.getElementById('grandTotal');
  const yearSelect = document.getElementById('yearSelect');
  const btnNewYear = document.getElementById('btnNewYear');
  const btnExportYear = document.getElementById('btnExportYear');
  const fileImport = document.getElementById('fileImport');
  const quarterSumAll = document.getElementById('quarterSumAll');

  function refreshYearSelect(){
    yearSelect.innerHTML = '';
    const years = Object.keys(store.years).sort();
    years.forEach(y=>{
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      if (y === store.currentYear) opt.selected = true;
      yearSelect.appendChild(opt);
    });
  }
  function currentData(){ return store.years[store.currentYear]; }
  function setYear(y){
    store.currentYear = y; saveStore(); renderQuarter(); updateGrandTotalLabel(); refreshYearSelect();
  }

  refreshYearSelect();

  yearSelect.addEventListener('change', e=> setYear(e.target.value));
  btnNewYear.addEventListener('click', ()=>{
    const y = prompt('Create new year (e.g., 2025):', String(new Date().getFullYear()));
    if (!y) return;
    if (!store.years[y]) store.years[y] = emptyYear();
    setYear(y);
  });
  btnExportYear.addEventListener('click', ()=>{
    const obj = { year: store.currentYear, data: currentData(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `tax-${store.currentYear}.json`; a.click();
    URL.revokeObjectURL(url);
  });

  // Import Year JSON
  fileImport.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try{
      const text = await file.text();
      const obj = JSON.parse(text);
      // Accept either {year, data} or {years:{...}, currentYear:...}
      if (obj.year && obj.data){
        const y = String(obj.year);
        if (!validYearData(obj.data)) throw new Error('Invalid data format');
        store.years[y] = obj.data;
        store.currentYear = y;
      } else if (obj.years && obj.currentYear){
        // merge
        for (const [y,yd] of Object.entries(obj.years)){
          if (!validYearData(yd)) throw new Error('Invalid year inside import');
          store.years[y] = yd;
        }
        if (obj.currentYear in store.years) store.currentYear = obj.currentYear;
      } else {
        throw new Error('Unrecognized JSON format');
      }
      saveStore();
      alert('Import successful.');
      setYear(store.currentYear);
      e.target.value = '';
    }catch(err){
      alert('Import failed: ' + err.message);
    }
  });

  function validYearData(d){
    try{
      if (!d.months || d.months.length !== 12) return false;
      for (const m of d.months){
        if (!m.categories) return false;
        for (const c of CATS){
          if (!Array.isArray(m.categories[c]) || m.categories[c].length !== 7) return false;
        }
      }
      return true;
    }catch{ return false; }
  }

  // Build quarter tabs
  QUARTERS.forEach((q, i)=>{
    const b = document.createElement('button');
    b.className = 'tab' + (i===0?' active':'');
    b.textContent = q.name;
    b.addEventListener('click', ()=>{
      activeQ = i;
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      b.classList.add('active');
      renderQuarter();
    });
    tabs.appendChild(b);
  });

  renderQuarter();
  updateGrandTotalLabel();

  btnSaveQuarter.addEventListener('click', ()=>{
    saveStore();
    downloadJSON(quarterSnapshot(activeQ), `tax-${store.currentYear}-Q${activeQ+1}.json`);
  });
  btnPNG.addEventListener('click', ()=>{
    const png = renderQuarterPNG(activeQ);
    const a = document.createElement('a');
    a.href = png; a.download = `tax-${store.currentYear}-Q${activeQ+1}.png`; a.click();
  });
  btnGrandTotal.addEventListener('click', ()=>{
    alert(`Annual Grand Total (${store.currentYear}) — Cols 2–9:\n₱ ${fmt(annualGrandTotal())}`);
  });

  function renderQuarter(){
    const data = currentData();
    const q = QUARTERS[activeQ];
    const thead = `
      <thead>
        <tr>
          <th>#</th>
          <th>MONTH</th>
          ${CATS.map(c=>`<th>${c}<br><span class="muted">up to 7 entries</span></th>`).join('')}
          <th>REMARKS</th>
        </tr>
      </thead>`;
    const rows = q.months.map((mIdx, rowi)=>{
      return `
        <tr class="monthrow" data-month="${mIdx}">
          <td class="center">${rowi+1}</td>
          <td class="month">${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][mIdx]}</td>
          ${CATS.map(cat=>{
            const inputs = data.months[mIdx].categories[cat];
            const cells = Array.from({length:7}).map((_,i)=>{
              const val = inputs[i] ?? '';
              return `<input type="number" inputmode="decimal" step="any" placeholder="S${i+1}" data-cat="${cat}" data-month="${mIdx}" data-slot="${i}" value="${val}">`;
            }).join('');
            return `<td><div class="stack">${cells}</div></td>`;
          }).join('')}
          <td class="remarks"><textarea data-remarks="${mIdx}" placeholder="Notes / reminders...">${data.months[mIdx].remarks||''}</textarea></td>
        </tr>`;
    }).join('');
    const sumRow = `
      <tfoot>
        <tr class="sumrow">
          <td colspan="2">Quarter Totals</td>
          ${CATS.map(cat=>`<td class="sumcell">₱ ${fmt(sumQuarterCategory(activeQ, cat))}</td>`).join('')}
          <td class="sumcell center">—</td>
        </tr>
      </tfoot>`;
    table.innerHTML = `${thead}<tbody>${rows}</tbody>${sumRow}`;
    table.querySelectorAll('input[type="number"]').forEach(inp=>{
      inp.addEventListener('input', onValueEdit);
      inp.addEventListener('change', onValueEdit);
    });
    table.querySelectorAll('textarea[data-remarks]').forEach(ta=>{
      ta.addEventListener('input', onRemarksEdit);
      ta.addEventListener('change', onRemarksEdit);
    });
    updateQuarterAllSum();
  }

  function onValueEdit(e){
    const el = e.currentTarget;
    const cat = el.dataset.cat;
    const m = +el.dataset.month;
    const slot = +el.dataset.slot;
    currentData().months[m].categories[cat][slot] = el.value.trim();
    saveStore();
    updateGrandTotalLabel();
    updateQuarterTotals();
  }
  function onRemarksEdit(e){
    const el = e.currentTarget;
    const m = +el.dataset.remarks;
    currentData().months[m].remarks = el.value;
    saveStore();
  }

  function num(x){ const n = parseFloat(x); return Number.isFinite(n) ? n : 0; }
  function sumMonthCategory(mIdx, cat){ return currentData().months[mIdx].categories[cat].reduce((a,b)=>a+num(b),0); }
  function sumQuarterCategory(qIdx, cat){ return QUARTERS[qIdx].months.reduce((acc,m)=> acc + sumMonthCategory(m,cat), 0); }
  function annualGrandTotal(){ let total=0; for(let m=0;m<12;m++){ for(const c of CATS){ total+=sumMonthCategory(m,c);} } return total; }
  function updateGrandTotalLabel(){ grandSpan.textContent = `₱ ${fmt(annualGrandTotal())}`; }
  const fmt = n => n.toLocaleString(undefined,{maximumFractionDigits:2});

  function updateQuarterTotals(){
    const foot = table.querySelector('tfoot');
    if (!foot) return;
    const cells = foot.querySelectorAll('.sumcell');
    CATS.forEach((cat, i)=>{
      const s = sumQuarterCategory(activeQ, cat);
      if (cells[i]) cells[i].textContent = `₱ ${fmt(s)}`;
    });
    updateQuarterAllSum();
  }
  function updateQuarterAllSum(){
    const total = CATS.reduce((acc,cat)=> acc + sumQuarterCategory(activeQ, cat), 0);
    quarterSumAll.textContent = `₱ ${fmt(total)}`;
  }

  function quarterSnapshot(qIdx){
    const mIdxs = QUARTERS[qIdx].months;
    return {
      year: store.currentYear,
      quarter: qIdx+1,
      months: mIdxs.map(m=> ({
        month: MONTHS[m],
        remarks: currentData().months[m].remarks,
        categories: Object.fromEntries(CATS.map(c=>[c, currentData().months[m].categories[c].map(v=> (v===""? "": +Number(v)))]))
      })),
      quarterTotals: Object.fromEntries(CATS.map(c=>[c, sumQuarterCategory(qIdx,c)])),
      generatedAt: new Date().toISOString()
    };
  }
  function downloadJSON(obj, filename){
    const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function renderQuarterPNG(qIdx){
    const pad = 24, cellH = 26, headerH = 44, stackCols = 7;
    const colW = { idx: 36, month: 70, catSlot: 90, remarks: 260 };
    const catTotalWidth = CATS.length * (stackCols * colW.catSlot);
    const width = pad*2 + colW.idx + colW.month + catTotalWidth + colW.remarks;
    const height = pad*2 + headerH + 3 * cellH + headerH;
    const c = document.createElement('canvas');
    c.width = Math.max(1400, width);
    c.height = height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b1120'; ctx.fillRect(0,0,c.width,c.height); ctx.translate(pad,pad);
    ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
    ctx.fillStyle = '#e5e7eb';
    ctx.fillText(`${store.currentYear} — Quarter ${qIdx+1} Summary`, 0, 16);

    let x = 0, y = 28;
    const drawCell = (txt, w, h, align='left', bold=false, bg=null) =>{
      if (bg){ ctx.fillStyle = bg; ctx.fillRect(x,y, w,h); ctx.fillStyle = '#e5e7eb'; }
      ctx.font = (bold?'bold ':'') + '13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      ctx.strokeStyle = '#1b2439'; ctx.strokeRect(x,y,w,h);
      ctx.save();
      const tx = align==='center' ? x + w/2 : (align==='right' ? x + w - 6 : x + 6);
      const ty = y + h/2 + 1;
      ctx.textAlign = align; ctx.textBaseline = 'middle';
      const text = String(txt);
      ctx.fillText(text.length>120? text.slice(0,117)+'…' : text, tx, ty);
      ctx.restore();
      x += w;
    };

    // header
    drawCell('#', colW.idx, headerH, 'center', true, '#0d1426');
    drawCell('MONTH', colW.month, headerH, 'center', true, '#0d1426');
    for (const cat of CATS){ drawCell(cat+' (7 slots)', colW.catSlot*7, headerH, 'center', true, '#0d1426'); }
    drawCell('REMARKS', colW.remarks, headerH, 'center', true, '#0d1426');

    // body
    y += headerH; x = 0;
    QUARTERS[qIdx].months.forEach((mIdx, i)=>{
      x=0;
      drawCell(String(i+1), colW.idx, cellH, 'center');
      drawCell(MONTHS[mIdx], colW.month, cellH, 'center');
      for (const cat of CATS){
        const slots = currentData().months[mIdx].categories[cat].map(v=>v===""?"":Number(v));
        drawCell(slots.map(v=> v==="" ? "" : v).join(', '), colW.catSlot*7, cellH, 'left');
      }
      drawCell(currentData().months[mIdx].remarks || '', colW.remarks, cellH, 'left');
      y += cellH;
    });

    // totals
    x=0; 
    drawCell('Quarter Totals', colW.idx+colW.month, headerH, 'left', true, '#0d1426');
    for (const cat of CATS){ drawCell(`₱ ${fmt(sumQuarterCategory(qIdx, cat))}`, colW.catSlot*7, headerH, 'right', true, '#0d1426'); }
    drawCell('—', colW.remarks, headerH, 'center', true, '#0d1426');

    return c.toDataURL('image/png');
  }

  // PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', ()=> {
      navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
    });
  }
})();