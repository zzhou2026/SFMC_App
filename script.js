document.addEventListener('DOMContentLoaded', () => {
    // 替换为您的 Apps Script Web App URL
    const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx7Kk7Fl01-gHgS-cAQYAqIzqhUOVb2HO9liK4FNbXZTacYTwqtDy784-sezU--2xPn/exec';

    const $ = id => document.getElementById(id);
    
    let currentUser = null;
    let configPrices = { BeautyTechEmail: 'zzhou@pcis.lvmh-pc.com', VarianceThreshold: 15 };
    let allUsers = [];
    let searchTerm = '';
    let currentYear = new Date().getFullYear();
    let currentFiscalYear = 2026; // Default to FY2026
    let currentFiscalYearActual = 2026; // For Maison actual view
let currentFiscalYearOperator = 2026; // For Operator view
let actualDataCache = {}; // Cache for actual data
let allMaisons = []; // Store all maison names for operator

    let monthlyDataCache = {}; // Cache for monthly data
    let allMaisonsList = []; // 所有 Maison 列表
    let currentFiscalYearOverview = 2026; 
    let currentFiscalYearActualOverview = 2026; 
    // ===== 工具函数 =====
    const showPage = page => {
        document.querySelectorAll('.page').forEach(p => { p.classList.add('hidden'); p.classList.remove('active'); });
        page.classList.remove('hidden');
        page.classList.add('active');
    };

    const msg = (el, text, ok = false) => {
        el.textContent = text;
        el.className = ok ? 'message success' : 'message';
    };

    const clr = el => { el.textContent = ''; el.className = 'message'; };
    
    const valid = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const fmt = ts => {
        try {
            const d = new Date(ts);
            return isNaN(d) ? ts : d.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return ts; }
    };
// Generate 12 months for a fiscal year (Feb to Jan)
const getFiscalYearMonths = (fiscalYear) => {
    const months = [];
    for (let i = 2; i <= 12; i++) {
        months.push({ year: fiscalYear, month: String(i).padStart(2, '0') });
    }
    months.push({ year: fiscalYear + 1, month: '01' });
    return months;
};

// Format month for display (e.g., "2026-02")
const formatMonth = (year, month) => `${year}-${month}`;

// Get month name
const getMonthName = (month) => {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[parseInt(month) - 1];
};
// === Modal Control Functions ===
const openModal = (year, month, existingData = null) => {
    const modal = $('submissionModal');
    const modalTitle = $('modalTitle');
    
    $('modalYear').value = year;
    $('modalMonth').value = month;
    
    modalTitle.textContent = `${existingData ? 'Update' : 'Submit'} Data for ${formatMonth(year, month)}`;
    
    // Populate form with existing data or clear
    $('modalEmailInput').value = existingData ? existingData.EmailCount : '';
    $('modalSmsInput').value = existingData ? existingData.SMSCount : '';
    $('modalWhatsappInput').value = existingData ? existingData.WhatsAppCount : '';
    $('modalContactsInput').value = existingData ? existingData.ContactsCount : '';
    $('modalNotesInput').value = existingData ? (existingData.MaisonNotes || '') : '';
    
    // Update character count
    const notesLength = $('modalNotesInput').value.length;
    $('modalNotesCharCount').textContent = `${notesLength}/200`;
    
    // Show admin notes if rejected
    if (existingData && existingData.ApprovalStatus === 'Rejected' && existingData.AdminNotes) {
        $('modalAdminNotesSection').classList.remove('hidden');
        $('modalAdminNotesDisplay').textContent = existingData.AdminNotes;
    } else {
        $('modalAdminNotesSection').classList.add('hidden');
    }
    
    // Update submit button text
    $('modalSubmitButton').textContent = existingData ? 'Update' : 'Submit';
    
    modal.classList.remove('hidden');
};

const closeModal = () => {
    const modal = $('submissionModal');
    modal.classList.add('hidden');
    
    // Clear form
    $('modalEmailInput').value = '';
    $('modalSmsInput').value = '';
    $('modalWhatsappInput').value = '';
    $('modalContactsInput').value = '';
    $('modalNotesInput').value = '';
    $('modalNotesCharCount').textContent = '0/200';
    $('modalAdminNotesSection').classList.add('hidden');
};
// === Load All Maisons for Operator ===
const loadAllMaisons = async () => {
    const res = await api('getAllUsers');
    if (res.success && res.data) {
        allMaisons = [...new Set(res.data
            .filter(u => u.maisonName && u.maisonName !== 'BT' && u.maisonName !== 'SFMC')
            .map(u => u.maisonName))];
    }
};

// === 新增：加载所有 Maison 列表（用于 Admin Overview）（添加在这里）===
const loadAllMaisonsForAdmin = async () => {
    const res = await api('getAllMaisons');
    if (res.success && res.data) {
        allMaisonsList = res.data;
        renderMaisonAccordionOverview();  // ← 改成这个
        renderMaisonAccordionActual();     // ← 改成这个
    }
};



// === Render Operator Data Table ===
const renderOperatorDataTable = async () => {
    const tbody = $('operatorDataTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Loading...</td></tr>';
    
    const months = getFiscalYearMonths(currentFiscalYearOperator);
    const res = await api('getAllActualData');
    
    const dataMap = {};
    if (res.success && res.data) {
        res.data.forEach(record => {
            const formattedMonth = String(record.Month).padStart(2, '0');
            const key = `${record.MaisonName}-${record.Year}-${formattedMonth}`;
            dataMap[key] = record;
        });
    }
    
    let html = '';
    allMaisons.forEach(maison => {
        months.forEach(({ year, month }) => {
            const key = `${maison}-${year}-${month}`;
            const existingData = dataMap[key];
            
            const monthDisplay = `${year}-${month}`;
            const emailVal = existingData ? existingData.EmailUsage : '';
            const smsVal = existingData ? existingData.SMSUsage : '';
            const whatsappVal = existingData ? existingData.WhatsAppUsage : '';
            const contactsVal = existingData ? existingData.ContactsTotal : '';
            
            const buttonText = existingData ? 'Update' : 'Submit';
            const buttonClass = existingData ? 'action-button-table update-button' : 'action-button-table';
            
            html += `
                <tr data-maison="${maison}" data-year="${year}" data-month="${month}">
                    <td>${maison}</td>
                    <td class="month-cell">${monthDisplay}</td>
                    <td>${emailVal}</td>
                    <td>${smsVal}</td>
                    <td>${whatsappVal}</td>
                    <td>${contactsVal}</td>
                    <td>
                        <button class="${buttonClass} operator-action-button" 
                                data-maison="${maison}"
                                data-year="${year}" 
                                data-month="${month}"
                                data-has-data="${existingData ? 'true' : 'false'}">
                            ${buttonText}
                        </button>
                    </td>
                </tr>
            `;
        });
    });
    
    tbody.innerHTML = html;
};

// === Open Operator Modal ===
const openOperatorModal = async (maison, year, month) => {
    const modal = $('operatorSubmissionModal');
    const modalTitle = $('operatorModalTitle');
    
    $('operatorModalMaison').value = maison;
    $('operatorModalYear').value = year;
    $('operatorModalMonth').value = month;
    $('operatorModalMaisonDisplay').textContent = maison;
    
    // Fetch existing data
    const res = await api('getAllActualData');
    let existingData = null;
    
    if (res.success && res.data) {
        const formattedMonth = String(month).padStart(2, '0');
        existingData = res.data.find(d => 
            d.MaisonName === maison && 
            d.Year == year && 
            String(d.Month).padStart(2, '0') === formattedMonth
        );
    }
    
    modalTitle.textContent = `${existingData ? 'Update' : 'Submit'} Actual Data for ${maison} - ${formatMonth(year, month)}`;
    
    $('operatorModalEmailInput').value = existingData ? existingData.EmailUsage : '';
    $('operatorModalSmsInput').value = existingData ? existingData.SMSUsage : '';
    $('operatorModalWhatsappInput').value = existingData ? existingData.WhatsAppUsage : '';
    $('operatorModalContactsInput').value = existingData ? existingData.ContactsTotal : '';
    
    $('operatorModalSubmitButton').textContent = existingData ? 'Update' : 'Submit';
    
    modal.classList.remove('hidden');
};

// === Close Operator Modal ===
const closeOperatorModal = () => {
    const modal = $('operatorSubmissionModal');
    modal.classList.add('hidden');
    
    $('operatorModalEmailInput').value = '';
    $('operatorModalSmsInput').value = '';
    $('operatorModalWhatsappInput').value = '';
    $('operatorModalContactsInput').value = '';
};

// === Handle Operator Modal Submit ===
const handleOperatorModalSubmit = async () => {
    const maison = $('operatorModalMaison').value;
    const year = parseInt($('operatorModalYear').value);
    const month = $('operatorModalMonth').value;
    const emailUsage = $('operatorModalEmailInput').value.trim();
    const smsUsage = $('operatorModalSmsInput').value.trim();
    const whatsappUsage = $('operatorModalWhatsappInput').value.trim();
    const contactsTotal = $('operatorModalContactsInput').value.trim();
    
    if (!emailUsage || !smsUsage || !whatsappUsage || !contactsTotal) {
        alert('Please fill in all four metrics!');
        return;
    }
    
    const emailNum = parseInt(emailUsage);
    const smsNum = parseInt(smsUsage);
    const whatsappNum = parseInt(whatsappUsage);
    const contactsNum = parseInt(contactsTotal);
    
    if (emailNum < 0 || smsNum < 0 || whatsappNum < 0 || contactsNum < 0) {
        alert('Quantities cannot be negative!');
        return;
    }
    
    let confirmMsg = `Submit actual usage data:\n\n`;
    confirmMsg += `Maison: ${maison}\n`;
    confirmMsg += `Year-Month: ${year}-${month}\n`;
    confirmMsg += `Email: ${emailNum}\n`;
    confirmMsg += `SMS: ${smsNum}\n`;
    confirmMsg += `WhatsApp: ${whatsappNum}\n`;
    confirmMsg += `Contacts: ${contactsNum}\n`;
    confirmMsg += '\nProceed?';
    
    if (!confirm(confirmMsg)) return;
    
    const res = await api('submitActualData', {
        maisonName: maison,
        year: year,
        month: month,
        emailUsage: emailNum,
        smsUsage: smsNum,
        whatsappUsage: whatsappNum,
        contactsTotal: contactsNum,
        recordedBy: currentUser.username
    });
    
    if (res.success) {
        msg($('operatorDataMessage'), 'Actual data submitted successfully!', true);
        closeOperatorModal();
        renderOperatorDataTable();
        setTimeout(() => clr($('operatorDataMessage')), 3000);
    } else {
        alert('Failed to submit: ' + res.message);
    }
};

// === Switch Fiscal Year Tab for Operator ===
const switchFiscalYearTabOperator = (fiscalYear) => {
    currentFiscalYearOperator = fiscalYear;
    
    document.querySelectorAll('.fy-tab-button-operator').forEach(btn => {
        if (parseInt(btn.dataset.year) === fiscalYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 关闭所有 accordion 并重置内容
    document.querySelectorAll('#maisonAccordionOperator .maison-accordion').forEach(details => {
        details.removeAttribute('open');
        const maison = details.dataset.maison;
        const containerId = `operator-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<p style="text-align: center; padding: 20px;">Click to load data...</p>';
        }
    });
};


// === Render Maison Actual Data Table (Read-only) ===
const renderMaisonActualDataTable = async () => {
    const tbody = $('actualDataTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Loading...</td></tr>';
    
    const months = getFiscalYearMonths(currentFiscalYearActual);
    const res = await api('getMaisonActualData', { maisonName: currentUser.maisonName });
    
    const dataMap = {};
    if (res.success && res.data) {
        res.data.forEach(record => {
            const formattedMonth = String(record.Month).padStart(2, '0');
            const key = `${record.Year}-${formattedMonth}`;
            dataMap[key] = record;
        });
    }
    
    let html = '';
    let totalEmail = 0, totalSms = 0, totalWhatsapp = 0, totalContacts = 0;
    
    months.forEach(({ year, month }) => {
        const key = formatMonth(year, month);
        const existingData = dataMap[key];
        
        const monthDisplay = `${year}-${month}`;
        const emailVal = existingData ? existingData.EmailUsage : '-';
        const smsVal = existingData ? existingData.SMSUsage : '-';
        const whatsappVal = existingData ? existingData.WhatsAppUsage : '-';
        const contactsVal = existingData ? existingData.ContactsTotal : '-';
        const timestamp = existingData ? fmt(existingData.Timestamp) : '-';
        
        if (existingData) {
            totalEmail += parseInt(existingData.EmailUsage) || 0;
            totalSms += parseInt(existingData.SMSUsage) || 0;
            totalWhatsapp += parseInt(existingData.WhatsAppUsage) || 0;
            totalContacts += parseInt(existingData.ContactsTotal) || 0;
        }
        
        html += `
            <tr>
                <td class="month-cell">${monthDisplay}</td>
                <td>${emailVal}</td>
                <td>${smsVal}</td>
                <td>${whatsappVal}</td>
                <td>${contactsVal}</td>
                <td style="font-size: 0.8em;">${timestamp}</td>
            </tr>
        `;
    });
    
    const grandTotal = totalEmail + totalSms + totalWhatsapp + totalContacts;
    
    html += `
        <tr class="total-row">
            <td class="total-cell"><strong>Total (Actual)</strong></td>
            <td class="total-value"><strong>${totalEmail}</strong></td>
            <td class="total-value"><strong>${totalSms}</strong></td>
            <td class="total-value"><strong>${totalWhatsapp}</strong></td>
            <td class="total-value"><strong>${totalContacts}</strong></td>
            <td class="total-grand"><strong>Grand Total: ${grandTotal}</strong></td>
        </tr>
    `;
    
    tbody.innerHTML = html;
    actualDataCache[currentFiscalYearActual] = dataMap;
};


// === Switch Fiscal Year Tab for Maison Actual ===
const switchFiscalYearTabActual = (fiscalYear) => {
    currentFiscalYearActual = fiscalYear;
    
    document.querySelectorAll('.fy-tab-button-actual').forEach(btn => {
        if (parseInt(btn.dataset.year) === fiscalYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    renderMaisonActualDataTable();
};


const switchFiscalYearTabOverview = (fiscalYear) => {
    currentFiscalYearOverview = fiscalYear;
    
    document.querySelectorAll('.fy-tab-button-overview').forEach(btn => {
        if (parseInt(btn.dataset.year) === fiscalYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 关闭所有 accordion 并重置内容
    document.querySelectorAll('#maisonAccordionOverview .maison-accordion').forEach(details => {
        details.removeAttribute('open');
        const maison = details.dataset.maison;
        const containerId = `forecast-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<p style="text-align: center; padding: 20px;">Click to load data...</p>';
        }
    });
};

// === 渲染 Maison Accordion (Forecast) ===
const renderMaisonAccordionOverview = () => {
    const container = $('maisonAccordionOverview');
    if (!container || allMaisonsList.length === 0) {
        if (container) container.innerHTML = '<p class="error-text">No maisons available.</p>';
        return;
    }
    
    let html = '';
    allMaisonsList.forEach(maison => {
        html += `
            <details class="maison-accordion" data-maison="${maison}" data-type="forecast">
                <summary>${maison}</summary>
                <div class="maison-accordion-content">
                   <div class="table-container" id="forecast-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}">
                        <p style="text-align: center; padding: 20px;">Click to load data...</p>
                    </div>
                </div>
            </details>
        `;
    });
    
    container.innerHTML = html;
};

// === 渲染 Maison Accordion (Actual) ===
const renderMaisonAccordionActual = () => {
    const container = $('maisonAccordionActual');
    if (!container || allMaisonsList.length === 0) {
        if (container) container.innerHTML = '<p class="error-text">No maisons available.</p>';
        return;
    }
    
    let html = '';
    allMaisonsList.forEach(maison => {
        html += `
            <details class="maison-accordion" data-maison="${maison}" data-type="actual">
                <summary>${maison}</summary>
                <div class="maison-accordion-content">
                    <div class="table-container" id="actual-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}">
                        <p style="text-align: center; padding: 20px;">Click to load data...</p>
                    </div>
                </div>
            </details>
        `;
    });
    
    container.innerHTML = html;
};
// === 渲染 Operator 的 Maison Accordion ===
const renderMaisonAccordionOperator = () => {
    const container = $('maisonAccordionOperator');
    if (!container || allMaisons.length === 0) {
        if (container) container.innerHTML = '<p class="error-text">No maisons available.</p>';
        return;
    }
    
    let html = '';
    allMaisons.forEach(maison => {
        html += `
            <details class="maison-accordion" data-maison="${maison}" data-type="operator">
                <summary>${maison}</summary>
                <div class="maison-accordion-content">
                    <div class="table-container" id="operator-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}">
                        <p style="text-align: center; padding: 20px;">Click to load data...</p>
                    </div>
                </div>
            </details>
        `;
    });
    
    container.innerHTML = html;
};
// === 加载单个 Maison 的 Operator 数据 ===
const loadMaisonOperatorData = async (maison, containerSelector) => {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    container.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
    
    const months = getFiscalYearMonths(currentFiscalYearOperator);
    const res = await api('getAllActualData');
    
    const dataMap = {};
    if (res.success && res.data) {
        res.data.forEach(record => {
            const formattedMonth = String(record.Month).padStart(2, '0');
            const key = `${record.MaisonName}-${record.Year}-${formattedMonth}`;
            dataMap[key] = record;
        });
    }
    
    let html = '<table><thead><tr>';
    html += '<th>Month</th><th>Email</th><th>SMS</th><th>WhatsApp</th><th>Contacts</th><th>Action</th>';
    html += '</tr></thead><tbody>';
    
    months.forEach(({ year, month }) => {
        const key = `${maison}-${year}-${month}`;
        const existingData = dataMap[key];
        
        const monthDisplay = `${year}-${month}`;
        const emailVal = existingData ? existingData.EmailUsage : '';
        const smsVal = existingData ? existingData.SMSUsage : '';
        const whatsappVal = existingData ? existingData.WhatsAppUsage : '';
        const contactsVal = existingData ? existingData.ContactsTotal : '';
        
        const buttonText = existingData ? 'Update' : 'Submit';
        const buttonClass = existingData ? 'action-button-table update-button' : 'action-button-table';
        
        html += `
            <tr>
                <td class="month-cell">${monthDisplay}</td>
                <td>${emailVal}</td>
                <td>${smsVal}</td>
                <td>${whatsappVal}</td>
                <td>${contactsVal}</td>
                <td>
                    <button class="${buttonClass} operator-action-button" 
                            data-maison="${maison}"
                            data-year="${year}" 
                            data-month="${month}"
                            data-has-data="${existingData ? 'true' : 'false'}">
                        ${buttonText}
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
};

// === 加载单个 Maison 的 Forecast 数据 ===
const loadMaisonForecastData = async (maison, containerSelector) => {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    container.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
    
    const res = await api('getAllSfmcData');
    
    if (!res.success || !res.data || res.data.length === 0) {
        container.innerHTML = '<p>No data available.</p>';
        return;
    }
    
    const filteredData = res.data.filter(row => {
        const rowYear = parseInt(row.Year);
        const rowMonth = parseInt(row.Month);
        const isFY = (rowYear == currentFiscalYearOverview && rowMonth >= 2) || 
                     (rowYear == (currentFiscalYearOverview + 1) && rowMonth == 1);
        return row.MaisonName === maison && isFY;
    });
    
    const summaryRes = await api('getMaisonForecastSummary', {
        maisonName: maison,
        year: currentFiscalYearOverview
    });
    
    const summary = summaryRes.success ? summaryRes : {
        totals: { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 },
        budget: { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 },
        variance: { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 },
        hasAlert: false
    };
    
    let html = '<table><thead><tr>';
html += '<th>Maison Name</th><th>Year-Month</th>';
html += '<th>Email</th><th>SMS</th><th>WhatsApp</th><th>Contacts</th>';
html += '<th>Submission Time</th>';  // 删除了 Submitted By
html += '<th>Approval Status</th><th>Maison Notes</th><th>Approval Action</th>';
html += '</tr></thead><tbody>';


    
    if (filteredData.length === 0) {
        html += '<tr><td colspan="10" style="text-align: center; padding: 20px; color: #666;">No data for this selection.</td></tr>';

    } else {
        filteredData.forEach(row => {
            html += '<tr>';
            html += `<td>${row.MaisonName}</td>`;
            html += `<td>${row.Year}-${String(row.Month).padStart(2, '0')}</td>`;  // 合并显示
            html += `<td>${row.EmailCount || 0}</td>`;
            html += `<td>${row.SMSCount || 0}</td>`;
            html += `<td>${row.WhatsAppCount || 0}</td>`;
            html += `<td>${row.ContactsCount || 0}</td>`;
            html += `<td>${fmt(row.Timestamp)}</td>`;
            
            const statusText = row.ApprovalStatus || '';
            const statusClass = { Pending: 'status-pending', Approved: 'status-approved', Rejected: 'status-rejected' }[statusText] || 'status-pending';
            html += `<td><span class="${statusClass}"><span class="status-badge-cell">${statusText}</span></span></td>`;
            
            const notes = row.MaisonNotes || '';
let notesCell = '-';
if (notes && notes.trim()) {
    notesCell = `<a href="javascript:void(0)" class="notes-link admin-notes-link" 
                    data-maison="${row.MaisonName}" 
                    data-year="${row.Year}" 
                    data-month="${row.Month}" 
                    data-notes="${notes.replace(/"/g, '&quot;')}">See</a>`;
}
html += `<td>${notesCell}</td>`;

            
            const recordId = row.RecordId || '';
            const submittedBy = row.SubmittedBy || '';
            const maisonName = row.MaisonName || '';
            const year = row.Year || '';
            const month = row.Month || '';
            const timestamp = row.Timestamp || '';
            const maisonNotes = row.MaisonNotes || '';
            const dataDetails = `Email: ${row.EmailCount || 0}, SMS: ${row.SMSCount || 0}, WhatsApp: ${row.WhatsAppCount || 0}, Contacts: ${row.ContactsCount || 0}`;
            
            html += `<td>
                <button class="approve-button-table" 
                    data-id="${recordId}" 
                    data-submitted-by="${submittedBy}" 
                    data-maison-name="${maisonName}" 
                    data-year="${year}"
                    data-month="${month}"
                    data-timestamp="${timestamp}"
                    data-maison-notes="${maisonNotes}"
                    data-data-details="${dataDetails}">Approve</button>
                <button class="reject-button-table" 
                    data-id="${recordId}" 
                    data-submitted-by="${submittedBy}" 
                    data-maison-name="${maisonName}" 
                    data-year="${year}"
                    data-month="${month}"
                    data-timestamp="${timestamp}"
                    data-maison-notes="${maisonNotes}"
                    data-data-details="${dataDetails}">Reject</button>
            </td>`;
            
            html += '</tr>';
        });
    }
    html += '</tbody></table>';
    
    // === 检查 Alert 状态 ===
    const triggerValue = `Email:${summary.totals.Email}|SMS:${summary.totals.SMS}|WhatsApp:${summary.totals.WhatsApp}|Contacts:${summary.totals.Contacts}`;
    const alertStatusRes = await api('checkAlertStatus', {
        maisonName: maison,
        year: currentFiscalYearOverview,
        month: '',
        dataType: 'forecast-maison',
        triggerValue: triggerValue
    });
    
    const alertSent = alertStatusRes.success && alertStatusRes.alreadySent;
    
    // 重新打开 tbody 添加 Total 行
    const tableEndIndex = html.lastIndexOf('</tbody></table>');
    html = html.substring(0, tableEndIndex);
    
    html += '<tr class="overview-total-row">';
    html += `<td colspan="2" style="text-align: center; font-weight: bold;">TOTAL (Approved Only)</td>`;
    
    html += '<td class="total-cell-multiline">';
    html += `<span class="total-main-value">${summary.totals.Email.toLocaleString()}</span>`;
    html += `<span class="total-budget-line">Budget: ${summary.budget.Email.toLocaleString()}</span>`;
    const emailVarianceClass = summary.variance.Email >= 0 ? 'variance-positive' : 'variance-negative';
    html += `<span class="total-variance-line ${emailVarianceClass}">${summary.variance.Email >= 0 ? '+' : ''}${summary.variance.Email.toFixed(1)}% ${Math.abs(summary.variance.Email) > 15 ? '⚠️' : '✓'}</span>`;
    html += '</td>';
    
    html += '<td class="total-cell-multiline">';
    html += `<span class="total-main-value">${summary.totals.SMS.toLocaleString()}</span>`;
    html += `<span class="total-budget-line">Budget: ${summary.budget.SMS.toLocaleString()}</span>`;
    const smsVarianceClass = summary.variance.SMS >= 0 ? 'variance-positive' : 'variance-negative';
    html += `<span class="total-variance-line ${smsVarianceClass}">${summary.variance.SMS >= 0 ? '+' : ''}${summary.variance.SMS.toFixed(1)}% ${Math.abs(summary.variance.SMS) > 15 ? '⚠️' : '✓'}</span>`;
    html += '</td>';
    
    html += '<td class="total-cell-multiline">';
    html += `<span class="total-main-value">${summary.totals.WhatsApp.toLocaleString()}</span>`;
    html += `<span class="total-budget-line">Budget: ${summary.budget.WhatsApp.toLocaleString()}</span>`;
    const whatsappVarianceClass = summary.variance.WhatsApp >= 0 ? 'variance-positive' : 'variance-negative';
    html += `<span class="total-variance-line ${whatsappVarianceClass}">${summary.variance.WhatsApp >= 0 ? '+' : ''}${summary.variance.WhatsApp.toFixed(1)}% ${Math.abs(summary.variance.WhatsApp) > 15 ? '⚠️' : '✓'}</span>`;
    html += '</td>';
    
    html += '<td class="total-cell-multiline">';
    html += `<span class="total-main-value">${summary.totals.Contacts.toLocaleString()}</span>`;
    html += `<span class="total-budget-line">Budget: ${summary.budget.Contacts.toLocaleString()}</span>`;
    const contactsVarianceClass = summary.variance.Contacts >= 0 ? 'variance-positive' : 'variance-negative';
    html += `<span class="total-variance-line ${contactsVarianceClass}">${summary.variance.Contacts >= 0 ? '+' : ''}${summary.variance.Contacts.toFixed(1)}% ${Math.abs(summary.variance.Contacts) > 15 ? '⚠️' : '✓'}</span>`;
    html += '</td>';
    
    html += '<td colspan="2" style="text-align: center;">-</td>';
    
    html += '<td style="text-align: center;">';
if (alertSent) {
    html += `<button class="alert-button-table" data-type="forecast-maison" data-year="${currentFiscalYearOverview}" data-maison="${maison}" data-trigger-value="${triggerValue}" disabled style="background-color: #ccc; cursor: not-allowed;">Alert Sent</button>`;
} else {
    html += `<button class="alert-button-table" data-type="forecast-maison" data-year="${currentFiscalYearOverview}" data-maison="${maison}" data-trigger-value="${triggerValue}">🔔 Alert</button>`;
}
html += '</td>';

    
    html += '</tr>';
    html += '</tbody></table>';
    
    container.innerHTML = html;
};
// === 加载单个 Maison 的 Actual 数据 ===
const loadMaisonActualData = async (maison, containerSelector) => {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    container.innerHTML = '<p style="text-align: center; padding: 20px;">Loading...</p>';
    
    const res = await api('getAllActualData');
    
    if (!res.success || !res.data || res.data.length === 0) {
        container.innerHTML = '<p>No actual data available.</p>';
        return;
    }
    
    const filteredData = res.data.filter(row => {
        const rowYear = parseInt(row.Year);
        const rowMonth = parseInt(row.Month);
        const isFY = (rowYear == currentFiscalYearActualOverview && rowMonth >= 2) || 
                     (rowYear == (currentFiscalYearActualOverview + 1) && rowMonth == 1);
        return row.MaisonName === maison && isFY;
    });
    
    const summaryRes = await api('getMaisonActualSummary', {
        maisonName: maison,
        year: currentFiscalYearActualOverview
    });
    
    const summary = summaryRes.success ? summaryRes : {
        totals: { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 },
        budget: { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 },
        variance: { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 },
        hasAlert: false
    };
    
    let html = '<table><thead><tr>';
html += '<th>Maison</th><th>Year-Month</th>';  // 合并为一列
html += '<th>Email</th><th>SMS</th><th>WhatsApp</th><th>Contacts</th>';
html += '<th>Recorded By</th><th>Timestamp</th>';
html += '</tr></thead><tbody>';

    
    if (filteredData.length === 0) {
        html += '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #666;">No data for this selection.</td></tr>';
    } else {
        filteredData.forEach(row => {
            html += '<tr>';
            html += `<td>${row.MaisonName}</td>`;
            html += `<td>${row.Year}-${String(row.Month).padStart(2, '0')}</td>`;  // 合并显示
            html += `<td>${row.EmailUsage || 0}</td>`;
            html += `<td>${row.SMSUsage || 0}</td>`;
            html += `<td>${row.WhatsAppUsage || 0}</td>`;
            html += `<td>${row.ContactsTotal || 0}</td>`;
            html += `<td>${row.RecordedBy || ''}</td>`;
            html += `<td>${fmt(row.Timestamp)}</td>`;
            html += '</tr>';
        });
    }
    // === 检查 Alert 状态 ===
const triggerValue = `Email:${summary.totals.Email}|SMS:${summary.totals.SMS}|WhatsApp:${summary.totals.WhatsApp}|Contacts:${summary.totals.Contacts}`;
const alertStatusRes = await api('checkAlertStatus', {
    maisonName: maison,
    year: currentFiscalYearActualOverview,
    month: '',
    dataType: 'actual-maison',
    triggerValue: triggerValue
});

const alertSent = alertStatusRes.success && alertStatusRes.alreadySent;


    html += '<tr class="overview-total-row">';
html += `<td colspan="2" style="text-align: center; font-weight: bold;">TOTAL</td>`;

    
    html += '<td class="total-cell-multiline">';
    html += `<span class="total-main-value">${summary.totals.Email.toLocaleString()}</span>`;
    html += `<span class="total-budget-line">Budget: ${summary.budget.Email.toLocaleString()}</span>`;
    const emailVarianceClass = summary.variance.Email >= 0 ? 'variance-positive' : 'variance-negative';
    html += `<span class="total-variance-line ${emailVarianceClass}">${summary.variance.Email >= 0 ? '+' : ''}${summary.variance.Email.toFixed(1)}% ${Math.abs(summary.variance.Email) > 15 ? '⚠️' : '✓'}</span>`;
    html += '</td>';
    
    html += '<td class="total-cell-multiline">';
    html += `<span class="total-main-value">${summary.totals.SMS.toLocaleString()}</span>`;
    html += `<span class="total-budget-line">Budget: ${summary.budget.SMS.toLocaleString()}</span>`;
    const smsVarianceClass = summary.variance.SMS >= 0 ? 'variance-positive' : 'variance-negative';
    html += `<span class="total-variance-line ${smsVarianceClass}">${summary.variance.SMS >= 0 ? '+' : ''}${summary.variance.SMS.toFixed(1)}% ${Math.abs(summary.variance.SMS) > 15 ? '⚠️' : '✓'}</span>`;
    html += '</td>';
    
    html += '<td class="total-cell-multiline">';
    html += `<span class="total-main-value">${summary.totals.WhatsApp.toLocaleString()}</span>`;
    html += `<span class="total-budget-line">Budget: ${summary.budget.WhatsApp.toLocaleString()}</span>`;
    const whatsappVarianceClass = summary.variance.WhatsApp >= 0 ? 'variance-positive' : 'variance-negative';
    html += `<span class="total-variance-line ${whatsappVarianceClass}">${summary.variance.WhatsApp >= 0 ? '+' : ''}${summary.variance.WhatsApp.toFixed(1)}% ${Math.abs(summary.variance.WhatsApp) > 15 ? '⚠️' : '✓'}</span>`;
    html += '</td>';
    
    html += '<td class="total-cell-multiline">';
    html += `<span class="total-main-value">${summary.totals.Contacts.toLocaleString()}</span>`;
    html += `<span class="total-budget-line">Budget: ${summary.budget.Contacts.toLocaleString()}</span>`;
    const contactsVarianceClass = summary.variance.Contacts >= 0 ? 'variance-positive' : 'variance-negative';
    html += `<span class="total-variance-line ${contactsVarianceClass}">${summary.variance.Contacts >= 0 ? '+' : ''}${summary.variance.Contacts.toFixed(1)}% ${Math.abs(summary.variance.Contacts) > 15 ? '⚠️' : '✓'}</span>`;
    html += '</td>';
    
    html += '<td style="text-align: center;">-</td>';
    
    html += '<td style="text-align: center;">';
if (alertSent) {
    html += `<button class="alert-button-table" data-type="actual-maison" data-year="${currentFiscalYearActualOverview}" data-maison="${maison}" data-trigger-value="${triggerValue}" disabled style="background-color: #ccc; cursor: not-allowed;">Alert Sent</button>`;
} else {
    html += `<button class="alert-button-table" data-type="actual-maison" data-year="${currentFiscalYearActualOverview}" data-maison="${maison}" data-trigger-value="${triggerValue}">🔔 Alert</button>`;
}
html += '</td>';

    
    html += '</tr>';
    html += '</tbody></table>';
    
    container.innerHTML = html;
};

const switchFiscalYearTabActualOverview = (fiscalYear) => {
    currentFiscalYearActualOverview = fiscalYear;
    
    document.querySelectorAll('.fy-tab-button-actual-overview').forEach(btn => {
        if (parseInt(btn.dataset.year) === fiscalYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 关闭所有 accordion 并重置内容
    document.querySelectorAll('#maisonAccordionActual .maison-accordion').forEach(details => {
        details.removeAttribute('open');
        const maison = details.dataset.maison;
        const containerId = `actual-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<p style="text-align: center; padding: 20px;">Click to load data...</p>';
        }
    });
};



// === Render Monthly Data Table ===
const renderMonthlyDataTable = async () => {
    const tbody = $('monthlyDataTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Loading...</td></tr>';
    
    const months = getFiscalYearMonths(currentFiscalYear);
    
    // Fetch existing data for this fiscal year
    const res = await api('getMaisonSfmcData', { submittedBy: currentUser.username });
    
        // Build data map for quick lookup
        const dataMap = {};
        if (res.success && res.data) {
            res.data.forEach(record => {
                // 这里是关键的改动
                const formattedMonth = String(record.Month).padStart(2, '0'); // 确保月份是两位数
                const key = `${record.Year}-${formattedMonth}`;
                dataMap[key] = record;
            });
        }
    
    
    // Render table rows
    let html = '';
    months.forEach(({ year, month }) => {
        const key = formatMonth(year, month);
        const existingData = dataMap[key];
        
        const monthDisplay = `${year}-${month}`;
        const status = existingData ? existingData.ApprovalStatus : '-';
        const statusClass = status === 'Approved' ? 'status-approved' : 
                           status === 'Pending' ? 'status-pending' : 
                           status === 'Rejected' ? 'status-rejected' : '';
        
        const emailVal = existingData ? existingData.EmailCount : '';
        const smsVal = existingData ? existingData.SMSCount : '';
        const whatsappVal = existingData ? existingData.WhatsAppCount : '';
        const contactsVal = existingData ? existingData.ContactsCount : '';
        
        const buttonText = existingData ? 'Update' : 'Submit';
        const buttonClass = existingData ? 'action-button-table update-button' : 'action-button-table';
        
        // Status cell
        let statusCell = `<span class="${statusClass}"><span class="status-badge-cell">${status}</span></span>`;
        
        // Notes cell
        let notesCell = '-';
        if (existingData && (existingData.MaisonNotes || existingData.AdminNotes)) {
            notesCell = `<a href="javascript:void(0)" class="notes-link" data-year="${year}" data-month="${month}">See</a>`;
        }
        
        html += `
            <tr data-year="${year}" data-month="${month}">
                <td class="month-cell">${monthDisplay}</td>
                <td><input type="number" class="month-input" data-field="email" value="${emailVal}" min="0" readonly></td>
                <td><input type="number" class="month-input" data-field="sms" value="${smsVal}" min="0" readonly></td>
                <td><input type="number" class="month-input" data-field="whatsapp" value="${whatsappVal}" min="0" readonly></td>
                <td><input type="number" class="month-input" data-field="contacts" value="${contactsVal}" min="0" readonly></td>
                <td>${statusCell}</td>
                <td>${notesCell}</td>
                <td>
                    <button class="${buttonClass}" 
                            data-year="${year}" 
                            data-month="${month}"
                            data-has-data="${existingData ? 'true' : 'false'}">
                        ${buttonText}
                    </button>
                </td>
            </tr>
        `;
    });
    
    // Calculate totals for Approved data only
    let totalEmail = 0;
    let totalSms = 0;
    let totalWhatsapp = 0;
    let totalContacts = 0;
    
    Object.values(dataMap).forEach(data => {
        if (data.ApprovalStatus === 'Approved') {
            totalEmail += parseInt(data.EmailCount) || 0;
            totalSms += parseInt(data.SMSCount) || 0;
            totalWhatsapp += parseInt(data.WhatsAppCount) || 0;
            totalContacts += parseInt(data.ContactsCount) || 0;
        }
    });
    
    const grandTotal = totalEmail + totalSms + totalWhatsapp + totalContacts;
    
    // Add total row
    html += `
        <tr class="total-row">
            <td class="total-cell"><strong>Total (Approved)</strong></td>
            <td class="total-value"><strong>${totalEmail}</strong></td>
            <td class="total-value"><strong>${totalSms}</strong></td>
            <td class="total-value"><strong>${totalWhatsapp}</strong></td>
            <td class="total-value"><strong>${totalContacts}</strong></td>
            <td class="total-cell">-</td>
            <td class="total-cell">-</td>
            <td class="total-grand"><strong>Grand Total: ${grandTotal}</strong></td>
        </tr>
    `;
    
    tbody.innerHTML = html;

    
    // Cache the data
    monthlyDataCache[currentFiscalYear] = dataMap;
};
// === Open Notes View Modal ===
const openNotesViewModal = (year, month) => {
    const key = formatMonth(year, month);
    const data = monthlyDataCache[currentFiscalYear]?.[key];
    
    if (!data) return;
    
    const modal = $('notesViewModal');
    const title = $('notesViewTitle');
    
    title.textContent = `Notes for ${formatMonth(year, month)}`;
    
    // Display Maison Notes
    const maisonNotesDisplay = $('maisonNotesDisplay');
    if (data.MaisonNotes && data.MaisonNotes.trim()) {
        maisonNotesDisplay.textContent = data.MaisonNotes;
    } else {
        maisonNotesDisplay.textContent = '';
    }
    
    // Display Admin Notes if available
    const adminNotesSection = $('adminNotesViewSection');
    const adminNotesDisplay = $('adminNotesViewDisplay');
    
    if (data.AdminNotes && data.AdminNotes.trim()) {
        adminNotesSection.classList.remove('hidden');
        adminNotesDisplay.textContent = data.AdminNotes;
    } else {
        adminNotesSection.classList.add('hidden');
        adminNotesDisplay.textContent = '';
    }
    
    modal.classList.remove('hidden');
};

const closeNotesViewModal = () => {
    const modal = $('notesViewModal');
    modal.classList.add('hidden');
};

// === Tab Switching ===
const switchFiscalYearTab = (fiscalYear) => {
    currentFiscalYear = fiscalYear;
    
    // Update tab buttons
    document.querySelectorAll('.fy-tab-button').forEach(btn => {
        if (parseInt(btn.dataset.year) === fiscalYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Re-render table
    renderMonthlyDataTable();
};

// === Handle Modal Submit ===
const handleModalSubmit = async () => {
    const year = parseInt($('modalYear').value);
    const month = $('modalMonth').value;
    const emailCount = $('modalEmailInput').value.trim();
    const smsCount = $('modalSmsInput').value.trim();
    const whatsappCount = $('modalWhatsappInput').value.trim();
    const contactsCount = $('modalContactsInput').value.trim();
    const maisonNotes = $('modalNotesInput').value.trim();
    
    // Validation: all fields must be filled
    if (!emailCount || !smsCount || !whatsappCount || !contactsCount) {
        alert('Please fill in all four metrics (Email, SMS, WhatsApp, Contacts).');
        return;
    }
    
    const emailNum = parseInt(emailCount);
    const smsNum = parseInt(smsCount);
    const whatsappNum = parseInt(whatsappCount);
    const contactsNum = parseInt(contactsCount);
    
    // Validation: no negative numbers
    if (emailNum < 0 || smsNum < 0 || whatsappNum < 0 || contactsNum < 0) {
        alert('Quantities cannot be negative!');
        return;
    }
    
    // Confirmation dialog
    let confirmMsg = `You are about to submit the following data:\n\n`;
    confirmMsg += `Year-Month: ${year}-${month}\n`;
    confirmMsg += `Email: ${emailNum}\n`;
    confirmMsg += `SMS: ${smsNum}\n`;
    confirmMsg += `WhatsApp: ${whatsappNum}\n`;
    confirmMsg += `Contacts: ${contactsNum}\n`;
    
    if (maisonNotes) {
        confirmMsg += `\nYour Notes: ${maisonNotes}\n`;
    }
    
    confirmMsg += '\nDo you want to proceed?';
    
    if (!confirm(confirmMsg)) {
        return;
    }
    
    // Submit data
    const res = await api('submitSfmcData', {
        maisonName: currentUser.maisonName,
        year: year,
        month: month,
        emailCount: emailNum,
        smsCount: smsNum,
        whatsappCount: whatsappNum,
        contactsCount: contactsNum,
        submittedBy: currentUser.username,
        maisonNotes: maisonNotes
    });
    
    if (res.success) {
        msg($('monthlyDataMessage'), 'Data submitted successfully!', true);
        closeModal();
        
        // Refresh table and history
        renderMonthlyDataTable();
        loadTable('maisonHistory', $('maisonHistoryTableContainer'), { submittedBy: currentUser.username });
        
        // Clear message after 3 seconds
        setTimeout(() => clr($('monthlyDataMessage')), 3000);
    } else {
        alert('Failed to submit data: ' + res.message);
    }
};

    // ===== API 调用 =====
    const api = async (act, data = {}) => {
        const silent = ['getConfig', 'checkExistingRecord', 'getUserEmail', 'getAllUsers', 'getAllSfmcHistory', 'getMaisonSfmcHistory', 'getForecastData', 'getAnnualBudgets'];
        const loading = !silent.includes(act);

        try {
            if (loading) msg($('loginMessage'), 'Requesting...', true);
            
            const res = await fetch(APP_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: act, ...data })
            });
            return await res.json();
        } catch (e) {
            console.error('API Error:', e);
            return { success: false, message: 'Network error: ' + e.message };
        } finally {
            if (loading) clr($('loginMessage'));
        }
    };

    // ===== 表格配置和渲染 =====
    const baseHeaders = [
        { key: 'MaisonName', label: 'Maison Name' },
        { key: 'Year', label: 'Year' },
        { key: 'Month', label: 'Month' },
        { key: 'EmailCount', label: 'Email' },
        { key: 'SMSCount', label: 'SMS' },
        { key: 'WhatsAppCount', label: 'WhatsApp' },
        { key: 'ContactsCount', label: 'Contacts' }
    ];

    const baseHistoryHeaders = [
        { key: 'MaisonName', label: 'Maison Name' },
        { key: 'Year', label: 'Year' },
        { key: 'Month', label: 'Month' },
        { key: 'EmailCount', label: 'Email' },
        { key: 'SMSCount', label: 'SMS' },
        { key: 'WhatsAppCount', label: 'WhatsApp' },
        { key: 'ContactsCount', label: 'Contacts' },
        { key: 'SubmittedBy', label: 'Submitted By' },
        { key: 'Timestamp', label: 'Submission Time' },
        { key: 'ApprovalStatus', label: 'Approval Status' },
        { key: 'Action', label: 'Action Type' },
        { key: 'ActionTimestamp', label: 'Action Time' },
        { key: 'ActionBy', label: 'Action By' }
    ];

    const configs = {
        maison: {
            action: 'getMaisonSfmcData',
            headers: [...baseHeaders, { key: 'Timestamp', label: 'Submission Time' }, { key: 'ApprovalStatus', label: 'Approval Status' }, { key: 'MaisonNotes', label: 'Notes' }],
            actionColumn: null
        },
        admin: {
            action: 'getAllSfmcData',
            headers: [...baseHeaders, { key: 'SubmittedBy', label: 'Submitted By' }, { key: 'Timestamp', label: 'Submission Time' }, { key: 'ApprovalStatus', label: 'Approval Status' }, { key: 'MaisonNotes', label: 'Maison Notes' }],
            actionColumn: 'approve'
        },
        maisonHistory: {
            action: 'getMaisonSfmcHistory',
            headers: [...baseHistoryHeaders, { key: 'MaisonNotes', label: 'Notes' }],
            renderStatusBadge: false,
            actionColumn: null
        },
        adminHistory: {
            action: 'getAllSfmcHistory',
            headers: [...baseHistoryHeaders, { key: 'MaisonNotes', label: 'Maison Notes' }, { key: 'AdminNotes', label: 'Admin Notes' }],
            renderStatusBadge: false,
            actionColumn: null
        }
    };

    // ===== 表格渲染 =====
    const loadTable = async (type, container, params = {}) => {
        const cfg = configs[type];
        if (!cfg) {
            console.error('Invalid table configuration type:', type);
            container.innerHTML = '<p class="error-text">Invalid table configuration.</p>';
            return;
        }

        const res = await api(cfg.action, params);

        if (!res.success || !res.data || !res.data.length) {
            container.innerHTML = `<p>${res.data && res.data.length === 0 ? 'No data available.' : 'Failed to load data: ' + (res.message || 'Unknown error')}</p>`;
            return;
        }

        let html = '<table><thead><tr>' + cfg.headers.map(h => `<th>${h.label}</th>`).join('');
        if (cfg.actionColumn) html += `<th>Approval Action</th>`;
        html += '</tr></thead><tbody>';

        res.data.forEach(row => {
            html += '<tr>' + cfg.headers.map(h => {
                let v = row[h.key];
                
                if (h.key === 'Timestamp' || h.key === 'ActionTimestamp') v = fmt(v);
                
                if (h.key === 'ApprovalStatus') {
                    if (cfg.renderStatusBadge === false) {
                        v = v ?? '';
                    } else {
                        // 直接将颜色类应用到 status-badge-cell 的父��素上，方便继承，但背景色由 status-badge-cell 自身决定
                        const statusText = v ?? '';
                        const statusClass = { Pending: 'status-pending', Approved: 'status-approved', Rejected: 'status-rejected' }[statusText] || 'status-pending';
                        // 渲染成徽章样式
                        v = `<span class="${statusClass}"><span class="status-badge-cell">${statusText}</span></span>`;
                    }
                }
                
                
                
                if ((h.key === 'MaisonNotes' || h.key === 'AdminNotes') && v && v.length > 50) {
                    v = `<span title="${v}">${v.substring(0, 50)}...</span>`;
                }
                
                return `<td>${v ?? ''}</td>`;
            }).join('');

            if (cfg.actionColumn === 'approve') {
                const recordId = row.RecordId || '';
                const submittedBy = row.SubmittedBy || '';
                const maisonName = row.MaisonName || '';
                const year = row.Year || '';
                const month = row.Month || '';
                const timestamp = row.Timestamp || '';
                const maisonNotes = row.MaisonNotes || '';
                
                const dataDetails = `Email: ${row.EmailCount || 0}, SMS: ${row.SMSCount || 0}, WhatsApp: ${row.WhatsAppCount || 0}, Contacts: ${row.ContactsCount || 0}`;
                
                html += `<td>
                    <button class="approve-button-table" 
                        data-id="${recordId}" 
                        data-submitted-by="${submittedBy}" 
                        data-maison-name="${maisonName}" 
                        data-year="${year}"
                        data-month="${month}"
                        data-timestamp="${timestamp}"
                        data-maison-notes="${maisonNotes}"
                        data-data-details="${dataDetails}">Approve</button>
                    <button class="reject-button-table" 
                        data-id="${recordId}" 
                        data-submitted-by="${submittedBy}" 
                        data-maison-name="${maisonName}" 
                        data-year="${year}"
                        data-month="${month}"
                        data-timestamp="${timestamp}"
                        data-maison-notes="${maisonNotes}"
                        data-data-details="${dataDetails}">Reject</button>
                </td>`;
            }
            
            html += '</tr>';
        });

        html += '</tbody></table>';
    
        // Add total row for admin forecast overview
        if (type === 'admin' && res.data && res.data.length > 0) {
            const tableElement = container.querySelector('table');
            if (tableElement) {
                container.innerHTML = html;
                await addForecastTotalRow(container);
            } else {
                container.innerHTML = html;
            }
        } else {
            container.innerHTML = html;
        }
    
    };
// === Add Forecast Total Row ===
const addForecastTotalRow = async (container) => {
    const table = container.querySelector('table');
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    const currentYear = new Date().getFullYear();
    
    // Get totals
    const totalsRes = await api('calculateYearlyTotals', { dataType: 'forecast', year: currentYear });
    const totals = totalsRes.success ? totalsRes.totals : { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 };
    
    // Get budget
    const budgetRes = await api('getYearlyBudget', { year: currentYear });
    const budget = budgetRes.success ? budgetRes.budget : { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 };
    
    const varianceThreshold = parseFloat(configPrices.VarianceThreshold) || 15;
    
    const calcVariance = (total, budgetVal) => {
        if (budgetVal > 0) {
            return ((total - budgetVal) / budgetVal) * 100;
        }
        return total > 0 ? 100 : 0;
    };
    
    const emailVariance = calcVariance(totals.Email, budget.Email);
    const smsVariance = calcVariance(totals.SMS, budget.SMS);
    const whatsappVariance = calcVariance(totals.WhatsApp, budget.WhatsApp);
    const contactsVariance = calcVariance(totals.Contacts, budget.Contacts);
    
    const needsAlert = Math.abs(emailVariance) > varianceThreshold || 
                       Math.abs(smsVariance) > varianceThreshold || 
                       Math.abs(whatsappVariance) > varianceThreshold || 
                       Math.abs(contactsVariance) > varianceThreshold;
    
    let totalRowHtml = '<tr class="overview-total-row">';
    totalRowHtml += '<td colspan="3" class="overview-total-cell">Total (Approved Forecast) - FY' + currentYear + '</td>';
    
    // Email
    totalRowHtml += '<td class="budget-comparison-cell">';
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Total:</span> <span class="budget-value">${totals.Email}</span></span><br>`;
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Budget:</span> ${budget.Email}</span><br>`;
    const emailVarianceClass = emailVariance >= 0 ? 'variance-positive' : 'variance-negative';
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Variance:</span> <span class="variance-value ${emailVarianceClass}">${emailVariance >= 0 ? '+' : ''}${emailVariance.toFixed(1)}%</span></span>`;
    totalRowHtml += '</td>';
    
    // SMS
    totalRowHtml += '<td class="budget-comparison-cell">';
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Total:</span> <span class="budget-value">${totals.SMS}</span></span><br>`;
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Budget:</span> ${budget.SMS}</span><br>`;
    const smsVarianceClass = smsVariance >= 0 ? 'variance-positive' : 'variance-negative';
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Variance:</span> <span class="variance-value ${smsVarianceClass}">${smsVariance >= 0 ? '+' : ''}${smsVariance.toFixed(1)}%</span></span>`;
    totalRowHtml += '</td>';
    
    // WhatsApp
    totalRowHtml += '<td class="budget-comparison-cell">';
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Total:</span> <span class="budget-value">${totals.WhatsApp}</span></span><br>`;
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Budget:</span> ${budget.WhatsApp}</span><br>`;
    const whatsappVarianceClass = whatsappVariance >= 0 ? 'variance-positive' : 'variance-negative';
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Variance:</span> <span class="variance-value ${whatsappVarianceClass}">${whatsappVariance >= 0 ? '+' : ''}${whatsappVariance.toFixed(1)}%</span></span>`;
    totalRowHtml += '</td>';
    
    // Contacts
    totalRowHtml += '<td class="budget-comparison-cell">';
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Total:</span> <span class="budget-value">${totals.Contacts}</span></span><br>`;
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Budget:</span> ${budget.Contacts}</span><br>`;
    const contactsVarianceClass = contactsVariance >= 0 ? 'variance-positive' : 'variance-negative';
    totalRowHtml += `<span class="budget-line"><span class="budget-label">Variance:</span> <span class="variance-value ${contactsVarianceClass}">${contactsVariance >= 0 ? '+' : ''}${contactsVariance.toFixed(1)}%</span></span>`;
    totalRowHtml += '</td>';
    
    totalRowHtml += '<td colspan="3" class="overview-total-cell">-</td>';
    
    // Alert button
    totalRowHtml += '<td>';
    if (needsAlert) {
        totalRowHtml += `<button class="alert-button-table" data-type="forecast" data-year="${currentYear}">🔔 Alert</button>`;
    } else {
        totalRowHtml += '-';
    }
    totalRowHtml += '</td>';
    
    totalRowHtml += '</tr>';
    
    tbody.insertAdjacentHTML('beforeend', totalRowHtml);
};

    // ===== Forecast 表格渲染 =====
    const loadForecastTable = async (container, year) => {
        const budgetRes = await api('getAnnualBudgets', { year: year });
        const forecastRes = await api('getForecastData', { year: year });

        if (!forecastRes.success || !forecastRes.data) {
            container.innerHTML = `<p>Failed to load forecast data: ${forecastRes.message || 'Unknown error'}</p>`;
            return;
        }

        const budgets = {};
        if (budgetRes.success && budgetRes.data) {
            budgetRes.data.forEach(b => {
                budgets[b.MaisonName] = {
                    email: parseInt(b.EmailBudget) || 0,
                    sms: parseInt(b.SMSBudget) || 0,
                    whatsapp: parseInt(b.WhatsAppBudget) || 0,
                    contacts: parseInt(b.ContactsBudget) || 0
                };
            });
        }

        let html = '<table><thead><tr>';
        html += '<th>Maison</th>';
        html += '<th>Email<br>Forecast</th>';
        html += '<th>Email<br>Budget</th>';
        html += '<th>Email<br>Variance</th>';
        html += '<th>SMS<br>Forecast</th>';
        html += '<th>SMS<br>Budget</th>';
        html += '<th>SMS<br>Variance</th>';
        html += '<th>WhatsApp<br>Forecast</th>';
        html += '<th>WhatsApp<br>Budget</th>';
        html += '<th>WhatsApp<br>Variance</th>';
        html += '<th>Contacts<br>Forecast</th>';
        html += '<th>Contacts<br>Budget</th>';
        html += '<th>Contacts<br>Variance</th>';
        html += '</tr></thead><tbody>';

        if (forecastRes.data.length === 0) {
            html += '<tr><td colspan="13" style="text-align: center; padding: 20px; color: #666;">No forecast data available for this year.</td></tr>';
            html += '</tbody></table>';
            container.innerHTML = html;
            return;
        }

        const varianceThreshold = parseFloat(configPrices.VarianceThreshold) || 15;

        forecastRes.data.forEach(item => {
            const maisonBudget = budgets[item.MaisonName] || { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
            
            html += '<tr>';
            html += `<td>${item.MaisonName}</td>`;
            
            // Email
            const emailForecast = item.TotalEmail || 0;
            const emailBudget = maisonBudget.email;
            const emailVariance = emailBudget > 0 ? ((emailForecast - emailBudget) / emailBudget * 100) : 0;
            let emailVarianceClass = 'variance-good';
            if (Math.abs(emailVariance) > varianceThreshold) {
                emailVarianceClass = 'variance-danger';
            } else if (Math.abs(emailVariance) > varianceThreshold / 2) {
                emailVarianceClass = 'variance-warning';
            }
            html += `<td>${emailForecast}</td>`;
            html += `<td>${emailBudget}</td>`;
            html += `<td class="${emailVarianceClass}">${emailVariance >= 0 ? '+' : ''}${emailVariance.toFixed(1)}%</td>`;
            
            // SMS
            const smsForecast = item.TotalSMS || 0;
            const smsBudget = maisonBudget.sms;
            const smsVariance = smsBudget > 0 ? ((smsForecast - smsBudget) / smsBudget * 100) : 0;
            let smsVarianceClass = 'variance-good';
            if (Math.abs(smsVariance) > varianceThreshold) {
                smsVarianceClass = 'variance-danger';
            } else if (Math.abs(smsVariance) > varianceThreshold / 2) {
                smsVarianceClass = 'variance-warning';
            }
            html += `<td>${smsForecast}</td>`;
            html += `<td>${smsBudget}</td>`;
            html += `<td class="${smsVarianceClass}">${smsVariance >= 0 ? '+' : ''}${smsVariance.toFixed(1)}%</td>`;
            
            // WhatsApp
            const whatsappForecast = item.TotalWhatsApp || 0;
            const whatsappBudget = maisonBudget.whatsapp;
            const whatsappVariance = whatsappBudget > 0 ? ((whatsappForecast - whatsappBudget) / whatsappBudget * 100) : 0;
            let whatsappVarianceClass = 'variance-good';
            if (Math.abs(whatsappVariance) > varianceThreshold) {
                whatsappVarianceClass = 'variance-danger';
            } else if (Math.abs(whatsappVariance) > varianceThreshold / 2) {
                whatsappVarianceClass = 'variance-warning';
            }
            html += `<td>${whatsappForecast}</td>`;
            html += `<td>${whatsappBudget}</td>`;
            html += `<td class="${whatsappVarianceClass}">${whatsappVariance >= 0 ? '+' : ''}${whatsappVariance.toFixed(1)}%</td>`;
            
            // Contacts
            const contactsForecast = item.TotalContacts || 0;
            const contactsBudget = maisonBudget.contacts;
            const contactsVariance = contactsBudget > 0 ? ((contactsForecast - contactsBudget) / contactsBudget * 100) : 0;
            let contactsVarianceClass = 'variance-good';
            if (Math.abs(contactsVariance) > varianceThreshold) {
                contactsVarianceClass = 'variance-danger';
            } else if (Math.abs(contactsVariance) > varianceThreshold / 2) {
                contactsVarianceClass = 'variance-warning';
            }
            html += `<td>${contactsForecast}</td>`;
            html += `<td>${contactsBudget}</td>`;
            html += `<td class="${contactsVarianceClass}">${contactsVariance >= 0 ? '+' : ''}${contactsVariance.toFixed(1)}%</td>`;
            
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    };

    // ===== 事件委托：表格按钮 =====
    document.addEventListener('click', async e => {
                // Handle operator action buttons FIRST
                if (e.target.classList.contains('operator-action-button')) {
                    const maison = e.target.dataset.maison;
                    const year = parseInt(e.target.dataset.year);
                    const month = e.target.dataset.month;
                    openOperatorModal(maison, year, month);
                    return;
                }
                
                // Handle alert buttons
if (e.target.classList.contains('alert-button-table')) {
    const dataType = e.target.dataset.type;
    const year = parseInt(e.target.dataset.year);
    const maison = e.target.dataset.maison;
    let totals, budget, variance;
    
    if (dataType === 'forecast-maison' || dataType === 'actual-maison') {
        const summaryApi = dataType === 'forecast-maison' ? 'getMaisonForecastSummary' : 'getMaisonActualSummary';
        const summaryRes = await api(summaryApi, { maisonName: maison, year: year });
        if (summaryRes.success) {
            totals = summaryRes.totals;
            budget = summaryRes.budget;
            variance = summaryRes.variance;
        } else {
            alert('Failed to load summary data.');
            return;
        }
    } else {
        const totalsRes = await api('calculateYearlyTotals', { 
            dataType: dataType, 
            year: year 
        });
        totals = totalsRes.success ? totalsRes.totals : { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 };
        
        const budgetRes = await api('getYearlyBudget', { year: year });
        budget = budgetRes.success ? budgetRes.budget : { Email: 0, SMS: 0, WhatsApp: 0, Contacts: 0 };
        
        const calcVariance = (total, budgetVal) => {
            if (budgetVal > 0) return ((total - budgetVal) / budgetVal) * 100;
            return total > 0 ? 100 : 0;
        };
        
        variance = {
            Email: calcVariance(totals.Email, budget.Email),
            SMS: calcVariance(totals.SMS, budget.SMS),
            WhatsApp: calcVariance(totals.WhatsApp, budget.WhatsApp),
            Contacts: calcVariance(totals.Contacts, budget.Contacts)
        };
    }
    const emailRes = await api('generateAlertEmail', {
        dataType: dataType === 'forecast-maison' ? 'Forecast' : (dataType === 'actual-maison' ? 'Actual' : dataType.charAt(0).toUpperCase() + dataType.slice(1)),
        year: year,
        totals: totals,
        budget: budget,
        variance: variance,
        maisonName: maison || null
    });
    if (emailRes.success) {
        $('emailSubjectInput').value = emailRes.subject;
        $('emailContentInput').value = emailRes.body;
        if (allUsers && allUsers.length) {
            searchTerm = '';
            if ($('userSearchInput')) $('userSearchInput').value = '';
            renderU();
            
            $('userListContainer').querySelectorAll('.user-checkbox').forEach(cb => {
                const userMaison = cb.dataset.maison || '';
                // 只选中该 Maison 的用户
                if (maison && userMaison === maison) {
                    cb.checked = true;
                }
            });
            updCnt();
        }
        $('emailBroadcastSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        msg($('emailBroadcastMessage'), 'Alert email prepared. Click "Open in Outlook" to send.', true);
        
        // === 记录 Alert 已发送 ===
        const triggerValue = `Email:${totals.Email}|SMS:${totals.SMS}|WhatsApp:${totals.WhatsApp}|Contacts:${totals.Contacts}`;
        const recordRes = await api('recordAlertSent', {
            maisonName: maison || '',
            year: year,
            month: '',
            dataType: dataType,
            triggerValue: triggerValue,
            sentBy: currentUser.username
        });
        
        // 更新按钮状态
        if (recordRes.success && e.target) {
            e.target.textContent = 'Alert Sent';
            e.target.disabled = true;
            e.target.style.backgroundColor = '#ccc';
            e.target.style.cursor = 'not-allowed';
        }
    }
    return;
}


                
                // Now check for id
                const id = e.target.dataset.id;
                if (!id) return;
        

        if (e.target.classList.contains('approve-button-table') || e.target.classList.contains('reject-button-table')) {
            const st = e.target.classList.contains('approve-button-table') ? 'Approved' : 'Rejected';
            
            const submittedBy = e.target.dataset.submittedBy || '';
            const maisonName = e.target.dataset.maisonName || '';
            const year = e.target.dataset.year || '';
            const month = e.target.dataset.month || '';
            const timestamp = e.target.dataset.timestamp || '';
            const maisonNotes = e.target.dataset.maisonNotes || '';
            const dataDetails = e.target.dataset.dataDetails || '';
            
            const adminNotes = prompt(`${st === 'Approved' ? 'Approve' : 'Reject'} this submission?\n\nYear-Month: ${year}-${month}\nMaison: ${maisonName}\nData: ${dataDetails}\n\nYou can add optional notes below:`, '');
            
            if (adminNotes === null) return;
            
            const res = await api('updateApprovalStatus', { 
                recordId: id, 
                newStatus: st, 
                actionBy: currentUser.username,
                adminNotes: adminNotes
            });
            
            msg($('loginMessage'), res.success ? `Status: ${st}` : 'Update failed: ' + res.message, res.success);
            
            if (res.success) {
                loadTable('admin', $('overviewDataTableContainer'));
                loadTable('adminHistory', $('adminHistoryTableContainer'));
                
                if (submittedBy) {
                    sendApprovalNotification(submittedBy, st, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes);
                }
            }
        }
    
    });

    // ===== Email 管理 =====
    const setEmailUI = (has, email = '') => {
        $('registeredEmailValue').textContent = email;
        $('emailDisplay').classList.toggle('hidden', !has);
        $('emailForm').classList.toggle('hidden', has);
        $('editEmailButton').classList.toggle('hidden', !has);
        $('cancelEditEmailButton').classList.add('hidden');
        $('submitEmailButton').textContent = 'Register Email';
        $('userEmailInput').value = email;
    };

    const initEmail = async () => {
        if (!currentUser || currentUser.role !== 'maison') { 
            $('emailManagementSection').classList.add('hidden'); 
            return; 
        }
        $('emailManagementSection').classList.remove('hidden');
        clr($('emailMessage'));
        const res = await api('getUserEmail', { username: currentUser.username });
        setEmailUI(res.success && res.email, res.email || '');
    };

    const buildNotificationBody = (submittedBy, status, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes) => {
        const statusText = status === 'Approved' ? 'Approved' : 'Rejected';
        const formattedTimestamp = timestamp ? fmt(timestamp) : (timestamp || '');
        return (
            `Dear ${submittedBy},\n\n` +
            `Your SFMC data submission has been ${statusText.toLowerCase()}.\n\n` +
            `Details:\n` +
            `Maison Name: ${maisonName || ''}\n` +
            `Year-Month: ${year || ''}-${month || ''}\n` +
            `Data: ${dataDetails || ''}\n` +
            `Submitted By: ${submittedBy || ''}\n` +
            `Submission Time: ${formattedTimestamp}\n` +
            `Approval Status: ${statusText}\n` +
            (maisonNotes ? `\nYour Notes: ${maisonNotes}\n` : '') +
            (adminNotes ? `\nAdmin Notes: ${adminNotes}\n` : '') +
            `\n` +
            (status === 'Approved' 
              ? `Thank you for your submission. The data has been successfully approved.\n`
              : `Please review your submission. If you have any questions or need to resubmit, please contact the administrator.\n`) +
            `\nBest regards,\nBT-admin`
        );
    };

    const sendApprovalNotification = async (submittedBy, status, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes) => {
        try {
            const emailRes = await api('getUserEmail', { username: submittedBy });
            if (!emailRes.success || !emailRes.email) {
                msg($('emailBroadcastMessage'), `User "${submittedBy}" has no registered email. Notification not prepared.`, false);
                return;
            }
            const applicantEmail = emailRes.email.trim();
            const statusText = status === 'Approved' ? 'Approved' : 'Rejected';
            const subject = `SFMC Data Submission ${statusText} - ${maisonName} (${year}-${month})`;
            const body = buildNotificationBody(submittedBy, status, maisonName, year, month, dataDetails, timestamp, maisonNotes, adminNotes);

            $('emailSubjectInput').value = subject;
            $('emailContentInput').value = body;

            if (!allUsers || !allUsers.length) {
                const res = await api('getAllUsers');
                if (res.success && res.data) allUsers = res.data.filter(u => u.email && u.email.trim());
            }
            
            const hasApplicant = allUsers && allUsers.some(u => (u.username || '').trim() === submittedBy);
            if (!hasApplicant && allUsers) {
                allUsers = [...allUsers, { username: submittedBy, email: applicantEmail, maisonName: '', role: '' }];
            }
            if (allUsers && allUsers.length) {
                searchTerm = '';
                if ($('userSearchInput')) $('userSearchInput').value = '';
                renderU();
                
                $('userListContainer').querySelectorAll('.user-checkbox').forEach(cb => { 
                    cb.checked = (cb.dataset.username || '').trim() === submittedBy; 
                });
                updCnt();
            }

            $('emailBroadcastSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
            msg($('emailBroadcastMessage'), 'Notification email prepared. Click "Open in Outlook" to send.', true);
        } catch (error) {
            console.error('Error preparing approval notification:', error);
            msg($('emailBroadcastMessage'), 'Failed to prepare notification: ' + (error.message || 'Unknown error'), false);
        }
    };

    // ===== Email Broadcast =====
    const filtered = () => {
        if (!searchTerm) return allUsers;
        const t = searchTerm.toLowerCase();
        return allUsers.filter(u => [(u.username || ''), (u.email || ''), (u.maisonName || '')].some(f => f.toLowerCase().includes(t)));
    };

    const selected = () => Array.from($('userListContainer').querySelectorAll('.user-checkbox:checked')).map(cb => cb.dataset.email).filter(e => e && valid(e));

    const renderU = () => {
        const f = filtered();
        if (!f.length) { 
            $('userListContainer').innerHTML = '<p class="no-users-text">No users found.</p>'; 
            return; 
        }
        $('userListContainer').innerHTML = f.map((u, i) => {
            const id = `user-${i}-${(u.email || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
            return `<div class="user-checkbox-item">
                <input type="checkbox" id="${id}" class="user-checkbox" data-email="${u.email || ''}" data-username="${u.username || ''}" data-maison="${u.maisonName || ''}" ${u.email ? '' : 'disabled'}>
                <label for="${id}" class="user-checkbox-label">
                    <span class="user-name">${u.username || 'N/A'}</span>
                    <span class="user-email">${u.email || 'No email'}</span>
                    ${u.maisonName ? `<span class="user-maison">${u.maisonName}</span>` : ''}
                </label>
            </div>`;
        }).join('');
    };

    const updCnt = () => {
        const cnt = selected().length;
        $('recipientCountDisplay').textContent = cnt > 0 ? `Selected: ${cnt} recipient(s)` : 'No recipients selected.';
        $('recipientCountDisplay').style.color = cnt > 0 ? '#00796b' : '#999';
        $('recipientCountDisplay').classList.remove('hidden');
    };

    $('userListContainer').addEventListener('change', e => { 
        if (e.target.classList.contains('user-checkbox')) updCnt(); 
    });

    const initBcast = async () => {
        if (!currentUser || currentUser.role !== 'admin') { 
            $('emailBroadcastSection').classList.add('hidden'); 
            return; 
        }
        $('emailBroadcastSection').classList.remove('hidden');
        $('userListContainer').innerHTML = '<p class="loading-text">Loading users...</p>';
        const res = await api('getAllUsers');
        if (res.success && res.data) { 
            allUsers = res.data.filter(u => u.email && u.email.trim()); 
            renderU(); 
            updCnt(); 
        } else {
            $('userListContainer').innerHTML = `<p class="error-text">Failed to load users: ${res.message || 'Unknown'}</p>`;
        }
    };

    // ===== 填充选择器 =====
    const popYearSelectors = () => {
        const years = [currentYear - 1, currentYear, currentYear + 1];
        const yearOptions = years.map(y => `<option value="${y}">FY${y}</option>`).join('');
        
        if ($('budgetYearSelect')) $('budgetYearSelect').innerHTML = yearOptions;
        if ($('dataYearSelect')) $('dataYearSelect').innerHTML = yearOptions;
        if ($('forecastYearSelect')) $('forecastYearSelect').innerHTML = yearOptions;
        
        if ($('budgetYearSelect')) $('budgetYearSelect').value = currentYear;
        if ($('dataYearSelect')) $('dataYearSelect').value = currentYear;
        if ($('forecastYearSelect')) $('forecastYearSelect').value = currentYear;
    };
    

    const popMaisonSelectors = async () => {
        const res = await api('getAllUsers');
        if (!res.success || !res.data) return;
        
        const maisons = [...new Set(res.data
            .filter(u => u.maisonName && u.maisonName !== 'BT')
            .map(u => u.maisonName))];
        
        const maisonOptions = maisons.map(m => `<option value="${m}">${m}</option>`).join('');
        
        if ($('budgetMaisonSelect')) $('budgetMaisonSelect').innerHTML = maisonOptions;
    };

    // ===== 导出功能 =====
    const exportOverviewData = async () => {
        if (!currentUser || currentUser.role !== 'admin') { alert('Admin only!'); return; }
        const res = await api('getAllSfmcData');
        if (!res.success || !res.data || !res.data.length) { 
            msg($('loginMessage'), 'Export failed: No data available.', false); 
            return; 
        }
        
        const h = configs.admin.headers;
        let csv = h.map(x => x.label).join(',') + '\n';
        
        res.data.forEach(r => { 
            csv += h.map(x => { 
                let v = r[x.key]; 
                if (x.key === 'Timestamp') v = fmt(v); 
                return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : (v ?? ''); 
            }).join(',') + '\n'; 
        });
        
        const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const l = document.createElement('a');
        l.href = URL.createObjectURL(b); 
        l.download = `SFMC_Overview_Export_${new Date().toLocaleDateString('en-US').replace(/\//g, '-')}.csv`;
        document.body.appendChild(l); 
        l.click(); 
        document.body.removeChild(l);
        
        msg($('loginMessage'), 'Overview data exported successfully!', true);
    };

    const exportHistoryData = async () => {
        if (!currentUser || currentUser.role !== 'admin') { alert('Admin only!'); return; }
        const res = await api('getAllSfmcHistory');
        if (!res.success || !res.data || !res.data.length) { 
            msg($('loginMessage'), 'Export failed: No history data available.', false); 
            return; 
        }
        
        const h = configs.adminHistory.headers;
        let csv = h.map(x => x.label).join(',') + '\n';
        
        res.data.forEach(r => { 
            csv += h.map(x => { 
                let v = r[x.key]; 
                if (x.key === 'Timestamp' || x.key === 'ActionTimestamp') v = fmt(v);
                return typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : (v ?? ''); 
            }).join(',') + '\n'; 
        });
        
        const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const l = document.createElement('a');
        l.href = URL.createObjectURL(b);
        l.download = `SFMC_History_Export_${new Date().toLocaleDateString('en-US').replace(/\//g, '-')}.csv`;
        document.body.appendChild(l);
        l.click();
        document.body.removeChild(l);
        
        msg($('loginMessage'), 'History data exported successfully!', true);
    };

    const exportForecastData = async () => {
        if (!currentUser || currentUser.role !== 'admin') { alert('Admin only!'); return; }
        
        const year = parseInt($('forecastYearSelect').value) || currentYear;
        const budgetRes = await api('getAnnualBudgets', { year: year });
        const forecastRes = await api('getForecastData', { year: year });
        
        if (!forecastRes.success || !forecastRes.data || !forecastRes.data.length) {
            msg($('loginMessage'), 'Export failed: No forecast data available.', false);
            return;
        }

        const budgets = {};
        if (budgetRes.success && budgetRes.data) {
            budgetRes.data.forEach(b => {
                budgets[b.MaisonName] = {
                    email: parseInt(b.EmailBudget) || 0,
                    sms: parseInt(b.SMSBudget) || 0,
                    whatsapp: parseInt(b.WhatsAppBudget) || 0,
                    contacts: parseInt(b.ContactsBudget) || 0
                };
            });
        }

        let csv = 'Maison,Email Forecast,Email Budget,Email Variance %,SMS Forecast,SMS Budget,SMS Variance %,WhatsApp Forecast,WhatsApp Budget,WhatsApp Variance %,Contacts Forecast,Contacts Budget,Contacts Variance %\n';

        forecastRes.data.forEach(item => {
            const maisonBudget = budgets[item.MaisonName] || { email: 0, sms: 0, whatsapp: 0, contacts: 0 };
            
            const emailForecast = item.TotalEmail || 0;
            const emailBudget = maisonBudget.email;
            const emailVariance = emailBudget > 0 ? ((emailForecast - emailBudget) / emailBudget * 100) : 0;
            
            const smsForecast = item.TotalSMS || 0;
            const smsBudget = maisonBudget.sms;
            const smsVariance = smsBudget > 0 ? ((smsForecast - smsBudget) / smsBudget * 100) : 0;
            
            const whatsappForecast = item.TotalWhatsApp || 0;
            const whatsappBudget = maisonBudget.whatsapp;
            const whatsappVariance = whatsappBudget > 0 ? ((whatsappForecast - whatsappBudget) / whatsappBudget * 100) : 0;
            
            const contactsForecast = item.TotalContacts || 0;
            const contactsBudget = maisonBudget.contacts;
            const contactsVariance = contactsBudget > 0 ? ((contactsForecast - contactsBudget) / contactsBudget * 100) : 0;
            
            csv += `${item.MaisonName},${emailForecast},${emailBudget},${emailVariance >= 0 ? '+' : ''}${emailVariance.toFixed(1)}%,${smsForecast},${smsBudget},${smsVariance >= 0 ? '+' : ''}${smsVariance.toFixed(1)}%,${whatsappForecast},${whatsappBudget},${whatsappVariance >= 0 ? '+' : ''}${whatsappVariance.toFixed(1)}%,${contactsForecast},${contactsBudget},${contactsVariance >= 0 ? '+' : ''}${contactsVariance.toFixed(1)}%\n`;
        });

        const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const l = document.createElement('a');
        l.href = URL.createObjectURL(b);
        l.download = `SFMC_Forecast_${year}_${new Date().toLocaleDateString('en-US').replace(/\//g, '-')}.csv`;
        document.body.appendChild(l);
        l.click();
        document.body.removeChild(l);

        msg($('loginMessage'), `Forecast data for ${year} exported successfully!`, true);
    };

    // ===== 事件处理器 =====
    const handlers = {
        loginButton: async () => {
            const u = $('username').value.trim(), p = $('password').value.trim();
            if (!u || !p) { msg($('loginMessage'), 'Enter credentials!', false); return; }
            const res = await api('login', { username: u, password: p });
            if (!res.success) { msg($('loginMessage'), 'Login failed: ' + res.message, false); return; }
            msg($('loginMessage'), 'Login successful!', true);
            currentUser = { username: u, role: res.role, maisonName: res.maisonName };
            
            const cfg = await api('getConfig');
            if (cfg.success && cfg.data) {
                Object.assign(configPrices, { 
                    BeautyTechEmail: cfg.data.BeautyTechEmail || 'zzhou@pcis.lvmh-pc.com',
                    VarianceThreshold: parseFloat(cfg.data.VarianceThreshold) || 15
                });
            }
            
            setTimeout(async () => {
                showPage($('mainPage'));
                $('welcomeMessage').textContent = `Welcome, ${currentUser.username} (${currentUser.role})!`;
                
                if (currentUser.role === 'maison') {
                    $('maisonView').classList.remove('hidden'); 
                    $('adminView').classList.add('hidden');
                    
                    // Initialize fiscal year to current year
                    const now = new Date();
                    const currentMonth = now.getMonth() + 1; // 1-12
                    // If current month is Jan, we're in previous fiscal year
                    currentFiscalYear = currentMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();
                    
                    // Render monthly data table
                    renderMonthlyDataTable();
                    
                    // Load other tables
                    loadTable('maisonHistory', $('maisonHistoryTableContainer'), { submittedBy: currentUser.username });
                    
                    // Initialize email management
                    initEmail();
                    // Initialize actual data view
renderMaisonActualDataTable();

                    // Clear any messages
                    clr($('monthlyDataMessage'));
                } else if (currentUser.role === 'admin') {
                    $('adminView').classList.remove('hidden'); 
                    $('maisonView').classList.add('hidden');
                    $('operatorView').classList.add('hidden');
                    
                    popYearSelectors();
                    popMaisonSelectors();
                    
                    // === 修改：使用新的加载逻辑 ===
                    await loadAllMaisonsForAdmin();
                    
                    loadTable('adminHistory', $('adminHistoryTableContainer'));
                    initBcast();
                }
                else if (currentUser.role === 'sfmc-operator') {
                    $('operatorView').classList.remove('hidden');
                    $('adminView').classList.add('hidden');
                    $('maisonView').classList.add('hidden');
                    
                    const now = new Date();
                    const currentMonth = now.getMonth() + 1;
                    currentFiscalYearOperator = currentMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();
                    
                    await loadAllMaisons();
                    renderMaisonAccordionOperator();
                    
                    clr($('operatorDataMessage'));
                }
                
                
                
            }, 500);
        },

        logoutButton: () => {
            currentUser = null;
            $('username').value = $('password').value = '';
            clr($('loginMessage')); 
            clr($('maisonSubmitMessage')); 
            clr($('emailMessage')); 
            clr($('emailBroadcastMessage'));
            clr($('validationMessage'));
            showPage($('loginPage'));
        },

         // 新增：Start Data Collection 快捷按钮
startDataCollectionButton: async () => {
    if (!currentUser || currentUser.role !== 'admin') {
        msg($('emailBroadcastMessage'), 'Admin only!', false);
        return;
    }

    // 获取当前财年和月份
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const fiscalYear = currentMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthYear = currentMonth === 12 ? fiscalYear + 1 : fiscalYear;
    
    // 格式化月份
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const nextMonthName = monthNames[nextMonth - 1];
    
    // 生成邮件主题和内容
    const subject = `Action Required: Submit SFMC Forecast Data for ${nextMonthName} ${nextMonthYear}`;
    
    const body = `Dear Maison Teams,\n\n` +
        `This is a reminder to submit your SFMC forecast data for ${nextMonthName} ${nextMonthYear}.\n\n` +
        `Please log in to the SFMC Cost Management Application and submit your forecast for the following metrics:\n` +
        `• Email\n` +
        `• SMS\n` +
        `• WhatsApp\n` +
        `• Contacts\n\n` +
        `Deadline: ${new Date(nextMonthYear, nextMonth - 1, 5).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n` +
        `Application URL: ${window.location.origin}${window.location.pathname}\n\n` +
        `If you have any questions or need assistance, please contact the Beauty Tech team.\n\n` +
        `Thank you for your cooperation.\n\n` +
        `Best regards,\n` +
        `BT-Admin Team`;
    
    // 设置邮件主题和内容
    $('emailSubjectInput').value = subject;
    $('emailContentInput').value = body;
    
    // 确保用户列表已加载
    if (!allUsers || !allUsers.length) {
        const res = await api('getAllUsers');
        if (res.success && res.data) {
            allUsers = res.data.filter(u => u.email && u.email.trim());
        }
    }
    
    // 渲染用户列表
    if (allUsers && allUsers.length) {
        searchTerm = '';
        if ($('userSearchInput')) $('userSearchInput').value = '';
        renderU();
        
        // 使用 setTimeout 确保 DOM 已经渲染完成后再选择用户
        setTimeout(() => {
            // 选中所有 Maison 角色的用户（排除 admin 和 sfmc-operator）
            $('userListContainer').querySelectorAll('.user-checkbox').forEach(cb => {
                // 直接通过 dataset 获取用户信息
                const userEmail = cb.dataset.email;
                const userMaison = cb.dataset.maison;
                
                // 查找对应的用户对象
                const user = allUsers.find(u => u.email === userEmail);
                
                // 选中所有 Maison 角色的用户
                if (user && user.role === 'maison') {
                    cb.checked = true;
                }
            });
            
            // 更新计数
            updCnt();
            
            // 显示成功消息
            msg($('emailBroadcastMessage'), `Data collection email prepared for ${nextMonthName} ${nextMonthYear}. All Maison users selected. Click "Open in Outlook" to send.`, true);
        }, 100); // 延迟100ms确保DOM渲染完成
    }
    
    // 滚动到邮件区域
    $('emailSubjectInput').scrollIntoView({ behavior: 'smooth', block: 'center' });
},



        submitEmailButton: async () => {
            if (!currentUser || currentUser.role !== 'maison') { 
                msg($('emailMessage'), 'Maison only.', false); 
                return; 
            }
            const e = $('userEmailInput').value.trim();
            if (!e) { msg($('emailMessage'), 'Email address cannot be empty!', false); return; }
            if (!valid(e)) { msg($('emailMessage'), 'Invalid email format!', false); return; }
            msg($('emailMessage'), 'Saving email...', true);
            const res = await api('updateUserEmail', { username: currentUser.username, email: e });
            msg($('emailMessage'), res.success ? 'Email saved successfully!' : 'Failed to save email: ' + res.message, res.success);
            if (res.success) initEmail();
        },

        editEmailButton: () => {
            $('emailDisplay').classList.add('hidden'); 
            $('editEmailButton').classList.add('hidden');
            $('emailForm').classList.remove('hidden'); 
            $('userEmailInput').value = $('registeredEmailValue').textContent;
            $('submitEmailButton').textContent = 'Save Changes'; 
            $('cancelEditEmailButton').classList.remove('hidden');
            clr($('emailMessage'));
        },

        cancelEditEmailButton: () => { 
            initEmail(); 
            clr($('emailMessage')); 
        },

        submitBudgetButton: async () => {
            if (!currentUser || currentUser.role !== 'admin') { 
                msg($('budgetSubmitMessage'), 'Admin only!', false); 
                return; 
            }
            
            const year = parseInt($('budgetYearSelect').value);
            const maison = $('budgetMaisonSelect').value;
            const emailBudget = parseInt($('emailBudgetInput').value) || 0;
            const smsBudget = parseInt($('smsBudgetInput').value) || 0;
            const whatsappBudget = parseInt($('whatsappBudgetInput').value) || 0;
            const contactsBudget = parseInt($('contactsBudgetInput').value) || 0;
            
            if (!maison) { 
                msg($('budgetSubmitMessage'), 'Please select a Maison!', false); 
                return; 
            }
            
            if (emailBudget < 0 || smsBudget < 0 || whatsappBudget < 0 || contactsBudget < 0) {
                msg($('budgetSubmitMessage'), 'Budgets cannot be negative!', false);
                return;
            }
            
            clr($('budgetSubmitMessage'));
            msg($('budgetSubmitMessage'), 'Submitting budget...', true);
            
            const res = await api('setAnnualBudget', {
                maisonName: maison,
                year: year,
                emailBudget: emailBudget,
                smsBudget: smsBudget,
                whatsappBudget: whatsappBudget,
                contactsBudget: contactsBudget,
                updatedBy: currentUser.username
            });
            
            msg($('budgetSubmitMessage'), res.success ? 'Budget set successfully!' : 'Failed: ' + res.message, res.success);
            
            if (res.success) {
                $('emailBudgetInput').value = '0';
                $('smsBudgetInput').value = '0';
                $('whatsappBudgetInput').value = '0';
                $('contactsBudgetInput').value = '0';
                
                // 重新加载 Forecast 表格
                const forecastYear = parseInt($('forecastYearSelect').value) || currentYear;
                loadForecastTable($('forecastTableContainer'), forecastYear);
            }
        },



        exportOverviewDataButton: exportOverviewData,
        exportHistoryDataButton: exportHistoryData,
        exportActualDataButton: async () => {
            if (!currentUser || currentUser.role !== 'admin') { alert('Admin only!'); return; }
            const res = await api('getAllActualData');
            if (!res.success || !res.data || !res.data.length) { 
                msg($('loginMessage'), 'Export failed: No actual data available.', false); 
                return; 
            }
            
            let csv = 'Maison,Year,Month,Email Usage,SMS Usage,WhatsApp Usage,Contacts Total,Recorded By,Timestamp,Notes\n';
            
            res.data.forEach(r => { 
                csv += [
                    r.MaisonName,
                    r.Year,
                    r.Month,
                    r.EmailUsage,
                    r.SMSUsage,
                    r.WhatsAppUsage,
                    r.ContactsTotal,
                    r.RecordedBy,
                    fmt(r.Timestamp),
                    `"${(r.Notes || '').replace(/"/g, '""')}"`
                ].join(',') + '\n';
            });
            
            const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const l = document.createElement('a');
            l.href = URL.createObjectURL(b);
            l.download = `SFMC_Actual_Export_${new Date().toLocaleDateString('en-US').replace(/\//g, '-')}.csv`;
            document.body.appendChild(l);
            l.click();
            document.body.removeChild(l);
            
            msg($('loginMessage'), 'Actual data exported successfully!', true);
        },
        
        selectAllButton: () => { 
            $('userListContainer').querySelectorAll('.user-checkbox:not(:disabled)').forEach(c => c.checked = true); 
            updCnt(); 
        },

        deselectAllButton: () => { 
            $('userListContainer').querySelectorAll('.user-checkbox').forEach(c => c.checked = false); 
            updCnt(); 
        },

        openOutlookButton: async () => {
            const em = selected();
            if (!em.length) { 
                msg($('emailBroadcastMessage'), 'No recipients selected to send email.', false); 
                return; 
            }
            const s = encodeURIComponent($('emailSubjectInput').value.trim()), 
                  b = encodeURIComponent($('emailContentInput').value.trim());
            const p = [s && `subject=${s}`, b && `body=${b}`].filter(Boolean);
            const mailtoLink = `mailto:${em.join(';')}${p.length ? '?' + p.join('&') : ''}`;

            const tempLink = document.createElement('a');
            tempLink.href = mailtoLink;
            tempLink.style.display = 'none';
            document.body.appendChild(tempLink);
            tempLink.click();
            document.body.removeChild(tempLink);
            
            msg($('emailBroadcastMessage'), `Opening Outlook with ${em.length} recipient(s)...`, true);
        },

        copyEmailsButton: () => {
            const em = selected();
            if (!em.length) { 
                msg($('emailBroadcastMessage'), 'No recipients selected to copy emails.', false); 
                return; 
            }
            const list = em.join('; ');
            navigator.clipboard.writeText(list).then(() => 
                msg($('emailBroadcastMessage'), `Copied ${em.length} email(s) to clipboard!`, true)
            ).catch(() => {
                const t = document.createElement('textarea'); 
                t.value = list; 
                t.style.position = 'fixed'; 
                t.style.left = '-9999px';
                document.body.appendChild(t); 
                t.select();
                try { 
                    document.execCommand('copy'); 
                    msg($('emailBroadcastMessage'), `Copied ${em.length} email(s) to clipboard (fallback)!`, true); 
                } catch (err) { 
                    msg($('emailBroadcastMessage'), 'Copy failed. Please manually copy the emails.', false); 
                    console.error('Fallback copy failed:', err);
                }
                document.body.removeChild(t);
            });
        }
    };

    // 统一绑定事件
    Object.keys(handlers).forEach(id => {
        const element = $(id);
        if (element) {
            element.addEventListener('click', handlers[id]);
        } else {
            console.warn(`Element with ID "${id}" not found. Skipping event listener.`);
        }
    });
    // === New Event Listeners for Monthly Data Table ===

// Fiscal Year Tab buttons
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('fy-tab-button')) {
        const fiscalYear = parseInt(e.target.dataset.year);
        switchFiscalYearTab(fiscalYear);
    }
});
// Notes link click handler
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('notes-link')) {
        const year = parseInt(e.target.dataset.year);
        const month = e.target.dataset.month;
        openNotesViewModal(year, month);
    }
});
// Fiscal Year Tab buttons for Actual (Maison view)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('fy-tab-button-actual')) {
        const fiscalYear = parseInt(e.target.dataset.year);
        switchFiscalYearTabActual(fiscalYear);
    }
});

// Fiscal Year Tab buttons for Operator
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('fy-tab-button-operator')) {
        const fiscalYear = parseInt(e.target.dataset.year);
        switchFiscalYearTabOperator(fiscalYear);
    }
});

// Action buttons in monthly data table
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('action-button-table')) {
        const year = parseInt(e.target.dataset.year);
        const month = e.target.dataset.month;
        const hasData = e.target.dataset.hasData === 'true';
        
        // Get existing data if available
        const key = formatMonth(year, month);
        const existingData = monthlyDataCache[currentFiscalYear]?.[key] || null;
        
        openModal(year, month, existingData);
    }
});

// Modal close button
if ($('modalClose')) {
    $('modalClose').addEventListener('click', closeModal);
}

// Modal cancel button
if ($('modalCancelButton')) {
    $('modalCancelButton').addEventListener('click', closeModal);
}

// Modal submit button
if ($('modalSubmitButton')) {
    $('modalSubmitButton').addEventListener('click', handleModalSubmit);
}

// Close modal when clicking outside
if ($('submissionModal')) {
    $('submissionModal').addEventListener('click', (e) => {
        if (e.target.id === 'submissionModal') {
            closeModal();
        }
    });
}

// Modal notes character count
if ($('modalNotesInput')) {
    $('modalNotesInput').addEventListener('input', () => {
        const count = $('modalNotesInput').value.length;
        $('modalNotesCharCount').textContent = `${count}/200`;
        if (count >= 200) {
            $('modalNotesCharCount').style.color = '#d32f2f';
        } else {
            $('modalNotesCharCount').style.color = '#666';
        }
    });
}
// Notes View Modal close handlers
if ($('notesViewClose')) {
    $('notesViewClose').addEventListener('click', closeNotesViewModal);
}

if ($('notesViewCloseButton')) {
    $('notesViewCloseButton').addEventListener('click', closeNotesViewModal);
}

// Close notes view modal when clicking outside
if ($('notesViewModal')) {
    $('notesViewModal').addEventListener('click', (e) => {
        if (e.target.id === 'notesViewModal') {
            closeNotesViewModal();
        }
    });
    // Operator Modal close button
if ($('operatorModalClose')) {
    $('operatorModalClose').addEventListener('click', closeOperatorModal);
}

// Operator Modal cancel button
if ($('operatorModalCancelButton')) {
    $('operatorModalCancelButton').addEventListener('click', closeOperatorModal);
}

// Operator Modal submit button
if ($('operatorModalSubmitButton')) {
    $('operatorModalSubmitButton').addEventListener('click', handleOperatorModalSubmit);
}

// Close operator modal when clicking outside
if ($('operatorSubmissionModal')) {
    $('operatorSubmissionModal').addEventListener('click', (e) => {
        if (e.target.id === 'operatorSubmissionModal') {
            closeOperatorModal();
        }
    });
}


// Logout button for operator
if ($('logoutButtonOperator')) {
    $('logoutButtonOperator').addEventListener('click', handlers.logoutButton);
}

}

    // 搜索输入框事件
    const userSearchInput = $('userSearchInput');
    if (userSearchInput) {
        userSearchInput.addEventListener('input', () => { 
            searchTerm = $('userSearchInput').value.trim(); 
            renderU(); 
            updCnt(); 
        });
    }



   // === 新增：Tab 切换事件监听（添加在这里）===
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('fy-tab-button-overview')) {
        const fiscalYear = parseInt(e.target.dataset.year);
        switchFiscalYearTabOverview(fiscalYear);
    }
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('fy-tab-button-actual-overview')) {
        const fiscalYear = parseInt(e.target.dataset.year);
        switchFiscalYearTabActualOverview(fiscalYear);
    }
});
// === Accordion 展开监听 (懒加载) ===
document.addEventListener('toggle', (e) => {
    if (e.target.classList && e.target.classList.contains('maison-accordion')) {
        const details = e.target;
        
        // 只在展开时加载
        if (details.open) {
            const maison = details.dataset.maison;
            const type = details.dataset.type;
            
            if (type === 'forecast') {
                const containerId = `#forecast-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}`;
                loadMaisonForecastData(maison, containerId);
            } else if (type === 'actual') {
                const containerId = `#actual-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}`;
                loadMaisonActualData(maison, containerId);
            } else if (type === 'operator') {
                const containerId = `#operator-table-${maison.replace(/[^a-zA-Z0-9]/g, '-')}`;
                loadMaisonOperatorData(maison, containerId);
            }
        }
    }
}, true);
// Admin Notes View Modal - Open
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('admin-notes-link')) {
        const maison = e.target.dataset.maison;
        const year = e.target.dataset.year;
        const month = e.target.dataset.month;
        const notes = e.target.dataset.notes;
        
        openAdminNotesViewModal(maison, year, month, notes);
    }
});

// Open Admin Notes View Modal
const openAdminNotesViewModal = (maison, year, month, notes) => {
    const modal = $('adminNotesViewModal');
    const title = $('adminNotesViewTitle');
    const notesDisplay = $('adminNotesViewDisplay');
    
    title.textContent = `Maison Notes - ${maison} (${year}-${String(month).padStart(2, '0')})`;
    notesDisplay.textContent = notes || 'No notes available.';
    
    modal.classList.remove('hidden');
};

// Close Admin Notes View Modal
const closeAdminNotesViewModal = () => {
    const modal = $('adminNotesViewModal');
    modal.classList.add('hidden');
};

// Admin Notes View Modal - Close handlers
if ($('adminNotesViewClose')) {
    $('adminNotesViewClose').addEventListener('click', closeAdminNotesViewModal);
}

if ($('adminNotesViewCloseButton')) {
    $('adminNotesViewCloseButton').addEventListener('click', closeAdminNotesViewModal);
}

// Close when clicking outside
if ($('adminNotesViewModal')) {
    $('adminNotesViewModal').addEventListener('click', (e) => {
        if (e.target.id === 'adminNotesViewModal') {
            closeAdminNotesViewModal();
        }
    });
}


// 初始化
showPage($('loginPage'));

});