// Inventory v6 - frontend-only (localStorage). Implements requested features
(function(){
  const LS_KEY = 'inv_v6';
  const defaultData = {
    companies: {
      demo: {
        id:'demo',
        name:'Demo Company',
        logo:'', // base64 image
        settings:{ headerFontSize:18, headerColor:'#0b5ed7', onlyAdminCompany:true, perms:{add:true,edit:true,download:true}, deptWa:{} },
        depts: ['Store','Fnb','Housekeeping','Main kitchen','Staff kitchen'],
        users: { 'admin':{email:'admin',pass:'admin1234@',role:'admin'} },
        products: []
      }
    }
  };

  function load(){ return JSON.parse(localStorage.getItem(LS_KEY) || JSON.stringify(defaultData)); }
  function save(db){ localStorage.setItem(LS_KEY, JSON.stringify(db)); }
  function uid(){ return 'id'+Math.random().toString(36).slice(2,9); }
  function todayISO(d=new Date()){ return d.toISOString().slice(0,10); }
  function daysBetween(a,b){ return Math.ceil((new Date(b)-new Date(a))/(1000*60*60*24)); }

  const path = window.location.pathname.split('/').pop();
  const db = load();

  // Recalculate statuses and cleanup expired >45 days
  function recalcAll(){
    for(const cid in db.companies){
      const comp = db.companies[cid];
      comp.products.forEach(p=>{
        if(p.expiryDate) p.leftDays = daysBetween(todayISO(), p.expiryDate); else p.leftDays = 9999;
        if(p.expiryDate && p.leftDays<=0) p.status='Expired';
        else if(p.expiryDate && p.leftDays<=15) p.status='Near expiry';
        else if(p.expiryDate && p.leftDays<=30) p.status='Expiring soon';
        else p.status='OK';
      });
      comp.products = comp.products.filter(p=>{
        if(!p.expiryDate) return true;
        if(new Date(p.expiryDate) < new Date()){
          const expiredDays = daysBetween(p.expiryDate, todayISO());
          if(expiredDays > 45) return false;
        }
        return true;
      });
    }
    save(db);
  }

  recalcAll();

  const el=(id)=>document.getElementById(id);

  // INDEX - login
  if(path==='index.html' || path===''){
    const compSel = el('companySelect');
    compSel.style.display='none';
    el('btnLogin').onclick = ()=>{
      const comp = db.companies['demo'];
      const email = el('email').value.trim(); const pass = el('password').value;
      const user = comp.users[email];
      if(user && user.pass===pass){ sessionStorage.setItem('inv_session', JSON.stringify({companyId:'demo', email:user.email})); window.location.href='dashboard.html'; }
      else el('msg').innerText='Invalid credentials. Use admin / admin1234@';
    };
    el('btnSignup').onclick = ()=>{
      const comp = db.companies['demo'];
      const email = el('email').value.trim(); const pass = el('password').value;
      if(!email||!pass) return el('msg').innerText='Enter email and password';
      if(comp.users[email]) return el('msg').innerText='User exists';
      comp.users[email]={email,pass,role:'user'}; save(db); el('msg').innerText='User created. Now login.';
    };
    el('email').value='admin'; el('password').value='admin1234@';
    return;
  }

  // require session
  const session = JSON.parse(sessionStorage.getItem('inv_session')||'null');
  if(!session){ window.location.href='index.html'; return; }
  const comp = db.companies[session.companyId];
  const user = comp.users[session.email];

  // common setup
  function setupCommon(){
    const ln = el('loggedUser'); if(ln) ln.innerText = user ? user.email + (user.role==='admin'?' (admin)':'') : '';
    const logout = el('btnLogout'); if(logout) logout.onclick = ()=>{ sessionStorage.removeItem('inv_session'); window.location.href='index.html'; };
    const cn = el('companyName'); if(cn) cn.innerText = comp.name;
    const smallLogo = el('companyLogoSmall'); if(smallLogo){
      if(comp.logo){ smallLogo.src = comp.logo; smallLogo.style.display='inline-block'; } else smallLogo.style.display='none';
    }
    try{ const top = document.querySelector('.topbar'); if(top){ top.style.background = comp.settings.headerColor || '#0b5ed7'; top.style.fontSize = (comp.settings.headerFontSize||18)+'px'; } }catch(e){}
  }

  setupCommon();

  // DASHBOARD
  if(path==='dashboard.html'){
    setupCommon();
    const cards = el('cards'); cards.innerHTML='';
    comp.depts.forEach(d=>{
      const list = comp.products.filter(p=>p.dept===d);
      const total = list.length;
      const expiring = list.filter(p=>p.leftDays<=30 && p.leftDays>0).length;
      const near = list.filter(p=>p.leftDays<=15 && p.leftDays>0).length;
      const expired = list.filter(p=>p.status==='Expired').length;
      let status='OK', cls='status-ok';
      if(expired>0){ status='Expired'; cls='status-expired'; }
      else if(near>0){ status='Near expiry'; cls='status-near'; }
      else if(expiring>0){ status='Expiring soon'; cls='status-soon'; }
      const div = document.createElement('div'); div.className='dept-card';
      div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>${d}</strong><span class="${cls}">${status}</span></div>
        <div style="margin-top:8px">Total: ${total} • Expiring≤30d: ${expiring} • Near≤15d: ${near} • Expired: ${expired}</div>
        <div style="margin-top:8px"><div style="height:8px;background:#e9eef6;border-radius:6px;overflow:hidden"><div style="width:${Math.min(100, (expiring/Math.max(1,total))*100)}%;height:8px;background:#f59e0b"></div></div></div>
        <div style="margin-top:8px"><button class="btn" data-dept="${d}" onclick="openDeptAlert(this.dataset.dept)">Dept WA Alert</button> <button class="btn secondary" onclick="openDeptList('${d}')">View</button></div>`;
      cards.appendChild(div);
    });
    el('btnExportAllExcel').onclick = exportAllExcel;
    el('btnExportAllPDF').onclick = exportAllPDF;
    el('btnRunDeptAlerts').onclick = runAllDeptAlerts;
    window.openDeptAlert = function(dept){ runWhatsAppForDept(dept); };
    window.openDeptList = function(dept){ sessionStorage.setItem('inv_show_dept', dept); window.location.href='products.html'; };
    return;
  }

  // PRODUCTS
  if(path==='products.html'){
    setupCommon();
    const filter = el('filterDept'); filter.innerHTML = '<option value="">All</option>'+comp.depts.map(d=>`<option value="${d}">${d}</option>`).join('');
    const search = el('search');
    el('btnExportCSV').onclick = exportCSV;
    el('btnExportDeptExcel').onclick = ()=>{ const dept = filter.value; if(!dept) return alert('Select dept'); exportDeptExcel(dept); };
    el('btnWA').onclick = ()=>{ const dept = filter.value || ''; runWhatsAppForDept(dept); };
    filter.onchange = renderProducts; search.oninput = renderProducts;
    const showDept = sessionStorage.getItem('inv_show_dept'); if(showDept){ filter.value=showDept; sessionStorage.removeItem('inv_show_dept'); }
    renderProducts();
    return;
  }

  // ADD PRODUCT
  if(path==='add_product.html'){
    setupCommon();
    const deptSel = el('dept'); deptSel.innerHTML = comp.depts.map(d=>`<option value="${d}">${d}</option>`).join('');
    el('btnClear').onclick = ()=>{ el('productForm').reset(); el('editingId').value=''; };
    el('productForm').onsubmit = (e)=>{ e.preventDefault();
      if(user.role!=='admin' && !comp.settings.perms.add) return alert('No permission to add');
      const id = el('editingId').value || uid();
      const product = el('productName').value.trim(); const qty = Number(el('qty').value)||0; const unit = el('unit').value||'';
      const mfg = el('mfg').value||''; const best = Number(el('bestBefore').value)||0; const remark = el('remark').value||'';
      const entryDate = todayISO();
      const expiryDate = mfg ? (function(){ const d=new Date(mfg); d.setMonth(d.getMonth()+best); return d.toISOString().slice(0,10); })() : '';
      const leftDays = expiryDate ? daysBetween(todayISO(), expiryDate) : 9999;
      const status = expiryDate && leftDays<=0 ? 'Expired' : (expiryDate && leftDays<=15 ? 'Near expiry' : (expiryDate && leftDays<=30 ? 'Expiring soon' : 'OK'));
      const prod = { id, dept:deptSel.value, product, qty, unit, mfg, bestBeforeMonths:best, remark, entryDate, expiryDate, leftDays, status };
      const idx = comp.products.findIndex(p=>p.id===id);
      if(idx>=0) comp.products[idx]=prod; else comp.products.push(prod);
      save(db); alert('Saved'); window.location.href='products.html';
    };
    const params = new URLSearchParams(window.location.search);
    if(params.has('edit')){ const id=params.get('edit'); const p=comp.products.find(x=>x.id===id); if(p){ el('editingId').value=p.id; el('dept').value=p.dept; el('productName').value=p.product; el('qty').value=p.qty; el('unit').value=p.unit; el('mfg').value=p.mfg; el('bestBefore').value=p.bestBeforeMonths||6; el('remark').value=p.remark||''; } }
    return;
  }

  // SETTINGS
  if(path==='settings.html'){
    setupCommon();
    el('companyNameInput').value = comp.name || '';
    el('headerFontSize').value = comp.settings.headerFontSize || 18;
    el('headerColor').value = comp.settings.headerColor || '#0b5ed7';
    el('onlyAdminCompany').checked = !!comp.settings.onlyAdminCompany;
    el('permAdd').checked = !!comp.settings.perms.add; el('permEdit').checked = !!comp.settings.perms.edit; el('permDownload').checked = !!comp.settings.perms.download;
    // logo upload
    const logoUpload = el('logoUpload');
    logoUpload.onchange = (ev)=>{
      const f = ev.target.files[0]; if(!f) return;
      const reader = new FileReader(); reader.onload = ()=>{ comp.logo = reader.result; save(db); alert('Logo saved'); setupCommon(); }; reader.readAsDataURL(f);
    };
    el('btnSaveSettings').onclick = ()=>{
      if(comp.settings.onlyAdminCompany && user.role!=='admin') return alert('Only admin can change');
      comp.name = el('companyNameInput').value || comp.name;
      comp.settings.headerFontSize = Number(el('headerFontSize').value)||18;
      comp.settings.headerColor = el('headerColor').value || '#0b5ed7';
      comp.settings.onlyAdminCompany = !!el('onlyAdminCompany').checked;
      save(db); alert('Saved settings'); setupCommon();
    };
    // dept WA list
    function renderDeptWa(){
      const wrap = el('deptWaList'); wrap.innerHTML = comp.depts.map(d=>{
        const nums = (comp.settings.deptWa && comp.settings.deptWa[d]) ? comp.settings.deptWa[d].numbers : '';
        const enabled = (comp.settings.deptWa && comp.settings.deptWa[d]) ? comp.settings.deptWa[d].auto : false;
        return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><div style="width:160px">${d}</div>
          <input data-dept="${d}" class="wa-input" placeholder="phone numbers (comma)" value="${nums||''}" />
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-dept-auto="${d}" ${enabled?'checked':''}/> Auto</label></div>`;
      }).join('');
      Array.from(wrap.querySelectorAll('.wa-input')).forEach(inp=>{ inp.onchange = ()=>{ const d = inp.getAttribute('data-dept'); if(!comp.settings.deptWa) comp.settings.deptWa={}; if(!comp.settings.deptWa[d]) comp.settings.deptWa[d]={numbers:'' , auto:false}; comp.settings.deptWa[d].numbers = inp.value; save(db); }; });
      Array.from(wrap.querySelectorAll('input[type=checkbox]')).forEach(cb=>{ cb.onchange = ()=>{ const d=cb.getAttribute('data-dept-auto'); if(!comp.settings.deptWa) comp.settings.deptWa={}; if(!comp.settings.deptWa[d]) comp.settings.deptWa[d]={numbers:'', auto:false}; comp.settings.deptWa[d].auto = cb.checked; save(db); }; });
    }
    renderDeptWa();
    el('btnAddDept').onclick = ()=>{ const nd = el('newDept').value.trim(); if(!nd) return; comp.depts.push(nd); save(db); el('newDept').value=''; renderDeptWa(); };
    el('btnSavePerm').onclick = ()=>{ comp.settings.perms.add = !!el('permAdd').checked; comp.settings.perms.edit = !!el('permEdit').checked; comp.settings.perms.download = !!el('permDownload').checked; save(db); alert('Permissions saved'); };
    return;
  }

  // ADMIN USERS
  if(path==='admin_users.html'){
    setupCommon();
    if(user.role!=='admin'){ document.querySelector('.main').innerHTML = '<div class="card">Only admin can access</div>'; return; }
    function renderUsers(){
      el('usersList').innerHTML = Object.keys(comp.users).map(e=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #eee"><div><strong>${e}</strong><br/><small>${comp.users[e].role}</small></div><div><button class="btn" data-email="${e}">Delete</button></div></div>`).join('');
      Array.from(document.querySelectorAll('#usersList .btn')).forEach(b=>{ b.onclick=()=>{ const em=b.getAttribute('data-email'); if(em===user.email) return alert('Cannot delete yourself'); if(confirm('Delete?')){ delete comp.users[em]; save(db); renderUsers(); } } });
    }
    renderUsers();
    el('btnCreateUser').onclick = ()=>{ const email=el('newUserEmail').value.trim(); const pass=el('newUserPass').value; const role=el('newUserRole').value; if(!email||!pass) return alert('Provide email and pass'); if(comp.users[email]) return alert('User exists'); comp.users[email]={email,pass,role}; save(db); renderUsers(); el('newUserEmail').value=''; el('newUserPass').value=''; };
    return;
  }

  // PRODUCTS render & helpers
  function renderProducts(){
    const tbody = document.querySelector('#productsTable tbody'); if(!tbody) return;
    const filter = el('filterDept').value || ''; const q = (el('search').value||'').toLowerCase();
    const list = comp.products.filter(p=> (filter===''||p.dept===filter) && (p.product.toLowerCase().includes(q) || (p.remark||'').toLowerCase().includes(q)));
    tbody.innerHTML = list.map((p,i)=>`<tr>
      <td>${i+1}</td><td>${p.entryDate}</td><td>${p.product}</td><td>${p.mfg||''}</td><td>${p.expiryDate||''}</td><td>${p.leftDays}</td><td>${statusBadge(p.status)}</td><td>${p.qty}</td><td>${p.unit}</td><td>${p.remark||''}</td>
      <td><button class="btn" data-id="${p.id}" data-action="edit">Edit</button> <button class="btn secondary" data-id="${p.id}" data-action="del">Delete</button></td>
    </tr>`).join('');
    Array.from(document.querySelectorAll('#productsTable button')).forEach(b=>{ b.onclick=()=>{
      const id=b.getAttribute('data-id'); const act=b.getAttribute('data-action');
      if(act==='edit'){ if(user.role!=='admin' && !comp.settings.perms.edit) return alert('No permission to edit'); window.location.href='add_product.html?edit='+id; }
      if(act==='del'){ if(confirm('Delete?')){ comp.products=comp.products.filter(x=>x.id!==id); save(db); renderProducts(); } }
    };});
  }

  function statusBadge(status){
    if(status==='Expired') return `<span class="status-expired">Expired</span>`;
    if(status==='Near expiry') return `<span class="status-near">Near expiry</span>`;
    if(status==='Expiring soon') return `<span class="status-soon">Expiring soon</span>`;
    return `<span class="status-ok">OK</span>`;
  }

  function exportCSV(){
    if(!comp.settings.perms.download && user.role!=='admin') return alert('No permission to download');
    const rows = comp.products.map(p=>[p.entryDate,p.product,p.mfg,p.expiryDate,p.leftDays,p.status,p.qty,p.unit,p.remark,p.dept]);
    let csv = 'EntryDate,Product,MFG,Expiry,LeftDays,Status,Qty,Unit,Remark,Dept\n' + rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=comp.name.replaceAll(' ','_')+'_inventory.csv'; a.click(); URL.revokeObjectURL(url);
  }

  function exportDeptExcel(dept){
    if(!comp.settings.perms.download && user.role!=='admin') return alert('No permission to download');
    const rows = comp.products.filter(p=>p.dept===dept).map(p=>({EntryDate:p.entryDate,Product:p.product,Mfg:p.mfg,Expired:p.expiryDate,LeftDays:p.leftDays,Status:p.status,Qty:p.qty,Unit:p.unit,Remark:p.remark}));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,dept); XLSX.writeFile(wb,`${comp.name.replaceAll(' ','_')}_${dept}_inventory.xlsx`);
  }

  function exportAllExcel(){
    if(!comp.settings.perms.download && user.role!=='admin') return alert('No permission to download');
    const rows = comp.products.map(p=>({Dept:p.dept,EntryDate:p.entryDate,Product:p.product,Mfg:p.mfg,Expired:p.expiryDate,LeftDays:p.leftDays,Status:p.status,Qty:p.qty,Unit:p.unit,Remark:p.remark}));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Inventory'); XLSX.writeFile(wb,`${comp.name.replaceAll(' ','_')}_inventory_all.xlsx`);
  }

  async function exportAllPDF(){
    if(!comp.settings.perms.download && user.role!=='admin') return alert('No permission to download');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    if(comp.logo){ try{ doc.addImage(comp.logo, 'JPEG', 10, 8, 30, 12); }catch(e){} }
    doc.setFontSize(14); doc.text(comp.name, 50, 15);
    let y=30; doc.setFontSize(10);
    comp.products.forEach((p,i)=>{ doc.text(`${i+1}. ${p.product} | Dept: ${p.dept} | Left: ${p.leftDays} | Qty: ${p.qty} ${p.unit}`, 10, y); y+=6; if(y>280){ doc.addPage(); y=10; } });
    doc.save(`${comp.name.replaceAll(' ','_')}_inventory.pdf`);
  }

  // WhatsApp alerts
  function runWhatsAppForDept(dept){
    const numsMap = comp.settings.deptWa || {};
    const targetDepts = dept ? [dept] : comp.depts;
    const exp = comp.products.filter(p=> targetDepts.includes(p.dept) && p.leftDays<=30);
    if(exp.length===0) return alert('No expiring products in target departments');
    const byDept={};
    exp.forEach(p=>{ byDept[p.dept]=byDept[p.dept]||[]; byDept[p.dept].push(p); });
    for(const d in byDept){
      const cfg = numsMap[d] || {numbers:'' , auto:false};
      const nums = (cfg.numbers||'').split(',').map(s=>s.trim()).filter(Boolean);
      if(nums.length===0) continue;
      const lines = byDept[d].map(p=>`${p.product} — ${p.leftDays} days left — Expiry: ${p.expiryDate}`);
      nums.forEach(n=>{ const url = `https://wa.me/${n}?text=${encodeURIComponent(`Alert (${comp.name} - ${d}):\\n` + lines.join('\\n'))}`; window.open(url,'_blank'); });
    }
  }
  function runAllDeptAlerts(){ comp.depts.forEach(d=>{ const cfg = comp.settings.deptWa && comp.settings.deptWa[d]; if(cfg && cfg.auto) runWhatsAppForDept(d); }); }

  // expose
  window.exportAllExcel = exportAllExcel; window.exportAllPDF = exportAllPDF;

  // init page-specific renders
  if(path==='products.html') renderProducts();
})();
