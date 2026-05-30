let currentTask = 'H';
let currentAppMode = 'EM';

let PARQUE_MASTER = {}; 
let HISTORIAL_PROD = {};
let PARQUE_ESTACIONES = {};
let PARQUE_CAJAS = {}; 
let HISTORIAL_CAJAS = {};
let PARQUE_ZANJAS = {}; 
let PARQUE_PUNTUALES = {}; 
let HISTORIAL_PUNTUALES = {}; 
let _currentCajaId = null;
let _currentPuntual = null; 

let pzScale = 1;
let pzPointX = 0;
let pzPointY = 0;

let zaPanelCollapsed = false;
let zaLayerState = {
        zanja: { 'MT': true, 'BT': true, 'SSAA': true, 'PAT': true, 'CCTV': true, 'ENTRADA_PS': true, 'OTRAS': true },
    puntual: { 'arqueta': true, 'gateway': true, 'mbox': true, 'tbox': true, 'meteo': true, 'csb': true, 'cctv': true } 
};

localforage.config({ name: 'SIGMA_PROD_V1', storeName: 'produccion_hincas' });

const LEVELS = ['H', 'P', 'T', 'O', 'M'];

const CHECKLIST_PUNTUALES = {
    'arqueta': [
        {id: 'excavacion', label: '⛏️ Excavación'}, 
        {id: 'colocacion', label: '🏗️ Colocación'}, 
        {id: 'tapado', label: '🪨 Tapado'}, 
        {id: 'sellado', label: '💧 Sellado'}, 
        {id: 'marco', label: '🧱 Marco Hormigón'}, 
        {id: 'tapa', label: '🚪 Tapa'}
    ],
    'baculo': [
        {id: 'localizacion', label: '📍 Localización'},
        {id: 'cimentacion', label: '🧱 Cimentación'},
        {id: 'anclajes', label: '🔩 Anclajes'},
        {id: 'colocacion_poste', label: '🏗️ Colocación Poste'},
        {id: 'pat', label: '⚡ PAT'},
        {id: 'inst_equipos_otros', label: '🔌 Inst. Equipos por otros'}
    ],
    'meteo': [
        {id: 'localizacion', label: '📍 Localización'},
        {id: 'cimentacion', label: '🧱 Cimentación'},
        {id: 'anclajes', label: '🔩 Anclajes'},
        {id: 'colocacion_poste', label: '🏗️ Colocación Poste'},
        {id: 'pat', label: '⚡ PAT'},
        {id: 'inst_equipos_otros', label: '🔌 Inst. Equipos por otros'}
    ],
    'box': [
        {id: 'localizacion', label: '📍 Localización'},
        {id: 'cimentacion', label: '🧱 Cimentación'},
        {id: 'anclajes', label: '🔩 Anclajes'},
        {id: 'colocacion_poste', label: '🏗️ Colocación Poste'},
        {id: 'pat', label: '⚡ PAT'},
        {id: 'inst_equipos', label: '🔌 Instalación Equipos'},
        {id: 'conexionado', label: '🔋 Conexionado Equipos'}
    ]
};

function escapeHtml(str) { 
    if (!str) return '';
    const div = document.createElement('div'); div.textContent = str; return div.innerHTML; 
}
function escapeJsStr(str) { 
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/</g, '\\x3C').replace(/>/g, '\\x3E').replace(/\n/g, '\\n'); 
}

const _debouncers = {};
function debouncedSave(key, data, delay = 2000) {
    if (!_debouncers[key]) _debouncers[key] = { timer: null };
    const d = _debouncers[key];
    if (d.timer) clearTimeout(d.timer);
    d.timer = setTimeout(async () => {
        d.timer = null;
        try { await localforage.setItem(key, data); } catch (e) { console.error("Error guardando", key, e); }
    }, delay);
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
    const panelPuntuales = document.getElementById('summary-puntuales');
    const container = document.getElementById('matrix-container');

    container.removeAttribute('style');

    const layerContainer = document.getElementById('za-layer-container');
    if (mode === 'EM') {
        document.getElementById('toolbar-em').style.display = 'flex';
        document.getElementById('filter-block-container').style.display = 'inline-block';
        if(panelEM) panelEM.style.display = 'block';
        if(panelZA) panelZA.style.display = 'none';
        if(panelPuntuales) panelPuntuales.style.display = 'none';
        if(layerContainer) layerContainer.style.display = 'none';
    } else {
        document.getElementById('toolbar-em').style.display = 'none';
        document.getElementById('filter-block-container').style.display = 'none';
        if(panelEM) panelEM.style.display = 'none';
        if(panelZA) panelZA.style.display = 'block';
        if(panelPuntuales) panelPuntuales.style.display = 'flex';
        if(layerContainer) layerContainer.style.display = 'flex';
        zaPanelCollapsed = false;
        const body = document.getElementById('za-panel-body');
        if (body) body.classList.remove('collapsed');
        const icon = document.getElementById('za-toggle-icon');
        if (icon) icon.classList.remove('collapsed');
        const viewport = document.getElementById('zanjas-viewport');
        if (viewport) viewport.classList.remove('za-panel-collapsed');
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
        
        const fileArcoMatch = file.name.toUpperCase().match(/ARCO\s*(\d+)|ARC\s*(\d+)/);
        const fileArco = fileArcoMatch ? `ARC${fileArcoMatch[1] || fileArcoMatch[2]}` : null;
        console.log(`📄 Procesando: ${file.name} → ARCO: ${fileArco || 'auto'}`);

        const reader = new FileReader();
        await new Promise((resolve) => {
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    let todaLaData = [];
                    workbook.SheetNames.forEach(sheetName => { todaLaData = todaLaData.concat(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])); });
                    console.log(`📊 ${file.name}: ${todaLaData.length} filas, columnas: ${todaLaData.length > 0 ? Object.keys(todaLaData[0]).join(', ') : 'vacío'}`);
                    const detectado = procesarDatosJSON(todaLaData, fileArco);
                    if (detectado) ultimoArcoDetectado = detectado;
                } catch (error) { console.error("Error leyendo Excel:", error); } 
                finally { resolve(); }
            };
            reader.onerror = () => resolve();
            reader.readAsArrayBuffer(file);
        });
    }
    console.log(`📦 Resultado: Master=${Object.keys(PARQUE_MASTER).length}, Zanj=${Object.keys(PARQUE_ZANJAS).length}, Pt=${Object.keys(PARQUE_PUNTUALES).length}, Est=${Object.keys(PARQUE_ESTACIONES).length}, Cajas=${Object.keys(PARQUE_CAJAS).length}`);

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
    const match = clean.match(/ARCO\s*(\d+)|ARC\s*(\d+)/i);
    return match ? `ARC${match[1] || match[2]}` : 'S/A';
}

function stripAccents(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function flexibleFind(row, ...candidates) {
    const keys = Object.keys(row);
    const norm = (s) => stripAccents(s).toUpperCase().replace(/[\s\-\_\.\,\(\)\/\\\+]+/g, '');
    for (const name of candidates) {
        const trimmed = name.trim();
        if (row[trimmed] !== undefined && row[trimmed] !== null && row[trimmed] !== '') return row[trimmed];
        const nameNorm = norm(trimmed);
        const match = keys.find(k => norm(k) === nameNorm || norm(k).includes(nameNorm));
        if (match !== undefined && row[match] !== undefined && row[match] !== null && row[match] !== '') return row[match];
    }
    return undefined;
}

function procesarDatosJSON(data, fileArco) {
    let arcoEnEsteArchivo = fileArco || '';
    
    if (!arcoEnEsteArchivo) {
        for (let i = 0; i < data.length; i++) {
            let val = String(flexibleFind(data[i], 'CODIGO', 'REFERENCIA', 'TIPO', 'CAPA') || '').toUpperCase();
            let m = val.match(/ARCO\s*(\d+)|ARC\s*(\d+)/);
            if (m) { arcoEnEsteArchivo = `ARC${m[1] || m[2]}`; break; }
        }
    }
    if (!arcoEnEsteArchivo) arcoEnEsteArchivo = 'S/A';

    let logZ = 0, logP = 0, logM = 0, logE = 0, logSB = 0;
    data.forEach(rawRow => {
        let row = {};
        for (let key in rawRow) row[stripAccents(key).trim().toUpperCase()] = rawRow[key];
        
        // 1. ZANJAS (Lector flexible restaurado)
        const xInicio = flexibleFind(row, 'X INICIO', 'X_INICIO', 'X-INICIO', 'X INI', 'XINI', 'XSTART');
        const yInicio = flexibleFind(row, 'Y INICIO', 'Y_INICIO', 'Y-INICIO', 'Y INI', 'YINI', 'YSTART');
        const xFin = flexibleFind(row, 'X FIN', 'X_FIN', 'X-FIN', 'X FINAL', 'XEND');
        const yFin = flexibleFind(row, 'Y FIN', 'Y_FIN', 'Y-FIN', 'Y FINAL', 'YEND');
        if (xInicio !== undefined && yInicio !== undefined && xFin !== undefined && yFin !== undefined) {
            const x1 = parseCoord(xInicio), y1 = parseCoord(yInicio);
            const x2 = parseCoord(xFin), y2 = parseCoord(yFin);
            const ref = flexibleFind(row, 'REFERENCIA', 'REFERENCIA (LINEAL)', 'REFERENCIA LINEAL', 'LINEA', 'LINEA ZANJA', 'REF', 'TIPO', 'TIPO ZANJA', 'TIPO_ZANJA', 'TIPO DE ZANJA', 'CAPA', 'CATEGORIA', 'DESCRIPCION', 'DESCRIPCIÓN', 'ZANJA', 'CODIGO') || 'ZANJA';
            
            if (x1 !== 0 && y1 !== 0 && x2 !== 0 && y2 !== 0) {
                const safeRef = String(ref).replace(/[\.\-\s]/g, '_'); 
                const zId = `Z_${x1}_${y1}_${x2}_${y2}_${safeRef}_${arcoEnEsteArchivo}`;
                PARQUE_ZANJAS[zId] = { id: zId, ref: ref, x1: x1, y1: y1, x2: x2, y2: y2, arco: arcoEnEsteArchivo };
                logZ++;
            }
            return; 
        }

        // 2. ELEMENTOS PUNTUALES (Lector flexible restaurado)
        const refPuntual = flexibleFind(row, 'REFERENCIA', 'CODIGO', 'TIPO', 'CAPA');
        const xp = parseCoord(flexibleFind(row, 'X', 'X_INICIO', 'X INICIO') || 0);
        const yp = parseCoord(flexibleFind(row, 'Y', 'Y_INICIO', 'Y INICIO') || 0);
        
        if (refPuntual && xp !== 0 && yp !== 0 && flexibleFind(row, 'FILA') === undefined && flexibleFind(row, 'HINCA') === undefined && !String(refPuntual).toUpperCase().includes('-SB-') && !String(refPuntual).toUpperCase().includes('-PS-')) {
            const upRef = String(refPuntual).toUpperCase();
            if (upRef.includes('ARQUETA') || upRef.includes('BÁCULO') || upRef.includes('BACULO') || upRef.includes('PVH') || upRef.includes('TORRE') || upRef.includes('AGRUPAMIENTO') || upRef.includes('FC-') || upRef.includes('GATEWAY') || upRef.includes('MBOX') || upRef.includes('TBOX') || upRef.includes('METEO') || upRef.includes('CSB') || upRef.includes('CCTV')) {
                const safePRef = String(upRef).replace(/[\.\-\s]/g, '_'); 
                const pId = `PT_${xp}_${yp}_${safePRef}_${arcoEnEsteArchivo}`;
                PARQUE_PUNTUALES[pId] = { id: pId, ref: String(refPuntual), x: xp, y: yp, arco: arcoEnEsteArchivo };
                logP++;
                return;
            }
        }

        // 3. TRACKERS Y CAJAS SCB
        const tId = flexibleFind(row, 'CODIGO', 'REFERENCIA', 'TIPO', 'CAPA');
        const rawX = flexibleFind(row, 'X', 'X_INICIO', 'X INICIO'), rawY = flexibleFind(row, 'Y', 'Y_INICIO', 'Y INICIO');
        
        if (!tId || rawX === undefined || rawY === undefined) return;
        const tIdStr = String(tId).trim().toUpperCase();
        if (tIdStr === '') return;

        const x = parseCoord(rawX), y = parseCoord(rawY);
        if (x === 0 && y === 0) return;

        if (flexibleFind(row, 'PUNTO') !== undefined || tIdStr.includes('-PS-')) {
            const match = tIdStr.match(/ARCO\s*(\d+)|ARC\s*(\d+)/);
            const arcoPS = match ? `ARC${match[1] || match[2]}` : 'S/A';
            const blockPS = tIdStr.split('-').pop().trim();
            if (!PARQUE_ESTACIONES[tIdStr]) { PARQUE_ESTACIONES[tIdStr] = { name: tIdStr, arco: arcoPS, block: blockPS, minX: x, maxX: x, minY: y, maxY: y }; logE++; } 
            else { PARQUE_ESTACIONES[tIdStr].minX = Math.min(PARQUE_ESTACIONES[tIdStr].minX, x); PARQUE_ESTACIONES[tIdStr].maxX = Math.max(PARQUE_ESTACIONES[tIdStr].maxX, x); PARQUE_ESTACIONES[tIdStr].minY = Math.min(PARQUE_ESTACIONES[tIdStr].minY, y); PARQUE_ESTACIONES[tIdStr].maxY = Math.max(PARQUE_ESTACIONES[tIdStr].maxY, y); }
            return; 
        }

        if (tIdStr.includes('-SB-')) {
            const match = tIdStr.match(/ARCO\s*(\d+)|ARC\s*(\d+)/);
            const arcoSB = match ? `ARC${match[1] || match[2]}` : 'S/A';
            const blockRaw = tIdStr.split('-')[2]; 
            const blockSB = blockRaw ? blockRaw.charAt(0) : 'S/B'; 
            if (!PARQUE_CAJAS[tIdStr]) { PARQUE_CAJAS[tIdStr] = { name: tIdStr, arco: arcoSB, block: blockSB, minX: x, maxX: x, minY: y, maxY: y }; logSB++; } 
            else { PARQUE_CAJAS[tIdStr].minX = Math.min(PARQUE_CAJAS[tIdStr].minX, x); PARQUE_CAJAS[tIdStr].maxX = Math.max(PARQUE_CAJAS[tIdStr].maxX, x); PARQUE_CAJAS[tIdStr].minY = Math.min(PARQUE_CAJAS[tIdStr].minY, y); PARQUE_CAJAS[tIdStr].maxY = Math.max(PARQUE_CAJAS[tIdStr].maxY, y); }
            return; 
        }

        const block = flexibleFind(row, 'BLOQUE', 'BLOCK', 'ZONA', 'SECTOR', 'MANZANA', 'CUADRO', 'ÁREA', 'AREA') || 'S/B', filaNum = flexibleFind(row, 'FILA', 'ROW', 'LINEA', 'TRAZA', 'TRACK', 'FILA N', 'NRO FILA', 'Nº FILA', 'FILA N.'), hincaIndex = flexibleFind(row, 'HINCA', 'POSTE', 'HINCA N.', 'Nº HINCA', 'N° HINCA', 'NRO HINCA', 'HINCA NRO', 'HINCA N', 'POSTE NRO', 'Nº POSTE');
        if (filaNum === undefined || filaNum === null || hincaIndex === undefined || hincaIndex === null) return;
        const arcoId = detectarArco(tIdStr);

        if(!PARQUE_MASTER[tIdStr]) { PARQUE_MASTER[tIdStr] = { name: tIdStr, arco: arcoId, block: String(block).trim(), minX: x, maxX: x, minY: y, maxY: y, filas: {} }; logM++; } 
        else { PARQUE_MASTER[tIdStr].minX = Math.min(PARQUE_MASTER[tIdStr].minX, x); PARQUE_MASTER[tIdStr].maxX = Math.max(PARQUE_MASTER[tIdStr].maxX, x); PARQUE_MASTER[tIdStr].minY = Math.min(PARQUE_MASTER[tIdStr].minY, y); PARQUE_MASTER[tIdStr].maxY = Math.max(PARQUE_MASTER[tIdStr].maxY, y); }
        if(!PARQUE_MASTER[tIdStr].filas[filaNum]) PARQUE_MASTER[tIdStr].filas[filaNum] = { tipo: filaNum == 2 ? "MOTORA" : "GEMELA", hincas: 0 };
        if(hincaIndex > PARQUE_MASTER[tIdStr].filas[filaNum].hincas) PARQUE_MASTER[tIdStr].filas[filaNum].hincas = parseInt(hincaIndex, 10);
    });
    console.log(`🔍 Arco ${arcoEnEsteArchivo}: ${logZ} zanj, ${logP} punt, ${logM} mast, ${logE} est, ${logSB} cajas`);
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
    try {
        const arco = document.getElementById('select-arco').value;
        const block = document.getElementById('select-block').value;
        const container = document.getElementById('matrix-container');
        
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
        
        let parts = [`<div class="map-canvas" style="position: relative; min-width: ${canvasWidth}px; min-height: ${canvasHeight}px;">`];
        
        for (let id of psIds) {
            const ps = PARQUE_ESTACIONES[id];
            const pxX = (((ps.minX + ps.maxX) / 2 - gMinX) * SCALE_X) + MARGIN_LEFT;
            const pxY = ((gMaxY - ps.maxY) * SCALE_Y) + MARGIN_TOP_BOTTOM;
            let wS = ((ps.maxX - ps.minX) * SCALE_X); let pxH = ((ps.maxY - ps.minY) * SCALE_Y);
            if (wS < 60) wS = 60; if (pxH < 40) pxH = 40; 
            const letra = ps.name.split('-').pop(); const safeName = escapeHtml(`PS-${letra}`); 
            parts.push(`<div class="power-station" style="position: absolute; left: ${pxX}px; top: ${pxY}px; width: ${wS}px; height: ${pxH}px;" title="${escapeHtml(ps.name)}"><span style="font-size: 16px; margin-bottom: 2px;">⚡</span><span>${safeName}</span></div>`);
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
            parts.push(`<div id="sb-${safeId}" class="string-box ${colorClass}" style="position: absolute; left: ${pxX}px; top: ${pxY}px; width: ${wS}px; height: ${pxH}px;" title="Ver Checklist" onclick="abrirModalCaja('${safeId}')"><span>${escapeHtml(numCaja)}</span></div>`);
        }

        for (let id of ids) {
            const tr = PARQUE_MASTER[id];
            const pxX = (((tr.minX + tr.maxX) / 2 - gMinX) * SCALE_X) + MARGIN_LEFT;
            const pxY = ((gMaxY - tr.maxY) * SCALE_Y) + MARGIN_TOP_BOTTOM;
            let pxH = ((tr.maxY - tr.minY) * SCALE_Y); if (pxH < 40) pxH = 40; 
            const filas = Object.keys(tr.filas).sort((a,b) => a-b);
            const esM = filas.length === 1;
            let wS = !esM ? `width: ${((tr.maxX - tr.minX) * SCALE_X) + 22}px; justify-content: space-between;` : `justify-content: center;`;
            
            parts.push(`<div class="prod-card map-card" style="position: absolute; left: ${pxX}px; top: ${pxY}px; height: ${pxH}px; ${wS}">`);
            const safeId = escapeJsStr(id);
            const safeName = escapeHtml(tr.name.split('-').slice(-2).join('-'));
            parts.push(`<div class="tracker-title" style="cursor:pointer;" onclick="paintTracker('${safeId}')" title="Pintar tracker completo">${safeName}</div>`);
            for (let fN of filas) {
                const f = tr.filas[fN];
                let tT = fN == 2 ? 'MOT' : 'GEM'; let cT = fN == 2 ? 'motora' : 'gemela'; if (esM) { tT = 'MONO'; cT = 'mono'; }
                parts.push(`<div class="row-container"><div class="row-tag ${cT}" style="cursor:pointer;" onclick="paintRow('${safeId}', '${fN}')" title="Pintar fila completa">${tT}</div><div class="cells-grid">`);
                for (let h = 1; h <= f.hincas; h++) {
                    const hId = `${id}-F${fN}-H${h}`;
                    const safeHId = escapeJsStr(hId);
                    const rawData = HISTORIAL_PROD[hId];
                    const s = (rawData && typeof rawData === 'object') ? (rawData.estado || '') : (rawData || '');
                    parts.push(`<div class="cell" id="${safeHId}" onclick="paint('${safeHId}')" style="background-color:${getStyleByStatus(s)}; color: ${s==='' ? 'transparent' : '#333'};">${s}</div>`);
                }
                parts.push(`</div></div>`);
            }
            parts.push(`</div>`);
        }
        parts.push('</div>');
        container.innerHTML = parts.join('');
        
        const bName = document.getElementById('summary-block-name');
        if (bName) bName.innerText = `Arco ${arco.replace('ARC','')} - Bloque ${block}`;
        
        actualizarContadores();
        initPanEM();
    } catch(e) {
        console.error("Error crítico dibujando EM:", e);
    }
}

function initPanEM() {
    const container = document.getElementById('matrix-container');
    if (!container) return;

    if (container.dataset.panEmInit === '1') return;
    container.dataset.panEmInit = '1';

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
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
        if (clientX === undefined || clientY === undefined) return;
        startX = clientX - container.offsetLeft;
        startY = clientY - container.offsetTop;
        sLeft = container.scrollLeft;
        sTop = container.scrollTop;
    };

    const onMove = (e) => {
        if (!isDragging || currentAppMode !== 'EM') return;
        e.preventDefault();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
        if (clientX === undefined || clientY === undefined) return;
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
    const r = String(ref).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-\_\.]+/g, '');
    if (r.includes('ENTRADAPS')) return 'ENTRADA_PS';
    if (r.includes('MT') || r.includes('MEDIATENSION')) return 'MT';
    if (r.includes('BT') || r.includes('BAJATENSION')) return 'BT';
    if (r.includes('SSAA') || r.includes('SAA') || r.includes('AUXILIAR')) return 'SSAA';
    if (r.includes('ZANJAG') || r.includes('PAT')) return 'PAT';
    if (r.includes('CCTV') || r.includes('LEA') || r.includes('FIBRA') || r.includes('COMUNICACION')) return 'CCTV';
    return 'OTRAS';
}

function getZanjaColorByType(type) {
    const colors = { 
        'MT': '#ef4444',         
        'BT': '#f59e0b',         
        'SSAA': '#22c55e',       
        'PAT': '#ec4899',        
        'CCTV': '#ca8a04',       
        'ENTRADA_PS': '#06b6d4',  
        'OTRAS': '#94a3b8'       
    };
    return colors[type] || '#94a3b8';
}

function contarChecksPuntual(checks, type) {
    let count = 0;
    const items = CHECKLIST_PUNTUALES[type];
    if(!items) return 0;
    items.forEach(i => { if (checks[i.id]) count++; });
    return count;
}

function getColorPuntual(count, max) {
    if (count === 0) return 'rgba(255, 0, 0, 0.45)';
    if (count === max) return 'rgba(0, 220, 0, 0.45)';
    return 'rgba(255, 130, 0, 0.45)';
}

function renderMatrixZanjas() {
    try {
        const arco = document.getElementById('select-arco').value;
        const container = document.getElementById('matrix-container');
        
        container.style.paddingBottom = '0px';
        container.style.overflow = 'hidden';
        container.innerHTML = '';
        
        let ids = Object.keys(PARQUE_MASTER).filter(id => PARQUE_MASTER[id].arco === arco);
        let sbIds = Object.keys(PARQUE_CAJAS).filter(id => PARQUE_CAJAS[id].arco === arco);
        
        let zValues = Object.values(PARQUE_ZANJAS).filter(z => z.arco === arco);
        let pValues = Object.values(PARQUE_PUNTUALES).filter(p => p.arco === arco);

        if(ids.length === 0 && sbIds.length === 0 && zValues.length === 0 && pValues.length === 0) { 
            container.innerHTML = '<div class="empty-state">No hay datos para esta vista de Arco.</div>'; 
            return; 
        }
        
        let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
        ids.forEach(id => { const tr = PARQUE_MASTER[id]; if(tr.minX < gMinX) gMinX = tr.minX; if(tr.maxX > gMaxX) gMaxX = tr.maxX; if(tr.minY < gMinY) gMinY = tr.minY; if(tr.maxY > gMaxY) gMaxY = tr.maxY; });
        sbIds.forEach(id => { const sb = PARQUE_CAJAS[id]; if(sb.minX < gMinX) gMinX = sb.minX; if(sb.maxX > gMaxX) gMaxX = sb.maxX; if(sb.minY < gMinY) gMinY = sb.minY; if(sb.maxY > gMaxY) gMaxY = sb.maxY; });
        
        zValues.forEach(z => {
            if(z.x1 < gMinX) gMinX = z.x1; if(z.x1 > gMaxX) gMaxX = z.x1;
            if(z.x2 < gMinX) gMinX = z.x2; if(z.x2 > gMaxX) gMaxX = z.x2;
            if(z.y1 < gMinY) gMinY = z.y1; if(z.y1 > gMaxY) gMaxY = z.y1;
            if(z.y2 < gMinY) gMinY = z.y2; if(z.y2 > gMaxY) gMaxY = z.y2;
        });

        pValues.forEach(p => {
            if(p.x < gMinX) gMinX = p.x; if(p.x > gMaxX) gMaxX = p.x;
            if(p.y < gMinY) gMinY = p.y; if(p.y > gMaxY) gMaxY = p.y;
        });

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
        
        let parts = [`<div id="zanjas-viewport" style="width: 100%; height: 70vh; min-height: 500px; overflow: hidden; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; position: relative; margin-top: 10px; cursor: grab;">`];
        parts.push(`<div id="pan-zoom-layer" style="position: absolute; width: ${canvasWidth}px; height: ${canvasHeight}px; transform: translate(${pzPointX}px, ${pzPointY}px) scale(${pzScale}); transform-origin: 0 0;">`);
        
        let svgParts = [`<svg style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:10;">`];
        
        let metrosPorTipo = { 'MT': 0, 'BT': 0, 'SSAA': 0, 'PAT': 0, 'CCTV': 0, 'ENTRADA_PS': 0, 'OTRAS': 0 };
        
        zValues.forEach(z => {
            const dx = z.x2 - z.x1; const dy = z.y2 - z.y1;
            const longitud = Math.sqrt(dx*dx + dy*dy);
            
            const type = normalizeZanjaType(z.ref);
            metrosPorTipo[type] = (metrosPorTipo[type] || 0) + longitud;
            if (!zaLayerState.zanja[type]) return;
            
            const pxX1 = ((z.x1 - gMinX) * baseScaleX) + MARGIN; const pxY1 = ((gMaxY - z.y1) * baseScaleY) + MARGIN;
            const pxX2 = ((z.x2 - gMinX) * baseScaleX) + MARGIN; const pxY2 = ((gMaxY - z.y2) * baseScaleY) + MARGIN;
            const strokeColor = getZanjaColorByType(type);
            
            const grosorFinal = 4 / pzScale;
            const zAlertMsg = escapeJsStr(`Zanja detectada:\nTipo: ${type}\nRef: ${z.ref}`);
            
            svgParts.push(`<line x1="${pxX1}" y1="${pxY1}" x2="${pxX2}" y2="${pxY2}" stroke="${strokeColor}" stroke-width="${grosorFinal}" stroke-linecap="round" style="pointer-events:auto; cursor:pointer;" onclick="alert('${zAlertMsg}')"></line>`);

            if (type !== 'ENTRADA_PS') {
                const pLen = Math.sqrt(Math.pow(pxX2 - pxX1, 2) + Math.pow(pxY2 - pxY1, 2));
                if (pLen > 40) { 
                    const numTexts = Math.max(1, Math.floor(pLen / 100)); 
                    let angle = Math.atan2(pxY2 - pxY1, pxX2 - pxX1) * (180 / Math.PI);
                    if (angle > 90 || angle < -90) angle += 180; 
                    
                    for(let i = 1; i <= numTexts; i++) {
                        let f = i / (numTexts + 1);
                        let cx = pxX1 + (pxX2 - pxX1) * f;
                        let cy = pxY1 + (pxY2 - pxY1) * f;
                        svgParts.push(`<text class="za-cut-text" x="${cx}" y="${cy}" fill="${strokeColor}" font-size="${10 / pzScale}" font-weight="900" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" transform="rotate(${angle}, ${cx}, ${cy})" style="pointer-events:none;" paint-order="stroke" stroke="#f8fafc" stroke-width="${5 / pzScale}">${type}</text>`);
                    }
                }
            }
        });

        let countsPT = { arqueta: 0, gateway: 0, mbox: 0, tbox: 0, meteo: 0, csb: 0, cctv: 0 };
        let cctvDrawnCoords = new Set(); 

        pValues.forEach(p => {
            const pxX = ((p.x - gMinX) * baseScaleX) + MARGIN;
            const pxY = ((gMaxY - p.y) * baseScaleY) + MARGIN;
            const refUp = p.ref.toUpperCase();
            const c = '#000000'; 
            const sw = 2; 
            const pIdSafe = escapeJsStr(p.id);
            let checks = HISTORIAL_PUNTUALES[p.id] || {};
            
            if (refUp.includes('ARQUETA')) {
                countsPT.arqueta++;
                if (!zaLayerState.puntual.arqueta) return;
                
                const s = 8; 
                let count = contarChecksPuntual(checks, 'arqueta');
                let fillCol = getColorPuntual(count, 6);

                svgParts.push(`<rect id="pt-${pIdSafe}" x="${pxX - s/2}" y="${pxY - s/2}" width="${s}" height="${s}" fill="${fillCol}" stroke="${c}" stroke-width="${sw}" style="pointer-events:auto; cursor:pointer;" onclick="abrirModalPuntual('${pIdSafe}', 'arqueta', '${escapeJsStr(p.ref)}')"></rect>`);
            } 
            else if (refUp.includes('POSTE CAJA')) {
                countsPT.csb++;
                if (!zaLayerState.puntual.csb) return;
                
                let count = contarChecksPuntual(checks, 'box');
                let fillCol = getColorPuntual(count, 7);

                const s = 14; 
                const s2 = s/2;
                const triPath = `M ${pxX},${pxY - s2} L ${pxX + s2},${pxY + s2} L ${pxX - s2},${pxY + s2} Z`;
                
                svgParts.push(`<path id="pt-${pIdSafe}" d="${triPath}" fill="${fillCol}" stroke="${c}" stroke-width="${sw}" style="pointer-events:auto; cursor:pointer;" onclick="abrirModalPuntual('${pIdSafe}', 'box', '${escapeJsStr(p.ref)}')"/>`);
                svgParts.push(`<circle cx="${pxX}" cy="${pxY + 2.5}" r="1.5" fill="${c}" style="pointer-events:none;"></circle>`);
                svgParts.push(`<text x="${pxX}" y="${pxY - s2 - 4}" fill="${c}" font-size="9" font-weight="bold" text-anchor="middle" font-family="sans-serif" style="pointer-events:none;">CSB</text>`);
            }
            else if (refUp.includes('BÁCULO-CCTV') || refUp.includes('BACULO-CCTV') || refUp.includes('CCTV') || refUp.includes('FC-')) {
                if (!zaLayerState.puntual.cctv) return;
                
                const coordKey = `${p.x.toFixed(1)}_${p.y.toFixed(1)}`;
                if (cctvDrawnCoords.has(coordKey)) return; 
                
                cctvDrawnCoords.add(coordKey);
                countsPT.cctv++;

                let count = contarChecksPuntual(checks, 'baculo');
                let fillCol = getColorPuntual(count, 6);

                const r = 6; 
                const o = r * 0.7071; 
                let safeRef = refUp.includes('FC-') ? 'CCTV / FC' : escapeJsStr(p.ref);
                
                svgParts.push(`<circle id="pt-${pIdSafe}" cx="${pxX}" cy="${pxY}" r="${r}" fill="${fillCol}" stroke="${c}" stroke-width="${sw}" style="pointer-events:auto; cursor:pointer;" onclick="abrirModalPuntual('${pIdSafe}', 'baculo', '${safeRef}')"></circle>`);
                svgParts.push(`<line x1="${pxX - o}" y1="${pxY - o}" x2="${pxX + o}" y2="${pxY + o}" stroke="${c}" stroke-width="${sw}" style="pointer-events:none;"></line>`);
                svgParts.push(`<line x1="${pxX - o}" y1="${pxY + o}" x2="${pxX + o}" y2="${pxY - o}" stroke="${c}" stroke-width="${sw}" style="pointer-events:none;"></line>`);
            }
            else if (refUp.includes('GATEWAY') || refUp.includes('MBOX') || refUp.includes('TBOX') || refUp.includes('METEO')) {
                let shortName = 'PVH';
                let pType = null;
                if (refUp.includes('MBOX+GATEWAY')) { shortName = 'MBOX+GW'; pType = 'box'; countsPT.mbox++; }
                else if (refUp.includes('GATEWAY')) { shortName = 'GATEWAY'; pType = 'box'; countsPT.gateway++; }
                else if (refUp.includes('MBOX')) { shortName = 'MBOX'; pType = 'box'; countsPT.mbox++; }
                else if (refUp.includes('TBOX')) { shortName = 'TBOX'; pType = 'box'; countsPT.tbox++; }
                else if (refUp.includes('METEO')) { shortName = 'METEO'; pType = 'meteo'; countsPT.meteo++; }
                
                if (pType && !zaLayerState.puntual[pType === 'meteo' ? 'meteo' : 'mbox']) return;

                let maxC = pType === 'meteo' ? 6 : 7;
                let count = contarChecksPuntual(checks, pType);
                let fillCol = getColorPuntual(count, maxC);

                const s = 14; 
                const s2 = s/2;
                const triPath = `M ${pxX},${pxY - s2} L ${pxX + s2},${pxY + s2} L ${pxX - s2},${pxY + s2} Z`;

                svgParts.push(`<path id="pt-${pIdSafe}" d="${triPath}" fill="${fillCol}" stroke="${c}" stroke-width="${sw}" style="pointer-events:auto; cursor:pointer;" onclick="abrirModalPuntual('${pIdSafe}', '${pType}', '${escapeJsStr(shortName)}')"/>`);
                svgParts.push(`<circle cx="${pxX}" cy="${pxY + 2.5}" r="1.5" fill="${c}" style="pointer-events:none;"></circle>`);
                svgParts.push(`<text x="${pxX}" y="${pxY - s2 - 4}" fill="${c}" font-size="9" font-weight="bold" text-anchor="middle" font-family="sans-serif" style="pointer-events:none;">${escapeHtml(shortName)}</text>`);
            }
        });

        svgParts.push(`</svg>`);
        parts.push(svgParts.join(''));

        for (let id of sbIds) {
            const sb = PARQUE_CAJAS[id];
            const pxX = (((sb.minX + sb.maxX) / 2 - gMinX) * baseScaleX) + MARGIN; 
            const pxY = ((gMaxY - sb.maxY) * baseScaleY) + MARGIN;
            const numCaja = sb.name.split('-').slice(2).join('-').split('_')[0];
            parts.push(`<div style="position: absolute; left: ${pxX}px; top: ${pxY}px; width: 24px; height: 14px; background: rgba(226, 232, 240, 0.7); border: 1px solid #cbd5e1; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94a3b8; font-weight: bold; pointer-events: none; z-index: 1;">${escapeHtml(numCaja)}</div>`);
        }

        for (let id of ids) {
            const tr = PARQUE_MASTER[id];
            const pxX = (((tr.minX + tr.maxX) / 2 - gMinX) * baseScaleX) + MARGIN; const pxY = ((gMaxY - tr.maxY) * baseScaleY) + MARGIN;
            let pxH = ((tr.maxY - tr.minY) * baseScaleY); if (pxH < 40) pxH = 40; 
            const safeName = escapeHtml(tr.name.split('-').slice(-2).join('-'));
            let wS_ZA = ((tr.maxX - tr.minX) * baseScaleX) || 15;
            parts.push(`<div style="position: absolute; left: ${pxX}px; top: ${pxY}px; width: ${wS_ZA}px; height: ${pxH}px; background: rgba(226, 232, 240, 0.7); border: 1px solid #cbd5e1; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94a3b8; font-weight: bold; pointer-events: none; z-index: 2;">${safeName}</div>`);
        }
        
        parts.push(`</div></div>`);
        container.innerHTML = parts.join('');
        
        const arcoNameZA = document.getElementById('summary-arco-name-za');
        if (arcoNameZA) arcoNameZA.innerText = `Arco ${arco.replace('ARC','')}`;
        
        const allMetros = Object.values(metrosPorTipo).reduce((a, b) => a + b, 0);
        const setTxt = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
        setTxt('sum-za-metros', Math.round(allMetros) + " m");
        setTxt('sum-za-metros-mini', Math.round(allMetros) + " m");
        setTxt('sum-za-mt', Math.round(metrosPorTipo['MT']) + " m");
        setTxt('sum-za-bt', Math.round(metrosPorTipo['BT']) + " m");
        setTxt('sum-za-ssaa', Math.round(metrosPorTipo['SSAA']) + " m");
        setTxt('sum-za-pat', Math.round(metrosPorTipo['PAT']) + " m");
        setTxt('sum-za-cctv', Math.round(metrosPorTipo['CCTV']) + " m");
        setTxt('sum-za-entradaps', Math.round(metrosPorTipo['ENTRADA_PS']) + " m");
        setTxt('sum-za-otras', Math.round(metrosPorTipo['OTRAS']) + " m");
        
        setTxt('sum-pt-arqueta', countsPT.arqueta);
        setTxt('sum-pt-gateway', countsPT.gateway);
        setTxt('sum-pt-mbox', countsPT.mbox);
        setTxt('sum-pt-tbox', countsPT.tbox);
        setTxt('sum-pt-meteo', countsPT.meteo);
        setTxt('sum-pt-csb', countsPT.csb);
        setTxt('sum-pt-cctv', countsPT.cctv);
        
        initPanZoomZanjas(); 
    } catch(e) {
        console.error("Error crítico dibujando Zanjas:", e);
    }
}

function toggleZAPanel() {
    zaPanelCollapsed = !zaPanelCollapsed;
    const body = document.getElementById('za-panel-body');
    const icon = document.getElementById('za-toggle-icon');
    const viewport = document.getElementById('zanjas-viewport');
    if (body) body.classList.toggle('collapsed', zaPanelCollapsed);
    if (icon) icon.classList.toggle('collapsed', zaPanelCollapsed);
    if (viewport) viewport.classList.toggle('za-panel-collapsed', zaPanelCollapsed);
}

function toggleZALayer(category, key) {
    zaLayerState[category][key] = !zaLayerState[category][key];
    if (currentAppMode === 'ZA') renderMatrixZanjas();
}

function toggleZALayerDropdown() {
    const dd = document.getElementById('za-layer-dropdown');
    if (dd) dd.classList.toggle('show');
}

document.addEventListener('click', function(e) {
    const dd = document.getElementById('za-layer-dropdown');
    const btn = document.getElementById('za-layer-btn');
    if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
        dd.classList.remove('show');
    }
});

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
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
        if (clientX === undefined || clientY === undefined) return;
        startX = clientX - pzPointX;
        startY = clientY - pzPointY;
        viewport.style.cursor = 'grabbing';
    };

    const onMove = (e) => {
        if (!isDragging || currentAppMode !== 'ZA') return;
        e.preventDefault();
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
        if (clientX === undefined || clientY === undefined) return;
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
    debouncedSave('HISTORIAL_CAJAS', HISTORIAL_CAJAS);
}

function contarChecks(checks) {
    let count = 0;
    if(checks['localizacion']) count++; if(checks['soportacion']) count++; if(checks['fusibles']) count++; if(checks['con_strings']) count++; if(checks['con_bus']) count++; if(checks['limpieza']) count++;
    return count;
}

function abrirModalPuntual(id, type, refName) {
    cerrarModalPuntual();
    _currentPuntual = { id, type };
    let checks = HISTORIAL_PUNTUALES[id] || {};
    const items = CHECKLIST_PUNTUALES[type];
    if (!items) return;
    
    let html = `<div id="modal-puntual-overlay" class="modal-overlay" onclick="cerrarModalPuntual()"><div class="modal-content" onclick="event.stopPropagation()"><h3>Checklist: <span style="color:var(--accent);">${escapeHtml(refName)}</span></h3><div class="checklist">`;
    items.forEach(item => { 
        const isChecked = checks[item.id] ? 'checked' : ''; 
        html += `<label class="check-item"><input type="checkbox" ${isChecked} onchange="toggleCheckPuntual('${escapeJsStr(id)}', '${item.id}', this.checked)">${item.label}</label>`; 
    });
    html += `</div><button class="btn-close" onclick="cerrarModalPuntual()">Guardar y Cerrar</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function cerrarModalPuntual() {
    const m = document.getElementById('modal-puntual-overlay');
    if (m) {
        m.remove();
        if (_currentPuntual) {
            const ptEl = document.getElementById('pt-' + _currentPuntual.id);
            if (ptEl) {
                const checks = HISTORIAL_PUNTUALES[_currentPuntual.id] || {};
                const max = CHECKLIST_PUNTUALES[_currentPuntual.type].length;
                const count = contarChecksPuntual(checks, _currentPuntual.type);
                ptEl.setAttribute('fill', getColorPuntual(count, max));
            }
            _currentPuntual = null;
        }
    }
}

async function toggleCheckPuntual(id, item, isChecked) {
    if (!HISTORIAL_PUNTUALES[id]) HISTORIAL_PUNTUALES[id] = {};
    const hoy = getFechaProduccion();
    if (isChecked) { HISTORIAL_PUNTUALES[id][item] = hoy; } 
    else { delete HISTORIAL_PUNTUALES[id][item]; }
    debouncedSave('HISTORIAL_PUNTUALES', HISTORIAL_PUNTUALES);
}

const STATUS_COLORS = { 'H': '#ffeb3b', 'P': '#2196f3', 'T': '#9c27b0', 'O': '#00bcd4', 'M': '#4caf50', '': '#fff' };
function getStyleByStatus(s) { return STATUS_COLORS[s] || '#fff'; }

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

    debouncedSave('HISTORIAL_PROD', HISTORIAL_PROD);
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

    debouncedSave('HISTORIAL_PROD', HISTORIAL_PROD);
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

    debouncedSave('HISTORIAL_PROD', HISTORIAL_PROD);
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
        const hp = await localforage.getItem('HISTORIAL_PUNTUALES');
        const h = await localforage.getItem('HISTORIAL_PROD');
        const z = await localforage.getItem('PARQUE_ZANJAS_DATA'); 
        const pt = await localforage.getItem('PARQUE_PUNTUALES_DATA'); 

        if(s) PARQUE_MASTER = s; 
        if(ps) PARQUE_ESTACIONES = ps; 
        if(sb) PARQUE_CAJAS = sb; 
        if(hcajas) HISTORIAL_CAJAS = hcajas;
        if(hp) HISTORIAL_PUNTUALES = hp;
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