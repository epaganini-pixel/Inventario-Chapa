'use strict';
/* ===== Datos y utilidades ===== */
const MATERIALES = ['Mild Steel', 'Inox', 'Aluminio', 'Galvanizada'];
const MOTIVOS = ['Muy chico', 'Deformado', 'Oxidado', 'Forma irregular', 'Otro'];
const ZONAS0 = ['Rack A', 'Rack B', 'Piso'];
const SIN = 'Sin ubicar';
const KEY = 'scrap-retales-v2';
const COLORS = ['#5678a3', '#8a5fc2', '#6ea675', '#d97a45', '#cf9b3d'];

const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (Math.round(n * 10) / 10).toLocaleString('es-AR');
const dens = m => /inox/i.test(m) ? 8 : /alum/i.test(m) ? 2.7 : 7.85;
const kg = r => r.largo * r.ancho * r.espesor * dens(r.material) / 1e6;
const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2600); };

let items = [], zonas = [...ZONAS0];
const filters = { mat: 'Todos', esp: '', l: '', a: '' };
const find = id => items.find(r => r.id === id);
const mats = () => [...new Set([...MATERIALES, ...items.map(r => r.material)])];
const esps = () => [...new Set(items.map(r => r.espesor))].sort((a, b) => a - b);
const matColor = m => COLORS[mats().indexOf(m) % COLORS.length];
const nextCod = () => 'R-' + String(items.reduce((m, r) => Math.max(m, parseInt(r.cod.slice(2)) || 0), 0) + 1).padStart(4, '0');

/* ===== Store: local por defecto, Firestore si hay FIREBASE_CONFIG ===== */
const Store = (() => {
  if (typeof firebase !== 'undefined' && window.FIREBASE_CONFIG) {
    firebase.initializeApp(FIREBASE_CONFIG);
    const fs = firebase.firestore(), c = fs.collection('retales'), z = fs.collection('config').doc('zonas');
    const fail = e => alert('No se pudo guardar: ' + e.message);
    return {
      save: r => c.doc(r.id).set(r).catch(fail),
      zonas: l => z.set({ l }).catch(fail),
      listen(a, b) {
        c.onSnapshot(s => a(s.docs.map(d => d.data())), e => alert('No se pudieron cargar los retales: ' + e.message));
        z.onSnapshot(s => s.exists && b(s.data().l));
      }
    };
  }
  let d; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
  d = d || { items: [], zonas: ZONAS0 };
  const put = () => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { alert('No se pudo guardar en este navegador.'); } };
  let A, B;
  return {
    save(r) { const i = d.items.findIndex(x => x.id === r.id); i < 0 ? d.items.push(r) : d.items[i] = r; put(); A(d.items); },
    zonas(l) { d.zonas = l; put(); B(l); },
    listen(a, b) { A = a; B = b; a(d.items); b(d.zonas); }
  };
})();

/* ===== Board: una columna por zona, una tarjeta por retal ===== */
const fits = r => {
  const l = +filters.l, a = +filters.a;
  return !(l > 0 && a > 0) || (r.largo >= l && r.ancho >= a) || (r.largo >= a && r.ancho >= l);
};
const visible = r => r.estado === 'Disponible' && (filters.mat === 'Todos' || r.material === filters.mat)
  && (!filters.esp || r.espesor === +filters.esp) && fits(r);

const Board = {
  dragId: null,
  card(r) {
    return `<article class="card" draggable="true" data-id="${r.id}" style="--cc:${matColor(r.material)}">
      <div class="cod mono">${esc(r.cod)}</div>
      <div class="med mono">${r.largo} × ${r.ancho}</div>
      <div class="card-meta"><span class="badge">${esc(r.material)}</span><span>${fmt(r.espesor)} mm</span><span>${fmt(kg(r))} kg</span></div>
      ${r.job ? `<p class="hint">${esc(r.job)}</p>` : ''}
    </article>`;
  },
  render() {
    const names = [...zonas];
    if (items.some(r => r.estado === 'Disponible' && !zonas.includes(r.zona))) names.push(SIN);
    $('#board').innerHTML = names.map(z => {
      const list = items.filter(r => visible(r) && (z === SIN ? !zonas.includes(r.zona) : r.zona === z));
      const total = items.filter(r => r.estado === 'Disponible' && (z === SIN ? !zonas.includes(r.zona) : r.zona === z)).length;
      return `<section class="col" data-zona="${esc(z)}">
        <header><h2><span class="dot"></span>${esc(z)}</h2><div><span class="col-count">${list.length} retal${list.length === 1 ? '' : 'es'}</span>${!total && z !== SIN ? `<button class="rm" data-rm="${esc(z)}" aria-label="Quitar zona ${esc(z)}">✕</button>` : ''}</div></header>
        <div class="cards">${list.map(this.card).join('') || '<p class="empty">Sin retales</p>'}</div>
        ${z !== SIN ? `<button class="add" data-add="${esc(z)}">+ Cargar retal acá</button>` : ''}
      </section>`;
    }).join('');
    const ms = ['Todos', ...mats()];
    $('#chips').innerHTML = ms.map(m => `<button data-m="${esc(m)}"${m === filters.mat ? ' class="on"' : ''}>${esc(m)}</button>`).join('');
    $('#fEsp').innerHTML = '<option value="">Todos</option>' + esps().map(e => `<option value="${e}"${String(e) === filters.esp ? ' selected' : ''}>${fmt(e)} mm</option>`).join('');
  },
  moveTo(id, zona) { const r = find(id); if (r && r.zona !== zona) { r.zona = zona; Store.save(r); } },
  init() {
    const b = $('#board');
    b.addEventListener('click', ev => {
      const rm = ev.target.closest('[data-rm]'), ad = ev.target.closest('[data-add]'), c = ev.target.closest('.card');
      if (rm) { if (confirm(`¿Quitar la zona "${rm.dataset.rm}"?`)) Store.zonas(zonas.filter(z => z !== rm.dataset.rm)); }
      else if (ad) Nuevo.open(ad.dataset.add);
      else if (c) Detail.open(c.dataset.id);
    });
    b.addEventListener('dragstart', ev => {
      const c = ev.target.closest('.card'); if (!c) return;
      this.dragId = c.dataset.id; ev.dataTransfer.setData('text/plain', this.dragId); c.classList.add('dragging');
    });
    b.addEventListener('dragend', () => { this.dragId = null; this.render(); });
    b.addEventListener('dragover', ev => {
      const col = ev.target.closest('.col'); if (!col || !this.dragId || col.dataset.zona === SIN) return;
      ev.preventDefault();
      document.querySelectorAll('.col.over').forEach(x => x !== col && x.classList.remove('over'));
      col.classList.add('over');
    });
    b.addEventListener('drop', ev => {
      const col = ev.target.closest('.col'); if (!col || !this.dragId || col.dataset.zona === SIN) return;
      ev.preventDefault(); const id = this.dragId; this.dragId = null; this.moveTo(id, col.dataset.zona);
    });
    $('#chips').addEventListener('click', e => { const m = e.target.closest('[data-m]'); if (m) { filters.mat = m.dataset.m; this.render(); } });
    $('#fEsp').addEventListener('change', e => { filters.esp = e.target.value; this.render(); });
    $('#fL').addEventListener('input', e => { filters.l = e.target.value; this.render(); });
    $('#fA').addEventListener('input', e => { filters.a = e.target.value; this.render(); });
    $('#nuevo').addEventListener('click', () => Nuevo.open());
    $('#bResumen').addEventListener('click', () => Resumen.open());
    $('#bZona').addEventListener('click', () => {
      const n = (prompt('Nombre de la zona nueva (ej. Rack C, Estante 2):') || '').trim();
      if (!n) return;
      if (zonas.some(z => z.toLowerCase() === n.toLowerCase())) { toast('Esa zona ya existe'); return; }
      Store.zonas([...zonas, n]);
    });
  }
};

/* ===== Nuevo: "Terminé un corte", pocos toques ===== */
const pick = (k, vals, sel) => `<div class="pick" data-k="${k}">${vals.map(v => `<button type="button" data-v="${esc(v)}"${v === sel ? ' class="on"' : ''}>${esc(v)}</button>`).join('')}</div>`;
const Nuevo = {
  v: {},
  open(zona) {
    const last = items[items.length - 1];
    this.v = { material: last?.material || '', zona: zona || '' };
    $('#nuevo-d').innerHTML = `<form id="fNuevo" class="box"><h2>Nuevo retal</h2>
      <div class="fld">Material${pick('material', [...mats(), 'Otro…'], this.v.material)}</div>
      <div class="row2"><label>Espesor (mm)<input name="espesor" type="number" step="0.01" min="0" inputmode="decimal" required></label>
        <div class="fld">Ya usados${pick('espesor', esps().slice(0, 6).map(String))}</div></div>
      <div class="row2"><label>Largo (mm)<input name="largo" type="number" min="1" inputmode="numeric" required></label>
        <label>Ancho (mm)<input name="ancho" type="number" min="1" inputmode="numeric" required></label></div>
      <label>Job / anidado (opcional)<input name="job" placeholder="TCO BODY X8 (NOV)-JOB000405"></label>
      <div class="fld">Dónde lo dejás${pick('zona', zonas, this.v.zona)}</div>
      <p class="err" id="nErr"></p>
      <div class="actions"><button type="button" data-a="cancel">Cancelar</button><button class="primary big">Guardar retal</button></div></form>`;
    $('#nuevo-d').showModal();
  },
  init() {
    const d = $('#nuevo-d');
    d.addEventListener('click', ev => {
      if (ev.target.closest('[data-a="cancel"]')) { d.close(); return; }
      const b = ev.target.closest('.pick button'); if (!b) return;
      const k = b.parentNode.dataset.k; let v = b.dataset.v;
      if (v === 'Otro…') { v = (prompt('Material:') || '').trim(); if (!v) return; }
      if (k === 'espesor') d.querySelector('[name=espesor]').value = v; else this.v[k] = v;
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    d.addEventListener('submit', ev => {
      ev.preventDefault(); const f = ev.target.elements, err = $('#nErr');
      if (!this.v.material) { err.textContent = 'Elegí el material.'; return; }
      if (!this.v.zona) { err.textContent = 'Elegí dónde lo dejás.'; return; }
      const l = +f.largo.value, a = +f.ancho.value;
      const r = { id: uid(), cod: nextCod(), estado: 'Disponible', material: this.v.material, espesor: +f.espesor.value,
        largo: Math.max(l, a), ancho: Math.min(l, a), job: f.job.value.trim(), zona: this.v.zona, fecha: new Date().toISOString().slice(0, 10), t: Date.now() };
      d.close(); Store.save(r); toast(`${r.cod} guardado en ${r.zona}. Anotalo en la chapa.`);
    });
  }
};

/* ===== Detail: mover, usar o descartar ===== */
const Detail = {
  id: null, mode: '',
  open(id) { this.id = id; this.mode = ''; this.render(); $('#detail').showModal(); },
  render() {
    const r = find(this.id); if (!r) { $('#detail').close(); return; }
    let h = `<div class="box"><div class="dhead"><h2 class="mono">${esc(r.cod)}</h2><button data-a="close" aria-label="Cerrar">✕</button></div>
      <div class="med mono big">${r.largo} × ${r.ancho} mm</div>
      <div class="drow"><span class="badge">${esc(r.material)}</span><span>${fmt(r.espesor)} mm</span><span>${fmt(kg(r))} kg</span></div>
      <div class="drow"><span>Zona: <b>${esc(r.zona || SIN)}</b></span>${r.job ? `<span>Origen: ${esc(r.job)}</span>` : ''}${r.padre ? `<span>De ${esc(r.padre)}</span>` : ''}</div>`;
    if (this.mode === 'use') h += `<form id="fUse" class="box" style="padding:0"><h3 class="sec">Usar este retal</h3>
        <label>Job donde se usa<input name="job" required></label>
        <h3 class="sec">Si sobró otra pieza, cargá sus medidas</h3>
        <div class="row2"><label>Largo (mm)<input name="largo" type="number" min="1" inputmode="numeric"></label><label>Ancho (mm)<input name="ancho" type="number" min="1" inputmode="numeric"></label></div>
        <div class="actions"><button type="button" data-a="back">Volver</button><button class="primary big">Marcar como usado</button></div></form>`;
    else if (this.mode === 'dis') h += `<h3 class="sec">Motivo del descarte</h3>${pick('motivo', MOTIVOS)}
        <div class="actions"><button type="button" data-a="back">Volver</button></div>`;
    else h += `<h3 class="sec">Mover a</h3>${pick('mover', zonas, r.zona)}
        <div class="actions"><button class="danger" data-a="dis">Descartar</button><button class="primary big" data-a="use">Usar este retal</button></div>`;
    $('#detail').innerHTML = h + '</div>';
  },
  init() {
    const d = $('#detail');
    d.addEventListener('click', ev => {
      const r = find(this.id), a = ev.target.closest('[data-a]')?.dataset.a, b = ev.target.closest('.pick button');
      if (b) {
        const k = b.parentNode.dataset.k, v = b.dataset.v;
        if (k === 'mover') { Board.moveTo(r.id, v); toast(`${r.cod} movido a ${v}`); d.close(); }
        if (k === 'motivo') { r.estado = 'Descartado'; r.motivo = v; r.fechaCierre = Date.now(); Store.save(r); toast(`${r.cod} descartado`); d.close(); }
        return;
      }
      if (a === 'close') d.close();
      else if (a === 'use' || a === 'dis') { this.mode = a; this.render(); }
      else if (a === 'back') { this.mode = ''; this.render(); }
    });
    d.addEventListener('submit', ev => {
      if (ev.target.id !== 'fUse') return;
      ev.preventDefault(); const f = ev.target.elements, r = find(this.id);
      r.estado = 'Usado'; r.usoJob = f.job.value.trim(); r.fechaCierre = Date.now(); Store.save(r);
      const l = +f.largo.value, a = +f.ancho.value;
      if (l > 0 && a > 0) {
        const n = { id: uid(), cod: nextCod(), estado: 'Disponible', material: r.material, espesor: r.espesor, largo: Math.max(l, a), ancho: Math.min(l, a),
          job: r.usoJob, zona: r.zona, padre: r.cod, fecha: new Date().toISOString().slice(0, 10), t: Date.now() };
        Store.save(n); toast(`${r.cod} usado. Nuevo retal ${n.cod} en ${n.zona}.`);
      } else toast(`${r.cod} marcado como usado`);
      d.close();
    });
  }
};

/* ===== Resumen: cuánto scrap hay de cada chapa ===== */
const Resumen = {
  open() {
    const disp = items.filter(r => r.estado === 'Disponible'), g = {};
    disp.forEach(r => { const k = r.material + '|' + r.espesor; g[k] = g[k] || { m: r.material, e: r.espesor, n: 0, a: 0, k: 0 }; g[k].n++; g[k].a += r.largo * r.ancho / 1e6; g[k].k += kg(r); });
    const rows = Object.values(g).sort((x, y) => x.m.localeCompare(y.m) || x.e - y.e);
    const des = items.filter(r => r.estado === 'Descartado').reduce((s, r) => s + kg(r), 0);
    $('#resumen').innerHTML = `<div class="box"><div class="dhead"><h2>Scrap disponible</h2><button data-a="close" aria-label="Cerrar">✕</button></div>
      ${rows.length ? `<table class="tbl"><tr><th>Material</th><th class="n">Espesor</th><th class="n">Retales</th><th class="n">m²</th><th class="n">kg</th></tr>${rows.map(x =>
        `<tr><td>${esc(x.m)}</td><td class="n">${fmt(x.e)} mm</td><td class="n">${x.n}</td><td class="n">${(Math.round(x.a * 100) / 100).toLocaleString('es-AR')}</td><td class="n">${fmt(x.k)}</td></tr>`).join('')}</table>`
        : '<p class="empty">Todavía no hay retales disponibles.</p>'}
      <p class="hint">Usados: ${items.filter(r => r.estado === 'Usado').length} · Descartados: ${items.filter(r => r.estado === 'Descartado').length} (${fmt(des)} kg a chatarra). Pesos calculados: acero 7,85 · inox 8,0 · aluminio 2,7 g/cm³.</p></div>`;
    $('#resumen').showModal();
  },
  init() { $('#resumen').addEventListener('click', e => { if (e.target.closest('[data-a="close"]')) $('#resumen').close(); }); }
};

/* ===== Arranque ===== */
Board.init(); Nuevo.init(); Detail.init(); Resumen.init();
Store.listen(
  list => { items = [...list].sort((a, b) => (a.t || 0) - (b.t || 0)); Board.render(); if ($('#detail').open) Detail.render(); },
  list => { zonas = list; Board.render(); }
);
