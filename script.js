// IndexedDB für bessere Performance
const DB_NAME = 'TimeTrackingDB';
const DB_VERSION = 2; // Version erhöht für PWA
const STORE_NAME = 'timeEntries';
let db;
let timeEntries = [];
let backupTimestamps = JSON.parse(localStorage.getItem('backupTimestamps') || '[]');
let deferredPrompt;
let totalOvertimeMinutes = parseInt(localStorage.getItem('totalOvertimeMinutes') || 0);

// DOM-Elemente
const addEntryBtn = document.getElementById('add-entry-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const exportBackupBtn = document.getElementById('export-backup-btn');
const importBackupBtn = document.getElementById('import-backup-btn');
const importFile = document.getElementById('import-file');
const tbody = document.querySelector('#time-entries tbody');
const monthInput = document.getElementById('month');
const reportTitle = document.getElementById('report-title');
const themeToggle = document.getElementById('theme-toggle');
const typeSelect = document.getElementById('type');
const timeRangeDiv = document.getElementById('time-range');
const addTimeRangeBtn = document.getElementById('add-time-range-btn');
const workHoursInput = document.getElementById('work-hours');
const vacationDaysInput = document.getElementById('vacation-days-year');
const carryoverDaysInput = document.getElementById('carryover-days');
const installBtn = document.getElementById('install-btn');
const overtimeDisplay = document.getElementById('overtime');
const vacationDaysDisplay = document.getElementById('vacation-days');
const sickDaysDisplay = document.getElementById('sick-days');
const timeFields = document.querySelectorAll('#time-fields');
const overtimeAmount = document.getElementById('overtime-amount');
const dateInput = document.getElementById('date');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const yearElement = document.getElementById('year');

// Speichere Urlaubstage und Resturlaub pro Jahr
let vacationSettings = JSON.parse(localStorage.getItem('vacationSettings')) || {};

// Initialisierung
document.addEventListener('DOMContentLoaded', async () => {
  // Event-Listener für Backup-Import
  document.getElementById('import-backup-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', handleImport);
  await initDB();
  const now = new Date();
  document.getElementById('date').valueAsDate = now;
  monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Lade die Werte aus localStorage
  workHoursInput.value = localStorage.getItem('workHours') || 8;
  vacationDaysInput.value = localStorage.getItem('vacationDays') || 24;
  carryoverDaysInput.value = localStorage.getItem('carryoverDays') || 0;
  
  // Event-Listener für die Eingabefelder
  workHoursInput.addEventListener('change', () => {
    localStorage.setItem('workHours', workHoursInput.value);
    renderEntries();
  });
  
  vacationDaysInput.addEventListener('change', () => {
    localStorage.setItem('vacationDays', vacationDaysInput.value);
    renderEntries();
  });
  
  carryoverDaysInput.addEventListener('change', () => {
    localStorage.setItem('carryoverDays', carryoverDaysInput.value);
    renderEntries();
  });
  
  loadEntries();
  checkBackupReminder();

  // Theme aus localStorage laden
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Event-Listener initialisieren
  addEntryBtn.addEventListener('click', addTimeEntry);
  exportCsvBtn.addEventListener('click', exportCSV);
  exportPdfBtn.addEventListener('click', exportPDF);
  exportBackupBtn.addEventListener('click', exportBackup);
  importFile.addEventListener('change', handleImport);
  installBtn.addEventListener('click', () => deferredPrompt.prompt());
  themeToggle.addEventListener('click', toggleTheme);
  typeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    const showRange = ['Urlaub', 'Krank', 'Feiertag'].includes(type);
    timeRangeDiv.style.display = showRange ? 'block' : 'none';
    
    // Zeige/verstecke Überstundenfeld
    const showOvertime = type === 'Frei Überstunden';
    document.getElementById('overtime-field').style.display = showOvertime ? 'block' : 'none';
    
    // Verstecke Zeitfelder bei "Frei Überstunden"
    timeFields.forEach(field => {
      field.style.display = showOvertime ? 'none' : 'block';
    });
  });
  addTimeRangeBtn.addEventListener('click', addTimeRange);
  monthInput.addEventListener('change', loadEntries);

  // Install Button anzeigen, wenn PWA installierbar
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'flex';
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installBtn.style.display = 'none';
    }
    deferredPrompt = null;
  });

  // Prüfen ob im Standalone-Modus (installierte PWA)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('Running as PWA');
  }

  // Service Worker registrieren
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
      console.log('Service Worker registriert');
    } catch (error) {
      console.error('Service Worker Registrierung fehlgeschlagen:', error);
    }
  }
});

// Event Listener sind bereits in DOMContentLoaded initialisiert

// Automatisches Backup
function autoBackup() {
  const data = {
    entries: timeEntries,
    settings: {
      workHours: localStorage.getItem('workHours') || 8,
      vacationDays: localStorage.getItem('vacationDays') || 24,
      carryoverDays: localStorage.getItem('carryoverDays') || 0,
      totalOvertimeMinutes: totalOvertimeMinutes
    },
    exported: new Date().toISOString()
  };
  
  // Speichere Backup im localStorage
  const backupKey = `backup_${new Date().getTime()}`;
  localStorage.setItem(backupKey, JSON.stringify(data));
  
  // Behalte nur die letzten 2 Backups
  const backupKeys = Object.keys(localStorage)
    .filter(key => key.startsWith('backup_'))
    .sort((a, b) => b.split('_')[1] - a.split('_')[1]);
  
  if (backupKeys.length > 2) {
    localStorage.removeItem(backupKeys[2]);
  }
}

// IndexedDB Initialisierung
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      // Lade vorhandene Backups
      const backupKeys = Object.keys(localStorage)
        .filter(key => key.startsWith('backup_'))
        .sort((a, b) => b.split('_')[1] - a.split('_')[1]);
      
      if (backupKeys.length > 0) {
        const latestBackup = JSON.parse(localStorage.getItem(backupKeys[0]));
        if (latestBackup.entries) {
          timeEntries = latestBackup.entries;
          localStorage.setItem('workHours', latestBackup.settings.workHours);
          localStorage.setItem('vacationDays', latestBackup.settings.vacationDays);
          localStorage.setItem('carryoverDays', latestBackup.settings.carryoverDays);
          totalOvertimeMinutes = latestBackup.settings.totalOvertimeMinutes;
        }
      }
      resolve();
    };

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      // Versuche Backup zu laden
      const backupKeys = Object.keys(localStorage)
        .filter(key => key.startsWith('backup_'))
        .sort((a, b) => b.split('_')[1] - a.split('_')[1]);
      
      if (backupKeys.length > 0) {
        const latestBackup = JSON.parse(localStorage.getItem(backupKeys[0]));
        if (latestBackup.entries) {
          timeEntries = latestBackup.entries;
          localStorage.setItem('workHours', latestBackup.settings.workHours);
          localStorage.setItem('vacationDays', latestBackup.settings.vacationDays);
          localStorage.setItem('carryoverDays', latestBackup.settings.carryoverDays);
          totalOvertimeMinutes = latestBackup.settings.totalOvertimeMinutes;
        }
      }
      resolve();
      // Fallback zu localStorage
      timeEntries = JSON.parse(localStorage.getItem('timeEntries') || '[]');
      totalOvertimeMinutes = parseInt(localStorage.getItem('totalOvertimeMinutes') || 0);
      resolve();
    };
  });
}

// Daten in IndexedDB speichern
function saveEntry(entry) {
  return new Promise((resolve, reject) => {
    if (!db) {
      // Fallback zu localStorage
      timeEntries.push(entry);
      localStorage.setItem('timeEntries', JSON.stringify(timeEntries));
      resolve();
      return;
    }

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(entry);

    request.onsuccess = () => {
  autoBackup();
  resolve();
};
    request.onerror = (event) => {
      console.error('Error saving entry:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Daten aus IndexedDB laden
function loadEntries() {
  if (!db) {
    // Fallback zu localStorage
    timeEntries = JSON.parse(localStorage.getItem('timeEntries') || '[]');
    renderEntries();
    return;
  }

  const transaction = db.transaction([STORE_NAME], 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  const request = store.getAll();

  request.onsuccess = () => {
    timeEntries = request.result;
    renderEntries();
  };

  request.onerror = (event) => {
    console.error('Error loading entries:', event.target.error);
    // Fallback zu localStorage
    timeEntries = JSON.parse(localStorage.getItem('timeEntries') || '[]');
    renderEntries();
  };
}

// Einträge rendern
function renderEntries() {
  tbody.innerHTML = '';
  let monthlyOvertimeMinutes = 0;
  let vacationDaysTaken = 0;
  let sickDaysTaken = 0;
  let holidayDaysTaken = 0;

  const selectedMonth = monthInput.value;
  const [year, month] = selectedMonth.split("-");
  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                     'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  reportTitle.textContent = `Monatsreport ${monthNames[parseInt(month)-1]} ${year}`;

  const entries = timeEntries
    .filter(e => e.date && e.date.startsWith(selectedMonth))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Zähle Urlaubstage für das aktuelle Jahr
  const yearlyEntries = timeEntries.filter(e => e.date && e.date.startsWith(`${year}-`));
  const yearlyVacationDays = yearlyEntries.filter(e => e.type === 'Urlaub').length;
  
  // Berechne verfügbare Urlaubstage
  const annualVacationDays = parseInt(vacationDaysInput.value || 24);
  const carryoverDays = parseInt(carryoverDaysInput.value || 0);
  const totalVacationDays = annualVacationDays + carryoverDays;
  let availableVacationDays = totalVacationDays - yearlyVacationDays;
  
  // Speichere die aktuellen Einstellungen
  const currentSettings = {
    vacationDays: vacationDaysInput.value,
    carryoverDays: carryoverDaysInput.value
  };
  
  vacationSettings[year] = currentSettings;
  localStorage.setItem('vacationSettings', JSON.stringify(vacationSettings));
  
  // Setze die Werte in die Eingabefelder
  workHoursInput.value = localStorage.getItem('workHours') || workHoursInput.value;
  vacationDaysInput.value = currentSettings.vacationDays;
  carryoverDaysInput.value = currentSettings.carryoverDays;

  // Zähle Urlaubstage für das aktuelle Jahr
  const currentYearEntries = timeEntries.filter(e => e.date && e.date.startsWith(`${year}-`));
  vacationDaysTaken = currentYearEntries.filter(e => e.type === 'Urlaub').length;
  sickDaysTaken = currentYearEntries.filter(e => e.type === 'Krank').length;
  holidayDaysTaken = currentYearEntries.filter(e => e.type === 'Feiertag').length;

  // Aktualisiere die Statistik
  updateStats(totalOvertimeMinutes, vacationDaysTaken, availableVacationDays, sickDaysTaken, holidayDaysTaken);

  entries.forEach(entry => {
    const row = tbody.insertRow();
    row.insertCell(0).textContent = formatDate(entry.date);
    row.insertCell(1).textContent = entry.type === 'Arbeit' ? entry.start || '-' : '-';
    row.insertCell(2).textContent = entry.type === 'Arbeit' ? entry.end || '-' : '-';
    row.insertCell(3).textContent = entry.type === 'Arbeit' ? entry.pause || 0 : '-';
    row.insertCell(4).textContent = entry.type === 'Frei Überstunden' ? 'Frei Überstd.' : entry.type;
    // Iststunden für Urlaub/Krank/Feiertag setzen
    const workHours = parseFloat(localStorage.getItem('workHours') || 8);
    const istHours = entry.type === 'Arbeit' ? entry.hours : entry.type !== 'Überstunden' ? `${Math.floor(workHours)}:${String(Math.round((workHours % 1) * 60)).padStart(2, '0')}` : '0:00';
    row.insertCell(5).textContent = istHours;

    let istMin = 0;
    if (entry.type === 'Arbeit') {
      const [h, m] = (entry.hours || '0:00').split(":").map(Number);
      istMin = h * 60 + m;
      const sollMin = entry.sollHours ? entry.sollHours * 60 : parseFloat(localStorage.getItem('workHours') || 8) * 60;
      monthlyOvertimeMinutes += istMin - sollMin;
    } else if (entry.type === 'Überstunden') {
      const [h, m] = (entry.hours || '0:00').split(":").map(Number);
      istMin = h * 60 + m;
      monthlyOvertimeMinutes += istMin;
    } else if (entry.type === 'Überstundenfrei') {
      const [h, m] = (entry.hours || '0:00').split(":").map(Number);
      istMin = h * 60 + m;
      monthlyOvertimeMinutes -= istMin;
    } else {
      istMin = workHours * 60;
      monthlyOvertimeMinutes += istMin - (workHours * 60);
    }

    const sollHours = parseFloat(localStorage.getItem('workHours') || 8);
    row.insertCell(6).textContent = `${Math.floor(sollHours)}:${String(Math.round((sollHours % 1) * 60)).padStart(2, '0')}`;

    let diff = '';
    if (entry.type === 'Arbeit') {
      const [h, m] = (entry.hours || '0:00').split(":").map(Number);
      const istMin = h * 60 + m;
      const sollMin = sollHours * 60;
      const diffMin = istMin - sollMin;
      const sign = diffMin < 0 ? '-' : '';
      diff = `${sign}${Math.floor(Math.abs(diffMin) / 60)}:${String(Math.abs(diffMin) % 60).padStart(2, '0')}`;
    } else if (entry.type !== 'Überstunden') {
      diff = '0:00';
    }

    row.insertCell(7).textContent = diff;

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Löschen';
    deleteBtn.className = 'delete';
    deleteBtn.onclick = () => deleteEntry(entry.id);
    row.insertCell(8).appendChild(deleteBtn);
  });

  // Gesamtüberstunden berechnen
  totalOvertimeMinutes = monthlyOvertimeMinutes;
  timeEntries.forEach(entry => {
    if (entry.type === 'Arbeit') {
      const [h, m] = (entry.hours || '0:00').split(":").map(Number);
      const istMin = h * 60 + m;
      const sollMin = entry.sollHours ? entry.sollHours * 60 : parseFloat(localStorage.getItem('workHours') || 8) * 60;
      totalOvertimeMinutes += istMin - sollMin;
    } else if (entry.type === 'Überstundenfrei') {
      const [h, m] = (entry.hours || '0:00').split(":").map(Number);
      const istMin = h * 60 + m;
      totalOvertimeMinutes -= istMin;
    }
  });
  
  localStorage.setItem('totalOvertimeMinutes', totalOvertimeMinutes);
  
  // Überstunden anzeigen (immer mit Minus)
  const oh = Math.floor(Math.abs(totalOvertimeMinutes) / 60);
  const om = Math.abs(totalOvertimeMinutes) % 60;
  const sign = totalOvertimeMinutes >= 0 ? '' : '-';
  overtimeDisplay.textContent = `${sign}${oh}:${String(om).padStart(2, '0')}`;
  
  updateStats(totalOvertimeMinutes, vacationDaysTaken, availableVacationDays, sickDaysTaken, holidayDaysTaken);
}

// Eintrag löschen
function deleteEntry(id) {
  if (!confirm("Eintrag wirklich löschen?")) return;

  if (!db) {
    // Fallback zu localStorage
    const deletedEntry = timeEntries.find(e => e.id === id);
    if (deletedEntry && deletedEntry.type === 'Arbeit' && deletedEntry.hours) {
      const [h, m] = deletedEntry.hours.split(':').map(Number);
      totalOvertimeMinutes -= (h * 60 + m) - (deletedEntry.sollHours ? deletedEntry.sollHours * 60 : parseFloat(localStorage.getItem('workHours') || 8) * 60);
      localStorage.setItem('totalOvertimeMinutes', totalOvertimeMinutes);
    }
    timeEntries = timeEntries.filter(e => e.id !== id);
    localStorage.setItem('timeEntries', JSON.stringify(timeEntries));
    loadEntries();
    return;
  }

  const transaction = db.transaction([STORE_NAME], 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  const getRequest = store.get(id);

  getRequest.onsuccess = () => {
    const deletedEntry = getRequest.result;
    const deleteRequest = store.delete(id);
    deleteRequest.onsuccess = () => {
      timeEntries = timeEntries.filter(e => e.id !== id);
      // Überstunden nach erfolgreichem Löschen anpassen
      if (deletedEntry && deletedEntry.type === 'Arbeit' && deletedEntry.hours) {
        const [h, m] = deletedEntry.hours.split(':').map(Number);
        totalOvertimeMinutes -= (h * 60 + m) - (deletedEntry.sollHours ? deletedEntry.sollHours * 60 : parseFloat(localStorage.getItem('workHours') || 8) * 60);
        localStorage.setItem('totalOvertimeMinutes', totalOvertimeMinutes);
      }
      loadEntries();
    };
    deleteRequest.onerror = (event) => {
      console.error('Error deleting entry:', event.target.error);
    };
  };

  getRequest.onerror = (event) => {
    console.error('Error getting entry for deletion:', event.target.error);
  };
}

// Eintrag hinzufügen
async function addTimeEntry() {
  try {
    const date = document.getElementById('date').value;
    const type = document.getElementById('type').value;
    const sollHours = parseFloat(workHoursInput.value);

    if (!date) {
      alert('Bitte Datum ausfüllen.');
      return;
    }

    // Prüfen auf doppelten Eintrag
    const existingEntry = timeEntries.find(e => e.date === date);
    if (existingEntry) {
      if (!confirm("Für dieses Datum existiert bereits ein Eintrag. Überschreiben?")) return;
      await deleteEntry(existingEntry.id);
    }

    // Validierung der Zeiten
    if (type === 'Arbeit') {
      const start = document.getElementById('start-time').value;
      const end = document.getElementById('end-time').value;
      const pause = parseInt(document.getElementById('break').value) || 0;

      if (!start || !end) {
        alert('Bitte Start- und Endzeit für Arbeitstage ausfüllen.');
        return;
      }

      if (!isValidTime(start) || !isValidTime(end)) {
        alert('Ungültige Zeitangabe. Bitte im Format HH:MM eingeben (z.B. 08:30).');
        return;
      }

      const startDate = new Date(`${date}T${start}`);
      const endDate = new Date(`${date}T${end}`);
      const diff = (endDate - startDate) / 60000 - pause;

      if (diff <= 0) {
        alert('Endzeit muss nach Startzeit liegen.');
        return;
      }

      if (diff > 16 * 60) {
        if (!confirm(`Arbeitszeit von ${Math.floor(diff/60)} Stunden und ${Math.round(diff%60)} Minuten ist sehr lang. Trotzdem speichern?`)) {
          return;
        }
      }

      const h = Math.floor(diff / 60);
      const m = Math.round(diff % 60);
      const entry = {
        date,
        type,
        hours: `${h}:${m.toString().padStart(2, '0')}`,
        start,
        end,
        pause,
        sollHours: sollHours
      };

      await saveEntry(entry);
      loadEntries();
      resetForm();
      return;
    }

    if (type === 'Frei Überstunden') {
      const value = overtimeAmount.value.trim();
      
      // Validiere das Format HH:MM
      const timeRegex = /^([0-9]{1,2}):([0-5][0-9])$/;
      if (!timeRegex.test(value)) {
        alert('Bitte die Überstundenmenge im Format HH:MM eingeben (z.B. 8:30).');
        return;
      }

      const [hours, minutes] = value.split(':').map(Number);
      if (hours <= 0 && minutes <= 0) {
        alert('Die Überstundenmenge muss größer als 0 sein.');
        return;
      }

      const entry = {
        date,
        type,
        hours: value,
        start: '',
        end: '',
        pause: 0,
        sollHours: sollHours
      };

      await saveEntry(entry);
      loadEntries();
      resetForm();
      return;
    }

    // Für Urlaub, Krank, Feiertag
    const entry = {
      date,
      type,
      hours: '0:00',
      start: '',
      end: '',
      pause: 0,
      sollHours: sollHours
    };

    await saveEntry(entry);
    loadEntries();
    resetForm();
    typeSelect.value = 'Arbeit';
    return;
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Eintrags:', error);
    alert('Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.');
  }
}

// Zeitraum hinzufügen (für Urlaub/Krank/Feiertag)
async function addTimeRange() {
  const startDate = document.getElementById('date').value;
  const endDate = document.getElementById('end-date').value;
  const type = document.getElementById('type').value;
  const workHoursInput = { value: '0' }; // Annahme: workHoursInput wird für diesen Fall nicht benötigt

  if (!startDate || !endDate) {
    alert('Bitte Start- und Enddatum ausfüllen.');
    return;
  }

  if (new Date(endDate) < new Date(startDate)) {
    alert('Enddatum muss nach Startdatum liegen.');
    return;
  }

  if (!confirm(`${type}-Zeitraum vom ${formatDate(startDate)} bis ${formatDate(endDate)} hinzufügen?`)) {
    return;
  }

  const currentDate = new Date(startDate);
  const end = new Date(endDate);

  // Prüfen auf bestehende Einträge im Zeitraum
  const existingEntries = timeEntries.filter(e => {
    const entryDate = new Date(e.date);
    return entryDate >= currentDate && entryDate <= end;
  });

  if (existingEntries.length > 0) {
    if (!confirm(`${existingEntries.length} bestehende Einträge im Zeitraum werden überschrieben. Fortfahren?`)) {
      return;
    }
    // Lösche bestehende Einträge
    for (const entry of existingEntries) {
      await deleteEntry(entry.id);
    }
  }

  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const entry = {
      date: dateStr,
      type,
      hours: type === 'Frei Überstunden' ? '0:00' : '0:00',
      sollHours: parseFloat(workHoursInput.value)
    };

    try {
      await saveEntry(entry);
    } catch (error) {
      console.error('Fehler beim Speichern des Eintrags im Zeitraum:', error);
      alert(`Fehler beim Speichern eines Eintrags im Zeitraum: ${error.message}.`);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Nach dem Hinzufügen des Zeitraums die Einträge neu laden und sortieren
  loadEntries();
  resetForm();
  timeRangeDiv.style.display = 'none';
}

// Formular zurücksetzen
function resetForm() {
  document.getElementById('start-time').value = '';
  document.getElementById('end-time').value = '';
  document.getElementById('break').value = '30';
  document.getElementById('type').value = 'Arbeit';
  const nextDay = new Date(new Date(document.getElementById('date').value).getTime() + 86400000);
  document.getElementById('date').valueAsDate = new Date(nextDay);
  document.getElementById('end-date').value = '';
}

// Statistik aktualisieren
function updateStats(overtimeMinutes, vacationTaken, vacationTotal, sickDays) {
  const oh = Math.floor(Math.abs(overtimeMinutes) / 60);
  const om = Math.abs(overtimeMinutes) % 60;
  const sign = overtimeMinutes < 0 ? "-" : "";
  overtimeDisplay.textContent = `${sign}${oh}:${String(om).padStart(2, '0')}`;

  // Verbleibende Urlaubstage
  const remainingVacation = vacationTotal - vacationTaken;
  const carryoverDays = parseInt(carryoverDaysInput.value) || 0;
  
  vacationDaysDisplay.textContent = `${vacationTaken} Tage (verfügbar: ${vacationTotal}, Resturlaub: ${carryoverDays})`;

  sickDaysDisplay.textContent = `${sickDays} Tage`;
}

// Theme umschalten
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// CSV Export
function exportCSV() {
  const selectedMonth = monthInput.value;
  const [year, month] = selectedMonth.split("-");
  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                     'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Einträge filtern und nach Datum sortieren
  const entries = timeEntries
    .filter(e => e.date && e.date.startsWith(selectedMonth))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (entries.length === 0) return alert('Keine Daten vorhanden.');

  // Gesamtzeiten berechnen
  let totalSoll = 0;
  let totalIst = 0;
  entries.forEach(e => {
    // Sollstunden berechnen
    const sollHours = parseFloat(localStorage.getItem('workHours') || 8);
    totalSoll += e.type === 'Überstunden' ? 0 : sollHours;
    
    // Iststunden berechnen
    if (e.type === 'Arbeit') {
      if (e.hours) {
        const [hours, minutes] = e.hours.split(':').map(Number);
        totalIst += hours + minutes/60;
      }
    } else if (e.type !== 'Überstunden') {
      totalIst += sollHours;
    }
  });

  // CSV-Header
  let csv = `Monatsreport ${monthNames[parseInt(month)-1]} ${year}\nDatum;Kommen;Gehen;Pause;Art;Stunden;Sollstunden;Differenz\n`;

  // Gesamtstunden berechnen
  let totalIstMin = 0;
  let totalSollMin = 0;
  entries.forEach(e => {
    // Sollstunden
    const sollHours = parseFloat(localStorage.getItem('workHours') || 8);
    const sollTime = `${Math.floor(sollHours)}:${String(Math.round((sollHours % 1) * 60)).padStart(2, '0')}`;
    
    // Iststunden
    const workHours = parseFloat(localStorage.getItem('workHours') || 8);
    let istHours = e.type === 'Arbeit' ? e.hours : e.type !== 'Überstunden' ? `${Math.floor(workHours)}:${String(Math.round((workHours % 1) * 60)).padStart(2, '0')}` : '0:00';
    
    // Differenz berechnen
    let diff = '';
    if (e.type === 'Arbeit' && e.hours) {
      const [h, m] = e.hours.split(":").map(Number);
      const istMin = h * 60 + m;
      const sollMin = sollHours * 60;
      const diffMin = istMin - sollMin;
      const sign = diffMin < 0 ? '-' : '';
      diff = `${sign}${Math.floor(Math.abs(diffMin) / 60)}:${String(Math.abs(diffMin) % 60).padStart(2, '0')}`;
      totalIstMin += istMin;
      totalSollMin += sollMin;
    } else if (e.type !== 'Überstunden') {
      diff = '0:00';
      totalIstMin += workHours * 60;
      totalSollMin += workHours * 60;
    }

    csv += `${formatDate(e.date)};${e.type === 'Arbeit' ? e.start || '' : ''};${e.type === 'Arbeit' ? e.end || '' : ''};${e.type === 'Arbeit' ? e.pause : ''};${e.type};${istHours};${sollTime};${diff}\n`;
  });

  // Gesamtstunden hinzufügen
  const totalIstHours = Math.floor(totalIstMin / 60);
  const totalIstMinutes = totalIstMin % 60;
  const totalSollHours = Math.floor(totalSollMin / 60);
  const totalSollMinutes = totalSollMin % 60;
  const totalDiffMin = totalIstMin - totalSollMin;
  const totalDiffHours = Math.floor(Math.abs(totalDiffMin) / 60);
  const totalDiffMinutes = Math.abs(totalDiffMin) % 60;
  const sign = totalDiffMin < 0 ? '-' : '';
  csv += `\nGesamtstunden;_;_;_;_;${totalIstHours}:${totalIstMinutes.padStart(2, '0')};${totalSollHours}:${totalSollMinutes.padStart(2, '0')};${sign}${totalDiffHours}:${totalDiffMinutes.padStart(2, '0')}`;

  // Gesamtzeiten unter den Spalten hinzufügen
  csv += `\n;_;_;_;_;_;${Math.floor(totalSoll)}:${String(Math.round((totalSoll % 1) * 60)).padStart(2, '0')};${Math.floor(totalIst)}:${String(Math.round((totalIst % 1) * 60)).padStart(2, '0')};_`;
  
  // Zusatzinformationen
  const vacationDays = parseInt(localStorage.getItem('vacationDays') || 24);
  const carryoverDays = parseInt(localStorage.getItem('carryoverDays') || 0);
  const vacationTotal = vacationDays + carryoverDays;
  const vacationTaken = entries.filter(e => e.type === 'Urlaub').length;
  const sickDays = entries.filter(e => e.type === 'Krank').length;

  // Überstunden berechnen
  const overtimeMinutes = (totalIst - totalSoll) * 60;
  const overtime = `${Math.floor(Math.abs(overtimeMinutes) / 60)}:${String(Math.abs(overtimeMinutes) % 60).padStart(2, '0')}`;

  csv += `\nÜberstunden:;${overtime}\nUrlaub:;${vacationTaken} Tage (verfügbar: ${vacationTotal}, Resturlaub: ${carryoverDays})\nKrankheitstage:;${sickDays}`;

  download(`Monatsreport_${monthNames[parseInt(month)-1]}_${year}.csv`, csv, 'text/csv');
}

// PDF Export
function exportPDF() {
  const selectedMonth = monthInput.value;
  const [year, month] = selectedMonth.split("-");
  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                     'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Einträge filtern und nach Datum sortieren
  const entries = timeEntries
    .filter(e => e.date && e.date.startsWith(selectedMonth))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (entries.length === 0) {
    alert('Keine Einträge für den ausgewählten Monat vorhanden!');
    return;
  }

  try {
    const doc = new window.jspdf.jsPDF('portrait');

    // Titel
    doc.setFontSize(16);
    doc.text(`Monatsreport ${monthNames[parseInt(month)-1]} ${year}`, 105, 15, { align: 'center' });

    // Tabellenkopf
    const headers = ["Datum", "Kommen", "Gehen", "Pause", "Art", "Stunden", "Sollstunden", "Differenz"];
    let data = [];

    // Gesamtzeiten berechnen
    let totalSoll = 0;
    let totalIst = 0;
    entries.forEach(e => {
      const sollHours = parseFloat(localStorage.getItem('workHours') || 8);
      totalSoll += e.type === 'Überstunden' ? 0 : sollHours;
      
      if (e.type === 'Arbeit') {
        if (e.hours) {
          const [hours, minutes] = e.hours.split(':').map(Number);
          totalIst += hours + minutes/60;
        }
      } else if (e.type !== 'Überstunden') {
        totalIst += sollHours;
      }
    });

    // Tabellendaten
    entries.forEach(e => {
      const sollHours = parseFloat(localStorage.getItem('workHours') || 8);
      const sollTime = `${Math.floor(sollHours)}:${String(Math.round((sollHours % 1) * 60)).padStart(2, '0')}`;
      
      let istTime = '0:00';
      if (e.type === 'Arbeit' && e.hours) {
        istTime = e.hours;
      } else if (e.type !== 'Überstunden') {
        istTime = sollTime;
      }
      
      let diff = '';
      if (e.type === 'Arbeit' && e.hours) {
        const [h, m] = e.hours.split(":").map(Number);
        const istMin = h * 60 + m;
        const sollMin = sollHours * 60;
        const diffMin = istMin - sollMin;
        const sign = diffMin < 0 ? '-' : '';
        diff = `${sign}${Math.floor(Math.abs(diffMin) / 60)}:${String(Math.abs(diffMin) % 60).padStart(2, '0')}`;
      }

      data.push([
        formatDate(e.date),
        e.type === 'Arbeit' ? e.start || '-' : '-',
        e.type === 'Arbeit' ? e.end || '-' : '-',
        e.type === 'Arbeit' ? e.pause || '0' : '-',
        e.type,
        istTime,
        sollTime,
        diff
      ]);
    });

    // Tabelle erstellen
    doc.autoTable({
      head: [headers],
      body: data,
      startY: 30,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [192, 192, 192] }
    });

    // Gesamtzeiten berechnen
    let totalIstMin = 0;
    let totalSollMin = 0;
    entries.forEach(e => {
      const sollHours = parseFloat(localStorage.getItem('workHours') || 8);
      const sollMin = sollHours * 60;
      
      if (e.type === 'Arbeit' && e.hours) {
        const [h, m] = e.hours.split(':').map(Number);
        const istMin = h * 60 + m;
        totalIstMin += istMin;
        totalSollMin += sollMin;
      } else if (e.type !== 'Überstunden') {
        totalIstMin += sollMin;
        totalSollMin += sollMin;
      }
    });

    // Gesamtzeiten unter den Spalten hinzufügen
    doc.setFontSize(8);
    doc.autoTable({
      head: [["", "", "", "", "", `${Math.floor(totalSollMin / 60)}:${String(totalSollMin % 60).padStart(2, '0')}`, `${Math.floor(totalIstMin / 60)}:${String(totalIstMin % 60).padStart(2, '0')}`, ""]],
      startY: doc.lastAutoTable.finalY + 5,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [255, 255, 255] }
    });

    // Differenz berechnen
    const diffMin = totalIstMin - totalSollMin;
    const diffHours = Math.floor(Math.abs(diffMin) / 60);
    const diffMinutes = Math.abs(diffMin) % 60;
    const sign = diffMin < 0 ? '-' : '';
    const diff = `${sign}${diffHours}:${String(diffMinutes).padStart(2, '0')}`;

    // Überstunden berechnen
    const overtimeMinutes = (totalIstMin - totalSollMin) * 60;
    const overtime = `${Math.floor(Math.abs(overtimeMinutes) / 60)}:${String(Math.abs(overtimeMinutes) % 60).padStart(2, '0')}`;

    // Zusatzinformationen hinzufügen
    const vacationDays = parseInt(localStorage.getItem('vacationDays') || 24);
    const carryoverDays = parseInt(localStorage.getItem('carryoverDays') || 0);
    const vacationTotal = vacationDays + carryoverDays;
    const vacationTaken = entries.filter(e => e.type === 'Urlaub').length;
    const sickDays = entries.filter(e => e.type === 'Krank').length;

    doc.setFontSize(8);
    doc.text(`Gesamtstunden: ${Math.floor(totalIstMin / 60)}:${String(totalIstMin % 60).padStart(2, '0')}`, 10, doc.lastAutoTable.finalY + 10);
    doc.text(`Sollstunden: ${Math.floor(totalSollMin / 60)}:${String(totalSollMin % 60).padStart(2, '0')}`, 10, doc.lastAutoTable.finalY + 15);
    doc.text(`Differenz: ${diff}`, 10, doc.lastAutoTable.finalY + 20);
    doc.text(`Überstunden: ${overtime}`, 10, doc.lastAutoTable.finalY + 25);
    doc.text(`Urlaubstage: ${vacationTaken} Tage (verfügbar: ${vacationTotal}, Resturlaub: ${carryoverDays})`, 10, doc.lastAutoTable.finalY + 30);
    doc.text(`Krankheitstage: ${sickDays}`, 10, doc.lastAutoTable.finalY + 35);

    // PDF speichern
    doc.save(`Monatsreport_${monthNames[parseInt(month)-1]}_${year}.pdf`);
  } catch (error) {
    console.error('Fehler beim PDF-Export:', error);
    alert('Fehler beim Erstellen des PDF-Reports');
  }
}
// Backup exportieren
function exportBackup() {
  const data = {
    entries: timeEntries,
    settings: {
      workHours: localStorage.getItem('workHours') || 8,
      vacationDays: localStorage.getItem('vacationDays') || 24,
      carryoverDays: localStorage.getItem('carryoverDays') || 0,
      totalOvertimeMinutes: totalOvertimeMinutes
    },
    exported: new Date().toISOString()
  };
  const now = new Date().getTime();
  backupTimestamps.push(now);
  while (backupTimestamps.length > 2) backupTimestamps.shift();
  localStorage.setItem('backupTimestamps', JSON.stringify(backupTimestamps));
  download(`backup_zeiterfassung_${now}.json`, JSON.stringify(data, null, 2), 'application/json');
}

// Backup importieren
async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function (event) {
    try {
      const data = JSON.parse(event.target.result);
      if (!Array.isArray(data.entries)) throw new Error('Ungültiges Format');

      if (confirm(`${data.entries.length} Einträge importieren? Vorherige Daten werden überschrieben.`)) {
        if (db) {
          // IndexedDB leeren
          const transaction = db.transaction([STORE_NAME], 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const clearRequest = store.clear();

          clearRequest.onsuccess = async () => {
            // Neue Einträge hinzufügen
            for (const entry of data.entries) {
              await saveEntry(entry);
            }

            // Einstellungen übernehmen
            localStorage.setItem('workHours', data.settings.workHours);
            localStorage.setItem('vacationDays', data.settings.vacationDays);
            localStorage.setItem('carryoverDays', data.settings.carryoverDays);
            totalOvertimeMinutes = data.settings.totalOvertimeMinutes;

            // Neue Einträge laden
            await loadEntries();
            renderEntries();

            alert('Backup erfolgreich importiert!');
          };
        } else {
          // Fallback zu localStorage
          timeEntries = data.entries;
          localStorage.setItem('timeEntries', JSON.stringify(timeEntries));

          if (data.settings) {
            localStorage.setItem('workHours', data.settings.workHours);
            localStorage.setItem('vacationDays', data.settings.vacationDays);
            localStorage.setItem('carryoverDays', data.settings.carryoverDays);
            localStorage.setItem('totalOvertimeMinutes', data.settings.totalOvertimeMinutes);
            document.getElementById('work-hours').value = data.settings.workHours;
            document.getElementById('vacation-days-year').value = data.settings.vacationDays;
            document.getElementById('carryover-days').value = data.settings.carryoverDays;
            totalOvertimeMinutes = data.settings.totalOvertimeMinutes;
          }

          loadEntries();
          alert('Import erfolgreich.');
        }
      }
    } catch (err) {
      alert('Fehler beim Import: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// Hilfsfunktionen
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function isValidTime(time) {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

function download(filename, content, type) {
  const blob = new Blob(["\uFEFF" + content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function checkBackupReminder() {
  const last = backupTimestamps[backupTimestamps.length - 1] || 0;
  const now = new Date().getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  if (now - last > oneWeek) {
    alert("Es ist über eine Woche seit dem letzten Backup vergangen. Bitte speichern Sie ein neues Backup.");
  }
}
