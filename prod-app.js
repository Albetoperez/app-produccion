let currentTask = 'H';
let PARQUE_MASTER = {}; 
let HISTORIAL_PROD = {};

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
        const tId = row['CODIGO'], block = row['BLOQUE'] || 'S/B', rawX = row['X'], rawY = row['Y'], filaNum = row['FILA'], hincaIndex = row['HINCA'];
        if (!tId || rawX === undefined || rawY === undefined || !filaNum || !hincaIndex) return;
        const tIdStr = String(tId).trim().toUpperCase();
        if (tIdStr === '') return;

        const arcoId = detectarArco(tIdStr);

        if (!arcoEnEsteArchivo && arcoId !== 'S/A') arcoEnEsteArchivo = arcoId;
        const x = parseCoord(rawX), y = parseCoord(rawY);
        if (x === 0 && y === 0) return;

        if(!PARQUE_MASTER[tIdStr]) {
            PARQUE_MASTER[tIdStr] = { name: tIdStr, arco: arcoId, block: String(block).trim(), minX: x, maxX: x, minY: y, maxY: y, filas: {} };
        } else {
            PARQUE_MASTER[tIdStr].arco = arcoId; PARQUE_MASTER[tIdStr].minX = Math.min(PARQUE_MASTER[tIdStr].minX, x); PARQUE_MASTER[tIdStr].maxX = Math.max(PARQUE_MASTER[tIdStr].maxX, x); PARQUE_MASTER[tIdStr].minY = Math.min(PARQUE_MASTER[tIdStr].minY, y); PARQUE_MASTER[tIdStr].maxY = Math.max(PARQUE_MASTER[tIdStr].maxY, y);
        }
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
    if(ids.length === 0) { container.innerHTML = '<div class="empty-state">No hay trackers para este bloque.</div>'; return; }
    
    let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity;
    ids.forEach(id => {
        const tr = PARQUE_MASTER[id];
        if(tr.minX < gMinX) gMinX = tr.minX; if(tr.maxX > gMaxX) gMaxX = tr.maxX;
        if(tr.minY < gMinY) gMinY = tr.minY; if(tr.maxY > gMaxY) gMaxY = tr.maxY;
    });
    
    const rX = (gMaxX - gMinX) || 1; const rY = (gMaxY - gMinY) || 1;
    const SCALE_X = 8, SCALE_Y = 6, MARGIN = 300;
    let html = `<div class="map-canvas" style="min-width: ${(rX * SCALE_X) + (MARGIN * 2)}px; min-height: ${(rY * SCALE_Y) + (MARGIN * 2)}px;">`;
    
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

const STATUS_COLORS = { 'H': '#ffeb3b', 'P': '#2196f3', 'T': '#9c27b0', 'O': '#00bcd4', 'M': '#4caf50', '': '#fff' };

function getStyleByStatus(s) {
    return STATUS_COLORS[s] || '#fff';
}

async function paint(id) {
    const cell = document.getElementById(id);
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const levels = {'': 0, 'H': 1, 'P': 2, 'T': 3, 'O': 4, 'M': 5};
    
    const raw = HISTORIAL_PROD[id]; // NUEVO: Leemos de memoria
    const currentStatus = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
    const currentDate = (raw && typeof raw === 'object') ? raw.fecha : null;

    if (levels[newTask] < levels[currentStatus] && currentStatus !== '') {
        if (!confirm(`⚠️ ¿Deseas degradar o borrar esta unidad? Se perderá la fecha de producción original.`)) return;
    }

    const hoy = new Date().toISOString().split('T')[0]; 
    const dataToSave = {
        estado: newTask,
        fecha: (newTask === '') ? null : (newTask === currentStatus ? (currentDate || hoy) : hoy)
    };

    cell.innerText = newTask; 
    cell.style.backgroundColor = getStyleByStatus(newTask);
    cell.style.color = newTask === '' ? 'transparent' : '#333';
    
    if (newTask === '') {
        delete HISTORIAL_PROD[id];
    } else {
        HISTORIAL_PROD[id] = dataToSave;
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
                const rawData = HISTORIAL_PROD[`${id}-F${fN}-H${h}`]; // NUEVO: Lectura instantánea
                const st = (rawData && typeof rawData === 'object') ? (rawData.estado || '') : (rawData || '');
                const l = lv[st] || 0;
                if (l >= 1) cH++; if (l >= 2) cP++;
                if (l < minLvl) minLvl = l;
            }
            if (minLvl >= 3) cT++; if (minLvl >= 4) cO++; if (minLvl >= 5) cM++;
        }
    }
    document.getElementById('sum-H').innerText = `${cH} / ${tH} pdt`;
    document.getElementById('sum-P').innerText = `${cP} / ${tH} pdt`;
    document.getElementById('sum-T').innerText = `${cT} / ${tF} pdt`;
    document.getElementById('sum-O').innerText = `${cO} / ${tF} pdt`;
    document.getElementById('sum-M').innerText = `${cM} / ${tF} pdt`;
    document.getElementById('summary-block-name').innerText = block;
}

// --- FUNCIONES DE PINTADO EN BLOQUE ---

async function paintRow(trackerId, filaNum) {
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const tr = PARQUE_MASTER[trackerId];
    if (!tr || !tr.filas[filaNum]) return;
    
    if (newTask === '') {
        if (!confirm('⚠️ ¿Deseas borrar toda la fila?')) return;
    }

    const f = tr.filas[filaNum];
    const lv = {'': 0, 'H': 1, 'P': 2, 'T': 3, 'O': 4, 'M': 5};
    const newLevel = lv[newTask];

    for (let h = 1; h <= f.hincas; h++) {
        const hId = `${trackerId}-F${filaNum}-H${h}`;
        const raw = HISTORIAL_PROD[hId];
        const currentStatus = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
        const currentLevel = lv[currentStatus] || 0;
        if (newLevel < currentLevel && currentStatus !== '') {
            if (!confirm('⚠️ ¿Deseas degradar esta fila? Se perderán fechas de producción.')) return;
            break;
        }
    }

    const hoy = new Date().toISOString().split('T')[0]; 
    
    for (let h = 1; h <= f.hincas; h++) {
        const hId = `${trackerId}-F${filaNum}-H${h}`;
        const cell = document.getElementById(hId);
        if (!cell) continue;

        const raw = HISTORIAL_PROD[hId];
        const currentStatus = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
        const currentDate = (raw && typeof raw === 'object') ? raw.fecha : null;

        cell.innerText = newTask; 
        cell.style.backgroundColor = getStyleByStatus(newTask);
        cell.style.color = newTask === '' ? 'transparent' : '#333';
        
        if (newTask === '') {
            delete HISTORIAL_PROD[hId];
        } else {
            HISTORIAL_PROD[hId] = { estado: newTask, fecha: (newTask === currentStatus ? (currentDate || hoy) : hoy) };
        }
    }
    
    await localforage.setItem('HISTORIAL_PROD', HISTORIAL_PROD);
    actualizarContadores();
}

async function paintTracker(trackerId) {
    const newTask = currentTask === 'NA' ? '' : currentTask;
    const tr = PARQUE_MASTER[trackerId];
    if (!tr) return;
    
    const lv = {'': 0, 'H': 1, 'P': 2, 'T': 3, 'O': 4, 'M': 5};
    const newLevel = lv[newTask];

    checkDegradation:
    for (let fN in tr.filas) {
        const f = tr.filas[fN];
        for (let h = 1; h <= f.hincas; h++) {
            const hId = `${trackerId}-F${fN}-H${h}`;
            const raw = HISTORIAL_PROD[hId];
            const currentStatus = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
            const currentLevel = lv[currentStatus] || 0;
            if (newLevel < currentLevel && currentStatus !== '') {
                if (!confirm('⚠️ ¿Deseas degradar este tracker? Se perderán fechas de producción.')) return;
                break checkDegradation;
            }
        }
    }

    const hoy = new Date().toISOString().split('T')[0]; 
    
    for (let fN in tr.filas) {
        const f = tr.filas[fN];
        for (let h = 1; h <= f.hincas; h++) {
            const hId = `${trackerId}-F${fN}-H${h}`;
            const cell = document.getElementById(hId);
            if (!cell) continue;

            const raw = HISTORIAL_PROD[hId];
            const currentStatus = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
            const currentDate = (raw && typeof raw === 'object') ? raw.fecha : null;

            cell.innerText = newTask; 
            cell.style.backgroundColor = getStyleByStatus(newTask);
            cell.style.color = newTask === '' ? 'transparent' : '#333';
            
            if (newTask === '') {
                delete HISTORIAL_PROD[hId];
            } else {
                HISTORIAL_PROD[hId] = { estado: newTask, fecha: (newTask === currentStatus ? (currentDate || hoy) : hoy) };
            }
        }
    }
    
    await localforage.setItem('HISTORIAL_PROD', HISTORIAL_PROD);
    actualizarContadores();
}
window.onload = async () => {
    const s = await localforage.getItem('PARQUE_MASTER_DATA');
    if(s) { PARQUE_MASTER = s; actualizarSelectores(); }
    
    const h = await localforage.getItem('HISTORIAL_PROD');
    if(h) { HISTORIAL_PROD = h; }
};