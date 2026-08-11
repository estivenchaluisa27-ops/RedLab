import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { escapeHtml } from '../utils/escape.js';
import { formatDateYYYYMMDD } from '../utils/dates.js';
import { lookupMembersByGroupName } from '../groups/group-utils.js';

let _db = null;
let _state = null;

export function initReports(db, state) {
  _db = db;
  _state = state;
}

export function sortReportData(data) {
  return [...data].sort((a, b) => {
    if (a.Fecha !== b.Fecha) return a.Fecha.localeCompare(b.Fecha);
    if (a.Grupo !== b.Grupo) return a.Grupo.localeCompare(b.Grupo);
    return a.Estudiante.localeCompare(b.Estudiante);
  });
}

export function buildReportRows(reservationsDocs, selectedCourses, coursesCache, groupsMembersCache) {
  const rows = [];

  for (const docSnap of reservationsDocs) {
    const r = docSnap.data();

    if (r.courseId && selectedCourses.includes(r.courseId)) {
      const course = coursesCache[r.courseId] || { subject: 'Desconocido', parallel: '' };
      const courseName = `${course.subject} (${course.parallel})`;
      const members = groupsMembersCache[r.groupName] || [];
      const attendanceDetail = r.attendanceDetail || {};

      if (members.length === 0) {
        rows.push({
          "Fecha": r.date,
          "Hora": `${r.hour}:00 - ${r.hour + 1}:00`,
          "Curso": courseName,
          "Grupo": r.groupName,
          "Cédula": "-",
          "Estudiante": "Sin integrantes en el sistema",
          "Estado Asistencia": "-"
        });
      } else {
        members.forEach(st => {
          let estado = "No Registrada";
          if (attendanceDetail[st.cedula] === true) estado = "Presente";
          else if (attendanceDetail[st.cedula] === false) estado = "Ausente";

          rows.push({
            "Fecha": r.date,
            "Hora": `${r.hour}:00 - ${r.hour + 1}:00`,
            "Curso": courseName,
            "Grupo": r.groupName,
            "Cédula": st.cedula,
            "Estudiante": st.nombre,
            "Estado Asistencia": estado
          });
        });
      }
    }
  }

  return rows;
}

export function setupReportesView() {
  const list = document.getElementById('rep-courses-list');
  if (!list) return;
  list.innerHTML = '';

  list.innerHTML += `
    <label class="flex items-center space-x-2 p-1.5 hover:bg-slate-200 rounded cursor-pointer border-b border-slate-200 mb-1">
      <input type="checkbox" class="rep-toggle-all rounded text-blue-600 w-4 h-4 cursor-pointer">
      <span class="font-bold text-uce-700 text-xs uppercase tracking-wide">Seleccionar Todos</span>
    </label>
  `;

  const toggleAll = list.querySelector('.rep-toggle-all');
  toggleAll.addEventListener('change', (e) => {
    list.querySelectorAll('.rep-course-cb').forEach(cb => cb.checked = e.target.checked);
  });

  if (Object.keys(_state.coursesCache).length === 0) {
    list.innerHTML += `<p class="text-xs text-slate-500 italic p-2 text-center">No hay cursos registrados.</p>`;
  } else {
    for (const [id, course] of Object.entries(_state.coursesCache)) {
      list.innerHTML += `
        <label class="flex items-center space-x-2 p-1.5 hover:bg-white rounded cursor-pointer transition-colors">
          <input type="checkbox" value="${id}" class="rep-course-cb rounded text-blue-600 w-4 h-4 cursor-pointer">
          <span class="text-slate-700 font-medium">${escapeHtml(course.subject)} (${escapeHtml(course.parallel)})</span>
        </label>
      `;
    }
  }

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById('rep-start').value = formatDateYYYYMMDD(firstDay);
  document.getElementById('rep-end').value = formatDateYYYYMMDD(today);
}

export async function executeReport(e) {
  e.preventDefault();

  const startStr = document.getElementById('rep-start').value;
  const endStr = document.getElementById('rep-end').value;

  const checkboxes = document.querySelectorAll('.rep-course-cb:checked');
  if (checkboxes.length === 0) {
    return Swal.fire({ icon: 'warning', text: 'Debes seleccionar al menos un curso para el reporte.', confirmButtonColor: '#004274' });
  }
  const selectedCourses = Array.from(checkboxes).map(cb => cb.value);

  Swal.fire({
    title: 'Generando Reporte de Asistencia...',
    html: 'Recopilando datos de estudiantes...',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const q = query(
      collection(_db, "reservations"),
      where("date", ">=", startStr),
      where("date", "<=", endStr),
      where("status", "==", "approved")
    );

    const snap = await getDocs(q);
    const groupsMembersCache = {};

    for (const docSnap of snap.docs) {
      const r = docSnap.data();
      if (r.courseId && selectedCourses.includes(r.courseId)) {
        const cacheKey = `${r.courseId}_${r.groupName}`;
        if (!groupsMembersCache[cacheKey]) {
          groupsMembersCache[cacheKey] = await lookupMembersByGroupName(_db, r.courseId, r.groupName);
        }
      }
    }

    const reportData = sortReportData(
      buildReportRows(snap.docs, selectedCourses, _state.coursesCache, groupsMembersCache)
    );

    if (reportData.length === 0) {
      return Swal.fire('Sin Datos', 'No hay registros de asistencia para los parámetros seleccionados.', 'info');
    }

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();

    worksheet['!cols'] = [
      { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 12 },
      { wch: 12 }, { wch: 35 }, { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Asistencia");
    XLSX.writeFile(workbook, `Asistencia_RedLab_${startStr}_al_${endStr}.xlsx`);

    Swal.close();
  } catch (error) {
    console.error(error);
    Swal.fire('Error', 'Hubo un problema procesando los datos: ' + error.message, 'error');
  }
}
