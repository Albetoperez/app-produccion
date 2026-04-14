import React, { useState, useEffect } from "react";

const CHECKLIST_MECANICO = [
  "Estructuras y tornillería",
  "Seguidores / estructura fija",
  "Motores y actuadores",
  "Alineación",
  "Holguras / ruidos",
  "Estado general mecánico",
];

export default function App() {
  const [paso, setPaso] = useState(1);
  const [inspecciones, setInspecciones] = useState([]);
  const [form, setForm] = useState({
    fecha: "",
    supervisor: "",
    tipo: "mecanica",
    zona: "",
    equipo: "",
    observacionFinal: "",
    checklist: CHECKLIST_MECANICO.map((i) => ({
      nombre: i,
      estado: "OK",
      observacion: "",
    })),
  });

  useEffect(() => {
    const data = localStorage.getItem("inspecciones_pv");
    if (data) setInspecciones(JSON.parse(data));
  }, []);

  useEffect(() => {
    localStorage.setItem("inspecciones_pv", JSON.stringify(inspecciones));
  }, [inspecciones]);

  const actualizarChecklist = (i, campo, valor) => {
    const nuevo = [...form.checklist];
    nuevo[i][campo] = valor;
    setForm({ ...form, checklist: nuevo });
  };

  const guardar = () => {
    setInspecciones([...inspecciones, { ...form, id: Date.now() }]);
    setPaso(1);
  };

  const resumen = form.checklist.filter(i => i.estado !== "OK");

  return (
    <div style={{ maxWidth: 700, margin: "auto", fontFamily: "Arial" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Proyecto SIGMA Repsol</h2>
        <div style={{ border: "1px dashed gray", padding: 10 }}>LOGO</div>
      </div>

      {paso === 1 && (
        <>
          <h3>Paso 1 – Datos generales</h3>

          <input
            type="date"
            value={form.fecha}
            onChange={e => setForm({ ...form, fecha: e.target.value })}
          /><br /><br />

          <input
            placeholder="Supervisor"
            value={form.supervisor}
            onChange={e => setForm({ ...form, supervisor: e.target.value })}
          /><br /><br />

          {["mecanica", "electrica", "civil"].map(t => (
            <button
              key={t}
              style={{
                marginRight: 5,
                background: form.tipo === t ? "#0f766e" : "#ccc",
                color: form.tipo === t ? "white" : "black"
              }}
              onClick={() => setForm({ ...form, tipo: t })}
            >
              {t}
            </button>
          ))}<br /><br />

          <input
            placeholder="Zona"
            value={form.zona}
            onChange={e => setForm({ ...form, zona: e.target.value })}
          /><br /><br />

          <input
            placeholder="Equipo"
            value={form.equipo}
            onChange={e => setForm({ ...form, equipo: e.target.value })}
          /><br /><br />

          <button
            disabled={!form.fecha || !form.supervisor || !form.zona || !form.equipo}
            onClick={() => setPaso(2)}
          >
            Siguiente
          </button>
        </>
      )}

      {paso === 2 && (
        <>
          <h3>Paso 2 – Checklist mecánico</h3>

          {form.checklist.map((i, idx) => (
            <div key={idx} style={{ border: "1px solid #ccc", marginBottom: 6, padding: 6 }}>
              <b>{i.nombre}</b><br />
              <select
                value={i.estado}
                onChange={e => actualizarChecklist(idx, "estado", e.target.value)}
              >
                <option>OK</option>
                <option>Observación</option>
                <option>Crítico</option>
              </select><br />
              <textarea
                placeholder="Observación"
                value={i.observacion}
                onChange={e => actualizarChecklist(idx, "observacion", e.target.value)}
              />
            </div>
          ))}

          <button onClick={() => setPaso(1)}>Volver</button>
          <button onClick={() => setPaso(3)} style={{ marginLeft: 8 }}>Siguiente</button>
        </>
      )}

      {paso === 3 && (
        <>
          <h3>Paso 3 – Evidencias y cierre</h3>

          <textarea
            placeholder="Observación final"
            value={form.observacionFinal}
            onChange={e => setForm({ ...form, observacionFinal: e.target.value })}
          /><br /><br />

          {resumen.length > 0 ? (
            <>
              <h4>Resumen</h4>
              {resumen.map((i, idx) => (
                <div key={idx}>{i.estado}: {i.nombre}</div>
              ))}
            </>
          ) : (
            <p>Sin incidencias detectadas</p>
          )}

          <br /> {/* ← ESTA es la línea de separación */}

          <button onClick={() => setPaso(2)}>Volver</button>
          <button onClick={guardar} style={{ marginLeft: 8 }}>
            Guardar inspección
          </button>
        </>
      )}
    </div>
  );
}