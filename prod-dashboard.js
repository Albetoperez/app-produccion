let PARQUE_MASTER = {};
let HISTORIAL_PROD = {};
let PARQUE_CAJAS = {};
let HISTORIAL_CAJAS = {};
let PARQUE_ZANJAS = {};
let PARQUE_PUNTUALES = {};
let HISTORIAL_ZANJAS = {};
let HISTORIAL_PUNTUALES = {};

const LEVELS = ['H', 'P', 'T', 'O', 'M'];

let chartS = null;
let chartDiario = null;
let chartSCB = null;
let chartDiarioSCB = null;

localforage.config({ name: 'SIGMA_PROD_V1', storeName: 'produccion_hincas' });

window.onload = async () => {
    try {
        const s = await localforage.getItem('PARQUE_MASTER_DATA');
        const h = await localforage.getItem('HISTORIAL_PROD');
        const c = await localforage.getItem('PARQUE_CAJAS_DATA');
        const hc = await localforage.getItem('HISTORIAL_CAJAS');
        const z = await localforage.getItem('PARQUE_ZANJAS_DATA');
        const pt = await localforage.getItem('PARQUE_PUNTUALES_DATA');
        const hz = await localforage.getItem('HISTORIAL_ZANJAS');
        const hpt = await localforage.getItem('HISTORIAL_PUNTUALES');

        if (s) PARQUE_MASTER = s;
        if (c) PARQUE_CAJAS = c;
        if (hc) HISTORIAL_CAJAS = hc;
        if (z) PARQUE_ZANJAS = z;
        if (pt) PARQUE_PUNTUALES = pt;
        if (hz) HISTORIAL_ZANJAS = hz;
        if (hpt) HISTORIAL_PUNTUALES = hpt;

        if (h) {
            for (let key in h) {
                h[key] = getMigratedData(h[key]);
            }
            HISTORIAL_PROD = h;
        }

        if (s || c || z || pt) {
            inicializarSelectorArco();
            procesarDashboard();
        } else {
            if(document.getElementById('blocks-accordion-container')) document.getElementById('blocks-accordion-container').innerHTML = '<div class="empty-state">No hay datos cargados.</div>';
        }
    } catch (error) {
        console.error("Error al cargar datos:", error);
    }
};

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

function switchTabDash(tab) {
    ['mecanica', 'electrica', 'zanjas', 'puntuales'].forEach(t => {
        const btn = document.getElementById('tab-' + t);
        const panel = document.getElementById('panel-' + t);
        if (btn) {
            if (t === tab) btn.classList.add('active');
            else btn.classList.remove('active');
        }
        if (panel) {
            panel.style.display = (t === tab) ? 'block' : 'none';
        }
    });
    procesarDashboard(); 
}

function inicializarSelectorArco() {
    let arcos = new Set();
    Object.values(PARQUE_MASTER).forEach(tr => { if(tr.arco) arcos.add(tr.arco); });
    Object.values(PARQUE_CAJAS).forEach(sb => { if(sb.arco) arcos.add(sb.arco); });
    Object.values(PARQUE_ZANJAS).forEach(z => { if(z.arco) arcos.add(z.arco); });
    Object.values(PARQUE_PUNTUALES).forEach(p => { if(p.arco) arcos.add(p.arco); });
    
    const select = document.getElementById('dash-select-arco');
    if (!select) return;
    let optionsHtml = '<option value="TODOS">🌍 TODOS LOS ARCOS</option>';
    
    Array.from(arcos).sort().forEach(arco => {
        if (arco !== 'S/A') optionsHtml += `<option value="${arco}">⚡ ${arco}</option>`;
    });
    select.innerHTML = optionsHtml;
}

function limpiarFechas() {
    if(document.getElementById('dash-date-from')) document.getElementById('dash-date-from').value = '';
    if(document.getElementById('dash-date-to')) document.getElementById('dash-date-to').value = '';
    procesarDashboard();
}

function toggleAccordion(headerElement) {
    const content = headerElement.nextElementSibling;
    const icon = headerElement.querySelector('i');
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        if(icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
    } else {
        content.classList.add('hidden');
        if(icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
    }
}

function normalizeZanjaType(ref) {
    const r = String(ref).toUpperCase();
    if (r.includes('ENTRADA-PS') || r.includes('ENTRADA PS') || r.includes('ENTRADAPS')) return 'ENTRADA_PS';
    if (r.includes('MT')) return 'MT';
    if (r.includes('BT')) return 'BT';
    if (r.includes('SSAA')) return 'SSAA';
    if (r.includes('ZANJA G') || r.includes('ZANJA-G') || r.includes('ZANJA_G')) return 'PAT';
    if (r.includes('CCTV') || r.includes('LEA')) return 'CCTV';
    return 'OTRAS';
}

function procesarDashboard() {
    const selectEl = document.getElementById('dash-select-arco');
    const arcoSeleccionado = selectEl ? selectEl.value : 'TODOS';
    
    const elDateFrom = document.getElementById('dash-date-from');
    const elDateTo = document.getElementById('dash-date-to');
    const dateFrom = elDateFrom ? elDateFrom.value : '';
    const dateTo = elDateTo ? elDateTo.value : '';
    
    const elChartFilter = document.getElementById('chart-task-filter');
    const tareaCurva = elChartFilter ? elChartFilter.value : 'H';
    
    const enRango = (fecha) => {
        if (!fecha) return false;
        if (dateFrom && fecha < dateFrom) return false;
        if (dateTo && fecha > dateTo) return false;
        return true;
    };

    const pMec = document.getElementById('panel-mecanica');
    const pElec = document.getElementById('panel-electrica');
    const pZan = document.getElementById('panel-zanjas');
    const pPun = document.getElementById('panel-puntuales');

    if (pMec && pMec.style.display !== 'none') procesarMecanica(arcoSeleccionado, enRango, tareaCurva);
    if (pElec && pElec.style.display !== 'none') procesarSCB(arcoSeleccionado, enRango);
    if (pZan && pZan.style.display !== 'none') procesarZanjas(arcoSeleccionado);
    if (pPun && pPun.style.display !== 'none') procesarPuntuales(arcoSeleccionado);
}
function procesarMecanica(arcoSeleccionado, enRango, tareaCurva) {
    let trackersFiltrados = Object.values(PARQUE_MASTER);
    if (arcoSeleccionado !== 'TODOS') trackersFiltrados = trackersFiltrados.filter(tr => tr.arco === arcoSeleccionado);

    let tHincas = 0, tFilas = 0;
    let cHincas = 0, cPiruletas = 0, cTorque = 0, cOmegas = 0, cModulos = 0;
    let bloquesData = {}, produccionDiaria = {}, datosCurva = {}; 
    const lv = {'': 0, 'H': 1, 'P': 2, 'T': 3, 'O': 4, 'M': 5};

    trackersFiltrados.forEach(tr => {
        const ar = tr.arco;
        const bKey = `Bloque ${tr.block}`;
        
        if (!bloquesData[ar]) bloquesData[ar] = {};
        if (!bloquesData[ar][bKey]) bloquesData[ar][bKey] = { name: bKey, tH: 0, tF: 0, cH: 0, cP: 0, cT: 0, cO: 0, cM: 0 };

        for (let fN in tr.filas) {
            const f = tr.filas[fN];
            tFilas++; tHincas += f.hincas;
            bloquesData[ar][bKey].tF++;
            bloquesData[ar][bKey].tH += f.hincas;

            let minLvlFila = 5;
            let datesT = [], datesO = [], datesM = [];

            for (let h = 1; h <= f.hincas; h++) {
                const raw = HISTORIAL_PROD[`${tr.name}-F${fN}-H${h}`];
                let data = getMigratedData(raw);
                if (!data.estado) data.estado = '';
                if (!data.H) data.H = null;
                if (!data.P) data.P = null;
                if (!data.T) data.T = null;
                if (!data.O) data.O = null;
                if (!data.M) data.M = null;

                const l = lv[data.estado] || 0;
                if (l < minLvlFila) minLvlFila = l;

                if (data.H) {
                    if (enRango(data.H)) {
                        cHincas++; bloquesData[ar][bKey].cH++;
                        if (!produccionDiaria[data.H]) produccionDiaria[data.H] = {H:0,P:0,T:0,O:0,M:0};
                        produccionDiaria[data.H].H++;
                    }
                    if (tareaCurva === 'H') datosCurva[data.H] = (datosCurva[data.H] || 0) + 1;
                }
                if (data.P) {
                    if (enRango(data.P)) {
                        cPiruletas++; bloquesData[ar][bKey].cP++;
                        if (!produccionDiaria[data.P]) produccionDiaria[data.P] = {H:0,P:0,T:0,O:0,M:0};
                        produccionDiaria[data.P].P++;
                    }
                    if (tareaCurva === 'P') datosCurva[data.P] = (datosCurva[data.P] || 0) + 1;
                }

                if (data.T) datesT.push(data.T);
                if (data.O) datesO.push(data.O);
                if (data.M) datesM.push(data.M);
            }

            if (minLvlFila >= 3 && datesT.length === f.hincas) {
                let maxDateT = datesT.reduce((a,b) => a > b ? a : b);
                if (enRango(maxDateT)) {
                    cTorque++; bloquesData[ar][bKey].cT++;
                    if (!produccionDiaria[maxDateT]) produccionDiaria[maxDateT] = {H:0,P:0,T:0,O:0,M:0};
                    produccionDiaria[maxDateT].T++;
                }
                if (tareaCurva === 'T') datosCurva[maxDateT] = (datosCurva[maxDateT] || 0) + 1;
            }

            if (minLvlFila >= 4 && datesO.length === f.hincas) {
                let maxDateO = datesO.reduce((a,b) => a > b ? a : b);
                if (enRango(maxDateO)) {
                    cOmegas++; bloquesData[ar][bKey].cO++;
                    if (!produccionDiaria[maxDateO]) produccionDiaria[maxDateO] = {H:0,P:0,T:0,O:0,M:0};
                    produccionDiaria[maxDateO].O++;
                }
                if (tareaCurva === 'O') datosCurva[maxDateO] = (datosCurva[maxDateO] || 0) + 1;
            }

            if (minLvlFila >= 5 && datesM.length === f.hincas) {
                let maxDateM = datesM.reduce((a,b) => a > b ? a : b);
                if (enRango(maxDateM)) {
                    cModulos++; bloquesData[ar][bKey].cM++;
                    if (!produccionDiaria[maxDateM]) produccionDiaria[maxDateM] = {H:0,P:0,T:0,O:0,M:0};
                    produccionDiaria[maxDateM].M++;
                }
                if (tareaCurva === 'M') datosCurva[maxDateM] = (datosCurva[maxDateM] || 0) + 1;
            }
        }
    });

    const pctH = tHincas ? ((cHincas / tHincas) * 100).toFixed(1) : 0;
    const pctP = tHincas ? ((cPiruletas / tHincas) * 100).toFixed(1) : 0;
    const pctT = tFilas ? ((cTorque / tFilas) * 100).toFixed(1) : 0;
    const pctO = tFilas ? ((cOmegas / tFilas) * 100).toFixed(1) : 0;
    const pctM = tFilas ? ((cModulos / tFilas) * 100).toFixed(1) : 0;

    const getRowHtml = (lbl, curr, tot, pct, c) => `
        <tr><td style="padding: 10px 0; border-bottom: 1px dashed #e2e8f0; width: 35%;"><strong>${lbl}</strong></td><td style="padding: 10px 0; border-bottom: 1px dashed #e2e8f0;"><div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; color: #64748b;"><span>${curr} / ${tot} totales</span><span style="color:${c}">${pct}%</span></div><div style="width: 100%; background: #e2e8f0; height: 12px; border-radius: 6px; overflow: hidden; margin-top: 4px;"><div style="background:${c}; width:${pct}%; height: 100%;"></div></div></td></tr>`;

    if(document.getElementById('tabla-avance-num')) {
        document.getElementById('tabla-avance-num').innerHTML = getRowHtml('Hincas', cHincas, tHincas, pctH, '#ffb300') + getRowHtml('Piruletas', cPiruletas, tHincas, pctP, '#2196f3') + getRowHtml('Torquetubes', cTorque, tFilas, pctT, '#9c27b0') + getRowHtml('Omegas', cOmegas, tFilas, pctO, '#00bcd4') + getRowHtml('Módulos', cModulos, tFilas, pctM, '#4caf50');
    }

    const fechasDiarias = Object.keys(produccionDiaria).sort(); 
    if (chartDiario) chartDiario.destroy();
    const elChartD = document.getElementById('chartDiario');
    if(elChartD) {
        chartDiario = new Chart(elChartD.getContext('2d'), {
            type: 'bar',
            data: {
                labels: fechasDiarias.length ? fechasDiarias : ['Sin datos'],
                datasets: [
                    { label: 'Hincas', data: fechasDiarias.map(f => produccionDiaria[f].H || 0), backgroundColor: '#ffb300', borderRadius: 3 },
                    { label: 'Piruletas', data: fechasDiarias.map(f => produccionDiaria[f].P || 0), backgroundColor: '#2196f3', borderRadius: 3 },
                    { label: 'Torquetubes', data: fechasDiarias.map(f => produccionDiaria[f].T || 0), backgroundColor: '#9c27b0', borderRadius: 3 },
                    { label: 'Omegas', data: fechasDiarias.map(f => produccionDiaria[f].O || 0), backgroundColor: '#00bcd4', borderRadius: 3 },
                    { label: 'Módulos', data: fechasDiarias.map(f => produccionDiaria[f].M || 0), backgroundColor: '#4caf50', borderRadius: 3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
        });
    }

    const fechasOrdenadasS = Object.keys(datosCurva).sort();
    let datosAcumulados = [], acumulado = 0;
    fechasOrdenadasS.forEach(fecha => { acumulado += datosCurva[fecha]; datosAcumulados.push(acumulado); });
    if (chartS) chartS.destroy();
    const comboTask = document.getElementById('chart-task-filter');
    const lblCurva = `Acumulado - ${comboTask ? comboTask.options[comboTask.selectedIndex].text : 'Curva'}`;
    const elChartS = document.getElementById('chartCurvaS');
    if(elChartS) {
        chartS = new Chart(elChartS.getContext('2d'), {
            type: 'line',
            data: { labels: fechasOrdenadasS.length ? fechasOrdenadasS : ['Sin datos'], datasets: [{ label: lblCurva, data: datosAcumulados.length ? datosAcumulados : [0], borderColor: '#005596', backgroundColor: 'rgba(0, 85, 150, 0.1)', borderWidth: 3, fill: true, tension: 0.1 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom' } } }
        });
    }

    let accordionHtml = '';
    const arcosKeys = Object.keys(bloquesData).sort();
    if (arcosKeys.length === 0) { accordionHtml = '<div style="padding:20px; text-align:center; color:#64748b;">No hay bloques registrados.</div>'; } else {
        arcosKeys.forEach(ar => {
            const isHidden = (arcoSeleccionado === 'TODOS') ? 'hidden' : '';
            const iconCls = isHidden ? 'fa-chevron-down' : 'fa-chevron-up';
            accordionHtml += `<div class="accordion-header" style="background: #f1f5f9; padding: 12px 15px; font-weight: bold; color: #1e293b; cursor: pointer; display: flex; justify-content: space-between; border-radius: 6px; margin-bottom: 5px;" onclick="toggleAccordion(this)"><span><i class="fa-solid fa-bolt"></i> ${ar}</span><i class="fa-solid ${iconCls}"></i></div><div class="accordion-content ${isHidden}" style="margin-bottom: 15px; padding: 0 5px;">`;
            Object.values(bloquesData[ar]).sort((a,b) => a.name.localeCompare(b.name)).forEach(bl => {
                const bPctH = bl.tH ? ((bl.cH / bl.tH) * 100).toFixed(0) : 0, bPctP = bl.tH ? ((bl.cP / bl.tH) * 100).toFixed(0) : 0, bPctT = bl.tF ? ((bl.cT / bl.tF) * 100).toFixed(0) : 0, bPctO = bl.tF ? ((bl.cO / bl.tF) * 100).toFixed(0) : 0, bPctM = bl.tF ? ((bl.cM / bl.tF) * 100).toFixed(0) : 0;
                accordionHtml += `<div style="background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><div style="font-weight: 900; color: var(--blue); font-size: 13px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">${bl.name}</div><div style="display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 10px; font-weight: bold; color: #475569;"><span style="display: block; margin-bottom: 2px;">Hincas: ${bl.cH}/${bl.tH}</span><div style="width: 100%; background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;"><div style="background:#ffb300; width:${bPctH}%; height: 100%;"></div></div></div>
                    <div style="font-size: 10px; font-weight: bold; color: #475569;"><span style="display: block; margin-bottom: 2px;">Piruletas: ${bl.cP}/${bl.tH}</span><div style="width: 100%; background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;"><div style="background:#2196f3; width:${bPctP}%; height: 100%;"></div></div></div>
                    <div style="font-size: 10px; font-weight: bold; color: #475569;"><span style="display: block; margin-bottom: 2px;">Torquetubes: ${bl.cT}/${bl.tF}</span><div style="width: 100%; background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;"><div style="background:#9c27b0; width:${bPctT}%; height: 100%;"></div></div></div>
                    <div style="font-size: 10px; font-weight: bold; color: #475569;"><span style="display: block; margin-bottom: 2px;">Omegas: ${bl.cO}/${bl.tF}</span><div style="width: 100%; background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;"><div style="background:#00bcd4; width:${bPctO}%; height: 100%;"></div></div></div>
                    <div style="font-size: 10px; font-weight: bold; color: #475569;"><span style="display: block; margin-bottom: 2px;">Módulos: ${bl.cM}/${bl.tF}</span><div style="width: 100%; background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;"><div style="background:#4caf50; width:${bPctM}%; height: 100%;"></div></div></div></div></div>`;
            });
            accordionHtml += `</div>`;
        });
    }
    if(document.getElementById('blocks-accordion-container')) document.getElementById('blocks-accordion-container').innerHTML = accordionHtml;
}

function procesarSCB(arcoSeleccionado, enRango) {
    let cajasFiltradas = Object.values(PARQUE_CAJAS);
    if (arcoSeleccionado !== 'TODOS') cajasFiltradas = cajasFiltradas.filter(sb => sb.arco === arcoSeleccionado);

    let tCajas = 0, scbRed = 0, scbOrange = 0, scbGreen = 0;
    let chkCounts = { loc: 0, sop: 0, fus: 0, str: 0, bus: 0, lim: 0 };
    let scbBloquesData = {};
    let produccionDiariaSCB = {}; 

    cajasFiltradas.forEach(sb => {
        tCajas++;
        const ar = sb.arco;
        const bKey = `Bloque ${sb.block}`;
        
        if (!scbBloquesData[ar]) scbBloquesData[ar] = {};
        if (!scbBloquesData[ar][bKey]) scbBloquesData[ar][bKey] = { name: bKey, t: 0, r: 0, o: 0, g: 0 };
        scbBloquesData[ar][bKey].t++;

        let checks = HISTORIAL_CAJAS[sb.name] || {};
        let count = 0;
        let fechasCaja = []; 

        const processCheck = (item, type) => {
            if (checks[item]) {
                count++; chkCounts[type]++;
                if (typeof checks[item] === 'string') fechasCaja.push(checks[item]);
            }
        };

        processCheck('localizacion', 'loc');
        processCheck('soportacion', 'sop');
        processCheck('fusibles', 'fus');
        processCheck('con_strings', 'str');
        processCheck('con_bus', 'bus');
        processCheck('limpieza', 'lim');

        if (count === 0) { scbRed++; scbBloquesData[ar][bKey].r++; }
        else if (count === 6) { scbGreen++; scbBloquesData[ar][bKey].g++; }
        else { scbOrange++; scbBloquesData[ar][bKey].o++; }

        if (fechasCaja.length > 0) {
            fechasCaja.sort(); 
            let fInicio = fechasCaja[0]; 
            if (enRango(fInicio)) {
                if (!produccionDiariaSCB[fInicio]) produccionDiariaSCB[fInicio] = { iniciadas: 0, finalizadas: 0 };
                produccionDiariaSCB[fInicio].iniciadas++;
            }

            if (count === 6) { 
                let fFin = fechasCaja[fechasCaja.length - 1]; 
                if (enRango(fFin)) {
                    if (!produccionDiariaSCB[fFin]) produccionDiariaSCB[fFin] = { iniciadas: 0, finalizadas: 0 };
                    produccionDiariaSCB[fFin].finalizadas++;
                }
            }
        }
    });

    const pctScbRed = tCajas ? ((scbRed / tCajas) * 100).toFixed(1) : 0;
    const pctScbOrg = tCajas ? ((scbOrange / tCajas) * 100).toFixed(1) : 0;
    const pctScbGrn = tCajas ? ((scbGreen / tCajas) * 100).toFixed(1) : 0;
    if(document.getElementById('kpi-scb-red')) document.getElementById('kpi-scb-red').innerText = scbRed;
    if(document.getElementById('kpi-scb-orange')) document.getElementById('kpi-scb-orange').innerText = scbOrange;
    if(document.getElementById('kpi-scb-green')) document.getElementById('kpi-scb-green').innerText = scbGreen;

    if (chartSCB) chartSCB.destroy();
    const elChartSCB = document.getElementById('chartSCB');
    if(elChartSCB) {
        chartSCB = new Chart(elChartSCB.getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Localización', 'Soportación', 'Fusibles', 'Conex. Strings', 'Conex. BUS', 'Limpieza'],
                datasets: [{ label: 'Cajas completadas', data: [chkCounts.loc, chkCounts.sop, chkCounts.fus, chkCounts.str, chkCounts.bus, chkCounts.lim], backgroundColor: '#3b82f6', borderRadius: 4 }]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, max: tCajas || 1, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } }, plugins: { legend: { display: false } } }
        });
    }

    const fechasSCB = Object.keys(produccionDiariaSCB).sort();
    if (chartDiarioSCB) chartDiarioSCB.destroy();
    const elChartDiarioSCB = document.getElementById('chartDiarioSCB');
    if(elChartDiarioSCB) {
        chartDiarioSCB = new Chart(elChartDiarioSCB.getContext('2d'), {
            type: 'bar',
            data: {
                labels: fechasSCB.length ? fechasSCB : ['Sin datos'],
                datasets: [
                    { label: 'Cajas Comenzadas', data: fechasSCB.map(f => produccionDiariaSCB[f].iniciadas), backgroundColor: '#f97316', borderRadius: 3 },
                    { label: 'Cajas Finalizadas', data: fechasSCB.map(f => produccionDiariaSCB[f].finalizadas), backgroundColor: '#16a34a', borderRadius: 3 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
        });
    }

    let scbAccordionHtml = '';
    const scbArcosKeys = Object.keys(scbBloquesData).sort();
    if (scbArcosKeys.length === 0) { scbAccordionHtml = '<div style="padding:20px; text-align:center; color:#64748b;">No hay cajas registradas.</div>'; } else {
        scbArcosKeys.forEach(ar => {
            const isHidden = (arcoSeleccionado === 'TODOS') ? 'hidden' : '';
            const iconCls = isHidden ? 'fa-chevron-down' : 'fa-chevron-up';
            scbAccordionHtml += `<div class="accordion-header" style="background: #f1f5f9; padding: 12px 15px; font-weight: bold; color: #1e293b; cursor: pointer; display: flex; justify-content: space-between; border-radius: 6px; margin-bottom: 5px;" onclick="toggleAccordion(this)"><span><i class="fa-solid fa-bolt"></i> ${ar}</span><i class="fa-solid ${iconCls}"></i></div><div class="accordion-content ${isHidden}" style="margin-bottom: 15px; padding: 0 5px;">`;
            Object.values(scbBloquesData[ar]).sort((a,b) => a.name.localeCompare(b.name)).forEach(bl => {
                const bPctG = bl.t ? ((bl.g / bl.t) * 100).toFixed(0) : 0;
                scbAccordionHtml += `<div style="background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"><div style="font-weight: 900; color: var(--blue); font-size: 13px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">${bl.name} <span style="float:right; font-size:12px; color:#16a34a">${bPctG}% OK</span></div>
                    <div style="display:flex; height:12px; border-radius:6px; overflow:hidden; margin-bottom:8px; background:#e2e8f0;">
                        <div style="background:#dc2626; width:${(bl.r/bl.t)*100}%" title="Sin Empezar: ${bl.r}"></div>
                        <div style="background:#f97316; width:${(bl.o/bl.t)*100}%" title="En Proceso: ${bl.o}"></div>
                        <div style="background:#16a34a; width:${(bl.g/bl.t)*100}%" title="Finalizada: ${bl.g}"></div></div>
                    <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold; color:#475569;">
                        <span style="color:#dc2626">🟥 ${bl.r}</span><span style="color:#f97316">🟧 ${bl.o}</span><span style="color:#16a34a">🟩 ${bl.g}</span></div></div>`;
            });
            scbAccordionHtml += `</div>`;
        });
    }
    if(document.getElementById('blocks-accordion-scb')) document.getElementById('blocks-accordion-scb').innerHTML = scbAccordionHtml;
}
function procesarZanjas(arcoSeleccionado) {
    const containerZanjas = document.getElementById('contenedor-analitica-zanjas');
    if (!containerZanjas) return;
    
    let zValues = Object.values(PARQUE_ZANJAS);
    if (arcoSeleccionado !== 'TODOS') zValues = zValues.filter(z => z.arco === arcoSeleccionado);
    
    if (zValues.length === 0) {
        containerZanjas.innerHTML = '<div class="dash-card"><div style="text-align:center; color:#64748b; font-weight:bold;">No hay datos de zanjas para el filtro seleccionado.</div></div>';
        return;
    }

    let totalMetrosProyecto = 0;
    let metrosPorItem = { excavacion: 0, cama_arena: 0, inspeccion_cables: 0, ruteado_peinado: 0, identificacion_cables: 0, cinta_seguridad: 0, cierre_zanja: 0 };
    let metrosPorTipo = {}; 

    zValues.forEach(z => {
        const dx = z.x2 - z.x1; const dy = z.y2 - z.y1;
        const longitud = Math.sqrt(dx*dx + dy*dy);
        totalMetrosProyecto += longitud;
        const type = normalizeZanjaType(z.ref);
        if (!metrosPorTipo[type]) metrosPorTipo[type] = { total: 0, ejecutado: 0 };
        metrosPorTipo[type].total += longitud;

        let stats = HISTORIAL_ZANJAS[z.id] || {};
        if (stats.excavacion) metrosPorItem.excavacion += stats.excavacion;
        if (stats.cama_arena) metrosPorItem.cama_arena += stats.cama_arena;
        if (stats.inspeccion_cables) metrosPorItem.inspeccion_cables += stats.inspeccion_cables;
        if (stats.ruteado_peinado) metrosPorItem.ruteado_peinado += stats.ruteado_peinado;
        if (stats.identificacion_cables) metrosPorItem.identificacion_cables += stats.identificacion_cables;
        if (stats.cinta_seguridad) metrosPorItem.cinta_seguridad += stats.cinta_seguridad;
        if (stats.cierre_zanja) { metrosPorItem.cierre_zanja += stats.cierre_zanja; metrosPorTipo[type].ejecutado += stats.cierre_zanja; }
    });

    const pctAvanceReal = totalMetrosProyecto > 0 ? ((metrosPorItem.cierre_zanja / totalMetrosProyecto) * 100).toFixed(1) : 0;

    containerZanjas.innerHTML = `
    <div class="dash-card">
        <h3 style="margin-bottom:15px;">Resumen Ejecutivo de Obra Civil</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:15px; margin-bottom:25px;">
            <div style="background:#f8fafc; padding:15px; border-radius:8px; border-left:4px solid #64748b; border:1px solid #e2e8f0; border-left-width:4px;"><div style="font-size:11px; color:#64748b; font-weight:bold; text-transform:uppercase;">METROS DISEÑO TOTAL</div><div style="font-size:22px; font-weight:900; color:#1e293b; margin-top:5px;">${Math.round(totalMetrosProyecto).toLocaleString()} m</div></div>
            <div style="background:#f8fafc; padding:15px; border-radius:8px; border-left:4px solid #ffeb3b; border:1px solid #e2e8f0; border-left-width:4px; border-left-color:#ffeb3b;"><div style="font-size:11px; color:#64748b; font-weight:bold; text-transform:uppercase;">EXCAVACIÓN REALIZADA</div><div style="font-size:22px; font-weight:900; color:#1e293b; margin-top:5px;">${Math.round(metrosPorItem.excavacion).toLocaleString()} m</div></div>
            <div style="background:#f0fdf4; padding:15px; border-radius:8px; border-left:4px solid #4caf50; border:1px solid #bbf7d0; border-left-width:4px; border-left-color:#4caf50;"><div style="font-size:11px; color:#166534; font-weight:bold; text-transform:uppercase;">ZANJA COMPLETADA</div><div style="font-size:22px; font-weight:900; color:#166534; margin-top:5px;">${Math.round(metrosPorItem.cierre_zanja).toLocaleString()} m <span style="font-size:14px; opacity:0.8;">(${pctAvanceReal}%)</span></div></div>
        </div>
        
        <h3 style="margin-top:30px; margin-bottom:15px;">Avance Lineal por Fases Constructivas</h3>
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:25px;">
            ${[{k:'excavacion', l:'⛏️ 1. Excavación'}, {k:'cama_arena', l:'⏳ 2. Cama de arena'}, {k:'inspeccion_cables', l:'🔍 3. Inspección de cables'}, {k:'ruteado_peinado', l:'🔌 4. Ruteado y peinado'}, {k:'identificacion_cables', l:'🏷️ 5. Identificación cables'}, {k:'cinta_seguridad', l:'🎀 6. Cinta seguridad'}, {k:'cierre_zanja', l:'🪨 7. Cierre de zanja'}].map(f => {
                const m = metrosPorItem[f.k]; const pct = totalMetrosProyecto > 0 ? ((m / totalMetrosProyecto) * 100).toFixed(1) : 0;
                return `<div style="font-size:12px; font-weight:bold; color:#334155; display:flex; justify-content:space-between;"><span>${f.l}</span><span>${Math.round(m).toLocaleString()} m (${pct}%)</span></div><div style="width:100%; background:#e2e8f0; height:12px; border-radius:6px; overflow:hidden; margin-bottom:10px;"><div style="width:${pct}%; background:${f.k==='cierre_zanja'?'#4caf50':'#3b82f6'}; height:100%;"></div></div>`;
            }).join('')}
        </div>
        
        <h3 style="margin-top:30px; margin-bottom:15px;">Balance por Tipo de Circuito</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
            <thead><tr style="background:#f1f5f9; color:#475569;"><th style="padding:10px; border-bottom:1px solid #cbd5e1;">Tipo Circuito</th><th style="padding:10px; text-align:right; border-bottom:1px solid #cbd5e1;">Diseño Total</th><th style="padding:10px; text-align:right; border-bottom:1px solid #cbd5e1;">Completado</th><th style="padding:10px; text-align:right; border-bottom:1px solid #cbd5e1;">Pendiente</th><th style="padding:10px; text-align:right; border-bottom:1px solid #cbd5e1;">Avance</th></tr></thead>
            <tbody>
                ${Object.keys(metrosPorTipo).sort().map(t => {
                    const item = metrosPorTipo[t]; const pend = Math.max(0, item.total - item.ejecutado); const p = item.total > 0 ? ((item.ejecutado / item.total) * 100).toFixed(1) : 0;
                    return `<tr><td style="padding:10px; font-weight:bold; border-bottom:1px dashed #e2e8f0;">${t}</td><td style="padding:10px; text-align:right; border-bottom:1px dashed #e2e8f0;">${Math.round(item.total).toLocaleString()} m</td><td style="padding:10px; text-align:right; color:#16a34a; font-weight:bold; border-bottom:1px dashed #e2e8f0;">${Math.round(item.ejecutado).toLocaleString()} m</td><td style="padding:10px; text-align:right; color:#dc2626; border-bottom:1px dashed #e2e8f0;">${Math.round(pend).toLocaleString()} m</td><td style="padding:10px; text-align:right; font-weight:bold; border-bottom:1px dashed #e2e8f0;">${p}%</td></tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>`;
}

function procesarPuntuales(arcoSeleccionado) {
    const containerPuntuales = document.getElementById('contenedor-analitica-puntuales');
    if (!containerPuntuales) return;
    
    let pValues = Object.values(PARQUE_PUNTUALES);
    if (arcoSeleccionado !== 'TODOS') pValues = pValues.filter(p => p.arco === arcoSeleccionado);
    
    if (pValues.length === 0) {
        containerPuntuales.innerHTML = '<div class="dash-card"><div style="text-align:center; color:#64748b; font-weight:bold;">No hay datos de equipos puntuales para el filtro seleccionado.</div></div>';
        return;
    }

    let totalEquipos = pValues.length;
    let resumenTipos = {};

    pValues.forEach(p => {
        const refUp = p.ref.toUpperCase();
        let typeKey = 'otras'; let label = 'Otros Elementos'; let maxChecks = 6;
        if (refUp.includes('ARQUETA')) { typeKey = 'arqueta'; label = '📥 Arquetas Registro'; maxChecks = 6; } 
        else if (refUp.includes('POSTE CAJA')) { typeKey = 'csb'; label = '📦 Postes Caja (CSB)'; maxChecks = 7; }
        else if (refUp.includes('BÁCULO-CCTV') || refUp.includes('BACULO-CCTV') || refUp.includes('CCTV') || refUp.includes('FC-')) { typeKey = 'cctv'; label = '🎥 Báculos CCTV'; maxChecks = 6; }
        else if (refUp.includes('GATEWAY')) { typeKey = 'gateway'; label = '📡 Gateways'; maxChecks = 7; }
        else if (refUp.includes('MBOX')) { typeKey = 'mbox'; label = '⚡ Cajas MBox'; maxChecks = 7; }
        else if (refUp.includes('TBOX')) { typeKey = 'tbox'; label = '🔋 Cajas TBox'; maxChecks = 7; }
        else if (refUp.includes('METEO')) { typeKey = 'meteo'; label = '🌤️ Estaciones Meteo'; maxChecks = 6; }

        if (!resumenTipos[typeKey]) resumenTipos[typeKey] = { label: label, total: 0, sin_empezar: 0, en_proceso: 0, terminados: 0, maxC: maxChecks };
        resumenTipos[typeKey].total++;
        
        let checks = HISTORIAL_PUNTUALES[p.id] || {};
        let count = 0;
        Object.keys(checks).forEach(k => { if(checks[k]) count++; });
        
        if (count === 0) resumenTipos[typeKey].sin_empezar++;
        else if (count === maxChecks) resumenTipos[typeKey].terminados++;
        else resumenTipos[typeKey].en_proceso++;
    });

    let tSin = 0, tPro = 0, tTer = 0;
    Object.values(resumenTipos).forEach(r => { tSin += r.sin_empezar; tPro += r.en_proceso; tTer += r.terminados; });
    const pctGral = totalEquipos > 0 ? ((tTer / totalEquipos) * 100).toFixed(1) : 0;

    containerPuntuales.innerHTML = `
    <div class="dash-card">
        <h3 style="margin-bottom:15px;">Instalación de Equipos y Arquetas</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:15px; margin-bottom:25px;">
            <div style="background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0; border-left:4px solid #64748b;"><div style="font-size:11px; color:#64748b; font-weight:bold;">TOTAL EQUIPOS RED</div><div style="font-size:22px; font-weight:900; color:#1e293b; margin-top:5px;">${totalEquipos} uds</div></div>
            <div style="background:#fff5f5; padding:15px; border-radius:8px; border:1px solid #fecaca; border-left:4px solid #ef4444;"><div style="font-size:11px; color:#b91c1c; font-weight:bold;">PENDIENTES</div><div style="font-size:22px; font-weight:900; color:#dc2626; margin-top:5px;">${tSin} uds</div></div>
            <div style="background:#fffbeb; padding:15px; border-radius:8px; border:1px solid #fde68a; border-left:4px solid #f59e0b;"><div style="font-size:11px; color:#b45309; font-weight:bold;">EN MONTAJE / AJUSTE</div><div style="font-size:22px; font-weight:900; color:#ea580c; margin-top:5px;">${tPro} uds</div></div>
            <div style="background:#f0fdf4; padding:15px; border-radius:8px; border:1px solid #bbf7d0; border-left:4px solid #4caf50;"><div style="font-size:11px; color:#15803d; font-weight:bold;">INSTALADOS AL 100%</div><div style="font-size:22px; font-weight:900; color:#16a34a; margin-top:5px;">${tTer} uds <span style="font-size:14px; opacity:0.8;">(${pctGral}%)</span></div></div>
        </div>
        
        <h3 style="margin-top:30px; margin-bottom:15px;">Progreso por Tipo de Equipamiento</h3>
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
            <thead><tr style="background:#f1f5f9; color:#475569;"><th style="padding:10px; border-bottom:1px solid #cbd5e1;">Descripción</th><th style="padding:10px; text-align:center; border-bottom:1px solid #cbd5e1;">Total</th><th style="padding:10px; text-align:center; border-bottom:1px solid #cbd5e1;">Sin Empezar</th><th style="padding:10px; text-align:center; border-bottom:1px solid #cbd5e1;">En Proceso</th><th style="padding:10px; text-align:center; border-bottom:1px solid #cbd5e1;">Terminado</th><th style="padding:10px; text-align:center; border-bottom:1px solid #cbd5e1;">Avance</th></tr></thead>
            <tbody>
                ${Object.keys(resumenTipos).sort().map(k => {
                    const r = resumenTipos[k]; const pOk = r.total > 0 ? ((r.terminados / r.total) * 100).toFixed(0) : 0;
                    return `<tr><td style="padding:10px; font-weight:bold; border-bottom:1px dashed #e2e8f0;">${r.label}</td><td style="padding:10px; text-align:center; font-weight:bold; border-bottom:1px dashed #e2e8f0;">${r.total}</td><td style="padding:10px; text-align:center; color:#dc2626; border-bottom:1px dashed #e2e8f0;">${r.sin_empezar}</td><td style="padding:10px; text-align:center; color:#ea580c; border-bottom:1px dashed #e2e8f0;">${r.en_proceso}</td><td style="padding:10px; text-align:center; color:#16a34a; font-weight:bold; border-bottom:1px dashed #e2e8f0;">${r.terminados}</td><td style="padding:10px; text-align:center; font-weight:bold; border-bottom:1px dashed #e2e8f0;">${pOk}%</td></tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>`;
}