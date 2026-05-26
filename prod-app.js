let currentTask = 'H';
let PARQUE_MASTER = {}; 
let HISTORIAL_PROD = {};
let PARQUE_ESTACIONES = {};
let PARQUE_CAJAS = {}; 
let HISTORIAL_CAJAS = {};

localforage.config({ name: 'SIGMA_PROD_V1', storeName: 'produccion_hincas' });

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeJsStr(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function setTask(task, el) {
    currentTask = task;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}

// NUEVA FUNCIÓN: Obtener la fecha seleccionada o la de hoy por defecto
function getFechaProduccion() {
    const inputFecha = document.getElementById('fecha-produccion');
    if (inputFecha && inputFecha.value) {
        return inputFecha.value;
    }
    return new Date().toISOString().split('T')[0];
}

async function importarArchivos(input) {
    const files = input.files;
    if (files.length === 0) return;
    const btn = document.getElementById('btn-import');
    if (btn) btn.innerText = "⏳ Procesando...";
    let ultimoArcoDetectado = '';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        await new Promise((resolve) => {
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    let todaLaData = [];
                    workbook.SheetNames.forEach(sheetName => {
                        todaLaData = todaLaData.concat(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]));
                    });
                    const detectado = procesarDatosJSON(todaLaData);
                    if (detectado) ultimoArcoDetectado = detectado;
                } catch (error) { console.error("Error leyendo Excel:", error); } 
                finally { resolve(); }
            };
            reader.onerror = () => resolve();
            reader.readAsArrayBuffer(file);
        });
    }

    await localforage.setItem('PARQUE_MASTER_DATA', PARQUE_MASTER);
    await localforage.setItem('PARQUE_ESTACIONES_DATA', PARQUE_ESTACIONES);
    await localforage.setItem('PARQUE_CAJAS_DATA', PARQUE_CAJAS);
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
        if (!filaNum || !hincaIndex) return;
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
    renderMatrix();
}

async function renderMatrix() {
    const arco = document.getElementById('select-arco').value;
    const block = document.getElementById('select-block').value;
    const container = document.getElementById('matrix-container');
    container.innerHTML = '';
    
    const ids = Object.keys(PARQUE_MASTER).filter(id => PARQUE_MASTER[id].arco === arco && PARQUE_MASTER[id].block === block);
    const psIds = Object.keys(PARQUE_ESTACIONES).filter(id => PARQUE_ESTACIONES[id].arco === arco && PARQUE_ESTACIONES[id].block === block);
    const sbIds = Object.keys(PARQUE_CAJAS).filter(id => PARQUE_CAJAS[id].arco === arco && PARQUE_CAJAS[id].block === block);

    if(ids.length === 0 && psIds.length === 0 && sbIds.length === 0) { container.innerHTML = '<div class="empty-state">No hay datos para este bloque.</div>'; return; }
    
    let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
    ids.forEach(id => { const tr = PARQUE_MASTER[id]; if(tr.minX < gMinX) gMinX = tr.minX; if(tr.maxX > gMaxX) gMaxX = tr.maxX; if(tr.minY < gMinY) gMinY = tr.minY; if(tr.maxY > gMaxY) gMaxY = tr.maxY; });
    psIds.forEach(id => { const ps = PARQUE_ESTACIONES[id]; if(ps.minX < gMinX) gMinX = ps.minX; if(ps.maxX > gMaxX) gMaxX = ps.maxX; if(ps.minY < gMinY) gMinY = ps.minY; if(ps.maxY > gMaxY) gMaxY = ps.maxY; });
    sbIds.forEach(id => { const sb = PARQUE_CAJAS[id]; if(sb.minX < gMinX) gMinX = sb.minX; if(sb.maxX > gMaxX) gMaxX = sb.maxX; if(sb.minY < gMinY) gMinY = sb.minY; if(sb.maxY > gMaxY) gMaxY = sb.maxY; });

    const rX = (gMaxX - gMinX) || 1; const rY = (gMaxY - gMinY) || 1;
    const SCALE_X = 8, SCALE_Y = 6, MARGIN = 300;
    const canvasWidth = (rX * SCALE_X) + (MARGIN * 2);
    const canvasHeight = (rY * SCALE_Y) + (MARGIN * 2);
    
    let html = `<div class="map-canvas" style="min-width: ${canvasWidth}px; min-height: ${canvasHeight}px;">`;
    
    for (let id of psIds) {
        const ps = PARQUE_ESTACIONES[id];
        const pxX = (((ps.minX + ps.maxX) / 2 - gMinX) * SCALE_X) + MARGIN;
        const pxY = ((gMaxY - ps.maxY) * SCALE_Y) + MARGIN;
        let wS = ((ps.maxX - ps.minX) * SCALE_X); let pxH = ((ps.maxY - ps.minY) * SCALE_Y);
        if (wS < 60) wS = 60; if (pxH < 40) pxH = 40; 
        const letra = ps.name.split('-').pop(); const safeName = escapeHtml(`PS-${letra}`); 
        html += `<div class="power-station" style="left: ${pxX}px; top: ${pxY}px; width: ${wS}px; height: ${pxH}px;" title="${escapeHtml(ps.name)}"><span style="font-size: 16px; margin-bottom: 2px;">⚡</span><span>${safeName}</span></div>`;
    }

    for (let id of sbIds) {
        const sb = PARQUE_CAJAS[id];
        const pxX = (((sb.minX + sb.maxX) / 2 - gMinX) * SCALE_X) + MARGIN;
        const pxY = ((gMaxY - sb.maxY) * SCALE_Y) + MARGIN;
        let wS = 30, pxH = 18; 
        let checks = HISTORIAL_CAJAS[id] || {}; let count = 0;
        if(checks['localizacion']) count++; if(checks['soportacion']) count++; if(checks['fusibles']) count++; if(checks['con_strings']) count++; if(checks['con_bus']) count++; if(checks['limpieza']) count++;
        let colorClass = 'sb-red'; if(count === 6) colorClass = 'sb-green'; else if(count > 0) colorClass = 'sb-orange';
        const numCaja = sb.name.split('-').slice(2).join('-').split('_')[0];
        const safeId = escapeJsStr(id);
        html += `<div class="string-box ${colorClass}" style="left: ${pxX}px; top: ${pxY}px; width: ${wS}px; height: ${pxH}px;" title="Ver Checklist" onclick="abrirModalCaja('${safeId}')"><span>${escapeHtml(numCaja)}</span></div>`;
    }

    for (let id of ids) {
        const tr = PARQUE_MASTER[id];
        const pxX = (((tr.minX + tr.maxX) / 2 - gMinX) * SCALE_X) + MARGIN;
        const pxY = ((gMaxY - tr.maxY) * SCALE_Y) + MARGIN;
        let pxH = ((tr.maxY - tr.minY) * SCALE_Y); if (pxH < 40) pxH = 40; 
        const filas = Object.keys(tr.filas).sort((a,b) => a-b);
        const esM = filas.length === 1;
        let wS = !esM ? `width: ${((tr.maxX - tr.minX) * SCALE_X) + 22}px; justify-content: space-between;` : `justify-content: center;`;
        
        html += `<div class="prod-card map-card" style="left: ${pxX}px; top: ${pxY}px; height: ${pxH}px; ${wS}">`;
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
    actualizarContadores();
}

function abrirModalCaja(id) {
    cerrarModalCaja(); 
    const sb = PARQUE_CAJAS[id];
    let checks = HISTORIAL_CAJAS[id] || {};
    const items = [{id: 'localizacion', label: '📍 Localización'}, {id: 'soportacion', label: '⚙️ Soportación'}, {id: 'fusibles', label: '🔌 Fusibles'}, {id: 'con_strings', label: '⚡ Conexionado Strings'}, {id: 'con_bus', label: '🔋 Conexionado BUS'}, {id: 'limpieza', label: '🧹 Limpieza'}];
    let html = `<div id="modal-caja-overlay" class="modal-overlay" onclick="cerrarModalCaja()"><div class="modal-content" onclick="event.stopPropagation()"><h3>Checklist: <span style="color:var(--accent);">${escapeHtml(sb.name)}</span></h3><div class="checklist">`;
    items.forEach(item => { const isChecked = checks[item.id] ? 'checked' : ''; html += `<label class="check-item"><input type="checkbox" ${isChecked} onchange="toggleCheckCaja('${escapeJsStr(id)}', '${item.id}', this.checked)">${item.label}</label>`; });
    html += `</div><button class="btn-close" onclick="cerrarModalCaja()">Guardar y Cerrar</button></div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function cerrarModalCaja() { const m = document.getElementById('modal-caja-overlay'); if(m) { m.remove(); renderMatrix(); } }

async function toggleCheckCaja(id, item, isChecked) {
    if (!HISTORIAL_CAJAS[id]) HISTORIAL_CAJAS[id] = {};
    const hoy = getFechaProduccion(); // APLICACIÓN DEL NUEVO SELECTOR
    
    if (isChecked) {
        HISTORIAL_CAJAS[id][item] = hoy;
    } else {
        delete HISTORIAL_CAJAS[id][item];
    }
    await localforage.setItem('HISTORIAL_CAJAS', HISTORIAL_CAJAS);
}

const STATUS_COLORS = { 'H': '#ffeb3b', 'P': '#2196f3', 'T': '#9c27b0', 'O': '#00bcd4', 'M': '#4caf50', '': '#fff' };
function getStyleByStatus(s) { return STATUS_COLORS[s] || '#fff'; }

function getMigratedData(raw) {
    let dataToSave = {};
    if (raw && typeof raw === 'object') {
        if (raw.fecha && !raw.H) { 
            const lvls = ['H', 'P', 'T', 'O', 'M'];
            let maxLvl = lvls.indexOf(raw.estado);
            for(let i=0; i<=maxLvl; i++) dataToSave[lvls[i]] = raw.fecha;
            dataToSave.estado = raw.estado;
        } else {
            dataToSave = { ...raw }; 
        }
    } else if (raw && typeof raw === 'string') {
        dataToSave.estado = raw;
    }
    return dataToSave;
}

async function paint(id) {
    const cell = document.getElementById(id);
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const hoy = getFechaProduccion(); // APLICACIÓN DEL NUEVO SELECTOR
    
    let raw = HISTORIAL_PROD[id];
    let dataToSave = getMigratedData(raw);
    const currentStatus = dataToSave.estado || '';
    
    const levels = ['H', 'P', 'T', 'O', 'M'];
    const newLvlIdx = newTask === '' ? -1 : levels.indexOf(newTask);
    const curLvlIdx = currentStatus === '' ? -1 : levels.indexOf(currentStatus);

    if (newLvlIdx < curLvlIdx && currentStatus !== '') {
        if (!confirm(`⚠️ ¿Deseas degradar o borrar esta unidad? Se perderán las fechas registradas superiores.`)) return;
        for(let i = newLvlIdx + 1; i < levels.length; i++) delete dataToSave[levels[i]];
        dataToSave.estado = newTask;
    } else if (newTask !== '') {
        for(let i = 0; i <= newLvlIdx; i++) {
            if (!dataToSave[levels[i]]) dataToSave[levels[i]] = hoy;
        }
        dataToSave.estado = newTask;
    }

    cell.innerText = newTask; 
    cell.style.backgroundColor = getStyleByStatus(newTask);
    cell.style.color = newTask === '' ? 'transparent' : '#333';
    
    if (newTask === '') delete HISTORIAL_PROD[id];
    else HISTORIAL_PROD[id] = dataToSave;
    
    await localforage.setItem('HISTORIAL_PROD', HISTORIAL_PROD);
    actualizarContadores();
}

async function paintRow(trackerId, filaNum) {
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const tr = PARQUE_MASTER[trackerId];
    if (!tr || !tr.filas[filaNum]) return;
    
    const f = tr.filas[filaNum];
    const levels = ['H', 'P', 'T', 'O', 'M'];
    const newLvlIdx = newTask === '' ? -1 : levels.indexOf(newTask);
    const hoy = getFechaProduccion(); // APLICACIÓN DEL NUEVO SELECTOR

    let needsConfirm = false;
    for (let h = 1; h <= f.hincas; h++) {
        const hId = `${trackerId}-F${filaNum}-H${h}`;
        const raw = HISTORIAL_PROD[hId];
        const st = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
        const curIdx = st === '' ? -1 : levels.indexOf(st);
        if (newLvlIdx < curIdx && st !== '') {
            needsConfirm = true;
            break;
        }
    }
    if (needsConfirm) {
        if (!confirm('⚠️ ¿Deseas degradar o borrar esta fila? Se perderán fechas de producción superiores.')) return;
    }

    for (let h = 1; h <= f.hincas; h++) {
        const hId = `${trackerId}-F${filaNum}-H${h}`;
        const cell = document.getElementById(hId);
        if (!cell) continue;

        let raw = HISTORIAL_PROD[hId];
        let dataToSave = getMigratedData(raw);

        if (newLvlIdx < (dataToSave.estado ? levels.indexOf(dataToSave.estado) : -1)) {
            for(let i = newLvlIdx + 1; i < levels.length; i++) delete dataToSave[levels[i]];
        } else if (newTask !== '') {
            for(let i = 0; i <= newLvlIdx; i++) {
                if (!dataToSave[levels[i]]) dataToSave[levels[i]] = hoy;
            }
        }
        dataToSave.estado = newTask;

        cell.innerText = newTask; 
        cell.style.backgroundColor = getStyleByStatus(newTask);
        cell.style.color = newTask === '' ? 'transparent' : '#333';
        
        if (newTask === '') delete HISTORIAL_PROD[hId];
        else HISTORIAL_PROD[hId] = dataToSave;
    }
    
    await localforage.setItem('HISTORIAL_PROD', HISTORIAL_PROD);
    actualizarContadores();
}

async function paintTracker(trackerId) {
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const tr = PARQUE_MASTER[trackerId];
    if (!tr) return;
    
    const levels = ['H', 'P', 'T', 'O', 'M'];
    const newLvlIdx = newTask === '' ? -1 : levels.indexOf(newTask);
    const hoy = getFechaProduccion(); // APLICACIÓN DEL NUEVO SELECTOR

    let needsConfirm = false;
    checkDegradation:
    for (let fN in tr.filas) {
        for (let h = 1; h <= tr.filas[fN].hincas; h++) {
            const raw = HISTORIAL_PROD[`${trackerId}-F${fN}-H${h}`];
            const st = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
            const curIdx = st === '' ? -1 : levels.indexOf(st);
            if (newLvlIdx < curIdx && st !== '') {
                needsConfirm = true;
                break checkDegradation;
            }
        }
    }
    if (needsConfirm) {
        if (!confirm('⚠️ ¿Deseas degradar o borrar este tracker? Se perderán fechas superiores.')) return;
    }

    for (let fN in tr.filas) {
        for (let h = 1; h <= tr.filas[fN].hincas; h++) {
            const hId = `${trackerId}-F${fN}-H${h}`;
            const cell = document.getElementById(hId);
            if (!cell) continue;

            let raw = HISTORIAL_PROD[hId];
            let dataToSave = getMigratedData(raw);

            if (newLvlIdx < (dataToSave.estado ? levels.indexOf(dataToSave.estado) : -1)) {
                for(let i = newLvlIdx + 1; i < levels.length; i++) delete dataToSave[levels[i]];
            } else if (newTask !== '') {
                for(let i = 0; i <= newLvlIdx; i++) {
                    if (!dataToSave[levels[i]]) dataToSave[levels[i]] = hoy;
                }
            }
            dataToSave.estado = newTask;

            cell.innerText = newTask; 
            cell.style.backgroundColor = getStyleByStatus(newTask);
            cell.style.color = newTask === '' ? 'transparent' : '#333';
            
            if (newTask === '') delete HISTORIAL_PROD[hId];
            else HISTORIAL_PROD[hId] = dataToSave;
        }
    }
    
    await localforage.setItem('HISTORIAL_PROD', HISTORIAL_PROD);
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
        let count = 0;
        if(checks['localizacion']) count++; if(checks['soportacion']) count++; if(checks['fusibles']) count++; if(checks['con_strings']) count++; if(checks['con_bus']) count++; if(checks['limpieza']) count++;
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
    const s = await localforage.getItem('PARQUE_MASTER_DATA');
    const ps = await localforage.getItem('PARQUE_ESTACIONES_DATA');
    const sb = await localforage.getItem('PARQUE_CAJAS_DATA');
    const hcajas = await localforage.getItem('HISTORIAL_CAJAS');
    const h = await localforage.getItem('HISTORIAL_PROD');

    if(s) PARQUE_MASTER = s; 
    if(ps) PARQUE_ESTACIONES = ps; 
    if(sb) PARQUE_CAJAS = sb; 
    if(hcajas) HISTORIAL_CAJAS = hcajas;
    if(h) HISTORIAL_PROD = h; 

    if(s) actualizarSelectores(); 
};