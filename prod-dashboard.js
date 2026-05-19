localforage.config({ name: 'SIGMA_PROD_V1', storeName: 'produccion_hincas' });

const levels = {'': 0, 'H': 1, 'P': 2, 'T': 3, 'O': 4, 'M': 5};
const colors = { hinca: '#ffeb3b', posthead: '#2196f3', torque: '#9c27b0', omega: '#00bcd4', modulo: '#4caf50' };

let charts = {};

function safeDestroy(chart) {
    if (chart && typeof chart.destroy === 'function') {
        try { chart.destroy(); } catch (e) { console.warn('Chart destroy error:', e); }
    }
    return null;
}
let PARQUE_MASTER = {};
let HISTORIAL_PROD = {};

let DB_CACHE = { totales: { h:0, p:0, t:0, o:0, m:0 }, fechas: {} };

window.chartDataAccStore = null;
window.datesInRangeStore = null;
window.statsArcoStore = null; // Guardamos los datos del arco seleccionado

function switchTab(tabId, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('view-' + tabId).classList.add('active');
    
    // El filtro de fechas ahora aplica a ambas pestañas
    if (tabId === 'detalle') refreshDetalle();
    else if (tabId === 'global') applyFilters();
}

async function initDashboard() {
    const saved = await localforage.getItem('PARQUE_MASTER_DATA');
    if (!saved) return;
    PARQUE_MASTER = saved;

    // NUEVO: Cargamos el historial maestro en 1 milisegundo
    HISTORIAL_PROD = await localforage.getItem('HISTORIAL_PROD') || {};

    let arcos = [...new Set(Object.values(PARQUE_MASTER).map(tr => tr.arco))].sort();
    const select = document.getElementById('select-arco-dash');
    if (select) select.innerHTML = arcos.map(a => `<option value="${a}">${a}</option>`).join('');

    const hoyDate = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(hoyDate.getDate() - 7);
    
    document.getElementById('date-to').value = hoyDate.toISOString().split('T')[0];
    document.getElementById('date-from').value = weekAgo.toISOString().split('T')[0];

    document.getElementById('select-arco-dash').addEventListener('change', refreshDetalle);

    await construirCache();
    applyFilters();
}

function resetCache() {
    DB_CACHE = { totales: { h:0, p:0, t:0, o:0, m:0 }, fechas: {} };
}

async function construirCache() {
    resetCache();
    for (let id in PARQUE_MASTER) {
        let tr = PARQUE_MASTER[id];
        for (let fN in tr.filas) {
            let f = tr.filas[fN];
            DB_CACHE.totales.h += f.hincas; DB_CACHE.totales.p += f.hincas;
            DB_CACHE.totales.t++; DB_CACHE.totales.o++; DB_CACHE.totales.m++;
            let minLvlFila = 5, fechaFila = "";

            for (let h = 1; h <= f.hincas; h++) {
                // LECTURA EN MEMORIA = ⚡ Velocidad luz
                const raw = HISTORIAL_PROD[`${id}-F${fN}-H${h}`]; 
                const st = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
                const dt = (raw && typeof raw === 'object') ? raw.fecha : null;
                const l = levels[st] || 0;

                if (dt) {
                    if (!DB_CACHE.fechas[dt]) DB_CACHE.fechas[dt] = { h:0, p:0, t:0, o:0, m:0 };
                    if (l >= 1) DB_CACHE.fechas[dt].h++;
                    if (l >= 2) DB_CACHE.fechas[dt].p++;
                    if (dt > fechaFila) fechaFila = dt;
                }
                if (l < minLvlFila) minLvlFila = l;
            }
            if (fechaFila) {
                if (!DB_CACHE.fechas[fechaFila]) DB_CACHE.fechas[fechaFila] = { h:0, p:0, t:0, o:0, m:0 };
                if (minLvlFila >= 3) DB_CACHE.fechas[fechaFila].t++;
                if (minLvlFila >= 4) DB_CACHE.fechas[fechaFila].o++;
                if (minLvlFila >= 5) DB_CACHE.fechas[fechaFila].m++;
            }
        }
    }
}

const updateKPI = (id, total, hecho) => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = `<span style="font-size:14px; color:#666">Total: ${total}</span><br>${hecho} / <span style="color:#e74c3c">${total - hecho} pdt</span>`;
};

// --- LOGICA PESTAÑA 1: GLOBAL ---
function applyFilters() {
    const startStr = document.getElementById('date-from').value;
    const endStr = document.getElementById('date-to').value;
    if(!startStr || !endStr) return;

    // Si estamos en la pestaña Arco, recalculamos el arco en lugar del global
    if(document.getElementById('view-detalle').classList.contains('active')) {
        refreshDetalle();
        return;
    }

    let periodData = { h:0, p:0, t:0, o:0, m:0 }, accData = { h:0, p:0, t:0, o:0, m:0 }; 
    let startDates = { h: '-', p: '-', t: '-', o: '-', m: '-' }; 
    let datesInRange = [];
    let currDate = new Date(startStr + "T00:00:00");
    let endDate = new Date(endStr + "T00:00:00");
    
    while(currDate <= endDate) {
        let y = currDate.getFullYear(), m = String(currDate.getMonth() + 1).padStart(2, '0'), d = String(currDate.getDate()).padStart(2, '0');
        datesInRange.push(`${y}-${m}-${d}`);
        currDate.setDate(currDate.getDate() + 1);
    }

    let chartDataDaily = { h:[], p:[], t:[], o:[], m:[] }, chartDataAcc = { h:[], p:[], t:[], o:[], m:[] };
    let runH = 0, runP = 0, runT = 0, runO = 0, runM = 0; 

    const allDates = Object.keys(DB_CACHE.fechas).sort();
    allDates.forEach(d => {
        let counts = DB_CACHE.fechas[d];
        if (counts.h > 0 && startDates.h === '-') startDates.h = d;
        if (counts.p > 0 && startDates.p === '-') startDates.p = d;
        if (counts.t > 0 && startDates.t === '-') startDates.t = d;
        if (counts.o > 0 && startDates.o === '-') startDates.o = d;
        if (counts.m > 0 && startDates.m === '-') startDates.m = d;

        if (d <= endStr) { accData.h += counts.h; accData.p += counts.p; accData.t += counts.t; accData.o += counts.o; accData.m += counts.m; }
        if (d >= startStr && d <= endStr) { periodData.h += counts.h; periodData.p += counts.p; periodData.t += counts.t; periodData.o += counts.o; periodData.m += counts.m; }
        if (d < startStr) { runH += counts.h; runP += counts.p; runT += counts.t; runO += counts.o; runM += counts.m; } 
    });

    datesInRange.forEach(d => {
        let counts = DB_CACHE.fechas[d] || { h:0, p:0, t:0, o:0, m:0 };
        chartDataDaily.h.push(counts.h); chartDataDaily.p.push(counts.p); chartDataDaily.t.push(counts.t); chartDataDaily.o.push(counts.o); chartDataDaily.m.push(counts.m);
        runH += counts.h; runP += counts.p; runT += counts.t; runO += counts.o; runM += counts.m;
        chartDataAcc.h.push(runH); chartDataAcc.p.push(runP); chartDataAcc.t.push(runT); chartDataAcc.o.push(runO); chartDataAcc.m.push(runM);
    });

    window.chartDataAccStore = chartDataAcc; window.datesInRangeStore = datesInRange;

    updateKPI('kpi-h-val', DB_CACHE.totales.h, accData.h);
    updateKPI('kpi-p-val', DB_CACHE.totales.p, accData.p);
    updateKPI('kpi-t-val', DB_CACHE.totales.t, accData.t);
    updateKPI('kpi-o-val', DB_CACHE.totales.o, accData.o);
    updateKPI('kpi-m-val', DB_CACHE.totales.m, accData.m);

    document.getElementById('view-global').innerHTML = `
        <div class="dashboard-grid">
            <div class="card">
                <h2>Producción Diaria (Del ${startStr} al ${endStr})</h2>
                <div style="height: 300px;"><canvas id="chartDaily"></canvas></div>
            </div>
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                    <h2 style="margin:0; border:none; padding:0;">Curva S (Acumulado)</h2>
                    <select id="select-fase-scurve" style="padding: 5px; border-radius: 4px; border: 1px solid #ccc; font-size: 13px; font-weight: bold; color: #005596; cursor: pointer;">
                        <option value="h">Hincado</option><option value="p">Piruletas</option><option value="t">Torque Tubes</option><option value="o">Omegas</option><option value="m">Módulos</option>
                    </select>
                </div>
                <div style="height: 260px;"><canvas id="chartSCurve"></canvas></div>
            </div>
        </div>
        <div class="card full-width" style="margin-top: 20px; padding: 15px;">
            <h2 style="margin-bottom: 15px;">Resumen Numérico de Planta</h2>
            <div style="display: flex; flex-wrap: wrap; gap: 30px; align-items: stretch;">
                <div style="flex: 1 1 55%; overflow-x: auto;">
                    <table id="tabla-export" style="width:100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background:#f8f9fa; border-bottom:2px solid #ddd;">
                                <th style="text-align:left; padding:8px 10px; color:#555;">Fase</th>
                                <th style="text-align:center; padding:8px 10px; color:#555;">Periodo (${startStr} al ${endStr})</th>
                                <th style="text-align:center; padding:8px 10px; color:#555;">Acumulado Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td style="text-align:left; padding:6px 10px; border-bottom:1px solid #eee; color:var(--blue);"><b>Hincado</b></td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${periodData.h}</b> uds</td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${accData.h}</b> uds <span style="color:#888; font-size:11px; margin-left:10px;">(Iniciado: ${startDates.h})</span></td></tr>
                            <tr><td style="text-align:left; padding:6px 10px; border-bottom:1px solid #eee; color:var(--blue);"><b>Piruletas</b></td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${periodData.p}</b> uds</td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${accData.p}</b> uds <span style="color:#888; font-size:11px; margin-left:10px;">(Iniciado: ${startDates.p})</span></td></tr>
                            <tr><td style="text-align:left; padding:6px 10px; border-bottom:1px solid #eee; color:var(--blue);"><b>Torque Tubes</b></td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${periodData.t}</b> filas</td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${accData.t}</b> filas <span style="color:#888; font-size:11px; margin-left:10px;">(Iniciado: ${startDates.t})</span></td></tr>
                            <tr><td style="text-align:left; padding:6px 10px; border-bottom:1px solid #eee; color:var(--blue);"><b>Omegas</b></td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${periodData.o}</b> filas</td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${accData.o}</b> filas <span style="color:#888; font-size:11px; margin-left:10px;">(Iniciado: ${startDates.o})</span></td></tr>
                            <tr><td style="text-align:left; padding:6px 10px; border-bottom:1px solid #eee; color:var(--blue);"><b>Módulos</b></td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${periodData.m}</b> filas</td><td style="text-align:center; padding:6px 10px; border-bottom:1px solid #eee;"><b>${accData.m}</b> filas <span style="color:#888; font-size:11px; margin-left:10px;">(Iniciado: ${startDates.m})</span></td></tr>
                        </tbody>
                    </table>
                </div>
                <div style="flex: 1 1 40%; min-width: 300px; display: flex; flex-direction: column;">
                    <h3 style="margin-top:0; margin-bottom:10px; font-size: 14px; color: #555; text-align:center;">Avance Relativo Acumulado (%)</h3>
                    <div style="flex-grow: 1; position: relative; min-height: 200px;"><canvas id="chartGlobalRelative"></canvas></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('select-fase-scurve').addEventListener('change', updateSCurve);

    charts.daily = safeDestroy(charts.daily);
    charts.daily = new Chart(document.getElementById('chartDaily'), {
        type: 'bar',
        data: {
            labels: datesInRange,
            datasets: [
                { label: 'Hincado', data: chartDataDaily.h, backgroundColor: colors.hinca },
                { label: 'Piruletas', data: chartDataDaily.p, backgroundColor: colors.posthead },
                { label: 'Torques', data: chartDataDaily.t, backgroundColor: colors.torque },
                { label: 'Omegas', data: chartDataDaily.o, backgroundColor: colors.omega },
                { label: 'Módulos', data: chartDataDaily.m, backgroundColor: colors.modulo }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    charts.globalRel = safeDestroy(charts.globalRel);
    charts.globalRel = new Chart(document.getElementById('chartGlobalRelative'), {
        type: 'bar',
        data: {
            labels: ['Hinca', 'Piruletas', 'Torque', 'Omegas', 'Módulos'],
            datasets: [{
                data: [ calcPerc(accData.h, DB_CACHE.totales.h), calcPerc(accData.p, DB_CACHE.totales.p), calcPerc(accData.t, DB_CACHE.totales.t), calcPerc(accData.o, DB_CACHE.totales.o), calcPerc(accData.m, DB_CACHE.totales.m) ],
                backgroundColor: [colors.hinca, colors.posthead, colors.torque, colors.omega, colors.modulo]
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } }
    });

    updateSCurve();
}

function updateSCurve() {
    const fase = document.getElementById('select-fase-scurve').value;
    const dataMap = {
        'h': { label: 'Acumulado Hincas', data: window.chartDataAccStore.h, color: 'rgba(255, 235, 59, 0.4)', border: '#fbc02d' },
        'p': { label: 'Acumulado Piruletas', data: window.chartDataAccStore.p, color: 'rgba(33, 150, 243, 0.4)', border: '#1976d2' },
        't': { label: 'Acumulado Torques', data: window.chartDataAccStore.t, color: 'rgba(156, 39, 176, 0.4)', border: '#7b1fa2' },
        'o': { label: 'Acumulado Omegas', data: window.chartDataAccStore.o, color: 'rgba(0, 188, 212, 0.4)', border: '#0097a7' },
        'm': { label: 'Acumulado Módulos', data: window.chartDataAccStore.m, color: 'rgba(76, 175, 80, 0.4)', border: '#388e3c' }
    };
    
    charts.scurve = safeDestroy(charts.scurve);
    charts.scurve = new Chart(document.getElementById('chartSCurve'), {
        type: 'line',
        data: {
            labels: window.datesInRangeStore,
            datasets: [{ label: dataMap[fase].label, data: dataMap[fase].data, borderColor: dataMap[fase].border, backgroundColor: dataMap[fase].color, fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: dataMap[fase].border }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top' } } }
    });
}

function exportToExcel() {
    let table = document.getElementById('tabla-export');
    if (!table) { alert('No hay datos para exportar.'); return; }
    let wb = XLSX.utils.table_to_book(table, {sheet: "Reporte_Produccion"});
    XLSX.writeFile(wb, "Reporte_SIGMA_Diario.xlsx");
}

// --- LOGICA PESTAÑA 2: ANALISIS POR ARCO ---
async function refreshDetalle() {
    const arco = document.getElementById('select-arco-dash').value;
    if(!arco) return;
    const startStr = document.getElementById('date-from').value;
    const endStr = document.getElementById('date-to').value;

    const stats = await calcularStatsArco(arco);
    window.statsArcoStore = stats; // Guardar en memoria para el desplegable de bloques

    updateKPI('kpi-h-val', stats.global.totalH, stats.global.h);
    updateKPI('kpi-p-val', stats.global.totalH, stats.global.p);
    updateKPI('kpi-t-val', stats.global.totalF, stats.global.t);
    updateKPI('kpi-o-val', stats.global.totalF, stats.global.o);
    updateKPI('kpi-m-val', stats.global.totalF, stats.global.m);

    // Preparar fechas para el gráfico diario del Arco
    let datesInRange = [];
    let currDate = new Date(startStr + "T00:00:00");
    let endDate = new Date(endStr + "T00:00:00");
    while(currDate <= endDate) {
        let y = currDate.getFullYear(), m = String(currDate.getMonth() + 1).padStart(2, '0'), d = String(currDate.getDate()).padStart(2, '0');
        datesInRange.push(`${y}-${m}-${d}`);
        currDate.setDate(currDate.getDate() + 1);
    }

    let chartDataDailyArco = { h:[], p:[], t:[], o:[], m:[] };
    datesInRange.forEach(d => {
        let counts = stats.fechas[d] || { h:0, p:0, t:0, o:0, m:0 };
        chartDataDailyArco.h.push(counts.h); chartDataDailyArco.p.push(counts.p);
        chartDataDailyArco.t.push(counts.t); chartDataDailyArco.o.push(counts.o);
        chartDataDailyArco.m.push(counts.m);
    });

    const bLabels = Object.keys(stats.bloques).sort();
    let tableHtml = `<table><thead><tr><th>Bloque</th><th>Hinca</th><th>Piruletas</th><th>Torque</th><th>Omegas</th><th>Módulos</th><th>Estado</th></tr></thead><tbody>`;
    bLabels.forEach(b => {
        const d = stats.bloques[b];
        const hPerc = calcPerc(d.h, d.totalH), pPerc = calcPerc(d.p, d.totalH);
        const tPerc = calcPerc(d.t, d.totalF), oPerc = calcPerc(d.o, d.totalF), mPerc = calcPerc(d.m, d.totalF);
        let statusTag = hPerc > 99 ? '✅ Finalizado' : (hPerc > 0 ? '🚧 En proceso' : '⏳ Pendiente');
        
        tableHtml += `<tr><td><strong>${b}</strong></td>
            <td>${getBadge(hPerc, colors.hinca)}</td>
            <td>${getBadge(pPerc, colors.posthead)}</td>
            <td>${getBadge(tPerc, colors.torque)}</td>
            <td>${getBadge(oPerc, colors.omega)}</td>
            <td>${getBadge(mPerc, colors.modulo)}</td>
            <td><small>${statusTag}</small></td></tr>`;
    });
    tableHtml += '</tbody></table>';

    // Inyectar el diseño en la pestaña de Arco
    document.getElementById('detalle-content').innerHTML = `
        <div class="dashboard-grid">
            <div class="card">
                <h2>Producción Diaria (${arco})</h2>
                <div style="height: 300px;"><canvas id="chartDailyArco"></canvas></div>
            </div>
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                    <h2 style="margin:0; border:none; padding:0;">Producción por Bloque (%)</h2>
                    <select id="select-fase-bloques" style="padding: 5px; border-radius: 4px; border: 1px solid #ccc; font-size: 13px; font-weight: bold; color: #005596; cursor: pointer;">
                        <option value="h">Hincado</option><option value="p">Piruletas</option><option value="t">Torque Tubes</option><option value="o">Omegas</option><option value="m">Módulos</option>
                    </select>
                </div>
                <div style="height: 260px;"><canvas id="chartBloques"></canvas></div>
            </div>
        </div>
        <div class="card full-width" style="margin-top: 20px; padding: 15px;">
            <div style="display: flex; flex-wrap: wrap; gap: 30px; align-items: stretch;">
                <div style="flex: 1 1 55%; overflow-x: auto;">
                    <h2 style="margin-bottom: 15px;">Estado Detallado de Bloques (${arco})</h2>
                    ${tableHtml}
                </div>
                <div style="flex: 1 1 40%; min-width: 300px; display: flex; flex-direction: column;">
                    <h3 style="margin-top:0; margin-bottom:10px; font-size: 14px; color: #555; text-align:center;">Avance Relativo (%)</h3>
                    <div style="flex-grow: 1; position: relative; min-height: 200px;"><canvas id="chartGlobalArco"></canvas></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('select-fase-bloques').addEventListener('change', updateBlocksChart);

    // Gráfico de Barras Diarias del Arco
    charts.dailyArco = safeDestroy(charts.dailyArco);
    charts.dailyArco = new Chart(document.getElementById('chartDailyArco'), {
        type: 'bar',
        data: {
            labels: datesInRange,
            datasets: [
                { label: 'Hincado', data: chartDataDailyArco.h, backgroundColor: colors.hinca },
                { label: 'Piruletas', data: chartDataDailyArco.p, backgroundColor: colors.posthead },
                { label: 'Torques', data: chartDataDailyArco.t, backgroundColor: colors.torque },
                { label: 'Omegas', data: chartDataDailyArco.o, backgroundColor: colors.omega },
                { label: 'Módulos', data: chartDataDailyArco.m, backgroundColor: colors.modulo }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // Gráfico de Avance Relativo del Arco
    charts.arcGlobal = safeDestroy(charts.arcGlobal);
    charts.arcGlobal = new Chart(document.getElementById('chartGlobalArco'), {
        type: 'bar',
        data: {
            labels: ['Hinca', 'Piruletas', 'Torque', 'Omegas', 'Módulos'],
            datasets: [{
                data: [ calcPerc(stats.global.h, stats.global.totalH), calcPerc(stats.global.p, stats.global.totalH), calcPerc(stats.global.t, stats.global.totalF), calcPerc(stats.global.o, stats.global.totalF), calcPerc(stats.global.m, stats.global.totalF) ],
                backgroundColor: [colors.hinca, colors.posthead, colors.torque, colors.omega, colors.modulo]
            }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } }
    });

    updateBlocksChart();
}

function updateBlocksChart() {
    const fase = document.getElementById('select-fase-bloques').value;
    const stats = window.statsArcoStore;
    const bLabels = Object.keys(stats.bloques).sort();

    const config = {
        'h': { label: 'Hincado %', key: 'h', total: 'totalH', color: colors.hinca },
        'p': { label: 'Piruletas %', key: 'p', total: 'totalH', color: colors.posthead },
        't': { label: 'Torques %', key: 't', total: 'totalF', color: colors.torque },
        'o': { label: 'Omegas %', key: 'o', total: 'totalF', color: colors.omega },
        'm': { label: 'Módulos %', key: 'm', total: 'totalF', color: colors.modulo }
    }[fase];

    const dataArr = bLabels.map(l => calcPerc(stats.bloques[l][config.key], stats.bloques[l][config.total]));

    charts.arcBlocks = safeDestroy(charts.arcBlocks);
    charts.arcBlocks = new Chart(document.getElementById('chartBloques'), {
        type: 'bar', // Cambiado a barras para comparar bloques de forma más clara
        data: {
            labels: bLabels,
            datasets: [{ label: config.label, data: dataArr, backgroundColor: config.color }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }
    });
}

async function calcularStatsArco(arco) {
    const bloques = {};
    const global = { h:0, p:0, t:0, o:0, m:0, totalH:0, totalF:0 };
    const fechas = {}; 
    const ids = Object.keys(PARQUE_MASTER).filter(id => PARQUE_MASTER[id].arco === arco);

    for (const id of ids) {
        const tr = PARQUE_MASTER[id];
        const b = tr.block || 'S/B';
        if (!bloques[b]) bloques[b] = { h:0, p:0, t:0, o:0, m:0, totalH:0, totalF:0 };

        for (const fN in tr.filas) {
            const f = tr.filas[fN];
            bloques[b].totalF++; bloques[b].totalH += f.hincas;
            global.totalF++; global.totalH += f.hincas;
            let mL = 5, fMax = "";

            for (let h = 1; h <= f.hincas; h++) {
                // LECTURA EN MEMORIA = ⚡ Velocidad luz
                const raw = HISTORIAL_PROD[`${id}-F${fN}-H${h}`]; 
                const s = (raw && typeof raw === 'object') ? (raw.estado || '') : (raw || '');
                const dt = (raw && typeof raw === 'object') ? raw.fecha : null;
                const l = levels[s] || 0;

                if (l >= 1) { bloques[b].h++; global.h++; }
                if (l >= 2) { bloques[b].p++; global.p++; }
                if (l < mL) mL = l;

                if(dt) {
                    if(!fechas[dt]) fechas[dt] = {h:0, p:0, t:0, o:0, m:0};
                    if (l >= 1) fechas[dt].h++;
                    if (l >= 2) fechas[dt].p++;
                    if (dt > fMax) fMax = dt;
                }
            }
            if (mL >= 3) { bloques[b].t++; global.t++; }
            if (mL >= 4) { bloques[b].o++; global.o++; }
            if (mL >= 5) { bloques[b].m++; global.m++; }

            if (fMax) {
                 if(!fechas[fMax]) fechas[fMax] = {h:0, p:0, t:0, o:0, m:0};
                 if (mL >= 3) fechas[fMax].t++;
                 if (mL >= 4) fechas[fMax].o++;
                 if (mL >= 5) fechas[fMax].m++;
            }
        }
    }
    return { bloques, global, fechas };
}

function calcPerc(p, t) { return t > 0 ? (p / t * 100).toFixed(1) : "0.0"; }
function getBadge(v, c) { 
    const t = (v > 50 && c === '#ffeb3b') ? '#333' : (v > 50 ? 'white' : '#333');
    return `<span class="perc-badge" style="background:${c}; color:${t}">${v}%</span>`; 
}

initDashboard();