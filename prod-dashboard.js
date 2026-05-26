let PARQUE_MASTER = {};
let HISTORIAL_PROD = {};
let PARQUE_CAJAS = {};
let HISTORIAL_CAJAS = {};

let chartS = null;
let chartDiario = null;
let chartSCB = null;
let chartDiarioSCB = null;

localforage.config({ name: 'SIGMA_PROD_V1', storeName: 'produccion_hincas' });

window.onload = async () => {
    const s = await localforage.getItem('PARQUE_MASTER_DATA');
    const h = await localforage.getItem('HISTORIAL_PROD');
    const c = await localforage.getItem('PARQUE_CAJAS_DATA');
    const hc = await localforage.getItem('HISTORIAL_CAJAS');

    if (s) PARQUE_MASTER = s;
    if (h) HISTORIAL_PROD = h;
    if (c) PARQUE_CAJAS = c;
    if (hc) HISTORIAL_CAJAS = hc;

    if (s) {
        inicializarSelectorArco();
        procesarDashboard();
    } else {
        document.getElementById('blocks-accordion-container').innerHTML = '<div class="empty-state">No hay datos mecánicos.</div>';
        document.getElementById('blocks-accordion-scb').innerHTML = '<div class="empty-state">No hay datos eléctricos.</div>';
    }
};

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

function switchTabDash(tab) {
    document.getElementById('tab-mecanica').classList.remove('active');
    document.getElementById('tab-electrica').classList.remove('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'mecanica') {
        document.getElementById('panel-mecanica').style.display = 'block';
        document.getElementById('panel-electrica').style.display = 'none';
    } else {
        document.getElementById('panel-mecanica').style.display = 'none';
        document.getElementById('panel-electrica').style.display = 'block';
    }
}

function inicializarSelectorArco() {
    let arcos = new Set();
    Object.values(PARQUE_MASTER).forEach(tr => { if(tr.arco) arcos.add(tr.arco); });
    Object.values(PARQUE_CAJAS).forEach(sb => { if(sb.arco) arcos.add(sb.arco); });
    
    const select = document.getElementById('dash-select-arco');
    let optionsHtml = '<option value="TODOS">🌍 TODOS LOS ARCOS</option>';
    
    Array.from(arcos).sort().forEach(arco => {
        if (arco !== 'S/A') optionsHtml += `<option value="${arco}">⚡ ${arco}</option>`;
    });
    select.innerHTML = optionsHtml;
}

function limpiarFechas() {
    document.getElementById('dash-date-from').value = '';
    document.getElementById('dash-date-to').value = '';
    procesarDashboard();
}

function toggleAccordion(headerElement) {
    const content = headerElement.nextElementSibling;
    const icon = headerElement.querySelector('i.fa-chevron-down, i.fa-chevron-up');
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        if(icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
    } else {
        content.classList.add('hidden');
        if(icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
    }
}

function procesarDashboard() {
    const arcoSeleccionado = document.getElementById('dash-select-arco').value;
    const dateFrom = document.getElementById('dash-date-from').value;
    const dateTo = document.getElementById('dash-date-to').value;
    const tareaCurva = document.getElementById('chart-task-filter').value;
    
    const enRango = (fecha) => {
        if (!fecha) return false;
        if (dateFrom && fecha < dateFrom) return false;
        if (dateTo && fecha > dateTo) return false;
        return true;
    };

    // ==========================================
    // 1. PROCESAMIENTO MECÁNICO
    // ==========================================
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
                let maxDateT = datesT.sort().reverse()[0];
                if (enRango(maxDateT)) {
                    cTorque++; bloquesData[ar][bKey].cT++;
                    if (!produccionDiaria[maxDateT]) produccionDiaria[maxDateT] = {H:0,P:0,T:0,O:0,M:0};
                    produccionDiaria[maxDateT].T++;
                }
                if (tareaCurva === 'T') datosCurva[maxDateT] = (datosCurva[maxDateT] || 0) + 1;
            }

            if (minLvlFila >= 4 && datesO.length === f.hincas) {
                let maxDateO = datesO.sort().reverse()[0];
                if (enRango(maxDateO)) {
                    cOmegas++; bloquesData[ar][bKey].cO++;
                    if (!produccionDiaria[maxDateO]) produccionDiaria[maxDateO] = {H:0,P:0,T:0,O:0,M:0};
                    produccionDiaria[maxDateO].O++;
                }
                if (tareaCurva === 'O') datosCurva[maxDateO] = (datosCurva[maxDateO] || 0) + 1;
            }

            if (minLvlFila >= 5 && datesM.length === f.hincas) {
                let maxDateM = datesM.sort().reverse()[0];
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
        <tr><td><strong>${lbl}</strong></td><td><div class="progress-label"><span>${curr} / ${tot} totales</span><span style="color:${c}">${pct}%</span></div><div class="progress-bar-bg"><div class="progress-bar-fill" style="background:${c}; width:${pct}%"></div></div></td></tr>`;

    document.getElementById('tabla-avance-num').innerHTML = getRowHtml('Hincas', cHincas, tHincas, pctH, '#ffb300') + getRowHtml('Piruletas', cPiruletas, tHincas, pctP, '#2196f3') + getRowHtml('Torquetubes', cTorque, tFilas, pctT, '#9c27b0') + getRowHtml('Omegas', cOmegas, tFilas, pctO, '#00bcd4') + getRowHtml('Módulos', cModulos, tFilas, pctM, '#4caf50');

    const fechasDiarias = Object.keys(produccionDiaria).sort(); 
    if (chartDiario) chartDiario.destroy();
    const ctxD = document.getElementById('chartDiario').getContext('2d');
    chartDiario = new Chart(ctxD, {
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

    const fechasOrdenadasS = Object.keys(datosCurva).sort();
    let datosAcumulados = [], acumulado = 0;
    fechasOrdenadasS.forEach(fecha => { acumulado += datosCurva[fecha]; datosAcumulados.push(acumulado); });
    if (chartS) chartS.destroy();
    const lblCurva = `Acumulado - ${document.getElementById('chart-task-filter').options[document.getElementById('chart-task-filter').selectedIndex].text}`;
    chartS = new Chart(document.getElementById('chartCurvaS').getContext('2d'), {
        type: 'line',
        data: { labels: fechasOrdenadasS.length ? fechasOrdenadasS : ['Sin datos'], datasets: [{ label: lblCurva, data: datosAcumulados.length ? datosAcumulados : [0], borderColor: '#005596', backgroundColor: 'rgba(0, 85, 150, 0.1)', borderWidth: 3, fill: true, tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }, plugins: { legend: { display: true, position: 'bottom' } } }
    });

    let accordionHtml = '';
    const arcosKeys = Object.keys(bloquesData).sort();
    if (arcosKeys.length === 0) { accordionHtml = '<div class="empty-state">No hay bloques registrados.</div>'; } else {
        arcosKeys.forEach(ar => {
            const isHidden = (arcoSeleccionado === 'TODOS') ? 'hidden' : '';
            const iconCls = isHidden ? 'fa-chevron-down' : 'fa-chevron-up';
            accordionHtml += `<div class="accordion-header" onclick="toggleAccordion(this)"><span><i class="fa-solid fa-bolt"></i> ${ar}</span><i class="fa-solid ${iconCls}"></i></div><div class="accordion-content ${isHidden}">`;
            Object.values(bloquesData[ar]).sort((a,b) => a.name.localeCompare(b.name)).forEach(bl => {
                const bPctH = bl.tH ? ((bl.cH / bl.tH) * 100).toFixed(0) : 0, bPctP = bl.tH ? ((bl.cP / bl.tH) * 100).toFixed(0) : 0, bPctT = bl.tF ? ((bl.cT / bl.tF) * 100).toFixed(0) : 0, bPctO = bl.tF ? ((bl.cO / bl.tF) * 100).toFixed(0) : 0, bPctM = bl.tF ? ((bl.cM / bl.tF) * 100).toFixed(0) : 0;
                accordionHtml += `<div class="block-row-card"><div class="block-row-header">${bl.name}</div><div class="mini-progress-container">
                    <div class="mini-progress-item"><span>Hincas: ${bl.cH}/${bl.tH}</span><div class="mini-bar-bg"><div style="background:#ffb300; width:${bPctH}%"></div></div></div>
                    <div class="mini-progress-item"><span>Piruletas: ${bl.cP}/${bl.tH}</span><div class="mini-bar-bg"><div style="background:#2196f3; width:${bPctP}%"></div></div></div>
                    <div class="mini-progress-item"><span>Torquetubes: ${bl.cT}/${bl.tF}</span><div class="mini-bar-bg"><div style="background:#9c27b0; width:${bPctT}%"></div></div></div>
                    <div class="mini-progress-item"><span>Omegas: ${bl.cO}/${bl.tF}</span><div class="mini-bar-bg"><div style="background:#00bcd4; width:${bPctO}%"></div></div></div>
                    <div class="mini-progress-item"><span>Módulos: ${bl.cM}/${bl.tF}</span><div class="mini-bar-bg"><div style="background:#4caf50; width:${bPctM}%"></div></div></div></div></div>`;
            });
            accordionHtml += `</div>`;
        });
    }
    document.getElementById('blocks-accordion-container').innerHTML = accordionHtml;

    // ==========================================
    // 2. PROCESAMIENTO ELÉCTRICO (SCB)
    // ==========================================
    let cajasFiltradas = Object.values(PARQUE_CAJAS);
    if (arcoSeleccionado !== 'TODOS') cajasFiltradas = cajasFiltradas.filter(sb => sb.arco === arcoSeleccionado);

    let tCajas = 0, scbRed = 0, scbOrange = 0, scbGreen = 0;
    let chkCounts = { loc: 0, sop: 0, fus: 0, str: 0, bus: 0, lim: 0 };
    let scbBloquesData = {};
    let produccionDiariaSCB = {}; // Para el nuevo gráfico diario

    cajasFiltradas.forEach(sb => {
        tCajas++;
        const ar = sb.arco;
        const bKey = `Bloque ${sb.block}`;
        
        if (!scbBloquesData[ar]) scbBloquesData[ar] = {};
        if (!scbBloquesData[ar][bKey]) scbBloquesData[ar][bKey] = { name: bKey, t: 0, r: 0, o: 0, g: 0 };
        scbBloquesData[ar][bKey].t++;

        let checks = HISTORIAL_CAJAS[sb.name] || {};
        let count = 0;
        let fechasCaja = []; // Guardamos las fechas de esta caja

        const processCheck = (item, type) => {
            if (checks[item]) {
                count++; chkCounts[type]++;
                // Si la fecha es un string guardado con el nuevo código, la añadimos
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

        // Extraer fechas para el Producción Diaria SCB
        if (fechasCaja.length > 0) {
            fechasCaja.sort(); // Ordenamos cronológicamente
            let fInicio = fechasCaja[0]; // La fecha en la que se hizo el primer check
            if (enRango(fInicio)) {
                if (!produccionDiariaSCB[fInicio]) produccionDiariaSCB[fInicio] = { iniciadas: 0, finalizadas: 0 };
                produccionDiariaSCB[fInicio].iniciadas++;
            }

            if (count === 6) { // Si la caja está terminada, sacamos la fecha de la última tarea
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
    document.getElementById('kpi-scb-red').innerText = `${scbRed} cajas - ${pctScbRed}%`;
    document.getElementById('kpi-scb-orange').innerText = `${scbOrange} cajas - ${pctScbOrg}%`;
    document.getElementById('kpi-scb-green').innerText = `${scbGreen} de ${tCajas} cajas - ${pctScbGrn}%`;

    // Gráfico Horizontal de Checklist
    if (chartSCB) chartSCB.destroy();
    chartSCB = new Chart(document.getElementById('chartSCB').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Localización', 'Soportación', 'Fusibles', 'Conex. Strings', 'Conex. BUS', 'Limpieza'],
            datasets: [{ label: 'Cajas con la tarea completada', data: [chkCounts.loc, chkCounts.sop, chkCounts.fus, chkCounts.str, chkCounts.bus, chkCounts.lim], backgroundColor: '#3b82f6', borderRadius: 4 }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, max: tCajas || 1, grid: { color: '#f1f5f9' } }, y: { grid: { display: false } } }, plugins: { legend: { display: false } } }
    });

    // NUEVO: Gráfico Diario SCB
    const fechasSCB = Object.keys(produccionDiariaSCB).sort();
    if (chartDiarioSCB) chartDiarioSCB.destroy();
    chartDiarioSCB = new Chart(document.getElementById('chartDiarioSCB').getContext('2d'), {
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

    // Acordeón SCB
    let scbAccordionHtml = '';
    const scbArcosKeys = Object.keys(scbBloquesData).sort();
    if (scbArcosKeys.length === 0) { scbAccordionHtml = '<div class="empty-state">No hay cajas registradas.</div>'; } else {
        scbArcosKeys.forEach(ar => {
            const isHidden = (arcoSeleccionado === 'TODOS') ? 'hidden' : '';
            const iconCls = isHidden ? 'fa-chevron-down' : 'fa-chevron-up';
            scbAccordionHtml += `<div class="accordion-header" onclick="toggleAccordion(this)"><span><i class="fa-solid fa-bolt"></i> ${ar}</span><i class="fa-solid ${iconCls}"></i></div><div class="accordion-content ${isHidden}">`;
            Object.values(scbBloquesData[ar]).sort((a,b) => a.name.localeCompare(b.name)).forEach(bl => {
                const bPctG = bl.t ? ((bl.g / bl.t) * 100).toFixed(0) : 0;
                scbAccordionHtml += `<div class="block-row-card"><div class="block-row-header">${bl.name} <span style="float:right; font-size:12px; color:#16a34a">${bPctG}% OK</span></div>
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
    document.getElementById('blocks-accordion-scb').innerHTML = scbAccordionHtml;
}