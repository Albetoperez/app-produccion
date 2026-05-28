let currentTask = 'H';
let currentAppMode = 'EM';

let PARQUE_MASTER = {}; 
let HISTORIAL_PROD = {};
let PARQUE_ESTACIONES = {};
let PARQUE_CAJAS = {}; 
let HISTORIAL_CAJAS = {};
let PARQUE_ZANJAS = {}; 
let PARQUE_PUNTUALES = {}; 
let _currentCajaId = null;

let pzScale = 1;
let pzPointX = 0;
let pzPointY = 0;

localforage.config({ name: 'SIGMA_PROD_V1', storeName: 'produccion_hincas' });

const LEVELS = ['H', 'P', 'T', 'O', 'M'];

function escapeHtml(str) { 
    if (!str) return '';
    const div = document.createElement('div'); div.textContent = str; return div.innerHTML; 
}
function escapeJsStr(str) { 
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/</g, '\\x3C').replace(/>/g, '\\x3E').replace(/\n/g, '\\n'); 
}

function setTask(task, el) {
    currentTask = task;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}

function setAppMode(mode) {
    currentAppMode = mode;
    document.getElementById('btn-mode-em').classList.toggle('active', mode === 'EM');
    document.getElementById('btn-mode-za').classList.toggle('active', mode === 'ZA');

    const panelEM = document.getElementById('summary-panel');
    const panelZA = document.getElementById('summary-panel-za');
    const container = document.getElementById('matrix-container');

    container.removeAttribute('style');

    if (mode === 'EM') {
        document.getElementById('toolbar-em').style.display = 'flex';
        document.getElementById('filter-block-container').style.display = 'inline-block';
        if(panelEM) panelEM.style.display = 'block';
        if(panelZA) panelZA.style.display = 'none';
    } else {
        document.getElementById('toolbar-em').style.display = 'none';
        document.getElementById('filter-block-container').style.display = 'none';
        if(panelEM) panelEM.style.display = 'none';
        if(panelZA) panelZA.style.display = 'block';
    }
    
    pzScale = 1; pzPointX = 0; pzPointY = 0;
    renderMatrixSelector();
}

function getFechaProduccion() {
    const inputFecha = document.getElementById('fecha-produccion');
    if (inputFecha && inputFecha.value) return inputFecha.value;
    return new Date().toISOString().split('T')[0];
}

async function importarArchivos(input) {
    const files = input.files;
    if (files.length === 0) return;
    const btn = document.getElementById('btn-import');
    if (btn) btn.innerText = "⏳ Procesando...";
    let ultimoArcoDetectado = '';

    const MAX_FILE_SIZE = 20 * 1024 * 1024;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_FILE_SIZE) { alert(`⚠️ Archivo demasiado grande.`); continue; }
        const reader = new FileReader();
        await new Promise((resolve) => {
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    let todaLaData = [];
                    workbook.SheetNames.forEach(sheetName => { todaLaData = todaLaData.concat(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])); });
                    const detectado = procesarDatosJSON(todaLaData);
                    if (detectado) ultimoArcoDetectado = detectado;
                } catch (error) { console.error("Error leyendo Excel:", error); } 
                finally { resolve(); }
            };
            reader.onerror = () => resolve();
            reader.readAsArrayBuffer(file);
        });
    }

    try {
        await localforage.setItem('PARQUE_MASTER_DATA', PARQUE_MASTER);
        await localforage.setItem('PARQUE_ESTACIONES_DATA', PARQUE_ESTACIONES);
        await localforage.setItem('PARQUE_CAJAS_DATA', PARQUE_CAJAS);
        await localforage.setItem('PARQUE_ZANJAS_DATA', PARQUE_ZANJAS);
        await localforage.setItem('PARQUE_PUNTUALES_DATA', PARQUE_PUNTUALES);
    } catch (e) { console.error("Error IndexedDB:", e); }
    if (btn) { btn.innerText = `✅ ¡Cargado!`; setTimeout(() => btn.innerText = "📂 Cargar Listados", 2000); }
    input.value = '';
    actualizarSelectores(ultimoArcoDetectado);
}

const parseCoord = (val) => { if(!val) return 0; return parseFloat(String(val).replace(',', '.')); };

function detectarArco(id) {
    const clean = id.replace(/\s+/g, '');
    const match = clean.match(/ARCO(\d)|ARC(\d)/);
    return match ? `ARC${match[1] || match[2]}` : 'S/A';
}

function procesarDatosJSON(data) {
    let arcoEnEsteArchivo = '';
    data.forEach(rawRow => {
        let row = {};
        for (let key in rawRow) row[key.trim().toUpperCase()] = rawRow[key];
        
        if (row['X INICIO'] !== undefined && row['X FIN'] !== undefined) {
            const x1 = parseCoord(row['X INICIO']), y1 = parseCoord(row['Y INICIO']);
            const x2 = parseCoord(row['X FIN']), y2 = parseCoord(row['Y FIN']);
            const ref = row['REFERENCIA'] || row['REFERENCIA (LINEAL)'] || 'ZANJA';
            if (x1 !== 0 && y1 !== 0 && x2 !== 0 && y2 !== 0) {
                const zId = `Z_${x1}_${y1}_${x2}_${y2}`.replace(/[\.\-]/g, '_');
                if (!PARQUE_ZANJAS[zId]) { PARQUE_ZANJAS[zId] = { id: zId, ref: ref, x1: x1, y1: y1, x2: x2, y2: y2 }; }
            }
            return; 
        }

        const refPuntual = row['REFERENCIA'] || row['CODIGO'] || row['TIPO'] || row['CAPA'];
        const xp = parseCoord(row['X']);
        const yp = parseCoord(row['Y']);
        if (refPuntual && xp !== 0 && yp !== 0 && row['FILA'] === undefined && row['HINCA'] === undefined && !String(refPuntual).includes('-PS-') && !String(refPuntual).includes('-SB-')) {
            const upRef = String(refPuntual).toUpperCase();
            if (upRef.includes('ARQUETA') || upRef.includes('BÁCULO') || upRef.includes('BACULO') || upRef.includes('PVH') || upRef.includes('TORRE') || upRef.includes('AGRUPAMIENTO') || upRef.includes('FC-')) {
                const pId = `PT_${xp}_${yp}`.replace(/[\.\-]/g, '_');
                if (!PARQUE_PUNTUALES[pId]) { PARQUE_PUNTUALES[pId] = { id: pId, ref: String(refPuntual), x: xp, y: yp }; }
                return;
            }
        }

        const tId = row['CODIGO'], rawX = row['X'], rawY = row['Y'];
        if (!tId || rawX === undefined || rawY === undefined) return;
        const tIdStr = String(tId).trim().toUpperCase();
        if (tIdStr === '') return;

        const x = parseCoord(rawX), y = parseCoord(rawY);
        if (x === 0 && y === 0) return;

        if (row['PUNTO'] !== undefined || tIdStr.includes('-PS-')) {
            const match = tIdStr.match(/ARC(\d)|ARCO(\d)/);
            const arcoPS = match ? `ARC${match[1] || match[2]}` : 'S/A';
            const blockPS = tIdStr.split('-').pop().trim();
            if (!arcoEnEsteArchivo && arcoPS !== 'S/A') arcoEnEsteArchivo = arcoPS;
            if (!PARQUE_ESTACIONES[tIdStr]) { PARQUE_ESTACIONES[tIdStr] = { name: tIdStr, arco: arcoPS, block: blockPS, minX: x, maxX: x, minY: y, maxY: y }; } 
            else { PARQUE_ESTACIONES[tIdStr].minX = Math.min(PARQUE_ESTACIONES[tIdStr].minX, x); PARQUE_ESTACIONES[tIdStr].maxX = Math.max(PARQUE_ESTACIONES[tIdStr].maxX, x); PARQUE_ESTACIONES[tIdStr].minY = Math.min(PARQUE_ESTACIONES[tIdStr].minY, y); PARQUE_ESTACIONES[tIdStr].maxY = Math.max(PARQUE_ESTACIONES[tIdStr].maxY, y); }
            return; 
        }

        if (tIdStr.includes('-SB-')) {
            const match = tIdStr.match(/ARC(\d)|ARCO(\d)/);
            const arcoSB = match ? `ARC${match[1] || match[2]}` : 'S/A';
            const blockRaw = tIdStr.split('-')[2]; 
            const blockSB = blockRaw ? blockRaw.charAt(0) : 'S/B'; 
            if (!arcoEnEsteArchivo && arcoSB !== 'S/A') arcoEnEsteArchivo = arcoSB;
            if (!PARQUE_CAJAS[tIdStr]) { PARQUE_CAJAS[tIdStr] = { name: tIdStr, arco: arcoSB, block: blockSB, minX: x, maxX: x, minY: y, maxY: y }; } 
            else { PARQUE_CAJAS[tIdStr].minX = Math.min(PARQUE_CAJAS[tIdStr].minX, x); PARQUE_CAJAS[tIdStr].maxX = Math.max(PARQUE_CAJAS[tIdStr].maxX, x); PARQUE_CAJAS[tIdStr].minY = Math.min(PARQUE_CAJAS[tIdStr].minY, y); PARQUE_CAJAS[tIdStr].maxY = Math.max(PARQUE_CAJAS[tIdStr].maxY, y); }
            return; 
        }

        const block = row['BLOQUE'] || 'S/B', filaNum = row['FILA'], hincaIndex = row['HINCA'];
        if (filaNum === undefined || filaNum === null || hincaIndex === undefined || hincaIndex === null) return;
        const arcoId = detectarArco(tIdStr);
        if (!arcoEnEsteArchivo && arcoId !== 'S/A') arcoEnEsteArchivo = arcoId;

        if(!PARQUE_MASTER[tIdStr]) { PARQUE_MASTER[tIdStr] = { name: tIdStr, arco: arcoId, block: String(block).trim(), minX: x, maxX: x, minY: y, maxY: y, filas: {} }; } 
        else { PARQUE_MASTER[tIdStr].minX = Math.min(PARQUE_MASTER[tIdStr].minX, x); PARQUE_MASTER[tIdStr].maxX = Math.max(PARQUE_MASTER[tIdStr].maxX, x); PARQUE_MASTER[tIdStr].minY = Math.min(PARQUE_MASTER[tIdStr].minY, y); PARQUE_MASTER[tIdStr].maxY = Math.max(PARQUE_MASTER[tIdStr].maxY, y); }
        if(!PARQUE_MASTER[tIdStr].filas[filaNum]) PARQUE_MASTER[tIdStr].filas[filaNum] = { tipo: filaNum == 2 ? "MOTORA" : "GEMELA", hincas: 0 };
        if(hincaIndex > PARQUE_MASTER[tIdStr].filas[filaNum].hincas) PARQUE_MASTER[tIdStr].filas[filaNum].hincas = parseInt(hincaIndex, 10);
    });
    return arcoEnEsteArchivo;
}

function actualizarSelectores(arcoPreferido) {
    let arcos = new Set();
    Object.values(PARQUE_MASTER).forEach(tr => { if(tr.arco) arcos.add(tr.arco); });
    const selectArco = document.getElementById('select-arco');
    const valorAntes = selectArco.value;
    if (arcos.size === 0) {
        selectArco.innerHTML = '<option>Carga un Excel...</option>';
        document.getElementById('select-block').innerHTML = '';
        document.getElementById('matrix-container').innerHTML = '<div class="empty-state">No hay datos cargados.</div>';
        return;
    }
    selectArco.innerHTML = Array.from(arcos).sort().map(a => `<option value="${a}">${a === 'S/A' ? 'NO IDENTIFICADO' : a}</option>`).join('');
    if (arcoPreferido && arcos.has(arcoPreferido)) selectArco.value = arcoPreferido; else if (valorAntes && arcos.has(valorAntes)) selectArco.value = valorAntes;
    actualizarBloques();
}

function actualizarBloques() {
    const arcoSeleccionado = document.getElementById('select-arco').value;
    let bloques = new Set();
    Object.values(PARQUE_MASTER).forEach(tr => { if(tr.arco === arcoSeleccionado && tr.block) bloques.add(tr.block); });
    document.getElementById('select-block').innerHTML = Array.from(bloques).sort().map(b => `<option value="${b}">BLOQUE ${b}</option>`).join('');
    
    pzScale = 1; pzPointX = 0; pzPointY = 0;
    renderMatrixSelector();
}

function renderMatrixSelector() {
    if (currentAppMode === 'EM') { renderMatrix(); } else { renderMatrixZanjas(); }
}

async function renderMatrix() {
    const arco = document.getElementById('select-arco').value;
    const block = document.getElementById('select-block').value;
    const container = document.getElementById('matrix-container');
    
    // Preparar el contenedor para el modo EM
    container.style.height = 'calc(100vh - 220px)'; 
    container.style.overflow = 'auto'; 
    container.style.paddingBottom = '0px'; 
    container.innerHTML = '';
    
    const ids = Object.keys(PARQUE_MASTER).filter(id => PARQUE_MASTER[id].arco === arco && PARQUE_MASTER[id].block === block);
    const psIds = Object.keys(PARQUE_ESTACIONES).filter(id => PARQUE_ESTACIONES[id].arco === arco && PARQUE_ESTACIONES[id].block === block);
    const sbIds = Object.keys(PARQUE_CAJAS).filter(id => PARQUE_CAJAS[id].arco === arco && PARQUE_CAJAS[id].block === block);

    if(ids.length === 0 && psIds.length === 0 && sbIds.length === 0) { 
        container.innerHTML = '<div class="empty-state">No hay datos para este bloque.</div>'; 
        return; 
    }
    
    let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
    ids.forEach(id => { const tr = PARQUE_MASTER[id]; if(tr.minX < gMinX) gMinX = tr.minX; if(tr.maxX > gMaxX) gMaxX = tr.maxX; if(tr.minY < gMinY) gMinY = tr.minY; if(tr.maxY > gMaxY) gMaxY = tr.maxY; });
    psIds.forEach(id => { const ps = PARQUE_ESTACIONES[id]; if(ps.minX < gMinX) gMinX = ps.minX; if(ps.maxX > gMaxX) gMaxX = ps.maxX; if(ps.minY < gMinY) gMinY = ps.minY; if(ps.maxY > gMaxY) gMaxY = ps.maxY; });
    sbIds.forEach(id => { const sb = PARQUE_CAJAS[id]; if(sb.minX < gMinX) gMinX = sb.minX; if(sb.maxX > gMaxX) gMaxX = sb.maxX; if(sb.minY < gMinY) gMinY = sb.minY; if(sb.maxY > gMaxY) gMaxY = sb.maxY; });

    const rX = (gMaxX - gMinX) || 1; const rY = (gMaxY - gMinY) || 1;
    const SCALE_X = 8, SCALE_Y = 6;
    
    const MARGIN_LEFT = 450; 
    const MARGIN_TOP_BOTTOM = 300; 
    
    const canvasWidth = (rX * SCALE_X) + (MARGIN_LEFT * 2);
    const canvasHeight = (rY * SCALE_Y) + (MARGIN_TOP_BOTTOM * 2) + 300; 
    
    let html = `<div class="map-canvas" style="position: relative; min-width: ${canvasWidth}px; min-height: ${canvasHeight}px;">`;
    
    for (let id of psIds) {
        const ps = PARQUE_ESTACIONES[id];
        const pxX = (((ps.minX + ps.maxX) / 2 - gMinX) * SCALE_X) + MARGIN_LEFT;
        const pxY = ((gMaxY - ps.maxY) * SCALE_Y) + MARGIN_TOP_BOTTOM;
        let wS = ((ps.maxX - ps.minX) * SCALE_X); let pxH = ((ps.maxY - ps.minY) * SCALE_Y);
        if (wS < 60) wS = 60; if (pxH < 40) pxH = 40; 
        const letra = ps.name.split('-').pop(); const safeName = escapeHtml(`PS-${letra}`); 
        html += `<div class="power-station" style="position: absolute; left: ${pxX}px; top: ${pxY}px; width: ${wS}px; height: ${pxH}px;" title="${escapeHtml(ps.name)}"><span style="font-size: 16px; margin-bottom: 2px;">⚡</span><span>${safeName}</span></div>`;
    }

    for (let id of sbIds) {
        const sb = PARQUE_CAJAS[id];
        const pxX = (((sb.minX + sb.maxX) / 2 - gMinX) * SCALE_X) + MARGIN_LEFT;
        const pxY = ((gMaxY - sb.maxY) * SCALE_Y) + MARGIN_TOP_BOTTOM;
        let wS = 30, pxH = 18; 
        let checks = HISTORIAL_CAJAS[id] || {}; let count = contarChecks(checks);
        let colorClass = 'sb-red'; if(count === 6) colorClass = 'sb-green'; else if(count > 0) colorClass = 'sb-orange';
        const numCaja = sb.name.split('-').slice(2).join('-').split('_')[0];
        const safeId = escapeJsStr(id);
        html += `<div id="sb-${safeId}" class="string-box ${colorClass}" style="position: absolute; left: ${pxX}px; top: ${pxY}px; width: ${wS}px; height: ${pxH}px;" title="Ver Checklist" onclick="abrirModalCaja('${safeId}')"><span>${escapeHtml(numCaja)}</span></div>`;
    }

    for (let id of ids) {
        const tr = PARQUE_MASTER[id];
        const pxX = (((tr.minX + tr.maxX) / 2 - gMinX) * SCALE_X) + MARGIN_LEFT;
        const pxY = ((gMaxY - tr.maxY) * SCALE_Y) + MARGIN_TOP_BOTTOM;
        let pxH = ((tr.maxY - tr.minY) * SCALE_Y); if (pxH < 40) pxH = 40; 
        const filas = Object.keys(tr.filas).sort((a,b) => a-b);
        const esM = filas.length === 1;
        let wS = !esM ? `width: ${((tr.maxX - tr.minX) * SCALE_X) + 22}px; justify-content: space-between;` : `justify-content: center;`;
        
        html += `<div class="prod-card map-card" style="position: absolute; left: ${pxX}px; top: ${pxY}px; height: ${pxH}px; ${wS}">`;
        const safeId = escapeJsStr(id);
        const safeName = escapeHtml(tr.name.split('-').slice(-2).join('-'));
        html += `<div class="tracker-title" style="cursor:pointer;" onclick="paintTracker('${safeId}')" title="Pintar tracker completo">${safeName}</div>`;
        for (let fN of filas) {
            const f = tr.filas[fN];
            let tT = fN == 2 ? 'MOT' : 'GEM'; let cT = fN == 2 ? 'motora' : 'gemela'; if (esM) { tT = 'MONO'; cT = 'mono'; }
            html += `<div class="row-container"><div class="row-tag ${cT}" style="cursor:pointer;" onclick="paintRow('${safeId}', '${fN}')" title="Pintar fila completa">${tT}</div><div class="cells-grid">`;
            for (let h = 1; h <= f.hincas; h++) {
                const hId = `${id}-F${fN}-H${h}`;
                const safeHId = escapeJsStr(hId);
                const rawData = HISTORIAL_PROD[hId];
                const s = (rawData && typeof rawData === 'object') ? (rawData.estado || '') : (rawData || '');
                html += `<div class="cell" id="${safeHId}" onclick="paint('${safeHId}')" style="background-color:${getStyleByStatus(s)}; color: ${s==='' ? 'transparent' : '#333'};">${s}</div>`;
            }
            html += `</div></div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html + '</div>';
    
    const bName = document.getElementById('summary-block-name');
    if (bName) bName.innerText = `Arco ${arco.replace('ARC','')} - Bloque ${block}`;
    
    actualizarContadores();
    initPanEM();
}

function initPanEM() {
    const container = document.getElementById('matrix-container');
    if (!container) return;

    let isDragging = false;
    let startX, startY, sLeft, sTop;

    container.style.cursor = 'grab';

    const onDown = (e) => {
        if (currentAppMode !== 'EM') return;
        if (e.target.closest('.cell') || e.target.closest('.row-tag') || e.target.closest('.tracker-title') || e.target.closest('.string-box') || e.target.closest('.power-station')) {
            return; 
        }
        isDragging = true;
        container.style.cursor = 'grabbing';
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        startX = clientX - container.offsetLeft;
        startY = clientY - container.offsetTop;
        sLeft = container.scrollLeft;
        sTop = container.scrollTop;
    };

    const onMove = (e) => {
        if (!isDragging || currentAppMode !== 'EM') return;
        e.preventDefault();
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        const x = clientX - container.offsetLeft;
        const y = clientY - container.offsetTop;
        container.scrollLeft = sLeft - (x - startX);
        container.scrollTop = sTop - (y - startY);
    };

    const onUp = () => {
        if (currentAppMode !== 'EM') return;
        isDragging = false;
        container.style.cursor = 'grab';
    };

    container.addEventListener('mousedown', onDown);
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseup', onUp);
    container.addEventListener('mouseleave', onUp);

    container.addEventListener('touchstart', onDown, { passive: false });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onUp);
}

function normalizeZanjaType(ref) {
    const r = String(ref).toUpperCase();
    if (r.includes('ENTRADA-PS') || r.includes('ENTRADA PS') || r.includes('ENTRADAPS')) return 'ENTRADA_PS';
    if (r.includes('MT')) return 'MT';
    if (r.includes('BT')) return 'BT';
    if (r.includes('SSAA')) return 'SSAA';
    if (r.includes('ZANJA G') || r.includes('ZANJA-G') || r.includes('ZANJA_G')) return 'PAT';
    return 'OTRAS';
}

function getZanjaColorByType(type) {
    const colors = { 
        'MT': '#ef4444',         
        'BT': '#f59e0b',         
        'SSAA': '#22c55e',       
        'PAT': '#ec4899',        
        'ENTRADA_PS': '#06b6d4',  
        'OTRAS': '#ca8a04'       
    };
    return colors[type] || '#ca8a04';
}

function renderMatrixZanjas() {
    const arco = document.getElementById('select-arco').value;
    const container = document.getElementById('matrix-container');
    
    // Preparar contenedor para Zanjas
    container.style.paddingBottom = '0px';
    container.style.overflow = 'hidden';
    container.innerHTML = '';
    
    let ids = Object.keys(PARQUE_MASTER).filter(id => PARQUE_MASTER[id].arco === arco);
    let sbIds = Object.keys(PARQUE_CAJAS).filter(id => PARQUE_CAJAS[id].arco === arco);

    if(ids.length === 0 && sbIds.length === 0) { 
        container.innerHTML = '<div class="empty-state">No hay datos para esta vista de Arco.</div>'; 
        return; 
    }
    
    let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
    ids.forEach(id => { const tr = PARQUE_MASTER[id]; if(tr.minX < gMinX) gMinX = tr.minX; if(tr.maxX > gMaxX) gMaxX = tr.maxX; if(tr.minY < gMinY) gMinY = tr.minY; if(tr.maxY > gMaxY) gMaxY = tr.maxY; });
    sbIds.forEach(id => { const sb = PARQUE_CAJAS[id]; if(sb.minX < gMinX) gMinX = sb.minX; if(sb.maxX > gMaxX) gMaxX = sb.maxX; if(sb.minY < gMinY) gMinY = sb.minY; if(sb.maxY > gMaxY) gMaxY = sb.maxY; });

    const baseScaleX = 4, baseScaleY = 3, MARGIN = 100; 
    const rX = (gMaxX - gMinX) || 1; const rY = (gMaxY - gMinY) || 1;
    const canvasWidth = (rX * baseScaleX) + (MARGIN * 2);
    const canvasHeight = (rY * baseScaleY) + (MARGIN * 2);

    if (pzScale === 1 && pzPointX === 0 && pzPointY === 0) {
        const cw = container.clientWidth || 1000;
        const ch = 500; 
        pzPointX = (cw - canvasWidth) / 2;
        pzPointY = (ch - canvasHeight) / 2;
        if (pzPointX < 0) pzPointX = 50; 
        if (pzPointY < 0) pzPointY = 50;
    }
    
    let html = `<div id="zanjas-viewport" style="width: 100%; height: 70vh; min-height: 500px; overflow: hidden; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; position: relative; margin-top: 10px; cursor: grab;">`;
    html += `<div id="pan-zoom-layer" style="position: absolute; width: ${canvasWidth}px; height: ${canvasHeight}px; transform: translate(${pzPointX}px, ${pzPointY}px) scale(${pzScale}); transform-origin: 0 0;">`;
    
    let svgHtml = `<svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:10;">`;
    
    let zanjaMetrosTotal = 0;
    let metrosPorTipo = { 'MT': 0, 'BT': 0, 'SSAA': 0, 'PAT': 0, 'ENTRADA_PS': 0, 'OTRAS': 0 };
    
    Object.values(PARQUE_ZANJAS).forEach(z => {
        const dx = z.x2 - z.x1; const dy = z.y2 - z.y1;
        const longitud = Math.sqrt(dx*dx + dy*dy);
        
        zanjaMetrosTotal += longitud;
        const type = normalizeZanjaType(z.ref);
        metrosPorTipo[type] += longitud;

        const pxX1 = ((z.x1 - gMinX) * baseScaleX) + MARGIN; const pxY1 = ((gMaxY - z.y1) * baseScaleY) + MARGIN;
        const pxX2 = ((z.x2 - gMinX) * baseScaleX) + MARGIN; const pxY2 = ((gMaxY - z.y2) * baseScaleY) + MARGIN;
        const strokeColor = getZanjaColorByType(type);
        
        const grosorFinal = 4 / pzScale;
        const zAlertMsg = escapeJsStr(`Zanja detectada:\nTipo: ${type}\nRef: ${z.ref}`);
        
        svgHtml += `<line x1="${pxX1}" y1="${pxY1}" x2="${pxX2}" y2="${pxY2}" stroke="${strokeColor}" stroke-width="${grosorFinal}" stroke-linecap="round" style="pointer-events:auto; cursor:pointer;" onclick="alert('${zAlertMsg}')"></line>`;

        // Efecto AutoCAD SSAA integrado y protegido
        if (type === 'SSAA') {
            const pLen = Math.sqrt(Math.pow(pxX2 - pxX1, 2) + Math.pow(pxY2 - pxY1, 2));
            if (pLen > 40) { 
                const numTexts = Math.max(1, Math.floor(pLen / 100)); 
                let angle = Math.atan2(pxY2 - pxY1, pxX2 - pxX1) * (180 / Math.PI);
                if (angle > 90 || angle < -90) angle += 180; 
                
                for(let i = 1; i <= numTexts; i++) {
                    let f = i / (numTexts + 1);
                    let cx = pxX1 + (pxX2 - pxX1) * f;
                    let cy = pxY1 + (pxY2 - pxY1) * f;
                    svgHtml += `<text class="za-cut-text" x="${cx}" y="${cy}" fill="${strokeColor}" font-size="${10 / pzScale}" font-weight="900" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" transform="rotate(${angle}, ${cx}, ${cy})" style="pointer-events:none;" paint-order="stroke" stroke="#f8fafc" stroke-width="${5 / pzScale}">SSAA</text>`;
                }
            }
        }
    });

    let countsPT = { arqueta: 0, gateway: 0, mbox: 0, tbox: 0, meteo: 0, csb: 0, cctv: 0, fc: 0 };

    Object.values(PARQUE_PUNTUALES).forEach(p => {
        if (p.x >= gMinX - 50 && p.x <= gMaxX + 50 && p.y >= gMinY - 50 && p.y <= gMaxY + 50) {
            const pxX = ((p.x - gMinX) * baseScaleX) + MARGIN;
            const pxY = ((gMaxY - p.y) * baseScaleY) + MARGIN;
            const refUp = p.ref.toUpperCase();
            const c = '#000000'; 
            const sw = 2; 
            
            const alertMsg = escapeJsStr(`Tipo: ${p.ref}\nCoord X: ${p.x}\nCoord Y: ${p.y}`);
            
            if (refUp.includes('ARQUETA')) {
                countsPT.arqueta++;
                const s = 12; 
                svgHtml += `<rect x="${pxX - s/2}" y="${pxY - s/2}" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="${sw}" style="pointer-events:auto; cursor:pointer;" onclick="alert('${alertMsg}')"></rect>`;
            } 
            else if (refUp.includes('POSTE CAJA')) {
                countsPT.csb++;
                const s = 14; 
                const s2 = s/2;
                const triPath = `M ${pxX},${pxY - s2} L ${pxX + s2},${pxY + s2} L ${pxX - s2},${pxY + s2} Z`;
                
                svgHtml += `<path d="${triPath}" fill="none" stroke="${c}" stroke-width="${sw}" style="pointer-events:auto; cursor:pointer;" onclick="alert('${alertMsg}')"/>`;
                svgHtml += `<circle cx="${pxX}" cy="${pxY + 2.5}" r="1.5" fill="${c}" style="pointer-events:none;"></circle>`; 
                svgHtml += `<text x="${pxX}" y="${pxY - s2 - 4}" fill="${c}" font-size="9" font-weight="bold" text-anchor="middle" font-family="sans-serif" style="pointer-events:none;">CSB</text>`;
            }
            else if (refUp.includes('BÁCULO-CCTV') || refUp.includes('BACULO-CCTV') || refUp.includes('CCTV')) {
                countsPT.cctv++;
                const r = 6; 
                const o = r * 0.7071; 
                svgHtml += `<circle cx="${pxX}" cy="${pxY}" r="${r}" fill="none" stroke="${c}" stroke-width="${sw}" style="pointer-events:auto; cursor:pointer;" onclick="alert('${alertMsg}')"></circle>`;
                svgHtml += `<line x1="${pxX - o}" y1="${pxY - o}" x2="${pxX + o}" y2="${pxY + o}" stroke="${c}" stroke-width="${sw}" style="pointer-events:none;"></line>`;
                svgHtml += `<line x1="${pxX - o}" y1="${pxY + o}" x2="${pxX + o}" y2="${pxY - o}" stroke="${c}" stroke-width="${sw}" style="pointer-events:none;"></line>`;
                svgHtml += `<text x="${pxX}" y="${pxY - r - 4}" fill="${c}" font-size="9" font-weight="bold" text-anchor="middle" font-family="sans-serif" style="pointer-events:none;">CCTV</text>`;
            }
            else if (refUp.includes('GATEWAY') || refUp.includes('MBOX') || refUp.includes('TBOX') || refUp.includes('METEO')) {
                const s = 14; 
                const s2 = s/2;
                const triPath = `M ${pxX},${pxY - s2} L ${pxX + s2},${pxY + s2} L ${pxX - s2},${pxY + s2} Z`;
                
                let shortName = 'PVH';
                if (refUp.includes('MBOX+GATEWAY')) { shortName = 'MBOX+GW'; countsPT.mbox++; }
                else if (refUp.includes('GATEWAY')) { shortName = 'GATEWAY'; countsPT.gateway++; }
                else if (refUp.includes('MBOX')) { shortName = 'MBOX'; countsPT.mbox++; }
                else if (refUp.includes('TBOX')) { shortName = 'TBOX'; countsPT.tbox++; }
                else if (refUp.includes('METEO')) { shortName = 'METEO'; countsPT.meteo++; }

                svgHtml += `<path d="${triPath}" fill="none" stroke="${c}" stroke-width="${sw}" style="pointer-events:auto; cursor:pointer;" onclick="alert('${alertMsg}')"/>`;
                svgHtml += `<circle cx="${pxX}" cy="${pxY + 2.5}" r="1.5" fill="${c}" style="pointer-events:none;"></circle>`; 
                svgHtml += `<text x="${pxX}" y="${pxY - s2 - 4}" fill="${c}" font-size="9" font-weight="bold" text-anchor="middle" font-family="sans-serif" style="pointer-events:none;">${escapeHtml(shortName)}</text>`; 
            }
            else if (refUp.includes('FC-')) {
                countsPT.fc++;
                svgHtml += `<text x="${pxX}" y="${pxY + 3.5}" fill="${c}" font-size="10" font-weight="900" text-anchor="middle" font-family="sans-serif" style="pointer-events:auto; cursor:pointer;" onclick="alert('${alertMsg}')">FC</text>`;
            }
        }
    });

    svgHtml += `</svg>`;
    html += svgHtml;

    for (let id of sbIds) {
        const sb = PARQUE_CAJAS[id];
        const pxX = (((sb.minX + sb.maxX) / 2 - gMinX) * baseScaleX) + MARGIN; 
        const pxY = ((gMaxY - sb.maxY) * baseScaleY) + MARGIN;
        const numCaja = sb.name.split('-').slice(2).join('-').split('_')[0];
        html += `<div style="position: absolute; left: ${pxX}px; top: ${pxY}px; width: 24px; height: 14px; background: rgba(226, 232, 240, 0.7); border: 1px solid #cbd5e1; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94a3b8; font-weight: bold; pointer-events: none; z-index: 1;">${escapeHtml(numCaja)}</div>`;
    }

    for (let id of ids) {
        const tr = PARQUE_MASTER[id];
        const pxX = (((tr.minX + tr.maxX) / 2 - gMinX) * baseScaleX) + MARGIN; const pxY = ((gMaxY - tr.maxY) * baseScaleY) + MARGIN;
        let pxH = ((tr.maxY - tr.minY) * baseScaleY); if (pxH < 40) pxH = 40; 
        const safeName = escapeHtml(tr.name.split('-').slice(-2).join('-'));
        let wS_ZA = ((tr.maxX - tr.minX) * baseScaleX) || 15;
        html += `<div style="position: absolute; left: ${pxX}px; top: ${pxY}px; width: ${wS_ZA}px; height: ${pxH}px; background: rgba(226, 232, 240, 0.7); border: 1px solid #cbd5e1; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94a3b8; font-weight: bold; pointer-events: none; z-index: 2;">${safeName}</div>`;
    }
    
    html += `</div></div>`;
    container.innerHTML = html;
    
    const arcoNameZA = document.getElementById('summary-arco-name-za');
    if (arcoNameZA) arcoNameZA.innerText = `Arco ${arco.replace('ARC','')}`;
    
    document.getElementById('sum-za-metros').innerText = Math.round(zanjaMetrosTotal) + " m";
    document.getElementById('sum-za-mt').innerText = Math.round(metrosPorTipo['MT']) + " m";
    document.getElementById('sum-za-bt').innerText = Math.round(metrosPorTipo['BT']) + " m";
    document.getElementById('sum-za-ssaa').innerText = Math.round(metrosPorTipo['SSAA']) + " m";
    document.getElementById('sum-za-pat').innerText = Math.round(metrosPorTipo['PAT']) + " m";
    document.getElementById('sum-za-entradaps').innerText = Math.round(metrosPorTipo['ENTRADA_PS']) + " m";
    document.getElementById('sum-za-otras').innerText = Math.round(metrosPorTipo['OTRAS']) + " m";

    const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
    setTxt('sum-pt-arqueta', countsPT.arqueta);
    setTxt('sum-pt-gateway', countsPT.gateway);
    setTxt('sum-pt-mbox', countsPT.mbox);
    setTxt('sum-pt-tbox', countsPT.tbox);
    setTxt('sum-pt-meteo', countsPT.meteo);
    setTxt('sum-pt-csb', countsPT.csb);
    setTxt('sum-pt-cctv', countsPT.cctv);
    setTxt('sum-pt-fc', countsPT.fc);
    
    initPanZoomZanjas(); 
}

function initPanZoomZanjas() {
    const viewport = document.getElementById('zanjas-viewport'); 
    const layer = document.getElementById('pan-zoom-layer');
    if (!viewport || !layer) return;

    let isDragging = false;
    let startX, startY;

    const onDown = (e) => {
        if (currentAppMode !== 'ZA') return;
        e.preventDefault();
        isDragging = true;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        startX = clientX - pzPointX;
        startY = clientY - pzPointY;
        viewport.style.cursor = 'grabbing';
    };

    const onMove = (e) => {
        if (!isDragging || currentAppMode !== 'ZA') return;
        e.preventDefault();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        pzPointX = clientX - startX;
        pzPointY = clientY - startY;
        layer.style.transform = `translate(${pzPointX}px, ${pzPointY}px) scale(${pzScale})`;
    };

    const onUp = () => {
        if (currentAppMode !== 'ZA') return;
        isDragging = false;
        viewport.style.cursor = 'grab';
    };

    viewport.addEventListener('mousedown', onDown);
    viewport.addEventListener('mousemove', onMove);
    viewport.addEventListener('mouseup', onUp);
    viewport.addEventListener('mouseleave', onUp);

    viewport.addEventListener('touchstart', onDown, { passive: false });
    viewport.addEventListener('touchmove', onMove, { passive: false });
    viewport.addEventListener('touchend', onUp);

    viewport.addEventListener('wheel', function (e) {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const xs = (mouseX - pzPointX) / pzScale;
        const ys = (mouseY - pzPointY) / pzScale;
        
        const delta = (e.wheelDelta ? e.wheelDelta : -e.deltaY);
        if (delta > 0) pzScale *= 1.15;
        else pzScale /= 1.15;
        
        if(pzScale < 0.3) pzScale = 0.3;
        if(pzScale > 8) pzScale = 8;
        
        pzPointX = mouseX - xs * pzScale;
        pzPointY = mouseY - ys * pzScale;
        layer.style.transform = `translate(${pzPointX}px, ${pzPointY}px) scale(${pzScale})`;
        
        document.querySelectorAll('#zanjas-viewport line').forEach(line => { 
            line.setAttribute('stroke-width', 4 / pzScale); 
        });
        
        document.querySelectorAll('#zanjas-viewport text.za-cut-text').forEach(txt => { 
            txt.setAttribute('font-size', 10 / pzScale); 
            txt.setAttribute('stroke-width', 5 / pzScale); 
        });
    }, { passive: false });
}

function abrirModalCaja(id) {
    cerrarModalCaja(); 
    _currentCajaId = id;
    const sb = PARQUE_CAJAS[id];
    if (!sb) return;
    let checks = HISTORIAL_CAJAS[id] || {};
    const items = [{id: 'localizacion', label: '📍 Localización'}, {id: 'soportacion', label: '⚙️ Soportación'}, {id: 'fusibles', label: '🔌 Fusibles'}, {id: 'con_strings', label: '⚡ Conexionado Strings'}, {id: 'con_bus', label: '🔋 Conexionado BUS'}, {id: 'limpieza', label: '🧹 Limpieza'}];
    let html = `<div id="modal-caja-overlay" class="modal-overlay" onclick="cerrarModalCaja()"><div class="modal-content" onclick="event.stopPropagation()"><h3>Checklist: <span style="color:var(--accent);">${escapeHtml(sb.name)}</span></h3><div class="checklist">`;
    items.forEach(item => { const isChecked = checks[item.id] ? 'checked' : ''; html += `<label class="check-item"><input type="checkbox" ${isChecked} onchange="toggleCheckCaja('${escapeJsStr(id)}', '${item.id}', this.checked)">${item.label}</label>`; });
    html += `</div><button class="btn-close" onclick="cerrarModalCaja()">Guardar y Cerrar</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function cerrarModalCaja() { 
    const m = document.getElementById('modal-caja-overlay'); 
    if(m) { 
        m.remove(); 
        if (_currentCajaId) {
            const sbEl = document.getElementById('sb-' + _currentCajaId);
            if (sbEl) {
                const checks = HISTORIAL_CAJAS[_currentCajaId] || {};
                const count = contarChecks(checks);
                let colorClass = 'sb-red';
                if (count === 6) colorClass = 'sb-green';
                else if (count > 0) colorClass = 'sb-orange';
                sbEl.className = 'string-box ' + colorClass;
            }
            _currentCajaId = null;
        }
        actualizarContadores(); 
    } 
}

async function toggleCheckCaja(id, item, isChecked) {
    if (!HISTORIAL_CAJAS[id]) HISTORIAL_CAJAS[id] = {};
    const hoy = getFechaProduccion();
    
    if (isChecked) {
        HISTORIAL_CAJAS[id][item] = hoy;
    } else {
        delete HISTORIAL_CAJAS[id][item];
    }
    try { await localforage.setItem('HISTORIAL_CAJAS', HISTORIAL_CAJAS); } catch (e) { console.error("Error al guardar historial de cajas:", e); }
}

const STATUS_COLORS = { 'H': '#ffeb3b', 'P': '#2196f3', 'T': '#9c27b0', 'O': '#00bcd4', 'M': '#4caf50', '': '#fff' };
function getStyleByStatus(s) { return STATUS_COLORS[s] || '#fff'; }

function contarChecks(checks) {
    let count = 0;
    if(checks['localizacion']) count++; if(checks['soportacion']) count++; if(checks['fusibles']) count++; if(checks['con_strings']) count++; if(checks['con_bus']) count++; if(checks['limpieza']) count++;
    return count;
}

function modalConfirmacion(mensaje) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const idYes = 'btn-cf-y-' + Date.now();
        const idNo = 'btn-cf-n-' + Date.now();
        overlay.innerHTML = `
            <div class="modal-content" onclick="event.stopPropagation()">
                <h3>⚠️ Confirmar</h3>
                <p style="margin: 15px 0; color: #555; font-size: 14px; line-height: 1.5;">${mensaje}</p>
                <div style="display: flex; gap: 10px;">
                    <button id="${idYes}" class="btn-close" style="flex:1; background: #dc2626;">Sí, continuar</button>
                    <button id="${idNo}" class="btn-close" style="flex:1; background: #64748b;">Cancelar</button>
                </div>
            </div>`;
        overlay.addEventListener('click', () => { overlay.remove(); resolve(false); });
        overlay.querySelector('#' + idYes).addEventListener('click', (e) => { e.stopPropagation(); overlay.remove(); resolve(true); });
        overlay.querySelector('#' + idNo).addEventListener('click', (e) => { e.stopPropagation(); overlay.remove(); resolve(false); });
        document.body.appendChild(overlay);
    });
}

function getMigratedData(raw) {
    let dataToSave = {};
    if (raw && typeof raw === 'object') {
        if (raw.fecha && !raw.H) { 
            let maxLvl = LEVELS.indexOf(raw.estado);
            for(let i=0; i<=maxLvl; i++) dataToSave[LEVELS[i]] = raw.fecha;
            dataToSave.estado = raw.estado;
        } else {
            dataToSave = { ...raw }; 
        }
    } else if (raw && typeof raw === 'string') {
        dataToSave.estado = raw;
    }
    return dataToSave;
}

function getLevelIndex(status) {
    return (status === '' || status == null) ? -1 : LEVELS.indexOf(status);
}

function degradeData(data, newLvlIdx) {
    for (let i = newLvlIdx + 1; i < LEVELS.length; i++) {
        delete data[LEVELS[i]];
    }
    return data;
}

function applyToCell(id, newTask, newLvlIdx, hoy) {
    const cell = document.getElementById(id);
    if (!cell) return;

    let raw = HISTORIAL_PROD[id];
    let data = getMigratedData(raw);
    const curLvlIdx = getLevelIndex(data.estado || '');

    if (newLvlIdx < curLvlIdx) {
        degradeData(data, newLvlIdx);
    } else if (newTask !== '') {
        for (let i = 0; i <= newLvlIdx; i++) {
            if (!data[LEVELS[i]]) data[LEVELS[i]] = hoy;
        }
    }

    data.estado = newTask;

    cell.innerText = newTask;
    cell.style.backgroundColor = getStyleByStatus(newTask);
    cell.style.color = newTask === '' ? 'transparent' : '#333';

    if (newTask === '') delete HISTORIAL_PROD[id];
    else HISTORIAL_PROD[id] = data;
}

async function paint(id) {
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const newLvlIdx = getLevelIndex(newTask);
    const hoy = getFechaProduccion();

    let raw = HISTORIAL_PROD[id];
    let data = getMigratedData(raw);
    const curLvlIdx = getLevelIndex(data.estado || '');

    if (newLvlIdx < curLvlIdx && data.estado) {
        if (!await modalConfirmacion('¿Deseas degradar o borrar esta unidad? Se perderán las fechas registradas superiores.')) return;
    }

    applyToCell(id, newTask, newLvlIdx, hoy);

    try { await localforage.setItem('HISTORIAL_PROD', HISTORIAL_PROD); } catch (e) { console.error("Error al guardar historial:", e); }
    actualizarContadores();
}

async function paintRow(trackerId, filaNum) {
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const newLvlIdx = getLevelIndex(newTask);
    const hoy = getFechaProduccion();
    const tr = PARQUE_MASTER[trackerId];
    if (!tr || !tr.filas[filaNum]) return;

    const f = tr.filas[filaNum];
    let needsConfirm = false;
    for (let h = 1; h <= f.hincas; h++) {
        const raw = HISTORIAL_PROD[`${trackerId}-F${filaNum}-H${h}`];
        const data = getMigratedData(raw);
        if (newLvlIdx < getLevelIndex(data.estado || '') && data.estado) {
            needsConfirm = true;
            break;
        }
    }
    if (needsConfirm) {
        if (!await modalConfirmacion('¿Deseas degradar o borrar esta fila? Se perderán fechas de producción superiores.')) return;
    }

    for (let h = 1; h <= f.hincas; h++) {
        applyToCell(`${trackerId}-F${filaNum}-H${h}`, newTask, newLvlIdx, hoy);
    }

    try { await localforage.setItem('HISTORIAL_PROD', HISTORIAL_PROD); } catch (e) { console.error("Error al guardar historial:", e); }
    actualizarContadores();
}

async function paintTracker(trackerId) {
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const newLvlIdx = getLevelIndex(newTask);
    const hoy = getFechaProduccion();
    const tr = PARQUE_MASTER[trackerId];
    if (!tr) return;

    let needsConfirm = false;
    outer:
    for (let fN in tr.filas) {
        for (let h = 1; h <= tr.filas[fN].hincas; h++) {
            const raw = HISTORIAL_PROD[`${trackerId}-F${fN}-H${h}`];
            const data = getMigratedData(raw);
            if (newLvlIdx < getLevelIndex(data.estado || '') && data.estado) {
                needsConfirm = true;
                break outer;
            }
        }
    }
    if (needsConfirm) {
        if (!await modalConfirmacion('¿Deseas degradar o borrar este tracker? Se perderán fechas superiores.')) return;
    }

    for (let fN in tr.filas) {
        for (let h = 1; h <= tr.filas[fN].hincas; h++) {
            applyToCell(`${trackerId}-F${fN}-H${h}`, newTask, newLvlIdx, hoy);
        }
    }

    try { await localforage.setItem('HISTORIAL_PROD', HISTORIAL_PROD); } catch (e) { console.error("Error al guardar historial:", e); }
    actualizarContadores();
}

function actualizarContadores() {
    const arco = document.getElementById('select-arco').value;
    const block = document.getElementById('select-block').value;
    if (!block || !PARQUE_MASTER) return;

    let tH = 0, tF = 0, cH = 0, cP = 0, cT = 0, cO = 0, cM = 0; 
    const ids = Object.keys(PARQUE_MASTER).filter(id => PARQUE_MASTER[id].arco === arco && PARQUE_MASTER[id].block === block);
    const lv = {'': 0, 'H': 1, 'P': 2, 'T': 3, 'O': 4, 'M': 5};

    for (let id of ids) {
        const tr = PARQUE_MASTER[id];
        for (let fN in tr.filas) {
            const f = tr.filas[fN]; tF++; tH += f.hincas;
            let minLvl = 5;
            for (let h = 1; h <= f.hincas; h++) {
                const rawData = HISTORIAL_PROD[`${id}-F${fN}-H${h}`]; 
                const st = (rawData && typeof rawData === 'object') ? (rawData.estado || '') : (rawData || '');
                const l = lv[st] || 0;
                if (l >= 1) cH++; if (l >= 2) cP++;
                if (l < minLvl) minLvl = l;
            }
            if (minLvl >= 3) cT++; if (minLvl >= 4) cO++; if (minLvl >= 5) cM++;
        }
    }
    
    const elH = document.getElementById('sum-H'); if(elH) elH.innerText = `${cH} / ${tH} totales`;
    const elP = document.getElementById('sum-P'); if(elP) elP.innerText = `${cP} / ${tH} totales`;
    const elT = document.getElementById('sum-T'); if(elT) elT.innerText = `${cT} / ${tF} totales`;
    const elO = document.getElementById('sum-O'); if(elO) elO.innerText = `${cO} / ${tF} totales`;
    const elM = document.getElementById('sum-M'); if(elM) elM.innerText = `${cM} / ${tF} totales`;

    let totalCajas = 0, cRed = 0, cOrange = 0, cGreen = 0;
    const sbIds = Object.keys(PARQUE_CAJAS).filter(id => PARQUE_CAJAS[id].arco === arco && PARQUE_CAJAS[id].block === block);
    
    for (let id of sbIds) {
        totalCajas++;
        let checks = HISTORIAL_CAJAS[id] || {};
        let count = contarChecks(checks);
        if(count === 0) cRed++; else if(count === 6) cGreen++; else cOrange++;
    }

    const eRed = document.getElementById('sum-scb-red');
    const eOrange = document.getElementById('sum-scb-orange');
    const eGreen = document.getElementById('sum-scb-green');
    
    if(eRed) eRed.innerText = `${cRed}`;
    if(eOrange) eOrange.innerText = `${cOrange}`;
    if(eGreen) eGreen.innerText = `${cGreen} / ${totalCajas} totales`;
}

window.onload = async () => {
    try {
        const s = await localforage.getItem('PARQUE_MASTER_DATA');
        const ps = await localforage.getItem('PARQUE_ESTACIONES_DATA');
        const sb = await localforage.getItem('PARQUE_CAJAS_DATA');
        const hcajas = await localforage.getItem('HISTORIAL_CAJAS');
        const h = await localforage.getItem('HISTORIAL_PROD');
        const z = await localforage.getItem('PARQUE_ZANJAS_DATA'); 
        const pt = await localforage.getItem('PARQUE_PUNTUALES_DATA'); 

        if(s) PARQUE_MASTER = s; 
        if(ps) PARQUE_ESTACIONES = ps; 
        if(sb) PARQUE_CAJAS = sb; 
        if(hcajas) HISTORIAL_CAJAS = hcajas;
        if(z) PARQUE_ZANJAS = z; 
        if(pt) PARQUE_PUNTUALES = pt; 

        if (h) {
            for (let key in h) {
                h[key] = getMigratedData(h[key]);
            }
            HISTORIAL_PROD = h;
        }

        if(s) actualizarSelectores(); 
    } catch (error) {
        console.error("Error al cargar datos:", error);
    }
};